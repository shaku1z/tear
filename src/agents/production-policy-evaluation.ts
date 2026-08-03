import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import { createProductionHeadlessEnvironment, type TearScenarioV1 } from "../tearbench";
import type { TearPolicyArtifactRegistry } from "./policy-artifact-registry";
import { TearActivePolicyRuntime, type TearPolicyDecisionReceipt } from "./policy-runtime";

export interface TearProductionPolicyEvaluationDecisionV1 {
  readonly tick: number;
  readonly observationHash: string;
  readonly actionHash: string;
  readonly receipt: TearPolicyDecisionReceipt;
}

export interface TearProductionPolicyEvaluationReportV1 {
  readonly format: "tear-production-policy-evaluation";
  readonly schemaVersion: 1;
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly scenario: Readonly<{ id: string; version: number; seed: string; hash: string }>;
  readonly decisions: readonly TearProductionPolicyEvaluationDecisionV1[];
  readonly terminal: Readonly<{ tick: number; semanticHash: string; terminated: boolean; truncated: boolean }>;
  readonly reportHash: string;
}

/** A bounded, source-owned set of production scenarios. It defines no score or pass threshold. */
export interface TearProductionPolicyEvaluationSuiteV1 {
  readonly id: string;
  readonly version: number;
  readonly description: string;
  readonly scenarios: readonly TearScenarioV1[];
}

export interface TearProductionPolicyOutcomeSummaryV1 {
  readonly scenarioCount: number;
  readonly terminatedScenarios: number;
  readonly truncatedScenarios: number;
  readonly executedDecisions: number;
  readonly artifactDecisions: number;
  readonly fallbackDecisions: number;
}

/**
 * Repeatable observed outcomes from the production composition. These counts
 * deliberately have no quality interpretation and are not promotion inputs.
 */
export interface TearProductionPolicyOutcomeSuiteReportV1 {
  readonly format: "tear-production-policy-outcome-suite";
  readonly schemaVersion: 1;
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly suite: Readonly<{ id: string; version: number; hash: string }>;
  readonly reports: readonly TearProductionPolicyEvaluationReportV1[];
  readonly outcomes: TearProductionPolicyOutcomeSummaryV1;
  readonly reportHash: string;
}

const VAULT_KEY = "policy-production-evaluation:v1:";
const HASH = /^[a-f0-9]{16}$/u;

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function validateSuite(suite: TearProductionPolicyEvaluationSuiteV1): void {
  if (!text(suite.id) || !Number.isSafeInteger(suite.version) || suite.version < 1 || !text(suite.description)
    || suite.scenarios.length < 1 || suite.scenarios.length > 32) throw new TypeError("invalid production policy evaluation suite");
  const identities = new Set<string>();
  for (const scenario of suite.scenarios) {
    if (!text(scenario.id) || !Number.isSafeInteger(scenario.version) || scenario.version < 1 || !text(scenario.seed)
      || !Number.isSafeInteger(scenario.maxTicks) || scenario.maxTicks < 1 || scenario.maxTicks > 20_000) throw new TypeError("invalid production policy evaluation scenario");
    const identity = `${scenario.id}:${String(scenario.version)}:${scenario.seed}`;
    if (identities.has(identity)) throw new TypeError("production policy evaluation suite repeats a scenario identity");
    identities.add(identity);
  }
}
function parseReport(value: unknown): TearProductionPolicyEvaluationReportV1 {
  if (!record(value) || value.format !== "tear-production-policy-evaluation" || value.schemaVersion !== 1 || !text(value.artifactId)
    || typeof value.artifactHash !== "string" || !HASH.test(value.artifactHash) || !record(value.scenario) || !text(value.scenario.id)
    || !Number.isSafeInteger(value.scenario.version) || !text(value.scenario.seed) || typeof value.scenario.hash !== "string" || !HASH.test(value.scenario.hash)
    || !Array.isArray(value.decisions) || value.decisions.length > 20_000 || !record(value.terminal) || !Number.isSafeInteger(value.terminal.tick)
    || typeof value.terminal.semanticHash !== "string" || !HASH.test(value.terminal.semanticHash) || typeof value.terminal.terminated !== "boolean"
    || typeof value.terminal.truncated !== "boolean" || typeof value.reportHash !== "string" || !HASH.test(value.reportHash)) throw new TypeError("invalid production policy evaluation report");
  const { reportHash, ...draft } = value as unknown as TearProductionPolicyEvaluationReportV1;
  if (reportHash !== stableVerificationHash(draft)) throw new TypeError("production policy evaluation integrity mismatch");
  return Object.freeze({ ...draft, scenario: Object.freeze({ ...draft.scenario }), decisions: Object.freeze(draft.decisions.map((entry) => Object.freeze(structuredClone(entry)))), terminal: Object.freeze({ ...draft.terminal }), reportHash });
}

/** Local Vault custody for bounded source-world evaluation evidence. No promotion semantics are implied. */
export class TearProductionPolicyEvaluationVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }

  async persist(input: TearProductionPolicyEvaluationReportV1): Promise<TearProductionPolicyEvaluationReportV1> {
    const report = parseReport(input), key = `${VAULT_KEY}${report.reportHash}`, existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) return parseReport(JSON.parse(existing));
    await this.#backend.commit(Object.freeze([
      { store: "analysis", key, value: JSON.stringify(report) },
      { store: "indexes", key: `policy-production-evaluation:${report.artifactId}:${report.reportHash}`, value: JSON.stringify({ artifactHash: report.artifactHash, scenarioHash: report.scenario.hash }) },
    ]));
    return report;
  }

  async get(reportHash: string): Promise<TearProductionPolicyEvaluationReportV1 | undefined> {
    if (!HASH.test(reportHash)) throw new TypeError("production policy evaluation hash is invalid");
    const key = `${VAULT_KEY}${reportHash}`, raw = await this.#backend.get("analysis", key);
    if (raw === undefined) return undefined;
    try { return parseReport(JSON.parse(raw)); }
    catch (error) {
      await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "policy-production-evaluation-quarantine", schemaVersion: 1, key, raw, reason: error instanceof Error ? error.message : String(error) })));
      return undefined;
    }
  }
}

/**
 * Runs the active policy against the C29/C30 source-owned production world.
 * This is evidence of shared-composition execution, not a quality score or a
 * training/promotion decision.
 */
export async function evaluateActiveTearPolicyInProduction(
  registry: TearPolicyArtifactRegistry,
  scenario: TearScenarioV1,
): Promise<TearProductionPolicyEvaluationReportV1> {
  const active = await registry.active();
  if (active === undefined) throw new RangeError("production policy evaluation requires an active verified artifact");
  const runtime = new TearActivePolicyRuntime(registry);
  await runtime.reset();
  const environment = createProductionHeadlessEnvironment();
  const decisions: TearProductionPolicyEvaluationDecisionV1[] = [];
  try {
    let terminal = environment.reset(scenario);
    let terminated = false, truncated = false;
    while (!terminated && !truncated && decisions.length < scenario.maxTicks) {
      const observation = environment.policyObservation(), decision = runtime.decide({ state: observation, ui: { screen: "playing" } });
      decisions.push(Object.freeze({ tick: observation.tick, observationHash: decision.receipt.observationHash,
        actionHash: stableVerificationHash(decision.actions), receipt: decision.receipt }));
      const transition = environment.step(decision.actions);
      terminal = transition.observation; terminated = transition.terminated; truncated = transition.truncated;
    }
    const report = { format: "tear-production-policy-evaluation" as const, schemaVersion: 1 as const,
      artifactId: active.artifactId, artifactHash: active.artifactHash,
      scenario: Object.freeze({ id: scenario.id, version: scenario.version, seed: scenario.seed, hash: stableVerificationHash(scenario) }),
      decisions: Object.freeze(decisions), terminal: Object.freeze({ tick: terminal.tick, semanticHash: stableVerificationHash(terminal), terminated, truncated }) };
    return Object.freeze({ ...report, reportHash: stableVerificationHash(report) });
  } finally { environment.dispose(); }
}

/**
 * Executes a fixed, bounded suite through fresh C29/C30 production worlds.
 * The summary records only observed execution facts; it is not a score,
 * benchmark threshold, training observation, or artifact-promotion decision.
 */
export async function evaluateActiveTearPolicyOutcomeSuiteInProduction(
  registry: TearPolicyArtifactRegistry,
  suite: TearProductionPolicyEvaluationSuiteV1,
): Promise<TearProductionPolicyOutcomeSuiteReportV1> {
  validateSuite(suite);
  const mutableReports: TearProductionPolicyEvaluationReportV1[] = [];
  for (const scenario of suite.scenarios) mutableReports.push(await evaluateActiveTearPolicyInProduction(registry, scenario));
  const reports = Object.freeze(mutableReports);
  const first = reports[0];
  if (first === undefined) throw new Error("production policy evaluation suite has no reports");
  if (reports.some((report) => report.artifactId !== first.artifactId || report.artifactHash !== first.artifactHash)) {
    throw new Error("active policy changed during production outcome suite evaluation");
  }
  const outcomes = reports.reduce<TearProductionPolicyOutcomeSummaryV1>((summary, report) => Object.freeze({
    scenarioCount: summary.scenarioCount + 1,
    terminatedScenarios: summary.terminatedScenarios + Number(report.terminal.terminated),
    truncatedScenarios: summary.truncatedScenarios + Number(report.terminal.truncated),
    executedDecisions: summary.executedDecisions + report.decisions.length,
    artifactDecisions: summary.artifactDecisions + report.decisions.filter((entry) => entry.receipt.source === "artifact").length,
    fallbackDecisions: summary.fallbackDecisions + report.decisions.filter((entry) => entry.receipt.source === "scripted-fallback").length,
  }), Object.freeze({ scenarioCount: 0, terminatedScenarios: 0, truncatedScenarios: 0, executedDecisions: 0, artifactDecisions: 0, fallbackDecisions: 0 }));
  const draft = { format: "tear-production-policy-outcome-suite" as const, schemaVersion: 1 as const,
    artifactId: first.artifactId, artifactHash: first.artifactHash,
    suite: Object.freeze({ id: suite.id, version: suite.version, hash: stableVerificationHash(suite) }), reports, outcomes };
  return Object.freeze({ ...draft, reportHash: stableVerificationHash(draft) });
}

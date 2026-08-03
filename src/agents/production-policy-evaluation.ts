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

const VAULT_KEY = "policy-production-evaluation:v1:";
const HASH = /^[a-f0-9]{16}$/u;

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
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

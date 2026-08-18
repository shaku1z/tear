import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import { createProductionHeadlessEnvironment, type TearScenarioV1 } from "../tearbench";
import { mapGameplayEventToCausalEvent } from "../tearbench/gameplay-causal-events";
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
  readonly terminal: Readonly<{ tick: number; semanticHash: string; terminated: boolean; truncated: boolean; outcome: "completed" | "defeated" | "none"; revivals: number }>;
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
  readonly completedScenarios: number;
  readonly defeatedScenarios: number;
  readonly revivalEvents: number;
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
const OUTCOME_SUITE_KEY = "policy-production-outcome-suite:v1:";
const OUTCOME_SUITE_RETENTION_KEY = "policy-production-outcome-suite-retention:v1:";
const HASH = /^[a-f0-9]{16}$/u;

export interface TearProductionPolicyOutcomeSuiteRetentionReceiptV1 {
  readonly format: "tear-production-policy-outcome-suite-retention";
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly retainedAt: string;
  readonly maxReports: number;
  readonly removedReportHashes: readonly string[];
  readonly retainedReportHashes: readonly string[];
  readonly receiptHash: string;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function integer(value: unknown): value is number { return Number.isSafeInteger(value); }
function timestamp(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function hashes(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function suiteRetentionHash(value: Omit<TearProductionPolicyOutcomeSuiteRetentionReceiptV1, "receiptHash">): string { return stableVerificationHash(value); }
export function validateTearProductionPolicyEvaluationSuite(suite: TearProductionPolicyEvaluationSuiteV1): void {
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
function validDecision(value: unknown): value is TearProductionPolicyEvaluationDecisionV1 {
  if (!record(value) || !integer(value.tick) || value.tick < 0 || !hashes(value.observationHash) || !hashes(value.actionHash) || !record(value.receipt)
    || !hashes(value.receipt.observationHash) || value.receipt.observationHash !== value.observationHash
    || (value.receipt.source !== "artifact" && value.receipt.source !== "scripted-fallback")) return false;
  const hasArtifactId = value.receipt.artifactId !== undefined, hasArtifactHash = value.receipt.artifactHash !== undefined;
  if (hasArtifactId !== hasArtifactHash || (hasArtifactId && (!text(value.receipt.artifactId) || !hashes(value.receipt.artifactHash)))) return false;
  if (value.receipt.source === "artifact") return hasArtifactId && value.receipt.reason === undefined;
  return value.receipt.reason === "no-active-artifact" || value.receipt.reason === "invalid-model"
    || value.receipt.reason === "missing-decision" || value.receipt.reason === "invalid-action" || value.receipt.reason === "decision-budget-exceeded";
}
function parseReport(value: unknown): TearProductionPolicyEvaluationReportV1 {
  if (!record(value) || value.format !== "tear-production-policy-evaluation" || value.schemaVersion !== 1 || !text(value.artifactId)
    || typeof value.artifactHash !== "string" || !HASH.test(value.artifactHash) || !record(value.scenario) || !text(value.scenario.id)
    || !Number.isSafeInteger(value.scenario.version) || !text(value.scenario.seed) || typeof value.scenario.hash !== "string" || !HASH.test(value.scenario.hash)
    || !Array.isArray(value.decisions) || value.decisions.length > 20_000 || !value.decisions.every(validDecision) || !record(value.terminal) || !Number.isSafeInteger(value.terminal.tick)
    || typeof value.terminal.semanticHash !== "string" || !HASH.test(value.terminal.semanticHash) || typeof value.terminal.terminated !== "boolean"
    || typeof value.terminal.truncated !== "boolean" || !["completed", "defeated", "none"].includes(String(value.terminal.outcome)) || !integer(value.terminal.revivals) || value.terminal.revivals < 0 || typeof value.reportHash !== "string" || !HASH.test(value.reportHash)) throw new TypeError("invalid production policy evaluation report");
  const { reportHash, ...draft } = value as unknown as TearProductionPolicyEvaluationReportV1;
  if (reportHash !== stableVerificationHash(draft)) throw new TypeError("production policy evaluation integrity mismatch");
  return Object.freeze({ ...draft, scenario: Object.freeze({ ...draft.scenario }), decisions: Object.freeze(draft.decisions.map((entry) => Object.freeze(structuredClone(entry)))), terminal: Object.freeze({ ...draft.terminal }), reportHash });
}
function summarizeReports(reports: readonly TearProductionPolicyEvaluationReportV1[]): TearProductionPolicyOutcomeSummaryV1 {
  return reports.reduce<TearProductionPolicyOutcomeSummaryV1>((summary, report) => Object.freeze({
    scenarioCount: summary.scenarioCount + 1,
    terminatedScenarios: summary.terminatedScenarios + Number(report.terminal.terminated),
    truncatedScenarios: summary.truncatedScenarios + Number(report.terminal.truncated),
    executedDecisions: summary.executedDecisions + report.decisions.length,
    artifactDecisions: summary.artifactDecisions + report.decisions.filter((entry) => entry.receipt.source === "artifact").length,
    fallbackDecisions: summary.fallbackDecisions + report.decisions.filter((entry) => entry.receipt.source === "scripted-fallback").length,
    completedScenarios: summary.completedScenarios + Number(report.terminal.outcome === "completed"), defeatedScenarios: summary.defeatedScenarios + Number(report.terminal.outcome === "defeated"), revivalEvents: summary.revivalEvents + report.terminal.revivals,
  }), Object.freeze({ scenarioCount: 0, terminatedScenarios: 0, truncatedScenarios: 0, executedDecisions: 0, artifactDecisions: 0, fallbackDecisions: 0, completedScenarios: 0, defeatedScenarios: 0, revivalEvents: 0 }));
}
export function parseTearProductionPolicyOutcomeSuiteReport(value: unknown): TearProductionPolicyOutcomeSuiteReportV1 {
  if (!record(value) || value.format !== "tear-production-policy-outcome-suite" || value.schemaVersion !== 1 || !text(value.artifactId)
    || !hashes(value.artifactHash) || !record(value.suite) || !text(value.suite.id) || !integer(value.suite.version) || value.suite.version < 1
    || !hashes(value.suite.hash) || !Array.isArray(value.reports) || value.reports.length < 1 || value.reports.length > 32
    || !record(value.outcomes) || !hashes(value.reportHash)) throw new TypeError("invalid production policy outcome suite report");
  const reports = Object.freeze(value.reports.map(parseReport));
  if (reports.some((report) => report.artifactId !== value.artifactId || report.artifactHash !== value.artifactHash)
    || new Set(reports.map((report) => `${report.scenario.id}:${String(report.scenario.version)}:${report.scenario.seed}`)).size !== reports.length) {
    throw new TypeError("invalid production policy outcome suite report members");
  }
  const outcomes = summarizeReports(reports);
  if (stableVerificationHash(outcomes) !== stableVerificationHash(value.outcomes)) throw new TypeError("production policy outcome summary mismatch");
  const { reportHash, ...draft } = value as unknown as TearProductionPolicyOutcomeSuiteReportV1;
  if (reportHash !== stableVerificationHash(draft)) throw new TypeError("production policy outcome suite integrity mismatch");
  return Object.freeze({ ...draft, suite: Object.freeze({ ...draft.suite }), reports, outcomes: Object.freeze({ ...outcomes }), reportHash });
}
function parseSuiteRetentionReceipt(value: unknown): TearProductionPolicyOutcomeSuiteRetentionReceiptV1 {
  if (!record(value) || value.format !== "tear-production-policy-outcome-suite-retention" || value.schemaVersion !== 1 || !integer(value.revision)
    || value.revision < 1 || !timestamp(value.retainedAt) || !integer(value.maxReports) || value.maxReports < 0
    || !Array.isArray(value.removedReportHashes) || !value.removedReportHashes.every(hashes)
    || !Array.isArray(value.retainedReportHashes) || !value.retainedReportHashes.every(hashes) || !hashes(value.receiptHash)) {
    throw new TypeError("invalid production policy outcome suite retention receipt");
  }
  const { receiptHash, ...draft } = value as unknown as Omit<TearProductionPolicyOutcomeSuiteRetentionReceiptV1, "receiptHash"> & { receiptHash: string };
  if (receiptHash !== suiteRetentionHash(draft)) throw new TypeError("production policy outcome suite retention integrity mismatch");
  return Object.freeze({ ...draft, removedReportHashes: Object.freeze([...draft.removedReportHashes]),
    retainedReportHashes: Object.freeze([...draft.retainedReportHashes]), receiptHash });
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
 * Local custody for bounded fixed-suite outcome evidence. Retention is by
 * deterministic report-hash order, never by an outcome-derived ranking.
 */
export class TearProductionPolicyOutcomeSuiteVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }

  async persist(input: TearProductionPolicyOutcomeSuiteReportV1): Promise<TearProductionPolicyOutcomeSuiteReportV1> {
    const report = parseTearProductionPolicyOutcomeSuiteReport(input), key = `${OUTCOME_SUITE_KEY}${report.reportHash}`;
    const existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) return parseTearProductionPolicyOutcomeSuiteReport(JSON.parse(existing));
    await this.#backend.commit(Object.freeze([
      { store: "analysis", key, value: JSON.stringify(report) },
      { store: "indexes", key: `policy-production-outcome-suite:${report.artifactId}:${report.reportHash}`,
        value: JSON.stringify({ artifactHash: report.artifactHash, suiteHash: report.suite.hash }) },
    ]));
    return report;
  }

  async get(reportHash: string): Promise<TearProductionPolicyOutcomeSuiteReportV1 | undefined> {
    if (!hashes(reportHash)) throw new TypeError("production policy outcome suite hash is invalid");
    const key = `${OUTCOME_SUITE_KEY}${reportHash}`, raw = await this.#backend.get("analysis", key);
    if (raw === undefined) return undefined;
    try { return parseTearProductionPolicyOutcomeSuiteReport(JSON.parse(raw)); }
    catch (error) {
      await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "policy-production-outcome-suite-quarantine",
        schemaVersion: 1, key, raw, reason: error instanceof Error ? error.message : String(error) })));
      return undefined;
    }
  }

  async #nextRetentionRevision(): Promise<number> {
    return (await this.#backend.keys("indexes")).filter((key) => key.startsWith(OUTCOME_SUITE_RETENTION_KEY)).length + 1;
  }

  async retain(maxReports: number, retainedAt: string): Promise<TearProductionPolicyOutcomeSuiteRetentionReceiptV1> {
    if (!integer(maxReports) || maxReports < 0 || !timestamp(retainedAt)) throw new TypeError("invalid production policy outcome suite retention request");
    const reports: TearProductionPolicyOutcomeSuiteReportV1[] = [];
    for (const key of (await this.#backend.keys("analysis")).filter((entry) => entry.startsWith(OUTCOME_SUITE_KEY))) {
      const report = await this.get(key.slice(OUTCOME_SUITE_KEY.length));
      if (report !== undefined) reports.push(report);
    }
    const ordered = reports.sort((left, right) => left.reportHash.localeCompare(right.reportHash));
    const removedReports = ordered.slice(0, Math.max(0, ordered.length - maxReports));
    const retainedReports = ordered.slice(Math.max(0, ordered.length - maxReports));
    const removedReportHashes = removedReports.map((report) => report.reportHash);
    const retainedReportHashes = retainedReports.map((report) => report.reportHash);
    const draft = { format: "tear-production-policy-outcome-suite-retention" as const, schemaVersion: 1 as const,
      revision: await this.#nextRetentionRevision(), retainedAt, maxReports, removedReportHashes: Object.freeze(removedReportHashes),
      retainedReportHashes: Object.freeze(retainedReportHashes) };
    const receipt = Object.freeze({ ...draft, receiptHash: suiteRetentionHash(draft) });
    await this.#backend.commit(Object.freeze([
      ...removedReports.flatMap((report) => [
        { store: "analysis" as const, key: `${OUTCOME_SUITE_KEY}${report.reportHash}` },
        { store: "indexes" as const, key: `policy-production-outcome-suite:${report.artifactId}:${report.reportHash}` },
      ]),
      { store: "analysis" as const, key: `${OUTCOME_SUITE_RETENTION_KEY}${String(receipt.revision).padStart(12, "0")}`, value: JSON.stringify(receipt) },
      { store: "indexes" as const, key: `${OUTCOME_SUITE_RETENTION_KEY}${String(receipt.revision).padStart(12, "0")}`, value: JSON.stringify(receipt) },
    ]));
    return receipt;
  }

  async retentionHistory(): Promise<readonly TearProductionPolicyOutcomeSuiteRetentionReceiptV1[]> {
    const receipts: TearProductionPolicyOutcomeSuiteRetentionReceiptV1[] = [];
    for (const key of (await this.#backend.keys("indexes")).filter((entry) => entry.startsWith(OUTCOME_SUITE_RETENTION_KEY))) {
      const raw = await this.#backend.get("indexes", key);
      try { if (raw !== undefined) receipts.push(parseSuiteRetentionReceipt(JSON.parse(raw))); }
      catch (error) { await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "policy-production-outcome-suite-retention-quarantine", schemaVersion: 1, key, raw, reason: error instanceof Error ? error.message : String(error) }))); }
    }
    return Object.freeze(receipts.sort((left, right) => left.revision - right.revision));
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
  const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true });
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
    const events = environment.sourceTracks().nativeEvents.map(mapGameplayEventToCausalEvent);
    const completed = events.some((event) => event.type === "run.completed"), defeated = events.some((event) => event.type === "run.defeated");
    if (completed && defeated) throw new Error("production evaluation observed contradictory terminal facts");
    const report = { format: "tear-production-policy-evaluation" as const, schemaVersion: 1 as const,
      artifactId: active.artifactId, artifactHash: active.artifactHash,
      scenario: Object.freeze({ id: scenario.id, version: scenario.version, seed: scenario.seed, hash: stableVerificationHash(scenario) }),
      decisions: Object.freeze(decisions), terminal: Object.freeze({ tick: terminal.tick, semanticHash: stableVerificationHash(terminal), terminated, truncated,
        outcome: completed ? "completed" as const : defeated ? "defeated" as const : "none" as const, revivals: events.filter((event) => event.type === "player.revived").length }) };
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
  validateTearProductionPolicyEvaluationSuite(suite);
  const mutableReports: TearProductionPolicyEvaluationReportV1[] = [];
  for (const scenario of suite.scenarios) mutableReports.push(await evaluateActiveTearPolicyInProduction(registry, scenario));
  const reports = Object.freeze(mutableReports);
  const first = reports[0];
  if (first === undefined) throw new Error("production policy evaluation suite has no reports");
  if (reports.some((report) => report.artifactId !== first.artifactId || report.artifactHash !== first.artifactHash)) {
    throw new Error("active policy changed during production outcome suite evaluation");
  }
  const outcomes = summarizeReports(reports);
  const draft = { format: "tear-production-policy-outcome-suite" as const, schemaVersion: 1 as const,
    artifactId: first.artifactId, artifactHash: first.artifactHash,
    suite: Object.freeze({ id: suite.id, version: suite.version, hash: stableVerificationHash(suite) }), reports, outcomes };
  return Object.freeze({ ...draft, reportHash: stableVerificationHash(draft) });
}

import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import { createProductionHeadlessEnvironment } from "../tearbench";
import { mapGameplayEventToCausalEvent } from "../tearbench/gameplay-causal-events";
import type { TearAgentProfileId } from "./contracts";
import type { TearPolicyArtifactRegistry } from "./policy-artifact-registry";
import { evaluateActiveTearPolicyOutcomeSuiteInProduction, validateTearProductionPolicyEvaluationSuite } from "./production-policy-evaluation";
import { parseTearProductionPolicyOutcomeSuiteReport, type TearProductionPolicyEvaluationSuiteV1, type TearProductionPolicyOutcomeSuiteReportV1 } from "./production-policy-evaluation";
import { TearAgentOrchestrator } from "./scripted-policy";

export interface TearTemporalPolicyScriptedBaselineReportV1 {
  readonly profile: TearAgentProfileId;
  readonly outcomes: Readonly<{ scenarioCount: number; terminatedScenarios: number; truncatedScenarios: number; executedDecisions: number; completedScenarios: number; defeatedScenarios: number; revivalEvents: number }>;
  readonly reportHash: string;
}

export interface TearTemporalPolicyBaselineComparisonV1 {
  readonly format: "tear-temporal-policy-baseline-comparison";
  readonly schemaVersion: 1;
  readonly artifact: Readonly<{ id: string; hash: string; trainingHash: string; trainingScenarioHashes: readonly string[] }>;
  readonly suite: Readonly<{ id: string; version: number; hash: string }>;
  readonly artifactReport: TearProductionPolicyOutcomeSuiteReportV1;
  readonly scriptedBaseline: TearTemporalPolicyScriptedBaselineReportV1;
  /** Observed deltas only; they deliberately do not declare a win or promotion. */
  readonly metrics: Readonly<{ terminatedScenarioDelta: number; truncatedScenarioDelta: number; executedDecisionDelta: number; completedScenarioDelta: number; defeatedScenarioDelta: number; revivalEventDelta: number }>;
  readonly comparisonHash: string;
}

const VAULT_KEY = "temporal-policy-baseline-comparison:v1:";

function nonnegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function validOutcomeSummary(value: unknown): boolean {
  return record(value) && ["scenarioCount", "terminatedScenarios", "truncatedScenarios", "executedDecisions", "completedScenarios", "defeatedScenarios", "revivalEvents"].every((key) => nonnegativeInteger(value[key]));
}

/** Validates retained comparison evidence, including its deterministic observed deltas. */
export function parseTearTemporalPolicyBaselineComparison(value: unknown): TearTemporalPolicyBaselineComparisonV1 {
  if (!record(value) || value.format !== "tear-temporal-policy-baseline-comparison" || value.schemaVersion !== 1 || !record(value.artifact)
    || typeof value.artifact.id !== "string" || !hashes(value.artifact.hash) || !hashes(value.artifact.trainingHash)
    || !Array.isArray(value.artifact.trainingScenarioHashes) || value.artifact.trainingScenarioHashes.length < 1 || !value.artifact.trainingScenarioHashes.every(hashes)
    || !record(value.suite) || typeof value.suite.id !== "string" || !nonnegativeInteger(value.suite.version) || value.suite.version < 1 || !hashes(value.suite.hash)
    || !record(value.scriptedBaseline) || typeof value.scriptedBaseline.profile !== "string" || !validOutcomeSummary(value.scriptedBaseline.outcomes)
    || !hashes(value.scriptedBaseline.reportHash) || !record(value.metrics) || !hashes(value.comparisonHash)) {
    throw new TypeError("invalid temporal policy baseline comparison");
  }
  const artifactReport = parseTearProductionPolicyOutcomeSuiteReport(value.artifactReport);
  if (artifactReport.artifactId !== value.artifact.id || artifactReport.artifactHash !== value.artifact.hash || artifactReport.suite.hash !== value.suite.hash) {
    throw new TypeError("temporal policy baseline comparison lineage mismatch");
  }
  const baseline = value.scriptedBaseline.outcomes as TearTemporalPolicyScriptedBaselineReportV1["outcomes"], observed = artifactReport.outcomes;
  const metrics = Object.freeze({ terminatedScenarioDelta: observed.terminatedScenarios - baseline.terminatedScenarios,
    truncatedScenarioDelta: observed.truncatedScenarios - baseline.truncatedScenarios, executedDecisionDelta: observed.executedDecisions - baseline.executedDecisions,
    completedScenarioDelta: observed.completedScenarios - baseline.completedScenarios, defeatedScenarioDelta: observed.defeatedScenarios - baseline.defeatedScenarios,
    revivalEventDelta: observed.revivalEvents - baseline.revivalEvents });
  if (stableVerificationHash(metrics) !== stableVerificationHash(value.metrics)) throw new TypeError("temporal policy baseline comparison metrics mismatch");
  const typed = value as unknown as TearTemporalPolicyBaselineComparisonV1, { comparisonHash, ...draft } = typed;
  if (comparisonHash !== stableVerificationHash(draft)) throw new TypeError("temporal policy baseline comparison integrity mismatch");
  return Object.freeze({ ...draft, artifact: Object.freeze({ ...draft.artifact, trainingScenarioHashes: Object.freeze([...draft.artifact.trainingScenarioHashes]) }),
    suite: Object.freeze({ ...draft.suite }), artifactReport, scriptedBaseline: Object.freeze({ ...draft.scriptedBaseline, outcomes: Object.freeze({ ...draft.scriptedBaseline.outcomes }) }), metrics, comparisonHash });
}

/** Local, idempotent custody for source-world temporal-artifact versus scripted-baseline observations. */
export class TearTemporalPolicyBaselineComparisonVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }

  async persist(input: TearTemporalPolicyBaselineComparisonV1): Promise<TearTemporalPolicyBaselineComparisonV1> {
    const comparison = parseTearTemporalPolicyBaselineComparison(input), key = `${VAULT_KEY}${comparison.comparisonHash}`;
    const existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) return parseTearTemporalPolicyBaselineComparison(JSON.parse(existing));
    await this.#backend.commit(Object.freeze([
      { store: "analysis", key, value: JSON.stringify(comparison) },
      { store: "indexes", key: `temporal-policy-baseline-comparison:${comparison.artifact.id}:${comparison.comparisonHash}`,
        value: JSON.stringify({ artifactHash: comparison.artifact.hash, suiteHash: comparison.suite.hash }) },
    ]));
    return comparison;
  }

  async get(comparisonHash: string): Promise<TearTemporalPolicyBaselineComparisonV1 | undefined> {
    if (!hashes(comparisonHash)) throw new TypeError("temporal policy baseline comparison hash is invalid");
    const key = `${VAULT_KEY}${comparisonHash}`, raw = await this.#backend.get("analysis", key);
    if (raw === undefined) return undefined;
    try { return parseTearTemporalPolicyBaselineComparison(JSON.parse(raw)); }
    catch (error) {
      await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "temporal-policy-baseline-comparison-quarantine", schemaVersion: 1,
        key, raw, reason: error instanceof Error ? error.message : String(error) })));
      return undefined;
    }
  }
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hashes(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{16}$/u.test(value); }
function provenance(registry: TearPolicyArtifactRegistry, id: string) {
  return registry.get(id).then((artifact) => {
    if (artifact === undefined) throw new RangeError("temporal policy comparison active artifact is unavailable");
    const value = artifact.extensions.temporalPolicyTraining;
    if (!record(value) || value.format !== "tear-temporal-policy-training-provenance" || value.schemaVersion !== 1 || !hashes(value.trainingHash)
      || !Array.isArray(value.trainingScenarioHashes) || value.trainingScenarioHashes.length < 1 || !value.trainingScenarioHashes.every(hashes)) {
      throw new RangeError("temporal policy comparison requires governed training scenario provenance");
    }
    return Object.freeze({ artifact, trainingHash: value.trainingHash, trainingScenarioHashes: Object.freeze([...value.trainingScenarioHashes].sort()) });
  });
}

function scriptedBaseline(suite: TearProductionPolicyEvaluationSuiteV1, profile: TearAgentProfileId): TearTemporalPolicyScriptedBaselineReportV1 {
  let terminatedScenarios = 0, truncatedScenarios = 0, executedDecisions = 0, completedScenarios = 0, defeatedScenarios = 0, revivalEvents = 0;
  for (const scenario of suite.scenarios) {
    const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true }), policy = new TearAgentOrchestrator(profile);
    try {
      let terminal = environment.reset(scenario), terminated = false, truncated = false;
      while (!terminated && !truncated && terminal.tick < scenario.maxTicks) {
        const decision = policy.decide({ state: environment.policyObservation(), ui: { screen: "playing" } });
        const transition = environment.step(decision.actions);
        terminal = transition.observation; terminated = transition.terminated; truncated = transition.truncated;
        executedDecisions += 1;
      }
      terminatedScenarios += Number(terminated); truncatedScenarios += Number(truncated);
      const events = environment.sourceTracks().nativeEvents.map(mapGameplayEventToCausalEvent);
      const completed = events.some((event) => event.type === "run.completed"), defeated = events.some((event) => event.type === "run.defeated");
      if (completed && defeated) throw new Error("scripted baseline observed contradictory terminal facts");
      completedScenarios += Number(completed); defeatedScenarios += Number(defeated); revivalEvents += events.filter((event) => event.type === "player.revived").length;
    } finally { environment.dispose(); }
  }
  const outcomes = Object.freeze({ scenarioCount: suite.scenarios.length, terminatedScenarios, truncatedScenarios, executedDecisions, completedScenarios, defeatedScenarios, revivalEvents });
  const draft = { profile, outcomes };
  return Object.freeze({ ...draft, reportHash: stableVerificationHash(draft) });
}

/**
 * Compares a governed temporal artifact and scripted policy on fresh source
 * worlds. It refuses any suite scenario used by temporal training, and records
 * observed deltas only; quality thresholds and promotion stay outside C33.
 */
export async function compareTemporalPolicyAgainstScriptedBaselineInProduction(registry: TearPolicyArtifactRegistry,
  suite: TearProductionPolicyEvaluationSuiteV1, profile: TearAgentProfileId = "competent"): Promise<TearTemporalPolicyBaselineComparisonV1> {
  validateTearProductionPolicyEvaluationSuite(suite);
  const active = await registry.active(); if (active === undefined) throw new RangeError("temporal policy comparison requires an active artifact");
  const source = await provenance(registry, active.artifactId);
  if (source.artifact.artifactHash !== active.artifactHash) throw new RangeError("temporal policy comparison active artifact changed");
  if (suite.scenarios.some((scenario) => source.trainingScenarioHashes.includes(stableVerificationHash(scenario)))) {
    throw new RangeError("temporal policy comparison suite overlaps a training scenario");
  }
  const baseline = scriptedBaseline(suite, profile);
  const artifactReport = await evaluateActiveTearPolicyOutcomeSuiteInProduction(registry, suite);
  const metrics = Object.freeze({ terminatedScenarioDelta: artifactReport.outcomes.terminatedScenarios - baseline.outcomes.terminatedScenarios,
    truncatedScenarioDelta: artifactReport.outcomes.truncatedScenarios - baseline.outcomes.truncatedScenarios,
    executedDecisionDelta: artifactReport.outcomes.executedDecisions - baseline.outcomes.executedDecisions,
    completedScenarioDelta: artifactReport.outcomes.completedScenarios - baseline.outcomes.completedScenarios,
    defeatedScenarioDelta: artifactReport.outcomes.defeatedScenarios - baseline.outcomes.defeatedScenarios,
    revivalEventDelta: artifactReport.outcomes.revivalEvents - baseline.outcomes.revivalEvents });
  const draft = { format: "tear-temporal-policy-baseline-comparison" as const, schemaVersion: 1 as const,
    artifact: Object.freeze({ id: active.artifactId, hash: active.artifactHash, trainingHash: source.trainingHash, trainingScenarioHashes: source.trainingScenarioHashes }),
    suite: Object.freeze({ id: suite.id, version: suite.version, hash: stableVerificationHash(suite) }), artifactReport, scriptedBaseline: baseline, metrics };
  return parseTearTemporalPolicyBaselineComparison({ ...draft, comparisonHash: stableVerificationHash(draft) });
}

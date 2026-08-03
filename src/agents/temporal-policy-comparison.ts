import { stableVerificationHash } from "../replay/hash";
import { createProductionHeadlessEnvironment } from "../tearbench";
import type { TearAgentProfileId } from "./contracts";
import type { TearPolicyArtifactRegistry } from "./policy-artifact-registry";
import { evaluateActiveTearPolicyOutcomeSuiteInProduction, validateTearProductionPolicyEvaluationSuite } from "./production-policy-evaluation";
import type { TearProductionPolicyEvaluationSuiteV1, TearProductionPolicyOutcomeSuiteReportV1 } from "./production-policy-evaluation";
import { TearAgentOrchestrator } from "./scripted-policy";

export interface TearTemporalPolicyScriptedBaselineReportV1 {
  readonly profile: TearAgentProfileId;
  readonly outcomes: Readonly<{ scenarioCount: number; terminatedScenarios: number; truncatedScenarios: number; executedDecisions: number }>;
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
  readonly metrics: Readonly<{ terminatedScenarioDelta: number; truncatedScenarioDelta: number; executedDecisionDelta: number }>;
  readonly comparisonHash: string;
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
  let terminatedScenarios = 0, truncatedScenarios = 0, executedDecisions = 0;
  for (const scenario of suite.scenarios) {
    const environment = createProductionHeadlessEnvironment(), policy = new TearAgentOrchestrator(profile);
    try {
      let terminal = environment.reset(scenario), terminated = false, truncated = false;
      while (!terminated && !truncated && terminal.tick < scenario.maxTicks) {
        const decision = policy.decide({ state: environment.policyObservation(), ui: { screen: "playing" } });
        const transition = environment.step(decision.actions);
        terminal = transition.observation; terminated = transition.terminated; truncated = transition.truncated;
        executedDecisions += 1;
      }
      terminatedScenarios += Number(terminated); truncatedScenarios += Number(truncated);
    } finally { environment.dispose(); }
  }
  const outcomes = Object.freeze({ scenarioCount: suite.scenarios.length, terminatedScenarios, truncatedScenarios, executedDecisions });
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
    executedDecisionDelta: artifactReport.outcomes.executedDecisions - baseline.outcomes.executedDecisions });
  const draft = { format: "tear-temporal-policy-baseline-comparison" as const, schemaVersion: 1 as const,
    artifact: Object.freeze({ id: active.artifactId, hash: active.artifactHash, trainingHash: source.trainingHash, trainingScenarioHashes: source.trainingScenarioHashes }),
    suite: Object.freeze({ id: suite.id, version: suite.version, hash: stableVerificationHash(suite) }), artifactReport, scriptedBaseline: baseline, metrics };
  return Object.freeze({ ...draft, comparisonHash: stableVerificationHash(draft) });
}

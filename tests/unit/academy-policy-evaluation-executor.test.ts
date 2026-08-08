import { describe, expect, it } from "vitest";

import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  createTearAcademyPolicyEvaluationLaunch,
  createTearAcademyPolicyEvaluationPlan,
  createTearPolicyArtifact,
  TearAcademyPolicyEvaluationExecutor,
  TearAcademyPolicyEvaluationPlanVault,
  TearAcademyPolicyEvaluationResultVault,
  type TearAcademyTrainingDatasetV1,
} from "../../src/agents";
import {
  createOneFrameBoundaryLaunchMatrix,
  createProductionHeadlessEnvironment,
  forgeExitLaunchSnapshot,
  type TearScenarioV1,
} from "../../src/tearbench";

function scenario(id: string, seed: string, maxTicks = 12): TearScenarioV1 {
  return Object.freeze({ format: "tear-contract", kind: "scenario", schemaVersion: 1, id, version: 1, description: "C33 immutable evaluator case",
    stateClass: "recorded-canonical", executionClass: "training", seed, start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }),
    maxTicks, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c33", "evaluation"] as const) });
}

function dataset(source = scenario("c33-evaluator-training", "c33-evaluator-training-seed")): TearAcademyTrainingDatasetV1 {
  return Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1,
    manifest: Object.freeze({ id: "c33-evaluator", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }),
    sequences: Object.freeze([Object.freeze({ candidateHash: "c".repeat(16), split: "training", lessonId: "movement-foundations", segmentKind: "demonstration",
      tags: Object.freeze([]), sourceScenario: source, tracks: {} as never, sequenceHash: "d".repeat(16) })]), observationCount: 1, actionCount: 1, datasetHash: "e".repeat(16) });
}

function recovery(scenarioValue: TearScenarioV1) {
  const environment = createProductionHeadlessEnvironment();
  try {
    environment.reset(scenarioValue);
    environment.step([]);
    const source = environment.captureCheckpoint();
    const boundary = createOneFrameBoundaryLaunchMatrix().at(0);
    if (boundary === undefined) throw new Error("expected State Forge boundary fixture");
    return Object.freeze({ source, forgedSnapshot: forgeExitLaunchSnapshot(source.snapshot, boundary) });
  } finally { environment.dispose(); }
}

describe("Academy policy evaluation executor", () => {
  it("runs a persisted plan through the same fresh source/recovery runner and retains a hash-bound non-activation verdict", async () => {
    const backend = createMemoryGhostVaultBackend();
    const recoveryScenario = scenario("movement-unseen-one", "m-91");
    const unseenScenario = scenario("movement-unseen-two", "m-92");
    const plan = createTearAcademyPolicyEvaluationPlan({ id: "c33-evaluator", version: 1, dataset: dataset(), artifactTrainingHash: "f".repeat(16),
      baselineProfile: "competent", primaryMetric: "completed-rate", minimumBaselineMargin: 0.01, daggerSourceScenarioHashes: ["1".repeat(16)],
      cases: Object.freeze([
        Object.freeze({ lessonId: "movement-foundations", kind: "recovery" as const, scenario: recoveryScenario }),
        Object.freeze({ lessonId: "movement-foundations", kind: "unseen" as const, scenario: unseenScenario }),
      ]) });
    await new TearAcademyPolicyEvaluationPlanVault(backend).persist(plan);
    const candidate = createTearPolicyArtifact({ id: "c33-evaluator-candidate", createdAt: "2026-08-08T12:00:00.000Z",
      model: { format: "table-policy-v1", payload: JSON.stringify({ format: "tear-table-policy-model", schemaVersion: 1, actionsByObservationHash: { "*": [] } }) },
      encoder: { id: "tear-policy-features.v1", schemaVersion: 1, observationClass: "structured-state", normalizationHash: "2".repeat(16) },
      actionSchema: "tear-game-action-command-envelope.v1", recurrentState: { kind: "none", schemaVersion: 1 },
      trainingManifest: { id: "c33-evaluator", version: 1, rootHash: "b".repeat(16) }, rewardVersion: "tear-reward.v1",
      build: { version: "test", revision: "c33", target: "unit", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" }, metrics: {},
      levelTarget: "class-a", lineage: { trainingRunId: plan.artifactTrainingHash }, signature: { kind: "local-unsigned", keyId: "development" },
      compatibility: { runtime: "tear-policy-runtime.v1", observationClass: "structured-state", actionSchema: "tear-game-action-command-envelope.v1", modelFormats: ["table-policy-v1"] } });
    const launch = createTearAcademyPolicyEvaluationLaunch({ plan: { id: plan.id, planHash: plan.planHash }, candidate,
      recovery: Object.freeze([{ scenarioHash: stableVerificationHash(recoveryScenario), evaluation: recovery(recoveryScenario) }]) });
    const executor = new TearAcademyPolicyEvaluationExecutor(backend);
    const first = await executor.execute(launch), second = await executor.execute(launch);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ format: "tear-academy-policy-evaluation-result", passed: false,
      candidate: { id: candidate.id, artifactHash: candidate.artifactHash, trainingHash: plan.artifactTrainingHash } });
    expect(first.candidateRuns).toHaveLength(2);
    expect(first.baselineRuns).toHaveLength(2);
    expect(first.candidateRuns[0]).toMatchObject({ kind: "recovery", startedAtTick: 1 });
    expect(first.baselineRuns[0]).toMatchObject({ kind: "recovery", startedAtTick: 1 });
    expect(first.candidateRuns.every((run) => run.artifactDecisions === run.decisions && run.fallbackDecisions === 0)).toBe(true);
    expect((await backend.keys("analysis")).some((key) => key.startsWith("policy-artifact:v1:") || key === "policy-active:v1")).toBe(false);
    const vault = new TearAcademyPolicyEvaluationResultVault(backend);
    expect(await vault.get(first.resultHash)).toEqual(first);
    await backend.put("analysis", `academy-policy-evaluation-result:v1:${first.resultHash}`, "not-json");
    expect(await vault.get(first.resultHash)).toBeUndefined();
    expect((await backend.keys("quarantine")).some((key) => key.endsWith(first.resultHash))).toBe(true);
  });

  it("fails closed when a recovery launch does not carry the exact natural source scenario", async () => {
    const backend = createMemoryGhostVaultBackend();
    const recoveryScenario = scenario("movement-unseen-one", "m-91"), other = scenario("movement-unseen-two", "m-92");
    const plan = createTearAcademyPolicyEvaluationPlan({ id: "c33-evaluator-mismatch", version: 1, dataset: dataset(), artifactTrainingHash: "f".repeat(16),
      baselineProfile: "competent", primaryMetric: "completed-rate", minimumBaselineMargin: 0.01, daggerSourceScenarioHashes: ["1".repeat(16)],
      cases: Object.freeze([
        Object.freeze({ lessonId: "movement-foundations", kind: "recovery" as const, scenario: recoveryScenario }),
        Object.freeze({ lessonId: "movement-foundations", kind: "unseen" as const, scenario: other }),
      ]) });
    await new TearAcademyPolicyEvaluationPlanVault(backend).persist(plan);
    const candidate = createTearPolicyArtifact({ id: "c33-evaluator-mismatch-candidate", createdAt: "2026-08-08T12:00:00.000Z",
      model: { format: "table-policy-v1", payload: JSON.stringify({ format: "tear-table-policy-model", schemaVersion: 1, actionsByObservationHash: { "*": [] } }) },
      encoder: { id: "tear-policy-features.v1", schemaVersion: 1, observationClass: "structured-state", normalizationHash: "2".repeat(16) }, actionSchema: "tear-game-action-command-envelope.v1",
      recurrentState: { kind: "none", schemaVersion: 1 }, trainingManifest: { id: "c33-evaluator", version: 1, rootHash: "b".repeat(16) }, rewardVersion: "tear-reward.v1",
      build: { version: "test", revision: "c33", target: "unit", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" }, metrics: {}, levelTarget: "class-a",
      lineage: { trainingRunId: plan.artifactTrainingHash }, signature: { kind: "local-unsigned", keyId: "development" },
      compatibility: { runtime: "tear-policy-runtime.v1", observationClass: "structured-state", actionSchema: "tear-game-action-command-envelope.v1", modelFormats: ["table-policy-v1"] } });
    const launch = createTearAcademyPolicyEvaluationLaunch({ plan: { id: plan.id, planHash: plan.planHash }, candidate,
      recovery: Object.freeze([{ scenarioHash: stableVerificationHash(recoveryScenario), evaluation: recovery(other) }]) });
    await expect(new TearAcademyPolicyEvaluationExecutor(backend).execute(launch)).rejects.toThrow(/source scenario/u);
  });
});

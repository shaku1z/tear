import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  advanceTearOnlineRlCheckpoint, advanceTearOfflineRlCheckpoint, completeTearOfflineRlCheckpoint,
  createTearOfflineRlCheckpoint, createTearOfflineRlPlan, createTearOnlineRlCheckpoint,
  createTearOnlineRlCurriculumPlan, createTearOnlineRlSourceEvaluationPlan, extractTearOfflineRlTrajectories,
  TearOfflineRlTrainingVault, TearOnlineRlSourceEvaluationExecutor, type TearAcademyTrainingDatasetV1,
} from "../../src/agents";

const scenario = Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const, id: "c34-source-evaluation", version: 1, description: "C34 source evaluation", stateClass: "recorded-canonical" as const, executionClass: "training" as const, seed: "c34-source-evaluation", start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 4, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c34"] as const) });
function setup() {
  const states = [0, 1].map((tick) => Object.freeze({ tick, input: {} as never, run: Object.freeze({ mode: "endless", wave: 1, score: tick, time: tick, seed: 7 }), player: Object.freeze({ x: 0, y: 0, vx: 0, vy: 0, hp: 100 }), blade: Object.freeze({ state: "held", x: 0, y: 0, vx: 0, vy: 0 }), enemies: Object.freeze([]) }));
  const dataset = Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1, manifest: Object.freeze({ id: "c34-source-evaluation", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }), sequences: Object.freeze([Object.freeze({ candidateHash: "c".repeat(16), split: "training", lessonId: "movement-foundations", segmentKind: "demonstration", tags: Object.freeze([]), sourceScenario: scenario, tracks: Object.freeze({ observations: Object.freeze(states), actions: Object.freeze([Object.freeze({ kind: "command" as const, id: 1, tick: 1, command: Object.freeze({ type: "move" as const, x: 1_000, y: 0 }) })]), nativeEvents: Object.freeze([]), rewardComponents: Object.freeze(states.map((entry) => Object.freeze({ tick: entry.tick, value: null }))), intents: Object.freeze([]), terminal: Object.freeze({ tick: 1, semanticHash: stableVerificationHash(states[1]), terminated: true, truncated: false }) }) as never, sequenceHash: "e".repeat(16) })]), observationCount: 2, actionCount: 1, datasetHash: "f".repeat(16) }) satisfies TearAcademyTrainingDatasetV1;
  const offline = createTearOfflineRlPlan(dataset, { id: "c34-source-evaluation", version: 1, seed: 1, reward: { components: [{ id: "score", source: "score.delta", weight: 1, maximumSourceValue: 10, perTransitionCap: 10 }], totalMinimum: -10, totalMaximum: 10 }, limits: { maxTransitions: 4, maxEventsPerTransition: 4, maxRewardViolations: 0 } });
  const receipt = extractTearOfflineRlTrajectories(dataset, offline), config = { epochs: 1, learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 10, maxMeanAbsoluteTdError: 10, maxConsecutiveDivergentEpochs: 2 }, training = completeTearOfflineRlCheckpoint(advanceTearOfflineRlCheckpoint(createTearOfflineRlCheckpoint(receipt, config), receipt, config, 1), receipt, config);
  const curriculum = createTearOnlineRlCurriculumPlan(dataset, offline, receipt, { id: "source-evaluation", trainingHash: training.trainingHash, stages: [{ id: "movement", lessonId: "movement-foundations", scenarios: [scenario], episodeBudget: 1 }], exploration: { seed: 7, initialNumerator: 0, minimumNumerator: 0, denominator: 1, decrementEveryEpisodes: 1, decrementBy: 1 }, budgets: { maxEpisodes: 1, maxTicksPerEpisode: 4, maxTotalTicks: 4, maxTotalDecisions: 4, maxTotalAbsoluteReward: 100 } });
  const onlineConfig = { learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 100, maxAbsoluteQ: 100, maxTotalUpdates: 8, maxConsecutiveDivergentUpdates: 2 };
  const online = createTearOnlineRlCheckpoint(curriculum, offline, receipt, training, onlineConfig);
  return { offline, receipt, training, curriculum, onlineConfig, online };
}

describe("C34 paired source-world Q evaluation", () => {
  it("runs frozen baseline and challenger on identical fresh C30 cases, retaining a truthful non-promotional fail", async () => {
    const backend = createMemoryGhostVaultBackend(), { offline, receipt, training, curriculum, onlineConfig, online } = setup(); await new TearOfflineRlTrainingVault(backend).persist(training);
    const complete = await advanceTearOnlineRlCheckpoint(backend, curriculum, offline, receipt, training, onlineConfig, online);
    const plan = createTearOnlineRlSourceEvaluationPlan(curriculum, offline, receipt, training, complete, { id: "paired", thresholds: { minimumRewardGain: 1, requireCompletionRateNotLower: true, maxTicksPerCase: 4, maxAbsoluteRewardPerCase: 100 } });
    const executor = new TearOnlineRlSourceEvaluationExecutor(backend), first = await executor.execute(plan, curriculum, offline, receipt, complete), again = await executor.execute(plan, curriculum, offline, receipt, complete);
    expect(again).toEqual(first); expect(first).toMatchObject({ promotional: false, metrics: { passed: false } }); expect(first.traces).toHaveLength(2);
    expect(first.traces.map((trace) => [trace.side, trace.scenarioHash])).toEqual([["baseline", plan.cases[0]?.scenarioHash], ["challenger", plan.cases[0]?.scenarioHash]]);
    expect(first.traces.every((trace) => trace.actions.every((action) => action.semanticActionHash.length === 16))).toBe(true);
    expect((await backend.keys("analysis")).some((key) => key.startsWith("policy-"))).toBe(false);
  });

  it("fails closed if the persisted baseline or challenger lineage is substituted", async () => {
    const backend = createMemoryGhostVaultBackend(), { offline, receipt, training, curriculum, onlineConfig, online } = setup(); await new TearOfflineRlTrainingVault(backend).persist(training);
    const complete = await advanceTearOnlineRlCheckpoint(backend, curriculum, offline, receipt, training, onlineConfig, online);
    const plan = createTearOnlineRlSourceEvaluationPlan(curriculum, offline, receipt, training, complete, { id: "lineage", thresholds: { minimumRewardGain: 0, requireCompletionRateNotLower: true, maxTicksPerCase: 4, maxAbsoluteRewardPerCase: 100 } });
    const forged = { ...complete, input: { ...complete.input, trainingHash: "0".repeat(16) } };
    await expect(new TearOnlineRlSourceEvaluationExecutor(backend).execute(plan, curriculum, offline, receipt, forged)).rejects.toThrow(/integrity|lineage/u);
  });
});

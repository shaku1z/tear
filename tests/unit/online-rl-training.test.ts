import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  advanceTearOnlineRlCheckpoint,
  advanceTearOfflineRlCheckpoint,
  completeTearOfflineRlCheckpoint,
  createTearOfflineRlCheckpoint,
  createTearOfflineRlPlan,
  createTearOnlineRlCheckpoint,
  createTearOnlineRlCurriculumPlan,
  extractTearOfflineRlTrajectories,
  selectTearOnlineRlAction,
  TearOfflineRlTrainingVault,
  TearOnlineRlCheckpointVault,
  TearOnlineRlTrainingVault,
  type TearAcademyTrainingDatasetV1,
} from "../../src/agents";

const scenario = Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const, id: "c34-online-update", version: 1, description: "C34 online update", stateClass: "recorded-canonical" as const, executionClass: "training" as const, seed: "c34-online-update", start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 4, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c34"] as const) });
function setup() {
  const states = [0, 1].map((tick) => Object.freeze({ tick, input: {} as never, run: Object.freeze({ mode: "endless", wave: 1, score: tick, time: tick, seed: 7 }), player: Object.freeze({ x: 0, y: 0, vx: 0, vy: 0, hp: 100 }), blade: Object.freeze({ state: "held", x: 0, y: 0, vx: 0, vy: 0 }), enemies: Object.freeze([]) }));
  const data = Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1, manifest: Object.freeze({ id: "c34-online-update", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }), sequences: Object.freeze([Object.freeze({ candidateHash: "c".repeat(16), split: "training", lessonId: "movement-foundations", segmentKind: "demonstration", tags: Object.freeze([]), sourceScenario: scenario, tracks: Object.freeze({ observations: Object.freeze(states), actions: Object.freeze([Object.freeze({ kind: "command" as const, id: 1, tick: 1, command: Object.freeze({ type: "move" as const, x: 1_000, y: 0 }) })]), nativeEvents: Object.freeze([]), rewardComponents: Object.freeze(states.map((entry) => Object.freeze({ tick: entry.tick, value: null }))), intents: Object.freeze([]), terminal: Object.freeze({ tick: 1, semanticHash: stableVerificationHash(states[1]), terminated: true, truncated: false }) }) as never, sequenceHash: "d".repeat(16) })]), observationCount: 2, actionCount: 1, datasetHash: "e".repeat(16) }) satisfies TearAcademyTrainingDatasetV1;
  const offline = createTearOfflineRlPlan(data, { id: "c34-online-update", version: 1, seed: 1, reward: { components: [{ id: "score", source: "score.delta", weight: 1, maximumSourceValue: 10, perTransitionCap: 10 }], totalMinimum: -10, totalMaximum: 10 }, limits: { maxTransitions: 4, maxEventsPerTransition: 4, maxRewardViolations: 0 } });
  const receipt = extractTearOfflineRlTrajectories(data, offline), config = { epochs: 1, learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 10, maxMeanAbsoluteTdError: 10, maxConsecutiveDivergentEpochs: 2 }, training = completeTearOfflineRlCheckpoint(advanceTearOfflineRlCheckpoint(createTearOfflineRlCheckpoint(receipt, config), receipt, config, 1), receipt, config);
  const curriculum = createTearOnlineRlCurriculumPlan(data, offline, receipt, { id: "online-update", trainingHash: training.trainingHash, stages: [{ id: "movement", lessonId: "movement-foundations", scenarios: [scenario], episodeBudget: 1 }], exploration: { seed: 7, initialNumerator: 1, minimumNumerator: 1, denominator: 1, decrementEveryEpisodes: 1, decrementBy: 1 }, budgets: { maxEpisodes: 1, maxTicksPerEpisode: 4, maxTotalTicks: 4, maxTotalDecisions: 4, maxTotalAbsoluteReward: 100 } });
  return { offline, receipt, training, curriculum };
}
const onlineConfig = Object.freeze({ learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 100, maxAbsoluteQ: 100, maxTotalUpdates: 8, maxConsecutiveDivergentUpdates: 2 });

describe("C34 online Q checkpoint updates", () => {
  it("updates only post-C30-tick transitions and resumed checkpoint equals one shot", async () => {
    const backend = createMemoryGhostVaultBackend(), { offline, receipt, training, curriculum } = setup(); await new TearOfflineRlTrainingVault(backend).persist(training);
    const initial = createTearOnlineRlCheckpoint(curriculum, offline, receipt, training, onlineConfig);
    const oneShot = await advanceTearOnlineRlCheckpoint(backend, curriculum, offline, receipt, training, onlineConfig, initial);
    const paused = await advanceTearOnlineRlCheckpoint(backend, curriculum, offline, receipt, training, onlineConfig, initial, { maxTicks: 1 });
    expect(paused).toMatchObject({ status: "running", totalTicks: 1, updates: 1 }); expect(paused.resume).toBeDefined();
    const resumed = await advanceTearOnlineRlCheckpoint(backend, curriculum, offline, receipt, training, onlineConfig, paused);
    expect(resumed).toEqual(oneShot); expect(oneShot).toMatchObject({ status: "complete", totalTicks: 4, updates: 4 });
    expect(oneShot.qValues.some((entry) => entry.value !== 0)).toBe(true);
    const checkpoints = new TearOnlineRlCheckpointVault(backend); expect(await checkpoints.persist(paused)).toEqual(paused); expect(await checkpoints.get(paused.checkpointHash)).toEqual(paused);
    const result = await new TearOnlineRlTrainingVault(backend).persist(oneShot); expect(result).toMatchObject({ status: "complete", trainable: false, model: { format: "tear-online-tabular-q-model-v1" } });
    expect((await backend.keys("analysis")).some((key) => key.startsWith("policy-"))).toBe(false);
  });

  it("retains cancellation, timeout, and hard guards without an online model", async () => {
    const backend = createMemoryGhostVaultBackend(), { offline, receipt, training, curriculum } = setup(); await new TearOfflineRlTrainingVault(backend).persist(training);
    const initial = createTearOnlineRlCheckpoint(curriculum, offline, receipt, training, onlineConfig);
    const cancelled = await advanceTearOnlineRlCheckpoint(backend, curriculum, offline, receipt, training, onlineConfig, initial, { isCancelled: () => true });
    let time = 0; const timedOut = await advanceTearOnlineRlCheckpoint(backend, curriculum, offline, receipt, training, onlineConfig, initial, { now: () => ++time, timeoutMilliseconds: 1 });
    const guardConfig = { ...onlineConfig, maxTotalUpdates: 1 }, guardedInitial = createTearOnlineRlCheckpoint(curriculum, offline, receipt, training, guardConfig);
    const guarded = await advanceTearOnlineRlCheckpoint(backend, curriculum, offline, receipt, training, guardConfig, guardedInitial);
    expect(cancelled.status).toBe("cancelled"); expect(timedOut.status).toBe("timed-out"); expect(guarded.status).toBe("stopped-budget");
    for (const checkpoint of [cancelled, timedOut, guarded]) expect((await new TearOnlineRlTrainingVault(backend).persist(checkpoint)).model).toBeUndefined();
  });

  it("selects only available canonical V2 actions and rejects V1 envelope-only model bytes", () => {
    const { offline, receipt, training, curriculum } = setup(), state = Object.freeze({ tick: 0, input: {} as never, run: Object.freeze({ mode: "endless", wave: 1, score: 0, time: 0, seed: 7 }), player: Object.freeze({ x: 0, y: 0, vx: 0, vy: 0, hp: 100 }), blade: Object.freeze({ state: "held", x: 0, y: 0, vx: 0, vy: 0 }), enemies: Object.freeze([]) });
    expect(selectTearOnlineRlAction(training.model?.entries ?? [], state, curriculum.actionVocabulary, ["move"], 0, 1, () => 0.9)?.actions).toEqual([{ type: "move", x: 1_000, y: 0 }]);
    expect(selectTearOnlineRlAction(training.model?.entries ?? [], state, curriculum.actionVocabulary, [], 0, 1, () => 0.9)).toBeUndefined();
    const v1 = structuredClone(training) as never as { model: { format: string }; trainingHash: string }; v1.model.format = "tear-offline-tabular-q-model";
    expect(() => createTearOnlineRlCheckpoint(curriculum, offline, receipt, v1 as never, onlineConfig)).toThrow(/V2/u);
  });
});

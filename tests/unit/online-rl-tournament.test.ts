import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  advanceTearOfflineRlCheckpoint,
  advanceTearOnlineRlCheckpoint,
  completeTearOfflineRlCheckpoint,
  createTearOfflineRlCheckpoint,
  createTearOfflineRlPlan,
  createTearOnlineRlCheckpoint,
  createTearOnlineRlCurriculumPlan,
  createTearOnlineRlTournamentPlan,
  extractTearOfflineRlTrajectories,
  TearOfflineRlTrainingVault,
  TearOnlineRlCheckpointVault,
  TearOnlineRlTournamentExecutor,
  type TearAcademyTrainingDatasetV1,
} from "../../src/agents";

const scenario = Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const, id: "c34-tournament", version: 1, description: "C34 tournament", stateClass: "recorded-canonical" as const, executionClass: "training" as const, seed: "c34-tournament", start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 4, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c34"] as const) });
async function setup() {
  const states = [0, 1].map((tick) => Object.freeze({ tick, input: {} as never, run: Object.freeze({ mode: "endless", wave: 1, score: tick, time: tick, seed: 7 }), player: Object.freeze({ x: 0, y: 0, vx: 0, vy: 0, hp: 100 }), blade: Object.freeze({ state: "held", x: 0, y: 0, vx: 0, vy: 0 }), enemies: Object.freeze([]) }));
  const data = Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1, manifest: Object.freeze({ id: "c34-tournament", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }), sequences: Object.freeze([Object.freeze({ candidateHash: "c".repeat(16), split: "training", lessonId: "movement-foundations", segmentKind: "demonstration", tags: Object.freeze([]), sourceScenario: scenario, tracks: Object.freeze({ observations: Object.freeze(states), actions: Object.freeze([Object.freeze({ kind: "command" as const, id: 1, tick: 1, command: Object.freeze({ type: "move" as const, x: 1_000, y: 0 }) })]), nativeEvents: Object.freeze([]), rewardComponents: Object.freeze(states.map((entry) => Object.freeze({ tick: entry.tick, value: null }))), intents: Object.freeze([]), terminal: Object.freeze({ tick: 1, semanticHash: stableVerificationHash(states[1]), terminated: true, truncated: false }) }) as never, sequenceHash: "d".repeat(16) })]), observationCount: 2, actionCount: 1, datasetHash: "e".repeat(16) }) satisfies TearAcademyTrainingDatasetV1;
  const offline = createTearOfflineRlPlan(data, { id: "c34-tournament", version: 1, seed: 1, reward: { components: [{ id: "score", source: "score.delta", weight: 1, maximumSourceValue: 10, perTransitionCap: 10 }], totalMinimum: -10, totalMaximum: 10 }, limits: { maxTransitions: 4, maxEventsPerTransition: 4, maxRewardViolations: 0 } });
  const receipt = extractTearOfflineRlTrajectories(data, offline), offlineConfig = { epochs: 1, learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 10, maxMeanAbsoluteTdError: 10, maxConsecutiveDivergentEpochs: 2 }, training = completeTearOfflineRlCheckpoint(advanceTearOfflineRlCheckpoint(createTearOfflineRlCheckpoint(receipt, offlineConfig), receipt, offlineConfig, 1), receipt, offlineConfig);
  const curriculum = createTearOnlineRlCurriculumPlan(data, offline, receipt, { id: "tournament", trainingHash: training.trainingHash, stages: [{ id: "movement", lessonId: "movement-foundations", scenarios: [scenario], episodeBudget: 1 }], exploration: { seed: 7, initialNumerator: 1, minimumNumerator: 1, denominator: 1, decrementEveryEpisodes: 1, decrementBy: 1 }, budgets: { maxEpisodes: 1, maxTicksPerEpisode: 4, maxTotalTicks: 4, maxTotalDecisions: 4, maxTotalAbsoluteReward: 100 } });
  const backend = createMemoryGhostVaultBackend(); await new TearOfflineRlTrainingVault(backend).persist(training); const firstConfig = { learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 100, maxAbsoluteQ: 100, maxTotalUpdates: 8, maxConsecutiveDivergentUpdates: 2 }, secondConfig = { ...firstConfig, learningRate: 0.25 };
  const challenger = await advanceTearOnlineRlCheckpoint(backend, curriculum, offline, receipt, training, firstConfig, createTearOnlineRlCheckpoint(curriculum, offline, receipt, training, firstConfig));
  const defender = await advanceTearOnlineRlCheckpoint(backend, curriculum, offline, receipt, training, secondConfig, createTearOnlineRlCheckpoint(curriculum, offline, receipt, training, secondConfig));
  const checkpoints = new TearOnlineRlCheckpointVault(backend); await checkpoints.persist(challenger); await checkpoints.persist(defender);
  return { backend, offline, receipt, curriculum, challenger, defender };
}

describe("C34 paired fresh-world tournament", () => {
  it("runs two completed online-Q checkpoints independently in deterministic paired C30 order", async () => {
    const { backend, offline, receipt, curriculum, challenger, defender } = await setup();
    const plan = createTearOnlineRlTournamentPlan(curriculum, challenger, defender, { id: "paired", budgets: { maxEpisodes: 1, maxTicksPerEpisode: 4, maxTotalTicks: 8, maxTotalAbsoluteReward: 100 } });
    const executor = new TearOnlineRlTournamentExecutor(backend), first = await executor.execute(plan, curriculum, offline, receipt), second = await executor.execute(plan, curriculum, offline, receipt);
    expect(second).toEqual(first); expect(first).toMatchObject({ status: "complete", trainable: false, runs: [{ competitor: "challenger" }, { competitor: "defender" }] });
    expect(first.runs.map((run) => run.scenarioHash)).toEqual([stableVerificationHash(scenario), stableVerificationHash(scenario)]);
    expect((await backend.keys("analysis")).some((key) => key.startsWith("policy-"))).toBe(false);
  });

  it("retains cancellation/budget stops and rejects a same-checkpoint pseudo-self-play plan", async () => {
    const { backend, offline, receipt, curriculum, challenger, defender } = await setup();
    expect(() => createTearOnlineRlTournamentPlan(curriculum, challenger, challenger, { id: "same", budgets: { maxEpisodes: 1, maxTicksPerEpisode: 4, maxTotalTicks: 8, maxTotalAbsoluteReward: 100 } })).toThrow(/invalid|completed/u);
    const plan = createTearOnlineRlTournamentPlan(curriculum, challenger, defender, { id: "stopped", budgets: { maxEpisodes: 1, maxTicksPerEpisode: 4, maxTotalTicks: 8, maxTotalAbsoluteReward: 100 } });
    await expect(new TearOnlineRlTournamentExecutor(backend).execute(plan, curriculum, offline, receipt, { isCancelled: () => true })).resolves.toMatchObject({ status: "cancelled", trainable: false });
    const bounded = await new TearOnlineRlTournamentExecutor(backend).execute(plan, curriculum, offline, receipt, { maxTicks: 1 }); expect(bounded).toMatchObject({ status: "stopped-budget", trainable: false });
  });
});

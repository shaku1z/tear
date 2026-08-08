import { describe, expect, it } from "vitest";
import {
  completeTearOfflineRlCheckpoint,
  advanceTearOfflineRlCheckpoint,
  createTearOfflineRlCheckpoint,
  createTearOfflineRlPlan,
  createTearOnlineRlCurriculumPlan,
  compileTearOnlineRlCurriculum,
  extractTearOfflineRlTrajectories,
  TearOfflineRlTrainingVault,
  TearOnlineRlCurriculumExecutor,
  parseTearOnlineRlCurriculumPlan,
  type TearAcademyTrainingDatasetV1,
} from "../../src/agents";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";

const scenario = Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const, id: "c34-curriculum", version: 1, description: "C34 source curriculum", stateClass: "recorded-canonical" as const, executionClass: "training" as const, seed: "c34-curriculum", start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 4, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c34"] as const) });
function setup() {
  const states = [0, 1].map((tick) => Object.freeze({ tick, input: {} as never, run: Object.freeze({ mode: "endless", wave: 1, score: tick, time: tick, seed: 7 }), player: Object.freeze({ x: 0, y: 0, vx: 0, vy: 0, hp: 100 }), blade: Object.freeze({ state: "held", x: 0, y: 0, vx: 0, vy: 0 }), enemies: Object.freeze([]) }));
  const data = Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1, manifest: Object.freeze({ id: "c34-curriculum", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }), sequences: Object.freeze([Object.freeze({ candidateHash: "c".repeat(16), split: "training", lessonId: "movement-foundations", segmentKind: "demonstration", tags: Object.freeze([]), sourceScenario: scenario, tracks: Object.freeze({ observations: Object.freeze(states), actions: Object.freeze([Object.freeze({ kind: "command" as const, id: 1, tick: 1, command: Object.freeze({ type: "move" as const, x: 1_000, y: 0 }) })]), nativeEvents: Object.freeze([]), rewardComponents: Object.freeze(states.map((entry) => Object.freeze({ tick: entry.tick, value: null }))), intents: Object.freeze([]), terminal: Object.freeze({ tick: 1, semanticHash: stableVerificationHash(states[1]), terminated: true, truncated: false }) }) as never, sequenceHash: "d".repeat(16) })]), observationCount: 2, actionCount: 1, datasetHash: "e".repeat(16) }) satisfies TearAcademyTrainingDatasetV1;
  const offline = createTearOfflineRlPlan(data, { id: "c34-curriculum", version: 1, seed: 1, reward: { components: [{ id: "score", source: "score.delta", weight: 1, maximumSourceValue: 10, perTransitionCap: 10 }], totalMinimum: -10, totalMaximum: 10 }, limits: { maxTransitions: 4, maxEventsPerTransition: 4, maxRewardViolations: 0 } });
  const receipt = extractTearOfflineRlTrajectories(data, offline), config = { epochs: 1, learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 10, maxMeanAbsoluteTdError: 10, maxConsecutiveDivergentEpochs: 2 }, training = completeTearOfflineRlCheckpoint(advanceTearOfflineRlCheckpoint(createTearOfflineRlCheckpoint(receipt, config), receipt, config, 1), receipt, config);
  return { data, offline, receipt, training };
}
function plan() { const { data, offline, receipt, training } = setup(); return { data, offline, receipt, training, plan: createTearOnlineRlCurriculumPlan(data, offline, receipt, { id: "bounded", trainingHash: training.trainingHash, stages: [{ id: "movement", lessonId: "movement-foundations", scenarios: [scenario], episodeBudget: 2 }], exploration: { seed: 7, initialNumerator: 4, minimumNumerator: 2, denominator: 4, decrementEveryEpisodes: 1, decrementBy: 2 }, budgets: { maxEpisodes: 2, maxTicksPerEpisode: 4, maxTotalTicks: 8, maxTotalDecisions: 8, maxTotalAbsoluteReward: 100 } }) }; }

describe("C34 bounded online curriculum", () => {
  it("derives a deterministic decaying vocabulary-only C30 route and retains it as non-trainable evidence", async () => {
    const { data, offline, receipt, training, plan: curriculum } = plan(), compiled = compileTearOnlineRlCurriculum(curriculum);
    expect(compiled.map((entry) => [entry.stageId, entry.epsilonNumerator, entry.rollout.exploration.actions])).toEqual([["movement", 4, [{ type: "move", x: 1_000, y: 0 }]], ["movement", 2, [{ type: "move", x: 1_000, y: 0 }]]]);
    const backend = createMemoryGhostVaultBackend(); await new TearOfflineRlTrainingVault(backend).persist(training);
    const result = await new TearOnlineRlCurriculumExecutor(backend).execute(curriculum, offline, receipt, training);
    expect(result).toMatchObject({ status: "complete", trainable: false, episodes: [{ stageId: "movement" }, { stageId: "movement" }] });
    expect(result.episodes.every((entry) => entry.scenarioHash === stableVerificationHash(scenario))).toBe(true);
    expect(data.datasetHash).toBe(offline.dataset.datasetHash);
    expect((await backend.keys("analysis")).some((key) => key.startsWith("online-rl-curriculum:v1:"))).toBe(true);
  });

  it("rejects ungoverned source scenarios and persists cancellation rather than treating it as a model result", async () => {
    const { data, offline, receipt, training, plan: curriculum } = plan();
    expect(() => createTearOnlineRlCurriculumPlan(data, offline, receipt, { id: "forged", trainingHash: training.trainingHash, stages: [{ id: "forged", lessonId: "movement-foundations", scenarios: [{ ...scenario, seed: "forged" }], episodeBudget: 1 }], exploration: curriculum.exploration, budgets: curriculum.budgets })).toThrow(/governed C30/u);
    const backend = createMemoryGhostVaultBackend(); await new TearOfflineRlTrainingVault(backend).persist(training);
    await expect(new TearOnlineRlCurriculumExecutor(backend).execute(curriculum, offline, receipt, training, { isCancelled: () => true })).resolves.toMatchObject({ status: "cancelled", trainable: false });
  });

  it("does not admit a self-hashed plan with noncanonical or duplicate semantic actions", () => {
    const { plan: curriculum } = plan(), { planHash: _planHash, ...draft } = curriculum;
    const noncanonical = { ...draft, actionVocabulary: [{ type: "move", x: 1_000, y: 0, adapterOnly: true }] };
    expect(() => parseTearOnlineRlCurriculumPlan({ ...noncanonical, planHash: stableVerificationHash(noncanonical) })).toThrow(/canonical normalized/u);
    const duplicate = { ...draft, actionVocabulary: [curriculum.actionVocabulary[0], curriculum.actionVocabulary[0]] };
    expect(() => parseTearOnlineRlCurriculumPlan({ ...duplicate, planHash: stableVerificationHash(duplicate) })).toThrow(/duplicate semantic/u);
  });
});

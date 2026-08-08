import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  TearFoundryJobVault, TearFoundryOfflineTrainingExecutor, TearFoundryOfflineTrainingFinalizationExecutor, TearFoundryOnlineTrainingExecutionExecutor, TearFoundryOnlineTrainingLaunchExecutor,
  TearOfflineRlTrainingVault, createTearFoundryJob, createTearOfflineRlPlan, transitionTearFoundryJob,
  type TearAcademyCandidateCustodyStore, type TearAcademyCorpusStore, type TearAcademyTrainingDatasetLoader, type TearAcademyTrainingDatasetV1,
} from "../../src/agents";

const h = Object.freeze({ artifact: "1111111111111111", corpus: "2222222222222222", evaluation: "3333333333333333", invariant: "5555555555555555", budget: "6666666666666666", stop: "7777777777777777" });
const scenario = Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const, id: "foundry-final", version: 1, description: "foundry final", stateClass: "recorded-canonical" as const, executionClass: "training" as const, seed: "foundry-final", start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 4, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c36"] as const) });
const states = [0, 1].map((tick) => Object.freeze({ tick, input: {} as never, run: Object.freeze({ mode: "endless", wave: 1, score: tick, time: tick, seed: 7 }), player: Object.freeze({ x: 0, y: 0, vx: 0, vy: 0, hp: 100 }), blade: Object.freeze({ state: "held", x: 0, y: 0, vx: 0, vy: 0 }), enemies: Object.freeze([]) }));
const dataset = Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1, manifest: Object.freeze({ id: "foundry-final", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }), sequences: Object.freeze([Object.freeze({ candidateHash: "c".repeat(16), split: "training", lessonId: "movement-foundations", segmentKind: "demonstration", tags: Object.freeze([]), sourceScenario: scenario, tracks: Object.freeze({ observations: Object.freeze(states), actions: Object.freeze([Object.freeze({ kind: "command" as const, id: 1, tick: 1, command: Object.freeze({ type: "move" as const, x: 1_000, y: 0 }) })]), nativeEvents: Object.freeze([]), rewardComponents: Object.freeze(states.map((entry) => Object.freeze({ tick: entry.tick, value: null }))), intents: Object.freeze([]), terminal: Object.freeze({ tick: 1, semanticHash: stableVerificationHash(states[1]), terminated: true, truncated: false }) }) as never, sequenceHash: "d".repeat(16) })]), observationCount: 2, actionCount: 1, datasetHash: "e".repeat(16) }) satisfies TearAcademyTrainingDatasetV1;
const request = Object.freeze({ manifestId: "foundry-final", trainerId: "foundry", manifestVersion: 1, plan: { id: "foundry-final", version: 1, seed: 1, reward: { components: [{ id: "score", source: "score.delta" as const, weight: 1, maximumSourceValue: 10, perTransitionCap: 10 }], totalMinimum: -10, totalMaximum: 10 }, limits: { maxTransitions: 4, maxEventsPerTransition: 4, maxRewardViolations: 0 as const } } });

async function setup(config: Readonly<{ epochs: number; maxMeanAbsoluteTdError: number; maxConsecutiveDivergentEpochs: number }>) {
  const backend = createMemoryGhostVaultBackend(), vault = new TearFoundryJobVault(backend), plan = createTearOfflineRlPlan(dataset, request.plan);
  const created = createTearFoundryJob({ id: `foundry-final-${String(config.epochs)}-${String(config.maxMeanAbsoluteTdError)}`, createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized", inputs: { champion: { id: "champion", artifactHash: h.artifact }, corpusRecordHashes: [h.corpus], evaluationPlanHash: h.evaluation, rewardDefinitionHash: plan.reward.rewardHash, invariantSetHash: h.invariant, budgetHash: h.budget, stopConditionsHash: h.stop } });
  const collected = transitionTearFoundryJob(created, "collecting", "2026-08-08T00:00:00.001Z", "collected"), job = transitionTearFoundryJob(collected, "curating", "2026-08-08T00:00:00.002Z", "manifest admitted");
  await vault.persist(job);
  const manifest = { id: request.manifestId, reader: { kind: "trainer" as const, id: request.trainerId }, version: request.manifestVersion, manifestHash: dataset.manifest.manifestHash, rootHash: dataset.manifest.rootHash, entries: [{ custodyRecordHash: h.corpus }] };
  const custody = { backend: () => backend, held: () => Promise.resolve([{ recordHash: h.corpus }]) } as unknown as TearAcademyCandidateCustodyStore;
  const corpus = { backend: () => backend, getManifest: () => Promise.resolve(manifest) } as unknown as TearAcademyCorpusStore;
  const loader = { load: () => Promise.resolve(dataset) } as unknown as TearAcademyTrainingDatasetLoader;
  const training = new TearFoundryOfflineTrainingExecutor(vault, custody, corpus, loader);
  const launched = await training.start(job, { ...request, config: { epochs: config.epochs, learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 10, maxMeanAbsoluteTdError: config.maxMeanAbsoluteTdError, maxConsecutiveDivergentEpochs: config.maxConsecutiveDivergentEpochs } }, "2026-08-08T00:01:00.000Z");
  return { backend, vault, custody, corpus, loader, launched };
}

describe("C36 offline training terminalization", () => {
  it("leaves a running checkpoint in training without a successor", async () => {
    const setupResult = await setup({ epochs: 2, maxMeanAbsoluteTdError: 10, maxConsecutiveDivergentEpochs: 2 });
    const executor = new TearFoundryOfflineTrainingFinalizationExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader);
    await expect(executor.finalize(setupResult.launched.job, setupResult.launched.launch.launchHash, "2026-08-08T00:02:00.000Z")).rejects.toThrow(/incomplete/u);
    await expect(setupResult.vault.get(setupResult.launched.job.id)).resolves.toMatchObject({ phase: "training", jobHash: setupResult.launched.job.jobHash });
  });

  it("persists a stopped result and rejects a diverged training lineage", async () => {
    const setupResult = await setup({ epochs: 2, maxMeanAbsoluteTdError: 0.000001, maxConsecutiveDivergentEpochs: 1 });
    const executor = new TearFoundryOfflineTrainingFinalizationExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader);
    const result = await executor.finalize(setupResult.launched.job, setupResult.launched.launch.launchHash, "2026-08-08T00:02:00.000Z");
    expect(result).toMatchObject({ job: { phase: "rejected" }, receipt: { disposition: "training-diverged" }, training: { disposition: "stopped-divergence" } });
    expect(result.training.model).toBeUndefined();
    await expect(new TearOfflineRlTrainingVault(setupResult.backend).get(result.training.trainingHash)).resolves.toEqual(result.training);
    expect((await setupResult.backend.keys("analysis")).some((key) => key.startsWith("policy-"))).toBe(false);
  });

  it("persists a completed result once and makes only its exact lineage evaluation-ready", async () => {
    const setupResult = await setup({ epochs: 1, maxMeanAbsoluteTdError: 10, maxConsecutiveDivergentEpochs: 2 });
    const executor = new TearFoundryOfflineTrainingFinalizationExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader);
    const first = await executor.finalize(setupResult.launched.job, setupResult.launched.launch.launchHash, "2026-08-08T00:02:00.000Z");
    const again = await executor.finalize(setupResult.launched.job, setupResult.launched.launch.launchHash, "2026-08-08T00:02:00.000Z");
    expect(first).toMatchObject({ job: { phase: "evaluating" }, receipt: { disposition: "evaluation-ready" }, training: { disposition: "completed" } });
    expect(again).toEqual(first);
    await expect(executor.finalize(setupResult.launched.job, "0".repeat(16), "2026-08-08T00:02:00.000Z")).rejects.toThrow(/lineage/u);
    expect((await setupResult.backend.keys("analysis")).some((key) => key.startsWith("policy-"))).toBe(false);
  });

  it("binds only exact completed readiness to a persisted but unrun C30 online checkpoint", async () => {
    const setupResult = await setup({ epochs: 1, maxMeanAbsoluteTdError: 10, maxConsecutiveDivergentEpochs: 2 });
    const finalized = await new TearFoundryOfflineTrainingFinalizationExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader).finalize(setupResult.launched.job, setupResult.launched.launch.launchHash, "2026-08-08T00:02:00.000Z");
    const executor = new TearFoundryOnlineTrainingLaunchExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader);
    const request = { curriculum: { id: "foundry-online", stages: [{ id: "movement", lessonId: "movement-foundations", scenarios: [scenario], episodeBudget: 1 }], exploration: { seed: 1, initialNumerator: 0, minimumNumerator: 0, denominator: 1, decrementEveryEpisodes: 1, decrementBy: 1 }, budgets: { maxEpisodes: 1, maxTicksPerEpisode: 4, maxTotalTicks: 4, maxTotalDecisions: 4, maxTotalAbsoluteReward: 100 } }, config: { learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 10, maxTotalUpdates: 4, maxConsecutiveDivergentUpdates: 2 } };
    const result = await executor.launch(finalized.job, finalized.receipt, request, "2026-08-08T00:03:00.000Z");
    expect(result).toMatchObject({ checkpoint: { status: "running", episodeCursor: 0 }, launch: { jobHash: finalized.job.jobHash, offlineTrainingHash: finalized.training.trainingHash } });
    const advanced = await new TearFoundryOnlineTrainingExecutionExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader).execute(finalized.job, finalized.receipt, result.launch.launchHash, "2026-08-08T00:04:00.000Z", { maxTicks: 1 });
    expect(advanced).toMatchObject({ job: { phase: "evaluating" }, receipt: { status: "running" }, launch: { previousLaunchHash: result.launch.launchHash } });
    expect((await setupResult.backend.keys("analysis")).some((key) => key.startsWith("policy-"))).toBe(false);
  });
});

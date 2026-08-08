import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  TearFoundryJobVault, TearFoundryOfflineTrainingExecutor, TearFoundryOfflineTrainingFinalizationExecutor, TearFoundryOnlineTrainingExecutionExecutor, TearFoundryOnlineTrainingFinalizationExecutor as TearFoundryOnlineTerminalizationExecutor, TearFoundryOnlineTrainingLaunchExecutor, TearFoundrySourceEvaluationPlanExecutor, TearFoundrySourceEvaluationExecutionExecutor, TearFoundryDecisionExecutor,
  TearOfflineRlTrainingVault, createTearFoundryJob, createTearFoundryJobV2, createTearOfflineRlPlan, parseTearFoundryJob, parseTearOnlineRlSourceEvaluationPlan, transitionTearFoundryJob,
  type TearAcademyCandidateCustodyStore, type TearAcademyCorpusStore, type TearAcademyTrainingDatasetLoader, type TearAcademyTrainingDatasetV1,
} from "../../src/agents";

const h = Object.freeze({ artifact: "1111111111111111", corpus: "2222222222222222", evaluation: "3333333333333333", invariant: "5555555555555555", budget: "6666666666666666", stop: "7777777777777777" });
const scenario = Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const, id: "foundry-final", version: 1, description: "foundry final", stateClass: "recorded-canonical" as const, executionClass: "training" as const, seed: "foundry-final", start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 4, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c36"] as const) });
const states = [0, 1].map((tick) => Object.freeze({ tick, input: {} as never, run: Object.freeze({ mode: "endless", wave: 1, score: tick, time: tick, seed: 7 }), player: Object.freeze({ x: 0, y: 0, vx: 0, vy: 0, hp: 100 }), blade: Object.freeze({ state: "held", x: 0, y: 0, vx: 0, vy: 0 }), enemies: Object.freeze([]) }));
const dataset = Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1, manifest: Object.freeze({ id: "foundry-final", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }), sequences: Object.freeze([Object.freeze({ candidateHash: "c".repeat(16), split: "training", lessonId: "movement-foundations", segmentKind: "demonstration", tags: Object.freeze([]), sourceScenario: scenario, tracks: Object.freeze({ observations: Object.freeze(states), actions: Object.freeze([Object.freeze({ kind: "command" as const, id: 1, tick: 1, command: Object.freeze({ type: "move" as const, x: 1_000, y: 0 }) })]), nativeEvents: Object.freeze([]), rewardComponents: Object.freeze(states.map((entry) => Object.freeze({ tick: entry.tick, value: null }))), intents: Object.freeze([]), terminal: Object.freeze({ tick: 1, semanticHash: stableVerificationHash(states[1]), terminated: true, truncated: false }) }) as never, sequenceHash: "d".repeat(16) })]), observationCount: 2, actionCount: 1, datasetHash: "e".repeat(16) }) satisfies TearAcademyTrainingDatasetV1;
const request = Object.freeze({ manifestId: "foundry-final", trainerId: "foundry", manifestVersion: 1, plan: { id: "foundry-final", version: 1, seed: 1, reward: { components: [{ id: "score", source: "score.delta" as const, weight: 1, maximumSourceValue: 10, perTransitionCap: 10 }], totalMinimum: -10, totalMaximum: 10 }, limits: { maxTransitions: 4, maxEventsPerTransition: 4, maxRewardViolations: 0 as const } } });

async function setup(config: Readonly<{ epochs: number; maxMeanAbsoluteTdError: number; maxConsecutiveDivergentEpochs: number }>, version: 1 | 2 = 1) {
  const backend = createMemoryGhostVaultBackend(), vault = new TearFoundryJobVault(backend), plan = createTearOfflineRlPlan(dataset, request.plan);
  const inputs = { champion: { id: "champion", artifactHash: h.artifact }, corpusRecordHashes: [h.corpus], evaluationPlanHash: h.evaluation, rewardDefinitionHash: plan.reward.rewardHash, invariantSetHash: h.invariant, budgetHash: h.budget, stopConditionsHash: h.stop };
  const created = version === 2 ? createTearFoundryJobV2({ id: `foundry-final-${String(config.epochs)}-${String(config.maxMeanAbsoluteTdError)}`, createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized", inputs: { ...inputs, evaluationProtocol: { version: 1, id: "c36-frozen-paired", thresholds: { minimumRewardGain: 0, requireCompletionRateNotLower: true, maxTicksPerCase: 4, maxAbsoluteRewardPerCase: 100 } } } }) : createTearFoundryJob({ id: `foundry-final-${String(config.epochs)}-${String(config.maxMeanAbsoluteTdError)}`, createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized", inputs });
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
    await expect(new TearFoundryOnlineTerminalizationExecutor(setupResult.vault).finalize(advanced.job, finalized.receipt, advanced.launch.launchHash, "2026-08-08T00:05:00.000Z")).rejects.toThrow(/incomplete/u);
    expect((await setupResult.backend.keys("analysis")).some((key) => key.startsWith("policy-"))).toBe(false);
  });

  it("rejects cancelled C30 training without a model and refuses tampered online lineage", async () => {
    const setupResult = await setup({ epochs: 1, maxMeanAbsoluteTdError: 10, maxConsecutiveDivergentEpochs: 2 }), offline = await new TearFoundryOfflineTrainingFinalizationExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader).finalize(setupResult.launched.job, setupResult.launched.launch.launchHash, "2026-08-08T00:02:00.000Z");
    const request = { curriculum: { id: "foundry-cancel", stages: [{ id: "movement", lessonId: "movement-foundations", scenarios: [scenario], episodeBudget: 1 }], exploration: { seed: 1, initialNumerator: 0, minimumNumerator: 0, denominator: 1, decrementEveryEpisodes: 1, decrementBy: 1 }, budgets: { maxEpisodes: 1, maxTicksPerEpisode: 4, maxTotalTicks: 4, maxTotalDecisions: 4, maxTotalAbsoluteReward: 100 } }, config: { learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 10, maxTotalUpdates: 4, maxConsecutiveDivergentUpdates: 2 } }, launch = await new TearFoundryOnlineTrainingLaunchExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader).launch(offline.job, offline.receipt, request, "2026-08-08T00:03:00.000Z"), execution = new TearFoundryOnlineTrainingExecutionExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader);
    await expect(execution.execute(offline.job, offline.receipt, "0".repeat(16), "2026-08-08T00:04:00.000Z")).rejects.toThrow(/lineage/u);
    const stopped = await execution.execute(offline.job, offline.receipt, launch.launch.launchHash, "2026-08-08T00:04:00.000Z", { isCancelled: () => true }), terminalizer = new TearFoundryOnlineTerminalizationExecutor(setupResult.vault), first = await terminalizer.finalize(stopped.job, offline.receipt, stopped.launch.launchHash, "2026-08-08T00:05:00.000Z"), again = await terminalizer.finalize(stopped.job, offline.receipt, stopped.launch.launchHash, "2026-08-08T00:05:00.000Z");
    expect(first).toMatchObject({ job: { phase: "rejected" }, receipt: { disposition: "online-training-stopped" } }); expect(again).toEqual(first);
  });

  it("makes a completed C30 checkpoint exactly paired-evaluation-ready", async () => {
    const setupResult = await setup({ epochs: 1, maxMeanAbsoluteTdError: 10, maxConsecutiveDivergentEpochs: 2 }), offline = await new TearFoundryOfflineTrainingFinalizationExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader).finalize(setupResult.launched.job, setupResult.launched.launch.launchHash, "2026-08-08T00:02:00.000Z");
    const request = { curriculum: { id: "foundry-complete", stages: [{ id: "movement", lessonId: "movement-foundations", scenarios: [scenario], episodeBudget: 1 }], exploration: { seed: 1, initialNumerator: 0, minimumNumerator: 0, denominator: 1, decrementEveryEpisodes: 1, decrementBy: 1 }, budgets: { maxEpisodes: 1, maxTicksPerEpisode: 4, maxTotalTicks: 4, maxTotalDecisions: 4, maxTotalAbsoluteReward: 100 } }, config: { learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 10, maxTotalUpdates: 4, maxConsecutiveDivergentUpdates: 2 } }, launch = await new TearFoundryOnlineTrainingLaunchExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader).launch(offline.job, offline.receipt, request, "2026-08-08T00:03:00.000Z"), advanced = await new TearFoundryOnlineTrainingExecutionExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader).execute(offline.job, offline.receipt, launch.launch.launchHash, "2026-08-08T00:04:00.000Z"), ready = await new TearFoundryOnlineTerminalizationExecutor(setupResult.vault).finalize(advanced.job, offline.receipt, advanced.launch.launchHash, "2026-08-08T00:05:00.000Z");
    expect(ready).toMatchObject({ job: { phase: "evaluating" }, receipt: { disposition: "ready", evaluationPlanHash: h.evaluation } });
  });

  it("derives a V2-only exact paired plan without executing or promoting it", async () => {
    const setupResult = await setup({ epochs: 1, maxMeanAbsoluteTdError: 10, maxConsecutiveDivergentEpochs: 2 }, 2), offline = await new TearFoundryOfflineTrainingFinalizationExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader).finalize(setupResult.launched.job, setupResult.launched.launch.launchHash, "2026-08-08T00:02:00.000Z");
    const request = { curriculum: { id: "foundry-derived", stages: [{ id: "movement", lessonId: "movement-foundations", scenarios: [scenario], episodeBudget: 1 }], exploration: { seed: 1, initialNumerator: 0, minimumNumerator: 0, denominator: 1, decrementEveryEpisodes: 1, decrementBy: 1 }, budgets: { maxEpisodes: 1, maxTicksPerEpisode: 4, maxTotalTicks: 4, maxTotalDecisions: 4, maxTotalAbsoluteReward: 100 } }, config: { learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 10, maxTotalUpdates: 4, maxConsecutiveDivergentUpdates: 2 } }, launch = await new TearFoundryOnlineTrainingLaunchExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader).launch(offline.job, offline.receipt, request, "2026-08-08T00:03:00.000Z"), advanced = await new TearFoundryOnlineTrainingExecutionExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader).execute(offline.job, offline.receipt, launch.launch.launchHash, "2026-08-08T00:04:00.000Z"), paired = await new TearFoundryOnlineTerminalizationExecutor(setupResult.vault).finalize(advanced.job, offline.receipt, advanced.launch.launchHash, "2026-08-08T00:05:00.000Z"), executor = new TearFoundrySourceEvaluationPlanExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader);
    const first = await executor.derive(paired.job, offline.receipt, paired.receipt, "2026-08-08T00:06:00.000Z"), again = await executor.derive(paired.job, offline.receipt, paired.receipt, "2026-08-08T00:06:00.000Z");
    expect(first).toEqual(again); expect(first).toMatchObject({ plan: { id: "c36-frozen-paired", lineage: { challengerCheckpointHash: paired.receipt.checkpointHash } }, receipt: { job: { jobHash: paired.job.jobHash } } });
    const protocol = paired.job.inputs.evaluationProtocol; if (protocol === undefined) throw new Error("V2 fixture protocol disappeared");
    expect(() => parseTearFoundryJob({ ...paired.job, inputs: { ...paired.job.inputs, evaluationProtocol: { ...protocol, thresholds: { ...protocol.thresholds, maxTicksPerCase: 3 } } } })).toThrow(/integrity/u);
    expect(() => parseTearOnlineRlSourceEvaluationPlan({ ...first.plan, thresholds: { ...first.plan.thresholds, maxTicksPerCase: 3 } })).toThrow(/integrity/u);
    const mutableCustody = setupResult.custody as unknown as { held: () => Promise<readonly unknown[]> }; mutableCustody.held = () => Promise.resolve([]);
    await expect(executor.derive(paired.job, offline.receipt, paired.receipt, "2026-08-08T00:07:00.000Z")).rejects.toThrow(/custody/u);
    mutableCustody.held = () => Promise.resolve([{ recordHash: h.corpus }]);
    const execution = await new TearFoundrySourceEvaluationExecutionExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader).execute(paired.job, offline.receipt, paired.receipt, first.receipt, "2026-08-08T00:08:00.000Z");
    expect(execution).toMatchObject({ job: { phase: "deciding" }, receipt: { disposition: "executed", planHash: first.plan.planHash } }); expect(execution.receipt.resultHash).toMatch(/^[a-f0-9]{16}$/u);
    const decision = await new TearFoundryDecisionExecutor(setupResult.vault).decide(execution.job, execution.receipt.receiptHash, "2026-08-08T00:08:30.000Z");
    expect(decision).toMatchObject({ job: { phase: "monitoring" }, receipt: { disposition: "monitoring-ready", evaluationResultHash: execution.receipt.resultHash } });
    await expect(executor.derive(paired.job, offline.receipt, paired.receipt, "2026-08-08T00:09:00.000Z")).rejects.toThrow(/current/u);
    expect((await setupResult.backend.keys("analysis")).some((key) => key.startsWith("online-rl-source-evaluation:v1:"))).toBe(true);
    expect((await setupResult.backend.keys("analysis")).some((key) => key.startsWith("policy-"))).toBe(false);
  });

  it("refuses V1 source evaluation and changed current or custody lineage", async () => {
    const setupResult = await setup({ epochs: 1, maxMeanAbsoluteTdError: 10, maxConsecutiveDivergentEpochs: 2 });
    const executor = new TearFoundrySourceEvaluationPlanExecutor(setupResult.vault, setupResult.custody, setupResult.corpus, setupResult.loader);
    await expect(executor.derive(setupResult.launched.job, {} as never, {} as never, "2026-08-08T00:06:00.000Z")).rejects.toThrow(/V1/u);
  });
});

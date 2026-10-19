import { describe, expect, it, vi } from "vitest";

import {
  TearAcademyCandidateCurationStore,
  TearAcademyCandidateCustodyStore,
  TearAcademyCandidateQualityStore,
  trainTrainingArchiveV3Candidate,
  TearFoundryJobVault,
  TearFoundryCollectionExecutor,
  TearFoundryCuratedManifestExecutor,
  TrainingOperationsV3TrainingAdmissionExecutor,
  TrainingOperationsV3EvaluationExecutor,
  TrainingOperationsV3ScheduledCycle,
  TrainingOperationsV3PromotionCycle,
  parseTearFoundryV3PromotionApprovalOrigin,
  TearFoundryJobScheduleVault,
  TearFoundryScheduledExecution,
  createTearFoundryJobSchedule,
  parseTrainingOperationsV3TrainingReceipt,
  createTearFoundryJobV2,
  createTearFoundryBudgetedJob,
  transitionTearFoundryJob,
  TearC34V3C32CandidateRegistry,
  TearC34V3C32PolicyRuntime,
  createTearC32CanonicalSourceObservation,
  type TrainingArchiveV3CandidateTrainingRequest,
  TearActivePolicyRuntime,
  TearAcademyCorpusStore,
  createTearBehaviorCloningArtifact,
  createTearBehaviorCloningBatches,
  createTearBehaviorCloningNormalization,
  evaluateTearBehaviorCloningPolicy,
  TearBehaviorCloningEvaluationVault,
  captureTearDaggerCorrections,
  TearDaggerCorrectionReviewStore,
  createTearDaggerRetrainingInput,
  trainTearBehaviorCloningPolicy,
  createTearBehaviorCloningCheckpoint,
  advanceTearBehaviorCloningCheckpoint,
  completeTearBehaviorCloningCheckpoint,
  TearBehaviorCloningCheckpointVault,
  createTearTemporalPolicyContexts,
  trainTearTemporalWindowPolicy,
  createTearTemporalPolicyCheckpoint,
  advanceTearTemporalPolicyCheckpoint,
  completeTearTemporalPolicyCheckpoint,
  TearTemporalPolicyCheckpointVault,
  TearTemporalDaggerProgramController,
  TearTemporalDaggerProgramScheduler,
  TearTemporalDaggerProgramScheduleVault,
  TearTemporalDaggerProgramOrchestrator,
  createTearTemporalDaggerProgramSchedule,
  createTearTemporalDaggerProgramPlan,
  TearTemporalDaggerProgramPlanVault,
  TearTemporalDaggerProgramRuntime,
  inspectTearTemporalDaggerPrograms,
  createTearTemporalDaggerRetrainingInput,
  createTearTemporalWindowPolicyArtifact,
  compareTemporalPolicyAgainstScriptedBaselineInProduction,
  TearTemporalPolicyBaselineComparisonVault,
  TearProductionPolicyOutcomeSuiteVault,
  TearAcademyTrainingDatasetLoader,
  TearBehaviorCloningTrainingVault,
  TearPolicyArtifactRegistry,
  TearAcademyReviewedSampleStore,
  inspectAcademy,
  TearAcademyCandidateSplitStore,
  captureAcademyCandidateTracks,
  materializeAcademyCandidateCapsule,
  type TearAcademyCandidateCapsuleMaterializationReceiptV1,
  type TearAcademyCandidateDeclarationV1,
} from "../../src/agents";
import { GhostLocalVault, createMemoryGhostVaultBackend, type GhostVaultStore } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import { parseTrainingOperationsBudget, trainingOperationsBudgetKey, trainingOperationsBudgetOwnerKey, trainingOperationsComputeBudgetHash, trainingOperationsStorageBudgetHash } from "../../src/agents/training-operations-budget";
import { trainingOperationsTrainingComputeUnits } from "../../src/agents/training-operations-compute-budget";
import { parseGhostCapsuleManifest, reviseGhostCapsuleManifest } from "../../src/ghost/capsule-contract";
import { TEAR_POLICY_CONDITION_SCHEMA_HASH_V2, TEAR_POLICY_CONDITION_WIDTH_V2 } from "../../src/agents/policy-condition-vector";
import {
  ProductionHeadlessAcademyIntake,
  createProductionHeadlessEnvironment,
  createProductionHeadlessEpisodePool,
  type ProductionHeadlessAcademyIntakeItem,
  type TearScenarioV1,
} from "../../src/tearbench";

function scenario(id = "c31-curation", seed = "c31-curation-seed", maxTicks = 2): TearScenarioV1 {
  return Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id, version: 1, description: "C31 curation evidence",
    stateClass: "recorded-canonical", executionClass: "training", seed,
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }), maxTicks,
    assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c31", "curation"] as const),
  });
}

function createAcademyHarness(backend = createMemoryGhostVaultBackend()) {
  const vault = new GhostLocalVault(backend);
  const custody = new TearAcademyCandidateCustodyStore(backend);
  const quality = new TearAcademyCandidateQualityStore(backend, custody);
  return Object.freeze({ backend, vault, custody, quality });
}

async function prepare(harness = createAcademyHarness(), fixtureId = "c31-curation", maxTicks = 2, direction = 1_000, expiresAt?: string) {
  const { backend, vault, custody, quality } = harness;
  const intake = new ProductionHeadlessAcademyIntake(1);
  await createProductionHeadlessEpisodePool(1).run([
    Object.freeze({ id: fixtureId, scenario: scenario(fixtureId, `${fixtureId}-seed`, maxTicks), maxTicks }),
  ], () => Object.freeze({ decide: () => Object.freeze([Object.freeze([{ type: "move" as const, x: direction, y: 0 }])]) }), {
    batchSize: 1, artifactConsumer: (sample) => { intake.offer(sample); },
  });
  const source = intake.take()[0];
  if (source === undefined) throw new Error("C30 source episode did not yield a candidate");
  const materialized = await materializeAcademyCandidateCapsule(source, {
    vault, capsuleId: `${fixtureId}-source`, createdAt: "2026-08-03T00:00:00.000Z", completedAt: "2026-08-03T00:00:01.000Z",
  });
  const declaration = candidateDeclaration(source, materialized);
  await custody.accept({
    declaration, materialization: materialized,
    privacyRetention: Object.freeze({ classification: "anonymous" as const, revision: "c31-curation-privacy-1",
      declaredAt: "2026-08-03T00:00:00.000Z", authorizedActorIds: Object.freeze(["academy-curator", "player"]) }),
    retention: Object.freeze(expiresAt === undefined ? { mode: "indefinite" as const } : { mode: "until" as const, expiresAt }),
    decidedAt: "2026-08-03T00:01:00.000Z", actor: "academy-curator", reason: "held for curation",
  });
  const assessment = await quality.assess({ declaration, assessedAt: "2026-08-03T00:02:00.000Z", actor: "academy-curator" });
  return Object.freeze({ backend, custody, quality, assessment, declaration });
}

function candidateDeclaration(
  source: ProductionHeadlessAcademyIntakeItem,
  materialized: TearAcademyCandidateCapsuleMaterializationReceiptV1,
): TearAcademyCandidateDeclarationV1 {
  const build = materialized.attestation.build;
  return Object.freeze({
    format: "tear-academy-candidate", schemaVersion: 1, candidate: source,
    trackBundle: captureAcademyCandidateTracks(source, materialized.attestation),
    tracks: Object.freeze({ fromTick: 0, toTick: source.tick, observationCount: source.tick + 1,
      actionEnvelopeCount: source.artifact.actions.length, eventsRecorded: true, rewardComponentsRecorded: true,
      intentsRecorded: true, buildRecorded: true, device: "semantic" as const }),
    consent: Object.freeze({ format: "tear-academy-consent", schemaVersion: 1, revision: "c31-curation-consent-1",
      decidedAt: "2026-08-03T00:00:00.000Z", localRecording: "granted" as const, cloudPublication: "denied" as const,
      analytics: "denied" as const, modelTraining: "anonymous-improvement" as const }),
    privacy: Object.freeze({ classification: "anonymous" as const }),
    provenance: Object.freeze({ actor: "scripted-bot" as const, producer: "c31-curation-test", build,
      executionClass: "training" as const, observationClass: "structured-state" as const,
      policyId: "c30-scripted", sourceId: source.episodeId, trainingConsent: "anonymous-improvement" as const }),
  });
}

describe("C31 held Academy candidate curation", () => {
  async function v3CandidateFixture(direction = 1_000, harness = createAcademyHarness(), expiresAt?: string) {
    const input = await prepare(harness, "c31-curation", 2, direction, expiresAt);
    const curation = new TearAcademyCandidateCurationStore(input.backend, input.custody, input.quality);
    await curation.decide({ candidateHash: input.assessment.candidateHash, assessmentHash: input.assessment.assessmentHash,
      disposition: "curation-approved", reviewer: "academy-curator", reviewedAt: "2026-08-03T00:03:00.000Z",
      rationale: "approved local V3 training", tags: ["baseline"], corrections: [] });
    const splits = new TearAcademyCandidateSplitStore(input.backend, input.custody, input.quality, curation);
    await splits.assign({ candidateHash: input.assessment.candidateHash, split: "training", assignedAt: "2026-08-03T00:04:00.000Z", actor: "academy-curator" });
    const samples = new TearAcademyReviewedSampleStore(input.backend, input.custody, input.quality, curation, splits);
    const sample = await samples.materialize(input.declaration, "2026-08-03T00:05:00.000Z", "academy-curator");
    const corpus = new TearAcademyCorpusStore(input.backend, input.custody, curation, splits, samples);
    await corpus.admit({ candidateHash: sample.candidateHash, lessonId: "movement-foundations", segmentKind: "demonstration",
      tags: ["baseline"], admittedAt: "2026-08-03T00:06:00.000Z", actor: "academy-curator" });
    const manifest = await corpus.publishManifest({ id: "c34-v3-governed", reader: { kind: "trainer", id: "c34-local" },
      version: 1, createdAt: "2026-08-03T00:07:00.000Z" });
    const services = { custody: input.custody, curation, corpus, loader: new TearAcademyTrainingDatasetLoader(corpus, samples) };
    const request: TrainingArchiveV3CandidateTrainingRequest = {
      dataset: { manifestId: manifest.id, trainerId: manifest.reader.id, version: manifest.version },
      manifestHash: manifest.manifestHash, manifestRootHash: manifest.rootHash,
      actor: "academy-curator", at: "2026-08-03T00:08:00.000Z", minimumRewardGain: 0,
      reward: { id: "governed-v3-reward", version: 1, seed: 7,
        reward: { components: [{ id: "score", source: "score.delta", weight: 1, maximumSourceValue: 10, perTransitionCap: 10 }],
          totalMinimum: -10, totalMaximum: 10 }, limits: { maxTransitions: 4, maxEventsPerTransition: 4, maxRewardViolations: 0 } },
      offline: { id: "governed-v3-offline", version: 1, actionVocabulary: [{ type: "move", x: direction, y: 0 }],
        config: { epochs: 1, learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 100,
          maxMeanAbsoluteTdError: 100, maxConsecutiveDivergentEpochs: 2 } },
      online: { id: "governed-v3-online", scenarios: [scenario("governed-v3-online", "unseen-v3-seed", 4)],
        config: { learningRate: 0.5, gamma: 0.9, maxTicks: 4, maxUpdates: 10, maxAbsoluteQ: 100 } },
      artifact: { id: "governed-v3-candidate", createdAt: "2026-08-03T00:08:00.000Z",
        levelTarget: "class-a", signature: { kind: "local-unsigned", keyId: "development" } },
    };
    return { input, services, request, manifest };
  }

  async function foundryV3Fixture(harness = createAcademyHarness(), expiresAt?: string, oppositeChampion = false, minimumRewardGain = 0,
    evaluationCases = [scenario("governed-v3-holdout", "heldout-champion-seed", 4)], createdOnly = false) {
    const context = await v3CandidateFixture(1_000, harness, expiresAt);
    const baselineContext = oppositeChampion ? await v3CandidateFixture(-1_000) : context;
    const baseline = await trainTrainingArchiveV3Candidate(baselineContext.services, { ...baselineContext.request,
      artifact: { ...baselineContext.request.artifact, id: "foundry-champion" } });
    await new TearC34V3C32CandidateRegistry(context.input.backend).register(baseline.candidate.artifact);
    const jobs = new TearFoundryJobVault(context.input.backend), champion = baseline.candidate.artifact;
    const created = createTearFoundryJobV2({ id: "real-c31-v3-admission", createdAt: context.request.at,
      reason: "admit governed training", inputs: { champion: { id: champion.id, artifactHash: champion.artifactHash },
        corpusRecordHashes: context.manifest.entries.map((entry) => entry.custodyRecordHash), evaluationPlanHash: stableVerificationHash(evaluationCases),
        rewardDefinitionHash: baseline.reward.reward.rewardHash, invariantSetHash: "1".repeat(16), budgetHash: "2".repeat(16), stopConditionsHash: "3".repeat(16),
        evaluationProtocol: { version: 1, id: "real-c31-v3-admission", thresholds: { minimumRewardGain, requireCompletionRateNotLower: true,
          maxTicksPerCase: 4, maxAbsoluteRewardPerCase: 100 } },
      } });
    let job = created;
    if (!createdOnly) {
      await jobs.persist(created);
      const collected = await new TearFoundryCollectionExecutor(jobs, context.services.custody).collect(created, "2026-08-03T00:08:10.000Z");
      job = (await new TearFoundryCuratedManifestExecutor(jobs, context.services.custody, context.services.corpus)
        .admit(collected.job, { id: context.manifest.id, trainerId: context.manifest.reader.id, version: context.manifest.version }, "2026-08-03T00:08:20.000Z")).job;
    }
    const request = { ...context.request, at: "2026-08-03T00:09:00.000Z" };
    return { ...context, jobs, job, request, evaluationCases, executor: new TrainingOperationsV3TrainingAdmissionExecutor(jobs, context.services) };
  }

  async function admissionOutputs(context: Awaited<ReturnType<typeof foundryV3Fixture>>) {
    const values: [GhostVaultStore, string, string | undefined][] = [];
    for (const store of ["analysis", "indexes"] as const) {
      const keys = (await context.input.backend.keys(store)).filter((key) => store === "analysis"
        ? key === `policy-artifact:v1:${context.request.artifact.id}` || key === "policy-active:v1"
          || key === `foundry-job-v3-training:v1:${context.job.jobHash}` || key === `foundry-job:v1:${context.job.id}`
          || key.startsWith(`foundry-job-event:v1:${context.job.id}:`)
        : key === `policy-artifact:${context.request.artifact.id}` || key === `foundry-job-current:${context.job.id}`
          || key.startsWith(`foundry-job-v3-training:${context.job.id}:`));
      for (const key of keys.sort()) values.push([store, key, await context.input.backend.get(store, key)]);
    }
    return values;
  }

  async function numericAdmissionFixture(maxComputeUnits: number, maxRecords = 128) {
    const memory = createMemoryGhostVaultBackend(), commitIfMatches = vi.fn(memory.commitIfMatches.bind(memory));
    const context = await foundryV3Fixture(createAcademyHarness({ ...memory, commitIfMatches }));
    const declaration = { jobId: "numeric-v3-admission", scheduleId: "explicit-local-admission", maxComputeUnits,
      maxRetainedBytes: 2_000_000, maxRecords };
    const protocol = context.job.inputs.evaluationProtocol;
    if (protocol === undefined) throw new Error("missing frozen evaluation protocol");
    const created = createTearFoundryBudgetedJob({ id: declaration.jobId, createdAt: context.request.at,
      reason: "explicit numeric admission test", inputs: { ...context.job.inputs, evaluationProtocol: protocol,
        budgetHash: stableVerificationHash(declaration) } });
    await context.jobs.persistWithBudget(created, declaration);
    const collecting = transitionTearFoundryJob(created, "collecting", context.request.at, "test allowance-bound predecessor");
    await context.jobs.persistSuccessor(created, collecting);
    const job = transitionTearFoundryJob(collecting, "curating", context.request.at, "test allowance-bound curating head");
    await context.jobs.persistSuccessor(collecting, job);
    return { ...context, job, memory, commitIfMatches, declaration };
  }

  describe("native V3 admitted candidate evaluation", () => {
    it("compares exact artifacts in fresh source worlds and retains a budgeted native decision with read-only retries and no activation", async () => {
      // Synthetic governed control corpus; this proves execution/wiring, not learned quality.
      const context = await numericAdmissionFixture(100);
      const training = await context.executor.start(context.job, context.request);
      const executor = new TrainingOperationsV3EvaluationExecutor(context.jobs, context.services);
      const sourceHash = context.job.jobHash, budgetKey = trainingOperationsBudgetKey(context.job.id);
      const trainingRaw = await context.memory.get("analysis", `foundry-job-v3-training:v1:${sourceHash}`);
      const artifactRaw = await context.memory.get("analysis", `policy-artifact:v1:${context.request.artifact.id}`);
      const admission = await executor.admit(sourceHash, "2026-08-03T00:10:00.000Z", context.evaluationCases);
      expect(admission.sourceJob).toEqual(training.job);
      expect(admission.plan.champion).toEqual(context.job.inputs.champion);
      expect(await executor.admit(sourceHash, admission.admittedAt, context.evaluationCases)).toEqual(admission);
      const execution = await executor.execute(sourceHash, "2026-08-03T00:11:00.000Z");
      expect(execution.result.traces.map((trace) => [trace.side, trace.artifactId, trace.freshWorldOrdinal])).toEqual([
        ["champion", context.job.inputs.champion.id, 1], ["challenger", context.request.artifact.id, 2],
      ]);
      expect(execution.result.traces.every((trace) => trace.decisions.length === 4 && trace.terminal.tick === 4)).toBe(true);
      expect(execution.result.traces[0]?.build).toEqual(execution.result.traces[1]?.build);
      expect(execution.result.promotional).toBe(false);
      const afterExecution = await context.memory.get("analysis", budgetKey);
      if (typeof afterExecution !== "string") throw new Error("missing evaluation allowance");
      expect(parseTrainingOperationsBudget(JSON.parse(afterExecution)).computeUsed).toBe(24);
      expect(await executor.execute(sourceHash, execution.recordedAt)).toEqual(execution);
      expect(await context.memory.get("analysis", budgetKey)).toBe(afterExecution);
      const decision = await executor.decide(sourceHash, "2026-08-03T00:12:00.000Z");
      expect(decision.disposition).toBe("monitoring-ready");
      expect(decision.job.phase).toBe("monitoring");
      expect(await context.jobs.get(context.job.id)).toEqual(decision.job);
      expect(await context.memory.get("analysis", `training-operations-v3-decision:v1:${sourceHash}`)).toBe(JSON.stringify(decision));
      const budgetBeforeRetry = await context.memory.get("analysis", budgetKey), calls = context.commitIfMatches.mock.calls.length;
      expect(await executor.decide(sourceHash, decision.decidedAt)).toEqual(decision);
      expect(context.commitIfMatches.mock.calls.slice(calls).every(([, writes]) => writes.length === 0)).toBe(true);
      expect(await context.memory.get("analysis", budgetKey)).toBe(budgetBeforeRetry);
      expect(await context.memory.get("analysis", `foundry-job-v3-training:v1:${sourceHash}`)).toBe(trainingRaw);
      expect(await context.memory.get("analysis", `policy-artifact:v1:${context.request.artifact.id}`)).toBe(artifactRaw);
      expect(await context.memory.get("analysis", "policy-active:v1")).toBeUndefined();
      expect((await context.memory.keys("analysis")).some((key) => key.startsWith("foundry-job-decision:v1:"))).toBe(false);
    });

    it("refuses source loss at the actual final comparison transaction without advancing the job or changing candidate authority", async () => {
      const context = await numericAdmissionFixture(100);
      await context.executor.start(context.job, context.request);
      const executor = new TrainingOperationsV3EvaluationExecutor(context.jobs, context.services), sourceHash = context.job.jobHash;
      const admission = await executor.admit(sourceHash, "2026-08-03T00:10:00.000Z", context.evaluationCases);
      const resultKey = `foundry-job-v3-evaluation-execution:v1:${sourceHash}`, budgetKey = trainingOperationsBudgetKey(context.job.id);
      let before: Awaited<ReturnType<typeof admissionOutputs>> | undefined, chargedBudget: string | undefined, finalCommits = 0;
      context.commitIfMatches.mockImplementation(async (guards, writes) => {
        if (writes.some((write) => write.key === resultKey)) {
          finalCommits++;
          before = await admissionOutputs(context);
          chargedBudget = await context.memory.get("analysis", budgetKey);
          const source = guards.find((guard) => guard.store === "manifests" && guard.expected !== undefined);
          if (source === undefined) throw new Error("missing actual source manifest guard");
          await context.memory.remove(source.store, source.key);
        }
        await context.memory.commitIfMatches(guards, writes);
      });
      await expect(executor.execute(sourceHash, "2026-08-03T00:11:00.000Z")).rejects.toThrow();
      expect(finalCommits).toBe(1);
      expect(await admissionOutputs(context)).toEqual(before);
      expect(await context.jobs.get(context.job.id)).toEqual(admission.job);
      expect(await context.memory.get("analysis", resultKey)).toBeUndefined();
      expect(await context.memory.get("analysis", `training-operations-v3-decision:v1:${sourceHash}`)).toBeUndefined();
      expect(await context.memory.get("analysis", budgetKey)).toBe(chargedBudget);
      if (typeof chargedBudget !== "string") throw new Error("missing charged evaluation allowance");
      expect(parseTrainingOperationsBudget(JSON.parse(chargedBudget)).computeUsed).toBe(24);
      expect(await context.memory.get("analysis", "policy-active:v1")).toBeUndefined();
    });
  });

  describe("native V3 scheduled continuation", () => {
    async function scheduledFixture() {
      const context = await numericAdmissionFixture(100), training = await context.executor.start(context.job, context.request);
      const schedules = new TearFoundryJobScheduleVault(context.input.backend);
      const schedule = createTearFoundryJobSchedule({ id: context.declaration.scheduleId, jobId: training.job.id, jobHash: training.job.jobHash,
        intervalMs: 60_000, computeBudgetHash: trainingOperationsComputeBudgetHash(context.declaration),
        storageBudgetHash: trainingOperationsStorageBudgetHash(context.declaration), stopConditionsHash: training.job.inputs.stopConditionsHash,
        state: "disabled", configuredAt: "2026-08-03T00:10:00.000Z" });
      const cycle = () => new TrainingOperationsV3ScheduledCycle(context.jobs, schedules, context.services);
      const execute = () => new TearFoundryScheduledExecution(context.jobs, schedules, context.services.custody, context.services.corpus, context.services.loader, context.services);
      return { ...context, training, schedules, schedule, cycle, execute };
    }

    it("adopts the exact training receipt and schedules native evaluation through reload, exact retries and an inactive decision", async () => {
      const context = await scheduledFixture(), { training, schedule } = context;
      const adopted = await context.cycle().adoptAndEnable(schedule, context.job.jobHash, training.receiptHash, context.evaluationCases, schedule.configuredAt);
      expect(adopted.binding).toMatchObject({ step: "admit", previousBindingHash: null,
        admittedTraining: { receiptHash: training.receiptHash, jobHash: training.job.jobHash } });
      expect(await context.jobs.get(training.job.id)).toEqual(training.job);
      expect(await context.cycle().adoptAndEnable(schedule, context.job.jobHash, training.receiptHash, context.evaluationCases, schedule.configuredAt)).toEqual(adopted);
      const firstSchedule = adopted.schedule;
      let activeSchedule = firstSchedule;
      let first: Awaited<ReturnType<TearFoundryScheduledExecution["runScheduledOnce"]>> | undefined;
      for (const [minute, phase, step] of [[11, "evaluating", "execute"], [12, "deciding", "decide"], [13, "monitoring", "awaiting-promotion"]] as const) {
        const source = activeSchedule, at = `2026-08-03T00:${String(minute)}:00.000Z`, lease = `native-${String(minute)}`;
        const output = await context.execute().runScheduledOnce(source.scheduleHash, at, lease);
        first ??= output;
        expect(output.phase).toBe(phase);
        const rawBudget = await context.memory.get("analysis", trainingOperationsBudgetKey(context.job.id));
        const calls = context.commitIfMatches.mock.calls.length;
        expect(await context.execute().runScheduledOnce(source.scheduleHash, at, lease)).toEqual(output);
        expect(context.commitIfMatches.mock.calls.slice(calls).every(([, writes]) => writes.length === 0)).toBe(true);
        expect(await context.memory.get("analysis", trainingOperationsBudgetKey(context.job.id))).toBe(rawBudget);
        const current = await context.schedules.get(schedule.id);
        if (current === undefined) throw new Error("native current schedule missing");
        activeSchedule = current;
        expect((await context.cycle().current(current))?.step).toBe(step);
      }
      // A completed earlier wake is still an exact read-only result after later native phases.
      expect(await context.execute().runScheduledOnce(firstSchedule.scheduleHash, "2026-08-03T00:11:00.000Z", "native-11")).toEqual(first);
      expect(activeSchedule.state).toBe("disabled");
      await expect(context.cycle().setEnabledByHash(activeSchedule.scheduleHash, true, "2026-08-03T00:14:00.000Z")).rejects.toThrow(/authorized/u);
      const budget = await context.memory.get("analysis", trainingOperationsBudgetKey(context.job.id));
      if (budget === undefined) throw new Error("native budget missing");
      expect(parseTrainingOperationsBudget(JSON.parse(budget)).computeUsed).toBe(24);
      expect(await context.memory.get("analysis", `foundry-job-v3-training:v1:${context.job.jobHash}`)).toBe(JSON.stringify(training));
      expect((await context.jobs.get(context.job.id))?.events.slice(0, training.job.events.length)).toEqual(training.job.events);
      expect(await context.memory.get("analysis", `training-operations-v3-decision:v1:${context.job.jobHash}`)).toBeDefined();
      expect(await context.memory.get("analysis", "policy-active:v1")).toBeUndefined();
    });

    it("refuses late binding drift at the native successor CAS without advancing schedule, job or candidate authority", async () => {
      const context = await scheduledFixture(), adopted = await context.cycle().adoptAndEnable(context.schedule, context.job.jobHash,
        context.training.receiptHash, context.evaluationCases, context.schedule.configuredAt);
      const pointerKey = `training-operations-execution-binding-current:v6:${adopted.schedule.id}:${String(adopted.schedule.revision)}:${adopted.schedule.scheduleHash}`;
      const receiptKey = `foundry-job-v3-evaluation-admission:v1:${context.job.jobHash}`;
      const bindingKeys = (await context.memory.keys("analysis")).filter((key) => key.startsWith("training-operations-execution-binding:v6:"));
      const outputs = await admissionOutputs(context);
      let finalAttempts = 0;
      context.commitIfMatches.mockImplementation(async (guards, writes) => {
        if (writes.some((write) => write.key === receiptKey)) {
          finalAttempts++;
          await context.memory.put("analysis", pointerKey, "f".repeat(16));
        }
        await context.memory.commitIfMatches(guards, writes);
      });
      await expect(context.execute().runScheduledOnce(adopted.schedule.scheduleHash, "2026-08-03T00:11:00.000Z", "late-binding")).rejects.toThrow();
      expect(finalAttempts).toBe(1);
      expect(await admissionOutputs(context)).toEqual(outputs);
      expect(await context.schedules.get(adopted.schedule.id)).toEqual(adopted.schedule);
      expect(await context.memory.get("analysis", receiptKey)).toBeUndefined();
      expect((await context.memory.keys("analysis")).filter((key) => key.startsWith("training-operations-execution-binding:v6:"))).toEqual(bindingKeys);
      expect(await context.memory.get("analysis", pointerKey)).toBe("f".repeat(16));
      expect(await context.memory.get("analysis", `training-operations-scheduled-attempt:v1:${adopted.schedule.scheduleHash}`)).toBeUndefined();
    });
  });

  describe("native V3 explicit promotion", () => {
    async function promotionFixture() {
      const context = await numericAdmissionFixture(100);
      const champion = await new TearC34V3C32CandidateRegistry(context.input.backend).get(context.job.inputs.champion.id);
      if (champion === undefined) throw new Error("missing compatible champion");
      const registry = new TearPolicyArtifactRegistry(context.input.backend, champion.compatibility);
      const baseline = await registry.activate(champion.id, "2026-08-03T00:08:00.000Z");
      const training = await context.executor.start(context.job, context.request);
      const schedules = new TearFoundryJobScheduleVault(context.input.backend);
      const declared = createTearFoundryJobSchedule({ id: context.declaration.scheduleId, jobId: training.job.id, jobHash: training.job.jobHash,
        intervalMs: 60_000, computeBudgetHash: trainingOperationsComputeBudgetHash(context.declaration),
        storageBudgetHash: trainingOperationsStorageBudgetHash(context.declaration), stopConditionsHash: training.job.inputs.stopConditionsHash,
        state: "disabled", configuredAt: "2026-08-03T00:10:00.000Z" });
      const cycle = new TrainingOperationsV3ScheduledCycle(context.jobs, schedules, context.services);
      let schedule = (await cycle.adoptAndEnable(declared, context.job.jobHash, training.receiptHash, context.evaluationCases, declared.configuredAt)).schedule;
      const execution = new TearFoundryScheduledExecution(context.jobs, schedules, context.services.custody, context.services.corpus, context.services.loader, context.services);
      for (const minute of [11, 12, 13]) {
        await execution.runScheduledOnce(schedule.scheduleHash, `2026-08-03T00:${String(minute)}:00.000Z`, `promotion-${String(minute)}`);
        const next = await schedules.get(schedule.id);
        if (next === undefined) throw new Error("missing native schedule");
        schedule = next;
      }
      const promotion = () => new TrainingOperationsV3PromotionCycle(context.jobs, schedules, context.services);
      return { ...context, baseline, training, schedules, schedule, cycle, promotion };
    }
    it("promotes only an explicit native intent and retains one activation with exact read-only retries", async () => {
      const context = await promotionFixture(), at = "2026-08-03T00:14:00.000Z";
      expect(context.schedule.state).toBe("disabled");
      expect(await context.memory.get("analysis", "policy-active:v1")).toBe(JSON.stringify(context.baseline));
      const prepared = await context.promotion().prepare(context.schedule.scheduleHash, at);
      await expect(context.promotion().promote(context.schedule.scheduleHash, "", at)).rejects.toThrow(/intent/u);
      await expect(context.promotion().promote(context.schedule.scheduleHash, "f".repeat(16), at)).rejects.toThrow(/intent/u);
      expect(await context.memory.get("analysis", "policy-active:v1")).toBe(JSON.stringify(context.baseline));
      const calls = context.commitIfMatches.mock.calls.length;
      const result = await context.promotion().promote(context.schedule.scheduleHash, prepared.intent.intentHash, at);
      expect(result).toMatchObject({ artifactId: context.request.artifact.id, revision: context.baseline.revision + 1 });
      expect(context.commitIfMatches.mock.calls.slice(calls).filter(([, writes]) => writes.some((write) => write.key === "policy-active:v1"))).toHaveLength(1);
      const active = await context.memory.get("analysis", "policy-active:v1");
      const raw = await context.memory.get("analysis", `foundry-job-v3-promotion-approval:v1:${result.approvalHash}`);
      if (raw === undefined) throw new Error("missing native approval");
      const approval = parseTearFoundryV3PromotionApprovalOrigin(JSON.parse(raw));
      expect(approval.format).toBe("training-operations-v3-native-promotion-approval");
      expect(Object.hasOwn(approval, "bridge")).toBe(false);
      expect(approval.rollbackBaseline?.activationHash).toBe(context.baseline.activationHash);
      expect(approval.conditions.approverFree).toBe(true);
      expect((await context.cycle.current(context.schedule))?.step).toBe("promoted");
      const budget = await context.memory.get("analysis", trainingOperationsBudgetKey(context.job.id));
      if (budget === undefined) throw new Error("missing promotion ledger");
      const ledger = parseTrainingOperationsBudget(JSON.parse(budget));
      expect(ledger.computeUsed).toBe(24);
      expect(ledger.records.some((record) => record.key === "policy-active:v1" || record.key.startsWith("policy-activation:"))).toBe(false);
      const beforeRetry = context.commitIfMatches.mock.calls.length;
      expect(await context.promotion().promote(context.schedule.scheduleHash, prepared.intent.intentHash, at)).toEqual(result);
      expect(context.commitIfMatches.mock.calls.slice(beforeRetry).every(([, writes]) => writes.length === 0)).toBe(true);
      expect(await context.memory.get("analysis", "policy-active:v1")).toBe(active);
      expect(await context.memory.get("analysis", trainingOperationsBudgetKey(context.job.id))).toBe(budget);
      expect((await context.jobs.get(context.job.id))?.phase).toBe("monitoring");
      expect((await context.memory.keys("analysis")).some((key) => key.startsWith("foundry-job-v3-monitoring-bridge:") || key.startsWith("foundry-job-decision:v1:"))).toBe(false);
    });
    it("refuses late source binding drift at activation CAS without partial job, receipt, binding or budget writes", async () => {
      const context = await promotionFixture(), at = "2026-08-03T00:14:00.000Z";
      const prepared = await context.promotion().prepare(context.schedule.scheduleHash, at);
      const pointer = `training-operations-execution-binding-current:v6:${context.schedule.id}:${String(context.schedule.revision)}:${context.schedule.scheduleHash}`;
      const snapshot = async () => {
        const rows: [string, string, string | undefined][] = [];
        for (const store of ["analysis", "indexes"] as const) for (const key of [...await context.memory.keys(store)].sort()) {
          if (key !== pointer) rows.push([store, key, await context.memory.get(store, key)]);
        }
        return rows;
      };
      const before = await snapshot();
      let final = 0;
      context.commitIfMatches.mockImplementation(async (guards, writes) => {
        if (writes.some((write) => write.key === "policy-active:v1")) { final++; await context.memory.put("analysis", pointer, "f".repeat(16)); }
        await context.memory.commitIfMatches(guards, writes);
      });
      await expect(context.promotion().promote(context.schedule.scheduleHash, prepared.intent.intentHash, at)).rejects.toThrow();
      expect(final).toBe(1);
      expect(await snapshot()).toEqual(before);
      expect(await context.memory.get("analysis", pointer)).toBe("f".repeat(16));
    });
  });

  it("charges attempted training before the final transaction, retains no output on failure, and retries within its numeric allowance", async () => {
    const context = await numericAdmissionFixture(32), units = trainingOperationsTrainingComputeUnits(context.request);
    expect(units).toBe(16);
    const key = trainingOperationsBudgetKey(context.job.id);
    const initial = await context.memory.get("analysis", key);
    if (initial === undefined) throw new Error("missing numeric allowance fixture");
    const initialBudget = parseTrainingOperationsBudget(JSON.parse(initial));
    let before: Awaited<ReturnType<typeof admissionOutputs>> | undefined, finalAttempts = 0;
    context.commitIfMatches.mockImplementation(async (guards, writes) => {
      if (writes.some((write) => write.key === `policy-artifact:v1:${context.request.artifact.id}`)) {
        finalAttempts += 1;
        before = await admissionOutputs(context);
        throw new Error("final candidate transaction interrupted");
      }
      await context.memory.commitIfMatches(guards, writes);
    });
    await expect(context.executor.start(context.job, context.request)).rejects.toThrow(/final candidate transaction/u);
    expect(finalAttempts).toBe(1);
    expect(await admissionOutputs(context)).toEqual(before);
    const spent = await context.memory.get("analysis", key);
    if (spent === undefined) throw new Error("missing charged allowance");
    const afterFailure = parseTrainingOperationsBudget(JSON.parse(spent));
    expect(afterFailure.computeUsed).toBe(units);
    expect(afterFailure.records).toEqual(initialBudget.records);
    expect(afterFailure.retainedBytes).toBe(initialBudget.retainedBytes);
    context.commitIfMatches.mockImplementation(context.memory.commitIfMatches.bind(context.memory));
    const receipt = await context.executor.start(context.job, context.request);
    expect(receipt.job.phase).toBe("training");
    const admitted = await context.memory.get("analysis", key);
    if (admitted === undefined) throw new Error("missing admitted allowance");
    const budget = parseTrainingOperationsBudget(JSON.parse(admitted));
    expect(budget.computeUsed).toBe(2 * units);
    expect(budget.records).toContainEqual(expect.objectContaining({ store: "analysis", key: `policy-artifact:v1:${context.request.artifact.id}` }));
    expect(budget.records).toContainEqual(expect.objectContaining({ store: "indexes", key: `foundry-job-v3-training:${context.job.id}:${receipt.receiptHash}` }));
    expect(await context.executor.start(context.job, context.request)).toEqual(receipt);
    expect(await context.memory.get("analysis", key)).toBe(admitted);
    expect(await context.memory.get("analysis", "policy-active:v1")).toBeUndefined();
    const retainedOutputs = await admissionOutputs(context);
    await context.memory.remove("analysis", key);
    await context.memory.remove("analysis", trainingOperationsBudgetOwnerKey(context.job.id));
    await expect(context.executor.start(context.job, context.request)).rejects.toThrow(/budget authority/u);
    expect(await admissionOutputs(context)).toEqual(retainedOutputs);
  });

  it("refuses exhausted compute and storage allowances without advancing a numeric job", async () => {
    const exhausted = await numericAdmissionFixture(15), load = vi.spyOn(exhausted.services.loader, "load");
    const before = await admissionOutputs(exhausted);
    await expect(exhausted.executor.start(exhausted.job, exhausted.request)).rejects.toThrow(/compute budget/u);
    expect(load).not.toHaveBeenCalled();
    expect(await admissionOutputs(exhausted)).toEqual(before);
    const bounded = await numericAdmissionFixture(32, 6), boundedBefore = await admissionOutputs(bounded);
    await expect(bounded.executor.start(bounded.job, bounded.request)).rejects.toThrow(/storage budget/u);
    expect(await admissionOutputs(bounded)).toEqual(boundedBefore);
    const raw = await bounded.memory.get("analysis", trainingOperationsBudgetKey(bounded.job.id));
    if (raw === undefined) throw new Error("missing failed attempt allowance");
    expect(parseTrainingOperationsBudget(JSON.parse(raw)).computeUsed).toBe(16);
  });

  it("refuses a numeric job whose ledger and owner are both removed", async () => {
    const context = await numericAdmissionFixture(32), before = await admissionOutputs(context);
    await context.memory.remove("analysis", trainingOperationsBudgetKey(context.job.id));
    await context.memory.remove("analysis", trainingOperationsBudgetOwnerKey(context.job.id));
    await expect(context.executor.start(context.job, context.request)).rejects.toThrow(/budget authority/u);
    expect(await admissionOutputs(context)).toEqual(before);
    expect(await context.jobs.get(context.job.id)).toEqual(context.job);
  });

  it.each(["orphan", "late-drift"] as const)("refuses a legacy admission receipt index with %s ownership", async (kind) => {
    const reference = await foundryV3Fixture(), receipt = await reference.executor.start(reference.job, reference.request);
    const memory = createMemoryGhostVaultBackend(), commitIfMatches = vi.fn(memory.commitIfMatches.bind(memory));
    const context = await foundryV3Fixture(createAcademyHarness({ ...memory, commitIfMatches }));
    expect(context.job).toEqual(reference.job);
    const key = `foundry-job-v3-training:${context.job.id}:${receipt.receiptHash}`, foreign = "foreign-receipt-index";
    if (kind === "orphan") await memory.put("indexes", key, foreign);
    let before = await admissionOutputs(context), finalAttempts = 0;
    commitIfMatches.mockImplementation(async (guards, writes) => {
      if (writes.some((write) => write.key === `policy-artifact:v1:${context.request.artifact.id}`)) {
        finalAttempts += 1;
        await memory.put("indexes", key, foreign);
        before = await admissionOutputs(context);
      }
      await memory.commitIfMatches(guards, writes);
    });
    await expect(context.executor.start(context.job, context.request)).rejects.toThrow(/authority bytes changed|conditional/u);
    expect(finalAttempts).toBe(kind === "orphan" ? 0 : 1);
    expect(await memory.get("indexes", key)).toBe(foreign);
    expect(await admissionOutputs(context)).toEqual(before);
    expect(await context.jobs.get(context.job.id)).toEqual(context.job);
  });

  it("requires the legacy initial job and index to remain one exact pair", async () => {
    const context = await foundryV3Fixture(), memory = context.input.backend;
    const protocol = context.job.inputs.evaluationProtocol;
    if (protocol === undefined) throw new Error("missing frozen protocol fixture");
    const created = createTearFoundryJobV2({ id: "legacy-initial-pair", inputs: { ...context.job.inputs, evaluationProtocol: protocol },
      createdAt: context.request.at, reason: "exact initial record pair" });
    const key = `foundry-job:${created.id}:${created.jobHash}`;
    await memory.put("indexes", key, "orphan-index");
    await expect(context.jobs.persist(created)).rejects.toThrow(/conditional/u);
    expect(await memory.get("analysis", `foundry-job:v1:${created.id}`)).toBeUndefined();
    expect(await memory.get("indexes", key)).toBe("orphan-index");
    await memory.remove("indexes", key);
    expect(await Promise.all([context.jobs.persist(created), context.jobs.persist(created)])).toEqual([created, created]);
    const exact = await memory.get("indexes", key);
    if (exact === undefined) throw new Error("missing initial index");
    for (const replacement of [undefined, "mismatched-index"]) {
      if (replacement === undefined) await memory.remove("indexes", key);
      else await memory.put("indexes", key, replacement);
      await expect(context.jobs.persist(created)).rejects.toThrow(/conditional/u);
      expect(await context.jobs.get(created.id)).toEqual(created);
      expect(await memory.get("indexes", key)).toBe(replacement);
    }
    await memory.put("indexes", key, exact);
    expect(await context.jobs.persist(created)).toEqual(created);
  });

  it("refuses initial legacy index drift at its actual job creation transaction", async () => {
    const memory = createMemoryGhostVaultBackend(), commitIfMatches = vi.fn(memory.commitIfMatches.bind(memory));
    const context = await foundryV3Fixture(createAcademyHarness({ ...memory, commitIfMatches }));
    const protocol = context.job.inputs.evaluationProtocol;
    if (protocol === undefined) throw new Error("missing frozen protocol fixture");
    const job = createTearFoundryJobV2({ id: "late-initial-index", inputs: { ...context.job.inputs, evaluationProtocol: protocol },
      createdAt: context.request.at, reason: "late initial pair race" });
    const indexKey = `foundry-job:${job.id}:${job.jobHash}`;
    let reached = false;
    commitIfMatches.mockImplementation(async (guards, writes) => {
      if (writes.some((write) => write.key === `foundry-job:v1:${job.id}`)) {
        reached = true;
        await memory.put("indexes", indexKey, "concurrent-index-owner");
      }
      await memory.commitIfMatches(guards, writes);
    });
    await expect(context.jobs.persist(job)).rejects.toThrow(/conditional/u);
    expect(reached).toBe(true);
    expect(await context.jobs.get(job.id)).toBeUndefined();
    expect(await memory.get("indexes", indexKey)).toBe("concurrent-index-owner");
  });

  it.each([["event", "foreign-event-owner"], ["current-index", "malformed-current-index"],
    ["current-index", JSON.stringify({ jobHash: "f".repeat(16), phase: "training" })]] as const)(
    "refuses an orphan or late legacy successor %s slot containing %s", async (slot, foreign) => {
    for (const timing of ["existing", "late"] as const) {
      const memory = createMemoryGhostVaultBackend(), commitIfMatches = vi.fn(memory.commitIfMatches.bind(memory));
      const context = await foundryV3Fixture(createAcademyHarness({ ...memory, commitIfMatches }));
      const next = transitionTearFoundryJob(context.job, "training", context.request.at, "test exact legacy successor slots");
      const event = next.events.at(-1);
      if (event === undefined) throw new Error("missing successor event fixture");
      const store = slot === "event" ? "analysis" : "indexes";
      const key = slot === "event" ? `foundry-job-event:v1:${next.id}:${String(event.sequence)}:${event.eventHash}`
        : `foundry-job-current:${next.id}`;
      if (timing === "existing") await memory.put(store, key, foreign);
      let before = await admissionOutputs(context), finalTransactions = 0;
      commitIfMatches.mockImplementation(async (guards, writes) => {
        if (writes.some((write) => write.key === `foundry-job:v1:${next.id}` && write.value === JSON.stringify(next))) {
          finalTransactions += 1;
          await memory.put(store, key, foreign);
          before = await admissionOutputs(context);
        }
        await memory.commitIfMatches(guards, writes);
      });
      await expect(context.jobs.persistSuccessor(context.job, next)).rejects.toThrow(/already owned|exact previous head|conditional/u);
      expect(finalTransactions).toBe(timing === "existing" ? 0 : 1);
      expect(await memory.get(store, key)).toBe(foreign);
      expect(await admissionOutputs(context)).toEqual(before);
      expect(await context.jobs.get(context.job.id)).toEqual(context.job);
    }
  });

  it.each(["absent", "previous"] as const)("advances a healthy legacy successor with its current index %s and verifies exact retry side records", async (currentIndex) => {
    const context = await foundryV3Fixture(), backend = context.input.backend;
    const next = transitionTearFoundryJob(context.job, "training", context.request.at, "healthy legacy successor slots");
    const indexKey = `foundry-job-current:${next.id}`;
    if (currentIndex === "absent") await backend.remove("indexes", indexKey);
    expect(await context.jobs.persistSuccessor(context.job, next)).toEqual(next);
    expect(await context.jobs.persistSuccessor(context.job, next)).toEqual(next);
    const event = next.events.at(-1);
    if (event === undefined) throw new Error("missing healthy successor event");
    const eventKey = `foundry-job-event:v1:${next.id}:${String(event.sequence)}:${event.eventHash}`;
    expect(await backend.get("analysis", eventKey)).toBe(JSON.stringify(event));
    await backend.remove("analysis", eventKey);
    await expect(context.jobs.persistSuccessor(context.job, next)).rejects.toThrow(/conditional/u);
    await backend.put("analysis", eventKey, JSON.stringify(event));
    await backend.put("indexes", indexKey, "foreign-after-success");
    await expect(context.jobs.persistSuccessor(context.job, next)).rejects.toThrow(/conditional/u);
    expect(await context.jobs.get(next.id)).toEqual(next);
  });

  it("refuses an extra write that replaces the helper-owned successor event", async () => {
    const context = await foundryV3Fixture();
    const next = transitionTearFoundryJob(context.job, "training", context.request.at, "protected helper-owned event");
    const event = next.events.at(-1);
    if (event === undefined) throw new Error("missing protected event fixture");
    const before = await admissionOutputs(context);
    await expect(context.jobs.persistSuccessor(context.job, next, [{ store: "analysis",
      key: `foundry-job-event:v1:${next.id}:${String(event.sequence)}:${event.eventHash}`, value: "injected-event" }]))
      .rejects.toThrow(/cannot replace durable job state/u);
    expect(await admissionOutputs(context)).toEqual(before);
    expect(await context.jobs.get(context.job.id)).toEqual(context.job);
  });

  it.each(["event", "current-index"] as const)("refuses an admission retry with missing or foreign %s bytes", async (slot) => {
    const context = await foundryV3Fixture(), receipt = await context.executor.start(context.job, context.request);
    const event = receipt.job.events.at(-1);
    if (event === undefined) throw new Error("missing admitted event fixture");
    const store = slot === "event" ? "analysis" : "indexes";
    const key = slot === "event" ? `foundry-job-event:v1:${receipt.job.id}:${String(event.sequence)}:${event.eventHash}`
      : `foundry-job-current:${receipt.job.id}`;
    const exact = await context.input.backend.get(store, key);
    if (exact === undefined) throw new Error("missing admitted side record");
    for (const value of [undefined, "foreign-admitted-side-record"]) {
      if (value === undefined) await context.input.backend.remove(store, key);
      else await context.input.backend.put(store, key, value);
      const before = await admissionOutputs(context);
      await expect(context.executor.start(context.job, context.request)).rejects.toThrow(/conditional/u);
      expect(await admissionOutputs(context)).toEqual(before);
      expect(await context.jobs.get(context.job.id)).toEqual(receipt.job);
    }
    await context.input.backend.put(store, key, exact);
    expect(await context.executor.start(context.job, context.request)).toEqual(receipt);
  });

  it.each(["source-disappearance", "manifest-revision", "chunk-bytes", "custody-revision", "consent-revocation", "curation-decision"] as const)(
    "refuses %s at the final candidate transaction without retaining any output or progression", async (drift) => {
      const memory = createMemoryGhostVaultBackend(), commitIfMatches = vi.fn(memory.commitIfMatches.bind(memory));
      const context = await foundryV3Fixture(createAcademyHarness({ ...memory, commitIfMatches }));
      const load = vi.spyOn(context.services.loader, "load");
      const custody = await context.input.custody.get(context.input.assessment.candidateHash);
      if (custody === undefined) throw new Error("missing final-transaction custody fixture");
      const sourceId = custody.source.capsuleRange.capsuleId;
      let finalTransactions = 0, before: Awaited<ReturnType<typeof admissionOutputs>> | undefined;
      commitIfMatches.mockImplementation(async (guards, writes) => {
        if (writes.some((write) => write.store === "analysis" && write.key === `policy-artifact:v1:${context.request.artifact.id}`)) {
          finalTransactions += 1;
          before = await admissionOutputs(context);
          if (drift === "source-disappearance") await memory.remove("manifests", sourceId);
          else if (drift === "manifest-revision" || drift === "chunk-bytes") {
            const raw = await memory.get("manifests", sourceId);
            if (raw === undefined) throw new Error("missing retained source manifest");
            const manifest = parseGhostCapsuleManifest(JSON.parse(raw));
            if (drift === "manifest-revision") {
              const revised = reviseGhostCapsuleManifest(manifest, { completedAt: "2026-08-03T00:09:00.000Z" });
              expect(revised.rootIntegrity).toBe(manifest.rootIntegrity);
              expect(parseGhostCapsuleManifest(revised)).toEqual(revised);
              await memory.put("manifests", sourceId, JSON.stringify(revised));
            } else {
              const chunk = manifest.chunks[0];
              if (chunk === undefined) throw new Error("missing retained source chunk");
              const encoded = await memory.get("chunks", chunk.id);
              if (encoded === undefined) throw new Error("missing retained source bytes");
              await memory.put("chunks", chunk.id, `${encoded}changed`);
            }
          } else if (drift === "consent-revocation") {
            await context.input.custody.revoke({ candidateHash: custody.candidateHash, scope: "model-training",
              consent: { ...custody.consent, revision: "withdrawn-at-final-cas", modelTraining: "no-training" },
              decidedAt: context.request.at, actor: context.request.actor, reason: "withdrawn before durable admission" });
          } else if (drift === "custody-revision") {
            const { recordHash, ...draft } = custody; void recordHash;
            const revised = { ...draft, privacyRetention: { ...draft.privacyRetention, revision: "changed-at-final-cas" } };
            await memory.put("analysis", `academy-candidate-custody:v1:${custody.candidateHash}`,
              JSON.stringify({ ...revised, recordHash: stableVerificationHash(revised) }));
            expect((await context.input.custody.get(custody.candidateHash))?.privacyRetention.revision).toBe("changed-at-final-cas");
          } else {
            const approval = await context.services.curation.get(custody.candidateHash);
            if (approval === undefined) throw new Error("missing curation fixture");
            const { decisionHash, ...draft } = approval; void decisionHash;
            const revised = { ...draft, rationale: "approval revised at final candidate transaction" };
            await memory.put("analysis", `academy-candidate-curation:v1:${custody.candidateHash}`,
              JSON.stringify({ ...revised, decisionHash: stableVerificationHash(revised) }));
            expect((await context.services.curation.get(custody.candidateHash))?.rationale).toBe(revised.rationale);
          }
        }
        await memory.commitIfMatches(guards, writes);
      });
      await expect(context.executor.start(context.job, context.request)).rejects.toThrow(/conditional/u);
      expect(finalTransactions).toBe(1);
      expect(load).toHaveBeenCalledOnce();
      expect(before).toBeDefined();
      expect(await admissionOutputs(context)).toEqual(before);
      expect(await context.jobs.get(context.job.id)).toEqual(context.job);
      expect(await context.executor.get(context.job.jobHash)).toBeUndefined();
      expect(await memory.get("analysis", `policy-artifact:v1:${context.request.artifact.id}`)).toBeUndefined();
      expect(await memory.get("indexes", `policy-artifact:${context.request.artifact.id}`)).toBeUndefined();
      expect(await memory.get("analysis", "policy-active:v1")).toBeUndefined();
    });

  it("rejects nested raw-track extensions before governed V3 training can retain them", async () => {
    const context = await v3CandidateFixture();
    const extensions = { rawTracks: [{ observations: [{ tick: 1 }] }] };
    const requests = [
      { ...context.request, offline: { ...context.request.offline, config: { ...context.request.offline.config, extensions } } },
      { ...context.request, online: { ...context.request.online, config: { ...context.request.online.config, extensions } } },
      { ...context.request, online: { ...context.request.online, scenarios: context.request.online.scenarios.map((entry) => ({ ...entry, extensions })) } },
      { ...context.request, dataset: { ...context.request.dataset, extensions } },
    ];
    const before = await context.input.backend.keys("analysis");
    for (const request of requests) await expect(trainTrainingArchiveV3Candidate(context.services, request)).rejects.toThrow(/derived evidence forbids extension/u);
    expect(await context.input.backend.keys("analysis")).toEqual(before);
  });

  it("atomically admits real C31 V3 training, an inactive candidate and the legal Foundry successor", async () => {
    const context = await foundryV3Fixture(), receipt = await context.executor.start(context.job, context.request);
    expect(receipt.job.phase).toBe("training");
    expect(await context.jobs.get(context.job.id)).toEqual(receipt.job);
    expect(await context.executor.get(context.job.jobHash)).toEqual(receipt);
    expect(parseTrainingOperationsV3TrainingReceipt(JSON.parse(JSON.stringify(receipt)))).toEqual(receipt);
    expect(await context.executor.start(context.job, context.request)).toEqual(receipt);
    expect(receipt.evidence).not.toHaveProperty("dataset");
    expect(receipt.evidence).not.toHaveProperty("trajectories");
    expect(await new TearC34V3C32CandidateRegistry(context.input.backend).get(context.request.artifact.id)).toEqual(receipt.evidence.candidate.artifact);
    expect(await context.input.backend.get("analysis", "policy-active:v1")).toBeUndefined();
    const corrupt = { ...receipt, evidence: { ...receipt.evidence, lineage: { ...receipt.evidence.lineage, datasetHash: "f".repeat(16) } } };
    expect(() => parseTrainingOperationsV3TrainingReceipt(corrupt)).toThrow(/integrity/u);
    const { receiptHash, ...draft } = corrupt; void receiptHash;
    expect(() => parseTrainingOperationsV3TrainingReceipt({ ...draft, receiptHash: stableVerificationHash(draft) })).toThrow(/lineage/u);
    const { receiptHash: ignored, ...original } = receipt; void ignored;
    const nestedTracks = { ...original, evidence: { ...original.evidence, request: { ...original.evidence.request,
      offline: { ...original.evidence.request.offline, config: { ...original.evidence.request.offline.config, extensions: { rawTracks: [] } } } } } };
    expect(() => parseTrainingOperationsV3TrainingReceipt({ ...nestedTracks, receiptHash: stableVerificationHash(nestedTracks) })).toThrow(/derived evidence forbids extension/u);
    const nestedResult = { ...original, evidence: { ...original.evidence, evaluation: { ...original.evidence.evaluation,
      metrics: { ...original.evidence.evaluation.metrics, extensions: { rawTracks: [] } } } } };
    expect(() => parseTrainingOperationsV3TrainingReceipt({ ...nestedResult, receiptHash: stableVerificationHash(nestedResult) })).toThrow(/derived evidence forbids extension/u);
    const rawTracks = { ...original, evidence: { ...original.evidence, dataset: { observations: [] } } };
    expect(() => parseTrainingOperationsV3TrainingReceipt({ ...rawTracks, receiptHash: stableVerificationHash(rawTracks) })).toThrow(/derived evidence/u);
    const outerTracks = { ...original, trajectories: [{ observations: [] }] };
    expect(() => parseTrainingOperationsV3TrainingReceipt({ ...outerTracks, receiptHash: stableVerificationHash(outerTracks) })).toThrow(/derived evidence/u);
    const malformedKey = `foundry-job-v3-training:v1:${context.job.jobHash}`;
    const malformedRaw = JSON.stringify({ ...outerTracks, receiptHash: stableVerificationHash(outerTracks) });
    await context.input.backend.put("analysis", malformedKey, malformedRaw);
    expect(await context.executor.get(context.job.jobHash)).toBeUndefined();
    expect(await context.input.backend.get("quarantine", malformedKey)).toBe(malformedRaw);
    await context.input.backend.put("analysis", malformedKey, JSON.stringify(receipt));
    const indexKey = `policy-artifact:${context.request.artifact.id}`;
    const indexRaw = await context.input.backend.get("indexes", indexKey);
    if (indexRaw === undefined) throw new Error("admitted artifact index is missing");
    await context.input.backend.remove("indexes", indexKey);
    await expect(context.executor.start(context.job, context.request)).rejects.toThrow(/retry evidence/u);
    await context.input.backend.put("indexes", indexKey, indexRaw);
    const sampleKey = `academy-reviewed-sample:v1:${context.input.assessment.candidateHash}`;
    const sampleRaw = await context.input.backend.get("analysis", sampleKey);
    if (sampleRaw === undefined) throw new Error("admitted reviewed sample is missing");
    await context.input.backend.remove("analysis", sampleKey);
    await expect(context.executor.start(context.job, context.request)).rejects.toThrow(/reviewed sample/u);
    await context.input.backend.put("analysis", sampleKey, sampleRaw);
    await context.input.backend.remove("analysis", `academy-candidate-curation:v1:${context.input.assessment.candidateHash}`);
    await expect(context.executor.start(context.job, context.request)).rejects.toThrow(/approval/u);
  });

  it("leaves no partial V3 candidate or successor after a conditional commit fault and supports exact retry", async () => {
    const memory = createMemoryGhostVaultBackend(), commitIfMatches = vi.fn(memory.commitIfMatches.bind(memory));
    const context = await foundryV3Fixture(createAcademyHarness({ ...memory, commitIfMatches }));
    commitIfMatches.mockRejectedValueOnce(new Error("admission commit interrupted"));
    await expect(context.executor.start(context.job, context.request)).rejects.toThrow(/interrupted/u);
    expect(await context.jobs.get(context.job.id)).toEqual(context.job);
    expect(await context.executor.get(context.job.jobHash)).toBeUndefined();
    expect(await memory.get("analysis", `policy-artifact:v1:${context.request.artifact.id}`)).toBeUndefined();
    expect(await memory.get("indexes", `policy-artifact:${context.request.artifact.id}`)).toBeUndefined();
    expect((await context.executor.start(context.job, context.request)).job.phase).toBe("training");
  });

  it("rejects valid foreign reward and last-moment authority drift before V3 admission writes", async () => {
    const memory = createMemoryGhostVaultBackend(), commitIfMatches = vi.fn(memory.commitIfMatches.bind(memory));
    const context = await foundryV3Fixture(createAcademyHarness({ ...memory, commitIfMatches }));
    await expect(context.executor.start(context.job, { ...context.request,
      reward: { ...context.request.reward, reward: { ...context.request.reward.reward, totalMaximum: 11 } } })).rejects.toThrow(/lineage/u);
    commitIfMatches.mockImplementationOnce(async (guards, writes) => {
      await memory.remove("analysis", `academy-candidate-curation:v1:${context.input.assessment.candidateHash}`);
      await memory.commitIfMatches(guards, writes);
    });
    await expect(context.executor.start(context.job, context.request)).rejects.toThrow(/conditional/u);
    expect(await context.jobs.get(context.job.id)).toEqual(context.job);
    expect(await context.executor.get(context.job.jobHash)).toBeUndefined();
    expect(await memory.get("analysis", `policy-artifact:v1:${context.request.artifact.id}`)).toBeUndefined();
  });

  it("does not mistake a competing identical job head for this V3 request's candidate admission", async () => {
    const context = await foundryV3Fixture();
    const competing = { ...context.request, artifact: { ...context.request.artifact, id: "competing-v3-candidate" } };
    const outcomes = await Promise.allSettled([context.executor.start(context.job, context.request), context.executor.start(context.job, competing)]);
    expect(outcomes.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((entry) => entry.status === "rejected")).toHaveLength(1);
    const retained = await context.executor.get(context.job.jobHash);
    if (retained === undefined) throw new Error("concurrent admission did not retain a winner");
    expect(retained.job.phase).toBe("training");
    const keys = await context.input.backend.keys("analysis");
    const actualCandidates = keys.filter((key) => key === `policy-artifact:v1:${context.request.artifact.id}` || key === `policy-artifact:v1:${competing.artifact.id}`);
    expect(actualCandidates).toEqual([`policy-artifact:v1:${retained.evidence.candidate.artifact.id}`]);
  });

  it("trains a governed C31 corpus through real V3 source evaluation into an inactive C32 candidate", async () => {
    const { input, services, request, manifest } = await v3CandidateFixture();
    const beforeKeys = await input.backend.keys("analysis");
    const result = await trainTrainingArchiveV3Candidate(services, request);
    expect(result.training.disposition).toBe("complete");
    expect(result.checkpoint.status).toBe("complete");
    expect(result.evaluation.metrics.passed).toBe(true);
    expect(result.evaluation.traces.map((trace) => trace.side)).toEqual(["baseline", "challenger"]);
    expect(result.candidate.artifact.trainingManifest).toEqual({ id: manifest.id, version: manifest.version, rootHash: manifest.rootHash });
    const source = createProductionHeadlessEnvironment();
    try {
      const firstScenario = request.online.scenarios[0];
      if (firstScenario === undefined) throw new Error("missing V3 source scenario");
      let state = source.reset(firstScenario);
      const startX = state.player?.x;
      if (startX === undefined) throw new Error("missing initial source player");
      expect(result.candidate.artifact.build).toEqual(source.captureCheckpoint().bootstrap.build);
      expect(result.sourceBuilds[0]?.build).toEqual(result.candidate.artifact.build);
      const fallback = vi.fn(() => []);
      const runtime = new TearC34V3C32PolicyRuntime(result.candidate.artifact, fallback);
      for (let tick = 1; tick <= firstScenario.maxTicks; tick += 1) {
        const observation = createTearC32CanonicalSourceObservation(state, source.policyObservation().availableActions);
        const decision = runtime.decide(observation);
        expect(decision).toMatchObject({ source: "artifact",
          actions: [{ type: "move", x: 1_000, y: 0 }] });
        state = source.step(decision.actions).observation;
        expect(state.tick).toBe(tick);
      }
      const endX = state.player?.x;
      if (endX === undefined) throw new Error("missing stepped source player");
      expect(endX).toBeGreaterThan(startX);
      expect(fallback).not.toHaveBeenCalled();
    } finally { source.dispose(); }
    expect(result.lineage.custodyRecordHashes).toEqual(manifest.entries.map((entry) => entry.custodyRecordHash));
    expect(await input.backend.keys("analysis")).toEqual(beforeKeys);
    expect(await trainTrainingArchiveV3Candidate(services, request)).toEqual(result);
    const registry = new TearC34V3C32CandidateRegistry(input.backend);
    await registry.register(result.candidate.artifact);
    expect(await registry.get(result.candidate.artifact.id)).toEqual(result.candidate.artifact);
    expect(await input.backend.get("analysis", "policy-active:v1")).toBeUndefined();
  });

  it("protects held C31 source capsules from generic quota cleanup", async () => {
    const { input, services, request } = await v3CandidateFixture();
    const vault = new GhostLocalVault(input.backend);
    const held = await input.custody.held(request.at);
    const source = held.find((record) => record.candidateHash === input.assessment.candidateHash);
    if (source === undefined) throw new Error("Expected held source custody");
    const capsuleId = source.source.capsuleRange.capsuleId;
    const before = await vault.exportCapsule(capsuleId);
    expect(await vault.enforceQuota(0, {})).not.toContain(capsuleId);
    expect(await vault.exportCapsule(capsuleId)).toBe(before);
    expect(await input.custody.held(request.at)).toEqual(held);
    const result = await trainTrainingArchiveV3Candidate(services, request);
    expect(result.candidate.artifact.id).toBe(request.artifact.id);
    expect(await input.backend.get("analysis", "policy-active:v1")).toBeUndefined();
  });

  it("refuses revoked C31 custody and mismatched trainer manifests before emitting a V3 candidate", async () => {
    const { input, services, request } = await v3CandidateFixture();
    await expect(trainTrainingArchiveV3Candidate(services, { ...request, manifestHash: "f".repeat(16) })).rejects.toThrow(/exact published/u);
    await expect(trainTrainingArchiveV3Candidate(services, { ...request, actor: "unauthorized" })).rejects.toThrow(/custody/u);
    await input.custody.revoke({ candidateHash: input.assessment.candidateHash, scope: "model-training",
      consent: { ...input.declaration.consent, revision: "revoked-v3-training", modelTraining: "no-training" }, decidedAt: "2026-08-03T00:09:00.000Z",
      actor: "academy-curator", reason: "training permission withdrawn" });
    await expect(trainTrainingArchiveV3Candidate(services, { ...request, at: "2026-08-03T00:10:00.000Z" })).rejects.toThrow(/custody/u);
    expect((await input.backend.keys("analysis")).some((key) => key.startsWith("policy-"))).toBe(false);
  });

  it("refuses V3 candidate output if consent is revoked while loading real trainer data", async () => {
    const { input, services, request } = await v3CandidateFixture();
    const load = services.loader.load.bind(services.loader);
    vi.spyOn(services.loader, "load").mockImplementationOnce(async (value) => {
      const dataset = await load(value);
      await input.custody.revoke({ candidateHash: input.assessment.candidateHash, scope: "model-training",
        consent: { ...input.declaration.consent, revision: "revoked-during-load", modelTraining: "no-training" },
        decidedAt: request.at, actor: request.actor, reason: "withdrawn during load" });
      return dataset;
    });
    await expect(trainTrainingArchiveV3Candidate(services, request)).rejects.toThrow(/custody/u);
    expect((await input.backend.keys("analysis")).some((key) => key.startsWith("policy-"))).toBe(false);
  });

  it("refuses foreign Vault services and a manifest removed during V3 data loading", async () => {
    const { input, services, request } = await v3CandidateFixture();
    const foreign = await v3CandidateFixture();
    for (const key of ["custody", "curation", "corpus", "loader"] as const) {
      await expect(trainTrainingArchiveV3Candidate({ ...services, [key]: foreign.services[key] }, request)).rejects.toThrow(/share one Vault/u);
    }
    const load = services.loader.load.bind(services.loader);
    vi.spyOn(services.loader, "load").mockImplementationOnce(async (value) => {
      const dataset = await load(value);
      const key = (await input.backend.keys("analysis")).find((entry) => entry.startsWith("academy-corpus-manifest:v1:"));
      if (key === undefined) throw new Error("missing V3 manifest fixture");
      await input.backend.remove("analysis", key);
      return dataset;
    });
    await expect(trainTrainingArchiveV3Candidate(services, request)).rejects.toThrow(/published manifest/u);
    expect((await input.backend.keys("analysis")).some((key) => key.startsWith("policy-"))).toBe(false);
  });

  it("refuses V3 candidates with missing curation approval, stopped training, or failed evaluation", async () => {
    const { input, services, request } = await v3CandidateFixture();
    await expect(trainTrainingArchiveV3Candidate(services, { ...request, minimumRewardGain: 1 })).rejects.toThrow(/passed/u);
    await expect(trainTrainingArchiveV3Candidate(services, { ...request,
      online: { ...request.online, config: { ...request.online.config, maxUpdates: 1 } } })).rejects.toThrow(/lineage/u);
    await input.backend.remove("analysis", `academy-candidate-curation:v1:${input.assessment.candidateHash}`);
    await expect(trainTrainingArchiveV3Candidate(services, request)).rejects.toThrow(/curation/u);
    expect((await input.backend.keys("analysis")).some((key) => key.startsWith("policy-"))).toBe(false);
  });

  it("records an authorized human curation decision without creating a sample, manifest, or trainer input", async () => {
    const input = await prepare();
    const curation = new TearAcademyCandidateCurationStore(input.backend, input.custody, input.quality);
    const decision = await curation.decide({
      candidateHash: input.assessment.candidateHash, assessmentHash: input.assessment.assessmentHash,
      disposition: "curation-approved", reviewer: "academy-curator", reviewedAt: "2026-08-03T00:03:00.000Z",
      rationale: "human verified source context", tags: Object.freeze(["baseline"]), corrections: Object.freeze([]),
    });
    expect(decision).toMatchObject({ disposition: "curation-approved", tags: ["baseline"] });
    expect(await curation.active("2026-08-03T00:04:00.000Z")).toEqual([decision]);
    expect(await input.backend.keys("analysis")).not.toContain("academy-demonstration-corpus");
  });

  it("assigns only an active approved source to one immutable split and hides exam assignments from a trainer manifest", async () => {
    const input = await prepare();
    const curation = new TearAcademyCandidateCurationStore(input.backend, input.custody, input.quality);
    const decision = await curation.decide({
      candidateHash: input.assessment.candidateHash, assessmentHash: input.assessment.assessmentHash,
      disposition: "curation-approved", reviewer: "academy-curator", reviewedAt: "2026-08-03T00:03:00.000Z",
      rationale: "ready for governed split", tags: Object.freeze(["baseline"]), corrections: Object.freeze([]),
    });
    expect(decision.disposition).toBe("curation-approved");
    const splits = new TearAcademyCandidateSplitStore(input.backend, input.custody, input.quality, curation);
    const assignment = await splits.assign({ candidateHash: input.assessment.candidateHash, split: "hidden-release-exam",
      assignedAt: "2026-08-03T00:04:00.000Z", actor: "academy-curator" });
    expect(assignment.lineage).toMatchObject({ session: input.declaration.candidate.episodeId, seed: "c31-curation-seed" });
    await expect(splits.assign({ candidateHash: input.assessment.candidateHash, split: "training",
      assignedAt: "2026-08-03T00:05:00.000Z", actor: "academy-curator" })).rejects.toThrow(/already exists/u);
    expect((await splits.manifest("trainer", "2026-08-03T00:05:00.000Z", { kind: "trainer", id: "bc" })).entries).toEqual([]);
    expect((await splits.manifest("exam", "2026-08-03T00:05:00.000Z", { kind: "examiner", id: "release" })).entries).toEqual([assignment]);
    const first = await splits.publishManifest({ id: "release", version: 1, createdAt: "2026-08-03T00:05:00.000Z", reader: { kind: "examiner", id: "release" } });
    expect(await splits.getManifest("release", 1)).toEqual(first);
    await expect(splits.publishManifest({ id: "release", version: 2, createdAt: "2026-08-03T00:06:00.000Z", reader: { kind: "examiner", id: "release" } })).rejects.toThrow(/predecessor/u);
    const second = await splits.publishManifest({ id: "release", version: 2, createdAt: "2026-08-03T00:06:00.000Z", reader: { kind: "examiner", id: "release" }, previousManifestHash: first.manifestHash });
    expect(second.previousManifestHash).toBe(first.manifestHash);
    const samples = new TearAcademyReviewedSampleStore(input.backend, input.custody, input.quality, curation, splits);
    const sample = await samples.materialize(input.declaration, "2026-08-03T00:06:00.000Z", "academy-curator");
    expect(sample).toMatchObject({ split: "hidden-release-exam", source: { capsuleId: "c31-curation-source", fromTick: 0 } });
    expect(sample.tracks?.actions).toEqual(input.declaration.trackBundle?.actions);
    expect(await samples.get(sample.candidateHash)).toEqual(sample);
    const corpus = new TearAcademyCorpusStore(input.backend, input.custody, curation, splits, samples);
    const corpusEntry = await corpus.admit({ candidateHash: sample.candidateHash, lessonId: "movement-foundations",
      segmentKind: "demonstration", tags: Object.freeze(["baseline"]), admittedAt: "2026-08-03T00:06:30.000Z", actor: "academy-curator" });
    expect(await corpus.get(sample.candidateHash)).toEqual(corpusEntry);
    expect((await corpus.manifest({ id: "trainer", reader: { kind: "trainer", id: "bc" }, version: 1,
      createdAt: "2026-08-03T00:06:30.000Z" })).entries).toEqual([]);
    const corpusFirst = await corpus.publishManifest({ id: "exam", reader: { kind: "examiner", id: "release" }, version: 1,
      createdAt: "2026-08-03T00:06:30.000Z" });
    expect(corpusFirst.entries).toEqual([corpusEntry]);
    expect(await corpus.getManifest("exam", { kind: "examiner", id: "release" }, 1)).toEqual(corpusFirst);
    const activeInspection = await inspectAcademy({ custody: input.custody, quality: input.quality, curation, splits, samples, corpus }, "2026-08-03T00:06:45.000Z");
    expect(activeInspection.lessons).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "movement-foundations", governedEntries: 1, recoveryEntries: 0, status: "governed" }),
    ]));
    const revokedConsent = Object.freeze({ ...input.declaration.consent, revision: "c31-sample-consent-2",
      decidedAt: "2026-08-03T00:07:00.000Z", modelTraining: "no-training" as const });
    await input.custody.revoke({ candidateHash: sample.candidateHash, scope: "model-training", consent: revokedConsent,
      decidedAt: "2026-08-03T00:07:00.000Z", actor: "player", reason: "withdrawn after review" });
    const rebuilt = await splits.publishManifest({ id: "release", version: 3, createdAt: "2026-08-03T00:08:00.000Z",
      reader: { kind: "examiner", id: "release" }, previousManifestHash: second.manifestHash });
    expect(rebuilt.entries).toEqual([]);
    const corpusSecond = await corpus.publishManifest({ id: "exam", reader: { kind: "examiner", id: "release" }, version: 2,
      createdAt: "2026-08-03T00:08:00.000Z", previousManifestHash: corpusFirst.manifestHash });
    expect(corpusSecond.entries).toEqual([]);
    const inspection = await inspectAcademy({ custody: input.custody, quality: input.quality, curation, splits, samples, corpus }, "2026-08-03T00:08:00.000Z");
    expect(inspection).toMatchObject({ custody: { revoked: 1 }, quality: { reviewRequired: 1 }, curation: { approved: 1 }, splits: { "hidden-release-exam": 1 }, reviewedSamples: 1, corpusEntries: 1 });
    expect(inspection.lessons).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "movement-foundations", governedEntries: 0, recoveryEntries: 0, status: "unrepresented" }),
      expect.objectContaining({ id: "defense-parry", governedEntries: 0, recoveryEntries: 0, status: "unrepresented" }),
    ]));
    expect(inspection.records).toMatchObject([{
      candidateHash: sample.candidateHash, custody: "revoked", modelTrainingConsent: "no-training",
      retention: "indefinite", privacyClass: "anonymous", quality: "review-required",
      curation: "curation-approved", correctionCount: 0, split: "hidden-release-exam", reviewed: true, inCorpus: true,
    }]);
    expect(inspection.manifests).toMatchObject([
      { id: "release", version: 1, entries: 1 }, { id: "release", version: 2, entries: 1 }, { id: "release", version: 3, entries: 0 },
    ]);
  });

  it("rejects unauthorized, duplicate, or revoked review decisions and keeps correction requests immutable", async () => {
    const input = await prepare();
    const curation = new TearAcademyCandidateCurationStore(input.backend, input.custody, input.quality);
    const request = Object.freeze({ candidateHash: input.assessment.candidateHash, assessmentHash: input.assessment.assessmentHash,
      disposition: "needs-correction" as const, reviewer: "academy-curator", reviewedAt: "2026-08-03T00:03:00.000Z",
      rationale: "label needs review", tags: Object.freeze(["needs-label"]),
      corrections: Object.freeze([Object.freeze({ kind: "label" as const, detail: "verify terminal labeling" })]) });
    await expect(curation.decide({ ...request, reviewer: "untrusted" })).rejects.toThrow(/authorized/u);
    const decision = await curation.decide(request);
    expect(decision.corrections).toEqual([{ kind: "label", detail: "verify terminal labeling" }]);
    await expect(curation.decide(request)).rejects.toThrow(/already exists/u);
    const revokedConsent = Object.freeze({ ...input.declaration.consent, revision: "c31-curation-consent-2",
      decidedAt: "2026-08-03T00:04:00.000Z", modelTraining: "no-training" as const });
    await input.custody.revoke({ candidateHash: input.assessment.candidateHash, scope: "model-training", consent: revokedConsent,
      decidedAt: "2026-08-03T00:04:00.000Z", actor: "player", reason: "withdrawn training consent" });
    expect(await curation.active("2026-08-03T00:05:00.000Z")).toEqual([]);
  });

  it("loads one immutable trainer manifest deterministically without exposing hidden exams or producing a policy", async () => {
    const input = await prepare();
    const curation = new TearAcademyCandidateCurationStore(input.backend, input.custody, input.quality);
    await curation.decide({ candidateHash: input.assessment.candidateHash, assessmentHash: input.assessment.assessmentHash,
      disposition: "curation-approved", reviewer: "academy-curator", reviewedAt: "2026-08-03T00:03:00.000Z",
      rationale: "approved C33 trainer source", tags: Object.freeze(["baseline"]), corrections: Object.freeze([]) });
    const splits = new TearAcademyCandidateSplitStore(input.backend, input.custody, input.quality, curation);
    await splits.assign({ candidateHash: input.assessment.candidateHash, split: "training", assignedAt: "2026-08-03T00:04:00.000Z", actor: "academy-curator" });
    const samples = new TearAcademyReviewedSampleStore(input.backend, input.custody, input.quality, curation, splits);
    const sample = await samples.materialize(input.declaration, "2026-08-03T00:05:00.000Z", "academy-curator");
    const corpus = new TearAcademyCorpusStore(input.backend, input.custody, curation, splits, samples);
    await corpus.admit({ candidateHash: sample.candidateHash, lessonId: "movement-foundations", segmentKind: "demonstration",
      tags: Object.freeze(["baseline"]), admittedAt: "2026-08-03T00:06:00.000Z", actor: "academy-curator" });
    const manifest = await corpus.publishManifest({ id: "c33-bc", reader: { kind: "trainer", id: "c33-local" }, version: 1,
      createdAt: "2026-08-03T00:07:00.000Z" });
    const loader = new TearAcademyTrainingDatasetLoader(corpus, samples);
    const first = await loader.load({ manifestId: manifest.id, trainerId: "c33-local", version: 1 });
    const second = await loader.load({ manifestId: manifest.id, trainerId: "c33-local", version: 1 });
    expect(first).toEqual(second);
    expect(first).toMatchObject({ format: "tear-academy-training-dataset", manifest: { manifestHash: manifest.manifestHash },
      sequences: [{ candidateHash: sample.candidateHash, lessonId: "movement-foundations" }] });
    expect(first.sequences.every((entry) => entry.tracks.candidateHash === entry.candidateHash)).toBe(true);
    await expect(loader.load({ manifestId: manifest.id, trainerId: "other-trainer", version: 1 })).rejects.toThrow(/unavailable/u);
    const normalization = createTearBehaviorCloningNormalization(first);
    const batches = createTearBehaviorCloningBatches(first, normalization, { split: "training", batchSize: 2 });
    expect(createTearBehaviorCloningNormalization(second)).toEqual(normalization);
    expect(createTearBehaviorCloningBatches(second, normalization, { split: "training", batchSize: 2 })).toEqual(batches);
    expect(batches.flatMap((batch) => batch.examples).every((example) => example.features.length === 17)).toBe(true);
    expect(createTearTemporalPolicyContexts(first, 2).every((context) => context.featureFrames.length >= 1 && context.featureFrames.length <= 2)).toBe(true);
    expect(() => createTearBehaviorCloningBatches(first, normalization, { split: "validation", batchSize: 2 })).toThrow(/no examples/u);
    const config = Object.freeze({ seed: 7, epochs: 3, learningRate: 0.25, batchSize: 2 });
    const training = trainTearBehaviorCloningPolicy(first, normalization, config);
    expect(trainTearBehaviorCloningPolicy(second, normalization, config)).toEqual(training);
    const partial = advanceTearBehaviorCloningCheckpoint(createTearBehaviorCloningCheckpoint(first, normalization, config), first, normalization, config, 1);
    const checkpointVault = new TearBehaviorCloningCheckpointVault(input.backend);
    expect(await checkpointVault.persist(partial)).toEqual(partial);
    expect(await checkpointVault.get(partial.checkpointHash)).toEqual(partial);
    await input.backend.put("analysis", `behavior-cloning-checkpoint:v1:${partial.checkpointHash}`, "not-json");
    expect(await checkpointVault.get(partial.checkpointHash)).toBeUndefined();
    expect((await input.backend.keys("quarantine")).some((key) => key.endsWith(partial.checkpointHash))).toBe(true);
    const resumed = advanceTearBehaviorCloningCheckpoint(partial, first, normalization, config, config.epochs);
    expect(completeTearBehaviorCloningCheckpoint(resumed, first, normalization, config)).toEqual(training);
    expect(training.metrics.examples).toBe(3);
    expect(training.metrics.classes).toBe(2);
    expect(training.metrics.trainingAccuracy).toBe(1);
    const trainingVault = new TearBehaviorCloningTrainingVault(input.backend);
    expect(await trainingVault.persist(training)).toEqual(training);
    expect(await trainingVault.persist(training)).toEqual(training);
    expect(await trainingVault.get(training.trainingHash)).toEqual(training);
    const artifact = createTearBehaviorCloningArtifact(training, {
      id: "c33-linear-policy", createdAt: "2026-08-03T00:08:00.000Z", encoder: { id: "tear-policy-features.v1", schemaVersion: 1,
        observationClass: "structured-state", normalizationHash: normalization.normalizationHash }, actionSchema: "tear-game-action-command-envelope.v1",
      recurrentState: { kind: "none", schemaVersion: 1 }, trainingManifest: { id: manifest.id, version: manifest.version, rootHash: manifest.rootHash },
      rewardVersion: "tear-reward.v1", build: { version: "test", revision: "c33", target: "unit", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" },
      metrics: {}, levelTarget: "class-a", lineage: { trainingRunId: training.trainingHash }, signature: { kind: "local-unsigned", keyId: "development" },
      compatibility: { runtime: "tear-policy-runtime.v1", observationClass: "structured-state", actionSchema: "tear-game-action-command-envelope.v1", modelFormats: ["linear-policy-v1"] },
    });
    expect(artifact.model).toMatchObject({ format: "linear-policy-v1" });
    const registry = new TearPolicyArtifactRegistry(input.backend, artifact.compatibility);
    await registry.register(artifact); await registry.activate(artifact.id, "2026-08-03T00:09:00.000Z");
    const corrections = await captureTearDaggerCorrections(registry, scenario(), { maxCorrections: 2, teacherProfile: "chaos" });
    expect(corrections).toMatchObject({ format: "tear-dagger-correction-capture", artifact: { id: artifact.id }, terminal: { truncated: true } });
    expect(corrections.corrections).not.toEqual([]);
    expect(corrections.corrections.every((entry) => entry.challengerReceipt.source === "artifact"
      && entry.challengerActions !== entry.teacherActions)).toBe(true);
    const proposed = corrections.corrections[0];
    if (proposed === undefined) throw new Error("expected a DAgger correction proposal");
    const reviews = new TearDaggerCorrectionReviewStore(input.backend, ["academy-curator"]);
    await expect(reviews.decide({ capture: corrections, correctionHash: proposed.correctionHash, reviewer: "untrusted",
      reviewedAt: "2026-08-03T00:09:30.000Z", disposition: "accepted", rationale: "invalid actor" })).rejects.toThrow(/invalid/u);
    const review = await reviews.decide({ capture: corrections, correctionHash: proposed.correctionHash, reviewer: "academy-curator",
      reviewedAt: "2026-08-03T00:09:30.000Z", disposition: "accepted", rationale: "teacher action verified" });
    expect(await reviews.get(corrections.captureHash, proposed.correctionHash)).toEqual(review);
    const augmentation = createTearDaggerRetrainingInput(first, normalization, corrections, [review]);
    expect(augmentation).toMatchObject({ datasetHash: first.datasetHash, captureHash: corrections.captureHash, examples: [{ correctionHash: proposed.correctionHash }] });
    const retrained = trainTearBehaviorCloningPolicy(first, normalization, config, augmentation);
    expect(retrained).toMatchObject({ datasetHash: first.datasetHash, augmentationHash: augmentation.inputHash });
    expect(retrained.metrics.examples).toBeGreaterThan(training.metrics.examples);
    const environment = createProductionHeadlessEnvironment(), runtime = new TearActivePolicyRuntime(registry);
    try {
      environment.reset(scenario()); await runtime.reset();
      expect(runtime.decide({ state: environment.policyObservation(), ui: { screen: "playing" } }).receipt)
        .toMatchObject({ source: "artifact", artifactId: artifact.id });
    } finally { environment.dispose(); }
    const temporalConfig = Object.freeze({ ...config, window: 2,
      conditionSchemaHash: TEAR_POLICY_CONDITION_SCHEMA_HASH_V2, conditionWidth: TEAR_POLICY_CONDITION_WIDTH_V2 });
    const temporal = trainTearTemporalWindowPolicy(first, normalization, temporalConfig);
    expect(trainTearTemporalWindowPolicy(second, normalization, temporalConfig)).toEqual(temporal);
    const temporalPartial = advanceTearTemporalPolicyCheckpoint(createTearTemporalPolicyCheckpoint(first, normalization, temporalConfig), first, normalization, temporalConfig, 1);
    const temporalCheckpointVault = new TearTemporalPolicyCheckpointVault(input.backend);
    expect(await temporalCheckpointVault.persist(temporalPartial)).toEqual(temporalPartial);
    expect(await temporalCheckpointVault.get(temporalPartial.checkpointHash)).toEqual(temporalPartial);
    const temporalResumed = advanceTearTemporalPolicyCheckpoint(temporalPartial, first, normalization, temporalConfig, temporalConfig.epochs);
    expect(completeTearTemporalPolicyCheckpoint(temporalResumed, first, normalization, temporalConfig)).toEqual(temporal);
    await input.backend.put("analysis", `temporal-policy-checkpoint:v1:${temporalPartial.checkpointHash}`, "not-json");
    expect(await temporalCheckpointVault.get(temporalPartial.checkpointHash)).toBeUndefined();
    await input.backend.put("analysis", `temporal-policy-checkpoint:v1:${temporalPartial.checkpointHash}`, JSON.stringify({ ...temporalPartial, weights: [] }));
    expect(await temporalCheckpointVault.get(temporalPartial.checkpointHash)).toBeUndefined();
    expect((await input.backend.keys("quarantine")).some((key) => key.endsWith(temporalPartial.checkpointHash))).toBe(true);
    expect(temporal.model).toMatchObject({ format: "tear-temporal-window-linear-policy-model", window: 2 });
    const temporalArtifact = createTearTemporalWindowPolicyArtifact(temporal, {
      id: "c33-temporal-policy", createdAt: "2026-08-03T00:10:00.000Z", encoder: { id: "tear-policy-features.v1", schemaVersion: 1,
        observationClass: "structured-state", normalizationHash: normalization.normalizationHash }, actionSchema: "tear-game-action-command-envelope.v1",
      recurrentState: { kind: "none", schemaVersion: 1 }, trainingManifest: { id: manifest.id, version: manifest.version, rootHash: manifest.rootHash },
      rewardVersion: "tear-reward.v1", build: { version: "test", revision: "c33", target: "unit", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" },
      metrics: {}, levelTarget: "class-a", lineage: { trainingRunId: temporal.trainingHash }, signature: { kind: "local-unsigned", keyId: "development" },
      compatibility: { runtime: "tear-policy-runtime.v1", observationClass: "structured-state", actionSchema: "tear-game-action-command-envelope.v1", modelFormats: ["temporal-window-linear-policy-v1"] },
    });
    const temporalRegistry = new TearPolicyArtifactRegistry(input.backend, temporalArtifact.compatibility);
    await temporalRegistry.register(temporalArtifact); await temporalRegistry.activate(temporalArtifact.id, "2026-08-03T00:10:30.000Z");
    const temporalCapture = await captureTearDaggerCorrections(temporalRegistry, scenario("c33-temporal-dagger", "c33-temporal-dagger-seed"), { maxCorrections: 2, teacherProfile: "chaos" });
    const temporalCorrection = temporalCapture.corrections[0];
    if (temporalCorrection === undefined) throw new Error("expected temporal DAgger correction proposal");
    expect(temporalCorrection.temporal.featureFrames.length).toBeGreaterThan(0);
    expect(temporalCorrection.temporal.condition.length).toBe(TEAR_POLICY_CONDITION_WIDTH_V2);
    const temporalReview = await reviews.decide({ capture: temporalCapture, correctionHash: temporalCorrection.correctionHash,
      reviewer: "academy-curator", reviewedAt: "2026-08-03T00:10:45.000Z", disposition: "accepted", rationale: "temporal teacher action verified" });
    const temporalAugmentation = createTearTemporalDaggerRetrainingInput(first, normalization, temporalConfig, temporalCapture, [temporalReview]);
    const temporalRetrained = trainTearTemporalWindowPolicy(first, normalization, temporalConfig, temporalAugmentation);
    expect(temporalRetrained).toMatchObject({ datasetHash: temporal.datasetHash, augmentationHash: temporalAugmentation.inputHash });
    expect(temporalRetrained.metrics.examples).toBeGreaterThan(temporal.metrics.examples);
    expect(() => trainTearTemporalWindowPolicy(first, normalization, temporalConfig,
      Object.freeze({ ...temporalAugmentation, inputHash: "0000000000000000" }))).toThrow(/augmentation/u);
    const temporalEnvironment = createProductionHeadlessEnvironment(), temporalRuntime = new TearActivePolicyRuntime(temporalRegistry);
    try {
      temporalEnvironment.reset(scenario()); await temporalRuntime.reset();
      expect(temporalRuntime.decide({ state: temporalEnvironment.policyObservation(), ui: { screen: "playing" } }).receipt)
        .toMatchObject({ source: "artifact", artifactId: temporalArtifact.id });
    } finally { temporalEnvironment.dispose(); }
    const unseenSuite = Object.freeze({ id: "c33-temporal-unseen", version: 1, description: "C33 source-world unseen-seed observation",
      scenarios: Object.freeze([scenario("c33-temporal-unseen", "c33-temporal-unseen-seed")]) });
    const comparison = await compareTemporalPolicyAgainstScriptedBaselineInProduction(temporalRegistry, unseenSuite);
    expect(await compareTemporalPolicyAgainstScriptedBaselineInProduction(temporalRegistry, unseenSuite)).toEqual(comparison);
    expect(comparison.artifact).toMatchObject({ id: temporalArtifact.id, trainingHash: temporal.trainingHash });
    expect(comparison.suite).toMatchObject({ id: unseenSuite.id });
    expect(comparison.metrics).toEqual({ terminatedScenarioDelta: 0, truncatedScenarioDelta: 0, executedDecisionDelta: 0,
      completedScenarioDelta: 0, defeatedScenarioDelta: 0, revivalEventDelta: 0 });
    await expect(compareTemporalPolicyAgainstScriptedBaselineInProduction(temporalRegistry, Object.freeze({ ...unseenSuite,
      id: "c33-temporal-overlap", scenarios: Object.freeze([input.declaration.candidate.artifact.scenario]) }))).rejects.toThrow(/overlaps/u);
    const program = new TearTemporalDaggerProgramController(input.backend, first, normalization, temporalConfig, temporalRegistry, reviews);
    const firstRound = await program.start("c33-repeat-program", scenario("c33-repeat-one", "c33-repeat-one-seed", 8), { maxCorrections: 1 });
    const firstProposal = firstRound.capture.corrections[0]; if (firstProposal === undefined) throw new Error("expected first repeat-round proposal");
    const firstReview = await reviews.decide({ capture: firstRound.capture, correctionHash: firstProposal.correctionHash, reviewer: "academy-curator", reviewedAt: "2026-08-03T00:11:00.000Z", disposition: "accepted", rationale: "first bounded program review" });
    const firstCheckpointed = await program.acceptReviews(firstRound.id, [firstReview]);
    expect(firstCheckpointed.status).toBe("checkpointed");
    expect((await program.cancel(firstRound.id)).status).toBe("cancelled");
    const resumedProgram = new TearTemporalDaggerProgramController(input.backend, first, normalization, temporalConfig, temporalRegistry, reviews);
    const resumedRound = await resumedProgram.advance(firstRound.id, temporalConfig.epochs);
    expect(resumedRound.status).toBe("completed");
    const secondRound = await resumedProgram.start(firstRound.id, scenario("c33-repeat-two", "c33-repeat-two-seed", 8), { maxCorrections: 1 });
    const secondProposal = secondRound.capture.corrections[0]; if (secondProposal === undefined) throw new Error("expected second repeat-round proposal");
    const secondReview = await reviews.decide({ capture: secondRound.capture, correctionHash: secondProposal.correctionHash, reviewer: "academy-curator", reviewedAt: "2026-08-03T00:11:01.000Z", disposition: "accepted", rationale: "second bounded program review" });
    await resumedProgram.acceptReviews(secondRound.id, [secondReview]);
    expect((await resumedProgram.advance(secondRound.id, temporalConfig.epochs)).rounds).toHaveLength(2);
    await expect(resumedProgram.start(secondRound.id, scenario("c33-repeat-two", "c33-repeat-two-seed", 8))).rejects.toThrow(/repeats/u);
    const scheduler = new TearTemporalDaggerProgramScheduler(resumedProgram);
    const schedule = createTearTemporalDaggerProgramSchedule(secondRound.id, [{
      scenario: scenario("c33-repeat-three", "c33-repeat-three-seed", 8), options: { maxCorrections: 1 },
    }]);
    const schedules = new TearTemporalDaggerProgramScheduleVault(input.backend);
    await schedules.persist(schedule);
    const orchestrator = new TearTemporalDaggerProgramOrchestrator(schedules, scheduler);
    expect((await orchestrator.run(secondRound.id))?.status).toBe("review-required");
    expect((await orchestrator.run(secondRound.id))?.rounds).toHaveLength(3);
    await expect(schedules.persist(createTearTemporalDaggerProgramSchedule(secondRound.id, [{ scenario: scenario("c33-repeat-four", "c33-repeat-four-seed", 8) }]))).rejects.toThrow(/already exists/u);
    await expect(scheduler.run(Object.freeze({ ...schedule, scheduleHash: "0000000000000000" }))).rejects.toThrow(/integrity/u);
    const runtimePlan = createTearTemporalDaggerProgramPlan({
      id: "c33-runtime-program", dataset: { manifestId: manifest.id, trainerId: "c33-local", version: manifest.version }, config: temporalConfig,
      authorizedReviewers: ["academy-curator"], schedule: createTearTemporalDaggerProgramSchedule("c33-runtime-program", [
        { scenario: scenario("c33-runtime-one", "c33-runtime-one-seed", 8), options: { maxCorrections: 1 } },
        { scenario: scenario("c33-runtime-two", "c33-runtime-two-seed", 8), options: { maxCorrections: 1 } },
      ]),
    });
    const plans = new TearTemporalDaggerProgramPlanVault(input.backend);
    expect(await plans.persist(runtimePlan)).toEqual(runtimePlan);
    const plannedRuntime = new TearTemporalDaggerProgramRuntime(input.backend, plans);
    const runtimeFirst = await plannedRuntime.advance(runtimePlan.id);
    expect(runtimeFirst).toMatchObject({ status: "review-required", rounds: [{ status: "review-required" }] });
    const runtimeFirstCorrection = runtimeFirst?.capture.corrections[0]; if (runtimeFirstCorrection === undefined) throw new Error("expected runtime program correction");
    await plannedRuntime.review(runtimePlan.id, runtimeFirstCorrection.correctionHash, "accepted", "academy-curator",
      "2026-08-03T00:11:02.000Z", "runtime first review");
    const runtimeSecond = await plannedRuntime.advance(runtimePlan.id);
    expect(runtimeSecond).toMatchObject({ status: "review-required", rounds: [{ status: "completed" }, { status: "review-required" }] });
    const runtimeSecondCorrection = runtimeSecond?.capture.corrections[0]; if (runtimeSecondCorrection === undefined) throw new Error("expected runtime second correction");
    await plannedRuntime.review(runtimePlan.id, runtimeSecondCorrection.correctionHash, "accepted", "academy-curator",
      "2026-08-03T00:11:03.000Z", "runtime second review");
    expect(await plannedRuntime.advance(runtimePlan.id)).toMatchObject({ status: "completed", rounds: [{ status: "completed" }, { status: "completed" }] });
    await input.backend.put("analysis", `temporal-dagger-program-plan:v1:${runtimePlan.id}`, "not-json");
    expect(await plans.get(runtimePlan.id)).toBeUndefined();
    expect((await input.backend.keys("quarantine")).some((key) => key.endsWith(runtimePlan.id))).toBe(true);
    const listedPrograms = await inspectTearTemporalDaggerPrograms(input.backend);
    expect(listedPrograms.map((entry) => ({ id: entry.id, status: entry.status }))).toEqual([
      { id: "c33-repeat-program", status: "review-required" },
      { id: "c33-runtime-program", status: "completed" },
    ]);
    await input.backend.put("analysis", "temporal-dagger-program:v1:corrupt", "not-json");
    expect(await inspectTearTemporalDaggerPrograms(input.backend)).toHaveLength(2);
    expect((await input.backend.keys("quarantine")).some((key) => key.endsWith(":corrupt"))).toBe(true);
    await input.backend.put("analysis", `behavior-cloning-training:v1:${training.trainingHash}`, "not-json");
    expect(await trainingVault.get(training.trainingHash)).toBeUndefined();
    expect((await input.backend.keys("quarantine")).some((key) => key.endsWith(training.trainingHash))).toBe(true);
  });

  it("builds separately governed training and validation sequences in one immutable trainer manifest", async () => {
    const harness = createAcademyHarness();
    const training = await prepare(harness, "c33-training", 60), validation = await prepare(harness, "c33-validation", 60);
    const curation = new TearAcademyCandidateCurationStore(harness.backend, harness.custody, harness.quality);
    for (const input of [training, validation]) await curation.decide({ candidateHash: input.assessment.candidateHash,
      assessmentHash: input.assessment.assessmentHash, disposition: "curation-approved", reviewer: "academy-curator",
      reviewedAt: "2026-08-03T00:03:00.000Z", rationale: "separate C33 split source", tags: Object.freeze(["c33"]), corrections: Object.freeze([]) });
    const splits = new TearAcademyCandidateSplitStore(harness.backend, harness.custody, harness.quality, curation);
    await splits.assign({ candidateHash: training.assessment.candidateHash, split: "training", assignedAt: "2026-08-03T00:04:00.000Z", actor: "academy-curator" });
    await splits.assign({ candidateHash: validation.assessment.candidateHash, split: "validation", assignedAt: "2026-08-03T00:04:00.000Z", actor: "academy-curator" });
    const samples = new TearAcademyReviewedSampleStore(harness.backend, harness.custody, harness.quality, curation, splits);
    const [trainingSample, validationSample] = await Promise.all([
      samples.materialize(training.declaration, "2026-08-03T00:05:00.000Z", "academy-curator"),
      samples.materialize(validation.declaration, "2026-08-03T00:05:00.000Z", "academy-curator"),
    ]);
    const corpus = new TearAcademyCorpusStore(harness.backend, harness.custody, curation, splits, samples);
    for (const sample of [trainingSample, validationSample]) await corpus.admit({ candidateHash: sample.candidateHash,
      lessonId: "movement-foundations", segmentKind: "demonstration", tags: Object.freeze(["c33"]), admittedAt: "2026-08-03T00:06:00.000Z", actor: "academy-curator" });
    const manifest = await corpus.publishManifest({ id: "c33-heldout", reader: { kind: "trainer", id: "c33-local" }, version: 1, createdAt: "2026-08-03T00:07:00.000Z" });
    const dataset = await new TearAcademyTrainingDatasetLoader(corpus, samples).load({ manifestId: manifest.id, trainerId: "c33-local", version: 1 });
    const normalization = createTearBehaviorCloningNormalization(dataset);
    expect(dataset.sequences.map((entry) => entry.split).sort()).toEqual(["training", "validation"]);
    const config = Object.freeze({ seed: 7, epochs: 3, learningRate: 0.25, batchSize: 2 });
    const fit = trainTearBehaviorCloningPolicy(dataset, normalization, config);
    const artifact = createTearBehaviorCloningArtifact(fit, { id: "c33-heldout-parent", createdAt: "2026-08-03T00:08:00.000Z",
      encoder: { id: "tear-policy-features.v1", schemaVersion: 1, observationClass: "structured-state", normalizationHash: normalization.normalizationHash }, actionSchema: "tear-game-action-command-envelope.v1",
      recurrentState: { kind: "none", schemaVersion: 1 }, trainingManifest: { id: manifest.id, version: manifest.version, rootHash: manifest.rootHash }, rewardVersion: "tear-reward.v1",
      build: { version: "test", revision: "c33", target: "unit", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" }, metrics: {}, levelTarget: "class-a",
      lineage: { trainingRunId: fit.trainingHash }, signature: { kind: "local-unsigned", keyId: "development" }, compatibility: { runtime: "tear-policy-runtime.v1", observationClass: "structured-state", actionSchema: "tear-game-action-command-envelope.v1", modelFormats: ["linear-policy-v1"] } });
    const registry = new TearPolicyArtifactRegistry(harness.backend, artifact.compatibility);
    await registry.register(artifact); await registry.activate(artifact.id, "2026-08-03T00:08:30.000Z");
    const capture = await captureTearDaggerCorrections(registry, scenario("c33-heldout-dagger", "c33-heldout-dagger-seed", 60), { maxCorrections: 8 });
    expect(capture.corrections).toHaveLength(8);
    const correction = capture.corrections[0]; if (correction === undefined) throw new Error("expected held-out DAgger proposal");
    const review = await new TearDaggerCorrectionReviewStore(harness.backend, ["academy-curator"]).decide({ capture, correctionHash: correction.correctionHash,
      reviewer: "academy-curator", reviewedAt: "2026-08-03T00:08:45.000Z", disposition: "accepted", rationale: "C33 comparison evidence" });
    const retrained = trainTearBehaviorCloningPolicy(dataset, normalization, config, createTearDaggerRetrainingInput(dataset, normalization, capture, [review]));
    const persisted = await new TearBehaviorCloningTrainingVault(harness.backend).persist(fit);
    const first = evaluateTearBehaviorCloningPolicy(persisted, dataset, normalization, { split: "validation", batchSize: 2 });
    const second = evaluateTearBehaviorCloningPolicy(persisted, dataset, normalization, { split: "validation", batchSize: 2 });
    expect(first).toEqual(second);
    const evaluationVault = new TearBehaviorCloningEvaluationVault(harness.backend);
    expect(await evaluationVault.persist(first)).toEqual(first);
    expect(await evaluationVault.persist(first)).toEqual(first);
    expect(await evaluationVault.get(first.reportHash)).toEqual(first);
    expect(first).toMatchObject({ split: "validation", examples: 61, batchCount: 31 });
    const retrainedReport = evaluateTearBehaviorCloningPolicy(retrained, dataset, normalization, { split: "validation", batchSize: 2 });
    expect(retrainedReport).toMatchObject({ split: "validation", examples: first.examples });
    expect(retrainedReport.trainingHash).not.toBe(first.trainingHash);
    expect(first.actionConformance).toBeGreaterThanOrEqual(0);
    expect(first.actionConformance).toBeLessThanOrEqual(1);
    expect(() => evaluateTearBehaviorCloningPolicy(fit, dataset, normalization, { split: "training", batchSize: 2 } as never)).toThrow(/held-out/u);

    const temporalConfig = Object.freeze({ ...config, window: 4,
      conditionSchemaHash: TEAR_POLICY_CONDITION_SCHEMA_HASH_V2, conditionWidth: TEAR_POLICY_CONDITION_WIDTH_V2 });
    const temporalParent = trainTearTemporalWindowPolicy(dataset, normalization, temporalConfig);
    const temporalParentArtifact = createTearTemporalWindowPolicyArtifact(temporalParent, {
      id: "c33-heldout-temporal-parent", createdAt: "2026-08-03T00:09:00.000Z",
      encoder: { id: "tear-policy-features.v1", schemaVersion: 1, observationClass: "structured-state", normalizationHash: normalization.normalizationHash },
      actionSchema: "tear-game-action-command-envelope.v1", recurrentState: { kind: "none", schemaVersion: 1 },
      trainingManifest: { id: manifest.id, version: manifest.version, rootHash: manifest.rootHash }, rewardVersion: "tear-reward.v1",
      build: { version: "test", revision: "c33", target: "unit", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" }, metrics: {},
      levelTarget: "class-a", lineage: { trainingRunId: temporalParent.trainingHash }, signature: { kind: "local-unsigned", keyId: "development" },
      compatibility: { runtime: "tear-policy-runtime.v1", observationClass: "structured-state", actionSchema: "tear-game-action-command-envelope.v1", modelFormats: ["temporal-window-linear-policy-v1"] },
    });
    const temporalRegistry = new TearPolicyArtifactRegistry(harness.backend, temporalParentArtifact.compatibility);
    await temporalRegistry.register(temporalParentArtifact); await temporalRegistry.activate(temporalParentArtifact.id, "2026-08-03T00:09:15.000Z");
    const temporalDaggerScenario = scenario("c33-temporal-dagger-heldout", "c33-temporal-dagger-heldout-seed", 60);
    const temporalCapture = await captureTearDaggerCorrections(temporalRegistry, temporalDaggerScenario, { maxCorrections: 8 });
    expect(temporalCapture.corrections).toHaveLength(8);
    const temporalReviews = await Promise.all(temporalCapture.corrections.map((entry, index) => new TearDaggerCorrectionReviewStore(harness.backend, ["academy-curator"]).decide({
      capture: temporalCapture, correctionHash: entry.correctionHash, reviewer: "academy-curator", reviewedAt: `2026-08-03T00:09:${String(20 + index).padStart(2, "0")}.000Z`,
      disposition: "accepted", rationale: "C33 temporal correction evidence",
    })));
    const temporalAugmentation = createTearTemporalDaggerRetrainingInput(dataset, normalization, temporalConfig, temporalCapture, temporalReviews);
    expect(temporalAugmentation.sourceScenarioHashes).toEqual([temporalCapture.scenario.hash]);
    const temporalCorrected = trainTearTemporalWindowPolicy(dataset, normalization, temporalConfig, temporalAugmentation);
    expect(temporalCorrected.trainingScenarioHashes).toContain(temporalCapture.scenario.hash);
    const temporalCorrectedArtifact = createTearTemporalWindowPolicyArtifact(temporalCorrected, {
      id: "c33-heldout-temporal-corrected", createdAt: "2026-08-03T00:09:40.000Z",
      encoder: temporalParentArtifact.encoder, actionSchema: temporalParentArtifact.actionSchema, recurrentState: temporalParentArtifact.recurrentState,
      trainingManifest: temporalParentArtifact.trainingManifest, rewardVersion: temporalParentArtifact.rewardVersion, build: temporalParentArtifact.build, metrics: {},
      levelTarget: "class-a", lineage: { trainingRunId: temporalCorrected.trainingHash, parentArtifactId: temporalParentArtifact.id },
      signature: temporalParentArtifact.signature, compatibility: temporalParentArtifact.compatibility,
    });
    await temporalRegistry.register(temporalCorrectedArtifact);
    const unseenTemporalSuite = Object.freeze({ id: "c33-temporal-heldout-suite", version: 1,
      description: "Predeclared C33 source-world temporal DAgger observation suite", scenarios: Object.freeze([
        scenario("c33-temporal-heldout-a", "c33-temporal-heldout-a-seed", 60),
        scenario("c33-temporal-heldout-b", "c33-temporal-heldout-b-seed", 60),
        scenario("c33-temporal-heldout-c", "c33-temporal-heldout-c-seed", 60),
      ]) });
    const parentComparison = await compareTemporalPolicyAgainstScriptedBaselineInProduction(temporalRegistry, unseenTemporalSuite);
    await temporalRegistry.activate(temporalCorrectedArtifact.id, "2026-08-03T00:10:00.000Z");
    const correctedComparison = await compareTemporalPolicyAgainstScriptedBaselineInProduction(temporalRegistry, unseenTemporalSuite);
    expect(parentComparison.artifactReport.outcomes.scenarioCount).toBe(3);
    expect(correctedComparison.artifact).toMatchObject({ id: temporalCorrectedArtifact.id, trainingHash: temporalCorrected.trainingHash });
    expect(correctedComparison.artifact.trainingScenarioHashes).toContain(temporalCapture.scenario.hash);
    const outcomeVault = new TearProductionPolicyOutcomeSuiteVault(harness.backend);
    expect(await outcomeVault.persist(parentComparison.artifactReport)).toEqual(parentComparison.artifactReport);
    expect(await outcomeVault.persist(correctedComparison.artifactReport)).toEqual(correctedComparison.artifactReport);
    expect((await outcomeVault.retain(2, "2026-08-03T00:10:15.000Z")).retainedReportHashes).toHaveLength(2);
    const comparisonVault = new TearTemporalPolicyBaselineComparisonVault(harness.backend);
    expect(await comparisonVault.persist(parentComparison)).toEqual(parentComparison);
    expect(await comparisonVault.persist(correctedComparison)).toEqual(correctedComparison);
    expect(await comparisonVault.get(correctedComparison.comparisonHash)).toEqual(correctedComparison);
    await expect(compareTemporalPolicyAgainstScriptedBaselineInProduction(temporalRegistry, Object.freeze({ ...unseenTemporalSuite,
      id: "c33-temporal-dagger-overlap", scenarios: Object.freeze([temporalDaggerScenario]) }))).rejects.toThrow(/overlaps/u);
    await harness.backend.put("analysis", `temporal-policy-baseline-comparison:v1:${correctedComparison.comparisonHash}`, "not-json");
    expect(await comparisonVault.get(correctedComparison.comparisonHash)).toBeUndefined();
    expect((await harness.backend.keys("quarantine")).some((key) => key.endsWith(correctedComparison.comparisonHash))).toBe(true);
    await harness.backend.put("analysis", `behavior-cloning-evaluation:v1:${first.reportHash}`, "not-json");
    expect(await evaluationVault.get(first.reportHash)).toBeUndefined();
    expect((await harness.backend.keys("quarantine")).some((key) => key.endsWith(first.reportHash))).toBe(true);
  });
});

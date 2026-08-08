import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import { TearFoundryDueDispatcher, TearFoundryJobScheduleVault, TearFoundryJobVault, createTearFoundryJob, createTearFoundryJobSchedule, createTearOfflineRlPlan, transitionTearFoundryJob, type TearAcademyCandidateCustodyStore, type TearAcademyCorpusStore, type TearAcademyTrainingDatasetLoader, type TearAcademyTrainingDatasetV1 } from "../../src/agents";

const h = Object.freeze({ artifact: "1".repeat(16), corpus: "2".repeat(16), candidate: "3".repeat(16), evaluation: "4".repeat(16), invariant: "5".repeat(16), budget: "6".repeat(16), stop: "7".repeat(16), compute: "8".repeat(16), storage: "9".repeat(16) });
const scenario = Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const, id: "offline-due", version: 1, description: "offline due", stateClass: "recorded-canonical" as const, executionClass: "training" as const, seed: "offline-due", start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 4, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c36"] as const) });
const states = [0, 1].map((tick) => Object.freeze({ tick, input: {} as never, run: Object.freeze({ mode: "endless", wave: 1, score: tick, time: tick, seed: 1 }), player: Object.freeze({ x: 0, y: 0, vx: 0, vy: 0, hp: 100 }), blade: Object.freeze({ state: "held", x: 0, y: 0, vx: 0, vy: 0 }), enemies: Object.freeze([]) }));
const dataset = Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1, manifest: Object.freeze({ id: "offline-due", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }), sequences: Object.freeze([Object.freeze({ candidateHash: h.candidate, split: "training", lessonId: "movement-foundations", segmentKind: "demonstration", tags: Object.freeze([]), sourceScenario: scenario, tracks: Object.freeze({ observations: Object.freeze(states), actions: Object.freeze([Object.freeze({ kind: "command" as const, id: 1, tick: 1, command: Object.freeze({ type: "move" as const, x: 1_000, y: 0 }) })]), nativeEvents: Object.freeze([]), rewardComponents: Object.freeze(states.map((entry) => Object.freeze({ tick: entry.tick, value: null }))), intents: Object.freeze([]), terminal: Object.freeze({ tick: 1, semanticHash: stableVerificationHash(states[1]), terminated: true, truncated: false }) }) as never, sequenceHash: "c".repeat(16) })]), observationCount: 2, actionCount: 1, datasetHash: "d".repeat(16) }) satisfies TearAcademyTrainingDatasetV1;
const request = Object.freeze({ manifestId: "offline-due", trainerId: "c36", manifestVersion: 1, plan: { id: "offline-due", version: 1, seed: 1, reward: { components: [{ id: "score", source: "score.delta" as const, weight: 1, maximumSourceValue: 10, perTransitionCap: 10 }], totalMinimum: -10, totalMaximum: 10 }, limits: { maxTransitions: 4, maxEventsPerTransition: 4, maxRewardViolations: 0 as const } }, config: { epochs: 2, learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 10, maxMeanAbsoluteTdError: 10, maxConsecutiveDivergentEpochs: 2 } });
const immutablePlan = createTearOfflineRlPlan(dataset, request.plan), dueRequest = Object.freeze({ training: request, manifestHash: dataset.manifest.manifestHash, manifestRootHash: dataset.manifest.rootHash, datasetHash: dataset.datasetHash, planHash: immutablePlan.planHash, configurationHash: stableVerificationHash(request.config), rewardHash: immutablePlan.reward.rewardHash });
const at = "2026-08-08T00:01:00.000Z", budgets = Object.freeze({ computeBudgetHash: h.compute, storageBudgetHash: h.storage });

async function setup(input: Readonly<{ held?: boolean; changedDataset?: boolean }> = {}) {
  const backend = createMemoryGhostVaultBackend(), jobs = new TearFoundryJobVault(backend), schedules = new TearFoundryJobScheduleVault(backend), plan = createTearOfflineRlPlan(dataset, request.plan);
  const created = createTearFoundryJob({ id: "offline-due-job", createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized", inputs: { champion: { id: "champion", artifactHash: h.artifact }, corpusRecordHashes: [h.corpus], evaluationPlanHash: h.evaluation, rewardDefinitionHash: plan.reward.rewardHash, invariantSetHash: h.invariant, budgetHash: h.budget, stopConditionsHash: h.stop } }), collecting = transitionTearFoundryJob(created, "collecting", "2026-08-08T00:00:00.001Z", "collected"), job = transitionTearFoundryJob(collecting, "curating", "2026-08-08T00:00:00.002Z", "manifest admitted"); await jobs.persist(job);
  const schedule = createTearFoundryJobSchedule({ id: "offline-due-schedule", jobId: job.id, jobHash: job.jobHash, intervalMs: 60_000, computeBudgetHash: h.compute, storageBudgetHash: h.storage, stopConditionsHash: h.stop, state: "enabled", configuredAt: "2026-08-08T00:00:00.000Z" }); await schedules.persist(schedule);
  let held = input.held !== false, changedDataset = input.changedDataset === true;
  const records = () => held ? [{ candidateHash: h.candidate, recordHash: h.corpus }] : [], custody = { backend: () => backend, held: () => Promise.resolve(records()), inventory: () => Promise.resolve({ records: [{ candidateHash: h.candidate, recordHash: h.corpus }], rejectedKeys: [] }) } as unknown as TearAcademyCandidateCustodyStore;
  const manifest = { id: request.manifestId, reader: { kind: "trainer" as const, id: request.trainerId }, version: request.manifestVersion, manifestHash: dataset.manifest.manifestHash, rootHash: dataset.manifest.rootHash, entries: [{ custodyRecordHash: h.corpus }] };
  const corpus = { backend: () => backend, getManifest: () => Promise.resolve(manifest) } as unknown as TearAcademyCorpusStore;
  const loader = { load: () => Promise.resolve(changedDataset ? { ...dataset, datasetHash: "e".repeat(16) } : dataset) } as unknown as TearAcademyTrainingDatasetLoader;
  return { backend, jobs, schedules, schedule, dispatcher: new TearFoundryDueDispatcher(jobs, schedules, custody, corpus, loader), revoke: () => { held = false; }, changeDataset: () => { changedDataset = true; } };
}

async function resumeSetup() {
  const fixture = await setup();
  await fixture.dispatcher.runOfflineTrainingDueOnce(fixture.schedule.scheduleHash, dueRequest, at, budgets, "start");
  const training = await fixture.jobs.get("offline-due-job"); if (training === undefined) throw new Error("training head missing");
  const launchKey = (await fixture.backend.keys("analysis")).find((key) => key.startsWith("foundry-job-offline-training:v1:"));
  if (launchKey === undefined) throw new Error("launch missing");
  const schedule = createTearFoundryJobSchedule({ id: "offline-resume-schedule", jobId: training.id, jobHash: training.jobHash, intervalMs: 60_000, computeBudgetHash: h.compute, storageBudgetHash: h.storage, stopConditionsHash: h.stop, state: "enabled", configuredAt: "2026-08-08T00:00:00.000Z" });
  await fixture.schedules.persist(schedule);
  return { ...fixture, training, launchHash: launchKey.slice("foundry-job-offline-training:v1:".length), resumeSchedule: schedule };
}

describe("C36 lease-backed offline-Q due dispatch", () => {
  it("starts precisely one bounded C34 epoch and retries its durable lease receipt", async () => {
    const fixture = await setup(); expect(fixture.schedule).toMatchObject({ computeBudgetHash: budgets.computeBudgetHash, storageBudgetHash: budgets.storageBudgetHash, stopConditionsHash: h.stop }); await expect(fixture.jobs.get("offline-due-job")).resolves.toMatchObject({ phase: "curating", inputs: { stopConditionsHash: h.stop } }); const receipt = await fixture.dispatcher.runOfflineTrainingDueOnce(fixture.schedule.scheduleHash, dueRequest, at, budgets, "offline");
    expect(receipt).toMatchObject({ disposition: "collected", leaseId: "offline" }); await expect(fixture.jobs.get("offline-due-job")).resolves.toMatchObject({ phase: "training", events: [{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }, { sequence: 4 }] });
    await expect(fixture.dispatcher.runOfflineTrainingDueOnce(fixture.schedule.scheduleHash, dueRequest, at, budgets, "offline")).resolves.toEqual(receipt);
    expect(await fixture.backend.get("analysis", `foundry-job-due-lease:v1:${fixture.schedule.scheduleHash}`)).toBeUndefined(); expect((await fixture.backend.keys("analysis")).some((key) => key.startsWith("policy-"))).toBe(false);
  });

  it("refuses revoked, changed-dataset, budget-invalid, and early work without an extra successor", async () => {
    const revoked = await setup({ held: false }), before = await revoked.backend.keys("analysis"); await expect(revoked.dispatcher.runOfflineTrainingDueOnce(revoked.schedule.scheduleHash, dueRequest, at, budgets, "revoked")).rejects.toThrow(/not due/u); expect(await revoked.backend.keys("analysis")).toEqual(before);
    const changed = await setup({ changedDataset: true }); await expect(changed.dispatcher.runOfflineTrainingDueOnce(changed.schedule.scheduleHash, dueRequest, at, budgets, "changed")).rejects.toThrow(/immutable lineage/u); await expect(changed.jobs.get("offline-due-job")).resolves.toMatchObject({ phase: "curating" });
    const budget = await setup(); await expect(budget.dispatcher.runOfflineTrainingDueOnce(budget.schedule.scheduleHash, dueRequest, at, { ...budgets, computeBudgetHash: "f".repeat(16) }, "budget")).rejects.toThrow(/authorized/u);
    const early = await setup(); await expect(early.dispatcher.runOfflineTrainingDueOnce(early.schedule.scheduleHash, dueRequest, "2026-08-08T00:00:30.000Z", budgets, "early")).rejects.toThrow(/not due/u);
  });

  it("allows only one concurrent due claimant to create the training successor", async () => {
    const fixture = await setup(), results = await Promise.allSettled([fixture.dispatcher.runOfflineTrainingDueOnce(fixture.schedule.scheduleHash, dueRequest, at, budgets, "first"), fixture.dispatcher.runOfflineTrainingDueOnce(fixture.schedule.scheduleHash, dueRequest, at, budgets, "second")]);
    expect(results.filter((entry) => entry.status === "fulfilled")).toHaveLength(1); await expect(fixture.jobs.get("offline-due-job")).resolves.toMatchObject({ phase: "training", events: [{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }, { sequence: 4 }] });
  });
});

describe("C36 lease-backed offline-Q checkpoint resume dispatch", () => {
  it("requires a current training-head schedule, resumes exactly one epoch, and retries its receipt before lineage checks", async () => {
    const fixture = await resumeSetup();
    await expect(fixture.dispatcher.runOfflineResumeDueOnce(fixture.schedule.scheduleHash, fixture.launchHash, at, budgets, "old")).rejects.toThrow(/not due|authorized/u);
    const receipt = await fixture.dispatcher.runOfflineResumeDueOnce(fixture.resumeSchedule.scheduleHash, fixture.launchHash, at, budgets, "resume");
    expect(receipt).toMatchObject({ disposition: "collected", leaseId: "resume", jobHash: fixture.training.jobHash });
    await expect(fixture.jobs.get("offline-due-job")).resolves.toMatchObject({ phase: "training", events: [{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }, { sequence: 4 }, { sequence: 5 }] });
    await expect(fixture.dispatcher.runOfflineResumeDueOnce(fixture.resumeSchedule.scheduleHash, fixture.launchHash, at, budgets, "resume")).resolves.toEqual(receipt);
    expect(await fixture.backend.get("analysis", `foundry-job-due-lease:v1:${fixture.resumeSchedule.scheduleHash}`)).toBeUndefined();
  });

  it("refuses V1, changed lineage, revoked custody, budget-invalid, and early resume attempts", async () => {
    const v1 = await resumeSetup();
    await v1.backend.put("analysis", `foundry-job-offline-training:v1:${"f".repeat(16)}`, JSON.stringify({ format: "tear-foundry-offline-training-launch", schemaVersion: 1, launchHash: "f".repeat(16) }));
    await expect(v1.dispatcher.runOfflineResumeDueOnce(v1.resumeSchedule.scheduleHash, "f".repeat(16), at, budgets, "v1")).rejects.toThrow(/lineage/u);
    const changed = await resumeSetup(); changed.changeDataset();
    await expect(changed.dispatcher.runOfflineResumeDueOnce(changed.resumeSchedule.scheduleHash, changed.launchHash, at, budgets, "changed")).rejects.toThrow(/lineage/u);
    const revoked = await resumeSetup(); revoked.revoke();
    await expect(revoked.dispatcher.runOfflineResumeDueOnce(revoked.resumeSchedule.scheduleHash, revoked.launchHash, at, budgets, "revoked")).rejects.toThrow(/not due|custody/u);
    const budget = await resumeSetup();
    await expect(budget.dispatcher.runOfflineResumeDueOnce(budget.resumeSchedule.scheduleHash, budget.launchHash, at, { ...budgets, storageBudgetHash: "e".repeat(16) }, "budget")).rejects.toThrow(/authorized/u);
    const early = await resumeSetup();
    await expect(early.dispatcher.runOfflineResumeDueOnce(early.resumeSchedule.scheduleHash, early.launchHash, "2026-08-08T00:00:30.000Z", budgets, "early")).rejects.toThrow(/not due/u);
  });

  it("allows exactly one concurrent current-head resume claimant", async () => {
    const fixture = await resumeSetup(), results = await Promise.allSettled([
      fixture.dispatcher.runOfflineResumeDueOnce(fixture.resumeSchedule.scheduleHash, fixture.launchHash, at, budgets, "first"),
      fixture.dispatcher.runOfflineResumeDueOnce(fixture.resumeSchedule.scheduleHash, fixture.launchHash, at, budgets, "second"),
    ]);
    expect(results.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const job = await fixture.jobs.get("offline-due-job");
    expect(job).toMatchObject({ phase: "training" }); expect(job?.events).toHaveLength(5); expect(job?.events.at(-1)).toMatchObject({ sequence: 5, to: "training" });
  });
});

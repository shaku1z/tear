import { describe, expect, it } from "vitest";
import { stableVerificationHash } from "../../src/replay/hash";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { TearFoundryBoundContinuationCoordinator, TearFoundryExecutionBindingVault, TearFoundryJobScheduleVault, TearFoundryJobVault, createTearFoundryJob, createTearFoundryJobSchedule, transitionTearFoundryJob } from "../../src/agents";

const h = Object.freeze({ artifact: "a".repeat(16), corpus: "b".repeat(16), evaluation: "c".repeat(16), reward: "d".repeat(16), invariant: "e".repeat(16), budget: "f".repeat(16), stop: "1".repeat(16), compute: "2".repeat(16), storage: "3".repeat(16), action: "4".repeat(16) });
const offline = Object.freeze({ kind: "offline-launch" as const, offline: { training: { manifestId: "published", trainerId: "c36", manifestVersion: 1, plan: { id: "bound", version: 1, seed: 1, reward: { components: [{ id: "score", source: "score.delta" as const, weight: 1, maximumSourceValue: 1, perTransitionCap: 1 }], totalMinimum: -1, totalMaximum: 1 }, limits: { maxTransitions: 1, maxEventsPerTransition: 1, maxRewardViolations: 0 as const } }, config: { epochs: 1, learningRate: 0.5, gamma: 0.5, maxStateActionEntries: 1, maxAbsoluteQ: 1, maxMeanAbsoluteTdError: 1, maxConsecutiveDivergentEpochs: 1 } }, manifest: { id: "published", trainerId: "c36", version: 1 }, manifestHash: "5".repeat(16), manifestRootHash: "6".repeat(16), datasetHash: "7".repeat(16), planHash: "8".repeat(16), configurationHash: "9".repeat(16), rewardHash: h.reward } });
async function fixture(advance = true) {
  const backend = createMemoryGhostVaultBackend(), jobs = new TearFoundryJobVault(backend), schedules = new TearFoundryJobScheduleVault(backend);
  const source = createTearFoundryJob({ id: "bound-job", createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized", inputs: { champion: { id: "champion", artifactHash: h.artifact }, corpusRecordHashes: [h.corpus], evaluationPlanHash: h.evaluation, rewardDefinitionHash: h.reward, invariantSetHash: h.invariant, budgetHash: h.budget, stopConditionsHash: h.stop } }); await jobs.persist(source);
  const schedule = createTearFoundryJobSchedule({ id: "bound-schedule", jobId: source.id, jobHash: source.jobHash, intervalMs: 60_000, computeBudgetHash: h.compute, storageBudgetHash: h.storage, stopConditionsHash: h.stop, state: "enabled", configuredAt: "2026-08-08T00:00:00.000Z" }); await schedules.persist(schedule);
  const binding = await new TearFoundryExecutionBindingVault(jobs).bindV2(schedule, source, { payload: { kind: "none" }, successorDeclaration: { kind: "trainer-manifest", manifest: { id: "published", trainerId: "c36", version: 1 } } });
  const next = transitionTearFoundryJob(source, "collecting", "2026-08-08T00:01:00.000Z", "collected"); if (advance) await jobs.persistSuccessor(source, next);
  const draft = { format: "tear-foundry-due-attempt" as const, schemaVersion: 1 as const, scheduleHash: schedule.scheduleHash, jobHash: source.jobHash, attemptedAt: "2026-08-08T00:01:00.000Z", leaseId: "lease", actionHash: h.action, disposition: "collected" as const };
  const attempt = Object.freeze({ ...draft, receiptHash: stableVerificationHash(draft) }); await backend.put("analysis", `foundry-job-due-attempt:v1:${h.action}`, JSON.stringify(attempt));
  return { backend, jobs, schedules, source, schedule, binding, next, attempt, coordinator: new TearFoundryBoundContinuationCoordinator(jobs, schedules, { held: () => Promise.resolve(true) }) };
}
describe("C36 V2 bound successor continuation", () => {
  it("atomically binds the declared legal successor and retries by receipt", async () => {
    const f = await fixture(), input = [f.schedule.scheduleHash, f.binding.bindingHash, f.source, f.next, f.attempt, offline, "2026-08-08T00:01:00.000Z", { computeBudgetHash: h.compute, storageBudgetHash: h.storage }] as const;
    const first = await f.coordinator.continueBoundAttempt(...input);
    expect(first).toMatchObject({ schedule: { jobHash: f.next.jobHash, revision: 2 }, binding: { schemaVersion: 2, job: { phase: "collecting", jobHash: f.next.jobHash }, payload: { kind: "trainer-manifest" } } });
    await expect(f.coordinator.continueBoundAttempt(...input)).resolves.toEqual(first);
  });
  it("refuses a V1 pointer, corrupt receipt, stale successor, custody, and budget", async () => {
    const f = await fixture(), args = [f.schedule.scheduleHash, f.binding.bindingHash, f.source, f.next, f.attempt, offline, "2026-08-08T00:01:00.000Z", { computeBudgetHash: h.compute, storageBudgetHash: h.storage }] as const;
    await f.backend.put("analysis", `foundry-job-execution-binding-current:v2:${f.schedule.id}:${String(f.schedule.revision)}:${f.schedule.scheduleHash}`, "0".repeat(16)); await expect(f.coordinator.continueBoundAttempt(...args)).rejects.toThrow(/V2 binding|evidence/u);
    const g = await fixture(); await expect(g.coordinator.continueBoundAttempt(g.schedule.scheduleHash, g.binding.bindingHash, g.source, g.next, { ...g.attempt, receiptHash: "0".repeat(16) }, offline, "2026-08-08T00:01:00.000Z", { computeBudgetHash: h.compute, storageBudgetHash: h.storage })).rejects.toThrow(/integrity/u);
    const denied = new TearFoundryBoundContinuationCoordinator(g.jobs, g.schedules, { held: () => Promise.resolve(false) }); await expect(denied.continueBoundAttempt(g.schedule.scheduleHash, g.binding.bindingHash, g.source, g.next, g.attempt, offline, "2026-08-08T00:01:00.000Z", { computeBudgetHash: h.compute, storageBudgetHash: h.storage })).rejects.toThrow(/authorized/u);
    await expect(g.coordinator.continueBoundAttempt(g.schedule.scheduleHash, g.binding.bindingHash, g.source, g.next, g.attempt, offline, "2026-08-08T00:01:00.000Z", { computeBudgetHash: h.storage, storageBudgetHash: h.storage })).rejects.toThrow(/authorized/u);
  });
  it("has one atomic winner and never permits a V1 binding", async () => {
    const f = await fixture(), args = [f.schedule.scheduleHash, f.binding.bindingHash, f.source, f.next, f.attempt, offline, "2026-08-08T00:01:00.000Z", { computeBudgetHash: h.compute, storageBudgetHash: h.storage }] as const;
    const outcomes = await Promise.allSettled([f.coordinator.continueBoundAttempt(...args), f.coordinator.continueBoundAttempt(...args)]);
    expect(outcomes.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const legacyFixture = await fixture(false), legacy = await new TearFoundryExecutionBindingVault(legacyFixture.jobs).bind(legacyFixture.schedule, legacyFixture.source, { kind: "none" }); await legacyFixture.jobs.persistSuccessor(legacyFixture.source, legacyFixture.next);
    await expect(legacyFixture.coordinator.continueBoundAttempt(legacyFixture.schedule.scheduleHash, legacy.bindingHash, legacyFixture.source, legacyFixture.next, legacyFixture.attempt, offline, "2026-08-08T00:01:00.000Z", { computeBudgetHash: h.compute, storageBudgetHash: h.storage })).rejects.toThrow(/V2/u);
  });
});

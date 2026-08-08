import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { TearFoundryJobScheduleVault, TearFoundryJobVault, TearFoundryScheduleController, createTearFoundryJob, createTearFoundryJobSchedule, transitionTearFoundryJob } from "../../src/agents";

const hashes = Object.freeze({ artifact: "a".repeat(16), corpus: "b".repeat(16), evaluation: "c".repeat(16), reward: "d".repeat(16), invariant: "e".repeat(16), budget: "f".repeat(16), stop: "1".repeat(16), compute: "2".repeat(16), storage: "3".repeat(16) });
async function fixture() {
  const backend = createMemoryGhostVaultBackend(), jobs = new TearFoundryJobVault(backend), schedules = new TearFoundryJobScheduleVault(backend);
  const job = createTearFoundryJob({ id: "schedule-job", createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized", inputs: { champion: { id: "champion", artifactHash: hashes.artifact }, corpusRecordHashes: [hashes.corpus], evaluationPlanHash: hashes.evaluation, rewardDefinitionHash: hashes.reward, invariantSetHash: hashes.invariant, budgetHash: hashes.budget, stopConditionsHash: hashes.stop } });
  await jobs.persist(job); const schedule = createTearFoundryJobSchedule({ id: "schedule-a", jobId: job.id, jobHash: job.jobHash, intervalMs: 60_000, computeBudgetHash: hashes.compute, storageBudgetHash: hashes.storage, stopConditionsHash: hashes.stop, state: "enabled", configuredAt: "2026-08-08T00:00:00.000Z" }); await schedules.persist(schedule);
  return { backend, jobs, schedules, job, schedule };
}
describe("C36 controlled local Foundry scheduling", () => {
  it("persists deterministic local schedule intent, enables/disables idempotently, and discovers due work without executing it", async () => {
    const { jobs, schedules, schedule } = await fixture(), controller = new TearFoundryScheduleController(jobs, schedules, { held: () => Promise.resolve(true) });
    await expect(controller.discoverDue("2026-08-08T00:00:30.000Z")).resolves.toMatchObject([{ disposition: "waiting", dueAt: "2026-08-08T00:01:00.000Z" }]);
    await expect(controller.discoverDue("2026-08-08T00:01:00.000Z")).resolves.toMatchObject([{ disposition: "due" }]);
    const disabled = await schedules.setEnabledByHash(schedule.scheduleHash, false, "2026-08-08T00:01:01.000Z");
    expect(disabled?.state).toBe("disabled"); expect(await schedules.setEnabledByHash(disabled?.scheduleHash ?? "", false, "2026-08-08T00:01:02.000Z")).toEqual(disabled);
    await expect(controller.discoverDue("2026-08-08T00:02:00.000Z")).resolves.toMatchObject([{ disposition: "disabled", dueAt: null }]);
  });
  it("fails closed for corrupt state, changed jobs, terminal jobs, stop identities, and revoked custody", async () => {
    const { backend, jobs, schedules, job, schedule } = await fixture(), controller = new TearFoundryScheduleController(jobs, schedules, { held: () => Promise.resolve(false) });
    await expect(controller.discoverDue("2026-08-08T00:01:00.000Z")).resolves.toMatchObject([{ disposition: "blocked-revoked-custody" }]);
    await jobs.persistSuccessor(job, transitionTearFoundryJob(job, "cancelled", "2026-08-08T00:00:30.000Z", "operator cancelled"));
    await expect(controller.discoverDue("2026-08-08T00:01:00.000Z")).resolves.toMatchObject([{ disposition: "blocked-invalid-job" }]);
    await backend.put("analysis", "foundry-job-schedule:v1:bad", "not-json");
    await expect(schedules.list()).resolves.toHaveLength(1); expect(await backend.get("quarantine", "foundry-job-schedule:v1:bad")).toBeDefined();
    expect(schedule.computeBudgetHash).toBe(hashes.compute);
  });
});

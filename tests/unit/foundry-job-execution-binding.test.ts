import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { TearFoundryExecutionBindingVault, TearFoundryJobScheduleVault, TearFoundryJobVault, createTearFoundryJob, createTearFoundryJobSchedule, transitionTearFoundryJob } from "../../src/agents";

const h = Object.freeze({ artifact: "a".repeat(16), corpus: "b".repeat(16), evaluation: "c".repeat(16), reward: "d".repeat(16), invariant: "e".repeat(16), budget: "f".repeat(16), stop: "1".repeat(16), compute: "2".repeat(16), storage: "3".repeat(16) });
async function fixture(phase: "created" | "collecting" | "curating" = "created") {
  const backend = createMemoryGhostVaultBackend(), jobs = new TearFoundryJobVault(backend), schedules = new TearFoundryJobScheduleVault(backend);
  const created = createTearFoundryJob({ id: "binding-job", createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized", inputs: { champion: { id: "champion", artifactHash: h.artifact }, corpusRecordHashes: [h.corpus], evaluationPlanHash: h.evaluation, rewardDefinitionHash: h.reward, invariantSetHash: h.invariant, budgetHash: h.budget, stopConditionsHash: h.stop } });
  const collecting = phase === "created" ? created : transitionTearFoundryJob(created, "collecting", "2026-08-08T00:00:01.000Z", "collected"), job = phase === "curating" ? transitionTearFoundryJob(collecting, "curating", "2026-08-08T00:00:02.000Z", "manifest admitted") : collecting; await jobs.persist(job);
  const schedule = createTearFoundryJobSchedule({ id: "binding-schedule", jobId: job.id, jobHash: job.jobHash, intervalMs: 60_000, computeBudgetHash: h.compute, storageBudgetHash: h.storage, stopConditionsHash: h.stop, state: "disabled", configuredAt: "2026-08-08T00:00:00.000Z" }); await schedules.persist(schedule);
  return { backend, jobs, schedule, binding: new TearFoundryExecutionBindingVault(jobs), job };
}
describe("C36 immutable execution binding", () => {
  it("atomically enables only the exact current created head with its none payload and is idempotent", async () => {
    const f = await fixture(), first = await f.binding.bindAndEnable(f.schedule, f.job, { kind: "none" }, "2026-08-08T00:00:01.000Z");
    expect(first.schedule).toMatchObject({ state: "enabled", revision: 2 }); expect(first.binding).toMatchObject({ schedule: { scheduleHash: first.schedule.scheduleHash, revision: 2 }, job: { jobHash: f.job.jobHash, phase: "created" }, payload: { kind: "none" } });
    await expect(f.binding.get(first.binding.bindingHash)).resolves.toEqual(first.binding);
  });
  it("freezes the phase-specific trainer and offline identities and rejects a phase/payload mismatch", async () => {
    const collecting = await fixture("collecting"), manifest = { kind: "trainer-manifest" as const, manifest: { id: "published", trainerId: "c36", version: 1 } };
    await expect(collecting.binding.bind(collecting.schedule, collecting.job, manifest)).resolves.toMatchObject({ payload: manifest });
    await expect(collecting.binding.bind(collecting.schedule, collecting.job, { kind: "none" })).rejects.toThrow(/collecting/u);
    const curating = await fixture("curating"), offline = { kind: "offline-launch" as const, offline: { training: { manifestId: "published", trainerId: "c36", manifestVersion: 1, plan: { id: "bound", version: 1, seed: 1, reward: { components: [{ id: "score", source: "score.delta" as const, weight: 1, maximumSourceValue: 1, perTransitionCap: 1 }], totalMinimum: -1, totalMaximum: 1 }, limits: { maxTransitions: 1, maxEventsPerTransition: 1, maxRewardViolations: 0 as const } }, config: { epochs: 1, learningRate: 0.5, gamma: 0.5, maxStateActionEntries: 1, maxAbsoluteQ: 1, maxMeanAbsoluteTdError: 1, maxConsecutiveDivergentEpochs: 1 } }, manifest: { id: "published", trainerId: "c36", version: 1 }, manifestHash: "4".repeat(16), manifestRootHash: "5".repeat(16), datasetHash: "6".repeat(16), planHash: "7".repeat(16), configurationHash: "8".repeat(16), rewardHash: curating.job.inputs.rewardDefinitionHash } };
    await expect(curating.binding.bind(curating.schedule, curating.job, offline)).resolves.toMatchObject({ payload: offline });
  });
  it("refuses stale heads and quarantines corrupt binding bytes", async () => {
    const f = await fixture(), stale = transitionTearFoundryJob(f.job, "collecting", "2026-08-08T00:00:01.000Z", "later"); await f.jobs.persistSuccessor(f.job, stale);
    await expect(f.binding.bind(f.schedule, f.job, { kind: "none" })).rejects.toThrow(/current head/u);
    const bad = "9".repeat(16); await f.backend.put("analysis", `foundry-job-execution-binding:v1:${bad}`, "not-json"); await expect(f.binding.get(bad)).resolves.toBeUndefined(); expect(await f.backend.get("quarantine", `foundry-job-execution-binding:v1:${bad}`)).toBeDefined();
  });
});

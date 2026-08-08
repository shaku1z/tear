import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import { TearFoundryDueDispatcher, TearFoundryJobScheduleVault, TearFoundryJobVault, createTearFoundryJob, createTearFoundryJobSchedule, transitionTearFoundryJob, type TearAcademyCandidateCustodyStore, type TearAcademyCorpusStore } from "../../src/agents";

const h = Object.freeze({ artifact: "a".repeat(16), corpus: "b".repeat(16), candidate: "c".repeat(16), evaluation: "d".repeat(16), reward: "e".repeat(16), invariant: "f".repeat(16), budget: "1".repeat(16), stop: "2".repeat(16), compute: "3".repeat(16), storage: "4".repeat(16) });
async function setup(held = true) {
  const backend = createMemoryGhostVaultBackend(), jobs = new TearFoundryJobVault(backend), schedules = new TearFoundryJobScheduleVault(backend);
  const job = createTearFoundryJob({ id: "due-job", createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized", inputs: { champion: { id: "champion", artifactHash: h.artifact }, corpusRecordHashes: [h.corpus], evaluationPlanHash: h.evaluation, rewardDefinitionHash: h.reward, invariantSetHash: h.invariant, budgetHash: h.budget, stopConditionsHash: h.stop } }); await jobs.persist(job);
  const schedule = createTearFoundryJobSchedule({ id: "due-schedule", jobId: job.id, jobHash: job.jobHash, intervalMs: 60_000, computeBudgetHash: h.compute, storageBudgetHash: h.storage, stopConditionsHash: h.stop, state: "enabled", configuredAt: "2026-08-08T00:00:00.000Z" }); await schedules.persist(schedule);
  const records = held ? [{ candidateHash: h.candidate, recordHash: h.corpus }] : [];
  const custody = { backend: () => backend, held: () => Promise.resolve(records), inventory: () => Promise.resolve({ records, rejectedKeys: [] }) } as unknown as TearAcademyCandidateCustodyStore;
  return { backend, jobs, schedule, dispatcher: new TearFoundryDueDispatcher(jobs, schedules, custody) };
}
const at = "2026-08-08T00:01:00.000Z", budgets = Object.freeze({ computeBudgetHash: h.compute, storageBudgetHash: h.storage });
describe("C36 lease-backed collection-only due dispatch", () => {
  it("claims exactly one concurrent caller, releases the lease with a bound durable receipt, and retries identically", async () => {
    const { backend, jobs, schedule, dispatcher } = await setup();
    const values = await Promise.allSettled([dispatcher.runDueOnce(schedule.scheduleHash, at, budgets, "first"), dispatcher.runDueOnce(schedule.scheduleHash, at, budgets, "second")]);
    expect(values.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const winner = values.find((entry): entry is PromiseFulfilledResult<Awaited<ReturnType<typeof dispatcher.runDueOnce>>> => entry.status === "fulfilled")?.value;
    expect(winner?.disposition).toBe("collected"); expect(winner?.leaseId).toBe("first"); expect(winner?.actionHash).toMatch(/^[a-f0-9]{16}$/u);
    await expect(dispatcher.runDueOnce(schedule.scheduleHash, at, budgets, winner?.leaseId ?? "")).resolves.toEqual(winner);
    await expect(jobs.get("due-job")).resolves.toMatchObject({ phase: "collecting", events: [{ sequence: 1 }, { sequence: 2 }] });
    expect(await backend.get("analysis", `foundry-job-due-lease:v1:${schedule.scheduleHash}`)).toBeUndefined();
  });

  it("reclaims only an expired lease and refuses stale, revoked, terminal, or budget-invalid work without double collection", async () => {
    const { backend, jobs, schedule, dispatcher } = await setup(false);
    const expired = { format: "tear-foundry-due-lease" as const, schemaVersion: 1 as const, scheduleHash: schedule.scheduleHash, jobHash: schedule.jobHash, leaseId: "crashed", actionHash: "9".repeat(16), claimedAt: "2026-08-08T00:00:00.000Z", expiresAt: "2026-08-08T00:00:30.000Z" };
    await backend.put("analysis", `foundry-job-due-lease:v1:${schedule.scheduleHash}`, JSON.stringify({ ...expired, leaseHash: stableVerificationHash(expired) }));
    await expect(dispatcher.runDueOnce(schedule.scheduleHash, at, budgets, "recover")).resolves.toMatchObject({ disposition: "not-due", leaseId: "recover" });
    expect(await jobs.get("due-job")).toMatchObject({ phase: "created" });
    const held = await setup(true);
    const notDue = await held.dispatcher.runDueOnce(held.schedule.scheduleHash, "2026-08-08T00:00:30.000Z", budgets, "early"); expect(notDue.disposition).toBe("not-due");
    const blocked = await held.dispatcher.runDueOnce(held.schedule.scheduleHash, at, { ...budgets, computeBudgetHash: "5".repeat(16) }, "budget"); expect(blocked.disposition).toBe("blocked");
  });
});

describe("C36 lease-backed curated-manifest due dispatch", () => {
  it("admits only the exact published manifest once, then refuses stale/retry work", async () => {
    const backend = createMemoryGhostVaultBackend(), jobs = new TearFoundryJobVault(backend), schedules = new TearFoundryJobScheduleVault(backend);
    const created = createTearFoundryJob({ id: "manifest-job", createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized", inputs: { champion: { id: "champion", artifactHash: h.artifact }, corpusRecordHashes: [h.corpus], evaluationPlanHash: h.evaluation, rewardDefinitionHash: h.reward, invariantSetHash: h.invariant, budgetHash: h.budget, stopConditionsHash: h.stop } }), job = transitionTearFoundryJob(created, "collecting", "2026-08-08T00:00:01.000Z", "collected"); await jobs.persist(job);
    const schedule = createTearFoundryJobSchedule({ id: "manifest-schedule", jobId: job.id, jobHash: job.jobHash, intervalMs: 60_000, computeBudgetHash: h.compute, storageBudgetHash: h.storage, stopConditionsHash: h.stop, state: "enabled", configuredAt: "2026-08-08T00:00:00.000Z" }); await schedules.persist(schedule);
    const records = [{ candidateHash: h.candidate, recordHash: h.corpus }], custody = { backend: () => backend, held: () => Promise.resolve(records), inventory: () => Promise.resolve({ records, rejectedKeys: [] }) } as unknown as TearAcademyCandidateCustodyStore;
    const manifest = { id: "published", reader: { kind: "trainer", id: "c36" }, version: 1, entries: [{ custodyRecordHash: h.corpus, split: "training", entryHash: "5".repeat(16) }], manifestHash: "6".repeat(16), rootHash: "7".repeat(16) };
    const corpus = { backend: () => backend, getManifest: () => Promise.resolve(manifest) } as unknown as TearAcademyCorpusStore;
    const dispatcher = new TearFoundryDueDispatcher(jobs, schedules, custody, corpus), request = { id: "published", trainerId: "c36", version: 1 };
    const receipt = await dispatcher.runManifestAdmissionDueOnce(schedule.scheduleHash, request, at, budgets, "manifest");
    expect(receipt.disposition).toBe("collected"); await expect(jobs.get("manifest-job")).resolves.toMatchObject({ phase: "curating" });
    await expect(dispatcher.runManifestAdmissionDueOnce(schedule.scheduleHash, request, at, budgets, "manifest")).resolves.toEqual(receipt);
    await expect(dispatcher.runManifestAdmissionDueOnce(schedule.scheduleHash, request, at, { ...budgets, storageBudgetHash: "8".repeat(16) }, "bad-budget")).rejects.toThrow(/not authorized/u);
  });
});

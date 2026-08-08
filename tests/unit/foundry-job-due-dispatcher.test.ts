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
  return { backend, jobs, schedules, job, schedule, dispatcher: new TearFoundryDueDispatcher(jobs, schedules, custody) };
}
const at = "2026-08-08T00:01:00.000Z", budgets = Object.freeze({ computeBudgetHash: h.compute, storageBudgetHash: h.storage });
async function manifestSetup(input: Readonly<{ held?: boolean; entries?: readonly string[]; available?: boolean }> = {}) {
  const backend = createMemoryGhostVaultBackend(), jobs = new TearFoundryJobVault(backend), schedules = new TearFoundryJobScheduleVault(backend);
  const created = createTearFoundryJob({ id: "manifest-job", createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized", inputs: { champion: { id: "champion", artifactHash: h.artifact }, corpusRecordHashes: [h.corpus], evaluationPlanHash: h.evaluation, rewardDefinitionHash: h.reward, invariantSetHash: h.invariant, budgetHash: h.budget, stopConditionsHash: h.stop } }), job = transitionTearFoundryJob(created, "collecting", "2026-08-08T00:00:01.000Z", "collected"); await jobs.persist(job);
  const schedule = createTearFoundryJobSchedule({ id: "manifest-schedule", jobId: job.id, jobHash: job.jobHash, intervalMs: 60_000, computeBudgetHash: h.compute, storageBudgetHash: h.storage, stopConditionsHash: h.stop, state: "enabled", configuredAt: "2026-08-08T00:00:00.000Z" }); await schedules.persist(schedule);
  const records = input.held === false ? [] : [{ candidateHash: h.candidate, recordHash: h.corpus }], inventoryRecords = [{ candidateHash: h.candidate, recordHash: h.corpus }];
  const custody = { backend: () => backend, held: () => Promise.resolve(records), inventory: () => Promise.resolve({ records: inventoryRecords, rejectedKeys: [] }) } as unknown as TearAcademyCandidateCustodyStore;
  const entryHashes = input.entries ?? [h.corpus];
  const manifest = input.available === false ? undefined : { id: "published", reader: { kind: "trainer", id: "c36" }, version: 1, entries: entryHashes.map((custodyRecordHash, index) => ({ custodyRecordHash, split: "training", entryHash: String(index + 5).repeat(16).slice(0, 16) })), manifestHash: "6".repeat(16), rootHash: "7".repeat(16) };
  const corpus = { backend: () => backend, getManifest: () => Promise.resolve(manifest) } as unknown as TearAcademyCorpusStore;
  return { backend, jobs, schedule, dispatcher: new TearFoundryDueDispatcher(jobs, schedules, custody, corpus), request: { id: "published", trainerId: "c36", version: 1 } };
}
describe("C36 lease-backed collection-only due dispatch", () => {
  it("claims exactly one concurrent caller, releases the lease with a bound durable receipt, and retries identically", async () => {
    const { backend, jobs, schedule, dispatcher } = await setup();
    const values = await Promise.allSettled([dispatcher.runDueOnce(schedule.scheduleHash, at, budgets, "first"), dispatcher.runDueOnce(schedule.scheduleHash, at, budgets, "second")]);
    expect(values.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const winner = values.find((entry): entry is PromiseFulfilledResult<Awaited<ReturnType<typeof dispatcher.runDueOnce>>> => entry.status === "fulfilled")?.value;
    expect(winner?.disposition).toBe("collected"); expect(winner?.leaseId).toBe("first"); expect(winner?.actionHash).toMatch(/^[a-f0-9]{16}$/u); expect(winner?.successorExecutionBindingMaterial).toBeUndefined();
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

describe("C36 bounded schedule continuation coordinator", () => {
  async function collected(input: Readonly<{ held?: boolean }> = {}) {
    const fixture = await setup(input.held), receipt = await fixture.dispatcher.runDueOnce(fixture.schedule.scheduleHash, at, budgets, "collect"), next = await fixture.jobs.get("due-job");
    if (next === undefined) throw new Error("collection successor missing");
    return { ...fixture, receipt, next };
  }
  const authority = { held: () => Promise.resolve(true) };
  it("rebinds one successful due collection to its current successor and retries the continuation receipt", async () => {
    const fixture = await collected();
    const rebound = await fixture.schedules.continueAfterAttempt(fixture.schedule.scheduleHash, fixture.job, fixture.next, fixture.receipt, at, budgets, authority, fixture.jobs);
    expect(rebound).toMatchObject({ jobHash: fixture.next.jobHash, revision: 2 }); await expect(fixture.jobs.get("due-job")).resolves.toEqual(fixture.next);
    await expect(fixture.schedules.continueAfterAttempt(fixture.schedule.scheduleHash, fixture.job, fixture.next, fixture.receipt, at, budgets, authority, fixture.jobs)).resolves.toEqual(rebound);
  });
  it("refuses terminal, stale, revoked, budget-invalid, and early continuation without moving the schedule", async () => {
    const terminal = await collected(), cancelled = transitionTearFoundryJob(terminal.next, "cancelled", "2026-08-08T00:01:01.000Z", "operator stop"); await terminal.jobs.persistSuccessor(terminal.next, cancelled);
    await expect(terminal.schedules.continueAfterAttempt(terminal.schedule.scheduleHash, terminal.job, cancelled, terminal.receipt, "2026-08-08T00:02:00.000Z", budgets, authority, terminal.jobs)).rejects.toThrow(/successor|lineage/u);
    const stale = await collected();
    await expect(stale.schedules.continueAfterAttempt(stale.schedule.scheduleHash, stale.job, stale.next, stale.receipt, "2026-08-08T00:00:30.000Z", budgets, authority, stale.jobs)).rejects.toThrow(/due/u);
    const revoked = await collected();
    await expect(revoked.schedules.continueAfterAttempt(revoked.schedule.scheduleHash, revoked.job, revoked.next, revoked.receipt, at, budgets, { held: () => Promise.resolve(false) }, revoked.jobs)).rejects.toThrow(/authorized/u);
    const budget = await collected();
    await expect(budget.schedules.continueAfterAttempt(budget.schedule.scheduleHash, budget.job, budget.next, budget.receipt, at, { ...budgets, computeBudgetHash: "5".repeat(16) }, authority, budget.jobs)).rejects.toThrow(/authorized/u);
  });
  it("allows one concurrent continuation claimant and refuses a source receipt from another schedule", async () => {
    const fixture = await collected(), calls = await Promise.allSettled([
      fixture.schedules.continueAfterAttempt(fixture.schedule.scheduleHash, fixture.job, fixture.next, fixture.receipt, at, budgets, authority, fixture.jobs),
      fixture.schedules.continueAfterAttempt(fixture.schedule.scheduleHash, fixture.job, fixture.next, fixture.receipt, at, budgets, authority, fixture.jobs),
    ]);
    expect(calls.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const invalid = await collected();
    await expect(invalid.schedules.continueAfterAttempt("f".repeat(16), invalid.job, invalid.next, invalid.receipt, at, budgets, authority, invalid.jobs)).rejects.toThrow(/source attempt/u);
  });
});

describe("C36 lease-backed curated-manifest due dispatch", () => {
  it("admits only the exact published manifest once, then refuses stale/retry work", async () => {
    const { jobs, schedule, dispatcher, request } = await manifestSetup();
    const receipt = await dispatcher.runManifestAdmissionDueOnce(schedule.scheduleHash, request, at, budgets, "manifest");
    expect(receipt.disposition).toBe("collected"); expect(receipt.successorExecutionBindingMaterial).toBeUndefined(); await expect(jobs.get("manifest-job")).resolves.toMatchObject({ phase: "curating" });
    await expect(dispatcher.runManifestAdmissionDueOnce(schedule.scheduleHash, request, at, budgets, "manifest")).resolves.toEqual(receipt);
    await expect(dispatcher.runManifestAdmissionDueOnce(schedule.scheduleHash, request, at, { ...budgets, storageBudgetHash: "8".repeat(16) }, "bad-budget")).rejects.toThrow(/not authorized/u);
  });

  it("fails closed on absent, mismatched, or revoked C31 inputs without mutating C31", async () => {
    const absent = await manifestSetup({ available: false });
    await expect(absent.dispatcher.runManifestAdmissionDueOnce(absent.schedule.scheduleHash, absent.request, at, budgets, "absent")).resolves.toMatchObject({ disposition: "no-authorized-corpus" });
    await expect(absent.jobs.get("manifest-job")).resolves.toMatchObject({ phase: "failed" });
    const mismatch = await manifestSetup({ entries: ["9".repeat(16)] });
    await expect(mismatch.dispatcher.runManifestAdmissionDueOnce(mismatch.schedule.scheduleHash, mismatch.request, at, budgets, "mismatch")).resolves.toMatchObject({ disposition: "no-authorized-corpus" });
    await expect(mismatch.jobs.get("manifest-job")).resolves.toMatchObject({ phase: "failed" });
    const revoked = await manifestSetup({ held: false }), before = await revoked.backend.keys("analysis");
    await expect(revoked.dispatcher.runManifestAdmissionDueOnce(revoked.schedule.scheduleHash, revoked.request, at, budgets, "revoked")).rejects.toThrow(/not due/u);
    expect(await revoked.jobs.get("manifest-job")).toMatchObject({ phase: "collecting" });
    expect(await revoked.backend.keys("analysis")).toEqual(before);
  });

  it("refuses an early or concurrent claim and leaves one legal successor", async () => {
    const early = await manifestSetup();
    await expect(early.dispatcher.runManifestAdmissionDueOnce(early.schedule.scheduleHash, early.request, "2026-08-08T00:00:30.000Z", budgets, "early")).rejects.toThrow(/not due/u);
    await expect(early.jobs.get("manifest-job")).resolves.toMatchObject({ phase: "collecting", events: [{ sequence: 1 }, { sequence: 2 }] });
    const concurrent = await manifestSetup();
    const results = await Promise.allSettled([concurrent.dispatcher.runManifestAdmissionDueOnce(concurrent.schedule.scheduleHash, concurrent.request, at, budgets, "first"), concurrent.dispatcher.runManifestAdmissionDueOnce(concurrent.schedule.scheduleHash, concurrent.request, at, budgets, "second")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await expect(concurrent.jobs.get("manifest-job")).resolves.toMatchObject({ phase: "curating", events: [{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }] });
    expect(await concurrent.backend.get("analysis", `foundry-job-due-lease:v1:${concurrent.schedule.scheduleHash}`)).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";

import { createMemoryGhostVaultBackend } from "../../src/ghost";
import {
  TearFoundryCollectionExecutor,
  TearFoundryJobVault,
  createTearFoundryJob,
  transitionTearFoundryJob,
  type TearAcademyCandidateCustodyStore,
} from "../../src/agents";

const values = Object.freeze({ artifact: "1111111111111111", corpus: "2222222222222222", candidate: "3333333333333333",
  evaluation: "4444444444444444", reward: "5555555555555555", invariants: "6666666666666666", budget: "7777777777777777", stops: "8888888888888888" });
function job() { return createTearFoundryJob({ id: "collection-job", createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized request", inputs: {
  champion: { id: "champion", artifactHash: values.artifact }, corpusRecordHashes: [values.corpus], evaluationPlanHash: values.evaluation,
  rewardDefinitionHash: values.reward, invariantSetHash: values.invariants, budgetHash: values.budget, stopConditionsHash: values.stops } }); }
function custody(backend: ReturnType<typeof createMemoryGhostVaultBackend>, records: readonly Readonly<{ candidateHash: string; recordHash: string }>[]): TearAcademyCandidateCustodyStore {
  return { backend: () => backend, held: () => Promise.resolve(records) } as unknown as TearAcademyCandidateCustodyStore;
}

describe("C36 authorized Foundry collection", () => {
  it("collects only exact currently held C31 custody and persists the resumable successor", async () => {
    const backend = createMemoryGhostVaultBackend(), vault = new TearFoundryJobVault(backend), original = job(); await vault.persist(original);
    const executor = new TearFoundryCollectionExecutor(vault, custody(backend, [{ candidateHash: values.candidate, recordHash: values.corpus }]));
    const result = await executor.collect(original, "2026-08-08T00:01:00.000Z");
    expect(result).toMatchObject({ job: { phase: "collecting" }, receipt: { disposition: "authorized", records: [{ recordHash: values.corpus }] } });
    await expect(vault.get(original.id)).resolves.toMatchObject({ jobHash: result.job.jobHash, phase: "collecting" });
    await expect(executor.collect(original, "2026-08-08T00:01:00.000Z")).resolves.toMatchObject({ job: { jobHash: result.job.jobHash }, receipt: { receiptHash: result.receipt.receiptHash } });
  });

  it("fails safely when custody is missing, revoked, or expired at action time", async () => {
    const backend = createMemoryGhostVaultBackend(), vault = new TearFoundryJobVault(backend), original = job(); await vault.persist(original);
    const result = await new TearFoundryCollectionExecutor(vault, custody(backend, [])).collect(original, "2026-08-08T00:01:00.000Z");
    expect(result).toMatchObject({ job: { phase: "failed" }, receipt: { disposition: "no-authorized-corpus", records: [] } });
  });

  it("refuses rewritten or branched successor histories", async () => {
    const backend = createMemoryGhostVaultBackend(), vault = new TearFoundryJobVault(backend), original = job(); await vault.persist(original);
    const successor = transitionTearFoundryJob(original, "collecting", "2026-08-08T00:01:00.000Z", "authorized custody");
    await vault.persistSuccessor(original, successor);
    const branch = transitionTearFoundryJob(original, "failed", "2026-08-08T00:01:00.000Z", "different path");
    await expect(vault.persistSuccessor(original, branch)).rejects.toThrow(/durable current state/u);
    await expect(vault.persistSuccessor(successor, { ...successor, inputs: { ...successor.inputs, budgetHash: values.stops } })).rejects.toThrow(/integrity|successor/u);
  });
});

import { describe, expect, it } from "vitest";

import { createMemoryGhostVaultBackend } from "../../src/ghost";
import {
  TearFoundryCuratedManifestExecutor,
  TearFoundryJobVault,
  createTearFoundryJob,
  transitionTearFoundryJob,
  type TearAcademyCandidateCustodyStore,
  type TearAcademyCorpusStore,
} from "../../src/agents";

const values = Object.freeze({ artifact: "1111111111111111", corpus: "2222222222222222", candidate: "3333333333333333", entry: "4444444444444444", manifest: "5555555555555555", root: "6666666666666666", evaluation: "7777777777777777", reward: "8888888888888888", invariants: "9999999999999999", budget: "aaaaaaaaaaaaaaaa", stops: "bbbbbbbbbbbbbbbb" });
function job() { const original = createTearFoundryJob({ id: "curation-job", createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized request", inputs: { champion: { id: "champion", artifactHash: values.artifact }, corpusRecordHashes: [values.corpus], evaluationPlanHash: values.evaluation, rewardDefinitionHash: values.reward, invariantSetHash: values.invariants, budgetHash: values.budget, stopConditionsHash: values.stops } }); return transitionTearFoundryJob(original, "collecting", "2026-08-08T00:01:00.000Z", "authorized collection"); }
function custody(backend: ReturnType<typeof createMemoryGhostVaultBackend>, live: boolean): TearAcademyCandidateCustodyStore { return { backend: () => backend, held: () => Promise.resolve(live ? [{ recordHash: values.corpus }] : []) } as unknown as TearAcademyCandidateCustodyStore; }
function corpus(backend: ReturnType<typeof createMemoryGhostVaultBackend>, exact: boolean, custodyRecordHash: string = values.corpus): TearAcademyCorpusStore { return { backend: () => backend, getManifest: () => Promise.resolve(exact ? { id: "manifest-a", reader: { kind: "trainer", id: "foundry" }, version: 1, manifestHash: values.manifest, rootHash: values.root, entries: [{ custodyRecordHash, entryHash: values.entry, split: "training" }] } : undefined) } as unknown as TearAcademyCorpusStore; }

describe("C36 curated manifest admission", () => {
  it("admits only an exact published trainer manifest over still-held C31 custody", async () => {
    const backend = createMemoryGhostVaultBackend(), vault = new TearFoundryJobVault(backend), current = job();
    const original = transitionTearFoundryJob(createTearFoundryJob({ id: "curation-job", createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized request", inputs: { champion: { id: "champion", artifactHash: values.artifact }, corpusRecordHashes: [values.corpus], evaluationPlanHash: values.evaluation, rewardDefinitionHash: values.reward, invariantSetHash: values.invariants, budgetHash: values.budget, stopConditionsHash: values.stops } }), "collecting", "2026-08-08T00:01:00.000Z", "authorized collection");
    await vault.persist(original);
    const executor = new TearFoundryCuratedManifestExecutor(vault, custody(backend, true), corpus(backend, true));
    const result = await executor.admit(current, { id: "manifest-a", trainerId: "foundry", version: 1 }, "2026-08-08T00:02:00.000Z");
    expect(result).toMatchObject({ job: { phase: "curating" }, receipt: { disposition: "authorized", manifest: { manifestHash: values.manifest } } });
    await expect(executor.admit(current, { id: "manifest-a", trainerId: "foundry", version: 1 }, "2026-08-08T00:02:00.000Z")).resolves.toMatchObject({ job: { jobHash: result.job.jobHash } });
  });

  it("fails closed when the published manifest or action-time custody is unavailable", async () => {
    const backend = createMemoryGhostVaultBackend(), vault = new TearFoundryJobVault(backend), current = job(); await vault.persist(current);
    const result = await new TearFoundryCuratedManifestExecutor(vault, custody(backend, false), corpus(backend, true)).admit(current, { id: "manifest-a", trainerId: "foundry", version: 1 }, "2026-08-08T00:02:00.000Z");
    expect(result).toMatchObject({ job: { phase: "failed" }, receipt: { disposition: "no-eligible-curated-manifest" } });
  });

  it("fails closed when a published trainer manifest names another custody record", async () => {
    const backend = createMemoryGhostVaultBackend(), vault = new TearFoundryJobVault(backend), current = job(); await vault.persist(current);
    const result = await new TearFoundryCuratedManifestExecutor(vault, custody(backend, true), corpus(backend, true, values.entry)).admit(current, { id: "manifest-a", trainerId: "foundry", version: 1 }, "2026-08-08T00:02:00.000Z");
    expect(result).toMatchObject({ job: { phase: "failed" }, receipt: { disposition: "no-eligible-curated-manifest" } });
  });
});

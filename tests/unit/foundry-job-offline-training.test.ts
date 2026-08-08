import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { TearFoundryJobVault, TearFoundryOfflineTrainingExecutor, createTearFoundryJob, transitionTearFoundryJob, type TearAcademyCandidateCustodyStore, type TearAcademyCorpusStore, type TearAcademyTrainingDatasetLoader } from "../../src/agents";

const h = Object.freeze({ artifact: "1111111111111111", corpus: "2222222222222222", evaluation: "3333333333333333", reward: "4444444444444444", invariant: "5555555555555555", budget: "6666666666666666", stop: "7777777777777777" });
function current() { const job = createTearFoundryJob({ id: "foundry-train", createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized", inputs: { champion: { id: "champion", artifactHash: h.artifact }, corpusRecordHashes: [h.corpus], evaluationPlanHash: h.evaluation, rewardDefinitionHash: h.reward, invariantSetHash: h.invariant, budgetHash: h.budget, stopConditionsHash: h.stop } }); const collecting = transitionTearFoundryJob(job, "collecting", "2026-08-08T00:01:00.000Z", "collected"); return transitionTearFoundryJob(collecting, "curating", "2026-08-08T00:02:00.000Z", "manifest admitted"); }
describe("C36 offline training launch", () => {
  it("fails before any C34 output when immutable C31 manifest/custody is unavailable", async () => {
    const backend = createMemoryGhostVaultBackend(), vault = new TearFoundryJobVault(backend), job = current(); await vault.persist(job);
    const custody = { backend: () => backend, held: () => Promise.resolve([]) } as unknown as TearAcademyCandidateCustodyStore;
    const corpus = { backend: () => backend, getManifest: () => Promise.resolve(undefined) } as unknown as TearAcademyCorpusStore;
    const loader = { load: () => Promise.resolve({}) } as unknown as TearAcademyTrainingDatasetLoader;
    const executor = new TearFoundryOfflineTrainingExecutor(vault, custody, corpus, loader);
    await expect(executor.start(job, { manifestId: "missing", trainerId: "foundry", manifestVersion: 1, plan: { id: "plan", version: 1, seed: 1, reward: { components: [], totalMinimum: 0, totalMaximum: 0 }, limits: { maxTransitions: 1, maxEventsPerTransition: 1, maxRewardViolations: 0 } }, config: { epochs: 1, learningRate: 0.5, gamma: 0.5, maxStateActionEntries: 1, maxAbsoluteQ: 1, maxMeanAbsoluteTdError: 1, maxConsecutiveDivergentEpochs: 1 } }, "2026-08-08T00:03:00.000Z")).rejects.toThrow(/manifest or custody/u);
    await expect(vault.get(job.id)).resolves.toMatchObject({ phase: "curating", jobHash: job.jobHash });
  });
});

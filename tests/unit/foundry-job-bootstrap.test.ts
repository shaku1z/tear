import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend, type GhostVaultBackend } from "../../src/ghost";
import { TearFoundryBootstrapExecutor, TearFoundryJobVault, createTearFoundryJobV2 } from "../../src/agents";

const h = Object.freeze({ artifact: "a".repeat(16), corpus: "b".repeat(16), evaluation: "c".repeat(16), reward: "d".repeat(16), invariant: "e".repeat(16), budget: "f".repeat(16), stop: "1".repeat(16), compute: "2".repeat(16), storage: "3".repeat(16), manifest: "4".repeat(16), root: "5".repeat(16) });
const at = "2026-08-08T00:00:00.000Z";
function job(id = "bootstrap-job", createdAt = at) { return createTearFoundryJobV2({ id, createdAt, reason: "frozen authorized request", inputs: { champion: { id: "champion", artifactHash: h.artifact }, corpusRecordHashes: [h.corpus], evaluationPlanHash: h.evaluation, rewardDefinitionHash: h.reward, invariantSetHash: h.invariant, budgetHash: h.budget, stopConditionsHash: h.stop, evaluationProtocol: { version: 1, id: "frozen", thresholds: { minimumRewardGain: 0, requireCompletionRateNotLower: true, maxTicksPerCase: 10, maxAbsoluteRewardPerCase: 10 } } } }); }
function successor() { return { kind: "exact-phase-payload" as const, payload: { kind: "trainer-manifest" as const, manifest: { id: "trainer-manifest", trainerId: "trainer", version: 1 } }, nextDeclaration: { kind: "exact-phase-payload" as const, payload: { kind: "offline-launch" as const, offline: { training: { manifestId: "trainer-manifest", trainerId: "trainer", manifestVersion: 1, plan: { id: "offline", version: 1, seed: 1, reward: { components: [{ id: "score", source: "score.delta" as const, weight: 1, maximumSourceValue: 1, perTransitionCap: 1 }], totalMinimum: -1, totalMaximum: 1 }, limits: { maxTransitions: 1, maxEventsPerTransition: 1, maxRewardViolations: 0 } }, config: { epochs: 1, learningRate: .5, gamma: .5, maxStateActionEntries: 1, maxAbsoluteQ: 1, maxMeanAbsoluteTdError: 1, maxConsecutiveDivergentEpochs: 1 } }, manifest: { id: "trainer-manifest", trainerId: "trainer", version: 1 }, manifestHash: h.manifest, manifestRootHash: h.root, datasetHash: "6".repeat(16), planHash: "7".repeat(16), configurationHash: "8".repeat(16), rewardHash: h.reward } }, nextDeclaration: { kind: "emitted-v2-training" as const, nextDeclaration: { kind: "repeat-v2-training" as const } } } }; }
function request(current = job()) { return { job: current, manifest: { id: "trainer-manifest", trainerId: "trainer", version: 1, manifestHash: h.manifest, rootHash: h.root }, schedule: { id: "bootstrap-schedule", intervalMs: 60_000, computeBudgetHash: h.compute, storageBudgetHash: h.storage, stopConditionsHash: h.stop, configuredAt: at }, successorDeclaration: successor(), bootstrappedAt: at }; }
async function fixture(options: Readonly<{ live?: boolean; exact?: boolean; backend?: GhostVaultBackend }> = {}) {
  const backend = options.backend ?? createMemoryGhostVaultBackend(), current = job(), live = options.live ?? true, exact = options.exact ?? true;
  await backend.put("analysis", "academy-corpus-manifest:v1:trainer:trainer:trainer-manifest:1", "manifest-bytes");
  await backend.put("analysis", "academy-candidate-custody:v1:candidate", "custody-bytes");
  const custody = { backend: () => backend, held: () => Promise.resolve(live ? [{ candidateHash: "candidate", recordHash: h.corpus }] : []) } as never;
  const corpus = { backend: () => backend, getManifest: () => Promise.resolve(exact ? { id: "trainer-manifest", reader: { kind: "trainer" as const, id: "trainer" }, version: 1, manifestHash: h.manifest, rootHash: h.root, entries: [{ custodyRecordHash: h.corpus, split: "training" as const }] } : undefined) } as never;
  return { backend, current, executor: new TearFoundryBootstrapExecutor(new TearFoundryJobVault(backend), custody, corpus), input: request(current) };
}
describe("C36 V2 Foundry bootstrap", () => {
  it("atomically admits one exact V2 request into its enabled V3 schedule and exact retry", async () => {
    const f = await fixture(), first = await f.executor.bootstrap(f.input), retry = await f.executor.bootstrap(f.input);
    expect(first.schedule).toMatchObject({ state: "enabled", revision: 2, jobHash: f.current.jobHash }); expect(first.binding).toMatchObject({ job: { phase: "created", jobHash: f.current.jobHash }, payload: { kind: "none" } }); expect(retry.receipt).toEqual(first.receipt);
  });
  it("refuses a duplicate/stale job ID, a mismatched manifest, and revoked custody before it writes", async () => {
    const duplicate = await fixture(); await duplicate.executor.bootstrap(duplicate.input); await expect(duplicate.executor.bootstrap({ ...duplicate.input, job: job("bootstrap-job", "2026-08-08T00:00:02.000Z") })).rejects.toThrow(/job ID|receipt/u);
    const mismatch = await fixture({ exact: false }); await expect(mismatch.executor.bootstrap(mismatch.input)).rejects.toThrow(/manifest/u); expect(await mismatch.backend.get("analysis", "foundry-job:v1:bootstrap-job")).toBeUndefined();
    const revoked = await fixture({ live: false }); await expect(revoked.executor.bootstrap(revoked.input)).rejects.toThrow(/custody/u); expect(await revoked.backend.get("analysis", "foundry-job-schedule:v1:bootstrap-schedule")).toBeUndefined();
  });
  it("leaves no partial job, schedule, binding, or receipt when its one conditional transaction loses authority", async () => {
    const base = createMemoryGhostVaultBackend();
    const failing: GhostVaultBackend = { ...base, commitIfMatches: () => Promise.reject(new Error("lost authority")) };
    const f = await fixture({ backend: failing }); await expect(f.executor.bootstrap(f.input)).rejects.toThrow(/lost its job/u);
    expect(await base.get("analysis", "foundry-job:v1:bootstrap-job")).toBeUndefined(); expect(await base.get("analysis", "foundry-job-schedule:v1:bootstrap-schedule")).toBeUndefined(); expect((await base.keys("analysis")).some((key) => key.startsWith("foundry-job-execution-binding:v3:"))).toBe(false);
  });
});

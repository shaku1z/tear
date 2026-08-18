import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { createTearFoundryLaunchProfile, TearFoundryLaunchProfileAuthority } from "../../src/agents";

const h = (value: string) => value.repeat(16);
const at = "2026-08-08T00:00:00.000Z";
function profile() {
  return createTearFoundryLaunchProfile({ id: "launch", jobId: "job", reason: "authorized autonomous cycle", declaredAt: at,
    manifest: { id: "manifest", trainerId: "trainer", version: 1, manifestHash: h("a"), rootHash: h("b") }, schedule: { id: "schedule", intervalMs: 60_000, computeBudgetHash: h("c"), storageBudgetHash: h("d") },
    inputs: { evaluationPlanHash: h("e"), rewardDefinitionHash: h("f"), invariantSetHash: h("1"), budgetHash: h("2"), stopConditionsHash: h("3"), evaluationProtocol: { version: 1, id: "evaluation", thresholds: { minimumRewardGain: 0, requireCompletionRateNotLower: true, maxTicksPerCase: 10, maxAbsoluteRewardPerCase: 10 } } },
    successorDeclaration: {
      kind: "exact-phase-payload", payload: { kind: "trainer-manifest", manifest: { id: "manifest", trainerId: "trainer", version: 1 } },
      nextDeclaration: {
        kind: "exact-phase-payload",
        payload: { kind: "offline-launch", offline: { training: { manifestId: "manifest", trainerId: "trainer", manifestVersion: 1, plan: { id: "offline", version: 1, seed: 1, reward: { components: [{ id: "score", source: "score.delta", weight: 1, maximumSourceValue: 1, perTransitionCap: 1 }], totalMinimum: -1, totalMaximum: 1 }, limits: { maxTransitions: 1, maxEventsPerTransition: 1, maxRewardViolations: 0 } }, config: { epochs: 1, learningRate: .5, gamma: .5, maxStateActionEntries: 1, maxAbsoluteQ: 1, maxMeanAbsoluteTdError: 1, maxConsecutiveDivergentEpochs: 1 } }, manifest: { id: "manifest", trainerId: "trainer", version: 1 }, manifestHash: h("a"), manifestRootHash: h("b"), datasetHash: h("4"), planHash: h("5"), configurationHash: h("6"), rewardHash: h("f") } },
        nextDeclaration: { kind: "emitted-v2-training", nextDeclaration: { kind: "repeat-v2-training" } },
      },
    },
  });
}
function authority() { const backend = createMemoryGhostVaultBackend(), custody = { backend: () => backend, held: () => Promise.resolve([]) } as never, corpus = { backend: () => backend, getManifest: () => Promise.resolve(undefined) } as never; return { backend, authority: new TearFoundryLaunchProfileAuthority(backend, custody, corpus) }; }

describe("C36 immutable Foundry launch profile", () => {
  it("persists one immutable product-owned profile and exposes only opaque blocked eligibility without authority", async () => {
    const f = authority(), saved = await f.authority.persist(profile());
    expect(await f.authority.persist(saved)).toEqual(saved); expect(await f.authority.projection(saved.id, at)).toEqual({ profileId: saved.id, disposition: "blocked" });
    await expect(f.authority.buildBootstrapRequest(saved.id, at)).rejects.toThrow(/blocked/u);
    await expect(f.authority.persist({ ...saved, reason: "rewritten" })).rejects.toThrow(/integrity|exists/u);
  });
  it("quarantines corrupt profile bytes and fails closed for malformed active-policy bytes", async () => {
    const f = authority(), saved = await f.authority.persist(profile());
    await f.backend.put("analysis", `foundry-launch-profile:v1:${saved.id}`, "corrupt");
    expect(await f.authority.projection(saved.id, at)).toEqual({ profileId: saved.id, disposition: "blocked" });
    expect((await f.backend.keys("quarantine")).some((key) => key.includes(saved.id))).toBe(true);
    await f.backend.put("analysis", "policy-active:v1", "corrupt");
    expect(await f.authority.projection("unknown", at)).toEqual({ profileId: "unknown", disposition: "blocked" });
  });
});

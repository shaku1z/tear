import { describe, expect, it, vi } from "vitest";
const fixtures = vi.hoisted(() => ({ envelopes: new Map<string, unknown>() }));
vi.mock("../../src/ghost/production-replay-session", () => ({ createGhostProductionReplaySession: (capsule: { manifest: { id: string } }) => Object.freeze({ sourceRootHash: `root-${capsule.manifest.id}` }) }));
vi.mock("../../src/ghost/capsule-replay-envelope", () => ({ mapGhostCapsuleToReplayEnvelope: (capsule: { manifest: { id: string } }) => fixtures.envelopes.get(capsule.manifest.id) }));
import { projectGhostCoachPractice } from "../../src/ghost/coach-practice";

describe("C37 Coach practice projection", () => {
  it("rejects unverified or non-distinct sources before projecting advice", () => {
    expect(() => projectGhostCoachPractice({ manifest: { id: "same" } } as never, { manifest: { id: "same" } } as never)).toThrow(/distinct/u);
  });
  it("uses only the selected verified same-build pair and retains their provenance", () => {
    const build = { version: "1", revision: "r", target: "standalone", rulesetVersion: "v", contentHash: "c", configHash: "g" };
    fixtures.envelopes.set("target", { ghost: { snapshots: [{ provenance: { build }, hashes: { semantic: "t" } }], events: [{ type: "player.damaged", tick: 10, id: "hurt" }], actions: [] } });
    fixtures.envelopes.set("base", { ghost: { snapshots: [{ provenance: { build }, hashes: { semantic: "b" } }], events: [], actions: [] } });
    const result = projectGhostCoachPractice({ manifest: { id: "target" }, maxTick: 120 } as never, { manifest: { id: "base" }, maxTick: 120 } as never);
    expect(result).toMatchObject({ targetId: "target", baselineId: "base" });
    expect(result.provenanceHash).toHaveLength(16);
    expect(result.unavailable).toContain("draft: no verified counterfactual measurement");
  });
});

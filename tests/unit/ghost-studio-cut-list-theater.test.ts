import { describe, expect, it } from "vitest";
import { createGhostStudioCutListFromTheater } from "../../src/ghost/studio-cut-list-theater";
import type { GhostReadCapsule } from "../../src/ghost/capsule-reader";
import type { GhostVerifiedProductionReplaySession } from "../../src/ghost/production-replay-session";

const session: GhostVerifiedProductionReplaySession = Object.freeze({ sourceId: "verified-capsule", sourceCapsuleRootIntegrity: "root-verified", sourceRootHash: "root-verified",
  verifiedReceiptTicks: Object.freeze([0, 120, 240]), seek: () => { throw new Error("not used"); }, forkPractice: () => { throw new Error("not used"); } });
function capsule(overrides: Record<string, unknown> = {}): GhostReadCapsule {
  return { manifest: { id: "verified-capsule", schemaVersion: 2, status: "complete", rootIntegrity: "root-verified" }, maxTick: 240,
    tracks: { commands: [], rng: [], events: [], results: [], keyframes: [], presentation: [] }, ...overrides } as unknown as GhostReadCapsule;
}

describe("verified Theater Studio Cut List", () => {
  it("creates one immutable supported local EDL from exact custody and a verified checkpoint", () => {
    const source = capsule(), before = JSON.stringify(source);
    const projection = createGhostStudioCutListFromTheater(source, session, 240);
    expect(projection.edl).toMatchObject({ format: "ghost-studio-edl", schemaVersion: 1, sourceGhostId: "verified-capsule",
      sourceRootHash: "root-verified", aspectRatio: "16:9", clips: [{ sourceFromTick: 120, sourceToTick: 240, speed: 1, camera: "source" }] });
    expect(projection.edl?.edlHash).toMatch(/^[a-f0-9]{16}$/);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("refuses incomplete, non-V3, custody-mismatched, and non-checkpoint sources", () => {
    expect(createGhostStudioCutListFromTheater(capsule({ manifest: { id: "verified-capsule", schemaVersion: 1, status: "complete", rootIntegrity: "root-verified" } }), session, 120).available).toBe(false);
    expect(createGhostStudioCutListFromTheater(capsule({ manifest: { id: "verified-capsule", schemaVersion: 2, status: "recording", rootIntegrity: "root-verified" } }), session, 120).available).toBe(false);
    expect(createGhostStudioCutListFromTheater(capsule({ manifest: { id: "verified-capsule", schemaVersion: 2, status: "complete", rootIntegrity: "changed" } }), session, 120).available).toBe(false);
    expect(createGhostStudioCutListFromTheater(capsule(), session, 121).available).toBe(false);
  });
});

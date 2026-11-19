import { describe, expect, it } from "vitest";
import { appendTheaterClip, createReplayCutList } from "../../src/ghost/replay-cut-list";
import type { GhostReadCapsule } from "../../src/ghost/capsule-reader";
import type { GhostVerifiedProductionReplaySession } from "../../src/ghost/production-replay-session";

const session: GhostVerifiedProductionReplaySession = Object.freeze({
  sourceId: "verified-capsule",
  sourceCapsuleRootIntegrity: "root-verified",
  sourceRootHash: "root-verified",
  verifiedReceiptTicks: Object.freeze([0, 120, 240]),
  seek: () => {
    throw new Error("not used");
  },
  forkPractice: () => {
    throw new Error("not used");
  },
});
function capsule(manifest: Record<string, unknown> = {}): GhostReadCapsule {
  return {
    manifest: {
      id: "verified-capsule",
      schemaVersion: 2,
      status: "complete",
      rootIntegrity: "root-verified",
      ...manifest,
    },
    maxTick: 240,
    tracks: { commands: [], rng: [], events: [], results: [], keyframes: [], presentation: [] },
  } as unknown as GhostReadCapsule;
}

describe("replay cut list", () => {
  it("orders clips by output order and binds them to the source in one hash", () => {
    const source = { id: "highlight", sourceGhostId: "ghost", sourceRootHash: "root" };
    const first = { id: "a", sourceFromTick: 0, sourceToTick: 10, outputOrder: 0, speed: 1 } as const,
      second = { id: "b", sourceFromTick: 10, sourceToTick: 20, outputOrder: 1, speed: 0.5 } as const;
    const cutList = createReplayCutList({ ...source, clips: [second, first] });
    expect(cutList.clips.map((clip) => clip.id)).toEqual(["a", "b"]);
    expect(cutList.cutListHash).toMatch(/^[a-f0-9]{16}$/);
    expect(createReplayCutList({ ...source, clips: [first, second] }).cutListHash).toBe(cutList.cutListHash);
    expect(createReplayCutList({ ...source, sourceRootHash: "other", clips: [first, second] }).cutListHash).not.toBe(
      cutList.cutListHash,
    );
    expect(Object.isFrozen(cutList) && Object.isFrozen(cutList.clips) && Object.isFrozen(cutList.clips[0])).toBe(true);
  });

  it("refuses a backwards range and a repeated clip id", () => {
    const source = { id: "highlight", sourceGhostId: "ghost", sourceRootHash: "root" };
    expect(() =>
      createReplayCutList({
        ...source,
        clips: [{ id: "a", sourceFromTick: 10, sourceToTick: 5, outputOrder: 0, speed: 1 }],
      }),
    ).toThrow("Clip range is invalid");
    expect(() =>
      createReplayCutList({
        ...source,
        clips: [
          { id: "a", sourceFromTick: 0, sourceToTick: 5, outputOrder: 0, speed: 1 },
          { id: "a", sourceFromTick: 5, sourceToTick: 9, outputOrder: 1, speed: 1 },
        ],
      }),
    ).toThrow("Clip IDs must be unique");
  });

  it("appends the range between two verified checkpoints without changing the replay", () => {
    const source = capsule(),
      before = JSON.stringify(source);
    const first = appendTheaterClip(undefined, source, session, 240).cutList;
    expect(first).toMatchObject({
      sourceGhostId: "verified-capsule",
      sourceRootHash: "root-verified",
      clips: [{ id: "clip-0", sourceFromTick: 120, sourceToTick: 240, outputOrder: 0, speed: 1 }],
    });
    const second = appendTheaterClip(first, source, session, 120, 0, 2).cutList;
    expect(second?.clips).toEqual([
      { id: "clip-0", sourceFromTick: 120, sourceToTick: 240, outputOrder: 0, speed: 1 },
      { id: "clip-1", sourceFromTick: 0, sourceToTick: 120, outputOrder: 1, speed: 2 },
    ]);
    expect(second?.cutListHash).not.toBe(first?.cutListHash);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("refuses an old, incomplete or changed replay and a tick that is not a verified checkpoint", () => {
    const refused = (source: GhostReadCapsule, tick: number, from?: number): string | undefined => {
      const result = appendTheaterClip(undefined, source, session, tick, from);
      expect(result.cutList).toBeUndefined();
      return result.unavailable;
    };
    expect(refused(capsule({ schemaVersion: 1 }), 120)).toContain("complete current V3 capsule");
    expect(refused(capsule({ status: "recording" }), 120)).toContain("complete current V3 capsule");
    expect(refused(capsule({ rootIntegrity: "changed" }), 120)).toContain("no longer matches");
    expect(refused(capsule(), 121)).toContain("current verified replay checkpoint");
    expect(refused(capsule(), 120, 240)).toContain("earlier verified IN checkpoint");
    expect(refused(capsule(), 240, 60)).toContain("earlier verified IN checkpoint");
  });
});

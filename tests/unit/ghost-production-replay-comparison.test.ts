import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  envelopes: new Map<string, { ghost: { id: string; events: readonly { type: "run.paused" | "run.started"; tick: number; sequence: number }[] } }>(),
}));

vi.mock("../../src/ghost/production-replay-session", () => ({
  createGhostProductionReplaySession: (capsule: { manifest: { id: string } }) => Object.freeze({
    sourceId: capsule.manifest.id,
    sourceRootHash: `root-${capsule.manifest.id}`,
    verifiedReceiptTicks: Object.freeze([]),
    seek: (tick: number) => Object.freeze({ tick, semanticHash: `${capsule.manifest.id}-hash-${String(tick)}` }),
    forkPractice: () => { throw new Error("not used by comparison"); },
  }),
}));

vi.mock("../../src/ghost/capsule-replay-envelope", () => ({
  mapGhostCapsuleToReplayEnvelope: (capsule: { manifest: { id: string } }) => {
    const fixture = fixtures.envelopes.get(capsule.manifest.id);
    if (fixture === undefined) throw new Error("comparison fixture is missing");
    return fixture;
  },
}));

import { createGhostProductionReplayComparison } from "../../src/ghost/production-replay-comparison";
import type { GhostReadCapsule } from "../../src/ghost/capsule-reader";

function capsule(id: string): GhostReadCapsule {
  return { manifest: { id }, tracks: { commands: [], rng: [], events: [], results: [], keyframes: [], presentation: [] }, maxTick: 0 } as unknown as GhostReadCapsule;
}

describe("Ghost production replay comparison", () => {
  it("compares two distinct verified sources by every repeated semantic occurrence", () => {
    fixtures.envelopes.set("left", { ghost: { id: "left", events: [
      { type: "run.paused", tick: 10, sequence: 1 }, { type: "run.paused", tick: 30, sequence: 2 },
      { type: "run.started", tick: 0, sequence: 0 },
    ] } });
    fixtures.envelopes.set("right", { ghost: { id: "right", events: [
      { type: "run.paused", tick: 12, sequence: 1 }, { type: "run.started", tick: 0, sequence: 0 },
    ] } });

    const comparison = createGhostProductionReplayComparison([capsule("left"), capsule("right")]);

    expect(comparison.runs.map((run) => run.sourceId)).toEqual(["left", "right"]);
    expect(comparison.occurrences.map((entry) => [entry.eventType, entry.occurrence])).toEqual([
      ["run.paused", 0], ["run.paused", 1], ["run.started", 0],
    ]);
    expect(comparison.occurrences[1]).toMatchObject({
      runs: [
        { sourceId: "left", tick: 30, semanticHash: "left-hash-30" },
        { sourceId: "right", tick: null, semanticHash: null },
      ],
    });
  });

  it("rejects a single source or a duplicate source instead of faking a comparison", () => {
    fixtures.envelopes.set("left", { ghost: { id: "left", events: [{ type: "run.started", tick: 0, sequence: 0 }] } });
    expect(() => createGhostProductionReplayComparison([capsule("left")])).toThrow(/requires 2-9/u);
    expect(() => createGhostProductionReplayComparison([capsule("left"), capsule("left")])).toThrow(/distinct/u);
  });
});

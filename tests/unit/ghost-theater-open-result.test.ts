import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted((): { sessionCalls: number; mapped: unknown } => ({
  sessionCalls: 0,
  mapped: undefined,
}));

vi.mock("../../src/ghost/capsule-replay-envelope", () => ({
  mapGhostCapsuleToReplayEnvelope: () => fixture.mapped,
}));
vi.mock("../../src/ghost/production-replay-session", () => ({
  createGhostProductionReplaySession: () => { fixture.sessionCalls += 1; throw new Error("must not create a session"); },
}));

import { createGhostTheaterScreenAdapter } from "../../src/app/ghost-theater-screen-adapter";
import type { GhostReadCapsule } from "../../src/ghost/capsule-reader";

function hostileCapsule(): GhostReadCapsule {
  return {
    manifest: { id: "hostile", rootIntegrity: "root-hostile", recordingProfile: "coaching" }, maxTick: 12,
    tracks: { commands: [], rng: [], events: [], results: [], keyframes: [], presentation: [] },
  } as unknown as GhostReadCapsule;
}

describe("Ghost Theater open result", () => {
  it("refuses a codec-preflight source before creating a session or transport", () => {
    fixture.sessionCalls = 0;
    fixture.mapped = Object.freeze({ ghost: { events: [] }, issues: Object.freeze([
      Object.freeze({ track: "keyframes", tick: 12, reason: "recorded-canonical keyframe failed isolated codec preflight: hostile payload" }),
    ]) });
    const rendered: unknown[] = [];
    const theater = createGhostTheaterScreenAdapter({ render: (view) => { rendered.push(view); }, width: () => 1200,
      deltaSeconds: () => 0, launchPractice: () => ({ ok: false, message: "unused" }), loadCoachCandidates: () => Promise.resolve([]) });

    const result = theater.open(hostileCapsule(), "profile");

    expect(result).toEqual({ kind: "refused", category: "codec-preflight", detail: "The recorded state could not be safely restored.",
      tick: 12, root: "root-hostile" });
    expect(fixture.sessionCalls).toBe(0);
    expect(theater.status()).toBeNull();
    theater.seekBy(30); theater.togglePause(); theater.render();
    expect(rendered).toEqual([]);
  });
});

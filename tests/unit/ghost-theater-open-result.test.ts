import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted((): { sessionCalls: number; mapped: unknown; session?: unknown } => ({
  sessionCalls: 0,
  mapped: undefined,
}));

vi.mock("../../src/ghost/capsule-replay-envelope", () => ({
  mapGhostCapsuleToReplayEnvelope: () => fixture.mapped,
}));
vi.mock("../../src/ghost/production-replay-session", () => ({
  createGhostProductionReplaySession: () => { fixture.sessionCalls += 1; if (fixture.session !== undefined) return fixture.session; throw new Error("must not create a session"); },
}));

import { createGhostTheaterScreenAdapter } from "../../src/app/ghost-theater-screen-adapter";
import { createGhostCapsuleManifestV2 } from "../../src/ghost/capsule-contract";
import { createGhostReplayRunContext } from "../../src/ghost/replay-admission";
import { ghostCoachCandidate, projectGhostCoachHistory } from "../../src/ghost/coach-history";
import type { ReplayScreenView } from "../../src/presentation/screens/contracts";
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
      deltaSeconds: () => 0, launchPractice: () => ({ ok: false, message: "unused" }), coachHistory: { list: () => Promise.resolve([]), current: () => Promise.resolve(false), analyze: () => { throw new Error("unused"); } } });

    const result = theater.open(hostileCapsule(), "profile");

    expect(result).toEqual({ kind: "refused", category: "codec-preflight", detail: "The recorded state could not be safely restored.",
      tick: 12, root: "root-hostile" });
    expect(fixture.sessionCalls).toBe(0);
    expect(theater.status()).toBeNull();
    theater.seekBy(30); theater.togglePause(); theater.render();
    expect(rendered).toEqual([]);
  });
});


describe("Coach cited seek refusal", () => {
  it("keeps a genuine session seek failure visible instead of claiming the cited tick was reached", async () => {
    const context = createGhostReplayRunContext({ runId: "run", seed: "engineering", mode: "endless", difficulty: "normal", weaponId: "sword", ticksPerSecond: 120,
      build: { version: "1", revision: "test", target: "test-standalone", rulesetVersion: "test", contentHash: "test", configHash: "test" }, rng: { gameplay: { algorithm: "xorshift32", state: "1" } } });
    const make = (id: string) => createGhostCapsuleManifestV2({ id, status: "complete", createdAt: "2026-10-19T10:00:00Z", recordingProfile: "coaching",
      provenance: { replayContext: context }, chunks: [], rootIntegrity: `root-${id}`, fidelity: { presentation: "full", downgrades: [] } });
    const target = ghostCoachCandidate(make("target")), other = ghostCoachCandidate(make("other"));
    const output = projectGhostCoachHistory([{ candidate: target, receipts: [120, 240], events: [{ format: "tear-contract", kind: "event", schemaVersion: 1,
      id: "native-throw", type: "blade.thrown", tick: 140, phase: "player-and-blade", sequence: 1, source: "engine", payload: { weaponId: "sword", throwId: 1, x: 1, y: 2 } }] },
      { candidate: other, receipts: [120, 240], events: [] }]);
    fixture.mapped = { ghost: { events: [] }, issues: [] };
    fixture.session = { verifiedReceiptTicks: [120, 240], sourceRootHash: "root", seek(tick: number) {
      if (tick === 140) throw new Error("source continuation refused");
      return { tick, semanticHash: "hash" };
    } };
    const rendered: ReplayScreenView[] = [];
    const theater = createGhostTheaterScreenAdapter({ render: (view) => { rendered.push(view); }, width: () => 1600, deltaSeconds: () => 0,
      launchPractice: () => ({ ok: false, message: "unused" }), coachHistory: { list: () => Promise.resolve([target, other]), current: () => Promise.resolve(true),
        analyze: () => ({ result: Promise.resolve(output), cancel() { return; } }) } });
    expect(theater.open({ ...hostileCapsule(), manifest: make("target"), maxTick: 240 }, "profile").kind).toBe("opened");
    theater.openCoach(); await vi.waitFor(() => { theater.render(); expect(rendered.at(-1)?.coach?.candidates.length).toBe(1); });
    theater.selectCoachBaseline("other"); await vi.waitFor(() => { theater.render(); expect(rendered.at(-1)?.coach?.result).toBeDefined(); });
    theater.viewCoachMoment("throws:native-throw"); await vi.waitFor(() => { theater.render(); expect(rendered.at(-1)?.notice).toContain("Replay halted: source continuation refused"); });
    expect(rendered.at(-1)?.elapsed).toBe("TICK 0");
    fixture.session = undefined;
  });
});

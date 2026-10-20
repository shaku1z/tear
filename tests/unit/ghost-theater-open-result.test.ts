import { createBrowserGhostStudioMedia } from "../../src/app/browser-ghost-studio-media";
import { createStudioEdl } from "../../src/ghost/player-experiences";
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
  it.each(["seek", "render"])("keeps a genuine session %s failure visible without adopting the cited tick", async (failure) => {
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
      if (tick === 140 && failure === "seek") throw new Error("source continuation refused");
      return { tick, semanticHash: "hash" };
    }, renderFrame(tick: number) {
      if (tick === 140 && failure === "render") throw new Error("source continuation refused");
      return { tick };
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


describe("Theater local media ownership", () => {
  it("keeps ordered chosen ranges and discards a cancelled/replaced source's late encoder result", async () => {
    fixture.mapped = { ghost: { events: [] }, issues: [] };
    fixture.session = { sourceId: "hostile", sourceCapsuleRootIntegrity: "root-hostile", sourceRootHash: "semantic-root", verifiedReceiptTicks: [0, 120, 240], seek: (tick: number) => ({ tick, semanticHash: "hash" }) };
    const rendered: ReplayScreenView[] = [], signals: AbortSignal[] = [], downloads = vi.fn();
    let finish: ((value: never) => void) | undefined;
    const theater = createGhostTheaterScreenAdapter({ render: (view) => { rendered.push(view); }, width: () => 1600, deltaSeconds: () => 0,
      launchPractice: () => ({ ok: false, message: "unused" }), coachHistory: { list: () => Promise.resolve([]), current: () => Promise.resolve(true), analyze: () => { throw new Error("unused"); } },
      studioMedia: { available: () => true, dispose: vi.fn(), download: downloads, render: (_capsule, _session, edl, signal) => {
        expect(edl.clips.map((clip) => [clip.sourceFromTick, clip.sourceToTick, clip.speed])).toEqual([[120, 240, .5], [0, 120, 2]]);
        signals.push(signal); return new Promise((resolve) => { finish = resolve; });
      } } });
    const capsule = { ...hostileCapsule(), manifest: { ...hostileCapsule().manifest, schemaVersion: 2, status: "complete" }, maxTick: 240 } as GhostReadCapsule;
    expect(theater.open(capsule, "profile").kind).toBe("opened"); theater.toggleStudio();
    theater.jumpCheckpoint(1); theater.markStudioIn(); theater.jumpCheckpoint(1); theater.setSpeed(.5); theater.createStudioCutList();
    theater.restart(); theater.markStudioIn(); theater.jumpCheckpoint(1); theater.setSpeed(2); theater.createStudioCutList();
    theater.exportStudio(); theater.render(); expect(rendered.at(-1)?.studioMedia?.status).toBe("rendering");
    theater.cancelStudio(); expect(signals[0]?.aborted).toBe(true); theater.exit();
    expect(theater.open(capsule, "profile").kind).toBe("opened"); theater.toggleStudio();
    finish?.({ thumbnail: "late" } as never); await Promise.resolve(); theater.render();
    expect(rendered.at(-1)?.studioMedia?.status).toBe("idle"); expect(rendered.at(-1)?.studioMedia?.thumbnail).toBeUndefined();
    theater.downloadStudio(); expect(downloads).not.toHaveBeenCalled(); fixture.session = undefined;
  });

  it("stops the dedicated canvas track when native MediaRecorder construction refuses", async () => {
    const stop = vi.fn(), track = { stop, requestFrame() { return; } }, stream = { getVideoTracks: () => [track], getTracks: () => [track] };
    const canvas = { width: 0, height: 0, getContext: () => ({}), toDataURL: () => "data:image/png;base64,AA==", captureStream: () => stream };
    const RefusedRecorder = Object.assign(function RefusedRecorder() { throw new Error("native encoder refused"); }, { isTypeSupported: () => true });
    vi.stubGlobal("MediaRecorder", RefusedRecorder);
    try {
      const capsule = hostileCapsule();
      const session = { sourceId: "hostile", sourceCapsuleRootIntegrity: "root-hostile", sourceRootHash: "semantic-root", renderFrame: () => ({ sourceRootHash: "semantic-root", sourceCapsuleRootIntegrity: "root-hostile", clockBlocked: false, screen: "playing", semanticHash: "state", draw() { return; } }) };
      const edl = createStudioEdl({ id: "test", sourceGhostId: "hostile", sourceRootHash: "semantic-root", aspectRatio: "16:9", title: "", credits: "", clips: [{ id: "one", sourceFromTick: 0, sourceToTick: 12, outputOrder: 0, speed: 1, camera: "player-follow" }] });
      const media = createBrowserGhostStudioMedia({ createElement: () => canvas } as unknown as Document, () => Promise.resolve(true));
      await expect(media.render(capsule, session as never, edl, new AbortController().signal)).rejects.toThrow("native encoder refused");
      expect(stop).toHaveBeenCalledOnce(); media.dispose();
    } finally { vi.unstubAllGlobals(); }
  });
});

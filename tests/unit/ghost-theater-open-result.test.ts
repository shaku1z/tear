import { encodeStudioVp8Webm } from "../../src/app/browser-ghost-studio-webm";
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

  it("encodes every planned timestamp independently of reconstruction time into bounded WebM blocks", async () => {
    const frames: { timestamp: number; duration: number; closed: boolean }[] = [], closed = vi.fn();
    class Frame {
      readonly timestamp: number; readonly duration: number; closed = false;
      constructor(_canvas: HTMLCanvasElement, init: VideoFrameInit) { this.timestamp = init.timestamp ?? -1; this.duration = init.duration ?? -1; frames.push(this); }
      close() { this.closed = true; }
    }
    class Encoder {
      static isConfigSupported(config: VideoEncoderConfig) { return Promise.resolve({ supported: true, config }); }
      state = "configured"; encodeQueueSize = 0; readonly pending: EncodedVideoChunk[] = [];
      constructor(readonly callbacks: VideoEncoderInit) {}
      configure() { return; }
      encode(frame: Frame, options: VideoEncoderEncodeOptions) {
        const number = frames.length - 1, payload = Uint8Array.from([number, 0xA5, 0x5A]);
        this.pending.push({ timestamp: frame.timestamp, duration: frame.duration, type: options.keyFrame ? "key" : "delta", byteLength: payload.length,
          copyTo(destination) { if (!(destination instanceof Uint8Array)) throw new Error("unexpected destination"); destination.set(payload); } }); this.encodeQueueSize++;
      }
      flush() { for (const chunk of this.pending.splice(0)) this.callbacks.output(chunk, {}); this.encodeQueueSize = 0; return Promise.resolve(); }
      close() { this.state = "closed"; closed(); }
    }
    vi.stubGlobal("VideoFrame", Frame); vi.stubGlobal("VideoEncoder", Encoder);
    try {
      const order: number[] = [], bytes = await encodeStudioVp8Webm({ width: 640, height: 360 } as HTMLCanvasElement, 31, (index) => { order.push(index); }, new AbortController().signal);
      expect(order).toEqual(Array.from({ length: 31 }, (_, index) => index));
      expect(frames.map((frame) => frame.timestamp)).toEqual(order.map((index) => Math.round(index * 1000000 / 30)));
      expect(frames.every((frame) => frame.closed)).toBe(true); expect(frames.reduce((sum, frame) => sum + frame.duration, 0)).toBe(1033333); expect(closed).toHaveBeenCalledOnce();
      const roots = ebmlElements(bytes), segment = roots.find((entry) => entry.id === 0x18538067); if (segment === undefined) throw new Error("missing Segment");
      const content = ebmlElements(segment.data), info = content.find((entry) => entry.id === 0x1549A966); if (info === undefined) throw new Error("missing Info");
      const duration = ebmlElements(info.data).find((entry) => entry.id === 0x4489); if (duration === undefined) throw new Error("missing Duration");
      expect(new DataView(duration.data.buffer, duration.data.byteOffset, 8).getFloat64(0)).toBe(31 * 1000 / 30);
      expect(new TextDecoder().decode(bytes)).toContain("V_VP8");
      const clusters = content.filter((entry) => entry.id === 0x1F43B675); expect(clusters).toHaveLength(2);
      const seekHead = content.find((entry) => entry.id === 0x114D9B74), cues = content.find((entry) => entry.id === 0x1C53BB6B);
      if (seekHead === undefined || cues === undefined) throw new Error("missing seeking metadata");
      const integer = (data: Uint8Array) => data.reduce((value, byte) => value * 256 + byte, 0);
      for (const seek of ebmlElements(seekHead.data)) {
        const fields = ebmlElements(seek.data), id = fields.find((field) => field.id === 0x53AB), position = fields.find((field) => field.id === 0x53AC);
        if (id === undefined || position === undefined) throw new Error("invalid SeekHead");
        expect(content.find((entry) => entry.id === integer(id.data))?.position).toBe(integer(position.data));
      }
      const cuePoints = ebmlElements(cues.data); expect(cuePoints).toHaveLength(2);
      for (const [index, point] of cuePoints.entries()) {
        const fields = ebmlElements(point.data), track = fields.find((field) => field.id === 0xB7); if (track === undefined) throw new Error("missing CueTrackPositions");
        const position = ebmlElements(track.data).find((field) => field.id === 0xF1); if (position === undefined) throw new Error("missing CueClusterPosition");
        expect(integer(position.data)).toBe(clusters[index]?.position);
      }
      const blocks = clusters.flatMap((entry) => ebmlElements(entry.data).filter((child) => child.id === 0xA3));
      expect(blocks).toHaveLength(31); expect(blocks[0]?.data[3]).toBe(0x80); expect(blocks[1]?.data[3]).toBe(0); expect(blocks[30]?.data[3]).toBe(0x80);
      expect(blocks.map((entry) => [...entry.data.subarray(4)])).toEqual(order.map((index) => [index, 0xA5, 0x5A]));
      const last = blocks[29]; if (last === undefined) throw new Error("missing block"); expect(new DataView(last.data.buffer, last.data.byteOffset + 1, 2).getInt16(0)).toBe(967);
    } finally { vi.unstubAllGlobals(); }
  });

  it("closes bounded queued frames and encoder on cancellation and refuses unsupported native VP8", async () => {
    const closed = vi.fn(), frameClosed = vi.fn(), flush = vi.fn(() => new Promise<void>(() => undefined)); let supported = false;
    class Frame { close = frameClosed; }
    class Encoder {
      static isConfigSupported(config: VideoEncoderConfig) { return Promise.resolve({ supported, config }); }
      state = "configured"; encodeQueueSize = 0;
      configure() { return; } encode() { this.encodeQueueSize++; } flush = flush;
      close() { this.state = "closed"; closed(); }
    }
    vi.stubGlobal("VideoFrame", Frame); vi.stubGlobal("VideoEncoder", Encoder);
    try {
      await expect(encodeStudioVp8Webm({ width: 640, height: 360 } as HTMLCanvasElement, 30, vi.fn(), new AbortController().signal)).rejects.toThrow(/support/);
      expect(frameClosed).not.toHaveBeenCalled(); supported = true;
      const abort = new AbortController(), rendering = encodeStudioVp8Webm({ width: 640, height: 360 } as HTMLCanvasElement, 30, vi.fn(), abort.signal);
      await vi.waitFor(() => { expect(flush).toHaveBeenCalledOnce(); }); abort.abort(new Error("cancel"));
      await expect(rendering).rejects.toThrow(/cancel/); expect(frameClosed).toHaveBeenCalledTimes(4); expect(closed).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
});

/** Read only standard EBML IDs/sizes for the unit container structure control; payload here is a codec-port fixture, not decodable VP8 evidence. */
function ebmlElements(bytes: Uint8Array): { id: number; data: Uint8Array; position: number }[] {
  const result: { id: number; data: Uint8Array; position: number }[] = []; let offset = 0;
  while (offset < bytes.length) {
    const position = offset;
    const read = (keepMarker: boolean) => {
      const first = bytes[offset++]; if (first === undefined || first === 0) throw new Error("invalid EBML integer");
      let marker = 0x80, length = 1; while ((first & marker) === 0) { marker >>= 1; length++; }
      let value = keepMarker ? first : first & (marker - 1);
      for (let count = 1; count < length; count++) { const next = bytes[offset++]; if (next === undefined) throw new Error("truncated EBML"); value = value * 256 + next; } return value;
    };
    const id = read(true), length = read(false); if (offset + length > bytes.length) throw new Error("truncated EBML payload");
    result.push({ id, data: bytes.subarray(offset, offset + length), position }); offset += length;
  }
  return result;
}

import { clipWebCodecsAvailable, encodeClipVp8Webm } from "./browser-replay-clip-webm";
import type { GhostReadCapsule } from "../../ghost/capsule-reader";
import type { GhostVerifiedProductionReplaySession } from "../../ghost/production-replay-session";
import { createReplayCutList, type ReplayCutList } from "../../ghost/replay-cut-list";
import { parseGhostApplicationClockEvent } from "../../ghost/application-frame-events";
import { mapGhostCapsuleToReplayEnvelope } from "../../ghost/capsule-replay-envelope";
import { stableVerificationHash } from "../../domain/hash";

/** A cut list rendered to one WebM file, held in memory until the player downloads it. */
export interface ReplayClipWebm {
  readonly fileName: string;
  readonly mimeType: "video/webm";
  readonly bytes: Uint8Array;
  readonly thumbnail: string;
  readonly sourceId: string;
  readonly durationSeconds: number;
}
export interface ReplayClipExportPort {
  available(): boolean;
  render(
    capsule: GhostReadCapsule,
    session: GhostVerifiedProductionReplaySession,
    cutList: ReplayCutList,
    signal: AbortSignal,
  ): Promise<ReplayClipWebm>;
  download(clip: ReplayClipWebm, signal: AbortSignal): Promise<void>;
  drawThumbnail?(
    canvas: CanvasRenderingContext2D,
    rectangle: Readonly<{ x: number; y: number; w: number; h: number }>,
  ): void;
  dispose(): void;
}
const MAX_FRAMES = 1800,
  MAX_BYTES = 64 * 1024 * 1024,
  FPS = 30,
  WIDTH = 640,
  HEIGHT = 360;
function mediaWait(
  target: EventTarget,
  event: string,
  signal: AbortSignal,
  milliseconds = 10000,
  activate?: () => void,
): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown): void => {
      clearTimeout(timer);
      target.removeEventListener(event, done);
      signal.removeEventListener("abort", aborted);
      if (error === undefined) resolve();
      else reject(error instanceof Error ? error : new Error("Media operation failed", { cause: error }));
    };
    const done = (): void => {
        finish();
      },
      aborted = (): void => {
        finish(signal.reason);
      };
    const timer = setTimeout(() => {
      finish(new Error(`WebM ${event} timed out`));
    }, milliseconds);
    target.addEventListener(event, done, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
    try {
      activate?.();
    } catch (error) {
      finish(error);
    }
  });
}

/** The simulation tick each output frame shows, clip after clip. Refuses what the export cannot draw. */
function framePlan(capsule: GhostReadCapsule, cutList: ReplayCutList): readonly number[] {
  if (
    cutList.clips.length === 0 ||
    new Set(cutList.clips.map((clip) => clip.outputOrder)).size !== cutList.clips.length
  )
    throw new TypeError("Clip order is invalid");
  const plan: number[] = [];
  for (const clip of [...cutList.clips].sort((a, b) => a.outputOrder - b.outputOrder)) {
    if (
      ![0.25, 0.5, 1, 2, 4].includes(clip.speed) ||
      !Number.isSafeInteger(clip.sourceFromTick) ||
      !Number.isSafeInteger(clip.sourceToTick) ||
      clip.sourceFromTick < 0 ||
      clip.sourceToTick <= clip.sourceFromTick ||
      clip.sourceToTick > capsule.maxTick ||
      !Number.isSafeInteger(clip.outputOrder)
    )
      throw new TypeError("Clip is unsupported or outside its source");
    // Only simulation-time gameplay is offered. Never collapse recorded zero-tick cinema/intro frames into inferred physics time.
    if (
      capsule.tracks.events.some((entry) => {
        const value = parseGhostApplicationClockEvent(entry.value)?.payload;
        return (
          value?.format === "tearghost-application-frame" &&
          value.kind === "begin" &&
          value.beforeTick >= clip.sourceFromTick &&
          value.beforeTick < clip.sourceToTick
        );
      })
    )
      throw new TypeError("Source-time cinema/intro media is unavailable; choose a gameplay-only range");
    const count = Math.ceil(((clip.sourceToTick - clip.sourceFromTick) * FPS) / (120 * clip.speed));
    if (count + plan.length > MAX_FRAMES) throw new RangeError("Clip export exceeds 1800 frames / 60 seconds");
    for (let index = 0; index < count; index++)
      plan.push(Math.min(clip.sourceToTick - 1, clip.sourceFromTick + Math.floor((index * 120 * clip.speed) / FPS)));
  }
  return plan;
}

/** Browser-native local encoding of the dedicated reconstructed replay canvas, never the live game surface. */
export function createBrowserReplayClipExport(
  document: Document,
  current: (id: string, manifestHash: string) => Promise<boolean>,
): ReplayClipExportPort {
  const urls = new Set<string>(),
    timers = new Set<ReturnType<typeof setTimeout>>();
  const release = (url: string): void => {
    URL.revokeObjectURL(url);
    urls.delete(url);
  };
  let last: Readonly<{ clip: ReplayClipWebm; manifestHash: string; image: HTMLImageElement }> | undefined;
  const check = async (id: string, hash: string, signal: AbortSignal): Promise<void> => {
    signal.throwIfAborted();
    if (!(await current(id, hash))) throw new Error("The saved replay changed during the export");
    signal.throwIfAborted();
  };
  return {
    available: clipWebCodecsAvailable,
    async render(capsule, session, cutList, signal) {
      if (!clipWebCodecsAvailable()) throw new Error("Timestamped WebCodecs VP8 export is unavailable.");
      const source = mapGhostCapsuleToReplayEnvelope(capsule).ghost;
      if (
        session.renderFrame === undefined ||
        capsule.manifest.id !== session.sourceId ||
        capsule.manifest.rootIntegrity !== session.sourceCapsuleRootIntegrity ||
        cutList.sourceGhostId !== session.sourceId ||
        cutList.sourceRootHash !== session.sourceRootHash ||
        cutList.sourceGhostId !== source.id ||
        cutList.sourceRootHash !== source.rootHash ||
        createReplayCutList(cutList).cutListHash !== cutList.cutListHash
      )
        throw new TypeError("The cut list does not belong to this replay");
      const plan = framePlan(capsule, cutList);
      const manifestHash = stableVerificationHash(capsule.manifest);
      await check(session.sourceId, manifestHash, signal);
      last = undefined;
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const context = canvas.getContext("2d", { alpha: false });
      if (context === null) throw new Error("Clip export canvas is unavailable");
      const draw = (index: number): void => {
        signal.throwIfAborted();
        const tick = plan[index];
        if (tick === undefined) throw new Error("Clip frame plan is incomplete");
        const view = session.renderFrame?.(tick);
        if (
          view?.sourceRootHash !== cutList.sourceRootHash ||
          view.sourceCapsuleRootIntegrity !== capsule.manifest.rootIntegrity ||
          view.clockBlocked ||
          view.screen !== "playing"
        )
          throw new TypeError("This frame is not supported gameplay-time media");
        view.draw(context, { x: 0, y: 0, w: WIDTH, h: HEIGHT });
      };
      draw(0);
      const thumbnail = canvas.toDataURL("image/png");
      const encoded = await encodeClipVp8Webm(canvas, plan.length, draw, signal);
      const blob = new Blob([Uint8Array.from(encoded).buffer], { type: "video/webm" });
      if (blob.size === 0 || blob.size > MAX_BYTES) throw new Error("VP8 encoder returned invalid output size");
      const url = URL.createObjectURL(blob);
      urls.add(url);
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      let durationSeconds: number;
      try {
        const loaded = mediaWait(video, "loadedmetadata", signal);
        video.src = url;
        await loaded;
        if (!Number.isFinite(video.duration)) {
          const sought = mediaWait(video, "seeked", signal);
          video.currentTime = 1000000;
          await sought;
        }
        durationSeconds = Number.isFinite(video.duration) ? video.duration : video.currentTime + 1 / FPS;
        if (
          video.videoWidth !== WIDTH ||
          video.videoHeight !== HEIGHT ||
          !Number.isFinite(durationSeconds) ||
          Math.abs(durationSeconds - plan.length / FPS) > Math.max(0.35, (plan.length / FPS) * 0.05)
        )
          throw new Error("Decoded WebM dimensions/duration do not match the requested output");
      } finally {
        video.removeAttribute("src");
        video.load();
        release(url);
      }
      await check(session.sourceId, manifestHash, signal);
      const clip: ReplayClipWebm = Object.freeze({
        fileName: `${cutList.id}.webm`,
        mimeType: "video/webm",
        bytes: new Uint8Array(await blob.arrayBuffer()),
        thumbnail,
        sourceId: session.sourceId,
        durationSeconds,
      });
      const image = document.createElement("img"),
        loadedImage = mediaWait(image, "load", signal);
      image.src = thumbnail;
      await loadedImage;
      await check(session.sourceId, manifestHash, signal);
      last = { clip, manifestHash, image };
      return clip;
    },
    async download(clip, signal) {
      const captured = last;
      if (captured?.clip !== clip) throw new Error("The exported clip is stale");
      await check(clip.sourceId, captured.manifestHash, signal);
      if (last !== captured) throw new Error("The exported clip was replaced");
      const url = URL.createObjectURL(new Blob([Uint8Array.from(clip.bytes).buffer], { type: clip.mimeType }));
      urls.add(url);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = clip.fileName.replace(/[^a-zA-Z0-9._-]/gu, "_").slice(0, 120);
      try {
        document.body.append(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        const timer = setTimeout(() => {
          timers.delete(timer);
          release(url);
        }, 1000);
        timers.add(timer);
      }
    },
    drawThumbnail(canvas, rectangle) {
      if (last !== undefined) canvas.drawImage(last.image, rectangle.x, rectangle.y, rectangle.w, rectangle.h);
    },
    dispose() {
      last = undefined;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}

import { clipWebCodecsAvailable, encodeClipVp8Webm } from "./browser-replay-clip-webm";
import { REPLAY_TICKS_PER_SECOND } from "../../replay/record";
import { WATCH_SPEEDS } from "../../replay/watch";

/** One range of a watched run, in simulation ticks, played at a replay speed. */
export interface ReplayClip {
  readonly fromTick: number;
  readonly toTick: number;
  readonly speed: number;
}

/** A frame the export can draw: the watched world at one tick, as the replay screen draws it. */
export interface ReplayClipFrame {
  /** True while a scene or a boss's arrival holds the run clock; such a frame is not gameplay time. */
  readonly clockBlocked: boolean;
  readonly screen: string;
  readonly draw: (
    canvas: CanvasRenderingContext2D,
    rectangle: Readonly<{ x: number; y: number; w: number; h: number }>,
  ) => void;
}

/** The run the clips are cut from: its own watch, so exporting never moves the replay on screen. */
export interface ReplayClipSource {
  readonly id: string;
  readonly lastTick: number;
  readonly frameAt: (tick: number) => ReplayClipFrame;
  readonly dispose: () => void;
}

/** The clips rendered to one WebM file, held in memory until the player downloads it. */
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
  render(source: ReplayClipSource, clips: readonly ReplayClip[], signal: AbortSignal): Promise<ReplayClipWebm>;
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

/**
 * The simulation tick each output frame shows, clip after clip, at a fixed frame rate: no wall clock enters
 * a frame. Refuses a clip outside the run, an unoffered speed, and more than 60 seconds of video.
 */
export function replayClipFramePlan(lastTick: number, clips: readonly ReplayClip[]): readonly number[] {
  if (clips.length === 0) throw new TypeError("There are no clips to export");
  const plan: number[] = [];
  for (const clip of clips) {
    if (
      !WATCH_SPEEDS.some((speed) => speed === clip.speed) ||
      !Number.isSafeInteger(clip.fromTick) ||
      !Number.isSafeInteger(clip.toTick) ||
      clip.fromTick < 0 ||
      clip.toTick <= clip.fromTick ||
      clip.toTick > lastTick
    )
      throw new TypeError("Clip is unsupported or outside its run");
    const step = (REPLAY_TICKS_PER_SECOND * clip.speed) / FPS;
    const count = Math.ceil((clip.toTick - clip.fromTick) / step);
    if (count + plan.length > MAX_FRAMES) throw new RangeError("Clip export exceeds 1800 frames / 60 seconds");
    for (let index = 0; index < count; index++)
      plan.push(Math.min(clip.toTick - 1, clip.fromTick + Math.floor(index * step)));
  }
  return plan;
}

/** Browser-native local encoding of a dedicated canvas, never the live game surface. */
export function createBrowserReplayClipExport(document: Document): ReplayClipExportPort {
  const urls = new Set<string>(),
    timers = new Set<ReturnType<typeof setTimeout>>();
  const release = (url: string): void => {
    URL.revokeObjectURL(url);
    urls.delete(url);
  };
  let last: Readonly<{ clip: ReplayClipWebm; image: HTMLImageElement }> | undefined;
  return {
    available: clipWebCodecsAvailable,
    async render(source, clips, signal) {
      if (!clipWebCodecsAvailable()) throw new Error("Timestamped WebCodecs VP8 export is unavailable.");
      const plan = replayClipFramePlan(source.lastTick, clips);
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
        const frame = source.frameAt(tick);
        // Only gameplay time is offered: a scene or an arrival holds the run clock, so it has no run time.
        if (frame.clockBlocked || frame.screen !== "playing")
          throw new TypeError("Scenes and arrivals cannot be exported; choose a gameplay-only range");
        frame.draw(context, { x: 0, y: 0, w: WIDTH, h: HEIGHT });
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
      const clip: ReplayClipWebm = Object.freeze({
        fileName: `${source.id}.webm`,
        mimeType: "video/webm",
        bytes: new Uint8Array(await blob.arrayBuffer()),
        thumbnail,
        sourceId: source.id,
        durationSeconds,
      });
      const image = document.createElement("img"),
        loadedImage = mediaWait(image, "load", signal);
      image.src = thumbnail;
      await loadedImage;
      signal.throwIfAborted();
      last = { clip, image };
      return clip;
    },
    download(clip, signal) {
      if (last?.clip !== clip) return Promise.reject(new Error("The exported clip is stale"));
      if (signal.aborted) return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
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
      return Promise.resolve();
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

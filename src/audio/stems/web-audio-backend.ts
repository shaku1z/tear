import type { StemAudioBackend, StemVoice } from "./StemCuePlayer";
import type { StemAsset, StemSource } from "./types";

/** Pick the first codec source the browser reports it can play. */
export function pickSource(
  sources: readonly StemSource[],
  canPlay: (mime: string) => boolean,
): StemSource | null {
  for (const source of sources) if (canPlay(source.mime)) return source;
  return sources[0] ?? null;
}

function resolveUrl(baseUrl: string, url: string): string {
  if (/^https?:\/\//u.test(url) || url.startsWith("/")) return url;
  const base = new URL(baseUrl.replace(/\/?$/u, "/"), document.baseURI);
  return new URL(url, base).href;
}

function browserCanPlay(mime: string): boolean {
  if (typeof document === "undefined") return true;
  return document.createElement("audio").canPlayType(mime) !== "";
}

function equalPowerCurve(direction: "in" | "out"): Float32Array {
  const points = 33;
  const curve = new Float32Array(points);
  for (let index = 0; index < points; index += 1) {
    const progress = index / (points - 1);
    curve[index] =
      direction === "in"
        ? Math.sin((Math.PI / 2) * progress)
        : Math.cos((Math.PI / 2) * progress);
  }
  return curve;
}

/**
 * One decoded stem on a shared intensity bus.
 *
 * Hard seams use one native looping `AudioBufferSourceNode`, keeping the cue
 * sample-aligned. Crossfade and tail-overlap seams use pre-scheduled, equal-power
 * source banks on the same gain bus; that is intentionally reserved for ambient,
 * vocal, and tail material whose continuous decay matters more than hard-grid
 * transients. Intensity is always a gain ramp, never a stop or re-seek.
 */
class WebAudioStemVoice implements StemVoice {
  readonly #gain: GainNode;
  readonly #panner: StereoPannerNode;
  #hardSource: AudioBufferSourceNode | null = null;
  readonly #segments = new Set<{
    readonly source: AudioBufferSourceNode;
    readonly gain: GainNode;
  }>();
  #loopStart = 0;
  #loopEnd = 0;
  #seamMode: "hard" | "crossfade" | "tail-overlap" = "hard";
  #crossfadeSeconds = 0;
  #nextSegmentAt = 0;
  #scheduler: ReturnType<typeof globalThis.setInterval> | null = null;
  #disposed = false;

  constructor(
    readonly id: string,
    private readonly context: AudioContext,
    private readonly buffer: AudioBuffer,
    output: AudioNode,
    pan = 0,
  ) {
    this.#gain = context.createGain();
    this.#panner = context.createStereoPanner();
    this.#gain.gain.value = 0;
    this.#panner.pan.value = pan;
    this.#gain.connect(this.#panner);
    this.#panner.connect(output);
  }

  configureLoop(
    loopStartSeconds: number,
    loopEndSeconds: number,
    options?: {
      readonly mode: "hard" | "crossfade" | "tail-overlap";
      readonly crossfadeSeconds?: number;
    },
  ): void {
    this.#loopStart = loopStartSeconds;
    this.#loopEnd = Math.min(loopEndSeconds, this.buffer.duration);
    this.#seamMode = options?.mode ?? "hard";
    const duration = Math.max(0, this.#loopEnd - this.#loopStart);
    this.#crossfadeSeconds = Math.min(
      Math.max(0, options?.crossfadeSeconds ?? 0),
      duration * 0.49,
    );
  }

  #usesScheduledSeam(): boolean {
    return (
      (this.#seamMode === "crossfade" ||
        this.#seamMode === "tail-overlap") &&
      this.#crossfadeSeconds >= 0.005
    );
  }

  #scheduleSegment(
    atTime: number,
    offsetSeconds: number,
    durationSeconds: number,
    fadeIn: boolean,
  ): void {
    const source = this.context.createBufferSource();
    const segmentGain = this.context.createGain();
    const fade = Math.min(
      this.#crossfadeSeconds,
      Math.max(0, durationSeconds / 2),
    );
    source.buffer = this.buffer;
    source.connect(segmentGain);
    segmentGain.connect(this.#gain);
    segmentGain.gain.setValueAtTime(fadeIn ? 0 : 1, atTime);
    if (fadeIn && fade > 0)
      segmentGain.gain.setValueCurveAtTime(
        equalPowerCurve("in"),
        atTime,
        fade,
      );
    if (fade > 0) {
      segmentGain.gain.setValueAtTime(1, atTime + durationSeconds - fade);
      segmentGain.gain.setValueCurveAtTime(
        equalPowerCurve("out"),
        atTime + durationSeconds - fade,
        fade,
      );
    }
    const segment = { source, gain: segmentGain };
    this.#segments.add(segment);
    source.onended = () => {
      this.#segments.delete(segment);
      try {
        source.disconnect();
        segmentGain.disconnect();
      } catch {
        /* nodes may already be disconnected during disposal */
      }
    };
    source.start(atTime, offsetSeconds, durationSeconds);
  }

  #scheduleAhead(): void {
    if (this.#disposed || !this.#usesScheduledSeam()) return;
    const loopDuration = this.#loopEnd - this.#loopStart;
    const interval = loopDuration - this.#crossfadeSeconds;
    if (loopDuration <= 0 || interval <= 0) return;
    const horizon = this.context.currentTime + 12;
    while (this.#nextSegmentAt < horizon) {
      this.#scheduleSegment(
        this.#nextSegmentAt,
        this.#loopStart,
        loopDuration,
        true,
      );
      this.#nextSegmentAt += interval;
    }
  }

  start(atTime: number, offsetSeconds: number): void {
    this.#disposed = false;
    if (!this.#usesScheduledSeam()) {
      const source = this.context.createBufferSource();
      source.buffer = this.buffer;
      source.loop = true;
      source.loopStart = this.#loopStart;
      source.loopEnd = this.#loopEnd || this.buffer.duration;
      source.connect(this.#gain);
      source.start(atTime, offsetSeconds);
      this.#hardSource = source;
      return;
    }

    const initialOffset = Math.min(
      Math.max(offsetSeconds, 0),
      this.#loopEnd,
    );
    const initialDuration = Math.max(0.005, this.#loopEnd - initialOffset);
    this.#scheduleSegment(atTime, initialOffset, initialDuration, false);
    this.#nextSegmentAt =
      atTime + initialDuration - this.#crossfadeSeconds;
    this.#scheduleAhead();
    this.#scheduler = globalThis.setInterval(() => {
      this.#scheduleAhead();
    }, 2_000);
  }

  rampGain(target: number, atTime: number, rampSeconds: number): void {
    const g = this.#gain.gain;
    g.cancelScheduledValues(atTime);
    g.setValueAtTime(g.value, atTime);
    g.linearRampToValueAtTime(target, atTime + Math.max(0.005, rampSeconds));
  }

  setGain(value: number): void {
    this.#gain.gain.value = value;
  }

  stop(atTime?: number): void {
    if (this.#scheduler !== null) globalThis.clearInterval(this.#scheduler);
    this.#scheduler = null;
    try {
      this.#hardSource?.stop(atTime);
    } catch {
      /* already stopped */
    }
    for (const segment of this.#segments)
      try {
        segment.source.stop(atTime);
      } catch {
        /* already stopped */
      }
  }

  dispose(): void {
    this.#disposed = true;
    this.stop();
    this.#hardSource?.disconnect();
    for (const segment of this.#segments) {
      segment.source.disconnect();
      segment.gain.disconnect();
    }
    this.#segments.clear();
    this.#gain.disconnect();
    this.#panner.disconnect();
    this.#hardSource = null;
  }
}

/** `StemAudioBackend` on the game's shared AudioContext — no Tone, no 2nd context. */
export class WebAudioStemBackend implements StemAudioBackend {
  readonly #canPlay: (mime: string) => boolean;

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode,
    private readonly baseUrl: string,
    canPlay: (mime: string) => boolean = browserCanPlay,
  ) {
    this.#canPlay = canPlay;
  }

  now(): number {
    return this.context.currentTime;
  }

  async createVoice(asset: StemAsset): Promise<StemVoice> {
    const source = pickSource(asset.sources, this.#canPlay);
    if (!source) throw new Error(`Stem ${asset.id} has no playable source.`);
    const url = resolveUrl(this.baseUrl, source.url);
    const bytes = await fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Stem ${asset.id} failed to load: ${String(response.status)}`);
      return response.arrayBuffer();
    });
    const buffer = await this.context.decodeAudioData(bytes);
    return new WebAudioStemVoice(
      asset.id,
      this.context,
      buffer,
      this.output,
      asset.pan ?? 0,
    );
  }
}

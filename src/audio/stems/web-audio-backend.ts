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

/**
 * One decoded stem as a native looping `AudioBufferSourceNode` → `GainNode`.
 * This is the sample-accurate primitive the architecture calls for; intensity is
 * only ever expressed by ramping the gain, never by stopping/re-seeking.
 */
class WebAudioStemVoice implements StemVoice {
  readonly #gain: GainNode;
  #source: AudioBufferSourceNode | null = null;
  #loopStart = 0;
  #loopEnd = 0;

  constructor(
    readonly id: string,
    private readonly context: AudioContext,
    private readonly buffer: AudioBuffer,
    output: AudioNode,
  ) {
    this.#gain = context.createGain();
    this.#gain.gain.value = 0;
    this.#gain.connect(output);
  }

  configureLoop(loopStartSeconds: number, loopEndSeconds: number): void {
    // AudioBufferSourceNode loop points must be set before start(); cache them.
    this.#loopStart = loopStartSeconds;
    this.#loopEnd = Math.min(loopEndSeconds, this.buffer.duration);
  }

  start(atTime: number, offsetSeconds: number): void {
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    source.loopStart = this.#loopStart;
    source.loopEnd = this.#loopEnd || this.buffer.duration;
    source.connect(this.#gain);
    source.start(atTime, offsetSeconds);
    this.#source = source;
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
    try {
      this.#source?.stop(atTime);
    } catch {
      /* already stopped */
    }
  }

  dispose(): void {
    this.stop();
    this.#source?.disconnect();
    this.#gain.disconnect();
    this.#source = null;
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
    return new WebAudioStemVoice(asset.id, this.context, buffer, this.output);
  }
}

import { loopSeconds, planTierGains, secondsPerBar } from "./tier";
import type { StemAsset, StemCueManifest, Tier } from "./types";
import { assertValidStemCue } from "./validate";

/**
 * Audio-backend abstraction for one decoded stem. A concrete implementation
 * (e.g. a Tone.Player wrapper) is injected, so this package carries no Web Audio
 * dependency and the scheduling logic is unit-testable with a mock.
 *
 * Contract: `start` schedules looped playback of `[loopStartSeconds,
 * loopEndSeconds]` beginning at absolute context time `atTime`, reading from the
 * buffer at `offsetSeconds`. The voice keeps running regardless of gain;
 * intensity is expressed only through `rampGain`.
 */
export interface StemVoice {
  readonly id: string;
  configureLoop(loopStartSeconds: number, loopEndSeconds: number): void;
  start(atTime: number, offsetSeconds: number): void;
  rampGain(target: number, atTime: number, rampSeconds: number): void;
  setGain(value: number): void;
  stop(atTime?: number): void;
  dispose(): void;
}

export interface StemAudioBackend {
  /** Current audio-context time in seconds. */
  now(): number;
  /** Create a voice for a decoded stem asset. */
  createVoice(asset: StemAsset): Promise<StemVoice>;
}

export interface StartOptions {
  /** Where the first sound lands relative to `now()`. Default 0.15 s of lead. */
  readonly leadSeconds?: number;
  /** Begin from the one-shot intro region, then fall into the loop. */
  readonly fromIntro?: boolean;
}

export interface SetTierOptions {
  /** Ramp length for the gain change; defaults to one bar. */
  readonly transitionBars?: number;
}

/**
 * Plays one adaptive stem cue. All stems are decoded up front, share the loop
 * boundary, and start at one scheduled time so they stay phase-aligned forever.
 * Tier changes ramp bus gains; nothing is stopped or re-seeked.
 */
export class StemCuePlayer {
  #cue: StemCueManifest | null = null;
  #backend: StemAudioBackend | null = null;
  #voices = new Map<string, StemVoice>();
  #tier: Tier = 0;
  #started = false;

  async load(cue: StemCueManifest, backend: StemAudioBackend): Promise<void> {
    assertValidStemCue(cue);
    this.unload();
    this.#cue = cue;
    this.#backend = backend;
    for (const asset of cue.stems) {
      const voice = await backend.createVoice(asset);
      this.#voices.set(asset.id, voice);
    }
  }

  /** Start every stem at one scheduled time; silent stems begin at gain 0. */
  start(options: StartOptions = {}): void {
    const cue = this.#cue;
    const backend = this.#backend;
    if (!cue || !backend) throw new Error("StemCuePlayer.load must run before start");
    if (this.#started) return;

    const { startSeconds, endSeconds } = loopSeconds(cue);
    const introOffset =
      options.fromIntro && cue.intro
        ? cue.intro.startFrame / cue.sourceSampleRate
        : startSeconds;

    const at = backend.now() + (options.leadSeconds ?? 0.15);
    const gains = planTierGains(cue, this.#tier);
    for (const [id, voice] of this.#voices) {
      voice.configureLoop(startSeconds, endSeconds);
      // Silent stems still start so their phase matches when they fade in later.
      voice.setGain(gains[id] ?? 0);
      voice.start(at, introOffset);
    }
    this.#started = true;
  }

  /** Change intensity by ramping stem gains — never restart or re-seek. */
  setTier(tier: Tier, options: SetTierOptions = {}): void {
    const cue = this.#cue;
    const backend = this.#backend;
    if (!cue || !backend) throw new Error("StemCuePlayer.load must run before setTier");
    this.#tier = tier;
    const gains = planTierGains(cue, tier);
    const rampSeconds = (options.transitionBars ?? 1) * secondsPerBar(cue);
    const at = backend.now();
    for (const [id, voice] of this.#voices) voice.rampGain(gains[id] ?? 0, at, rampSeconds);
  }

  get tier(): Tier {
    return this.#tier;
  }

  stop(atTime?: number): void {
    for (const voice of this.#voices.values()) voice.stop(atTime);
    this.#started = false;
  }

  unload(): void {
    for (const voice of this.#voices.values()) voice.dispose();
    this.#voices.clear();
    this.#cue = null;
    this.#backend = null;
    this.#tier = 0;
    this.#started = false;
  }
}

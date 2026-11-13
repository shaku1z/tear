import { loopSeconds, planTierGains, secondsPerBar } from "./tier";
import type { LoopMode, StemAsset, StemCueManifest, StemMixPreset, Tier } from "./types";
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
  configureLoop(
    loopStartSeconds: number,
    loopEndSeconds: number,
    options?: {
      readonly mode: LoopMode;
      readonly crossfadeSeconds?: number;
    },
  ): void;
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

export interface LoadOptions {
  /**
   * Stems to wait for before `load` resolves (default: all). Every stem is
   * requested at once; the others join in phase as they arrive, so the stems
   * the current tier plays can start sooner.
   */
  readonly first?: readonly string[];
}

/**
 * Plays one adaptive stem cue. Stems share the loop boundary and start at one
 * scheduled time (a late stem joins at the matching loop position), so they stay
 * phase-aligned. Tier changes ramp bus gains; nothing is stopped or re-seeked.
 */
export class StemCuePlayer {
  #cue: StemCueManifest | null = null;
  #backend: StemAudioBackend | null = null;
  #voices = new Map<string, StemVoice>();
  #tier: Tier = 0;
  #preset: StemMixPreset | undefined;
  #started = false;
  #generation = 0;
  #startAt = 0;
  #startOffset = 0;
  #rest: Promise<void> = Promise.resolve();

  /** Set the player's mix preset (applies from the next start or tier change). */
  setMixPreset(preset: StemMixPreset | undefined): void {
    this.#preset = preset;
  }

  async load(cue: StemCueManifest, backend: StemAudioBackend, options: LoadOptions = {}): Promise<void> {
    assertValidStemCue(cue);
    this.unload();
    this.#cue = cue;
    this.#backend = backend;
    const generation = ++this.#generation;
    const first = new Set(options.first ?? cue.stems.map((asset) => asset.id));
    // Every request starts now; only the `first` stems gate the return.
    const requests = cue.stems.map((asset) => ({ asset, voice: backend.createVoice(asset) }));
    const join = async ({ asset, voice }: (typeof requests)[number]): Promise<void> => {
      const ready = await voice;
      if (generation !== this.#generation) {
        ready.dispose();
        return;
      }
      this.#voices.set(asset.id, ready);
      if (this.#started) this.#joinLate(asset.id, ready);
    };
    this.#rest = Promise.all(
      requests
        .filter((request) => !first.has(request.asset.id))
        .map((request) =>
          join(request).catch((error: unknown) => {
            console.warn(`stem ${request.asset.id} unavailable; it stays silent`, error);
          }),
        ),
    ).then(() => undefined);
    await Promise.all(requests.filter((request) => first.has(request.asset.id)).map(join));
  }

  /** Resolves once every stem of the loaded cue has arrived (or failed). */
  get allLoaded(): Promise<void> {
    return this.#rest;
  }

  #configure(id: string, voice: StemVoice): void {
    const cue = this.#cue;
    if (!cue) return;
    const { startSeconds, endSeconds } = loopSeconds(cue);
    const asset = cue.stems.find((candidate) => candidate.id === id);
    const crossfadeFrames = asset?.crossfadeFrames ?? cue.loop.crossfadeFrames;
    voice.configureLoop(startSeconds, endSeconds, {
      mode: asset?.seamMode ?? cue.loop.mode,
      ...(crossfadeFrames === undefined ? {} : { crossfadeSeconds: crossfadeFrames / cue.sourceSampleRate }),
    });
  }

  /** A stem that arrives after start enters at the loop position the others are at. */
  #joinLate(id: string, voice: StemVoice): void {
    const cue = this.#cue;
    const backend = this.#backend;
    if (!cue || !backend) return;
    this.#configure(id, voice);
    const gain = planTierGains(cue, this.#tier, this.#preset)[id] ?? 0;
    const at = Math.max(backend.now() + 0.05, this.#startAt);
    const { startSeconds, endSeconds, lengthSeconds } = loopSeconds(cue);
    let position = this.#startOffset + (at - this.#startAt);
    if (position >= endSeconds) position = startSeconds + ((position - startSeconds) % lengthSeconds);
    voice.setGain(0);
    voice.start(at, position);
    voice.rampGain(gain, at, secondsPerBar(cue));
  }

  /** Start every stem at one scheduled time; silent stems begin at gain 0. */
  start(options: StartOptions = {}): void {
    const cue = this.#cue;
    const backend = this.#backend;
    if (!cue || !backend) throw new Error("StemCuePlayer.load must run before start");
    if (this.#started) return;

    const { startSeconds } = loopSeconds(cue);
    const introOffset = options.fromIntro && cue.intro ? cue.intro.startFrame / cue.sourceSampleRate : startSeconds;

    const at = backend.now() + (options.leadSeconds ?? 0.15);
    this.#startAt = at;
    this.#startOffset = introOffset;
    const gains = planTierGains(cue, this.#tier, this.#preset);
    for (const [id, voice] of this.#voices) {
      this.#configure(id, voice);
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
    const gains = planTierGains(cue, tier, this.#preset);
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
    this.#generation += 1;
    for (const voice of this.#voices.values()) voice.dispose();
    this.#voices.clear();
    this.#cue = null;
    this.#backend = null;
    this.#tier = 0;
    this.#started = false;
  }
}

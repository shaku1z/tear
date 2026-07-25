/**
 * THE SIGNAL — stingers.
 *
 * Short musical phrases superimposed over the running music on game triggers
 * (boss arrival, apex rank, victory). They are deliberately rate-limited: a
 * stinger that fires every time the player does something well stops reading as
 * an accent and starts reading as noise.
 */

export type StingerId = "boss-arrival" | "tearing" | "victory";

/**
 * Stingers are OFF by default.
 *
 * The current assets are carved from specific works, so firing one over a
 * different track reads as an unrelated layer rather than an accent — which is
 * exactly how it sounded in play. Re-enable only once each cue ships stingers
 * derived from its own material.
 */
let enabled = false;
export function setStingersEnabled(value: boolean): void { enabled = value; }
export function stingersEnabled(): boolean { return enabled; }

const ASSETS: Readonly<Record<StingerId, string>> = {
  "boss-arrival": "audio/stingers/boss-arrival.ogg",
  tearing: "audio/stingers/tearing.ogg",
  victory: "audio/stingers/victory.ogg",
};

/** Minimum seconds between firings of the same stinger. */
const COOLDOWN_SECONDS: Readonly<Record<StingerId, number>> = {
  "boss-arrival": 20,
  tearing: 25,
  victory: 10,
};

/** Never let stingers stack up on top of each other. */
const GLOBAL_COOLDOWN_SECONDS = 3;

/**
 * Pure rate-limit policy: may `id` fire at `now`?
 * Kept separate from playback so the behaviour is directly testable.
 */
export function canFire(
  id: StingerId,
  now: number,
  lastPlayed: number | undefined,
  lastAny: number,
): boolean {
  if (now - lastAny < GLOBAL_COOLDOWN_SECONDS) return false;
  return now - (lastPlayed ?? Number.NEGATIVE_INFINITY) >= COOLDOWN_SECONDS[id];
}

export class StingerPlayer {
  readonly #buffers = new Map<StingerId, AudioBuffer>();
  readonly #lastPlayed = new Map<StingerId, number>();
  #lastAny = Number.NEGATIVE_INFINITY;
  #gain: GainNode | null = null;

  constructor(
    private readonly context: AudioContext,
    output: AudioNode,
    gainValue = 0.7,
  ) {
    this.#gain = context.createGain();
    this.#gain.gain.value = gainValue;
    this.#gain.connect(output);
  }

  /** Decode assets up front; a missing stinger is skipped, never fatal. */
  async load(baseUrl = ""): Promise<void> {
    if (!enabled) return; // do not spend bandwidth on a disabled layer
    await Promise.all(
      (Object.keys(ASSETS) as StingerId[]).map(async (id) => {
        try {
          const url = new URL(`${baseUrl}${ASSETS[id]}`, document.baseURI).href;
          const bytes = await fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("404"))));
          this.#buffers.set(id, await this.context.decodeAudioData(bytes));
        } catch {
          /* a stinger that fails to load simply never fires */
        }
      }),
    );
  }

  /** Returns true when the stinger actually sounded. */
  play(id: StingerId): boolean {
    if (!enabled) return false;
    const buffer = this.#buffers.get(id);
    const gain = this.#gain;
    if (!buffer || !gain) return false;
    const now = this.context.currentTime;
    if (!canFire(id, now, this.#lastPlayed.get(id), this.#lastAny)) return false;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(now + 0.01);
    source.onended = () => source.disconnect();
    this.#lastPlayed.set(id, now);
    this.#lastAny = now;
    return true;
  }

  dispose(): void {
    this.#gain?.disconnect();
    this.#gain = null;
    this.#buffers.clear();
  }
}

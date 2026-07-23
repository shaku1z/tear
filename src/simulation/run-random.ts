import { SeededRandom, type RandomSnapshot, type RandomSource } from "../domain/random";

export const RUN_RANDOM_STREAM_NAMES = Object.freeze([
  "legacy", "combat", "enemy-ai", "spawn", "draft", "boss", "world", "cosmetic",
] as const);
export type RunRandomStreamName = typeof RUN_RANDOM_STREAM_NAMES[number];
export type RunRandomStreamsSnapshot = Readonly<Record<RunRandomStreamName, RandomSnapshot>>;

/**
 * Owns independent deterministic streams. New systems should request the
 * narrowest stream instead of consuming the legacy compatibility stream.
 */
export class RunRandomStreams {
  #seed: number | string = 1;
  #streams = this.#createStreams(this.#seed);

  reset(seed: number | string): void {
    this.#seed = seed;
    this.#streams = this.#createStreams(seed);
  }

  stream(name: RunRandomStreamName): RandomSource {
    return this.#streams[name];
  }

  snapshot(): RunRandomStreamsSnapshot {
    return Object.freeze(Object.fromEntries(
      RUN_RANDOM_STREAM_NAMES.map((name) => [name, this.#streams[name].snapshot()]),
    ) as Record<RunRandomStreamName, RandomSnapshot>);
  }

  restore(snapshot: RunRandomStreamsSnapshot): void {
    for (const name of RUN_RANDOM_STREAM_NAMES) this.#streams[name].restore(snapshot[name]);
  }

  #createStreams(seed: number | string): Record<RunRandomStreamName, SeededRandom> {
    return {
      // Preserve the historical sequence for systems not yet stream-injected.
      legacy: new SeededRandom(seed),
      combat: new SeededRandom(`${String(seed)}::combat`),
      "enemy-ai": new SeededRandom(`${String(seed)}::enemy-ai`),
      spawn: new SeededRandom(`${String(seed)}::spawn`),
      draft: new SeededRandom(`${String(seed)}::draft`),
      boss: new SeededRandom(`${String(seed)}::boss`),
      world: new SeededRandom(`${String(seed)}::world`),
      cosmetic: new SeededRandom(`${String(seed)}::cosmetic`),
    };
  }
}

/**
 * Phase-5 compatibility service for legacy systems not yet constructor-injected.
 * The composition root resets it exactly once per run; extracted systems receive
 * the RandomSource interface directly.
 */
class RunRandomService implements RandomSource {
  readonly #streams: RunRandomStreams;

  constructor(streams: RunRandomStreams) {
    this.#streams = streams;
  }

  reset(seed: number | string): void {
    this.#streams.reset(seed);
  }

  next(): number {
    return this.#streams.stream("legacy").next();
  }

  snapshot(): RandomSnapshot {
    return this.#streams.snapshot().legacy;
  }
}

export const GAME_RANDOM_STREAMS = new RunRandomStreams();
export const GAME_RANDOM = new RunRandomService(GAME_RANDOM_STREAMS);

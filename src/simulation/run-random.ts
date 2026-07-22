import { SeededRandom, type RandomSnapshot, type RandomSource } from "../domain/random";

/**
 * Phase-5 compatibility service for legacy systems not yet constructor-injected.
 * The composition root resets it exactly once per run; extracted systems receive
 * the RandomSource interface directly.
 */
class RunRandomService implements RandomSource {
  #source = new SeededRandom(1);

  reset(seed: number | string): void {
    this.#source = new SeededRandom(seed);
  }

  next(): number {
    return this.#source.next();
  }

  snapshot(): RandomSnapshot {
    return this.#source.snapshot();
  }
}

export const GAME_RANDOM = new RunRandomService();

export interface RandomSnapshot {
  readonly state: number;
}

export interface RandomSource {
  next(): number;
}

function hashSeed(seed: number | string): number {
  if (typeof seed === "number") return seed >>> 0;
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A small deterministic PRNG for gameplay decisions. Never use for security. */
export class SeededRandom implements RandomSource {
  readonly #initialSeed: number;
  #state: number;

  constructor(seed: number | string) {
    this.#initialSeed = hashSeed(seed) || 0x6d2b79f5;
    this.#state = this.#initialSeed;
  }

  get initialSeed(): number {
    return this.#initialSeed;
  }

  nextUint32(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let value = this.#state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  next(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  integer(minInclusive: number, maxExclusive: number): number {
    if (!Number.isSafeInteger(minInclusive) || !Number.isSafeInteger(maxExclusive) || maxExclusive <= minInclusive) {
      throw new RangeError("Random integer bounds must be safe integers with max > min");
    }
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new RangeError("Cannot pick from an empty collection");
    const value = values[this.integer(0, values.length)];
    if (value === undefined) throw new Error("Deterministic random index was out of bounds");
    return value;
  }

  snapshot(): RandomSnapshot {
    return Object.freeze({ state: this.#state });
  }

  restore(snapshot: RandomSnapshot): void {
    this.#state = snapshot.state >>> 0;
  }
}

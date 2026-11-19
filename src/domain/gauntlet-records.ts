import { asRecord, isRecord, isSafeKey } from "./records";

/**
 * The Gauntlet personal best, one per difficulty, kept in the profile as an optional field.
 * A clear is measured in simulation ticks from the run's first tick to the last boss's
 * defeat; the faster clear wins and a tie goes to fewer hits taken. Wall-clock time is
 * never used, so a replay of the same run always measures the same.
 */
export interface GauntletClear {
  readonly ticks: number;
  readonly hits: number;
}

/** The fixed simulation rate the run's ticks count at. */
export const GAUNTLET_TICKS_PER_SECOND = 120;

export type GauntletBests = Readonly<Record<string, GauntletClear>>;

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** A stored clear, or null when it is malformed. A clear takes at least one tick. */
export function gauntletClear(value: unknown): GauntletClear | null {
  const record = asRecord(value);
  if (record === undefined) return null;
  const ticks = count(record.ticks),
    hits = count(record.hits);
  return ticks === null || hits === null || ticks === 0 ? null : Object.freeze({ ticks, hits });
}

/** Stored bests with malformed entries dropped; anything that is not an object reads as none. */
export function normalizeGauntletBests(value: unknown): GauntletBests {
  const output: Record<string, GauntletClear> = {};
  if (isRecord(value))
    for (const [difficulty, entry] of Object.entries(value)) {
      const clear = gauntletClear(entry);
      if (clear !== null && isSafeKey(difficulty)) output[difficulty] = clear;
    }
  return Object.freeze(output);
}

/** True when `candidate` beats `current`: fewer ticks, or as many ticks and fewer hits. */
export function betterGauntletClear(candidate: GauntletClear, current: GauntletClear | null | undefined): boolean {
  if (current === null || current === undefined) return true;
  return candidate.ticks < current.ticks || (candidate.ticks === current.ticks && candidate.hits < current.hits);
}

/** Both devices' bests, the better clear per difficulty. Order-independent and idempotent. */
export function mergeGauntletBests(left: GauntletBests, right: GauntletBests): GauntletBests {
  const output: Record<string, GauntletClear> = { ...left };
  for (const [difficulty, clear] of Object.entries(right))
    if (betterGauntletClear(clear, output[difficulty])) output[difficulty] = clear;
  return Object.freeze(output);
}

import type { RecordCheckpoint } from "./record-world";

/**
 * Watch's seek cache: checkpoints of the re-simulated world, taken as playback passes them, so a seek
 * to a tick the world has passed starts from the nearest one instead of from the seed.
 *
 * - **Spacing:** one checkpoint every `every` ticks (480 at first, the record's own checkpoint spacing).
 * - **Budget:** at most `limit` checkpoints. When a new one would pass it, the spacing doubles and the
 *   checkpoints off the wider grid are dropped, so a long run keeps evenly spaced checkpoints over its
 *   whole length and a seek re-simulates at most one spacing.
 * - It lives as long as the watched run is open; nothing is stored.
 */
export interface RecordSeekCache {
  /** Whether a checkpoint at this tick belongs in the cache and is not in it yet. */
  readonly wants: (tick: number) => boolean;
  readonly add: (checkpoint: RecordCheckpoint) => void;
  /** The latest checkpoint at or before `tick`. */
  readonly nearest: (tick: number) => RecordCheckpoint | undefined;
  /** The ticks held, oldest first, and the spacing now. */
  readonly held: () => Readonly<{ ticks: readonly number[]; every: number }>;
}

export const RECORD_SEEK_CACHE = Object.freeze({ every: 480, limit: 64 });

export function createRecordSeekCache(
  options: Readonly<{ every: number; limit: number }> = RECORD_SEEK_CACHE,
): RecordSeekCache {
  let every = options.every;
  const held = new Map<number, RecordCheckpoint>();
  const onGrid = (tick: number) => tick > 0 && tick % every === 0;
  return Object.freeze({
    wants: (tick: number) => onGrid(tick) && !held.has(tick),
    add: (checkpoint: RecordCheckpoint) => {
      if (!onGrid(checkpoint.tick) || held.has(checkpoint.tick)) return;
      while (held.size >= options.limit) {
        every *= 2;
        for (const tick of [...held.keys()]) if (!onGrid(tick)) held.delete(tick);
        if (!onGrid(checkpoint.tick)) return;
      }
      held.set(checkpoint.tick, checkpoint);
    },
    nearest: (tick: number) => {
      let best: RecordCheckpoint | undefined;
      for (const checkpoint of held.values())
        if (checkpoint.tick <= tick && (best === undefined || checkpoint.tick > best.tick)) best = checkpoint;
      return best;
    },
    held: () => Object.freeze({ ticks: Object.freeze([...held.keys()].sort((a, b) => a - b)), every }),
  });
}

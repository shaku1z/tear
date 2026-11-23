import type { ReplayRun } from "./record";
import { createReplayInputCursor, type ReplayTickInputs } from "./verify";

/** Simulation ticks per second of run time; a replay's clock and seek bar read time, not ticks. */
export const WATCH_TICKS_PER_SECOND = 120;
/** The playback speeds the replay bar offers. */
export const WATCH_SPEEDS = Object.freeze([0.25, 0.5, 1, 2, 4] as const);
export type WatchSpeed = (typeof WATCH_SPEEDS)[number];

/** A watched world at the end of one tick, which a later world of the same run can start from. */
export interface WatchCheckpoint {
  readonly tick: number;
  readonly semanticHash: string;
}

/**
 * One re-simulated world of the watched run. Watch steps it forward one tick at a time and starts a new
 * one to go back. The app implements it over the detached production world (`src/app/replay/record-world.ts`).
 */
export interface WatchWorld<Checkpoint extends WatchCheckpoint, Frame> {
  /** Plays one tick's recorded inputs and returns the state hash after it. */
  readonly step: (inputs: ReplayTickInputs) => string;
  /** The world as it is now, for the seek cache and practice from here. */
  readonly checkpoint: () => Checkpoint;
  /** The world drawn as play draws it; undefined when the world was started without a renderer. */
  readonly frame: () => Frame | undefined;
  readonly dispose: () => void;
}

export interface WatchOptions<Checkpoint extends WatchCheckpoint, World extends WatchWorld<Checkpoint, unknown>> {
  readonly run: Pick<ReplayRun, "actions" | "frames"> & Readonly<{ result: Readonly<{ tick: number }> }>;
  /** The ticks the seek bar marks and chapter jumps stop at, in any order. */
  readonly chapters: readonly number[];
  /** A new world at the run's seed, or at a checkpoint an earlier world of this run took. */
  readonly start: (from?: Checkpoint) => World;
  readonly cache?: Readonly<{ every: number; limit: number }>;
  /** Called once when the seek cache is turned off for this run; watch then re-simulates from the seed. */
  readonly cacheOff?: (reason: string) => void;
}

export interface WatchState {
  readonly tick: number;
  /** The state hash at `tick`; empty at tick 0 of a world started from the seed. */
  readonly hash: string;
  readonly playing: boolean;
  readonly speed: WatchSpeed;
}

/** Play, pause, speed, seek, step and chapter jumps over one recorded run, and the frame at a tick. */
export interface Watch<Checkpoint extends WatchCheckpoint, World extends WatchWorld<Checkpoint, unknown>> {
  readonly lastTick: number;
  readonly chapters: readonly number[];
  readonly state: () => WatchState;
  /** The world at the shown tick. */
  readonly world: () => World;
  readonly play: () => void;
  readonly pause: () => void;
  readonly toggle: () => void;
  /** False when the replay bar does not offer this speed. */
  readonly setSpeed: (speed: number) => boolean;
  /** Shows `tick`, held within the run. A step that throws pauses playback and throws on. */
  readonly seek: (tick: number) => WatchState;
  readonly seekBy: (seconds: number) => WatchState;
  readonly seekToFraction: (fraction: number) => WatchState;
  /** The next chapter after the shown tick (`direction` > 0) or the last one before it. */
  readonly jumpChapter: (direction: number) => WatchState;
  /** Moves playback on by this much wall time at the current speed; pauses at the run's end. */
  readonly advance: (seconds: number) => WatchState;
  /** The frame at `tick`; throws when the world draws nothing. */
  readonly frameAt: (tick: number) => NonNullable<ReturnType<World["frame"]>>;
  /** Where the shown tick sits in the run, 0 to 1. */
  readonly progress: () => number;
  /** The seek cache's ticks and spacing now. */
  readonly cached: () => Readonly<{ ticks: readonly number[]; every: number }>;
  readonly dispose: () => void;
}

/**
 * The seek cache's spacing and budget: one checkpoint every 480 ticks (the record's own checkpoint
 * spacing) at first, at most 64. When a new one would pass the budget the spacing doubles and the
 * checkpoints off the wider grid are dropped, so a long run keeps evenly spaced checkpoints over its
 * whole length and a seek re-simulates at most one spacing. It lives while the run is watched.
 */
export const WATCH_SEEK_CACHE = Object.freeze({ every: 480, limit: 64 });

/**
 * Watches a recorded run by re-simulating it. Watch keeps one world and steps it forward; a seek to a tick
 * that world has passed starts a new world from the seek cache's nearest checkpoint at or before it, or from
 * the seed when there is none. Own, imported, published and leaderboard replays all play here.
 */
export function createWatch<Checkpoint extends WatchCheckpoint, World extends WatchWorld<Checkpoint, unknown>>(
  options: WatchOptions<Checkpoint, World>,
): Watch<Checkpoint, World> {
  const lastTick = options.run.result.tick;
  const chapters = Object.freeze(
    [...new Set(options.chapters)].filter((tick) => tick <= lastTick).sort((a, b) => a - b),
  );
  const cache = createSeekCache<Checkpoint>(options.cache ?? WATCH_SEEK_CACHE);
  let cacheOff: string | undefined;
  const turnCacheOff = (error: unknown): void => {
    cacheOff = error instanceof Error ? error.message : String(error);
    options.cacheOff?.(cacheOff);
  };
  const nearest = (target: number) => (cacheOff === undefined ? cache.nearest(target) : undefined);
  let world: World | undefined;
  let next = createReplayInputCursor(options.run);
  let tick = 0;
  let hash = "";
  let playing = false;
  let speed: WatchSpeed = 1;
  let fractionalTicks = 0;

  const restart = (target: number): World => {
    world?.dispose();
    world = undefined;
    let from = nearest(target);
    let started: World;
    try {
      started = options.start(from);
    } catch (error) {
      if (from === undefined) throw error;
      turnCacheOff(error);
      from = undefined;
      started = options.start();
    }
    world = started;
    next = createReplayInputCursor(options.run, from?.tick ?? 0);
    tick = from?.tick ?? 0;
    hash = from?.semanticHash ?? "";
    return started;
  };
  const state = (): WatchState => Object.freeze({ tick, hash, playing, speed });
  const seek = (requested: number): WatchState => {
    const target = Math.max(0, Math.min(lastTick, Math.floor(Number.isFinite(requested) ? requested : 0)));
    const cachedTick = nearest(target)?.tick ?? 0;
    try {
      const current = world === undefined || target < tick || cachedTick > tick ? restart(target) : world;
      while (tick < target) {
        hash = current.step(next());
        tick += 1;
        if (cacheOff === undefined && cache.wants(tick))
          try {
            cache.add(current.checkpoint());
          } catch (error) {
            turnCacheOff(error);
          }
      }
    } catch (error) {
      playing = false;
      throw error;
    }
    return state();
  };
  const shown = (): World => world ?? restart(0);
  shown();
  return Object.freeze<Watch<Checkpoint, World>>({
    lastTick,
    chapters,
    state,
    world: shown,
    play: () => {
      if (tick >= lastTick) seek(0);
      playing = true;
    },
    pause: () => {
      playing = false;
    },
    toggle: () => {
      if (playing) playing = false;
      else {
        if (tick >= lastTick) seek(0);
        playing = true;
      }
    },
    setSpeed: (value) => {
      const offered = WATCH_SPEEDS.find((entry) => entry === value);
      if (offered === undefined) return false;
      speed = offered;
      return true;
    },
    seek,
    seekBy: (seconds) => seek(tick + Math.round(seconds * WATCH_TICKS_PER_SECOND)),
    seekToFraction: (fraction) => seek(Math.round(lastTick * Math.max(0, Math.min(1, fraction)))),
    jumpChapter: (direction) => {
      const ordered = direction < 0 ? [...chapters].reverse() : chapters;
      return seek(ordered.find((chapter) => (direction < 0 ? chapter < tick : chapter > tick)) ?? tick);
    },
    advance: (seconds) => {
      if (!playing) return state();
      fractionalTicks += Math.max(0, seconds) * WATCH_TICKS_PER_SECOND * speed;
      const whole = Math.floor(fractionalTicks);
      fractionalTicks -= whole;
      if (whole <= 0) return state();
      const reached = seek(tick + whole);
      if (reached.tick >= lastTick) playing = false;
      return state();
    },
    frameAt: (target) => {
      seek(target);
      const frame = shown().frame();
      if (frame === undefined || frame === null) throw new Error("replay presentation is unavailable");
      return frame as NonNullable<ReturnType<World["frame"]>>;
    },
    progress: () => (lastTick === 0 ? 1 : tick / lastTick),
    cached: cache.held,
    dispose: () => {
      world?.dispose();
      world = undefined;
      playing = false;
    },
  });
}

/** Watch's seek cache: checkpoints on an even grid, and the latest one at or before a tick. */
function createSeekCache<Checkpoint extends WatchCheckpoint>(options: Readonly<{ every: number; limit: number }>) {
  let every = options.every;
  const held = new Map<number, Checkpoint>();
  const onGrid = (tick: number) => tick > 0 && tick % every === 0;
  return Object.freeze({
    wants: (tick: number) => onGrid(tick) && !held.has(tick),
    add: (checkpoint: Checkpoint) => {
      if (!onGrid(checkpoint.tick) || held.has(checkpoint.tick)) return;
      while (held.size >= options.limit) {
        every *= 2;
        for (const tick of [...held.keys()]) if (!onGrid(tick)) held.delete(tick);
        if (!onGrid(checkpoint.tick)) return;
      }
      held.set(checkpoint.tick, checkpoint);
    },
    nearest: (tick: number): Checkpoint | undefined => {
      let best: Checkpoint | undefined;
      for (const checkpoint of held.values())
        if (checkpoint.tick <= tick && (best === undefined || checkpoint.tick > best.tick)) best = checkpoint;
      return best;
    },
    held: () => Object.freeze({ ticks: Object.freeze([...held.keys()].sort((a, b) => a - b)), every }),
  });
}

/**
 * Test builds only: the `__TEAR_REPLAY_TAP__` global over the production live replay recorder
 * (src/app/replay/live-replay-production.ts). It loads the recorder so the next run is recorded, ends
 * the open recording, reads the recorder's counters and the stored records, and verifies a record from
 * its seed in the detached world, in the page. It can also time every call into the open tap, to say
 * where recording costs fall. Browser evidence for replay PR 5b-3 and 5c-1
 * (tests/browser-replay-live-verify.js) uses it.
 */
import { createDetachedReplayWorld } from "../replay/detached-replay-world";
import type { LiveReplayProduction, LiveReplayProductionCounters } from "../replay/live-replay-production";
import type { LiveReplayTap, LiveReplayTapSlot } from "../replay/live-replay-tap-slot";
import type { ReplayRecord } from "../../replay/record";
import type { ReplayReadResult } from "../../replay/record";
import { openReplayRecordStore, type ReplayRecordEntry, type ReplayRecordStore } from "../../replay/record-store";
import { verifyReplay, type ReplayVerdict } from "../../replay/verify";
import type { ReplayScreenAdapter } from "../replay/replay-screen-adapter";

type RunTotals = Readonly<{ score: number; wave: number; time: number }> | null;

/** Per tap method: how many calls, their total, and the slowest one-in-a-hundred and slowest call. */
export type ReplayTapTimings = Readonly<
  Record<string, Readonly<{ calls: number; totalMs: number; p99Ms: number; maxMs: number }>>
>;

export interface ReplayTapInspector {
  /** Loads the recorder, so the next run that starts is recorded. */
  readonly arm: () => Promise<void>;
  readonly recording: () => boolean;
  /** True while a scene (a cinematic, a chapter page) holds the fight. */
  readonly scene: () => boolean;
  /** The stage the run is on, from the game's stage events. */
  readonly stage: () => number;
  /** Ends the open recording at the last simulated tick, unstored; null when no run is recorded. */
  readonly finish: () => ReplayRecord | null;
  /**
   * Ends the open recording as a kept run's outcome does, so the production recorder stores it: how long
   * the end took on the frame that ended the run, and how long the store write took after it.
   */
  readonly keep: () => Promise<Readonly<{ endMs: number; writeMs: number }>>;
  /** Times every call into the open tap from now on (`timings`). */
  readonly profile: () => boolean;
  readonly timings: () => ReplayTapTimings;
  readonly verify: (record: ReplayRecord) => ReplayVerdict;
  readonly counters: () => LiveReplayProductionCounters;
  /** What the last tap that threw threw, or null. */
  readonly tapError: () => string | null;
  /** The stored records' index, once every write started so far has finished. */
  readonly stored: () => Promise<readonly ReplayRecordEntry[] | Readonly<{ failed: string }>>;
  /** One stored record, read back from the store. */
  readonly storedRecord: (key: string) => Promise<ReplayReadResult | null | Readonly<{ failed: string }>>;
  /** Opens the kept run with this seed in the Theater, through the path WATCH takes. */
  readonly watchKept: (seed: number) => Promise<boolean>;
  /** Moves the Theater to this share of the run, as the seek bar does, and says what it shows then. */
  readonly seekShown: (fraction: number) => Readonly<{ tick: number; stage: number }> | undefined;
  /** Leaves the paused run for the menu, as the pause screen's QUIT does. */
  readonly quit: () => void;
}

/** The replay screen's members the inspector drives. */
export type ReplayTapScreen = Pick<
  ReplayScreenAdapter,
  "watchKeptRun" | "shownReplay" | "seekToFraction" | "togglePause" | "status" | "render"
>;

export function installReplayTapInspector(
  target: Window,
  slot: LiveReplayTapSlot,
  production: LiveReplayProduction,
  run: () => RunTotals,
  scene: () => boolean,
  stage: () => number,
  screen: () => ReplayTapScreen,
  dispatch: (action: Readonly<{ type: "run.quit" }>) => void = () => undefined,
): void {
  const now = () => target.performance.now();
  const samples = new Map<string, number[]>();
  const timed = (tap: LiveReplayTap): LiveReplayTap => {
    const time =
      <Args extends unknown[], Result>(name: string, call: (...args: Args) => Result) =>
      (...args: Args): Result => {
        const started = now();
        try {
          return call(...args);
        } finally {
          const list = samples.get(name) ?? [];
          list.push(now() - started);
          samples.set(name, list);
        }
      };
    return Object.freeze({
      runStarted: time("runStarted", tap.runStarted),
      frame: time("frame", tap.frame),
      decision: time("decision", tap.decision),
      sealed: time("sealed", tap.sealed),
      stepped: time("stepped", tap.stepped),
      observe: time("observe", tap.observe),
      finish: time("finish", tap.finish),
    });
  };
  const totals = () => {
    const value = run();
    return { score: value?.score ?? 0, wave: value?.wave ?? 0, time: value?.time ?? 0 };
  };
  const withStore = async <Result>(
    use: (store: ReplayRecordStore) => Promise<Result>,
  ): Promise<Result | Readonly<{ failed: string }>> => {
    await production.settled();
    const store = await openReplayRecordStore(target.indexedDB);
    if ("failed" in store) return store;
    try {
      return await use(store);
    } finally {
      store.close();
    }
  };
  const inspector: ReplayTapInspector = Object.freeze({
    arm: () => production.ensure(),
    recording: () => slot.current() !== null,
    scene,
    stage,
    finish: () => production.finishOpen(totals()),
    keep: async () => {
      const started = now();
      production.runEnded(totals(), true);
      const ended = now();
      await production.settled();
      return { endMs: ended - started, writeMs: now() - ended };
    },
    profile: () => {
      const tap = slot.current();
      if (tap === null) return false;
      samples.clear();
      slot.install(timed(tap));
      return true;
    },
    timings: () =>
      Object.freeze(
        Object.fromEntries(
          [...samples].map(([name, list]) => {
            const sorted = [...list].sort((left, right) => left - right);
            const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
            const totalMs = sorted.reduce((sum, value) => sum + value, 0);
            return [name, { calls: sorted.length, totalMs, p99Ms: at(0.99), maxMs: at(1) }];
          }),
        ),
      ),
    verify: (record: ReplayRecord) => verifyReplay(record, createDetachedReplayWorld()),
    counters: production.counters,
    tapError: production.lastTapError,
    stored: () => withStore((store) => store.entries()),
    storedRecord: (key: string) => withStore((store) => store.read(key)),
    watchKept: async (seed: number) => {
      const opened = await screen().watchKeptRun(String(seed), "menu");
      if (opened && screen().status()?.paused === false) screen().togglePause();
      return opened;
    },
    quit: () => {
      dispatch({ type: "run.quit" });
    },
    seekShown: (fraction: number) => {
      screen().seekToFraction(fraction);
      return screen().shownReplay();
    },
  });
  (target as Window & { __TEAR_REPLAY_TAP__?: ReplayTapInspector }).__TEAR_REPLAY_TAP__ = inspector;
}

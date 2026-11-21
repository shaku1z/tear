/**
 * Test builds only: the `__TEAR_REPLAY_TAP__` global over the production live replay recorder
 * (src/app/replay/live-replay-production.ts). It loads the recorder so the next run is recorded, ends
 * the open recording, reads the recorder's counters and the stored records, and verifies a record from
 * its seed in the detached world, in the page. Browser evidence for replay PR 5b-3 and 5c-1
 * (tests/browser-replay-live-verify.js) uses it.
 */
import { createDetachedReplayWorld } from "../replay/detached-replay-world";
import type { LiveReplayProduction, LiveReplayProductionCounters } from "../replay/live-replay-production";
import type { LiveReplayTapSlot } from "../replay/live-replay-tap-slot";
import type { ReplayRecord } from "../../replay/record";
import type { ReplayReadResult } from "../../replay/record";
import { openReplayRecordStore, type ReplayRecordEntry, type ReplayRecordStore } from "../../replay/record-store";
import { verifyReplay, type ReplayVerdict } from "../../replay/verify";

type RunTotals = Readonly<{ score: number; wave: number; time: number }> | null;

export interface ReplayTapInspector {
  /** Loads the recorder, so the next run that starts is recorded. */
  readonly arm: () => Promise<void>;
  readonly recording: () => boolean;
  /** True while a scene (a cinematic, a chapter page) holds the fight. */
  readonly scene: () => boolean;
  /** Ends the open recording at the last simulated tick, unstored; null when no run is recorded. */
  readonly finish: () => ReplayRecord | null;
  /** Ends the open recording as a kept run's outcome does, so the production recorder stores it. */
  readonly keep: () => void;
  readonly verify: (record: ReplayRecord) => ReplayVerdict;
  readonly counters: () => LiveReplayProductionCounters;
  /** The stored records' index, once every write started so far has finished. */
  readonly stored: () => Promise<readonly ReplayRecordEntry[] | Readonly<{ failed: string }>>;
  /** One stored record, read back from the store. */
  readonly storedRecord: (key: string) => Promise<ReplayReadResult | null | Readonly<{ failed: string }>>;
}

export function installReplayTapInspector(
  target: Window,
  slot: LiveReplayTapSlot,
  production: LiveReplayProduction,
  run: () => RunTotals,
  scene: () => boolean,
): void {
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
    finish: () => production.finishOpen(totals()),
    keep: () => {
      production.runEnded(totals(), true);
    },
    verify: (record: ReplayRecord) => verifyReplay(record, createDetachedReplayWorld()),
    counters: production.counters,
    stored: () => withStore((store) => store.entries()),
    storedRecord: (key: string) => withStore((store) => store.read(key)),
  });
  (target as Window & { __TEAR_REPLAY_TAP__?: ReplayTapInspector }).__TEAR_REPLAY_TAP__ = inspector;
}

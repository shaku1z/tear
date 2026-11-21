/**
 * Test builds only: the `__TEAR_REPLAY_TAP__` global, which records the next live run through the live replay
 * tap (src/app/replay/live-replay-tap.ts) and verifies a record from its seed in the detached world, in
 * the page. Browser evidence for replay PR 5b-3 (tests/browser-replay-live-verify.js) uses it.
 */
import { createDetachedReplayWorld } from "../replay/detached-replay-world";
import { createLiveReplayTap, type LiveReplayTapSlot } from "../replay/live-replay-tap";
import type { ReplayRecord } from "../../replay/record";
import { verifyReplay, type ReplayVerdict } from "../../replay/verify";

type RunTotals = Readonly<{ score: number; wave: number; time: number }> | null;

export interface ReplayTapInspector {
  /** Records the next run that starts, until `finish`. */
  readonly arm: () => void;
  readonly recording: () => boolean;
  /** True while a scene (a cinematic, a chapter page) holds the fight. */
  readonly scene: () => boolean;
  /** Ends the record at the last simulated tick; null when no run was recorded. */
  readonly finish: () => ReplayRecord | null;
  readonly verify: (record: ReplayRecord) => ReplayVerdict;
}

const BUILD = Object.freeze({ version: "test", revision: "test", target: "test-standalone" });
const LOOK = Object.freeze({ playerName: "Player", cosmetics: {}, music: null, recordedAt: "1970-01-01T00:00:00Z" });

export function installReplayTapInspector(
  target: Window,
  slot: LiveReplayTapSlot,
  run: () => RunTotals,
  scene: () => boolean,
): void {
  const inspector: ReplayTapInspector = Object.freeze({
    arm: () => {
      slot.install(createLiveReplayTap({ build: BUILD, look: LOOK }));
    },
    recording: () => slot.current() !== null,
    scene,
    finish: () => {
      const tap = slot.current();
      slot.install(null);
      const totals = run();
      return tap?.finish({ score: totals?.score ?? 0, wave: totals?.wave ?? 0, time: totals?.time ?? 0 }) ?? null;
    },
    verify: (record: ReplayRecord) => verifyReplay(record, createDetachedReplayWorld()),
  });
  (target as Window & { __TEAR_REPLAY_TAP__?: ReplayTapInspector }).__TEAR_REPLAY_TAP__ = inspector;
}

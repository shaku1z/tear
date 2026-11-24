/**
 * Replay overhaul, owner defect 1: a replay shows the stage the run was in at that moment, not the stage it
 * ended on. A run is played headless and recorded: an Adventure run across two stage changes, as a returning
 * player with permanent upgrades plays it (drafts, chapter skips), and a Boss mode run, whose first stage is a
 * boss biome. Watching the record (src/app/replay/record-world.ts `watchRecord`), the stage at ticks before,
 * at and after each change, and at the start and the end, is the stage the playing world was in then.
 *
 * The plan's contract has two drivers; this is the `watch` driver. Ghost 2's playback, the other, goes with
 * Ghost 2 (replay overhaul PR 8).
 */
import { describe, expect, it } from "vitest";

import * as engine from "../../src/app/world/detached/replay-composition";
import { watchRecord } from "../../src/app/replay/record-world";
import { canonicalObservationStage } from "../../src/tearbench/observation-identity";
import type { ReplayRecord } from "../../src/replay/record";
import { SPECS } from "../support/hash-stream-corpus";
import { recordCorpusStream } from "../support/replay-corpus-record";
import { recordPlayedRun } from "../support/replay-played-record";

/** The permanent upgrades of the returning player the nightly campaign check plays (browser-replay-campaign-stages). */
const RETURNING_PLAYER = Object.freeze({
  tough: 8,
  sharp: 8,
  recovery: 6,
  thickskin: 6,
  warding: 2,
  lifeline: 4,
  phoenix: 1,
  secondbreath: 4,
});
/** Ticks either side of a stage change that are looked at: a second, and the ticks next to it. */
const AROUND = [-120, -1, 0, 1, 120] as const;
const ADVENTURE_TICKS = 120 * 60 * 15;

/** The ticks a stage changed on, from the stage after each tick. */
function changes(stageAt: readonly string[]): number[] {
  return stageAt.flatMap((stage, tick) => (tick > 0 && stage !== stageAt[tick - 1] ? [tick] : []));
}

/** The stage watch shows at each tick, by seeking there. */
function shownAt(record: ReplayRecord, ticks: readonly number[]): Map<number, string> {
  const watch = watchRecord(record, engine);
  const shown = new Map<number, string>();
  for (const tick of ticks) {
    const reached = watch.seek(tick).tick;
    if (reached !== tick) throw new Error(`watch reached ${String(reached)} seeking ${String(tick)}`);
    shown.set(tick, canonicalObservationStage(watch.world().stage()));
  }
  return shown;
}

function expectShown(record: ReplayRecord, stageAt: readonly string[], ticks: readonly number[]): void {
  const last = record.run.result.tick;
  const looked = [...new Set(ticks.filter((tick) => tick >= 0 && tick <= last))].sort((a, b) => a - b);
  const shown = shownAt(record, looked);
  expect(Object.fromEntries(looked.map((tick) => [tick, shown.get(tick)]))).toEqual(
    Object.fromEntries(looked.map((tick) => [tick, stageAt[tick]])),
  );
}

describe("a replay shows the stage the run was in at that moment (watch)", () => {
  it("an Adventure run, before, at and after each of two stage changes", () => {
    const { record, result, stageAt } = recordPlayedRun(
      {
        mode: "campaign",
        difficulty: "easy",
        weapon: "sword",
        seed: "replay-shows-the-moment:adventure",
        player: "scripted",
        maxTicks: ADVENTURE_TICKS,
      },
      { metaRanks: RETURNING_PLAYER },
    );
    const changed = changes(stageAt);
    expect(changed.length, `stage changes in a run that ended ${result.end}`).toBeGreaterThanOrEqual(2);
    expectShown(record, stageAt, [
      0,
      ...changed.flatMap((tick) => AROUND.map((offset) => tick + offset)),
      record.run.result.tick,
    ]);
  }, 600_000);

  it("a Boss mode run, whose first stage is its boss's biome", () => {
    const spec = SPECS.find((candidate) => candidate.mode === "bossonly");
    if (spec === undefined) throw new Error("no boss stream");
    const stageAt: string[] = [];
    const record = recordCorpusStream(spec, (environment, tick) => {
      stageAt[tick] = environment.policyObservation().run.stage;
    });
    expect(stageAt[0]).not.toBe(canonicalObservationStage(0));
    const last = record.run.result.tick;
    expectShown(record, stageAt, [0, 1, 120, Math.floor(last / 2), last]);
  }, 300_000);
});

/**
 * A replay record's summary time is written twice: by the live run end (`replayRunTotals`, from the live
 * run's `runTime` in seconds) and by verify, from the canonical state the re-simulation ends on (whole
 * milliseconds). Both must write the same number, or every real kept run fails verify on its summary.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { replayRunTotals } from "../../src/app/replay/live-replay-production";
import { projectCanonicalGameplayState, replaySummaryTime } from "../../src/gameplay/runtime/canonical-state";
import { stableVerificationHash } from "../../src/domain/hash";

const INPUT = { tick: 0, moveX: 0, moveY: 0, aimTurn: 0, primaryHeld: false } as const;
const STEP_SECONDS = 1 / 120;

/** The summary verify derives: the canonical state's run, as the detached replay world reads it. */
function verifiedTotals(run: Readonly<{ score: number; wave: number; runTime: number }>) {
  const state = projectCanonicalGameplayState(0, INPUT, { mode: "endless", runSeed: 1, ...run }, null, null, []);
  if (state.run === null) throw new Error("no run");
  return { score: state.run.score, wave: state.run.wave, time: replaySummaryTime(state.run.time) };
}

describe("replay summary time", () => {
  it("the live run end and verify write the same summary for a run of any length", () => {
    fc.assert(
      fc.property(fc.nat(400_000), fc.nat(10_000), fc.nat(60), (ticks, score, wave) => {
        // The live run counts its time as the game does: one fixed step of seconds added per tick.
        let runTime = 0;
        for (let tick = 0; tick < ticks; tick += 1) runTime += STEP_SECONDS;
        const live = replayRunTotals({ score, wave, runTime });
        const verified = verifiedTotals({ score, wave, runTime });
        expect(stableVerificationHash(live)).toBe(stableVerificationHash(verified));
      }),
      { seed: 20_261_123, numRuns: 200 },
    );
  });

  it("is seconds to the millisecond, so a list row shows the run's own length", () => {
    // 4849 ticks at 120 per second, counted as the game counts them.
    let runTime = 0;
    for (let tick = 0; tick < 4_849; tick += 1) runTime += STEP_SECONDS;
    expect(replayRunTotals({ score: 123, wave: 3, runTime }).time).toBe(40.408);
  });
});

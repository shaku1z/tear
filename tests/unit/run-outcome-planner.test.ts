import { describe, expect, it } from "vitest";
import {
  appendDefeatWave,
  buildPendingFinale,
  buildRecordingSummary,
  buildRunResult,
  planVictoryProgression,
  type OutcomeRunState,
} from "../../src/gameplay/run/outcome-planner";

const run: OutcomeRunState = {
  mode: "campaign", diff: "hard", wave: 20, score: 12_345, runTime: 612.6,
  waveTime: 18.5, waveKills: 9, wavePeak: 4,
  waveLog: [
    { wave: 1, time: 12, kills: 4, peak: 2 },
    { wave: "BOSS", time: 30, kills: 1, peak: 5 },
  ],
  weaponId: "hammer", damagedThisRun: false,
};

describe("run outcome planner", () => {
  it("builds deterministic replay summary metadata", () => {
    expect(buildRecordingSummary(run, {
      won: true, displayName: "Tester", stageIndex: 1,
      loadout: [{ id: "bloodrite", tier: 2, count: 1 }],
      authoritativeTick: 321, authoritativeStateHash: "hash",
    })).toEqual({
      mode: "campaign", diff: "hard", wave: 20, score: 12_345, time: 613,
      won: true, kills: 5, peak: 5, name: "Tester", stage: 1, weapon: "hammer",
      loadout: [{ id: "bloodrite", tier: 2, n: 1 }],
      authoritativeTick: 321, authoritativeStateHash: "hash",
    });
  });

  it("appends an in-progress death row only while a wave is active", () => {
    expect(appendDefeatWave(run.waveLog, false, run)).toEqual(run.waveLog);
    expect(appendDefeatWave(run.waveLog, true, run).at(-1)).toEqual({
      wave: 20, time: 18.5, kills: 9, peak: 4, died: true,
    });
  });

  it("plans complete campaign progression without platform effects", () => {
    const intents = planVictoryProgression({
      run, campaign: true, achievementTracking: true, earned: 200, economy: { wallet: 500 },
    });
    expect(intents).toContainEqual({ type: "profile-max", stat: "clearAdvHard", value: 1 });
    expect(intents).toContainEqual({ type: "profile-max", stat: "clearAdvNoHit", value: 1 });
    expect(intents).toContainEqual({ type: "profile-max", stat: "speedrunUnder15", value: 1 });
    expect(intents).toContainEqual({ type: "mark-weapon-win", weaponId: "hammer" });
    expect(intents.at(-1)).toEqual({ type: "finish-recording", won: true });
  });

  it("returns no profile effects when progression tracking is disabled", () => {
    expect(planVictoryProgression({ run, campaign: true, achievementTracking: false, earned: 0, economy: {} })).toEqual([]);
  });

  it("builds defeat, victory, and pending-finale result records", () => {
    const prepared = { isNew: true, earned: 200, coins: 800 };
    const best = { wave: 20, score: 12_345, time: 612.6 };
    expect(buildRunResult(run, { best, prepared, victory: false })).not.toHaveProperty("win");
    expect(buildRunResult(run, { best, prepared, victory: true, campaign: true })).toMatchObject({
      win: true, campaign: true, diff: "hard",
    });
    expect(buildPendingFinale(run, best, prepared)).toMatchObject({
      mode: "campaign", diff: "hard", weapon: "hammer", isNew: true, earned: 200,
    });
  });
});

import { describe, expect, it } from "vitest";

import type { BossFightResult, BossPhaseResult } from "../../src/playtest/boss-fight";
import {
  admitBossReport,
  bossFightRequests,
  mergeSlices,
  playBossReport,
  sliceOf,
  type BossReportRequest,
} from "../../src/playtest/boss-report";
import { formatBossSummary, summariseBossFights } from "../../src/playtest/boss-summary";

const REQUEST = {
  bosses: ["rootbound", "warden"],
  difficulties: ["easy", "normal"],
  weapons: ["sword"],
  seeds: ["1"],
  players: ["still", "walker"],
  maxTicks: 60,
} as const satisfies BossReportRequest;

function phase(overrides: Partial<BossPhaseResult>): BossPhaseResult {
  return {
    phase: 1,
    ticks: 1200,
    damageDealt: 100,
    hitsLanded: 4,
    bossHealed: 0,
    damageTaken: 40,
    hitsTaken: 2,
    exposedTicks: 120,
    bossTravel: 500,
    hitsBy: {},
    objects: {},
    ...overrides,
  };
}

function fight(overrides: Partial<BossFightResult>, phases: readonly BossPhaseResult[]): BossFightResult {
  return {
    boss: "rootbound",
    difficulty: "normal",
    weapon: "sword",
    seed: "1",
    player: "scripted",
    maxTicks: 21600,
    end: "player defeated",
    ticks: phases.reduce((total, row) => total + row.ticks, 0),
    bossMaxHp: 1000,
    bossHpLeft: 500,
    limitedTellData: false,
    setupTicks: 0,
    cinematicTicks: 0,
    phases,
    ...overrides,
  };
}

describe("sharing fights between worker processes", () => {
  it("deals the fights out in turn and puts them back in their first order", () => {
    const items = Array.from({ length: 11 }, (_, index) => index);
    for (const of of [1, 2, 4, 6, 11, 20]) {
      const slices = Array.from({ length: of }, (_, index) => sliceOf(items, index, of));
      expect(slices.flat().sort((left, right) => left - right)).toEqual(items);
      expect(mergeSlices(slices)).toEqual(items);
    }
    expect(sliceOf(items, 1, 4)).toEqual([1, 5, 9]);
    expect(() => sliceOf(items, 4, 4)).toThrow("no slice 4 of 4");
    expect(() => sliceOf(items, 0, 0)).toThrow(RangeError);
  });

  it("gives the same fights from three shares as from one run", () => {
    const whole = playBossReport(REQUEST);
    const shares = [0, 1, 2].map((index) => playBossReport(REQUEST, { index, of: 3 }));
    expect(whole).toHaveLength(8);
    expect(shares.map((share) => share.length)).toEqual([3, 3, 2]);
    expect(mergeSlices(shares)).toEqual(whole);
  });

  it("asks for every boss at every difficulty, and refuses a mistyped one before any fight", () => {
    const requests = bossFightRequests(REQUEST);
    expect(requests.map((request) => `${request.boss} ${request.difficulty} ${request.player}`)).toEqual([
      "rootbound easy still",
      "rootbound easy walker",
      "rootbound normal still",
      "rootbound normal walker",
      "warden easy still",
      "warden easy walker",
      "warden normal still",
      "warden normal walker",
    ]);
    expect(admitBossReport(REQUEST)).toEqual(requests);
    const mistyped = { ...REQUEST, difficulties: ["normal", "nightmare"] } as unknown as BossReportRequest;
    expect(() => admitBossReport(mistyped)).toThrow(TypeError);
  });
});

describe("the summary of many fights", () => {
  const fights = [
    // Cleared Phase I in 10 s, beaten in Phase II.
    fight({ seed: "1" }, [phase({}), phase({ phase: 2, ticks: 600, damageTaken: 60 })]),
    // Cleared Phase I in 30 s and beat the boss in Phase II.
    fight({ seed: "2", end: "boss defeated" }, [phase({ ticks: 3600 }), phase({ phase: 2, ticks: 1200 })]),
    // Beaten in Phase I, all of it by damage nothing warned of.
    fight({ seed: "3" }, [
      phase({ ticks: 2400, damageTaken: 100, hitsTaken: 5, hitsBy: { unmarked: { hits: 5, damage: 100 } } }),
    ]),
    fight({ seed: "1", player: "still", end: "time limit" }, [phase({ ticks: 7200, exposedTicks: 0, bossTravel: 0 })]),
  ];

  it("pools the weapons and seeds of a boss, difficulty, phase and player", () => {
    // Phase I of every player comes before Phase II.
    const [first, still, second] = summariseBossFights(fights);
    expect(first).toEqual({
      boss: "rootbound",
      difficulty: "normal",
      phase: 1,
      player: "scripted",
      fights: 3,
      cleared: 2,
      clearSeconds: 20,
      damageTaken: 60,
      hitsTaken: 3,
      hitsLanded: 4,
      noTellShare: 100 / 180,
      bossPixelsPerSecond: 1500 / 60,
      openShare: 360 / 7200,
    });
    expect(second).toMatchObject({ phase: 2, fights: 2, cleared: 1, clearSeconds: 10, damageTaken: 50 });
    expect(still).toMatchObject({ player: "still", fights: 1, cleared: 0, bossPixelsPerSecond: 0, openShare: 0 });
    expect(still).not.toHaveProperty("clearSeconds");
  });

  it("prints what was played, each broken fight, and a table per boss and difficulty", () => {
    const broken = fight({ seed: "4", end: "broken", reason: "no boss appeared" }, []);
    const text = formatBossSummary([...fights, broken]);
    expect(text).toContain("Summary of 5 fights. Weapons: sword. Seeds: 1, 2, 3, 4.");
    expect(text).toContain("broken: rootbound normal sword seed 4 scripted (no boss appeared)");
    expect(text).toContain("== rootbound  difficulty normal ==");
    expect(text).toMatch(/I\s+scripted\s+2 of 3\s+20\.0\s+60\s+56%\s+3\.0\s+4\.0\s+25\s+5%/u);
    expect(text).toMatch(/I\s+still\s+0 of 1\s+-/u);
  });
});

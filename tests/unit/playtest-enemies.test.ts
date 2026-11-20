import { describe, expect, it } from "vitest";

import { mergeSlices } from "../../src/playtest/boss-report";
import { ENEMY_COUNT_LIMIT, playEnemy, REPORT_ENEMIES, type EnemyRequest } from "../../src/playtest/enemy-play";
import { admitEnemyReport, enemyRequests, formatEnemyReport, playEnemyReport } from "../../src/playtest/enemy-report";
import { PUBLISHED_ENEMY_IDENTITY_IDS } from "../../src/gameplay/run/content-director";

const meeting = (over: Partial<EnemyRequest> = {}): EnemyRequest => ({
  enemy: "charger",
  count: 1,
  difficulty: "normal",
  weapon: "sword",
  seed: "1",
  player: "scripted",
  maxTicks: 120 * 60,
  ...over,
});

const report = {
  enemies: ["charger", "priest"] as const,
  counts: [1, 2],
  difficulties: ["normal"] as const,
  weapons: ["sword"] as const,
  seeds: ["1"],
  players: ["scripted"] as const,
  maxTicks: 120 * 60,
};

describe("a meeting with one kind of enemy, played headless", () => {
  it("puts the asked number of the kind in play through the game's spawner and measures the meeting", () => {
    const result = playEnemy(meeting({ count: 2 }));
    expect(result.inPlay).toEqual({ charger: 2 });
    expect(result.end).toBe("cleared");
    expect(result.enemyHealth).toBeGreaterThan(0);
    expect(result.enemyHealthLeft).toBe(0);
    expect(result.ticks).toBeGreaterThan(0);
    expect(Object.values(result.hitsBy).reduce((total, hits) => total + hits.damage, 0)).toBeCloseTo(
      result.damageTaken,
    );
  }, 60_000);

  it("names a support enemy by its own name, not by the kind the four share", () => {
    expect(playEnemy(meeting({ enemy: "mender", maxTicks: 30 })).inPlay).toEqual({ mender: 1 });
  }, 60_000);

  it("leaves the enemy standing against a player that does nothing, and counts its health left", () => {
    const result = playEnemy(meeting({ player: "still", maxTicks: 240 }));
    expect(result.end).not.toBe("cleared");
    expect(result.enemyHealthLeft).toBe(result.enemyHealth);
  }, 60_000);

  it("plays the same meeting from the same seed", () => {
    const short = meeting({ enemy: "ranged", count: 3, maxTicks: 600 });
    expect(playEnemy(short)).toEqual(playEnemy(short));
  }, 60_000);
});

describe("the enemies report", () => {
  it("plays every enemy the published game has when none is named, in a fixed order", () => {
    expect(REPORT_ENEMIES).toBe(PUBLISHED_ENEMY_IDENTITY_IDS);
    expect(enemyRequests(report).map((request) => `${String(request.count)} ${request.enemy}`)).toEqual([
      "1 charger",
      "1 priest",
      "2 charger",
      "2 priest",
    ]);
  });

  it("refuses a mistyped enemy, count, weapon, difficulty or player by name before any meeting is played", () => {
    expect(() => admitEnemyReport({ ...report, enemies: ["dragon" as never] })).toThrow('no enemy "dragon"');
    expect(() => admitEnemyReport({ ...report, counts: [0] })).toThrow(
      `a meeting holds 1 to ${String(ENEMY_COUNT_LIMIT)} enemies, not 0`,
    );
    expect(() => admitEnemyReport({ ...report, players: ["nobody" as never] })).toThrow('no player "nobody"');
    expect(() => admitEnemyReport({ ...report, weapons: ["spoon" as never] })).toThrow(TypeError);
    expect(() => admitEnemyReport({ ...report, difficulties: ["gentle" as never] })).toThrow(TypeError);
  });

  it("plays the same meetings whole and in shares, and prints a table per count with a row per kind", () => {
    const whole = playEnemyReport(report);
    expect(mergeSlices([0, 1, 2].map((index) => playEnemyReport(report, { index, of: 3 })))).toEqual(whole);
    const text = formatEnemyReport(whole);
    expect(text).toContain("1 of a kind  difficulty normal  weapon sword  player scripted  1 seed");
    expect(text).toContain("2 of a kind  difficulty normal  weapon sword  player scripted  1 seed");
    expect(text.split("\n").filter((line) => /^(charger|priest) +[01]\/1/u.test(line))).toHaveLength(4);
    expect(text).toContain("wave 1 strength");
    expect(text).not.toContain("BROKEN");
  }, 60_000);
});

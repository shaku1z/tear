import { afterEach, describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { compareResults, formatComparison, situationOf, type ComparedResult } from "../../src/playtest/compare";
import { playEnemy, type EnemyRequest } from "../../src/playtest/enemy-play";

const meeting = (enemy: EnemyRequest["enemy"]): EnemyRequest => ({
  enemy,
  count: 1,
  difficulty: "normal",
  weapon: "sword",
  seed: "1",
  player: "scripted",
  maxTicks: 120 * 60,
});

const play = (): readonly ComparedResult[] =>
  [playEnemy(meeting("charger")), playEnemy(meeting("bomber"))] as unknown as readonly ComparedResult[];

describe("comparing two builds", () => {
  const chargerHealth = CONFIG.enemy.hp;
  afterEach(() => {
    CONFIG.enemy.hp = chargerHealth;
  });

  it("flags the time to kill of an enemy whose health is doubled, and nothing else", () => {
    const base = play();
    CONFIG.enemy.hp = chargerHealth * 2;
    const now = play();
    const changed = compareResults(base, now);
    // Only the Charger's meeting changed; the Bomber's is the same on both builds.
    expect(changed.map((entry) => entry.situation)).toEqual([situationOf(now[0] ?? {})]);
    expect(changed[0]?.situation).toContain("enemy charger");
    const measures = Object.fromEntries((changed[0]?.changes ?? []).map((change) => [change.measure, change]));
    expect(measures.enemyHealth).toMatchObject({ base: chargerHealth, now: chargerHealth * 2 });
    expect(measures.ticks?.now).toBeGreaterThan(measures.ticks?.base as number);
    const text = formatComparison(changed, now.length, "abc123");
    expect(text).toContain("Compared with abc123: 1 of 2 situations changed");
    expect(text).toMatch(/ {2}ticks: \d+ -> \d+/u);
  }, 60_000);

  it("finds nothing between a build and itself", () => {
    const results = play();
    expect(compareResults(results, play())).toEqual([]);
    expect(formatComparison([], 2, "abc123")).toBe("Compared with abc123: nothing changed in 2 situations.\n");
  }, 60_000);

  it("names a situation by its request, and reports a measure only one build has", () => {
    const base = {
      enemy: "wraith",
      seed: "1",
      maxTicks: 60,
      end: "cleared",
      ticks: 10,
      hitsBy: { wraith: { damage: 4 } },
    };
    const now = { enemy: "wraith", seed: "1", maxTicks: 60, end: "cleared", ticks: 10, hitsBy: {} };
    expect(situationOf(now)).toBe("enemy wraith  seed 1");
    expect(compareResults([base], [now])).toEqual([
      { situation: "enemy wraith  seed 1", changes: [{ measure: "hitsBy.wraith.damage", base: 4, now: undefined }] },
    ]);
  });

  it("refuses two sets that are not the same situations in the same order", () => {
    const one = { enemy: "wraith", seed: "1", end: "cleared" };
    const other = { enemy: "wraith", seed: "2", end: "cleared" };
    expect(() => compareResults([one], [other])).toThrow("the two builds played different situations at place 1");
    expect(() => compareResults([one], [one, other])).toThrow("the two builds played 1 and 2 situations");
    expect(() => situationOf({ enemy: "wraith" })).toThrow(TypeError);
  });
});

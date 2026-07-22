import { describe, expect, it } from "vitest";
import { planRunStart } from "../../src/gameplay/run/run-start-plan";

const remote = { coinMult: 1.2, scoreMult: 1.5, enemyHpMult: 0.9, enemyDensityMult: 1.1 };

describe("run start plan", () => {
  it("derives an immutable per-run scaling plan without changing definitions", () => {
    const definitions = [{
      id: "hard" as const, oneHit: false,
      mods: { dmg: 1.25, coin: 2, score: 3, hp: 1.4, count: 1.3 },
    }];
    const before = structuredClone(definitions);

    const plan = planRunStart("hard", definitions, remote);

    expect(plan).toEqual({
      difficulty: "hard", oneHit: false, playerDamageMultiplier: 1.25,
      scaling: { coin: 2.4, score: 4.5, enemyHp: 1.26, enemyCount: 1.4300000000000002 },
    });
    expect(definitions).toEqual(before);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.scaling)).toBe(true);
  });

  it("falls back to the first definition and neutral local modifiers", () => {
    const plan = planRunStart("extreme", [{ id: "normal", mods: {} }], {
      coinMult: 1, scoreMult: 1, enemyHpMult: 1, enemyDensityMult: 1,
    });
    expect(plan).toMatchObject({ difficulty: "normal", oneHit: false, playerDamageMultiplier: 1 });
    expect(plan.scaling).toEqual({ coin: 1, score: 1, enemyHp: 1, enemyCount: 1 });
  });

  it("rejects a missing difficulty catalogue", () => {
    expect(() => planRunStart("normal", [], remote)).toThrow("at least one run difficulty");
  });
});

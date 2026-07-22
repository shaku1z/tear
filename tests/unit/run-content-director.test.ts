import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../src/domain/random";
import { BOSS_ROSTER, bossName, pickEnemyKind, pickMiniBoss, shuffledBossRoster } from "../../src/gameplay/run/content-director";

describe("run content director", () => {
  it("shuffles bosses deterministically without loss or duplication", () => {
    const first = shuffledBossRoster(new SeededRandom("boss-order"));
    expect(first).toEqual(shuffledBossRoster(new SeededRandom("boss-order")));
    expect([...first].sort()).toEqual(BOSS_ROSTER.map((boss) => boss.id).sort());
  });

  it("keeps the finale boss out of mini-boss selection", () => {
    const random = new SeededRandom("minibosses");
    expect(Array.from({ length: 100 }, () => pickMiniBoss(random))).not.toContain("source");
  });

  it("gates the standard roster by wave", () => {
    const early = new SeededRandom("wave-one");
    expect(Array.from({ length: 30 }, () => pickEnemyKind(1, early))).toEqual(Array(30).fill("charger"));
    const late = new SeededRandom("late-wave");
    const selected = new Set(Array.from({ length: 500 }, () => pickEnemyKind(99, late)));
    expect(selected).toContain("chimera");
    expect(selected).toContain("anchor");
  });

  it("uses campaign-local unlocks and weights", () => {
    const pool = [
      { kind: "charger", weight: 1, unlockWave: 1 },
      { kind: "chimera", weight: 10, unlockWave: 3 },
    ] as const;
    const early = new SeededRandom("campaign");
    expect(Array.from({ length: 30 }, () => pickEnemyKind(1, early, pool))).toEqual(Array(30).fill("charger"));
    const later = new SeededRandom("campaign");
    expect(new Set(Array.from({ length: 100 }, () => pickEnemyKind(3, later, pool)))).toContain("chimera");
  });

  it("maps known boss ids and fails closed for unknown ids", () => {
    expect(bossName("aldric")).toBe("Berserker King");
    expect(bossName("missing")).toBe("");
  });
});

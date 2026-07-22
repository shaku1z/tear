import { describe, expect, it } from "vitest";

import { AFFIXES, PRESETS, applyPreset, rollAffixes } from "../../src/gameplay/affixes";
import { VARIANTS, applyVariant, rollVariant } from "../../src/gameplay/variants";

function baseEnemy(kind = "charger") {
  return {
    kind,
    hp: 100,
    maxHp: 100,
    weight: 1,
    speedMult: 1,
    fireRateMult: 1,
    volley: 1,
    contactReach: 0,
    contactDmg: 10,
    hw: 15,
    shield: 0,
    maxShield: 0,
    color: "#808080",
    affixes: [] as string[],
    affixCount: 0,
    behavior: "",
  };
}

describe("enemy content preservation catalogue", () => {
  it("retains every authored affix and coherent preset", () => {
    expect(AFFIXES.map((affix) => affix.id)).toEqual(["tank", "swift", "rapid", "volley", "armed", "warded"]);
    expect(PRESETS).toEqual([
      { type: "ranged", affixes: ["rapid", "volley"] },
      { type: "charger", affixes: ["tank", "armed"] },
      { type: "armored", affixes: ["warded", "tank"] },
    ]);

    for (const preset of PRESETS) {
      const enemy = baseEnemy(preset.type);
      applyPreset(enemy, preset);
      expect(enemy.affixes).toEqual(preset.affixes);
      expect(enemy.affixCount).toBe(preset.affixes.length);
    }
  });

  it("retains every named family variant and its wave gate", () => {
    expect(Object.fromEntries(Object.entries(VARIANTS).map(([family, variants]) => [family, variants.map((variant) => variant.id)]))).toEqual({
      charger: ["bull", "brawler", "stalker", "executioner", "gravedigger", "duelist"],
      ranged: ["sentinel", "rifleman", "marksman", "warlock", "chain"],
      flyer: ["swooper", "divebomber", "highdiver"],
      bomber: ["lobber", "juggler", "trapper", "sludge", "geomancer"],
    });

    const first = rollVariant("charger", 1, { next: () => 0.999 });
    expect(first?.id).toBe("bull");
    const late = rollVariant("bomber", 99, { next: () => 0.999 });
    expect(late?.id).toBe("geomancer");
    const enemy = baseEnemy("bomber");
    applyVariant(enemy, late);
    expect(enemy).toMatchObject({ variant: "geomancer", variantName: "Geomancer", behavior: "geo" });
  });

  it("uses only the injected random source when rolling affixes", () => {
    const draws = [0, 0, 0, 0, 0, 0];
    let index = 0;
    const enemy = baseEnemy("charger");
    rollAffixes(enemy, 99, { next: () => draws[index++] ?? 1 });
    expect(enemy.affixCount).toBeGreaterThan(0);
    expect(index).toBeGreaterThan(0);
  });
});

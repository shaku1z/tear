import { describe, expect, it } from "vitest";

import { AFFIXES, PRESETS } from "../../src/gameplay/affixes";
import { ENEMY_KIND_IDS } from "../../src/gameplay/run/content-director";
import { VARIANTS } from "../../src/gameplay/variants";
import { projectEnemyReference, validateProjectedEnemies } from "../../src/game-reference/enemy-reference";

const enemyFamilies = ENEMY_KIND_IDS.map((id) => ({ id, variants: VARIANTS[id] ?? [] }));

function project() {
  return projectEnemyReference({ enemyFamilies, enemyAffixes: AFFIXES, enemyPresets: PRESETS });
}

interface MutableEnemyReference {
  families: { id: string; variants: { id: string; name: string; weight: number; minWave: number | null }[] }[];
  affixes: { id: string; color: string }[];
  presets: { familyId: string; affixIds: string[] }[];
}

function at<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) throw new Error(`missing ${label}`);
  return value;
}

function cloneProjected(): MutableEnemyReference {
  return structuredClone(project()) as unknown as MutableEnemyReference;
}

describe("enemy reference catalog", () => {
  it("projects the exact structural catalog and deep-freezes copied data", () => {
    const result = project();
    expect(result.families.map((family) => family.id)).toEqual([
      "charger", "ranged", "flyer", "bomber", "armored", "priest", "mender", "herald", "anchor", "wraith", "chimera",
    ]);
    expect(result.families).toHaveLength(11);
    expect(result.families.filter((family) => family.variants.length === 0)).toHaveLength(7);
    expect(result.families.find((family) => family.id === "charger")?.variants.map((variant) => variant.id)).toEqual([
      "bull", "brawler", "stalker", "executioner", "gravedigger", "duelist",
    ]);
    expect(result.affixes.map((affix) => affix.id)).toEqual(["tank", "swift", "rapid", "volley", "armed", "warded"]);
    expect(result.presets).toEqual([
      { familyId: "ranged", affixIds: ["rapid", "volley"] },
      { familyId: "charger", affixIds: ["tank", "armed"] },
      { familyId: "armored", affixIds: ["warded", "tank"] },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.families)).toBe(true);
    expect(Object.isFrozen(result.families[0])).toBe(true);
    expect(Object.isFrozen(result.families[0]?.variants)).toBe(true);
    expect(Object.isFrozen(result.affixes[0])).toBe(true);
    expect(Object.isFrozen(result.presets[0]?.affixIds)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("apply");
    expect(JSON.stringify(result)).not.toContain("appliesTo");
  });

  it("rejects reordered canonical source families, variants, affixes, and presets", () => {
    expect(() => projectEnemyReference({ enemyFamilies: enemyFamilies.slice().reverse(), enemyAffixes: AFFIXES, enemyPresets: PRESETS })).toThrow(/exact canonical authored order/u);
    const reorderedVariants = enemyFamilies.map((family) => family.id === "charger" ? { ...family, variants: family.variants.slice().reverse() } : family);
    expect(() => projectEnemyReference({ enemyFamilies: reorderedVariants, enemyAffixes: AFFIXES, enemyPresets: PRESETS })).toThrow(/exact canonical authored order/u);
    expect(() => projectEnemyReference({ enemyFamilies, enemyAffixes: AFFIXES.slice().reverse(), enemyPresets: PRESETS })).toThrow(/exact canonical authored order/u);
    expect(() => projectEnemyReference({ enemyFamilies, enemyAffixes: AFFIXES, enemyPresets: PRESETS.slice().reverse() })).toThrow(/exact canonical authored order/u);
  });

  it("rejects unsafe or malformed runtime source fields before projection", () => {
    const badWeight = enemyFamilies.map((family) => family.id === "charger" ? {
      ...family,
      variants: family.variants.map((variant, index) => index === 0 ? { ...variant, weight: 0 } : variant),
    } : family);
    expect(() => projectEnemyReference({ enemyFamilies: badWeight, enemyAffixes: AFFIXES, enemyPresets: PRESETS })).toThrow(/must be positive/u);

    const badGate = enemyFamilies.map((family) => family.id === "charger" ? {
      ...family,
      variants: family.variants.map((variant, index) => index === 1 ? { ...variant, minWave: 0 } : variant),
    } : family);
    expect(() => projectEnemyReference({ enemyFamilies: badGate, enemyAffixes: AFFIXES, enemyPresets: PRESETS })).toThrow(/must be positive/u);

    const badColor = AFFIXES.map((affix, index) => index === 0 ? { ...affix, color: "#fff" } : affix);
    expect(() => projectEnemyReference({ enemyFamilies, enemyAffixes: badColor, enemyPresets: PRESETS })).toThrow(/six-digit hex/u);
  });

  it("strictly validates imported keys, ranges, and canonical references", () => {
    const extra = cloneProjected();
    (extra.affixes[0] as unknown as Record<string, unknown>).extra = true;
    expect(() => validateProjectedEnemies(extra, "enemies")).toThrow(/unexpected or missing fields/u);

    const badWeight = cloneProjected();
    at(at(badWeight.families, 0, "family").variants, 0, "variant").weight = 0;
    expect(() => validateProjectedEnemies(badWeight, "enemies")).toThrow(/must be positive/u);

    const badGate = cloneProjected();
    at(at(badGate.families, 0, "family").variants, 1, "variant").minWave = 0;
    expect(() => validateProjectedEnemies(badGate, "enemies")).toThrow(/must be positive/u);

    const badColor = cloneProjected();
    at(badColor.affixes, 0, "affix").color = "#fff";
    expect(() => validateProjectedEnemies(badColor, "enemies")).toThrow(/six-digit hex/u);

    const badReference = cloneProjected();
    at(badReference.presets, 0, "preset").familyId = "not-a-family";
    expect(() => validateProjectedEnemies(badReference, "enemies")).toThrow(/exact canonical authored order/u);

    const badAffixReference = cloneProjected();
    at(badAffixReference.presets, 0, "preset").affixIds[0] = "not-an-affix";
    expect(() => validateProjectedEnemies(badAffixReference, "enemies")).toThrow(/exact canonical authored order/u);

    const reordered = cloneProjected();
    reordered.families.reverse();
    expect(() => validateProjectedEnemies(reordered, "enemies")).toThrow(/exact canonical authored order/u);
  });
});

import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { DIFFICULTY_CATALOG, DIFFICULTY_IDS, createLegacyDifficulties } from "../../src/gameplay/run/difficulty-catalog";
import { planRunStart } from "../../src/gameplay/run/run-start-plan";
import { canonicalStringify, stableVerificationHash } from "../../src/replay/hash";

const remote = { coinMult: 1.2, scoreMult: 1.5, enemyHpMult: 0.9, enemyDensityMult: 1.1 };

describe("authored difficulty catalog", () => {
  it("preserves the exact public values and canonical order", () => {
    expect(DIFFICULTY_CATALOG.map((difficulty) => difficulty.id)).toEqual([...DIFFICULTY_IDS]);
    expect(DIFFICULTY_CATALOG).toEqual([
      { id: "easy", label: "Easy", description: "Gentler enemies, lighter hits.", oneHit: false, modifiers: { enemyHealth: 0.8, playerDamageTaken: 0.65, enemyCount: 0.85, coinReward: 0.8, scoreReward: 0.7 } },
      { id: "normal", label: "Normal", description: "The intended balance.", oneHit: false, modifiers: { enemyHealth: 1, playerDamageTaken: 1, enemyCount: 1, coinReward: 1, scoreReward: 1 } },
      { id: "hard", label: "Hard", description: "Tougher, hungrier, more of them.", oneHit: false, modifiers: { enemyHealth: 1.3, playerDamageTaken: 1.35, enemyCount: 1.15, coinReward: 1.1, scoreReward: 1.4 } },
      { id: "extreme", label: "Extreme", description: "Brutal — but fair. Big rewards.", oneHit: false, modifiers: { enemyHealth: 1.7, playerDamageTaken: 1.8, enemyCount: 1.3, coinReward: 1.15, scoreReward: 2 } },
      { id: "onehit", label: "One-Hit", description: "One touch and you fall. Rewards surge after wave 8.", oneHit: true, modifiers: { enemyHealth: 0.9, playerDamageTaken: 1, enemyCount: 1, coinReward: 0.7, scoreReward: 2.2 } },
    ]);
    expect(Object.isFrozen(DIFFICULTY_CATALOG)).toBe(true);
    expect(Object.isFrozen(DIFFICULTY_CATALOG[0])).toBe(true);
    expect(Object.isFrozen(DIFFICULTY_CATALOG[0].modifiers)).toBe(true);
    expect(Object.keys(DIFFICULTY_CATALOG[0])).toEqual(["id", "label", "description", "oneHit", "modifiers"]);
    expect(Object.keys(DIFFICULTY_CATALOG[0].modifiers)).toEqual([
      "enemyHealth", "playerDamageTaken", "enemyCount", "coinReward", "scoreReward",
    ]);
  });

  it("adapts to the exact legacy CONFIG shape without false oneHit keys", () => {
    const legacy = createLegacyDifficulties();
    expect(legacy).toEqual(CONFIG.difficulties);
    expect(Object.keys(legacy[0] ?? {})).toEqual(["id", "label", "desc", "mods"]);
    expect(Object.keys(legacy.at(-1) ?? {})).toEqual(["id", "label", "desc", "oneHit", "mods"]);
    expect(canonicalStringify(legacy)).toBe(canonicalStringify(CONFIG.difficulties));
    expect(stableVerificationHash(legacy)).toBe(stableVerificationHash(CONFIG.difficulties));
    expect(stableVerificationHash(legacy)).toBe("a28c2b90df011293");
    const second = createLegacyDifficulties();
    const first = legacy[0];
    if (first === undefined) throw new Error("difficulty fixture is empty");
    expect(legacy).not.toBe(second);
    expect(first.mods).not.toBe(second[0]?.mods);
    first.mods.hp = 3;
    expect(second[0]?.mods.hp).toBe(0.8);
    expect(DIFFICULTY_CATALOG[0].modifiers.enemyHealth).toBe(0.8);
  });

  it("keeps planRunStart behavior unchanged for every adapted difficulty", () => {
    const definitions = createLegacyDifficulties();
    for (const definition of definitions) {
      const plan = planRunStart(definition.id, definitions, remote);
      expect(plan.difficulty).toBe(definition.id);
      expect(plan.oneHit).toBe(definition.id === "onehit");
      expect(plan.playerDamageMultiplier).toBe(definition.mods.dmg);
      expect(plan.scaling.enemyHp).toBe(definition.mods.hp * remote.enemyHpMult);
      expect(plan.scaling.enemyCount).toBe(definition.mods.count * remote.enemyDensityMult);
    }
  });
});

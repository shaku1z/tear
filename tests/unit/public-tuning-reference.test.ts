import { describe, expect, it } from "vitest";

import { DIFFICULTY_CATALOG } from "../../src/gameplay/run/difficulty-catalog";
import { assertValidPublicTuning, projectPublicTuning } from "../../src/game-reference/public-tuning-reference";

function publicTuning() {
  return projectPublicTuning(DIFFICULTY_CATALOG);
}

interface MutablePublicDifficulty {
  [key: string]: unknown;
  id: string;
  label: string;
  description: string;
  oneHit: boolean;
  modifiers: Record<string, number>;
}

interface MutablePublicTuningFixture {
  schemaVersion: number;
  difficultyCatalog: MutablePublicDifficulty[];
}

function mutablePublicTuning(): MutablePublicTuningFixture {
  return structuredClone(publicTuning()) as unknown as MutablePublicTuningFixture;
}

function firstDifficulty(value: MutablePublicTuningFixture): MutablePublicDifficulty {
  const first = value.difficultyCatalog[0];
  if (first === undefined) throw new Error("difficulty fixture is empty");
  return first;
}

describe("game-reference public tuning", () => {
  it("projects the complete authored difficulty value envelope", () => {
    const result = publicTuning();
    expect(result).toEqual({
      schemaVersion: 1,
      difficultyCatalog: [
        { id: "easy", label: "Easy", description: "Gentler enemies, lighter hits.", oneHit: false, modifiers: { enemyHealth: 0.8, playerDamageTaken: 0.65, enemyCount: 0.85, coinReward: 0.8, scoreReward: 0.7 } },
        { id: "normal", label: "Normal", description: "The intended balance.", oneHit: false, modifiers: { enemyHealth: 1, playerDamageTaken: 1, enemyCount: 1, coinReward: 1, scoreReward: 1 } },
        { id: "hard", label: "Hard", description: "Tougher, hungrier, more of them.", oneHit: false, modifiers: { enemyHealth: 1.3, playerDamageTaken: 1.35, enemyCount: 1.15, coinReward: 1.1, scoreReward: 1.4 } },
        { id: "extreme", label: "Extreme", description: "Brutal — but fair. Big rewards.", oneHit: false, modifiers: { enemyHealth: 1.7, playerDamageTaken: 1.8, enemyCount: 1.3, coinReward: 1.15, scoreReward: 2 } },
        { id: "onehit", label: "One-Hit", description: "One touch and you fall. Rewards surge after wave 8.", oneHit: true, modifiers: { enemyHealth: 0.9, playerDamageTaken: 1, enemyCount: 1, coinReward: 0.7, scoreReward: 2.2 } },
      ],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.keys(result)).toEqual(["schemaVersion", "difficultyCatalog"]);
    expect(Object.isFrozen(result.difficultyCatalog)).toBe(true);
    const first = result.difficultyCatalog[0];
    if (first === undefined) throw new Error("difficulty fixture is empty");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.modifiers)).toBe(true);
    expect(Object.keys(first)).toEqual(["id", "label", "description", "oneHit", "modifiers"]);
    expect(Object.keys(first.modifiers)).toEqual([
      "enemyHealth", "playerDamageTaken", "enemyCount", "coinReward", "scoreReward",
    ]);
    expect(() => { assertValidPublicTuning(result); }).not.toThrow();
  });

  it("rejects reordered, extra, stale, and unsafe imported values", () => {
    const reordered = mutablePublicTuning();
    reordered.difficultyCatalog.reverse();
    expect(() => { assertValidPublicTuning(reordered); }).toThrow(/canonical authored order|authored difficulty/u);

    const extra = mutablePublicTuning();
    firstDifficulty(extra).unexpected = true;
    expect(() => { assertValidPublicTuning(extra); }).toThrow(/unexpected or missing fields/u);

    const staleText = mutablePublicTuning();
    firstDifficulty(staleText).label = "Old Easy";
    expect(() => { assertValidPublicTuning(staleText); }).toThrow(/does not match authored/u);

    const unsafeModifier = mutablePublicTuning();
    firstDifficulty(unsafeModifier).modifiers.enemyHealth = 0;
    expect(() => { assertValidPublicTuning(unsafeModifier); }).toThrow(/positive finite/u);

    const wrongOneHit = mutablePublicTuning();
    firstDifficulty(wrongOneHit).oneHit = true;
    expect(() => { assertValidPublicTuning(wrongOneHit); }).toThrow(/oneHit/u);

    const wrongSchema = mutablePublicTuning();
    wrongSchema.schemaVersion = 2;
    expect(() => { assertValidPublicTuning(wrongSchema); }).toThrow(/unsupported/u);
  });

  it("rejects a reordered source catalog instead of normalizing it", () => {
    expect(() => { projectPublicTuning(DIFFICULTY_CATALOG.slice().reverse()); }).toThrow(/canonical authored order|authored difficulty/u);
  });
});

import { describe, expect, it } from "vitest";

import { calculateCoinAward } from "../../src/gameplay/scoring/coin-awards";

describe("calculateCoinAward", () => {
  it("preserves normal score, depth, meta, and fortune reward stacking", () => {
    expect(calculateCoinAward({
      score: 1_000, wave: 10, difficultyId: "normal", baseDifficultyMultiplier: 1,
      remoteMultiplier: 1, coinMagnetLevel: 2, fortuneLevel: 3,
    })).toEqual({
      earned: 198,
      scoreCoins: 23,
      depthCoins: 100,
      difficultyMultiplier: 1,
      fortuneMultiplier: 1.6099999999999999,
    });
  });

  it("ramps one-hit rewards after wave eight without changing the pre-ramp floor", () => {
    const early = calculateCoinAward({ score: 1_000, wave: 8, difficultyId: "onehit", baseDifficultyMultiplier: 9, remoteMultiplier: 1, coinMagnetLevel: 0, fortuneLevel: 0 });
    const deep = calculateCoinAward({ score: 1_000, wave: 20, difficultyId: "onehit", baseDifficultyMultiplier: 9, remoteMultiplier: 1, coinMagnetLevel: 0, fortuneLevel: 0 });
    expect(early.difficultyMultiplier).toBe(0.7);
    expect(deep.difficultyMultiplier).toBeCloseTo(3.05);
    expect(deep.earned).toBeGreaterThan(early.earned);
  });
});

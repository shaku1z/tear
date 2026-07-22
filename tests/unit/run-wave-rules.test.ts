import { describe, expect, it } from "vitest";
import { bossScaling, describeWave } from "../../src/gameplay/run/wave-rules";

describe("wave and boss lifecycle rules", () => {
  it("characterizes campaign stages, lore boundaries, and boss cadence", () => {
    expect(describeWave({ mode: "campaign", wave: 1 })).toMatchObject({ campaignStage: 0, bossWave: false });
    expect(describeWave({ mode: "campaign", wave: 10 })).toMatchObject({ campaignStage: 0, bossWave: true });
    expect(describeWave({ mode: "campaign", wave: 11 })).toMatchObject({ campaignStage: 1, bossWave: false });
    expect(describeWave({ mode: "campaign", wave: 50 })).toMatchObject({ campaignStage: 4, bossWave: true });
  });

  it("preserves endless, gauntlet, fixed-wave, and boss-only classifications", () => {
    expect(describeWave({ mode: "endless", wave: 5 })).toMatchObject({ endlessBiome: 0, hordeWave: true, miniBossWave: false });
    expect(describeWave({ mode: "endless", wave: 10 })).toMatchObject({ endlessBiome: 1, hordeWave: false, miniBossWave: true });
    expect(describeWave({ mode: "gauntlet", wave: 8 })).toMatchObject({ bossWave: true, endlessBiome: 1 });
    expect(describeWave({ mode: "bossonly", wave: 1, bossOnly: true })).toMatchObject({ bossWave: true });
    expect(describeWave({ mode: "sandbox", wave: 6, configuredWaves: 5 })).toMatchObject({ bossWave: true });
  });

  it("preserves campaign placeholder and deep gauntlet boss scaling", () => {
    expect(bossScaling({
      mode: "campaign", wave: 20, bossesBeaten: 0, campaignStage: 2, placeholderBoss: true, difficultyHp: 1.3,
    })).toEqual({ health: 2.2 * 1.3, contactDamage: 1 });
    expect(bossScaling({
      mode: "gauntlet", wave: 50, bossesBeaten: 4, campaignStage: 0, placeholderBoss: false, difficultyHp: 1.7,
    })).toEqual({ health: (1 + 50 * 0.12 + 4 * 0.06) * 1.7, contactDamage: 1 + 50 * 0.05 });
  });
});

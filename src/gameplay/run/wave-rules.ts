import type { RunMode } from "./session";

export interface WaveDescription {
  readonly wave: number;
  readonly bossWave: boolean;
  readonly campaignStage: number | null;
  readonly endlessBiome: number | null;
  readonly miniBossWave: boolean;
  readonly hordeWave: boolean;
}

export interface DescribeWaveOptions {
  readonly mode: RunMode;
  readonly wave: number;
  readonly configuredWaves?: number;
  readonly bossOnly?: boolean;
}

export function describeWave(options: DescribeWaveOptions): WaveDescription {
  const { mode, wave } = options;
  if (!Number.isSafeInteger(wave) || wave < 1) throw new RangeError("wave must be a positive integer");
  const configuredWaves = options.configuredWaves ?? 0;
  let bossWave = mode === "campaign" ? wave % 10 === 0 : Boolean(options.bossOnly) || (configuredWaves > 0 && wave > configuredWaves);
  if (mode === "gauntlet") bossWave = wave % 8 === 0;
  const endlessLike = mode === "endless" || mode === "gauntlet";
  const miniBossWave = mode === "endless" && wave > 1 && wave % 10 === 0;
  const hordeWave = endlessLike && !bossWave && !miniBossWave && wave > 3 && wave % 5 === 0;
  return Object.freeze({
    wave,
    bossWave,
    campaignStage: mode === "campaign" ? Math.floor((wave - 1) / 10) : null,
    endlessBiome: endlessLike ? Math.floor((wave - 1) / 5) : null,
    miniBossWave,
    hordeWave,
  });
}

export interface BossScalingOptions {
  readonly mode: RunMode;
  readonly wave: number;
  readonly bossesBeaten: number;
  readonly campaignStage: number;
  readonly placeholderBoss: boolean;
  readonly difficultyHp: number;
}

export interface BossScaling {
  readonly health: number;
  readonly contactDamage: number;
}

export function bossScaling(options: BossScalingOptions): BossScaling {
  let structuralHealth = 1;
  let contactDamage = 1;
  if (options.mode === "campaign" && options.campaignStage > 0 && options.placeholderBoss) {
    structuralHealth = 1 + options.campaignStage * 0.6;
  } else if (options.mode === "bossonly" || options.mode === "gauntlet") {
    structuralHealth = 1 + options.wave * 0.12 + options.bossesBeaten * 0.06;
    contactDamage = 1 + options.wave * 0.05;
  }
  return Object.freeze({ health: structuralHealth * options.difficultyHp, contactDamage });
}

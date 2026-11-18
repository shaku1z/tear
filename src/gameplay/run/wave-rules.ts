import { gauntletBossScale, gauntletLabel, gauntletWave } from "./gauntlet-trials";
import type { RunMode } from "./session";

export interface WaveDescription {
  readonly wave: number;
  readonly bossWave: boolean;
  readonly campaignStage: number | null;
  readonly endlessBiome: number | null;
  readonly miniBossWave: boolean;
  readonly hordeWave: boolean;
  /** Gauntlet only: the trial index (from 0) this wave belongs to. */
  readonly gauntletTrial: number | null;
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
  let bossWave =
    mode === "campaign"
      ? wave % 10 === 0
      : Boolean(options.bossOnly) || (configuredWaves > 0 && wave > configuredWaves);
  const trial = mode === "gauntlet" ? gauntletWave(wave) : null;
  if (trial !== null) bossWave = trial.boss;
  const endless = mode === "endless";
  const miniBossWave = endless && wave > 1 && wave % 10 === 0;
  const hordeWave = endless && !bossWave && !miniBossWave && wave > 3 && wave % 5 === 0;
  return Object.freeze({
    wave,
    bossWave,
    campaignStage: mode === "campaign" ? Math.floor((wave - 1) / 10) : null,
    endlessBiome: endless ? Math.floor((wave - 1) / 5) : null,
    miniBossWave,
    hordeWave,
    gauntletTrial: trial?.trial ?? null,
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
  } else if (options.mode === "gauntlet") {
    const scale = gauntletBossScale(gauntletWave(options.wave).trial);
    structuralHealth = scale.health;
    contactDamage = scale.damage;
  } else if (options.mode === "bossonly") {
    structuralHealth = 1 + options.wave * 0.12 + options.bossesBeaten * 0.06;
    contactDamage = 1 + options.wave * 0.05;
  }
  return Object.freeze({ health: structuralHealth * options.difficultyHp, contactDamage });
}

/**
 * The name of the wave in play, as the HUD and the wave banner show it: "WAVE 7", "BOSS",
 * or in the Gauntlet "TRIAL 2/6 · ROUND 1/2" and "TRIAL 2/6 · BOSS".
 */
export function waveTitle(mode: string, wave: number, bossWave: boolean, trialCount = 0): string {
  if (mode === "gauntlet" && trialCount > 0 && wave >= 1) return gauntletLabel(wave, trialCount);
  return bossWave ? "BOSS" : `WAVE ${String(wave)}`;
}

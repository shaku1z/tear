export type RunMode = "campaign" | "endless" | "gauntlet" | "playground" | "tutorial" | "bossonly" | "sandbox";
export type RunDifficulty = "easy" | "normal" | "hard" | "extreme" | "onehit";

export interface RunDifficultyScaling {
  readonly coin: number;
  readonly score: number;
  readonly enemyHp: number;
  readonly enemyCount: number;
}

export interface CreateRunSessionOptions<TMods> {
  readonly mode: RunMode;
  readonly difficulty: RunDifficulty;
  readonly weaponId: string;
  readonly runSeed: number;
  readonly voidSeed: number;
  readonly mods: TMods;
  readonly scaling: RunDifficultyScaling;
  readonly achievementSnapshot: readonly string[];
}

export interface RunWeaponStats {
  heldHits: number;
  trueCuts: number;
  throws: number;
  throwHits: number;
  perfectParries: number;
  breakTriggers: number;
  distanceMoved: number;
}

export interface RunWaveLogEntry {
  readonly wave: number | "BOSS";
  readonly time: number;
  readonly kills: number;
  readonly peak: number;
  readonly died?: boolean;
}

export interface RunSession<TMods> {
  mode: RunMode;
  diff: RunDifficulty;
  wave: number;
  score: number;
  mods: TMods & { weaponId?: string };
  spawnQueue: WaveSpawnSpec[];
  spawnTimer: number;
  clearTimer: number;
  runTime: number;
  waveTime: number;
  waveKills: number;
  wavePeak: number;
  waveLog: RunWaveLogEntry[];
  combo: number;
  comboTimer: number;
  mult: number;
  rank: string;
  lastTrick: string;
  lifestealCd: number;
  specialBlock: number;
  specialsOffered: number;
  adRevived: boolean;
  coinMod: number;
  scoreMod: number;
  diffHp: number;
  diffCount: number;
  _dmgThisWave: boolean;
  _dmgThisRun: boolean;
  _dmgThisStage: boolean;
  _achSnap: string[];
  weaponId: string;
  weaponStats: RunWeaponStats;
  weaponLog: unknown[];
  biomeState: { swung: boolean; thrown: boolean; jumped: boolean };
  _staticParry: number;
  _airKills: number;
  _projDashes: number;
  _aldricSlams: number;
  _revivedT: boolean;
  _bossFightT: number | null;
  runSeed: number;
  voidSeed: number;
  chapterState: string;
  pendingBossOutro: unknown;
  _prologueShown: boolean;
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and non-negative`);
  return value;
}

export function createRunSession<TMods extends { weaponId?: string }>(
  options: CreateRunSessionOptions<TMods>,
): RunSession<TMods> {
  if (!Number.isSafeInteger(options.runSeed) || options.runSeed < 1) throw new RangeError("runSeed must be a positive integer");
  if (!Number.isSafeInteger(options.voidSeed) || options.voidSeed < 1) throw new RangeError("voidSeed must be a positive integer");
  const mods = options.mods;
  mods.weaponId = options.weaponId;
  return {
    mode: options.mode,
    diff: options.difficulty,
    wave: 0,
    score: 0,
    mods,
    spawnQueue: [],
    spawnTimer: 0,
    clearTimer: -1,
    runTime: 0,
    waveTime: 0,
    waveKills: 0,
    wavePeak: 1,
    waveLog: [],
    combo: 0,
    comboTimer: 0,
    mult: 1,
    rank: "",
    lastTrick: "",
    lifestealCd: 0,
    specialBlock: -1,
    specialsOffered: 0,
    adRevived: false,
    coinMod: finiteNonNegative(options.scaling.coin, "coin scaling"),
    scoreMod: finiteNonNegative(options.scaling.score, "score scaling"),
    diffHp: finiteNonNegative(options.scaling.enemyHp, "enemy HP scaling"),
    diffCount: finiteNonNegative(options.scaling.enemyCount, "enemy count scaling"),
    _dmgThisWave: false,
    _dmgThisRun: false,
    _dmgThisStage: false,
    _achSnap: [...options.achievementSnapshot],
    weaponId: options.weaponId,
    weaponStats: { heldHits: 0, trueCuts: 0, throws: 0, throwHits: 0, perfectParries: 0, breakTriggers: 0, distanceMoved: 0 },
    weaponLog: [],
    biomeState: { swung: false, thrown: false, jumped: false },
    _staticParry: 0,
    _airKills: 0,
    _projDashes: 0,
    _aldricSlams: 0,
    _revivedT: false,
    _bossFightT: null,
    runSeed: options.runSeed,
    voidSeed: options.voidSeed,
    chapterState: options.mode === "campaign" ? "LORE_ENTER" : "WAVE_LIVE",
    pendingBossOutro: null,
    _prologueShown: false,
  };
}
import type { WaveSpawnSpec } from "./wave-planner";

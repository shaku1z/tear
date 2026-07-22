import type { RandomSource } from "../../domain/random";
import type { RunMode } from "./session";
import type { WaveSpawnSpec } from "./wave-planner";

export interface SpawnTuning {
  readonly maxConcurrent: number;
  readonly maxConcurrentCap: number;
  readonly concurrentPerStage: number;
  readonly spawnInterval: number;
}

export interface SpawnScheduleState {
  readonly mode: RunMode;
  readonly wave: number;
  readonly horde: boolean;
  readonly spawnQueue: readonly WaveSpawnSpec[];
  readonly spawnTimer: number;
}

export interface SpawnScheduleInput {
  readonly state: SpawnScheduleState;
  readonly tuning: SpawnTuning;
  readonly enemyCount: number;
  readonly loreBusy: boolean;
  readonly dt: number;
}

export interface SpawnScheduleResult {
  readonly state: SpawnScheduleState;
  readonly concurrentCap: number;
  readonly spawned: WaveSpawnSpec | null;
  readonly eligible: boolean;
}

export function concurrentEnemyCap(state: Pick<SpawnScheduleState, "mode" | "wave" | "horde">, tuning: SpawnTuning): number {
  if (state.mode === "campaign") {
    return Math.min(
      tuning.maxConcurrentCap,
      tuning.maxConcurrent + Math.floor((state.wave - 1) / 10) * tuning.concurrentPerStage,
    );
  }
  if (state.mode === "endless" || state.mode === "gauntlet") {
    return Math.min(
      tuning.maxConcurrentCap + 3,
      tuning.maxConcurrent + Math.floor(state.wave / 7) + (state.horde ? 3 : 0),
    );
  }
  return tuning.maxConcurrent;
}

export function scheduleWaveSpawn(input: SpawnScheduleInput): SpawnScheduleResult {
  if (!Number.isFinite(input.dt) || input.dt < 0) throw new RangeError("dt must be finite and non-negative");
  const cap = concurrentEnemyCap(input.state, input.tuning);
  const eligible = input.state.spawnQueue.length > 0 && input.enemyCount < cap && !input.loreBusy;
  if (!eligible) return { state: input.state, concurrentCap: cap, spawned: null, eligible: false };

  let spawnTimer = input.state.spawnTimer;
  if (input.enemyCount === 0 && spawnTimer > 0.3) spawnTimer = 0.3;
  spawnTimer -= input.dt;
  if (spawnTimer > 0) {
    return { state: { ...input.state, spawnTimer }, concurrentCap: cap, spawned: null, eligible: true };
  }
  const [spawned, ...spawnQueue] = input.state.spawnQueue;
  if (spawned === undefined) throw new Error("eligible spawn queue unexpectedly became empty");
  return {
    state: { ...input.state, spawnQueue, spawnTimer: input.tuning.spawnInterval },
    concurrentCap: cap,
    spawned,
    eligible: true,
  };
}

export interface GroundPlatform {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly oneway?: boolean;
}

export function planGroundSpawn(
  halfHeight: number,
  platforms: readonly GroundPlatform[],
  groundY: number,
  worldWidth: number,
  random: RandomSource,
): Readonly<{ x: number; y: number }> {
  const oneWayPlatforms = platforms.filter((platform) => platform.oneway);
  if (oneWayPlatforms.length > 0 && random.next() < 0.4) {
    const platform = oneWayPlatforms[Math.floor(random.next() * oneWayPlatforms.length)];
    if (platform === undefined) throw new Error("platform selection escaped one-way platform bounds");
    return Object.freeze({ x: platform.x + 24 + random.next() * (platform.w - 48), y: platform.y - halfHeight });
  }
  return Object.freeze({ x: planSideSpawn(worldWidth, random), y: groundY - 80 });
}

export function planSideSpawn(worldWidth: number, random: RandomSource): number {
  return random.next() < 0.5
    ? 180 + random.next() * 240
    : worldWidth - 180 - random.next() * 240;
}

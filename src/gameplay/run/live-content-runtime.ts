import type { RandomSource } from "../../domain/random";
import { shuffledBossRoster, type BossId } from "./content-director";
import { completeEnemySpawn, constructLiveEnemy, type LiveEnemyConstructionPort,
  type LiveEnemySpawnPort, type LiveSpawnEnemy, type LiveWaveSpawnSpec } from "./live-enemy-spawn";
import { planGroundSpawn, planSideSpawn, type GroundPlatform } from "./spawn-scheduler";

export interface ContentMode { readonly id: string; readonly waves?: number }
export interface ContentStage { readonly boss?: string }
export interface ContentRun { readonly mode: string; readonly wave: number; readonly curBoss?: string }

export interface LiveContentRuntimeOptions<TEnemy extends LiveSpawnEnemy> {
  readonly width: number;
  readonly random: RandomSource;
  readonly run: () => ContentRun | null;
  readonly modes: () => readonly ContentMode[];
  readonly stages: readonly ContentStage[];
  readonly platforms: () => readonly GroundPlatform[];
  readonly groundY: () => number;
  readonly construction: LiveEnemyConstructionPort<TEnemy>;
  readonly spawning: LiveEnemySpawnPort<TEnemy>;
  readonly createBoss: (id: string) => TEnemy;
}

export interface LiveContentRuntimeApi<TEnemy extends LiveSpawnEnemy> {
  readonly shuffledRoster: () => BossId[];
  readonly modeWaves: (mode: string) => number;
  readonly contentWave: () => number;
  readonly sideSpawn: () => number;
  readonly groundSpawn: (halfHeight: number) => Readonly<{ x: number; y: number }>;
  readonly bossById: (id: string) => TEnemy;
  readonly bossBiome: (id: string) => number;
  readonly makeBoss: () => TEnemy;
  readonly spawn: (spec: LiveWaveSpawnSpec) => void;
}

export function createLiveContentRuntime<TEnemy extends LiveSpawnEnemy>(
  options: LiveContentRuntimeOptions<TEnemy>,
): LiveContentRuntimeApi<TEnemy> {
  const bossById = (id: string): TEnemy => options.createBoss(id);
  const makeBoss = (): TEnemy => {
    const run = options.run();
    if (run === null) throw new Error("boss creation requires an active run");
    const id = run.mode === "campaign"
      ? options.stages[Math.max(0, options.spawning.campaignStage())]?.boss ?? "warden"
      : ["bossonly", "gauntlet", "playground"].includes(run.mode) ? run.curBoss ?? "warden" : "warden";
    const enemy = bossById(id); enemy.bossId = id; return enemy;
  };
  const api: LiveContentRuntimeApi<TEnemy> = {
    shuffledRoster: () => shuffledBossRoster(options.random),
    modeWaves: (mode: string) => options.modes().find((candidate) => candidate.id === mode)?.waves ?? 0,
    contentWave: () => { const run = options.run(); return run?.mode === "sandbox" ? 99 : run?.wave ?? 0; },
    sideSpawn: () => planSideSpawn(options.width, options.random),
    groundSpawn: (halfHeight: number) => planGroundSpawn(
      halfHeight, options.platforms(), options.groundY(), options.width, options.random,
    ),
    bossById,
    bossBiome: (id: string) => Math.max(0, options.stages.findIndex((stage) => stage.boss === id)),
    makeBoss,
    spawn: (spec: LiveWaveSpawnSpec) => { completeEnemySpawn(
      constructLiveEnemy(spec, { ...options.construction, sideSpawn: api.sideSpawn,
        createBoss: (id?: string) => id === undefined ? makeBoss() : bossById(id) }),
      spec, { ...options.spawning, contentWave: api.contentWave, groundSpawn: api.groundSpawn },
    ); },
  };
  return Object.freeze(api);
}

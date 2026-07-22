import { resolveMusicBossPhase, resolveMusicScene, type MusicContextObservation } from "./music-director";

export interface LiveMusicRun {
  readonly runTime: number;
  readonly mode: string;
  readonly diff: string;
  readonly wave?: number;
  readonly spawnQueue: readonly unknown[];
  readonly horde?: boolean;
  readonly miniBoss?: boolean;
  readonly rank?: string;
  readonly combo: number;
  readonly mult?: number;
}

export interface LiveMusicActor {
  readonly dead?: boolean;
  readonly dying?: boolean;
  readonly isBoss?: boolean;
  readonly bossId?: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly phaseMarks?: readonly number[];
}

export interface LiveMusicPlayer {
  readonly hp: number;
  readonly maxHp: number;
  readonly vx: number;
  readonly vy: number;
  readonly onGround: boolean;
}

export interface LiveMusicObservationInput {
  readonly appState: string;
  readonly run: LiveMusicRun;
  readonly player: LiveMusicPlayer | null;
  readonly actors: readonly LiveMusicActor[];
  readonly projectiles: readonly Readonly<{ dead?: boolean }>[];
  readonly stageName: string | null;
  readonly stageIndex: number;
  readonly totalWaves: number;
  readonly waveActive: boolean;
  readonly runPhase: string;
  readonly topComboThreshold: number;
  readonly bossIntroActor: LiveMusicActor | null;
}

function ratio(value: number, maximum: number): number {
  return Math.max(0, Math.min(1, value / Math.max(1, maximum)));
}

export function activeMusicBoss(actors: readonly LiveMusicActor[]): LiveMusicActor | null {
  return actors.find((actor) => actor.isBoss === true && actor.dead !== true && actor.dying !== true) ?? null;
}

function countLive(items: readonly Readonly<{ dead?: boolean }>[]): number {
  let count = 0;
  for (const item of items) if (item.dead !== true) count++;
  return count;
}

export function buildLiveMusicObservation(input: LiveMusicObservationInput): MusicContextObservation {
  const boss = activeMusicBoss(input.actors);
  const { run, player } = input;
  return {
    timeMs: Math.round(run.runTime * 1_000),
    scene: resolveMusicScene(input.appState, boss !== null),
    modeId: run.mode,
    difficultyId: run.diff,
    biomeId: input.stageName ?? "menu",
    stageId: String(input.stageIndex),
    wave: run.wave ?? 0,
    totalWaves: input.totalWaves,
    waveActive: input.waveActive,
    runPhase: input.runPhase,
    liveEnemies: countLive(input.actors),
    queuedEnemies: run.spawnQueue.length,
    projectileCount: countLive(input.projectiles),
    horde: run.horde === true,
    miniBoss: run.miniBoss === true,
    bossActive: boss !== null,
    bossId: boss?.bossId ?? null,
    bossPhase: boss ? resolveMusicBossPhase(boss.hp, boss.maxHp, boss.phaseMarks ?? []) : null,
    ...(boss ? { bossHealthRatio: ratio(boss.hp, boss.maxHp) } : {}),
    bossIntro: boss !== null && input.bossIntroActor === boss,
    playerHealthRatio: player ? ratio(player.hp, player.maxHp) : 1,
    comboRankId: run.rank ?? "",
    comboGauge: ratio(run.combo, input.topComboThreshold),
    comboMultiplier: run.mult ?? 1,
    playerMoving: player ? Math.hypot(player.vx, player.vy) > 180 : false,
    playerAirborne: player ? !player.onGround : false,
  };
}

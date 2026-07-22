import type { LiveMusicSyncInput } from "./live-frame-runtime";
import type { GameEnemy, GamePlayer, GameProjectile, GameRun } from "./game-runtime-state";

export function projectLiveMusicRun(active: GameRun | null | undefined): LiveMusicSyncInput["run"] {
  return active === null || active === undefined ? null : {
    runTime: active.runTime, mode: active.mode, diff: active.diff, wave: active.wave, spawnQueue: active.spawnQueue,
    ...(active.horde === undefined ? {} : { horde: active.horde }), miniBoss: typeof active.miniBoss === "string",
    rank: active.rank, combo: active.combo, mult: active.mult,
  };
}

interface MusicObservationOptions {
  readonly director: LiveMusicSyncInput["director"];
  readonly appState: () => string;
  readonly run: () => GameRun | null | undefined;
  readonly player: () => GamePlayer | undefined;
  readonly enemies: () => readonly GameEnemy[];
  readonly projectiles: () => readonly GameProjectile[];
  readonly bossIntro: () => Readonly<{ boss: GameEnemy }> | null;
  readonly stage: () => Readonly<{ name: string | null; index: number }>;
  readonly totalWaves: (mode: GameRun["mode"]) => number;
  readonly waveActive: () => boolean;
  readonly runPhase: () => string;
  readonly topComboThreshold: () => number;
}

/** Projects mutable combat state into the nullable observation consumed by the music director. */
export function createLiveMusicObservation(options: MusicObservationOptions): () => LiveMusicSyncInput {
  return () => {
    const active = options.run(), run = projectLiveMusicRun(active);
    const enemies = options.enemies();
    const actors = enemies.map((enemy) => ({ dead: enemy.dead, dying: enemy.dying,
      ...(enemy.isBoss === undefined ? {} : { isBoss: enemy.isBoss }),
      ...(typeof enemy.bossId === "string" ? { bossId: enemy.bossId } : {}),
      hp: enemy.hp, maxHp: enemy.maxHp, phaseMarks: enemy.phaseMarks }));
    const intro = options.bossIntro(), introIndex = intro === null ? -1 : enemies.indexOf(intro.boss);
    const stage = options.stage();
    return { director: options.director, appState: options.appState(), run, player: options.player() ?? null, actors,
      projectiles: options.projectiles().map((projectile) => ({ dead: projectile.dead })), stageName: stage.name,
      stageIndex: stage.index, totalWaves: options.totalWaves(active?.mode ?? "endless"), waveActive: options.waveActive(),
      runPhase: options.runPhase(), topComboThreshold: options.topComboThreshold(),
      bossIntroActor: introIndex < 0 ? null : actors[introIndex] ?? null };
  };
}

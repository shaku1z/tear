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
  readonly stageName: () => string | null;
  readonly stageIndex: () => number;
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
    const intro = options.bossIntro();
    // The music director only reads these structural views synchronously. Pass
    // the owned collections through instead of cloning every actor/projectile
    // on every display frame.
    return { director: options.director, appState: options.appState(), run, player: options.player() ?? null,
      actors: enemies, projectiles: options.projectiles(), stageName: options.stageName(),
      stageIndex: options.stageIndex(), totalWaves: options.totalWaves(active?.mode ?? "endless"), waveActive: options.waveActive(),
      runPhase: options.runPhase(), topComboThreshold: options.topComboThreshold(),
      bossIntroActor: intro?.boss ?? null };
  };
}

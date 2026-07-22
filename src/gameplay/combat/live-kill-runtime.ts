import { CONFIG } from "../../config/game-config";
import { resolveEnemyKill, type KillEnemy, type KillPlayer, type KillProjectile, type KillRun,
  type KillRuntimeOptions } from "./kill-runtime";

type KillCallbacks = Pick<KillRuntimeOptions,
  "addKillScore" | "addStat" | "maxStat" | "bumpDaily" | "bossKillAchievement" |
  "killAchievement" | "checkAchievements" | "bossGhostMoment" | "deathEffect" | "deathSound" |
  "makeDeathEvent" | "fire" | "applySever" | "ring" | "restorePlatforms" | "releaseCamera" |
  "happyTime" | "bossPresentation" | "releaseStolenBlade">;

export interface LiveKillHost extends KillCallbacks {
  enemies(): readonly KillEnemy[];
  projectiles(): readonly KillProjectile[];
  run(): KillRun;
  player(): KillPlayer;
  now(): number;
  stageIndex(): number;
  readonly finalStageIndex: number;
  stageAccent(): string;
  stageChapterBossOutro(): unknown;
  hasStageChapter(): boolean;
  readonly bossRosterSize: number;
  achievementsEnabled(): boolean;
}

/** Adapts live mutable state into one atomic, typed enemy-death transaction. */
export class LiveKillRuntime {
  readonly #host: LiveKillHost;

  constructor(host: LiveKillHost) { this.#host = host; }

  resolve(enemy: KillEnemy, cause?: string): void {
    const host = this.#host;
    resolveEnemyKill({ enemy, ...(cause === undefined ? {} : { cause }), enemies: host.enemies(), projectiles: host.projectiles(),
      run: host.run(), player: host.player(), now: host.now(), stageIndex: host.stageIndex(),
      finalStageIndex: host.finalStageIndex, stageAccent: host.stageAccent(),
      stageChapterBossOutro: host.stageChapterBossOutro(), hasStageChapter: host.hasStageChapter(),
      bossRosterSize: host.bossRosterSize,
      scoring: { scorePerKill: CONFIG.run.scorePerKill, cleanWindow: CONFIG.overrun.cleanWindow },
      colors: { charger: CONFIG.colors.charger, slam: CONFIG.colors.slam },
      deathShards: CONFIG.juice.deathShards, severPulseRadius: CONFIG.sever.pulseRadius,
      achievementsEnabled: host.achievementsEnabled(), addKillScore: host.addKillScore,
      addStat: host.addStat, maxStat: host.maxStat, bumpDaily: host.bumpDaily,
      bossKillAchievement: host.bossKillAchievement, killAchievement: host.killAchievement,
      checkAchievements: host.checkAchievements, bossGhostMoment: host.bossGhostMoment,
      deathEffect: host.deathEffect, deathSound: host.deathSound, makeDeathEvent: host.makeDeathEvent,
      fire: host.fire, applySever: host.applySever, ring: host.ring, restorePlatforms: host.restorePlatforms,
      releaseCamera: host.releaseCamera, happyTime: host.happyTime, bossPresentation: host.bossPresentation,
      releaseStolenBlade: host.releaseStolenBlade });
  }
}

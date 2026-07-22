export interface KillEnemy {
  readonly x: number; readonly y: number; readonly color: string; readonly noScore?: boolean;
  readonly firstPlayerDamageAt?: number | null; readonly affixCount?: number; readonly kind?: string;
  readonly isBoss?: boolean; readonly isMiniBoss?: boolean; readonly bossId?: string;
  readonly severT: number; readonly severTier: number; readonly bleedStacks: number; readonly burnT: number;
  readonly freezeVoid?: boolean; dead: boolean; zones?: readonly unknown[] | undefined;
  applyBleed?(stacks: number): void; applyBurn?(): void;
}

export interface KillRun {
  score: number; wave: number; mult: number; waveKills: number; mode: string;
  _dmgThisWave?: boolean; _bossOnlyKills?: number;
  finalBossDeath?: { x: number; y: number; color?: string };
  _preBossPlatforms?: unknown[] | null; _brokenPlats?: unknown[] | null; _arenaBroken?: unknown[] | null;
  voidDescent?: unknown; voidScroll?: { active: boolean; frozen: boolean } | null;
  pendingBossOutro?: unknown;
  mods: {
    onKill?: unknown; onEnemyDeath?: unknown; onSkillKill?: unknown;
    sever?: number; severPulseLock?: boolean; bleedNova?: boolean; cinderNova?: boolean;
  };
}

export interface KillPlayer { readonly hp: number; readonly maxHp: number }
export interface KillProjectile { readonly owner?: unknown; readonly shock?: boolean; readonly sweeper?: boolean; dead: boolean }

export interface KillRuntimeOptions {
  enemy: KillEnemy; cause?: string; enemies: readonly KillEnemy[]; projectiles: readonly KillProjectile[];
  run: KillRun; player: KillPlayer; now: number; stageIndex: number; finalStageIndex: number;
  stageAccent: string; stageChapterBossOutro?: unknown; hasStageChapter: boolean; bossRosterSize: number;
  scoring: { scorePerKill: number; cleanWindow: number };
  colors: { charger: string; slam: string }; deathShards: number; severPulseRadius: number;
  achievementsEnabled: boolean;
  addKillScore(): void; addStat(name: string, value: number): void; maxStat(name: string, value: number): void;
  bumpDaily(name: string, value: number): void; bossKillAchievement(enemy: KillEnemy): void;
  killAchievement(enemy: KillEnemy): void; checkAchievements(): void;
  bossGhostMoment(enemy: KillEnemy): void;
  deathEffect(enemy: KillEnemy, shards: number): void; deathSound(): void;
  makeDeathEvent(enemy: KillEnemy, cause: string | undefined, cleanElimination: boolean): unknown;
  fire(hooks: unknown, event: unknown): void; applySever(enemy: KillEnemy, tier: number): void;
  ring(x: number, y: number, radius: number, color: string): void;
  restorePlatforms(platforms: unknown[]): void; releaseCamera(): void; happyTime(): void;
  bossPresentation(enemy: KillEnemy, accent: string): void;
  releaseStolenBlade(enemy: KillEnemy): void;
}

/** Applies one enemy-death transaction without changing the caller's enemy ordering. */
export function resolveEnemyKill(options: KillRuntimeOptions): void {
  const { enemy, run } = options;
  if (enemy.noScore) { options.deathEffect(enemy, 8); return; }
  const clean = enemy.firstPlayerDamageAt != null && options.now - enemy.firstPlayerDamageAt <= options.scoring.cleanWindow;
  options.addKillScore();
  if (enemy.affixCount) run.score += Math.round(options.scoring.scorePerKill * run.wave * run.mult * 0.4 * enemy.affixCount);
  if (options.achievementsEnabled) trackKillAchievements(options);
  options.deathEffect(enemy, options.deathShards); options.deathSound();
  const event = options.makeDeathEvent(enemy, options.cause, clean);
  options.fire(run.mods.onKill, event); options.fire(run.mods.onEnemyDeath, event);
  if (options.cause === "skill") options.fire(run.mods.onSkillKill, event);
  spreadDeathStatuses(options);
  if (enemy.isBoss) resolveBossDeath(options);
}

function trackKillAchievements(options: KillRuntimeOptions): void {
  const { enemy, run, player } = options;
  options.addStat("kills", 1);
  if (enemy.kind) options.addStat(`kill_${enemy.kind}`, 1);
  options.maxStat("killsOneWave", run.waveKills); options.bumpDaily("kills", 1);
  if (enemy.kind === "bomber") options.addStat("bomberKills", 1);
  if (enemy.isBoss && !enemy.isMiniBoss) {
    options.addStat("bossKills", 1); options.bumpDaily("boss", 1);
    if (!run._dmgThisWave) options.addStat("bossNoHit", 1);
    if (run.mode === "bossonly") {
      run._bossOnlyKills = (run._bossOnlyKills ?? 0) + 1;
      if (run._bossOnlyKills >= options.bossRosterSize) options.maxStat("gauntletFull", 1);
    }
    if (enemy.bossId) options.maxStat(`kill${enemy.bossId.charAt(0).toUpperCase()}${enemy.bossId.slice(1)}`, 1);
    if (player.hp > 0 && player.hp <= player.maxHp * 0.1) options.maxStat("bossKillsLowHP", 1);
    options.bossKillAchievement(enemy); options.bossGhostMoment(enemy);
  }
  options.killAchievement(enemy); options.checkAchievements();
}

function spreadDeathStatuses(options: KillRuntimeOptions): void {
  const { enemy, run } = options;
  if ((run.mods.sever ?? 0) >= 3 && enemy.severT > 0 && !run.mods.severPulseLock) {
    run.mods.severPulseLock = true;
    for (const other of options.enemies) {
      if (other === enemy || other.dead || Math.hypot(other.x - enemy.x, other.y - enemy.y) > options.severPulseRadius) continue;
      options.applySever(other, other.severT > 0 ? Math.max(1, other.severTier) : 1);
    }
    options.ring(enemy.x, enemy.y, 18, "#b06cff"); run.mods.severPulseLock = false;
  }
  if (run.mods.bleedNova && enemy.bleedStacks > 0) {
    for (const other of options.enemies) if (other !== enemy && !other.dead && Math.hypot(other.x - enemy.x, other.y - enemy.y) < 150) other.applyBleed?.(3);
    options.ring(enemy.x, enemy.y, 12, options.colors.charger);
  }
  if (run.mods.cinderNova && enemy.burnT > 0) {
    for (const other of options.enemies) if (other !== enemy && !other.dead && Math.hypot(other.x - enemy.x, other.y - enemy.y) < 150) other.applyBurn?.();
    options.ring(enemy.x, enemy.y, 12, options.colors.slam);
  }
}

function resolveBossDeath(options: KillRuntimeOptions): void {
  const { enemy, run } = options;
  if (run.mode === "campaign" && enemy.bossId === "source" && options.stageIndex >= options.finalStageIndex)
    run.finalBossDeath = { x: enemy.x, y: enemy.y, color: enemy.color };
  if (run._preBossPlatforms) {
    options.restorePlatforms(run._preBossPlatforms); run._preBossPlatforms = null;
    run._brokenPlats = null; run._arenaBroken = null;
  }
  options.releaseCamera(); run.voidDescent = null; options.happyTime();
  options.bossPresentation(enemy, options.stageAccent);
  for (const projectile of options.projectiles)
    if (projectile.owner === enemy || projectile.shock || projectile.sweeper) projectile.dead = true;
  enemy.zones = [];
  if (enemy.freezeVoid && run.voidScroll) { run.voidScroll.active = false; run.voidScroll.frozen = true; }
  options.releaseStolenBlade(enemy);
  if (run.mode === "campaign" && options.hasStageChapter) run.pendingBossOutro = options.stageChapterBossOutro ?? null;
}

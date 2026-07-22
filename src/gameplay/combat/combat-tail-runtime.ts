export interface TailEnemy {
  dead: boolean; y: number; _gid?: unknown; bleedStacks: number; burnT: number;
}
export interface TailProjectile { dead: boolean; update(dt: number): void }
export interface TailFloater { y: number; life: number }
export interface TailPlayer {
  x: number; y: number; vy: number; hp: number; maxHp: number; iframe: number; onGround: boolean; tookHit: boolean;
  shopRevives: number; abilityRevives: number; oneHit: boolean;
}
export interface TailRun {
  mode: string; runTime: number; waveTime: number; adRevived?: boolean; _prevGround?: boolean; _airT?: number;
  _updraftChain?: number; _achTick?: number; _dmgThisWave?: boolean; _dmgThisRun?: boolean; _dmgThisStage?: boolean;
}
export interface CombatCleanupHooks {
  ghostRecording(): boolean; ghostDeath(enemy: TailEnemy): void; ghostSample(dt: number, enemies: readonly TailEnemy[]): void;
  updateTrick(dt: number): void; breakStreak(): void; jumped(): void; achievementTick(dt: number): void;
  maxStat(name: string, value: number): void; checkAchievements(): void; achievementsEnabled(): boolean;
  updateTutorial(dt: number): void; updatePlayground(): void;
}
export interface CombatCleanupInput {
  dt: number; enemies: readonly TailEnemy[]; projectiles: readonly TailProjectile[]; floaters: readonly TailFloater[];
  shake: number; shakeDecay: number; player: TailPlayer; run: TailRun; hooks: CombatCleanupHooks;
}
export interface CombatCleanupResult {
  enemies: TailEnemy[]; projectiles: TailProjectile[]; floaters: TailFloater[]; shake: number;
}

export function markFallenEnemies(enemies: readonly TailEnemy[], worldBottom: number): void {
  for (const enemy of enemies) if (enemy.y > worldBottom) enemy.dead = true;
}

/** Finalizes one simulation tick after collision side effects have settled. */
export function finalizeCombatTick(input: CombatCleanupInput): CombatCleanupResult {
  const { dt, player, run, hooks } = input;
  if (hooks.ghostRecording()) for (const enemy of input.enemies) if (enemy.dead && enemy._gid) hooks.ghostDeath(enemy);
  const enemies = input.enemies.filter((enemy) => !enemy.dead);
  const projectiles = input.projectiles.filter((projectile) => !projectile.dead);
  for (const projectile of projectiles) projectile.update(dt);
  for (const floater of input.floaters) { floater.y -= 30 * dt; floater.life -= dt; }
  const floaters = input.floaters.filter((floater) => floater.life > 0);
  const shake = input.shake > 0 ? Math.max(0, input.shake - input.shakeDecay * dt) : input.shake;
  run.runTime += dt; run.waveTime += dt; hooks.updateTrick(dt);
  if (player.tookHit) { player.tookHit = false; run._dmgThisWave = true; run._dmgThisRun = true; run._dmgThisStage = true; hooks.breakStreak(); }
  hooks.ghostSample(dt, enemies);
  if (run._prevGround && !player.onGround && player.vy < -100) hooks.jumped();
  run._prevGround = player.onGround;
  if (player.onGround) { run._airT = 0; run._updraftChain = 0; } else run._airT = (run._airT ?? 0) + dt;
  if (hooks.achievementsEnabled()) updateAchievements(dt, enemies, run, hooks);
  if (run.mode === "tutorial") hooks.updateTutorial(dt); else if (run.mode === "playground") hooks.updatePlayground();
  return { enemies, projectiles, floaters, shake };
}

function updateAchievements(dt: number, enemies: readonly TailEnemy[], run: TailRun, hooks: CombatCleanupHooks): void {
  hooks.maxStat("maxAirTime", Math.floor(run._airT ?? 0));
  let maxBleed = 0, burning = 0;
  for (const enemy of enemies) { if (enemy.dead) continue; if (enemy.bleedStacks > maxBleed) maxBleed = enemy.bleedStacks; if (enemy.burnT > 0) burning++; }
  hooks.maxStat("maxBleedStacks", maxBleed); hooks.maxStat("maxConcurrentBurn", burning); hooks.achievementTick(dt);
  run._achTick = (run._achTick ?? 0) + dt;
  if (run._achTick >= 0.5) { run._achTick = 0; hooks.checkAchievements(); }
}

export interface PlayerDeathHooks {
  trainingReset(player: TailPlayer): void; shopRevive(player: TailPlayer): void; abilityRevive(player: TailPlayer): void;
  adAvailable(): boolean; requestAdContinue(): void; endRun(): void;
}
export type PlayerDeathResolution = "alive" | "training-reset" | "shop-revive" | "ability-revive" | "ad-continue" | "run-ended";

/** Resolves the mutually exclusive death ladder in its canonical priority order. */
export function resolvePlayerDeath(player: TailPlayer, run: TailRun, hooks: PlayerDeathHooks): PlayerDeathResolution {
  if (player.hp > 0) return "alive";
  if (run.mode === "tutorial" || run.mode === "playground") { player.hp = player.maxHp; player.iframe = 2; hooks.trainingReset(player); return "training-reset"; }
  if (player.shopRevives > 0 && !player.oneHit) { player.shopRevives--; player.hp = Math.round(player.maxHp * 0.35); player.iframe = 1.6; hooks.shopRevive(player); return "shop-revive"; }
  if (player.abilityRevives > 0 && !player.oneHit) { player.abilityRevives--; player.hp = Math.round(player.maxHp * 0.4); player.iframe = 2; hooks.abilityRevive(player); return "ability-revive"; }
  if (hooks.adAvailable() && !run.adRevived && !player.oneHit) { hooks.requestAdContinue(); return "ad-continue"; }
  hooks.endRun(); return "run-ended";
}

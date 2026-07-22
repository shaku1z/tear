export interface ParryBlade {
  readonly state: string; readonly tipSpeed: number; readonly tipVX: number; readonly tipVY: number;
}
export interface ParryPlayer { guardT: number }
export interface ParryProjectile {
  x: number; y: number; r: number; vx: number; vy: number; dead: boolean; deflected?: boolean; unparryable?: boolean;
  family?: string; sweeperState?: string | null; hitLatch?: boolean; sweeperStyle?: string; mine?: boolean; bomb?: boolean;
  sourceEnemy?: unknown; owner?: unknown; pierce?: boolean; pierced?: Set<unknown> | null;
  sweeperClang(): boolean; counterSweeper(method: string, vx: number, vy: number, speed: number): boolean;
  deflect(vx: number, vy: number, speed: number, perfect: boolean): void;
}
export interface ParryRun {
  weaponId: string;
  mods: Readonly<{ parryGuard?: boolean; deflectPierce?: boolean; deflectSplit?: boolean; tempoSurge?: boolean }>;
  weaponStats: { perfectParries: number };
}
export interface BladeParryTuning {
  deflectMinSpeed: number; perfectSpeed: number; counterParryFactor: number; parryGuardTime: number;
  hitStopSmall: number; hitStopBig: number; shakeSmall: number; shakeBig: number;
  zoomParry: number; zoomBig: number; flashParry: number; bomberBlastRadius: number; bomberBlastDamage: number;
  colors: { perfect: string; deflected: string; bomber: string };
}
export interface BladeParryHooks {
  intersects(projectile: ParryProjectile): boolean; clamp(value: number, min: number, max: number): number;
  lerp(a: number, b: number, t: number): number; nearestEnemy(x: number, y: number): { x: number; y: number } | null;
  burst(x: number, y: number, dx: number, dy: number, count: number, color: string): void;
  ring(x: number, y: number, radius: number, color: string): void; explode(x: number, y: number, color: string, scale: number): void;
  floater(x: number, y: number, text: string, big: boolean, color: string): void;
  areaDamage(x: number, y: number, radius: number, damage: number): void; split(projectile: ParryProjectile): void;
  setHitStop(value: number): void; shake(value: number): void; zoom(value: number): void; flash(value: number): void;
  flare(x: number, y: number, color: string, radius: number, seconds: number): void; slowMotion(): void;
  extendSlowMotion(scale: number): void;
  style(name: string): void; sound(name: "boom" | "counter" | "parry" | "deflect"): void; achievementParry(): void;
  logPerfectParry(source: unknown): void; emitPerfectParry(): void; firePerfectParry(projectile: ParryProjectile): void;
}

/** Resolves held-blade counters in projectile array order before projectile-vs-actor collision. */
export function resolveHeldBladeParries(projectiles: readonly ParryProjectile[], blade: ParryBlade,
  player: ParryPlayer, run: ParryRun, t: BladeParryTuning, hooks: BladeParryHooks): void {
  for (const shot of projectiles) {
    if (shot.dead || blade.state !== "held" || !hooks.intersects(shot)) continue;
    if (shot.family === "sweeper") { resolveSweeper(shot, blade, player, run, t, hooks); continue; }
    if (shot.deflected || shot.unparryable) continue;
    if (shot.mine) { shot.dead = true; hooks.burst(shot.x, shot.y, 0, -1, 6, t.colors.deflected); hooks.floater(shot.x, shot.y - 16, "defused", false, t.colors.deflected); hooks.sound("deflect"); hooks.style("deflect"); continue; }
    if (shot.bomb) { resolveBomb(shot, blade, player, run, t, hooks); continue; }
    if (blade.tipSpeed >= t.deflectMinSpeed) resolveOrdinary(shot, blade, player, run, t, hooks);
  }
}

function counterAlignment(shot: ParryProjectile, blade: ParryBlade, hooks: BladeParryHooks): number {
  const projectileSpeed = Math.hypot(shot.vx, shot.vy) || 1, swingSpeed = blade.tipSpeed || 1;
  return hooks.clamp(blade.tipVX / swingSpeed * (-shot.vx / projectileSpeed) + blade.tipVY / swingSpeed * (-shot.vy / projectileSpeed), 0, 1);
}
function recordPerfect(shot: ParryProjectile, run: ParryRun, hooks: BladeParryHooks): void {
  run.weaponStats.perfectParries++; hooks.logPerfectParry(shot.sourceEnemy ?? shot.owner);
  hooks.emitPerfectParry(); hooks.firePerfectParry(shot);
}

function resolveSweeper(shot: ParryProjectile, blade: ParryBlade, player: ParryPlayer,
  run: ParryRun, t: BladeParryTuning, hooks: BladeParryHooks): void {
  if (shot.sweeperState !== "hostile" || shot.hitLatch) return;
  const counter = counterAlignment(shot, blade, hooks);
  if (blade.tipSpeed < t.deflectMinSpeed || counter < 0.2) {
    if (shot.sweeperClang()) { hooks.burst(shot.x, shot.y, -shot.vx, -shot.vy, 4, shot.sweeperStyle === "shard" ? "#6ef2ff" : "#ff8a32"); hooks.floater(shot.x, shot.y - 18, "CLANG", false, "#b9c0c8"); hooks.setHitStop(t.hitStopSmall * 0.55); hooks.shake(t.shakeSmall * 0.55); }
    return;
  }
  const perfect = blade.tipSpeed >= t.perfectSpeed * hooks.lerp(1, t.counterParryFactor, counter) && counter > 0.7;
  if (!shot.counterSweeper(perfect ? "perfect" : "bat", blade.tipVX, blade.tipVY, blade.tipSpeed)) return;
  const color = perfect ? t.colors.perfect : shot.sweeperStyle === "shard" ? "#6ef2ff" : "#ff8a32";
  hooks.burst(shot.x, shot.y, blade.tipVX, blade.tipVY, perfect ? 14 : 8, color); hooks.ring(shot.x, shot.y, perfect ? 12 : 7, color);
  hooks.floater(shot.x, shot.y - 22, perfect ? "RETURN!" : "BAT!", perfect, color);
  hooks.setHitStop(perfect ? t.hitStopBig : t.hitStopSmall); hooks.shake(perfect ? t.shakeBig : t.shakeSmall); hooks.style(perfect ? "parry" : "deflect");
  if (perfect) { hooks.achievementParry(); hooks.zoom(t.zoomParry * 1.35); hooks.flash(t.flashParry * 1.25); hooks.flare(shot.x, shot.y, color, 480, 0.55); hooks.slowMotion(); if (run.mods.parryGuard) player.guardT = t.parryGuardTime; recordPerfect(shot, run, hooks); }
}

function resolveBomb(shot: ParryProjectile, blade: ParryBlade, player: ParryPlayer,
  run: ParryRun, t: BladeParryTuning, hooks: BladeParryHooks): void {
  if (blade.tipSpeed < t.deflectMinSpeed) return;
  const perfect = blade.tipSpeed >= t.perfectSpeed; shot.dead = true;
  hooks.areaDamage(shot.x, shot.y, t.bomberBlastRadius * (perfect ? 1.7 : 1.2), Math.round(t.bomberBlastDamage * (perfect ? 2.4 : 1.6)));
  hooks.explode(shot.x, shot.y, perfect ? t.colors.perfect : t.colors.bomber, perfect ? 1.95 : 1.5);
  hooks.floater(shot.x, shot.y - 22, perfect ? "DETONATE!" : "SMACK!", perfect, perfect ? t.colors.perfect : t.colors.bomber);
  hooks.setHitStop(t.hitStopBig); hooks.shake(t.shakeBig); hooks.zoom(t.zoomBig); hooks.flash(t.flashParry * (perfect ? 1.3 : 0.8)); hooks.sound("boom"); hooks.style(perfect ? "parry" : "deflect");
  if (perfect) { hooks.achievementParry(); hooks.flare(shot.x, shot.y, t.colors.perfect, 520, 0.6); hooks.slowMotion(); recordPerfect(shot, run, hooks); if (run.mods.parryGuard) player.guardT = t.parryGuardTime; }
}

function resolveOrdinary(shot: ParryProjectile, blade: ParryBlade, player: ParryPlayer,
  run: ParryRun, t: BladeParryTuning, hooks: BladeParryHooks): void {
  const counter = counterAlignment(shot, blade, hooks), perfect = blade.tipSpeed >= t.perfectSpeed * hooks.lerp(1, t.counterParryFactor, counter), full = perfect && counter > 0.7;
  let vx = blade.tipVX, vy = blade.tipVY; const target = perfect ? hooks.nearestEnemy(shot.x, shot.y) : null;
  if (target) { vx = target.x - shot.x; vy = target.y - shot.y; }
  shot.deflect(vx, vy, blade.tipSpeed, perfect);
  if (run.mods.deflectPierce) { shot.pierce = true; shot.pierced = new Set(); }
  if (perfect && run.mods.deflectSplit) hooks.split(shot);
  const color = perfect ? t.colors.perfect : t.colors.deflected; hooks.burst(shot.x, shot.y, vx, vy, perfect ? 12 : 5, color);
  hooks.floater(shot.x, shot.y - 18, full ? "COUNTER!" : perfect ? "PARRY!" : "deflect", perfect, color);
  hooks.setHitStop(perfect ? t.hitStopBig : t.hitStopSmall); hooks.shake(perfect ? t.shakeBig : t.shakeSmall);
  hooks.sound(full ? "counter" : perfect ? "parry" : "deflect"); hooks.style(perfect ? "parry" : "deflect");
  if (!perfect) return;
  hooks.achievementParry(); hooks.zoom(full ? t.zoomParry * 1.4 : t.zoomParry); hooks.flash(full ? t.flashParry * 1.3 : t.flashParry);
  hooks.flare(shot.x, shot.y, color, full ? 460 : 320, full ? 0.55 : 0.4); hooks.slowMotion();
  if (full) hooks.ring(shot.x, shot.y, 10, t.colors.perfect); if (run.mods.parryGuard) player.guardT = t.parryGuardTime; recordPerfect(shot, run, hooks);
  if (run.mods.tempoSurge) hooks.extendSlowMotion(2.4);
}

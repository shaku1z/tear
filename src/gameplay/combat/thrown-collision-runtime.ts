export interface ThrownPlayer {
  x: number; y: number; hp: number; maxHp: number; tempoT: number; tempoStk: number;
  rallySource?: object | null; claimRally(damage: number): number;
}
export interface ThrowEffect {
  mechanic?: string; damageMult?: number; consumeSeam?: boolean; seam?: number; stop?: boolean; redirect?: boolean;
}
export interface ThrownBlade {
  x: number; y: number; vx: number; vy: number; angle: number; state: string; thrown: boolean;
  throwDmg: number; throwBaseDmg?: number; throwId: number; secondaryActive: boolean; circuitEnergy: number;
  throwOrigin?: { x: number; y: number } | null; pierced: Set<object>; anchorTarget?: object | null;
  linkT?: number;
  thrownCollisionSegment(): { x1: number; y1: number; x2: number; y2: number };
  thrownCollisionPad(): number; canHitThrownEnemy(enemy: ThrownEnemy): boolean; channel(name: string): number;
  recordHit(enemy: ThrownEnemy): void; claimImpact(): boolean; forceEmbed(): void;
}
export interface SweeperProjectile {
  x: number; y: number; r: number; vx: number; vy: number; dead: boolean; family?: string;
  sweeperState?: string | null; hitLatch?: boolean; sweeperStyle?: string;
  counterSweeper(method: string, vx: number, vy: number, speed: number): boolean;
}
export interface ThrownEnemy {
  x: number; y: number; radius: number; hp: number; maxHp: number; color: string; dead: boolean; dying: boolean;
  introT?: number; behavior?: string; duelReady?: boolean; duelCd?: number; flash?: number; isBoss?: boolean;
  firstPlayerDamageAt?: number | null; bleedStacks: number; stun: number; anchored: boolean; weight: number;
  vx: number; vy: number; boundT?: number; seamT?: number; seamThrowId?: number;
  blocksDamage(input: { type: "throw" }): boolean; damageTakenMult(): number; hit(damage: number, vx: number, vy: number): number;
  applySeam(seam: number | undefined, throwId: number): void; applyBleed(stacks: number): void; detonateBleed(): number;
  applyBreak?(amount: number): boolean;
}
export interface ThrownRun {
  weaponId: string; mods: {
    berserk?: boolean; tempo?: number; redirect?: boolean; secondPass?: number; impale?: number; impaleAll?: boolean;
    impaleRecall?: boolean; capture?: number; throwRamp?: number; razorStun?: boolean; vortexRecall?: boolean;
  };
  weaponStats: { throwHits: number };
}
export interface ThrownCollisionTuning {
  duelCooldown: number; throwLowMultiplier: number; throwHighMultiplier: number; recallMultiplier: number;
  maxThrowSpeed: number; throwSpeed: number; ringbladeEnemyCost: number; chainbladeBindDuration: number;
  hitStopSmall: number; shakeSmall: number; sparkCount: number;
  colors: { deflected: string; armoredShield: string; perfect: string; charger: string; bladeTrail: string };
}
export interface ThrownCollisionHooks {
  segmentCircle(segment: { x1: number; y1: number; x2: number; y2: number }, x: number, y: number, radius: number): boolean;
  distance(x: number, y: number): number; clamp(value: number, min: number, max: number): number;
  weaponHit(enemy: ThrownEnemy, secondary: boolean, throwId: number): ThrowEffect | null | undefined;
  runDamageMultiplier(): number; noteFirstDamage(enemy: ThrownEnemy, first: boolean): void;
  logHit(throwId: number, damage: number, secondary: boolean, mechanic?: string): void;
  emitResolve(enemy: ThrownEnemy, damage: number): void; onKill(enemy: ThrownEnemy, cause?: string): void;
  burst(x: number, y: number, dx: number, dy: number, count: number, color?: string): void;
  ribbon(x1: number, y1: number, x2: number, y2: number, color: string): void;
  ring(x: number, y: number, radius: number, color: string): void; floater(x: number, y: number, text: string, big: boolean, color?: string): void;
  soundDeflect(): void; shake(amount: number): void; setHitStop(amount: number): void; style(name: string): void;
  achievementsEnabled(): boolean; recordThrowAchievement(enemy: ThrownEnemy, pierces: number, damage: number): void;
  recordPierceKill(): void; fireHit(enemy: ThrownEnemy): void; fireReturnHit(enemy: ThrownEnemy, damage: number): void;
  lobExplode(x: number, y: number): void;
}

/** Resolves sweeper interception followed by thrown-enemy hits in stable array order. */
export function resolveThrownCollisions(
  blade: ThrownBlade, player: ThrownPlayer, enemies: readonly ThrownEnemy[], projectiles: readonly SweeperProjectile[],
  run: ThrownRun, tuning: ThrownCollisionTuning, hooks: ThrownCollisionHooks,
): void {
  if (!blade.thrown || !["flying", "returning", "circuiting", "yanking"].includes(blade.state)) return;
  const segment = blade.thrownCollisionSegment();
  for (const shot of projectiles) {
    if (shot.dead || shot.family !== "sweeper" || shot.sweeperState !== "hostile" || shot.hitLatch) continue;
    if (!hooks.segmentCircle(segment, shot.x, shot.y, shot.r + blade.thrownCollisionPad() + 3)) continue;
    if (shot.counterSweeper("thrown", blade.vx, blade.vy, hooks.distance(blade.vx, blade.vy))) {
      blade.pierced = new Set(); blade.state = "returning";
      const defused = projectileIsDead(shot);
      hooks.burst(shot.x, shot.y, blade.vx, blade.vy, defused ? 10 : 6, shot.sweeperStyle === "shard" ? "#6ef2ff" : "#ff8a32");
      hooks.floater(shot.x, shot.y - 22, defused ? "DEFUSED" : "REDIRECT", true, tuning.colors.deflected);
      hooks.style("deflect"); hooks.setHitStop(tuning.hitStopSmall); hooks.shake(tuning.shakeSmall); break;
    }
  }
  for (const enemy of enemies) {
    if (enemy.dead || enemy.dying || (enemy.introT ?? 0) > 0 || !blade.canHitThrownEnemy(enemy)) continue;
    if (!hooks.segmentCircle(segment, enemy.x, enemy.y, enemy.radius + blade.thrownCollisionPad())) continue;
    if (enemy.blocksDamage({ type: "throw" })) continue;
    if (enemy.behavior === "duelist" && enemy.duelReady) {
      enemy.duelReady = false; enemy.duelCd = tuning.duelCooldown; enemy.flash = 0.12;
      blade.pierced = new Set(); blade.state = "returning";
      hooks.burst(enemy.x, enemy.y, -blade.vx, -blade.vy, 8, tuning.colors.armoredShield);
      hooks.floater(enemy.x, enemy.y - 28, "PARRIED", true, tuning.colors.armoredShield);
      hooks.setHitStop(tuning.hitStopSmall); hooks.shake(tuning.shakeSmall); hooks.soundDeflect(); break;
    }
    if (resolveThrownEnemyHit(blade, player, enemy, enemies, run, tuning, hooks)) break;
  }
}

function resolveThrownEnemyHit(blade: ThrownBlade, player: ThrownPlayer, enemy: ThrownEnemy,
  enemies: readonly ThrownEnemy[], run: ThrownRun, t: ThrownCollisionTuning, hooks: ThrownCollisionHooks): boolean {
  blade.pierced.add(enemy);
  const secondary = blade.state === "returning" || blade.state === "yanking" || blade.secondaryActive;
  const effect = hooks.weaponHit(enemy, secondary, blade.throwId); const highHealth = enemy.hp > enemy.maxHp * 0.5;
  let damage = blade.throwDmg * (blade.state === "returning" ? (highHealth ? t.throwLowMultiplier : t.throwHighMultiplier) : (highHealth ? t.throwHighMultiplier : t.throwLowMultiplier));
  if (blade.state === "returning") damage *= t.recallMultiplier;
  if (secondary) damage *= blade.channel("secondaryPower");
  if (secondary && run.mods.secondPass) damage *= run.mods.secondPass;
  if (effect?.damageMult != null) damage *= effect.damageMult;
  if (run.mods.berserk && player.hp < player.maxHp * 0.5) damage *= 1.25;
  if (player.tempoT > 0 && run.mods.tempo) damage *= 1 + run.mods.tempo * player.tempoStk;
  damage *= hooks.runDamageMultiplier() * enemy.damageTakenMult();
  const first = enemy.firstPlayerDamageAt == null; enemy.hit(damage, blade.vx, blade.vy); hooks.noteFirstDamage(enemy, first);
  blade.recordHit(enemy); run.weaponStats.throwHits++; hooks.logHit(blade.throwId, damage, secondary, effect?.mechanic);
  applyThrowEffect(blade, enemy, effect, t, hooks); hooks.emitResolve(enemy, damage);
  if (player.rallySource === enemy) {
    const healed = player.claimRally(damage);
    if (healed > 0) { hooks.floater(player.x, player.y - 44, `+${String(Math.round(healed))}`, false, "#e8a32e"); hooks.ribbon(enemy.x, enemy.y - 12, player.x, player.y - 10, "#e8a32e"); }
  }
  applyThrowMods(blade, player, enemy, run, t, hooks);
  hooks.burst(enemy.x, enemy.y, blade.vx, blade.vy, t.sparkCount, enemy.color); hooks.floater(enemy.x, enemy.y - 26, Math.round(damage).toString(), true);
  hooks.setHitStop(t.hitStopSmall); hooks.shake(t.shakeSmall); hooks.style(effect?.mechanic === "crosscut" ? "crosscut" : effect?.mechanic === "circuit" ? "circuit" : "throwHit");
  if (hooks.achievementsEnabled()) hooks.recordThrowAchievement(enemy, blade.pierced.size, damage);
  hooks.fireHit(enemy); if (secondary) hooks.fireReturnHit(enemy, damage);
  if (enemy.dead) { if (hooks.achievementsEnabled() && blade.pierced.size >= 2) hooks.recordPierceKill(); hooks.onKill(enemy); }
  if (effect?.stop) {
    if (!blade.claimImpact()) { blade.state = "returning"; return true; }
    if (effect.mechanic === "meteor") { blade.forceEmbed(); hooks.lobExplode(enemy.x, enemy.y); }
    else if (effect.mechanic === "anchor") { blade.anchorTarget = enemy; blade.forceEmbed(); }
    else if (effect.mechanic === "bind") { blade.anchorTarget = enemy; blade.state = "latched"; blade.vx = 0; blade.vy = 0; blade.linkT = t.chainbladeBindDuration * blade.channel("controlDuration"); enemy.boundT = blade.linkT; }
    return true;
  }
  if ((run.mods.redirect || effect?.redirect) && (blade.state === "flying" || blade.state === "circuiting")) redirectBlade(blade, enemies, run, t, hooks);
  return false;
}

function applyThrowEffect(blade: ThrownBlade, enemy: ThrownEnemy, effect: ThrowEffect | null | undefined,
  t: ThrownCollisionTuning, hooks: ThrownCollisionHooks): void {
  if (effect?.mechanic === "seam") enemy.applySeam(effect.seam, blade.throwId);
  else if (effect?.mechanic === "crosscut") {
    if (effect.consumeSeam) { enemy.seamT = 0; enemy.seamThrowId = 0; }
    hooks.ribbon(blade.throwOrigin?.x ?? blade.x, blade.throwOrigin?.y ?? blade.y, enemy.x, enemy.y, t.colors.perfect);
    hooks.floater(enemy.x, enemy.y - 44, "CROSSCUT", true, t.colors.perfect);
  } else if (effect?.mechanic === "circuit") blade.circuitEnergy -= t.ringbladeEnemyCost;
}

function applyThrowMods(blade: ThrownBlade, player: ThrownPlayer, enemy: ThrownEnemy, run: ThrownRun,
  t: ThrownCollisionTuning, hooks: ThrownCollisionHooks): void {
  if (run.mods.impale) {
    if (blade.state === "flying" && (run.mods.impaleAll || blade.pierced.size === 1)) { enemy.applyBleed(run.mods.impale); if (!enemy.isBoss) enemy.stun = Math.max(enemy.stun, 1.2); hooks.ring(enemy.x, enemy.y, 8, t.colors.charger); }
    if (blade.state === "returning" && run.mods.impaleRecall && enemy.bleedStacks > 0) { const dealt = enemy.detonateBleed(); hooks.floater(enemy.x, enemy.y - 32, `RUPTURE ${String(Math.round(dealt))}`, true, t.colors.charger); if (enemy.dead) hooks.onKill(enemy, "skill"); }
  }
  const secondary = blade.state === "returning" || blade.state === "yanking" || blade.secondaryActive;
  if (run.mods.capture && !secondary) { const control = 0.45 + run.mods.capture * 0.25; if (!enemy.isBoss) enemy.stun = Math.max(enemy.stun, control); else enemy.applyBreak?.(18 * run.mods.capture); enemy.boundT = Math.max(enemy.boundT ?? 0, control); }
  if (run.mods.throwRamp) { const scale = 1 + run.mods.throwRamp; blade.throwDmg = Math.min(blade.throwDmg * scale, (blade.throwBaseDmg ?? blade.throwDmg) * 2); const cap = t.maxThrowSpeed * 1.2; blade.vx = hooks.clamp(blade.vx * scale, -cap, cap); blade.vy = hooks.clamp(blade.vy * scale, -cap, cap); }
  if (run.mods.razorStun && !enemy.isBoss) enemy.stun = Math.max(enemy.stun, 0.45);
  if (run.mods.vortexRecall && blade.state === "returning" && !enemy.anchored) { const dx = player.x - enemy.x, dy = player.y - enemy.y, magnitude = hooks.distance(dx, dy) || 1; enemy.vx += dx / magnitude * 720 / enemy.weight; enemy.vy += dy / magnitude * 420 / enemy.weight - 120; hooks.burst(enemy.x, enemy.y, dx, dy, 4, t.colors.perfect); }
}

function redirectBlade(blade: ThrownBlade, enemies: readonly ThrownEnemy[], run: ThrownRun,
  t: ThrownCollisionTuning, hooks: ThrownCollisionHooks): void {
  let target: ThrownEnemy | null = null, nearest = Infinity;
  for (const enemy of enemies) { if (enemy.dead || blade.pierced.has(enemy)) continue; const distance = hooks.distance(enemy.x - blade.x, enemy.y - blade.y); if (distance < nearest) { nearest = distance; target = enemy; } }
  if (!target || nearest >= 700) return;
  const speed = hooks.distance(blade.vx, blade.vy) || t.throwSpeed, dx = target.x - blade.x, dy = target.y - blade.y, magnitude = hooks.distance(dx, dy) || 1;
  blade.vx = dx / magnitude * speed; blade.vy = dy / magnitude * speed; blade.angle = Math.atan2(dy, dx);
  hooks.burst(blade.x, blade.y, dx, dy, 3, t.colors.bladeTrail);
  if (blade.state === "circuiting") blade.circuitEnergy += run.mods.redirect ? 0.45 : 0.12;
}

function projectileIsDead(projectile: SweeperProjectile): boolean { return projectile.dead; }

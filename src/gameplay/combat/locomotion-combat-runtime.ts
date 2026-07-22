export interface LocomotionEnemy {
  x: number; y: number; vx: number; vy: number; hw: number; hh: number; weight: number;
  dead: boolean; hitCd: number; stun: number; isBoss?: boolean; burnT: number;
  hit(damage: number, dx: number, dy: number): void; applyBurn(): void;
}
export interface LocomotionPlayer {
  x: number; y: number; vx: number; vy: number; hw: number; hh: number; onGround: boolean;
  dashTimer: number; dashX: number; dashY: number; dashCharges: number; maxDashCharges: number; dashCd: number;
}
export interface LocomotionBlade { readonly state: string; readonly tipSpeed: number }
export interface LocomotionState { wasDashing: boolean; wasSwinging: boolean; wasOnGround: boolean; dashGhostTime: number; landingVelocity: number; contacts: Set<LocomotionEnemy> }
export interface LocomotionOptions {
  readonly dt: number; readonly player: LocomotionPlayer; readonly blade: LocomotionBlade; readonly enemies: LocomotionEnemy[];
  readonly state: LocomotionState; readonly concussive: number; readonly concussiveStun: boolean; readonly concussiveRefund: boolean;
  readonly phantomDamage: number; readonly phantomRefund: boolean; readonly cinder: boolean;
  readonly maxFall: number; readonly ghostInterval: number; readonly lowGraphics: boolean;
  overlap(player: LocomotionPlayer, enemy: LocomotionEnemy, padding?: number): boolean;
  distance(player: LocomotionPlayer, enemy: LocomotionEnemy): number; aoe(radius: number, damage: number): void;
  dashStarted(): void; dashContact(enemy: LocomotionEnemy): void; swing(speed: number): void;
  ring(x: number, y: number, radius: number, color: "perfect" | "slam" | "ink"): void; burst(x: number, y: number, dx: number, dy: number, count: number, color?: "slam"): void;
  shake(): void; slam(): void; land(): void; ghost(color: "slam" | null): void; ember(x: number, y: number): void; smoke(x: number, y: number): void;
  floater(enemy: LocomotionEnemy, damage: number): void; styleHit(): void; kill(enemy: LocomotionEnemy): void;
  didDie(enemy: LocomotionEnemy): boolean;
}

export function stepLocomotionCombat(options: LocomotionOptions): void {
  const { player, blade, enemies, state } = options;
  if (player.dashTimer > 0 && !state.wasDashing) options.dashStarted();
  if (state.wasDashing && player.dashTimer <= 0 && options.concussive) {
    const radius = 155, caught = enemies.filter((enemy) => !enemy.dead && options.distance(player, enemy) < radius).length;
    options.aoe(radius - 5, options.concussive);
    for (const enemy of enemies) {
      if (enemy.dead || options.distance(player, enemy) >= radius) continue;
      if (options.concussiveStun && !enemy.isBoss) enemy.stun = Math.max(enemy.stun, 0.5);
      const dx = enemy.x - player.x, dy = enemy.y - player.y, magnitude = Math.hypot(dx, dy), divisor = magnitude === 0 ? 1 : magnitude;
      enemy.vx += dx / divisor * 520 / enemy.weight; enemy.vy += dy / divisor * 300 / enemy.weight - 110;
    }
    if (caught > 0) { options.ring(player.x, player.y, 13, "slam"); options.shake(); options.slam(); }
    if (options.concussiveRefund && caught >= 2) { player.dashCharges = player.maxDashCharges; player.dashCd = 0; }
  }
  state.wasDashing = player.dashTimer > 0;
  if (blade.state === "held" && blade.tipSpeed > 1500) { if (!state.wasSwinging) { options.swing(blade.tipSpeed); state.wasSwinging = true; } }
  else if (blade.tipSpeed < 900) state.wasSwinging = false;
  if (player.dashTimer > 0) {
    for (const enemy of enemies) if (!enemy.dead && !state.contacts.has(enemy) && options.overlap(player, enemy)) { state.contacts.add(enemy); options.dashContact(enemy); }
    state.dashGhostTime -= options.dt;
    if (state.dashGhostTime <= 0) { options.ghost(options.cinder ? "slam" : null); state.dashGhostTime = options.ghostInterval; }
    if (options.cinder) { options.ember(player.x, player.y - player.hh * 0.3); options.ember(player.x, player.y + player.hh * 0.2); options.ember(player.x, player.y); }
    if (options.phantomDamage) for (const enemy of enemies) if (!enemy.dead && enemy.hitCd <= 0 && options.overlap(player, enemy)) {
      enemy.hit(options.phantomDamage, player.dashX || 1, player.dashY); options.burst(enemy.x, enemy.y, player.dashX, player.dashY, 5);
      options.floater(enemy, options.phantomDamage); options.styleHit();
      if (options.didDie(enemy)) { options.kill(enemy); if (options.phantomRefund) { player.dashCharges = player.maxDashCharges; player.dashCd = 0; } }
    }
    if (options.cinder) for (const enemy of enemies) if (!enemy.dead && options.overlap(player, enemy, 6)) {
      if (enemy.burnT <= 0) options.burst(enemy.x, enemy.y, 0, -1, 3, "slam"); enemy.applyBurn();
    }
  } else { state.dashGhostTime = 0; state.contacts.clear(); }
  if (player.onGround && !state.wasOnGround && player.vy >= 0) {
    const feet = player.y + player.hh, hard = Math.max(0, Math.min(1, state.landingVelocity / options.maxFall));
    options.burst(player.x, feet, 0, -1, 5 + Math.round(hard * 6));
    if (!options.lowGraphics) { options.smoke(player.x - 12, feet - 2); options.smoke(player.x + 12, feet - 2); if (hard > 0.6) { options.smoke(player.x, feet - 4); options.ring(player.x, feet, 8, "ink"); } }
    options.land();
  }
  state.landingVelocity = player.onGround ? 0 : Math.max(state.landingVelocity, player.vy);
  if (!player.onGround && state.wasOnGround) state.landingVelocity = 0;
  state.wasOnGround = player.onGround;
}

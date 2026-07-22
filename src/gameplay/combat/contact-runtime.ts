export type DamageOutcome = string;

export interface ContactPlayer {
  readonly x: number; readonly y: number; readonly hw: number; readonly hh: number;
  readonly invulnerable: boolean;
  takeDamage(amount: number, sourceX: number, source: unknown): DamageOutcome;
}

export interface ContactEnemy {
  readonly dead: boolean; readonly dying: boolean; readonly spawnT: number; readonly introT?: number;
  readonly x: number; readonly y: number; readonly hw: number; readonly hh: number;
  readonly contactReach: number; readonly contactDmg: number; readonly chargeMult?: number; readonly auraDmg?: number;
  contactDamageEnabled?(player: ContactPlayer): boolean;
  contactDamageAmount?(player: ContactPlayer): number;
  onContactDamage?(outcome: DamageOutcome, player: ContactPlayer): void;
}

export interface HostileBlade {
  x: number; y: number; tipX: number; tipY: number; vx: number; vy: number;
  hostile: boolean; stolenBy: unknown; state: string;
}

export interface ContactRuntimeHooks {
  overlaps(ax: number, ay: number, ahw: number, ahh: number,
    bx: number, by: number, bhw: number, bhh: number): boolean;
  segmentDistance(x1: number, y1: number, x2: number, y2: number, x: number, y: number): number;
  onHit(): void; onAbsorbed(): void;
  onHostileBladeResolved(player: ContactPlayer, blade: HostileBlade): void;
}

function reportDamage(outcome: DamageOutcome, hooks: ContactRuntimeHooks): void {
  if (outcome === "hit") hooks.onHit();
  else if (outcome === "absorbed") hooks.onAbsorbed();
}

/** Resolves actor contact in stable enemy-array order. */
export function resolveEnemyContact(
  enemies: readonly ContactEnemy[], player: ContactPlayer, hooks: ContactRuntimeHooks,
): void {
  for (const enemy of enemies) {
    if (enemy.dead || enemy.dying || enemy.spawnT > 0 || (enemy.introT ?? 0) > 0) continue;
    if (enemy.contactDamageEnabled && !enemy.contactDamageEnabled(player)) continue;
    if (!hooks.overlaps(player.x, player.y, player.hw, player.hh, enemy.x, enemy.y,
      enemy.hw + enemy.contactReach, enemy.hh)) continue;
    const damage = enemy.contactDamageAmount ? enemy.contactDamageAmount(player) : enemy.contactDmg;
    const outcome = player.takeDamage(damage * (enemy.chargeMult ?? 1) * (enemy.auraDmg ?? 1), enemy.x, enemy);
    // Attempts are observable even when iframe/dash protection rejects the damage.
    enemy.onContactDamage?.(outcome, player);
    reportDamage(outcome, hooks);
  }
}

/** Resolves the Source's stolen-blade rule after ordinary enemy contact. */
export function resolveHostileBladeContact(
  blade: HostileBlade | null | undefined, player: ContactPlayer, playerHalfWidth: number,
  damage: number, hooks: ContactRuntimeHooks,
): boolean {
  if (!blade?.hostile || player.invulnerable ||
      hooks.segmentDistance(blade.x, blade.y, blade.tipX, blade.tipY, player.x, player.y) >= playerHalfWidth + 12) return false;
  reportDamage(player.takeDamage(damage, blade.x, blade.stolenBy), hooks);
  blade.hostile = false; blade.stolenBy = null; blade.state = "returning";
  hooks.onHostileBladeResolved(player, blade);
  return true;
}

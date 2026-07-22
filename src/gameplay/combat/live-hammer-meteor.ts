export interface HammerMeteorEnemy {
  readonly dead: boolean; readonly x: number; readonly y: number; readonly radius: number;
  readonly isBoss?: boolean; readonly anchored?: boolean; readonly weight: number;
  vx: number; vy: number; stun: number; applyBreak?(amount: number): void;
}
export interface HammerMeteorBlade {
  vx: number; vy: number; impactVX?: number | null; impactVY?: number | null;
  throwOrigin?: Readonly<{ x: number; y: number }> | null; throwDmg: number;
}
export interface HammerMeteorTuning {
  readonly meteorRadius: number; readonly meteorStun: number; readonly meteorBreak: number;
}
export interface LiveHammerMeteorOptions {
  blade(): HammerMeteorBlade;
  enemies(): readonly HammerMeteorEnemy[];
  tuning(): HammerMeteorTuning;
  maximumThrowSpeed(): number;
  redirect(): boolean;
  slamColor(): string;
  bigShake(): number;
  bigZoom(): number;
  distance(x: number, y: number): number;
  clamp(value: number, minimum: number, maximum: number): number;
  explode(x: number, y: number, color: string, scale: number): void;
  ribbon(x1: number, y1: number, x2: number, y2: number, color: string): void;
  shake(value: number): void;
  zoom(value: number): void;
  boom(): void;
  areaDamage(x: number, y: number, radius: number, damage: number): number;
}

export function bindLiveHammerMeteor(options: LiveHammerMeteorOptions): (x: number, y: number) => void {
  return (x, y) => {
    const blade = options.blade(), tuning = options.tuning();
    const horizontal = blade.impactVX ?? blade.vx, vertical = blade.impactVY ?? blade.vy;
    const impactSpeed = options.distance(horizontal, vertical), downward = Math.max(0, vertical);
    const travel = blade.throwOrigin ? options.distance(x - blade.throwOrigin.x, y - blade.throwOrigin.y) : 0;
    const commitment = options.clamp(impactSpeed / options.maximumThrowSpeed() + downward / 5000 +
      options.clamp(travel / 720, 0, 1) * 0.24, 0.55, 1.35);
    options.explode(x, y, options.slamColor(), 1.25); options.shake(options.bigShake()); options.zoom(options.bigZoom()); options.boom();
    options.areaDamage(x, y, tuning.meteorRadius * commitment, Math.round(blade.throwDmg * 0.72 * commitment));
    for (const enemy of options.enemies()) {
      if (enemy.dead || options.distance(enemy.x - x, enemy.y - y) > tuning.meteorRadius * commitment + enemy.radius) continue;
      enemy.stun = Math.max(enemy.stun, enemy.isBoss ? 0.24 : tuning.meteorStun); enemy.applyBreak?.(tuning.meteorBreak * commitment);
      if (!enemy.anchored) { const dx = enemy.x - x, dy = enemy.y - y, magnitude = options.distance(dx, dy) || 1;
        enemy.vx += dx / magnitude * 780 / enemy.weight; enemy.vy += dy / magnitude * 430 / enemy.weight - 150; }
    }
    if (!options.redirect()) return;
    const cluster = options.enemies().filter((enemy) => !enemy.dead && options.distance(enemy.x - x, enemy.y - y) > tuning.meteorRadius * 0.6)
      .sort((left, right) => options.distance(left.x - x, left.y - y) - options.distance(right.x - x, right.y - y))[0];
    if (!cluster) return;
    options.areaDamage(cluster.x, cluster.y, tuning.meteorRadius * 0.55, Math.round(blade.throwDmg * 0.38));
    options.ribbon(x, y, cluster.x, cluster.y, options.slamColor());
  };
}

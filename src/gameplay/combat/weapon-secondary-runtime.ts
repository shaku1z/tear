export interface SecondaryEnemy {
  x: number; y: number; vx: number; vy: number; radius: number; weight: number; dead: boolean;
  hit(damage: number, vx: number, vy: number): void;
}
export interface SecondaryBlade {
  state: string; x: number; y: number; tipX: number; tipY: number; throwDmg: number; throwId: number;
  anchorTarget?: SecondaryEnemy | null; chainCollided?: Set<SecondaryEnemy>; caughtNew: boolean; embeddedNew: boolean;
  redirectSpent?: boolean; flyTime: number; vx: number; vy: number; impactVX?: number | null; impactVY?: number | null; anchorTerrain?: boolean;
  channel(name: string): number; claimImpact(): boolean;
}
export interface WeaponSecondaryOptions {
  readonly previousState: string; readonly wasReturning: boolean; readonly linkBroken: boolean;
  readonly blade: SecondaryBlade; readonly enemies: SecondaryEnemy[];
  readonly secondPass: number; readonly redirect: boolean; readonly stormBurst: number;
  readonly collisionDamage: number; readonly yankSpeed: number; readonly throwSpeed: number;
  readonly damageMultiplier: number;
  distance(ax: number, ay: number, bx: number, by: number): number;
  aoe(x: number, y: number, radius: number, damage: number): void; ring(x: number, y: number, radius: number): void;
  burst(enemy: SecondaryEnemy, vx: number, vy: number): void; floater(enemy: SecondaryEnemy, text: string): void;
  didDie(enemy: SecondaryEnemy): boolean;
  onKill(enemy: SecondaryEnemy): void; onCatch(): void; onStormBurst(): void;
  worldImpact(): Readonly<{ mechanic?: string }> | null; lobExplode(): void; emitThrowResolve(): void;
  nearestEnemy(): SecondaryEnemy | null;
}

export function stepWeaponSecondary(options: WeaponSecondaryOptions): void {
  const { blade } = options;
  if (options.previousState === "reeling" && blade.state === "returning" && !options.linkBroken) {
    const damage = blade.throwDmg * 0.55 * blade.channel("secondaryPower") * options.secondPass;
    options.aoe(blade.x, blade.y, 105, damage); options.ring(blade.x, blade.y, 12);
  }
  if (blade.state === "yanking" && blade.anchorTarget && !blade.anchorTarget.dead) {
    const dragged = blade.anchorTarget;
    for (const other of options.enemies) {
      if (other === dragged || other.dead || blade.chainCollided?.has(other)) continue;
      if (options.distance(other.x, other.y, dragged.x, dragged.y) > other.radius + dragged.radius) continue;
      blade.chainCollided?.add(other);
      const damage = options.collisionDamage * blade.channel("secondaryPower") * options.secondPass * options.damageMultiplier;
      other.hit(damage, dragged.vx, dragged.vy); dragged.hit(damage * 0.35, -dragged.vx, -dragged.vy);
      options.burst(other, dragged.vx, dragged.vy); options.floater(other, `COLLISION ${String(Math.round(damage))}`);
      if (options.didDie(other)) options.onKill(other);
      if (options.redirect) {
        const next = options.enemies.filter((enemy) => enemy !== dragged && enemy !== other && !enemy.dead)
          .sort((left, right) => options.distance(left.x, left.y, dragged.x, dragged.y) - options.distance(right.x, right.y, dragged.x, dragged.y))[0];
        if (next) { const dx = next.x - dragged.x, dy = next.y - dragged.y, length = Math.hypot(dx, dy) || 1;
          dragged.vx = dx / length * options.yankSpeed; dragged.vy = dy / length * options.yankSpeed; }
      }
    }
  }
  if (blade.caughtNew) { blade.caughtNew = false; options.onCatch(); }
  if (options.wasReturning && blade.state === "held" && options.stormBurst) options.onStormBurst();
  if (!blade.embeddedNew) return;
  blade.embeddedNew = false;
  const impact = options.worldImpact();
  if (impact?.mechanic === "meteor" && blade.claimImpact()) { options.lobExplode(); options.emitThrowResolve(); }
  else if (impact?.mechanic === "anchorTerrain") {
    if (options.redirect && !blade.redirectSpent) {
      blade.redirectSpent = true; blade.state = "flying"; blade.flyTime = 0;
      const target = options.nearestEnemy(), dx = target ? target.x - blade.x : -(blade.impactVX ?? 1);
      const dy = target ? target.y - blade.y : -(blade.impactVY ?? 0), magnitude = Math.hypot(dx, dy), divisor = magnitude === 0 ? 1 : magnitude;
      blade.vx = dx / divisor * options.throwSpeed * blade.channel("throwSpeed"); blade.vy = dy / divisor * options.throwSpeed * blade.channel("throwSpeed");
    } else if (blade.claimImpact()) blade.anchorTerrain = true;
  }
}

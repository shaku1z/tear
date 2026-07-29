export interface SecondaryEnemy {
  x: number; y: number; vx: number; vy: number; radius: number; weight: number; dead: boolean;
  hit(damage: number, vx: number, vy: number): void;
}
export interface SecondaryBlade {
  state: string; x: number; y: number; tipX: number; tipY: number; throwDmg: number; throwId: number;
  hookTarget?: SecondaryEnemy | null; slingCollided?: Set<SecondaryEnemy>; caughtNew: boolean; embeddedNew: boolean;
  redirectSpent?: boolean; flyTime: number; vx: number; vy: number; impactVX?: number | null; impactVY?: number | null;
  channel(name: string): number; claimImpact(): boolean;
}
export interface WeaponSecondaryOptions {
  readonly previousState: string; readonly wasReturning: boolean; readonly linkBroken: boolean;
  readonly blade: SecondaryBlade; readonly enemies: SecondaryEnemy[];
  readonly secondPass: number; readonly redirect: boolean; readonly stormBurst: number;
  readonly collisionDamage: number; readonly slingSpeed: number; readonly throwSpeed: number;
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
  if (blade.state === "hooked" && blade.hookTarget && !blade.hookTarget.dead) {
    const dragged = blade.hookTarget;
    for (const other of options.enemies) {
      if (other === dragged || other.dead || blade.slingCollided?.has(other)) continue;
      if (options.distance(other.x, other.y, dragged.x, dragged.y) > other.radius + dragged.radius) continue;
      blade.slingCollided?.add(other);
      const damage = options.collisionDamage * blade.channel("secondaryPower") * options.secondPass * options.damageMultiplier;
      other.hit(damage, dragged.vx, dragged.vy); dragged.hit(damage * 0.35, -dragged.vx, -dragged.vy);
      options.burst(other, dragged.vx, dragged.vy); options.floater(other, `COLLISION ${String(Math.round(damage))}`);
      if (options.didDie(other)) options.onKill(other);
      if (options.redirect) {
        const next = options.enemies.filter((enemy) => enemy !== dragged && enemy !== other && !enemy.dead)
          .sort((left, right) => options.distance(left.x, left.y, dragged.x, dragged.y) - options.distance(right.x, right.y, dragged.x, dragged.y))[0];
        if (next) { const dx = next.x - dragged.x, dy = next.y - dragged.y, length = Math.hypot(dx, dy) || 1;
          dragged.vx = dx / length * options.slingSpeed; dragged.vy = dy / length * options.slingSpeed; }
      }
    }
  }
  if (blade.caughtNew) { blade.caughtNew = false; options.onCatch(); }
  if (options.wasReturning && blade.state === "held" && options.stormBurst) options.onStormBurst();
  if (!blade.embeddedNew) return;
  blade.embeddedNew = false;
  const impact = options.worldImpact();
  if (impact?.mechanic === "meteor" && blade.claimImpact()) { options.lobExplode(); options.emitThrowResolve(); }
}

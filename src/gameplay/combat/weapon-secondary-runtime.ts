export interface SecondaryEnemy {
  x: number; y: number; vx: number; vy: number; radius: number; weight: number; dead: boolean;
  hit(damage: number, vx: number, vy: number): void;
}
export interface SecondaryBlade {
  state: string; x: number; y: number; tipX: number; tipY: number; throwDmg: number; throwId: number;
  hookTarget?: SecondaryEnemy | null; slingCollided?: Set<SecondaryEnemy>; caughtNew: boolean; embeddedNew: boolean;
  redirectSpent?: boolean; flyTime: number; vx: number; vy: number; impactVX?: number | null; impactVY?: number | null;
  channel(name: string): number; claimImpact(): boolean;
  slingWorldCooldown?: number;
}
export interface SecondaryPlatform { x: number; y: number; w: number; h: number }
export interface WeaponSecondaryOptions {
  readonly previousState: string; readonly wasReturning: boolean; readonly linkBroken: boolean;
  readonly blade: SecondaryBlade; readonly enemies: SecondaryEnemy[];
  readonly secondPass: number; readonly redirect: boolean; readonly stormBurst: number;
  readonly collisionDamage: number; readonly slingSpeed: number; readonly throwSpeed: number;
  readonly damageMultiplier: number;
  readonly dt: number; readonly platforms: readonly SecondaryPlatform[];
  readonly width: number; readonly groundY: number; readonly worldCollisionCooldown: number;
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
  blade.slingWorldCooldown = Math.max(0, (blade.slingWorldCooldown ?? 0) - options.dt);
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
    const speed = Math.hypot(dragged.vx, dragged.vy);
    if ((blade.slingWorldCooldown ?? 0) <= 0 && speed >= 500) {
      let normalX = 0, normalY = 0, collided = false;
      if (dragged.x - dragged.radius <= 0) { normalX = 1; collided = true; }
      else if (dragged.x + dragged.radius >= options.width) { normalX = -1; collided = true; }
      else if (dragged.y + dragged.radius >= options.groundY) { normalY = -1; collided = true; }
      if (!collided) for (const platform of options.platforms) {
        const closestX = Math.max(platform.x, Math.min(dragged.x, platform.x + platform.w));
        const closestY = Math.max(platform.y, Math.min(dragged.y, platform.y + platform.h));
        const dx = dragged.x - closestX, dy = dragged.y - closestY;
        if (dx * dx + dy * dy > dragged.radius * dragged.radius) continue;
        if (Math.abs(dx) > Math.abs(dy)) normalX = Math.sign(dx) || (dragged.x < platform.x + platform.w / 2 ? -1 : 1);
        else normalY = Math.sign(dy) || (dragged.y < platform.y + platform.h / 2 ? -1 : 1);
        collided = true; break;
      }
      if (collided) {
        const damage = options.collisionDamage * 0.75 * blade.channel("secondaryPower")
          * options.secondPass * options.damageMultiplier;
        dragged.hit(damage, normalX * speed, normalY * speed);
        const dot = dragged.vx * normalX + dragged.vy * normalY;
        dragged.vx = (dragged.vx - 1.6 * dot * normalX) * 0.58;
        dragged.vy = (dragged.vy - 1.6 * dot * normalY) * 0.58;
        blade.slingWorldCooldown = options.worldCollisionCooldown;
        options.burst(dragged, normalX * speed, normalY * speed);
        options.floater(dragged, `IMPACT ${String(Math.round(damage))}`);
        if (options.didDie(dragged)) options.onKill(dragged);
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

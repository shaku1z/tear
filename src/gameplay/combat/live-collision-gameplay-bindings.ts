import type { CombatEntityRuntimeHooks } from "./combat-entity-runtime";
import type { AttackPresentationCueSink } from "./attack-presentation-cue";

interface CollisionEnemy {
  x: number; y: number; hp: number; dead: boolean; stun: number; isBoss?: boolean;
  firstPlayerDamageAt?: number | null;
  damageTakenMult(): number;
  hit(damage: number, dx: number, dy: number): unknown;
}
interface CollisionBlade {
  swingId: number; attackId: number; throwId: number; throwDmg: number; throwBaseDmg?: number;
  vx: number; vy: number;
}
type Hit = Parameters<NonNullable<CombatEntityRuntimeHooks["weaponProjectileHit"]>>[2];
type Hook = "onHit" | "onSwingHit" | "onSlam" | "onReturnHit" | "onParry" | "onPerfectParry" | "onReflectedHit";

/** Native gameplay event bodies, shared by live and detached collision hosts. */
export function createLiveCollisionGameplayBindings<Enemy extends CollisionEnemy, Event>(ports: {
  run(): { weaponId: string; mods: { secondPass?: number; throwRamp?: number; razorStun?: boolean } };
  blade(): CollisionBlade;
  simulationSeconds(): number;
  makeEvent(x: number, y: number, enemy: Enemy | null, cause?: string, detail?: Readonly<Record<string, unknown>>): Event;
  dispatch(name: Hook, event: Event): void;
  applySever: unknown;
  damageMultiplier(): number;
  noteFirstDamage(enemy: Enemy, first: boolean): void;
  emitThrowResolve(enemy: Enemy, damage: number): void;
  maximumThrowSpeed(): number; projectileSpeed(): number; perfectColor(): string;
  clamp(value: number, minimum: number, maximum: number): number;
  weaponEffect(weaponId: string, effect: string): void;
  presentAttack: AttackPresentationCueSink["emit"];
  floater(x: number, y: number, text: string, big: boolean, color: string): void;
  log(type: string, detail: Readonly<Record<string, unknown>>): void;
  resolveKill(enemy: Enemy, cause: string): void;
}) {
  const ids = () => ({ weaponId: ports.run().weaponId, swingId: ports.blade().swingId,
    attackId: ports.blade().attackId, throwId: ports.blade().throwId });
  return {
    environmentTick: () => Math.max(0, Math.round(ports.simulationSeconds() * 120)),
    makeHitEvent: (enemy: Enemy, x: number, y: number) => { ports.dispatch("onHit", ports.makeEvent(x, y, enemy, "hit", ids())); },
    makeSwingEvent: (enemy: Enemy, x: number, y: number, damage: number, quality: number, mechanic?: string) => {
      ports.dispatch("onSwingHit", ports.makeEvent(x, y, enemy, "swing", { type: "swingHit", damageDealt: damage, quality, mechanic, ...ids() }));
    },
    makeSlamEvent: (enemy: Enemy) => { ports.dispatch("onSlam", ports.makeEvent(enemy.x, enemy.y, enemy)); },
    makeReturnEvent: (enemy: Enemy, damage: number) => {
      ports.dispatch("onReturnHit", ports.makeEvent(enemy.x, enemy.y, enemy, "secondary", {
        type: "returnHit", throwId: ports.blade().throwId, weaponId: ports.run().weaponId,
        attackId: ports.blade().attackId, damageDealt: damage }));
    },
    makePerfectParryEvent: (shot: { x: number; y: number; sourceEnemy?: unknown; owner?: unknown }) => {
      const event = ports.makeEvent(shot.x, shot.y, null, "parry", { type: "perfectParry",
        sourceEnemy: shot.sourceEnemy ?? shot.owner, projectile: shot, applySever: ports.applySever });
      ports.dispatch("onParry", event); ports.dispatch("onPerfectParry", event);
    },
    reflectedHit: (enemy: Enemy, shot: unknown, source: unknown) => {
      ports.dispatch("onReflectedHit", ports.makeEvent(enemy.x, enemy.y, enemy, "reflected",
        { projectile: shot, sourceEnemy: source, applySever: ports.applySever }));
    },
    weaponProjectileHit: (projectile: { x: number; y: number; dead: boolean }, enemy: Enemy, hit: Hit) => {
      let damage = hit.damage;
      if (hit.secondary && Number(ports.run().mods.secondPass)) damage *= Number(ports.run().mods.secondPass);
      // Preserve native pre-multiplication AND the enemy's own hit resistance.
      damage *= ports.damageMultiplier() * enemy.damageTakenMult();
      const first = enemy.firstPlayerDamageAt == null, priorHp = enemy.hp;
      enemy.hit(damage, hit.dx, hit.dy);
      if (enemy.hp < priorHp) ports.weaponEffect(hit.weaponId, hit.secondary ? "backblastRoundHit" : "razorRoundHit");
      ports.noteFirstDamage(enemy, first);
      const event = ports.makeEvent(enemy.x, enemy.y, enemy, hit.secondary ? "secondary" : "weaponProjectile", {
        type: "weaponProjectileHit", weaponId: hit.weaponId, attackId: hit.attackId,
        throwId: hit.throwId, remote: hit.remote, secondary: hit.secondary, damageDealt: damage });
      ports.dispatch("onHit", event);
      if (hit.secondary) ports.dispatch("onReturnHit", event);
      if (hit.remote) {
        ports.emitThrowResolve(enemy, damage);
        const ramp = Number(ports.run().mods.throwRamp) || 0;
        if (ramp > 0) {
          const scale = 1 + ramp, weapon = ports.blade();
          weapon.throwDmg = Math.min(weapon.throwDmg * scale, (weapon.throwBaseDmg ?? weapon.throwDmg) * 2);
          const speed = Math.hypot(weapon.vx, weapon.vy), cap = ports.maximumThrowSpeed() * 1.2;
          if (speed > 0) { const next = Math.min(cap, speed * scale); weapon.vx = weapon.vx / speed * next; weapon.vy = weapon.vy / speed * next; }
        }
      }
      if (ports.run().mods.razorStun && !enemy.isBoss) enemy.stun = Math.max(enemy.stun, 0.45);
      ports.presentAttack({ weaponId: "riftlock", attackId: hit.attackId, throwId: hit.throwId,
        action: "projectile", phase: "contact", variant: hit.secondary ? "backblastRound" : "razorRound",
        sourceX: projectile.x, sourceY: projectile.y, x: enemy.x, y: enemy.y,
        directionX: hit.dx, directionY: hit.dy, normalX: -hit.dx, normalY: -hit.dy, material: "flesh",
        intensity: ports.clamp(Math.hypot(hit.dx, hit.dy) / Math.max(1, ports.projectileSpeed()), 0, 1) });
      ports.floater(enemy.x, enemy.y - 28, String(Math.round(damage)), true, ports.perfectColor());
      ports.log(hit.secondary ? "backblastRoundHit" : "razorRoundHit", { attackId: hit.attackId, throwId: hit.throwId, remote: hit.remote, damage });
      projectile.dead = true;
      if (enemy.dead) ports.resolveKill(enemy, "skill");
    },
  };
}

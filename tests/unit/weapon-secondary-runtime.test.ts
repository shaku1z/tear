import { describe, expect, it, vi } from "vitest";

import { stepWeaponSecondary, type SecondaryBlade, type SecondaryEnemy } from "../../src/gameplay/combat/weapon-secondary-runtime";

describe("weapon secondary runtime", () => {
  it("turns a hooked Chainblade target's platform impact into bounded player-owned collision damage", () => {
    const hit = vi.fn();
    const target: SecondaryEnemy = { x: 100, y: 92, vx: 900, vy: 800, radius: 18, weight: 1, dead: false, hit };
    const blade: SecondaryBlade = {
      state: "hooked", x: 0, y: 0, tipX: 0, tipY: 0, throwDmg: 30, throwId: 1,
      hookTarget: target, slingCollided: new Set<SecondaryEnemy>(), caughtNew: false, embeddedNew: false,
      flyTime: 0, vx: 0, vy: 0, channel: () => 1, claimImpact: () => true,
      slingWorldCooldown: 0,
    };
    stepWeaponSecondary({
      previousState: "hooked", wasReturning: false, linkBroken: false, blade, enemies: [target],
      secondPass: 1, redirect: false, stormBurst: 0, collisionDamage: 28, slingSpeed: 1650,
      throwSpeed: 1900, damageMultiplier: 1, dt: 1 / 120,
      platforms: [{ x: 50, y: 100, w: 150, h: 20 }], width: 1600, groundY: 800,
      worldCollisionCooldown: 0.16,
      distance: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
      aoe: vi.fn(), ring: vi.fn(), burst: vi.fn(), floater: vi.fn(), didDie: () => false,
      onKill: vi.fn(), onCatch: vi.fn(), onStormBurst: vi.fn(), worldImpact: () => null,
      lobExplode: vi.fn(), emitThrowResolve: vi.fn(), nearestEnemy: () => null,
    });
    expect(hit).toHaveBeenCalledOnce();
    expect(hit.mock.calls[0]?.[0]).toBeCloseTo(21);
    expect(blade.slingWorldCooldown).toBeCloseTo(0.16);
    expect(target.vy).toBeLessThan(0);
  });
});

import { describe, expect, it, vi } from "vitest";
import { resolveHeldBladeParries, type BladeParryHooks, type BladeParryTuning,
  type ParryProjectile } from "../../src/gameplay/combat/blade-parry-runtime";

const tuning: BladeParryTuning = { deflectMinSpeed: 10, perfectSpeed: 20, counterParryFactor: 0.5,
  parryGuardTime: 1, hitStopSmall: 0.1, hitStopBig: 0.2, shakeSmall: 1, shakeBig: 2,
  zoomParry: 3, zoomBig: 4, flashParry: 5, bomberBlastRadius: 20, bomberBlastDamage: 10,
  colors: { perfect: "p", deflected: "d", bomber: "b" } };
function shot(patch: Partial<ParryProjectile> = {}): ParryProjectile {
  return { x: 0, y: 0, r: 2, vx: -10, vy: 0, dead: false, sweeperClang: () => true,
    counterSweeper: () => true, deflect: vi.fn(), ...patch };
}
function hooks(): BladeParryHooks {
  return { intersects: () => true, clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    lerp: (a, b, t) => a + (b - a) * t, nearestEnemy: () => null, burst: vi.fn(), ring: vi.fn(),
    explode: vi.fn(), floater: vi.fn(), areaDamage: vi.fn(), split: vi.fn(), setHitStop: vi.fn(),
    shake: vi.fn(), zoom: vi.fn(), flash: vi.fn(), flare: vi.fn(), slowMotion: vi.fn(), extendSlowMotion: vi.fn(), style: vi.fn(),
    sound: vi.fn(), achievementParry: vi.fn(), logPerfectParry: vi.fn(), emitPerfectParry: vi.fn(), firePerfectParry: vi.fn() };
}

describe("held-blade parry runtime", () => {
  it("defuses mines without treating them as reflected shots", () => {
    const deflect = vi.fn(); const projectile = shot({ mine: true, deflect }); const fx = hooks();
    resolveHeldBladeParries([projectile], { state: "held", tipSpeed: 30, tipVX: 30, tipVY: 0 },
      { guardT: 0 }, { weaponId: "tear", mods: {}, weaponStats: { perfectParries: 0 } }, tuning, fx);
    expect(projectile.dead).toBe(true); expect(deflect).not.toHaveBeenCalled();
  });

  it("records a perfect counter once and grants parry guard", () => {
    const projectile = shot(); const player = { guardT: 0 }; const run = { weaponId: "tear", mods: { parryGuard: true }, weaponStats: { perfectParries: 0 } };
    const firePerfect = vi.fn(); const fx = hooks(); fx.firePerfectParry = firePerfect;
    resolveHeldBladeParries([projectile], { state: "held", tipSpeed: 30, tipVX: 30, tipVY: 0 }, player, run, tuning, fx);
    expect(run.weaponStats.perfectParries).toBe(1); expect(player.guardT).toBe(1); expect(firePerfect).toHaveBeenCalledOnce();
  });
});

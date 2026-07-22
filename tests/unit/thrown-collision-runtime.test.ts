import { describe, expect, it, vi } from "vitest";
import { resolveThrownCollisions, type ThrownBlade, type ThrownCollisionHooks,
  type ThrownCollisionTuning, type ThrownEnemy, type ThrownPlayer, type ThrownRun } from "../../src/gameplay/combat/thrown-collision-runtime";

const tuning: ThrownCollisionTuning = { duelCooldown: 2, throwLowMultiplier: 0.8, throwHighMultiplier: 1.2,
  recallMultiplier: 1, maxThrowSpeed: 900, throwSpeed: 500, ringbladeEnemyCost: 1, chainbladeBindDuration: 2,
  hitStopSmall: 0.1, shakeSmall: 2, sparkCount: 4,
  colors: { deflected: "d", armoredShield: "a", perfect: "p", charger: "c", bladeTrail: "t" } };

function blade(): ThrownBlade {
  const hit = vi.fn();
  return { x: 0, y: 0, vx: 100, vy: 0, angle: 0, state: "flying", thrown: true, throwDmg: 10,
    throwBaseDmg: 10, throwId: 1, secondaryActive: false, circuitEnergy: 0, pierced: new Set(),
    thrownCollisionSegment: () => ({ x1: 0, y1: 0, x2: 20, y2: 0 }), thrownCollisionPad: () => 2,
    canHitThrownEnemy: () => true, channel: () => 1, recordHit: hit, claimImpact: () => true, forceEmbed: vi.fn() };
}
function enemy(patch: Partial<ThrownEnemy> = {}): ThrownEnemy {
  return { x: 10, y: 0, radius: 3, hp: 10, maxHp: 20, color: "red", dead: false, dying: false,
    introT: 0, isBoss: false, bleedStacks: 0, stun: 0, anchored: false, weight: 1, vx: 0, vy: 0,
    blocksDamage: () => false, damageTakenMult: () => 1, hit: vi.fn(() => 10), applySeam: vi.fn(),
    applyBleed: vi.fn(), detonateBleed: vi.fn(() => 0), ...patch };
}
function hooks(): ThrownCollisionHooks {
  return { segmentCircle: () => true, distance: Math.hypot, clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    weaponHit: () => null, runDamageMultiplier: () => 1, noteFirstDamage: vi.fn(), logHit: vi.fn(),
    emitResolve: vi.fn(), onKill: vi.fn(), burst: vi.fn(), ribbon: vi.fn(), ring: vi.fn(), floater: vi.fn(),
    soundDeflect: vi.fn(), shake: vi.fn(), setHitStop: vi.fn(), style: vi.fn(), achievementsEnabled: () => false,
    recordThrowAchievement: vi.fn(), recordPierceKill: vi.fn(), fireHit: vi.fn(), fireReturnHit: vi.fn(), lobExplode: vi.fn() };
}
const player: ThrownPlayer = { x: 0, y: 0, hp: 10, maxHp: 10, tempoT: 0, tempoStk: 0, claimRally: () => 0 };
const run: ThrownRun = { weaponId: "tear", mods: {}, weaponStats: { throwHits: 0 } };

describe("thrown collision runtime", () => {
  it("lets a duelist parry before damage and immediately recalls the weapon", () => {
    const weapon = blade(); const hit = vi.fn(() => 10);
    const foe = enemy({ behavior: "duelist", duelReady: true, hit }); const fx = hooks();
    resolveThrownCollisions(weapon, player, [foe], [], run, tuning, fx);
    expect(weapon.state).toBe("returning"); expect(foe.duelReady).toBe(false); expect(hit).not.toHaveBeenCalled();
  });

  it("redirects a hostile sweeper before resolving enemy hits", () => {
    const weapon = blade(); const events: string[] = []; const fx = hooks();
    fx.style = () => events.push("sweeper");
    const shot = { x: 4, y: 0, r: 2, vx: -1, vy: 0, dead: false, family: "sweeper", sweeperState: "hostile",
      counterSweeper: vi.fn(() => true) };
    resolveThrownCollisions(weapon, player, [], [shot], run, tuning, fx);
    expect(events).toEqual(["sweeper"]); expect(weapon.state).toBe("returning"); expect(shot.counterSweeper).toHaveBeenCalledOnce();
  });

  it("stops the enemy pass after a weapon-owned impact claim", () => {
    const weapon = blade(); const firstHit = vi.fn(() => 1); const secondHit = vi.fn(() => 1);
    const first = enemy({ x: 5, hit: firstHit }); const second = enemy({ x: 10, hit: secondHit }); const fx = hooks();
    fx.weaponHit = () => ({ stop: true, mechanic: "anchor" });
    resolveThrownCollisions(weapon, player, [first, second], [], run, tuning, fx);
    expect(firstHit).toHaveBeenCalledOnce(); expect(secondHit).not.toHaveBeenCalled(); expect(weapon.anchorTarget).toBe(first);
  });
});

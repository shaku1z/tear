import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { clamp, len, lerp, lerpAngle } from "../../src/domain/geometry";
import { createBlade } from "../../src/gameplay/entities/blade";
import { WEAPONS, getWeapon } from "../../src/gameplay/weapons";

function makeBlade(weaponId: "sword" | "hammer" | "greatsword" | "chainblade" | "riftlock") {
  const config = structuredClone(CONFIG);
  const clock = { sim: 0 };
  const input = {
    touchAim: false,
    stickAim: null,
    locked: false,
    mouseX: 0,
    mouseY: 0,
    tetherHeld: false,
    consumeDelta: () => ({ x: 0, y: 0 }),
  };
  const Blade = createBlade({
    CLOCK: clock,
    CONFIG: config,
    Input: input,
    presentation: { draw: () => undefined },
    clamp,
    len,
    lerp,
    lerpAngle,
  });
  const blade = new Blade();
  const weapon = getWeapon(weaponId);
  blade.weapon = weapon;
  blade.model = weapon.model;
  weapon.onReset?.({ blade });
  return { blade, clock, config, input, weapon };
}

describe("Final Five weapon roster", () => {
  it("contains exactly the canonical five typed weapon definitions", () => {
    expect(WEAPONS.map((weapon) => weapon.id)).toEqual([
      "sword", "hammer", "greatsword", "chainblade", "riftlock",
    ]);
    for (const weapon of WEAPONS) {
      expect(weapon.throwCollisionPad).toBeGreaterThan(0);
      expect(weapon.tags).toHaveLength(3);
      expect(weapon.weaknesses.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("requires a distinct, exited opposite swing for Sword Reversal", () => {
    const { blade, clock, config } = makeBlade("sword");
    blade.swingId = 1;
    blade.tipX = 0;
    blade.tipY = 0;
    blade.tipVX = 900;
    blade.tipVY = 0;
    expect(blade.resolveReversal()).toBe("armed");

    blade.tipX = config.weapons.sword.reversalExitRadius + 1;
    blade._updateReversalState();
    blade.swingId = 2;
    blade.tipVX = -900;
    expect(blade.resolveReversal()).toBe("reversal");
    expect(blade.resolveReversal()).toBe("armed");
    expect(clock.sim).toBe(0);
  });

  it("returns Sword Threadcut through captured throw-hit waypoints in reverse order", () => {
    const { blade } = makeBlade("sword");
    const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1 };
    blade.state = "flying";
    blade.recordHit({ x: 40, y: 0 } as never);
    blade.recordHit({ x: 80, y: 0 } as never);
    blade.throwOrigin = { x: -100, y: 0 };
    blade.x = 80;
    blade.y = 0;
    blade.freeRecall = true;

    expect(blade._beginReturn(player, { retrace: true })).toBe("recalled");
    blade._updateStandardThrown(1 / 60, player, [], true);
    expect(blade.threadcutIndex).toBe(0);
    blade._updateStandardThrown(1 / 60, player, [], true);
    expect(blade.vx).toBeLessThan(0);
  });

  it("makes Greatsword contact near the hilt intentionally weaker", () => {
    const { blade } = makeBlade("greatsword");
    blade.x = 0;
    blade.y = 0;
    blade.tipX = 100;
    blade.tipY = 0;

    expect(blade.heldDamageMultiplierAt(0, 0)).toBeLessThan(blade.heldDamageMultiplierAt(100, 0));
    expect(blade.heldDamageMultiplierAt(100, 0)).toBe(1);
  });

  it("hooks with Chainblade and reserves the sling route for the secondary action", () => {
    const { blade, weapon } = makeBlade("chainblade");
    const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1 };
    const hook = weapon.onThrowHit({
      blade,
      player,
      platforms: [],
      dt: 1 / 60,
      enemy: { seamT: 0 },
      quality: 1,
      damage: 10,
      secondary: false,
    });
    const sling = weapon.onThrowHit({
      blade,
      player,
      platforms: [],
      dt: 1 / 60,
      enemy: { seamT: 0 },
      quality: 1,
      damage: 10,
      secondary: true,
    });

    expect(hook).toMatchObject({ mechanic: "hook", stop: true });
    expect(sling).toMatchObject({ mechanic: "sling" });
  });

  it("steers a hooked Chainblade target in a bounded orbit and releases it tangentially", () => {
    const { blade, input, config } = makeBlade("chainblade");
    const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1 };
    const target = {
      x: 150, y: 0, vx: 0, vy: 0, radius: 16, weight: 1, stun: 0,
      dead: false, dying: false, isBoss: false, hit: () => undefined,
    };
    blade.state = "hooked";
    blade.hookTarget = target;
    blade.linkT = 2;
    blade.aimX = 0;
    blade.aimY = config.weapons.chainblade.maxRadius;
    input.tetherHeld = true;

    blade._updateHookThrown(0.1, player, []);

    expect(blade.slingRadius).toBeGreaterThanOrEqual(config.weapons.chainblade.minRadius);
    expect(blade.slingRadius).toBeLessThan(150);
    expect(Math.abs(target.vx) + Math.abs(target.vy)).toBeGreaterThan(0);
    const beforeRelease = { vx: target.vx, vy: target.vy };
    expect(blade._releaseHook(player)).toBe("recalled");
    expect(blade.state).toBe("returning");
    expect(blade.hookTarget).toBeNull();
    expect(Math.abs(target.vx - beforeRelease.vx) + Math.abs(target.vy - beforeRelease.vy)).toBeGreaterThan(0);
  });

  it("spends exactly one Riftlock chamber per Razor Round and emits an identified action", () => {
    const { blade, config } = makeBlade("riftlock");
    const player = { x: 20, y: 30, vx: 0, vy: 0, facing: 1 };
    blade.tipX = 40;
    blade.tipY = 50;
    blade.aimX = 100;
    blade.aimY = 0;
    blade.throwId = 7;

    expect(blade._fireRazorRound(player)).toBe(true);
    expect(blade.riftChambers).toBe(config.weapons.riftlock.chambers - 1);
    expect(blade._fireRazorRound(player)).toBe(false);
    const [razorRound] = blade.drainWeaponEvents();
    expect(razorRound?.type).toBe("razorRound");
    expect(razorRound?.damage).toBe(config.weapons.riftlock.razorDamage);
    expect(razorRound?.throwId).toBe(7);
    expect(razorRound?.attackId).toEqual(expect.any(Number));
    expect(razorRound?.remote).toBe(false);
  });
});

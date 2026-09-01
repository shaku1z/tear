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
    const target = {};
    blade.swingId = 1;
    blade.tipX = 0;
    blade.tipY = 0;
    blade.tipVX = 900;
    blade.tipVY = 0;
    expect(blade.resolveReversal(target)).toBe("armed");
    expect(Array.isArray(blade.reversals)).toBe(true);
    expect(structuredClone(blade.reversals)).toHaveLength(1);

    blade.tipX = config.weapons.sword.reversalExitRadius + 1;
    blade._updateReversalState();
    blade.swingId = 2;
    blade.tipVX = -900;
    expect(blade.resolveReversal(target)).toBe("reversal");
    expect(blade.resolveReversal(target)).toBe("armed");
    expect(clock.sim).toBe(0);
  });

  it("cannot complete Sword Reversal by crossing into a different target", () => {
    const { blade, config, weapon } = makeBlade("sword");
    const first = { seamT: 0 };
    const second = { seamT: 0 };
    const context = (enemy: typeof first) => ({
      blade, player: { x: 0, y: 0, vx: 0, vy: 0, facing: 1 },
      platforms: [], dt: 1 / 60, enemy, quality: 1, damage: 20, secondary: false,
    });
    blade.swingId = 1; blade.tipX = 0; blade.tipY = 0; blade.tipVX = 900; blade.tipVY = 0;
    expect(weapon.onHeldHit(context(first))).toBeNull();
    blade.tipX = config.weapons.sword.reversalExitRadius + 1;
    blade._updateReversalState();
    blade.swingId = 2; blade.tipVX = -900;

    expect(weapon.onHeldHit(context(second))).toBeNull();
    expect(weapon.onHeldHit(context(first))).toMatchObject({
      mechanic: "reversal", damageMult: config.weapons.sword.reversalDamageMult,
    });
  });

  it("lets a Sword Perfect Parry prime the same guarded Reversal route", () => {
    const { blade, config } = makeBlade("sword");
    const target = { radius: 24 };
    blade.swingId = 3; blade.tipX = 10; blade.tipY = 20; blade.tipVX = 1000; blade.tipVY = 0;
    expect(blade.primeReversal(target)).toBe(true);
    blade.tipX += Math.max(config.weapons.sword.reversalExitRadius,
      target.radius + config.weapons.sword.reversalExitPadding) + 1;
    blade._updateReversalState();
    blade.swingId = 4; blade.tipVX = -1000;
    expect(blade.resolveReversal(target)).toBe("reversal");
  });

  it("returns Sword Threadcut through captured throw-hit waypoints in reverse order", () => {
    const { blade } = makeBlade("sword");
    const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1 };
    const firstTarget = { x: 40, y: 0, dead: false };
    const movingTarget = { x: 80, y: 0, dead: false };
    blade.state = "flying";
    blade.recordHit(firstTarget as never);
    blade.recordHit(movingTarget as never);
    blade.throwOrigin = { x: -100, y: 0 };
    blade.x = 80;
    blade.y = 0;
    blade.freeRecall = true;

    expect(blade._beginReturn(player, { retrace: true })).toBe("recalled");
    movingTarget.x = 120;
    blade._updateStandardThrown(1 / 60, player, [], true);
    expect(blade.vx).toBeGreaterThan(0);
    blade.x = movingTarget.x;
    blade._updateStandardThrown(1 / 60, player, [], true);
    expect(blade.threadcutIndex).toBe(0);
    firstTarget.dead = true;
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

  it("launches Greatsword Wheel Cut without snapping its visible center and spins around that center", () => {
    const { blade, input } = makeBlade("greatsword");
    const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1 };
    blade.x = 120; blade.y = 180; blade.angle = Math.PI / 2;
    blade.tipX = blade.x + Math.cos(blade.angle) * blade.curLength;
    blade.tipY = blade.y + Math.sin(blade.angle) * blade.curLength;
    blade.tipSpeed = 900;
    input.mouseX = 500; input.mouseY = 180;
    blade.aimX = 300; blade.aimY = 0;
    const centerBefore = { x: (blade.x + blade.tipX) / 2, y: (blade.y + blade.tipY) / 2 };

    expect(blade.throwBlade()).toBe(true);
    expect(blade.angle).toBeCloseTo(Math.PI / 2);
    expect((blade.x + blade.tipX) / 2).toBeCloseTo(centerBefore.x);
    expect((blade.y + blade.tipY) / 2).toBeCloseTo(centerBefore.y);

    blade._updateWheelCut(1 / 60, player, []);
    const centerAfter = { x: (blade.x + blade.tipX) / 2, y: (blade.y + blade.tipY) / 2 };
    expect(centerAfter.x - centerBefore.x).toBeCloseTo(blade.vx / 60, 3);
    expect(centerAfter.y - centerBefore.y).toBeCloseTo(blade.vy / 60, 3);
    expect(blade.angle).toBeGreaterThan(Math.PI / 2);
  });

  it("stops an obstructed Wheel Cut at its last swept-safe center instead of teleporting the hilt", () => {
    const { blade, input } = makeBlade("greatsword");
    const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1 };
    blade.x = 120; blade.y = 180; blade.angle = Math.PI / 2;
    blade.tipX = blade.x + Math.cos(blade.angle) * blade.curLength;
    blade.tipY = blade.y + Math.sin(blade.angle) * blade.curLength;
    blade.tipSpeed = 900; input.mouseX = 500; input.mouseY = 180;
    blade.aimX = 300; blade.aimY = 0;
    const centerBefore = { x: (blade.x + blade.tipX) / 2, y: (blade.y + blade.tipY) / 2 };
    expect(blade.throwBlade()).toBe(true);
    const maximumFrameTravel = Math.hypot(blade.vx, blade.vy) / 60;

    blade._updateWheelCut(1 / 60, player, [{ x: 145, y: 220, w: 24, h: 80 }]);

    const centerAfter = { x: (blade.x + blade.tipX) / 2, y: (blade.y + blade.tipY) / 2 };
    expect(blade.state).toBe("embedded");
    expect(Math.hypot(centerAfter.x - centerBefore.x, centerAfter.y - centerBefore.y))
      .toBeLessThanOrEqual(maximumFrameTravel + 0.01);
    expect(blade.embeddedNew).toBe(true);
  });

  it("aligns a returning Greatsword across its travel instead of continuing Wheel spin", () => {
    const { blade } = makeBlade("greatsword");
    const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1 };
    blade.state = "returning"; blade.secondaryActive = true; blade.x = 300; blade.y = 100;
    blade.angle = 0; blade.tipX = blade.x + blade.curLength; blade.tipY = blade.y;
    blade._updateWheelCut(1 / 60, player, []);
    const travelAngle = Math.atan2(blade.vy, blade.vx);
    const across = Math.abs(Math.sin(blade.angle - travelAngle));
    expect(across).toBeGreaterThan(0.1);
    expect(blade.angle).toBeLessThan(Math.PI / 2);
  });

  it("retains substantially more Greatsword momentum through light targets than bosses", () => {
    const retained = (enemy: { weight: number; isBoss?: boolean; anchored?: boolean }) => {
      const { blade } = makeBlade("greatsword");
      blade.vx = 1000; blade.vy = 0;
      const retention = blade.applyHeldResistance(enemy as never);
      return { retention, speed: Math.hypot(blade.vx, blade.vy) };
    };
    const light = retained({ weight: 1 });
    const heavy = retained({ weight: 3 });
    const boss = retained({ weight: 8, isBoss: true });
    expect(light.speed).toBeGreaterThan(heavy.speed);
    expect(heavy.speed).toBeGreaterThan(boss.speed);
    expect(light.retention).toBeGreaterThan(boss.retention);
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
    expect(blade.drainWeaponEvents()).toEqual([expect.objectContaining({
      type: "slingRelease", x: target.x, y: target.y, vx: target.vx, vy: target.vy,
    })]);
  });

  it("scales Chainblade fling continuously by mass, knockback susceptibility, and secondary power", () => {
    const releaseSpeed = (weight: number, knockbackTaken: number, power = 1) => {
      const { blade } = makeBlade("chainblade");
      const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1 };
      const target = {
        x: 150, y: 0, vx: 0, vy: 0, radius: 16, weight, stun: 0,
        dead: false, dying: false, isBoss: false, cfg: { knockbackTaken },
        hit: () => undefined,
      };
      blade.state = "hooked"; blade.hookTarget = target; blade.linkT = 2;
      blade.slingRadius = 150; blade.slingAngle = 0; blade.slingAngularVelocity = 4;
      blade.channelMods.secondaryPower = power;
      expect(blade._releaseHook(player)).toBe("recalled");
      return Math.hypot(target.vx, target.vy);
    };

    const light = releaseSpeed(1, 10);
    const heavy = releaseSpeed(2.2, 10);
    const resistant = releaseSpeed(1, 3);
    const enhanced = releaseSpeed(1, 10, 1.25);
    expect(light).toBeGreaterThan(heavy);
    expect(light).toBeGreaterThan(resistant);
    expect(enhanced).toBeGreaterThan(light);
  });

  it("uses only the Chainblade head for full held damage and simulates articulated links", () => {
    const { blade } = makeBlade("chainblade");
    const player = { x: 100, y: 100, vx: 0, vy: 0, facing: 1 };
    blade.x = 170; blade.y = 100; blade.angle = 0; blade.tipX = 245; blade.tipY = 100;
    blade.update(1 / 120, player, []);
    const segment = blade.heldCollisionSegment(player);
    expect(segment.x1).toBeGreaterThan(player.x + 100);
    expect(segment.x2).toBe(blade.tipX);
    expect(blade.chainPoints).toHaveLength(blade.weapon?.id === "chainblade" ? 15 : 0);
    expect(blade.chainCollisionSegments()).toHaveLength(14);
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
    if (razorRound?.type !== "razorRound") throw new Error("expected a Razor Round event");
    expect(razorRound.damage).toBe(config.weapons.riftlock.razorDamage);
    expect(razorRound.throwId).toBe(7);
    expect(razorRound.attackId).toEqual(expect.any(Number));
    expect(razorRound.remote).toBe(false);
    expect(razorRound.secondary).toBe(false);
  });

  it("fires Riftlock only on a fresh tether press", () => {
    const { blade, input } = makeBlade("riftlock");
    const player = { x: 20, y: 30, vx: 0, vy: 0, facing: 1 };
    blade.aimX = 100; blade.aimY = 0;
    input.tetherHeld = true;
    blade.update(1 / 120, player, []);
    expect(blade.drainWeaponEvents()).toHaveLength(1);
    blade.update(0.4, player, []);
    expect(blade.drainWeaponEvents()).toHaveLength(0);
    input.tetherHeld = false; blade.update(1 / 120, player, []);
    input.tetherHeld = true; blade.update(1 / 120, player, []);
    expect(blade.drainWeaponEvents()).toHaveLength(1);
  });

  it("classifies a recoil-driven Riftlock bayonet crossing without granting hidden area damage", () => {
    const { blade, weapon } = makeBlade("riftlock");
    const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1 };
    const enemy = { seamT: 0 };
    blade.aimX = 100; blade.aimY = 0; blade.swingId = 4;
    expect(blade._fireRazorRound(player)).toBe(true);
    const context = { blade, player, platforms: [], dt: 1 / 120, enemy, quality: 1, damage: 20, secondary: false };
    expect(weapon.onHeldHit(context)).toMatchObject({ mechanic: "recoilCut" });
    expect(weapon.onHeldHit(context)).toMatchObject({ mechanic: "bayonet" });
  });

  it("keeps Loose Cannon airborne for its authored control duration and emits a real Backblast round", () => {
    const { blade, config } = makeBlade("riftlock");
    const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1 };
    blade.state = "flying"; blade.x = 800; blade.y = 400; blade.tipX = 900; blade.tipY = 400;
    blade.vx = 0; blade.vy = 0; blade._launchLooseCannon();
    for (let index = 0; index < 26; index++) blade._updateLooseCannon(0.1, player, []);
    expect(blade.flyTime).toBeGreaterThan(config.blade.throw.maxLife);
    expect(blade.state).toBe("flying");
    blade.freeRecall = true;
    expect(blade._beginBackblast(player)).toBe("recalled");
    const [round] = blade.drainWeaponEvents();
    expect(round).toMatchObject({ type: "backblastRound", secondary: true, remote: true });
    blade._updateLooseCannon(1 / 120, player, []);
    expect(Math.hypot(blade.vx, blade.vy)).toBeGreaterThanOrEqual(config.weapons.riftlock.backblastSpeed);
  });

  it("captures a normal target with Riftlock and transfers bounded remote recoil by target mass", () => {
    const { blade } = makeBlade("riftlock");
    const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1 };
    const target = {
      x: 300, y: 100, vx: 0, vy: 0, radius: 20, dead: false, dying: false,
      weight: 2, stun: 0, hit: () => undefined,
    };
    blade.state = "captured"; blade.hookTarget = target; blade.linkT = 1; blade.looseCannonT = 1;
    blade.aimX = 100; blade.aimY = 0;
    expect(blade._fireRazorRound(player)).toBe(true);
    expect(target.vx).toBeLessThan(0);
    blade._updateLooseCannon(1 / 120, player, []);
    expect(blade.tipX).toBeCloseTo(target.x);
    blade.freeRecall = true;
    expect(blade._beginBackblast(player)).toBe("recalled");
    expect(blade.hookTarget).toBeNull();
  });
});

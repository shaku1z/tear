import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { aabbOverlap, clamp, len, lerp, segPointDist, segSegmentDist } from "../../src/domain/geometry";
import { resolveEnemyContact } from "../../src/gameplay/combat/contact-runtime";
import { createEnemyTypes } from "../../src/gameplay/entities/enemies";
import { coordinateRimehoundPack, RIMEHOUND_TUNING } from "../../src/gameplay/entities/enemy-types/rimehound";
import { createProjectile } from "../../src/gameplay/entities/projectile";
import { createAuroraTrackFieldState } from "../../src/gameplay/environment/aurora-track";
import { advanceAuroraTrack } from "../../src/gameplay/environment/aurora-track-runtime";
import { createTearWorldClock } from "../../src/gameplay/runtime/tear-world-clock";

function fixture() {
  const CLOCK = createTearWorldClock();
  const FX = { burst() { return; }, ember() { return; }, explode() { return; }, ghost() { return; }, ring() { return; }, shockwave() { return; } };
  const SFX = { rankup() { return; }, crescent() { return; }, sourceDepthPrepare() { return; }, sourceDepthSnap() { return; } };
  const Projectile = createProjectile({ CLOCK, CONFIG, FX, presentation: { draw() { return; } }, SFX: {}, clamp, len, lerp });
  return { CLOCK, types: createEnemyTypes({ CLOCK, CONFIG, FX, GAME_RANDOM: { next: () => 0.5 }, Projectile, SFX,
    aabbOverlap, clamp, cosmeticRandom: () => 0.5, len, lerp, segPointDist, segSegmentDist }) };
}

function player(x = 700) {
  return { x, y: CONFIG.world.groundY - 40, vx: 120, vy: 0, hw: 18, hh: 40, onGround: true, facing: 1,
    hp: 100, maxHp: 100, dashTimer: 0, dashX: 0, voidSlowT: 0, voidMajorWindow: false, voidTransferT: 0,
    lastTrickKind: "", lastTrickT: 0, takeDamage() { return; } };
}

describe("Rimehound", () => {
  it("assigns stable alternating pack flanks and only rebalances after the lock expires", () => {
    const { types } = fixture();
    const left = new types.Rimehound(200, 700), right = new types.Rimehound(400, 700);
    coordinateRimehoundPack([left, right]);
    expect([left.packFlank, right.packFlank]).toEqual([-1, 1]);
    expect([left.packRole, right.packRole]).toEqual(["line", "flank"]);
    expect([left.packAttackAuthorized, right.packAttackAuthorized]).toEqual([true, false]);
    coordinateRimehoundPack([right]);
    expect(right.packFlank).toBe(1);
    right.packLockT = 0;
    coordinateRimehoundPack([right]);
    expect(right.packFlank).toBe(-1);
  });

  it("arbitrates one pack attack in canonical spawn order until the committed pounce ends", () => {
    const { types } = fixture();
    const first = new types.Rimehound(200, 700), second = new types.Rimehound(400, 700);
    coordinateRimehoundPack([first, second]);
    expect([first.packAttackAuthorized, second.packAttackAuthorized]).toEqual([true, false]);
    first.atk = "windup";
    coordinateRimehoundPack([first, second]);
    expect([first.packAttackAuthorized, second.packAttackAuthorized]).toEqual([true, false]);
    first.atk = "recover"; first.atkCd = 0.5;
    coordinateRimehoundPack([first, second]);
    expect([first.packAttackAuthorized, second.packAttackAuthorized]).toEqual([false, true]);
  });

  it("locks a predicted pounce target, exposes damage only while pouncing, and recovers on landing", () => {
    const { types } = fixture();
    const hound = new types.Rimehound(420, CONFIG.world.groundY - RIMEHOUND_TUNING.body.h / 2);
    hound.onGround = true;
    const hero = player(700);
    coordinateRimehoundPack([hound]);
    hound.update(1 / 120, [], hero, []);
    expect(hound.atk).toBe("windup");
    const lockedTarget = hound.pounceTargetX;
    hero.x = 1_100; hero.vx = -500;
    for (let tick = 0; tick < 60 && hound.atk === "windup"; tick += 1) hound.update(1 / 120, [], hero, []);
    expect(hound.atk).toBe("pounce");
    expect(hound.pounceTargetX).toBe(lockedTarget);
    expect(hound.contactDamageEnabled()).toBe(true);
    expect(hound.contactDamageAmount()).toBeCloseTo(hound.contactDmg * RIMEHOUND_TUNING.pounceDamageMultiplier);
    const damage: number[] = [];
    resolveEnemyContact([hound], { x: hound.x, y: hound.y, hw: 18, hh: 40, invulnerable: false,
      takeDamage(amount) { damage.push(amount); return "hit"; } }, {
      overlaps: aabbOverlap, segmentDistance: () => Number.POSITIVE_INFINITY,
      onHit() { return; }, onAbsorbed() { return; }, onHostileBladeResolved() { return; },
    });
    expect(damage).toEqual([hound.contactDamageAmount()]);
    for (let tick = 0; tick < 120 && hound.atk === "pounce"; tick += 1) hound.update(1 / 120, [], hero, []);
    expect(hound.atk).toBe("skid");
    for (let tick = 0; tick < 60 && hound.atk === "skid"; tick += 1) hound.update(1 / 120, [], hero, []);
    expect(hound.atk).toBe("recover");
    expect(hound.contactDamageEnabled()).toBe(false);
  });

  it("retains Aurora Track momentum during a committed pounce and fails safely at the arena edge", () => {
    const { types } = fixture();
    const hound = new types.Rimehound(40, CONFIG.world.groundY - RIMEHOUND_TUNING.body.h / 2);
    hound.atk = "pounce"; hound.atkT = 0.5; hound.vx = 300; hound.vy = -20; hound.pounceAirborne = true;
    const field = Object.freeze({ ...createAuroraTrackFieldState({ id: "pale:rimehound-track", ownerId: "pale-traverse",
      variant: "stage", direction: 1, geometry: { x: 0, y: 0, w: 1_600, h: 900 }, startTick: 0 }), state: "active" as const });
    const before = hound.vx;
    advanceAuroraTrack(field, 1, 1 / 120, [{ id: "enemy:rimehound", kind: "light-enemy", get x() { return hound.x; },
      get y() { return hound.y; }, intentX: 1, normalAcceleration: RIMEHOUND_TUNING.body.speed * 4,
      maximumSpeed: RIMEHOUND_TUNING.pounceSpeed, get vx() { return hound.vx; }, set vx(value) { hound.vx = value; },
      onInfluenced(direction, onTrack) { hound.onAuroraTrackInfluence(direction, onTrack); } }]);
    expect(hound.vx).toBeGreaterThan(before);
    expect(hound.atkT).toBeCloseTo(0.66);
    expect(hound.auroraPounceExtended).toBe(true);
    expect(hound.auroraDirection).toBe(1);
    hound.x = CONFIG.view.w - hound.hw;
    hound.update(1 / 120, [], player(), []);
    expect(hound.atk).toBe("skid");
  });

  it("turns solid-wall and one-way-platform misses into the same bounded skid window", () => {
    const { types } = fixture();
    const hero = player(1_100);
    const wall = { x: 540, y: 620, w: 30, h: 180, oneway: false, floor: false };
    const wallHound = new types.Rimehound(500, CONFIG.world.groundY - RIMEHOUND_TUNING.body.h / 2);
    Object.assign(wallHound, { atk: "pounce", atkT: 0.5, atkDir: 1, pounceTargetX: 1_100,
      pounceAirborne: true, vx: RIMEHOUND_TUNING.pounceSpeed, vy: 0, onGround: false });
    wallHound.update(1 / 120, [wall], hero, []);
    wallHound.update(1 / 120, [wall], hero, []);
    expect(wallHound.atk).toBe("skid");

    const ledge = { x: 400, y: 560, w: 300, h: 20, oneway: true, floor: false };
    const landingHound = new types.Rimehound(500, 540);
    Object.assign(landingHound, { atk: "pounce", atkT: 0.5, atkDir: 1, pounceTargetX: 1_100,
      pounceAirborne: true, vx: 100, vy: 300, onGround: false });
    landingHound.update(1 / 120, [ledge], hero, []);
    landingHound.update(1 / 120, [ledge], hero, []);
    expect(landingHound.atk).toBe("skid");
    expect(landingHound.y + landingHound.hh).toBe(ledge.y);
  });

  it("turns a player launch or parry during pounce into the authored punish skid", () => {
    const { types } = fixture();
    const hound = new types.Rimehound(500, 700);
    hound.atk = "pounce"; hound.atkT = 0.4; hound.vx = 800;
    const dealt = hound.hit(12, -1, -0.35, { playerOwned: true });
    expect(dealt).toBe(12);
    expect(hound.atk).toBe("skid");
    expect(hound.vx).toBeLessThan(800);
    expect(hound.vy).toBeLessThan(0);
    expect(hound.contactDamageEnabled()).toBe(false);
  });

  it("uses the ordinary enemy death path without retaining pack participation", () => {
    const { types } = fixture();
    const hound = new types.Rimehound(300, 700);
    hound.hit(hound.maxHp * 2, 1, 0);
    expect(hound.dead).toBe(true);
    const survivor = new types.Rimehound(500, 700);
    coordinateRimehoundPack([hound, survivor]);
    expect(survivor.packFlank).toBe(-1);
  });

  it("isolates pack locks between independently composed worlds", () => {
    const worldA = fixture(), worldB = fixture();
    const a1 = new worldA.types.Rimehound(200, 700), a2 = new worldA.types.Rimehound(400, 700);
    const b1 = new worldB.types.Rimehound(400, 700), b2 = new worldB.types.Rimehound(200, 700);
    coordinateRimehoundPack([a1, a2]);
    coordinateRimehoundPack([b1, b2]);
    expect([a1.packFlank, a2.packFlank]).toEqual([-1, 1]);
    expect([b1.packFlank, b2.packFlank]).toEqual([-1, 1]);
    a1.packLockT = 0; coordinateRimehoundPack([a1]);
    expect([b1.packFlank, b2.packFlank]).toEqual([-1, 1]);
  });

  it("round-trips committed pack and pounce state through the generic enemy payload boundary", () => {
    const { types } = fixture();
    const source = new types.Rimehound(360, 700);
    source.packRole = "flank"; source.packFlank = 1; source.packLockT = 0.75;
    source.packAttackAuthorized = true; source.atk = "pounce"; source.atkT = 0.31;
    source.pounceTargetX = 980; source.pounceAirborne = true; source.vx = 740; source.vy = -180;
    const payload = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
    const restored = new types.Rimehound(0, 0);
    Object.assign(restored, payload);
    expect(restored).toMatchObject({ kind: "rimehound", packRole: "flank", packFlank: 1,
      packAttackAuthorized: true, atk: "pounce", pounceTargetX: 980, pounceAirborne: true });
    const hero = player(1_050);
    source.update(1 / 120, [], hero, []); restored.update(1 / 120, [], hero, []);
    expect({ x: restored.x, y: restored.y, vx: restored.vx, vy: restored.vy, atk: restored.atk, atkT: restored.atkT })
      .toEqual({ x: source.x, y: source.y, vx: source.vx, vy: source.vy, atk: source.atk, atkT: source.atkT });
  });

  it("resets all pack coordination and attack state through ordinary reconstruction", () => {
    const { types } = fixture();
    const mutated = new types.Rimehound(300, 700);
    mutated.packRole = "flank"; mutated.packFlank = 1; mutated.packLockT = 1; mutated.atk = "pounce";
    const reset = new types.Rimehound(300, 700);
    expect(reset).toMatchObject({ kind: "rimehound", packRole: "line", packFlank: -1,
      packLockT: 0, packAttackAuthorized: false, atk: "flank", pounceTargetX: 0, pounceAirborne: false,
      auroraDirection: 0, auroraResponseT: 0, auroraPounceExtended: false });
  });

  it("cannot retain pack authority after the owning stage replaces its enemy collection", () => {
    const { types } = fixture();
    const departing = new types.Rimehound(300, 700);
    coordinateRimehoundPack([departing]);
    departing.atk = "pounce"; departing.packLockT = 1;
    const arriving = new types.Rimehound(700, 700);
    coordinateRimehoundPack([arriving]);
    expect(arriving).toMatchObject({ packRole: "line", packFlank: -1, packAttackAuthorized: true, atk: "flank" });
    expect(departing.atk).toBe("pounce");
  });
});

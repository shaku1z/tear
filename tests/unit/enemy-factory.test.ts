import { describe, expect, it } from "vitest";

import { CLOCK, CONFIG } from "../../src/config/game-config";
import { aabbOverlap, clamp, len, lerp, segPointDist, segSegmentDist } from "../../src/domain/geometry";
import { createEnemyTypes } from "../../src/gameplay/entities/enemies";
import { createProjectile } from "../../src/gameplay/entities/projectile";

const FX = {
  burst() { return; },
  ember() { return; },
  explode() { return; },
  ghost() { return; },
  ring() { return; },
  shockwave() { return; },
};

const SFX = {
  sweeperBat() { return; },
  rankup() { return; },
  crescent() { return; },
  sourceDepthPrepare() { return; },
  sourceDepthSnap() { return; },
};

function createTestEnemyTypes() {
  const Projectile = createProjectile({
    CLOCK,
    CONFIG,
    FX,
    presentation: { draw() { return; } },
    SFX,
    clamp,
    len,
    lerp,
  });
  return createEnemyTypes({
    CLOCK,
    CONFIG,
    FX,
    GAME_RANDOM: { next: () => 0.5 },
    Projectile,
    SFX,
    aabbOverlap,
    clamp,
    cosmeticRandom: () => 0.5,
    len,
    lerp,
    segPointDist,
    segSegmentDist,
  });
}

describe("enemy factory", () => {
  it("keeps the complete compatibility roster frozen", () => {
    const types = createTestEnemyTypes();
    expect(Object.isFrozen(types)).toBe(true);
    expect(Object.keys(types).sort()).toEqual([
      "Aldric", "Armored", "BOSSFX", "Bomber", "Boss", "Charger", "Chimera",
      "Colossus", "Echo", "Enemy", "Flyer", "Ranged", "Source", "Support",
      "VoidWisp", "Warden", "Wraith", "drawBossTransformationWorld",
      "weaponCapsuleIntersectsSegment",
    ].sort());
  });

  it("preserves capsule crossing and miss behavior", () => {
    const { weaponCapsuleIntersectsSegment } = createTestEnemyTypes();
    const capsule = {
      a: { x: 0, y: 0 }, b: { x: 10, y: 0 },
      x1: 0, y1: 0, x2: 10, y2: 0, radius: 2,
    };
    expect(weaponCapsuleIntersectsSegment(capsule, 5, -5, 5, 5)).toBe(true);
    expect(weaponCapsuleIntersectsSegment(capsule, 20, -5, 20, 5)).toBe(false);
  });

  it("constructs representative standard and boss actors", () => {
    const types = createTestEnemyTypes();
    const charger = new types.Charger(100, CONFIG.world.groundY - 40);
    const warden = new types.Warden(300, CONFIG.world.groundY - 60);
    const source = new types.Source(500, 220);

    expect(charger.kind).toBe("charger");
    expect(warden.bossName).toBe("THE WARDEN");
    expect(source.bossName).toBe("THE SOURCE");
  });
});

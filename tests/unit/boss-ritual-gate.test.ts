import { describe, expect, it } from "vitest";

import { CLOCK, CONFIG } from "../../src/config/game-config";
import { aabbOverlap, clamp, len, lerp, segPointDist, segSegmentDist } from "../../src/domain/geometry";
import { createEnemyTypes } from "../../src/gameplay/entities/enemies";
import { createProjectile } from "../../src/gameplay/entities/projectile";
import { stepEnemyActors } from "../../src/gameplay/combat/enemy-step-runtime";
import { BossRitualController } from "../../src/gameplay/entities/boss-ritual-controller";

const FX = {
  burst() { return; }, ember() { return; }, explode() { return; }, ghost() { return; },
  ring() { return; }, shockwave() { return; }, drip() { return; },
};
const SFX = {
  sweeperBat() { return; }, rankup() { return; }, crescent() { return; },
  sourceDepthPrepare() { return; }, sourceDepthSnap() { return; },
};

function createTestEnemyTypes() {
  const Projectile = createProjectile({ CLOCK, CONFIG, FX, presentation: { draw() { return; } }, SFX, clamp, len, lerp });
  return createEnemyTypes({
    CLOCK, CONFIG, FX, GAME_RANDOM: { next: () => 0.5 }, Projectile, SFX,
    aabbOverlap, clamp, cosmeticRandom: () => 0.5, len, lerp, segPointDist, segSegmentDist,
  });
}

// The live runtime gates every boss ritual behind this shape check
// (src/app/live-game-runtime.ts isRitualOwner).
function isRitualOwner(value: unknown): boolean {
  return typeof value === "object" && value !== null && "bossName" in value
    && typeof value.bossName === "string"
    && "cinematicT" in value && typeof value.cinematicT === "number";
}

// The descent derives its actor id from presentationId/bossId, so the live gate only
// has to recognise a game enemy (src/app/live-game-runtime.ts isSourceOwner).
function isSourceOwner(value: unknown): boolean {
  const v = value as { presentationId?: unknown; bossId?: unknown };
  return typeof value === "object" && value !== null
    && (typeof v.presentationId === "string" || typeof v.bossId === "string");
}

function isBossPresentationActor(value: unknown): boolean {
  const v = value as { facing?: unknown; bossName?: unknown; presentationId?: unknown };
  return typeof value === "object" && value !== null && "facing" in value && typeof v.facing === "number"
    && "bossName" in value && typeof v.bossName === "string"
    && "presentationId" in value && typeof v.presentationId === "string";
}

describe("boss ritual gate", () => {
  it("restores tutorial dummy grounding after knock-up physics", () => {
    const types = createTestEnemyTypes();
    const dummy = new types.Charger(300, CONFIG.world.groundY - 180);
    Object.assign(dummy, { tutDummy: true, spawnT: 0, vy: 0, onGround: true });
    const options = {
      enemies: [dummy], platforms: [], player: {}, projectiles: [], freeze: false,
      gravity: CONFIG.world.gravity, groundY: CONFIG.world.groundY, viewportWidth: CONFIG.view.w,
      onKill() { return; }, startTransformation() { return false; },
    };

    stepEnemyActors({ ...options, dt: 1 / 120 });
    expect(dummy.onGround, "an airborne tutorial dummy must not retain a stale grounded flag").toBe(false);

    for (let tick = 0; tick < 240 && !dummy.onGround; tick += 1) {
      stepEnemyActors({ ...options, dt: 1 / 120 });
    }
    expect(dummy.onGround, "floor contact must restore grounded state for slam classification").toBe(true);
    expect(dummy.y).toBe(CONFIG.world.groundY - dummy.hh);
    expect(dummy.vy).toBe(0);
  });

  it("accepts a freshly constructed boss as a ritual owner", () => {
    const types = createTestEnemyTypes();
    for (const [name, Boss] of [["Warden", types.Warden], ["Colossus", types.Colossus],
      ["Aldric", types.Aldric], ["Echo", types.Echo], ["Source", types.Source]] as const) {
      const boss = new Boss(300, CONFIG.world.groundY - 60);
      expect(isRitualOwner(boss), `${name} must satisfy the live ritual-owner gate`).toBe(true);
    }
  });

  it("accepts every boss under the live presentation gate", () => {
    const types = createTestEnemyTypes();
    for (const [name, Boss] of [["Warden", types.Warden], ["Colossus", types.Colossus],
      ["Aldric", types.Aldric], ["Echo", types.Echo], ["Source", types.Source]] as const) {
      const boss = new Boss(300, CONFIG.world.groundY - 60);
      expect(isBossPresentationActor(boss), `${name} must satisfy the boss presentation gate`).toBe(true);
    }
  });

  it("accepts the Source under the live void-descent gate", () => {
    const types = createTestEnemyTypes();
    const source = new types.Source(500, 220);
    expect(isSourceOwner(source), "the Source must satisfy the void-descent gate").toBe(true);
  });

  it("never strands a phase transformation request on the actor", () => {
    const types = createTestEnemyTypes();
    const warden = new types.Warden(300, CONFIG.world.groundY - 60) as unknown as {
      hp: number; maxHp: number; spawnT: number; introT: number; stun: number; cinematicRequest?: unknown;
    };
    warden.spawnT = 0; warden.introT = 0; warden.stun = 0;
    warden.hp = warden.maxHp * 0.5;   // cross the 0.65 phase mark -> phase 2 ritual

    const player = { x: 400, y: CONFIG.world.groundY - 40, hw: 12, hh: 20, invulnerable: true,
      takeDamage() { return; } };
    const platforms = [{ x: 0, y: CONFIG.world.groundY, w: CONFIG.view.w, h: 200, floor: true }];

    let started = false;
    stepEnemyActors({
      dt: 1 / 120, enemies: [warden as never], platforms, player, projectiles: [], freeze: false,
      gravity: CONFIG.world.gravity, groundY: CONFIG.world.groundY, viewportWidth: CONFIG.view.w,
      onKill() { return; },
      // Mirrors the live path: the gate decides, then BossRitualController.begin
      // consumes the request. A refused gate must never leave the request stranded.
      startTransformation: (enemy, request) => {
        if (!isRitualOwner(enemy)) return false;
        started = true;
        new BossRitualController().begin(enemy as never, request as never,
          { platforms: [], groundY: CONFIG.world.groundY, bomberColor: "#000", dialogueDuck: 0.5, brief: false });
        return true;
      },
    });

    expect(started, "the phase ritual must actually start").toBe(true);
    expect(warden.cinematicRequest ?? null, "a stranded request freezes the boss forever").toBe(null);
  });
});

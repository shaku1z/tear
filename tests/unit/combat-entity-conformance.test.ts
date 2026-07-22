import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { PROJECTILE_FAMILIES } from "../../src/gameplay/entities/projectile";
import {
  planBombExplosion,
  planBomberDeathExplosion,
  planBossZoneCollision,
  planProjectileCollisions,
  resolveProjectileCurves,
  resolveSpecialProjectiles,
  resolveSupportAuras,
  resolveWorldHazards,
  type CombatActorState,
  type ProjectileCollisionTuning,
  type ProjectilePlayerState,
  type ProjectileState,
  type SpecialProjectileTuning,
} from "../../src/gameplay/combat/combat-entity-resolver";
import { BossArenaRules, createBossArena, type ArenaRuleState } from "../../src/gameplay/training/arena-rules";
import { applyVariant, VARIANTS } from "../../src/gameplay/variants";
import { VoidGen } from "../../src/gameplay/voidgen";
import type { VoidHazardType, VoidPlatform } from "../../src/gameplay/voidgen-contracts";
import { createEnemyHarness, createStandardActor, updateActor } from "./enemy-test-harness";

function voidPlatform(type: VoidHazardType): VoidPlatform {
  return {
    id: `void:${type}`, platformId: `void:${type}`, voidId: `void:${type}`, chunkId: 0,
    x: 100, y: 500, w: 240, h: 20, oneway: true, void: true, voidLane: "lower", voidType: type,
    voidRole: "test", hazardSeed: 0, hazardPhaseOffset: 0, hazardPhase: 0,
    materializationState: "active", material: "void", arenaMaterial: "void", touchT: 0,
    fireOn: false, fireState: "cold", transferNode: false, connectionIds: [],
  };
}

describe("combat entity conformance", () => {
  it("drives every canonical projectile family through its counterplay and cleanup lifecycle", () => {
    expect(PROJECTILE_FAMILIES.map((family) => family.id)).toEqual(["ordinaryProjectile", "groundShock", "sweeper"]);
    for (const family of PROJECTILE_FAMILIES) {
      const { Projectile } = createEnemyHarness();
      const owner = { x: 800, y: 300, dead: false, dying: false };
      const shot = new Projectile(400, 300, 300, 0).setFamily(family.id);
      shot.owner = owner;
      shot.sourceEnemy = owner;
      expect(shot).toMatchObject({ family: family.id, counterplay: family.counterplay, unparryable: family.unparryable, dead: false });
      expect(shot.sourceEnemy).toBe(owner);

      if (family.id === "ordinaryProjectile") {
        shot.deflect(1, 0, 500, true);
        expect(shot).toMatchObject({ deflected: true, perfect: true });
        expect(shot.deflectDmg).toBeGreaterThan(0);
        shot.life = 0.01;
        shot.update(0.02);
      } else if (family.id === "groundShock") {
        shot.surfacePlatformId = "ledge"; shot.surfaceLeft = 450; shot.surfaceRight = 700; shot.surfaceY = 520;
        shot.update(1 / 60);
        expect(shot.y).toBe(520 - shot.r);
      } else {
        shot.configureSweeper({ passes: 1, integrity: 3, maxLife: 2, embeddedLife: 0.05 });
        shot.x = CONFIG.view.w - 1; shot.vx = 500;
        shot.update(1 / 60);
        expect(shot).toMatchObject({ sweeperState: "embedded", harmless: true, passesRemaining: 0 });
        shot.update(0.11);
      }
      expect(shot.dead, `${family.id} cleanup`).toBe(true);
    }
  });

  it("keeps projectile damage attribution through reflection and ground impact, exactly once", () => {
    const { Projectile, types } = createEnemyHarness();
    const source = new types.Ranged(300, 300);
    const target = new types.Charger(700, CONFIG.world.groundY - CONFIG.enemy.h / 2);
    const reflected = new Projectile(500, 300, -CONFIG.proj.speed, 0);
    reflected.owner = source; reflected.sourceEnemy = source; reflected.dmg = 20;
    reflected.deflect(1, 0, CONFIG.proj.speed, true);
    const hp = target.hp;
    target.hit(reflected.deflectDmg, 1, 0, { type: "reflected", playerOwned: true });
    expect(target.hp).toBeLessThan(hp);
    expect(reflected.sourceEnemy).toBe(source);

    let impacts = 0;
    const falling = new Projectile(600, CONFIG.world.groundY - 40, 0, 200);
    falling.owner = { x: 600, y: 200, onProjectileGroundImpact(projectile) { impacts += 1; expect(projectile).toBe(falling); } };
    falling.gravity = 500; falling.groundImpact = true; falling.landingY = CONFIG.world.groundY;
    falling.update(0.2); falling.update(0.2);
    expect(falling.dead).toBe(true);
    expect(impacts).toBe(1);
  });

  it("preserves all support actor identities, deterministic movement, ownership links and cleanup", () => {
    for (const type of ["priest", "mender", "herald", "anchor"] as const) {
      const left = createEnemyHarness([0.3]);
      const right = createEnemyHarness([0.3]);
      const a = createStandardActor(type, left.types);
      const b = createStandardActor(type, right.types);
      const ally = createStandardActor("charger", left.types);
      const supportA = a as typeof a & { links: typeof ally[]; range: number; auraPulse: number };
      const supportB = b as typeof b & { links: typeof ally[]; range: number; auraPulse: number };
      supportA.links = [ally]; supportB.links = [ally];
      updateActor(a, 60, left.platforms, left.player, []);
      updateActor(b, 60, right.platforms, right.player, []);
      expect(a).toMatchObject({ kind: "support", supportType: type, dead: false });
      expect({ x: a.x, vx: a.vx, auraPulse: supportA.auraPulse }).toEqual({ x: b.x, vx: b.vx, auraPulse: supportB.auraPulse });
      expect(supportA.links).toEqual([ally]);
      expect(supportA.range).toBe(CONFIG.support.range);
      a.hit(a.maxHp + 1, 1, 0);
      expect(a.dead).toBe(true);
      expect([a].filter((actor) => !actor.dead)).toEqual([]);
    }
  });

  it("emits Geomancer walls only after a completed live channel", () => {
    const { types, platforms, player } = createEnemyHarness();
    player.x = 700;
    const bomber = createStandardActor("bomber", types) as ReturnType<typeof createStandardActor> & {
      lobTimer: number; geoX: number; wallRequest: { x: number } | null;
    };
    const bomberVariants = VARIANTS.bomber;
    if (!bomberVariants) throw new Error("Bomber variants are required");
    const geomancer = bomberVariants.find((variant) => variant.id === "geomancer");
    expect(geomancer).toBeDefined();
    applyVariant(bomber, geomancer);
    bomber.onGround = true; bomber.lobTimer = 0;
    bomber.update(1 / 60, platforms, player, []);
    expect(bomber.atk).toBe("channel");
    expect(bomber.wallRequest).toBeNull();
    bomber.update(CONFIG.exotic.geoChannel + 0.01, platforms, player, []);
    expect(bomber.wallRequest).toEqual({ x: bomber.geoX });

    const interrupted = createStandardActor("bomber", types) as typeof bomber;
    applyVariant(interrupted, geomancer);
    interrupted.onGround = true; interrupted.lobTimer = 0;
    interrupted.update(1 / 60, platforms, player, []);
    interrupted.hit(interrupted.maxHp + 1, 1, 0);
    expect(interrupted.dead).toBe(true);
    expect(interrupted.wallRequest).toBeNull();
  });

  it("cycles every extracted stage-hazard family and reforms broken boss-arena routes", () => {
    const fire = voidPlatform("fire");
    expect(VoidGen.hazardState(fire, 0, { firePeriod: 4, fireArmTime: 1, fireHotTime: 1 })).toBe("cold");
    expect(VoidGen.hazardState(fire, 2.5, { firePeriod: 4, fireArmTime: 1, fireHotTime: 1 })).toBe("arming");
    expect(VoidGen.hazardState(fire, 3.5, { firePeriod: 4, fireArmTime: 1, fireHotTime: 1 })).toBe("hot");
    expect(VoidGen.hazardState(voidPlatform("crumble"), 0)).toBe("crumble");
    const cage = voidPlatform("cage");
    cage.cage = { offsetX: 120, halfWidth: 30, height: 180 };
    expect(VoidGen.cageGeometry(cage)).toEqual({ centerX: 220, x: 190, y: 320, w: 60, h: 180 });

    const authored = createBossArena("warden", 1600, 900, CONFIG.world.groundY, 0.1);
    expect(authored).not.toBeNull();
    const state: ArenaRuleState = { platforms: [...(authored ?? [])], broken: [] };
    const route = state.platforms.find((platform) => !platform.floor);
    expect(route).toBeDefined();
    if (!route) throw new Error("Warden arena must include an elevated route");
    route.arenaFractureRequest = { reason: "test", color: "#f00" };
    const rules = new BossArenaRules({ reformWarn: 0.1, reformClearMargin: 10, minElevatedActive: 1,
      crackWarn: 0.05, standBeforeWarn: 1, stressDrainDelay: 0.1, stressDrainRate: 1, brokenDuration: 0.1 },
    { boss: "#fff", armoredShield: "#0ff" });
    rules.update(state, 0.01, null, [{ x: 800, y: 300, hw: 30, hh: 60, onGround: false, presentationId: "warden" }], false);
    const breakIntents = rules.update(state, 0.06, null, [{ x: 800, y: 300, hw: 30, hh: 60, onGround: false, presentationId: "warden" }], false);
    expect(state.broken).toContain(route);
    expect(breakIntents.some((intent) => intent.type === "boss-event" && intent.event === "platformBreak")).toBe(true);
    const rebuildIntents = rules.update(state, 0.3, null, [{ x: 800, y: 300, hw: 30, hh: 60, onGround: false, presentationId: "warden" }], false);
    expect(state.broken).toEqual([]);
    expect(route.arenaState).toBe("stable");
    expect(rebuildIntents.some((intent) => intent.type === "boss-event" && intent.event === "platformRebuild")).toBe(true);
  });
});

function combatActor(id: string, overrides: Partial<CombatActorState> = {}): CombatActorState {
  return {
    id, kind: "charger", x: 0, y: 0, radius: 20, hp: 100, maxHp: 100,
    dead: false, spawnT: 0, stun: 0, ...overrides,
  };
}

function projectile(id: string, overrides: Partial<ProjectileState> = {}): ProjectileState {
  return {
    id, x: 100, y: 100, vx: 300, vy: 0, r: 9, dead: false,
    family: "ordinaryProjectile", ownerId: "owner", sourceEnemyId: "owner",
    deflected: false, perfect: false, deflectDmg: 28, pierce: false, piercedIds: new Set(),
    unparryable: false, dmg: null, root: 0, curve: false, curved: false, curveT: 0,
    bomb: false, mud: false, mine: false, armed: false, armT: 0, life: 6,
    ...overrides,
  };
}

const PROJECTILE_PLAYER: ProjectilePlayerState = {
  x: 100, y: 100, hw: 20, hh: 40, dashTimer: 0, dashX: 0, dashY: 0, facing: 1,
};

const COLLISION_TUNING: ProjectileCollisionTuning = {
  projectileDamage: CONFIG.proj.dmg,
  projectileSpeed: CONFIG.proj.speed,
  deflectBoost: CONFIG.blade.deflectBoost,
  deflectDamageMultiplier: CONFIG.blade.deflectDmgMult,
  runDamageMultiplier: 1.5,
  phaseStep: false,
  parryStun: false,
  aegisParry: false,
  sparkCount: CONFIG.juice.sparkCount,
  deflectedColor: CONFIG.colors.deflected,
  rootColor: CONFIG.colors.armoredShield,
  shakeBig: CONFIG.juice.shakeBig,
  shakeSmall: CONFIG.juice.shakeSmall,
  achievementTracking: true,
};

const SPECIAL_TUNING: SpecialProjectileTuning = {
  groundY: CONFIG.world.groundY,
  mineTrigger: CONFIG.bomber.mineTrigger,
  blastRadius: CONFIG.bomber.blastRadius,
  blastDamage: CONFIG.bomber.blastDmg,
  sludgeZoneRadius: CONFIG.exotic.sludgeZoneR,
  sludgeZoneLife: CONFIG.exotic.sludgeZoneLife,
  bomberColor: CONFIG.colors.bomber,
  perfectColor: CONFIG.colors.perfect,
  sludgeColor: CONFIG.colors.sludge,
  shakeBig: CONFIG.juice.shakeBig,
  flashParry: CONFIG.juice.flashParry,
};

describe("strict combat entity resolver", () => {
  it("resets and composes every support aura with exact eligibility, links, and caps", () => {
    const actors = [
      combatActor("priest", { kind: "support", supportType: "priest", range: CONFIG.support.range }),
      combatActor("herald", { kind: "support", supportType: "herald", range: CONFIG.support.range }),
      combatActor("ally", { x: 100, hp: 80 }),
      combatActor("dead", { x: 100, dead: true }),
      combatActor("outside", { x: 1000 }),
    ];
    const result = resolveSupportAuras(actors, 0.5, CONFIG.support, CONFIG.colors.anchor);
    const ally = result.actors.find((actor) => actor.id === "ally");
    expect(ally).toMatchObject({
      auraDR: CONFIG.support.drMult,
      auraDmg: CONFIG.support.dmgBuff,
      auraSpeed: CONFIG.support.speedBuff,
      auraHaste: CONFIG.support.hasteBuff,
      tetherDR: 1,
      anchored: false,
      buffs: ["priest", "herald"],
    });
    expect(result.actors.find((actor) => actor.id === "priest")?.links).toEqual(["ally"]);
    expect(result.actors.find((actor) => actor.id === "herald")?.links).toEqual(["ally"]);
    expect(result.actors.find((actor) => actor.id === "dead")?.buffs).toEqual([]);
  });

  it("makes the Mender heal the lowest absolute HP target and caps at max HP", () => {
    const result = resolveSupportAuras([
      combatActor("mender", { kind: "support", supportType: "mender", range: CONFIG.support.range }),
      combatActor("low", { x: 50, hp: 3, maxHp: 10 }),
      combatActor("lower-ratio", { x: 60, hp: 20, maxHp: 100 }),
      combatActor("far", { x: CONFIG.support.range * 1.3 + 1, hp: 1 }),
    ], 1, CONFIG.support, CONFIG.colors.anchor);
    expect(result.actors.find((actor) => actor.id === "low")).toMatchObject({ hp: 10, buffs: ["mender"] });
    expect(result.actors.find((actor) => actor.id === "lower-ratio")?.hp).toBe(20);
    expect(result.actors.find((actor) => actor.id === "mender")?.links).toEqual(["low"]);
  });

  it("binds Anchors once to the strongest eligible ally and enforces shared fate", () => {
    const first = resolveSupportAuras([
      combatActor("anchor", { kind: "support", supportType: "anchor", range: CONFIG.support.range }),
      combatActor("wraith", { kind: "wraith", maxHp: 999 }),
      combatActor("spawning", { maxHp: 500, spawnT: 0.1 }),
      combatActor("strong", { hp: 100, maxHp: 200 }),
      combatActor("weak", { hp: 50, maxHp: 80 }),
    ], 1, CONFIG.support, CONFIG.colors.anchor);
    expect(first.actors.find((actor) => actor.id === "anchor")).toMatchObject({ bondedId: "strong", links: ["strong"] });
    expect(first.actors.find((actor) => actor.id === "strong")).toMatchObject({
      hp: 109, tetherDR: CONFIG.support.anchorDR, anchored: true, buffs: ["anchor"],
    });

    const deadBond = resolveSupportAuras([
      combatActor("anchor", { kind: "support", supportType: "anchor", bondedId: "strong" }),
      combatActor("strong", { dead: true }),
    ], 1, CONFIG.support, CONFIG.colors.anchor);
    expect(deadBond.actors.find((actor) => actor.id === "anchor")?.dead).toBe(true);
    expect(deadBond.intents.map((intent) => intent.type)).toEqual(["fx-ring", "fx-burst"]);
  });

  it("ages sludge and walls, materializes Geomancer requests, and resolves foot-only slowing", () => {
    const result = resolveWorldHazards({
      dt: 0.25,
      slowZones: [
        { id: "expired", x: 100, y: CONFIG.world.groundY, r: 72, life: 0.25 },
        { id: "live", x: 100, y: CONFIG.world.groundY, r: 72, life: 1 },
      ],
      walls: [
        { id: "old", x: 0, y: 0, w: 26, h: 155, wall: true, life: 0.2, maxLife: 9 },
        { id: "live-wall", x: 0, y: 0, w: 26, h: 155, wall: true, life: 1, maxLife: 9 },
      ],
      wallRequests: [{ actorId: "geomancer", x: 500 }],
      nextWallSequence: 7,
      player: { x: 100, y: CONFIG.world.groundY - 40, hh: 40 },
      tuning: {
        groundY: CONFIG.world.groundY, sludgeSlow: CONFIG.exotic.sludgeSlow,
        geoWallW: CONFIG.exotic.geoWallW, geoWallH: CONFIG.exotic.geoWallH,
        geoWallLife: CONFIG.exotic.geoWallLife, sludgeColor: CONFIG.colors.sludge,
      },
    });
    expect(result.slowZones).toEqual([{ id: "live", x: 100, y: CONFIG.world.groundY, r: 72, life: 0.75 }]);
    expect(result.walls).toEqual([
      { id: "live-wall", x: 0, y: 0, w: 26, h: 155, wall: true, life: 0.75, maxLife: 9 },
      { id: "geomancer-wall:7", x: 487, y: CONFIG.world.groundY - 155, w: 26, h: 155, wall: true, life: 9, maxLife: 9 },
    ]);
    expect(result.playerSlowMultiplier).toBe(CONFIG.exotic.sludgeSlow);
    expect(result.intents.map((intent) => intent.type)).toEqual([
      "remove-wall", "materialize-wall", "fx-ring", "clear-wall-request", "set-player-slow",
    ]);
  });

  it("uses the first live boss zone, floor/full-height gates, defaults, and cooldown ownership", () => {
    const actors = [combatActor("boss", { isBoss: true, x: 900, zones: [
      { x: 100, w: 0, on: false },
      { x: 100, w: 0, fullHeight: true, dmg: 12, tickCd: 0 },
    ] })];
    const result = planBossZoneCollision(actors, {
      x: 100, y: 100, hw: 20, hh: 40, invulnerable: false, hazardT: 0, hazardDmgMult: 1.5,
    }, {
      groundY: CONFIG.world.groundY, defaultWidth: CONFIG.warden.zoneW,
      defaultDamage: CONFIG.warden.zoneTick, defaultTickCooldown: CONFIG.warden.zoneTickCd,
    });
    expect(result[0]).toMatchObject({ type: "damage-player", damage: 18, sourceX: 900, sourceId: "boss", cause: "boss-zone" });
    expect(result[0]).toMatchObject({ afterAttempt: [{ type: "set-player-hazard-cooldown", seconds: CONFIG.warden.zoneTickCd }] });
    expect(planBossZoneCollision(actors, {
      x: 100, y: 100, hw: 20, hh: 40, invulnerable: true, hazardT: 0, hazardDmgMult: 1,
    }, { groundY: CONFIG.world.groundY, defaultWidth: 200, defaultDamage: 7, defaultTickCooldown: 0.4 })).toEqual([]);
  });

  it("separates hostile projectile damage outcomes from phase-step deflection", () => {
    const shot = projectile("shot", { root: 1.4 });
    const damage = planProjectileCollisions({ projectiles: [shot], actors: [], player: PROJECTILE_PLAYER, tuning: COLLISION_TUNING });
    expect(damage).toHaveLength(1);
    expect(damage[0]).toMatchObject({
      type: "damage-player", damage: CONFIG.proj.dmg, cause: "projectile", acceptedProjectilePatch: { dead: true },
    });
    if (damage[0]?.type !== "damage-player") throw new Error("expected player damage intent");
    expect(damage[0].onHit.map((intent) => intent.type)).toEqual(["lose-style", "sound", "set-player-root", "floater"]);

    const phase = planProjectileCollisions({
      projectiles: [shot], actors: [], player: { ...PROJECTILE_PLAYER, dashTimer: 0.2, dashX: -1 },
      tuning: { ...COLLISION_TUNING, phaseStep: true },
    });
    expect(phase.map((intent) => intent.type)).toEqual([
      "deflect-projectile", "fx-burst", "fx-flash", "floater", "add-style", "sound",
    ]);
    expect(phase[0]).toMatchObject({ dx: -1, dy: 0, perfect: false });
  });

  it("resolves reflected shots in enemy order with pierce memory and exact damage ownership", () => {
    const actors = [combatActor("first", { x: 100, y: 100 }), combatActor("second", { x: 105, y: 100 })];
    const stopped = planProjectileCollisions({
      projectiles: [projectile("reflected", { deflected: true, perfect: true })], actors,
      player: { ...PROJECTILE_PLAYER, x: 1000 }, tuning: { ...COLLISION_TUNING, parryStun: true, aegisParry: true },
    });
    expect(stopped.find((intent) => intent.type === "damage-enemy")).toMatchObject({
      enemyId: "first", damage: 28 * CONFIG.blade.deflectDmgMult * 1.5,
      sourceId: "owner", parryStun: 0.7, aegisParry: true,
    });
    expect(stopped.filter((intent) => intent.type === "damage-enemy")).toHaveLength(1);
    expect(stopped.at(-1)).toEqual({ type: "projectile-patch", projectileId: "reflected", patch: { dead: true } });

    const piercing = planProjectileCollisions({
      projectiles: [projectile("pierce", { deflected: true, pierce: true, piercedIds: new Set(["first"]) })],
      actors, player: { ...PROJECTILE_PLAYER, x: 1000 }, tuning: COLLISION_TUNING,
    });
    expect(piercing.find((intent) => intent.type === "damage-enemy")).toMatchObject({ enemyId: "second" });
    const patch = piercing.at(-1);
    expect(patch?.type).toBe("projectile-patch");
    if (patch?.type === "projectile-patch") expect([...patch.patch.piercedIds ?? []]).toEqual(["first", "second"]);
  });

  it("preserves returned, phase-stepped, and damaging sweeper branches", () => {
    const owner = combatActor("owner", { x: 100, y: 100, radius: 30 });
    const returned = planProjectileCollisions({
      projectiles: [projectile("s", { family: "sweeper", sweeperState: "returned", hasCounteredCallback: true })],
      actors: [owner], player: PROJECTILE_PLAYER, tuning: COLLISION_TUNING,
    });
    expect(returned.map((intent) => intent.type)).toEqual(["sweeper-countered-callback", "shatter-sweeper"]);
    const hostile = projectile("s", { family: "sweeper", sweeperState: "hostile" });
    const damage = planProjectileCollisions({ projectiles: [hostile], actors: [owner], player: PROJECTILE_PLAYER, tuning: COLLISION_TUNING });
    expect(damage[0]).toMatchObject({ type: "damage-player", cause: "sweeper" });
    const phase = planProjectileCollisions({
      projectiles: [hostile], actors: [owner], player: { ...PROJECTILE_PLAYER, dashTimer: 0.2 },
      tuning: { ...COLLISION_TUNING, phaseStep: true },
    });
    expect(phase[0]).toMatchObject({ type: "counter-sweeper", method: "phaseStep" });
  });

  it("curves Warlock shots once without changing speed and leaves dead/already-curved shots alone", () => {
    const waiting = resolveProjectileCurves({
      projectiles: [projectile("curve", { curve: true, curveT: 0.5 })], player: { x: 100, y: 300 },
      dt: 0.2, defaultSpeed: CONFIG.proj.speed, enemyShotColor: CONFIG.colors.enemyShot,
    });
    expect(waiting).toEqual([{ type: "projectile-patch", projectileId: "curve", patch: { curveT: 0.3 } }]);
    const curved = resolveProjectileCurves({
      projectiles: [projectile("curve", { curve: true, curveT: 0.1, vx: 300, vy: 400 })], player: { x: 100, y: 300 },
      dt: 0.2, defaultSpeed: CONFIG.proj.speed, enemyShotColor: CONFIG.colors.enemyShot,
    });
    expect(curved[0]).toMatchObject({ type: "projectile-patch", patch: { vx: 0, vy: 500, curved: true, curveT: -0.1 } });
    expect(curved[1]?.type).toBe("fx-burst");
  });

  it("materializes mud and preserves mine settle, arming, delayed trigger, and deflected persistence", () => {
    const mud = resolveSpecialProjectiles({
      projectiles: [projectile("mud", { mud: true, y: CONFIG.world.groundY - 5 })], actors: [], player: PROJECTILE_PLAYER,
      dt: 0.1, tuning: SPECIAL_TUNING, achievementTracking: true, nextSlowZoneSequence: 2,
    });
    expect(mud.nextSlowZoneSequence).toBe(3);
    expect(mud.intents[0]).toMatchObject({ type: "add-slow-zone", zone: { id: "sludge-zone:2", r: CONFIG.exotic.sludgeZoneR, life: CONFIG.exotic.sludgeZoneLife } });

    const armingMine = projectile("mine", {
      mine: true, y: CONFIG.world.groundY, armT: 0.05, x: PROJECTILE_PLAYER.x, life: 1,
    });
    const armed = resolveSpecialProjectiles({
      projectiles: [armingMine], actors: [], player: PROJECTILE_PLAYER, dt: 0.1,
      tuning: SPECIAL_TUNING, achievementTracking: true, nextSlowZoneSequence: 0,
    });
    expect(armed.intents).toEqual([{ type: "projectile-patch", projectileId: "mine", patch: {
      y: CONFIG.world.groundY - 9, vx: 0, vy: 0, armT: -0.05, armed: true, life: 6,
    } }]);
    const triggered = resolveSpecialProjectiles({
      projectiles: [{ ...armingMine, armed: true, armT: -0.05 }], actors: [],
      player: { ...PROJECTILE_PLAYER, y: CONFIG.world.groundY - PROJECTILE_PLAYER.hh }, dt: 0.1,
      tuning: SPECIAL_TUNING, achievementTracking: true, nextSlowZoneSequence: 0,
    });
    expect(triggered.intents.map((intent) => intent.type)).toEqual([
      "fx-explode", "shake", "flash", "sound", "damage-player", "projectile-patch",
    ]);
    expect(triggered.intents.at(-1)).toMatchObject({ patch: { dead: true, life: 6 } });
    const safe = resolveSpecialProjectiles({
      projectiles: [{ ...armingMine, armed: true, deflected: true }], actors: [],
      player: { ...PROJECTILE_PLAYER, y: CONFIG.world.groundY - PROJECTILE_PLAYER.hh }, dt: 0.1,
      tuning: SPECIAL_TUNING, achievementTracking: true, nextSlowZoneSequence: 0,
    });
    expect(safe.intents).toEqual([{ type: "projectile-patch", projectileId: "mine", patch: {
      y: CONFIG.world.groundY - 9, vx: 0, vy: 0, life: 6,
    } }]);
  });

  it("resolves deflected and hostile bomb ownership plus bomber-death betrayal independently", () => {
    const bomber = combatActor("bomber", { x: 200, y: 200, isBomber: true });
    const deflected = planBombExplosion(200, 200, true, "bomber", [bomber], PROJECTILE_PLAYER, SPECIAL_TUNING, true);
    expect(deflected.at(-1)).toMatchObject({
      type: "damage-enemy-aoe", playerOwned: true, damage: CONFIG.bomber.blastDmg * 1.3,
      achievement: { kind: "deflected-bomb", bomberIds: ["bomber"], minimumKills: 5 },
    });
    const hostile = planBombExplosion(100, 100, false, "bomber", [], PROJECTILE_PLAYER, SPECIAL_TUNING, true);
    expect(hostile.at(-1)).toMatchObject({ type: "damage-player", sourceId: "bomber", cause: "bomb" });
    const death = planBomberDeathExplosion(bomber, PROJECTILE_PLAYER, SPECIAL_TUNING, true);
    expect(death.find((intent) => intent.type === "damage-enemy-aoe")).toMatchObject({
      playerOwned: false, sourceId: "bomber", achievement: { kind: "bomber-betrayal" },
    });
  });

  it("detonates deflected bombs on live enemies and hostile bombs on ground or player overlap", () => {
    const result = resolveSpecialProjectiles({
      projectiles: [
        projectile("returned-bomb", { bomb: true, deflected: true, x: 300, y: 300 }),
        projectile("ground-bomb", { bomb: true, x: 900, y: CONFIG.world.groundY }),
      ],
      actors: [combatActor("target", { x: 300, y: 300 })],
      player: PROJECTILE_PLAYER, dt: 0.1, tuning: SPECIAL_TUNING,
      achievementTracking: false, nextSlowZoneSequence: 0,
    });
    const patches = result.intents.filter((intent) => intent.type === "projectile-patch");
    expect(patches).toEqual([
      { type: "projectile-patch", projectileId: "returned-bomb", patch: { dead: true } },
      { type: "projectile-patch", projectileId: "ground-bomb", patch: { dead: true } },
    ]);
    expect(result.intents.filter((intent) => intent.type === "damage-enemy-aoe")).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { GRAFT_ANCHOR_TIMING, GRAFT_ANCHOR_TYPES, isGraftAnchorState, type GraftAnchorPlacementRequest, type RootboundGraftEffects } from "../../src/gameplay/environment/graft-anchor";
import { ROOTBOUND_GRAFT_ANCHOR_GEOMETRY, ROOTBOUND_MEMORY_CHOIR } from "../../src/gameplay/entities/enemy-types/rootbound";
import { ROOTBOUND_BLOOM_PATTERN_IDS, type RootboundBloomPatternId } from "../../src/gameplay/environment/bloom-well";
import { ROOT_CAGE_GEOMETRY, ROOT_CAGE_TIMING, isRootCageState, type RootCagePlacementRequest } from "../../src/gameplay/environment/root-cage";
import { createEnemyHarness } from "./enemy-test-harness";
import { environmentSnapshotToObservation, validateEnvironmentCodecPayload } from "../../src/tearbench/environment-codec";
import { createRootbinderState } from "../../src/gameplay/entities/rootbinder-runtime";

type PhaseTwoBoss = InstanceType<ReturnType<typeof createEnemyHarness>["types"]["Rootbound"]> & {
  graftAnchorPlacements(): readonly GraftAnchorPlacementRequest[];
  bloomPatternIndex: number;
  bossBloomPattern(): RootboundBloomPatternId | null;
  startRootCage(centerX: number): boolean;
  rootCagePlacement(): RootCagePlacementRequest | null;
  completeRootCage(): void;
};

describe("Rootbound Phase II Graft creation", () => {
  it("derives the exact authored placement requests only during Phase II", () => {
    const harness = createEnemyHarness();
    const actor = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as PhaseTwoBoss;
    expect(actor.graftAnchorPlacements()).toEqual([]);
    actor.hp = actor.maxHp * 0.5;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    const placements = actor.graftAnchorPlacements();
    expect(placements.map((placement) => placement.graftType)).toEqual(GRAFT_ANCHOR_TYPES);
    expect(placements.every((placement) => placement.geometry.w === ROOTBOUND_GRAFT_ANCHOR_GEOMETRY.width
      && placement.geometry.h === ROOTBOUND_GRAFT_ANCHOR_GEOMETRY.height)).toBe(true);
    actor.hp = actor.maxHp * 0.2;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    expect(actor.graftAnchorPlacements()).toEqual([]);
  });

  it("creates each request once through the canonical environment collection with the stable live owner ID", () => {
    const harness = createEnemyHarness();
    const actor = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as PhaseTwoBoss;
    actor.hp = actor.maxHp * 0.5;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "rootbound-phase-two" });
    environment.setRootboundActorsSource(() => [Object.freeze({
      id: "enemy:rootbound-live",
      source: actor,
      state: Object.freeze({
        stage: null,
        geometry: actor.rootlineGeometry(),
        damage: 0,
        cleanupReason: null,
        graftPlacements: actor.graftAnchorPlacements(),
        ownerPosition: Object.freeze({ x: actor.x, y: actor.y }),
      }),
    })]);
    environment.step(240, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    environment.step(241, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    const grafts = environment.combatObjects().filter(isGraftAnchorState);
    expect(grafts).toHaveLength(3);
    expect(grafts.map((graft) => graft.id)).toEqual([
      "enemy:rootbound-live:graft:bastion",
      "enemy:rootbound-live:graft:mercy",
      "enemy:rootbound-live:graft:haste",
    ]);
    expect(grafts.map((graft) => graft.graftType)).toEqual(GRAFT_ANCHOR_TYPES);
    expect(grafts.every((graft) => graft.ownerId === "enemy:rootbound-live" && graft.targetId === "enemy:rootbound-live")).toBe(true);
  });

  it("keeps Rootbound directly damageable while all three canonical Grafts exist and are active", () => {
    const harness = createEnemyHarness();
    const actor = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as PhaseTwoBoss;
    actor.hp = actor.maxHp * 0.5;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "rootbound-direct-damage" });
    environment.setRootboundActorsSource(() => [Object.freeze({
      id: "enemy:rootbound-live",
      source: actor,
      state: Object.freeze({ stage: null, geometry: actor.rootlineGeometry(), damage: 0, cleanupReason: null,
        graftPlacements: actor.graftAnchorPlacements(), ownerPosition: Object.freeze({ x: actor.x, y: actor.y }) }),
    })]);
    environment.step(240, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    for (const graft of environment.combatObjects().filter(isGraftAnchorState)) environment.updateCombatObject(graft.id, { state: "active" });
    expect(environment.combatObjects().filter(isGraftAnchorState)).toHaveLength(3);
    expect(actor.blocksDamage()).toBe(false);
    expect(actor.limitIncomingDamage(20)).toBe(20);
    const hpBefore = actor.hp;
    expect(actor._dot(20)).toBe(20);
    expect(actor.hp).toBe(hpBefore - 20);
  });

  it("activates bounded effects, spends Mercy canonically, removes destroyed effects, and cleans the phase", () => {
    const harness = createEnemyHarness();
    const actor = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as PhaseTwoBoss;
    actor.hp = actor.maxHp * 0.5;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "rootbound-graft-lifecycle" });
    environment.setRootboundActorsSource(() => [Object.freeze({
      id: "enemy:rootbound-live",
      source: actor,
      applyGraftEffects: (effects: RootboundGraftEffects) => { actor.applyGraftEffects(effects); },
      recoverGraftHealth: (fraction: number) => actor.recoverGraftHealth(fraction),
      state: Object.freeze({ stage: null, geometry: actor.rootlineGeometry(), damage: 0, cleanupReason: null,
        graftPlacements: actor.graftAnchorPlacements(), ownerPosition: Object.freeze({ x: actor.x, y: actor.y }) }),
    })]);
    environment.step(240, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    expect(environment.combatObjects().filter(isGraftAnchorState).map((graft) => graft.state)).toEqual(["warning", "warning", "warning"]);
    environment.step(240 + GRAFT_ANCHOR_TIMING.warningTicks, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    expect(actor).toMatchObject({ graftDamageTakenMultiplier: 0.8, graftCadenceMultiplier: 1.15,
      activeGraftTypes: ["bastion", "mercy", "haste"] });
    expect(actor.limitIncomingDamage(20)).toBe(16);

    const mercy = environment.combatObjects().filter(isGraftAnchorState).find((graft) => graft.graftType === "mercy");
    if (mercy?.nextPulseTick == null) throw new TypeError("expected Mercy Graft");
    const hpBeforeMercy = actor.hp;
    environment.step(mercy.nextPulseTick, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    const spentMercy = environment.combatObjects().filter(isGraftAnchorState).find((graft) => graft.graftType === "mercy");
    expect(actor.hp).toBeCloseTo(hpBeforeMercy + actor.maxHp * 0.015, 8);
    expect(spentMercy?.recoverySpentHealthFraction).toBeCloseTo(0.015, 8);

    const bastion = environment.combatObjects().filter(isGraftAnchorState).find((graft) => graft.graftType === "bastion");
    const haste = environment.combatObjects().filter(isGraftAnchorState).find((graft) => graft.graftType === "haste");
    if (bastion === undefined || haste === undefined) throw new TypeError("expected active protection Grafts");
    expect(environment.damageCombatObject(bastion.id, bastion.integrity, "break-bastion", mercy.nextPulseTick + 1).destroyed).toBe(true);
    expect(actor.graftDamageTakenMultiplier).toBe(1);
    expect(actor.graftCadenceMultiplier).toBe(1.15);
    expect(environment.damageCombatObject(haste.id, haste.integrity, "break-haste", mercy.nextPulseTick + 2).destroyed).toBe(true);
    expect(actor.graftCadenceMultiplier).toBe(1);

    actor.hp = actor.maxHp * 0.2;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    environment.step(mercy.nextPulseTick + 3, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    expect(environment.combatObjects().filter(isGraftAnchorState).find((graft) => graft.graftType === "mercy")).toMatchObject({
      state: "expired", cleanupReason: "stage-transition",
    });
    expect(actor).toMatchObject({ graftDamageTakenMultiplier: 1, graftCadenceMultiplier: 1, activeGraftTypes: [] });
  });

  it("projects the selected authored Bloom arrangement into the shared production field runtime", () => {
    const harness = createEnemyHarness();
    const actor = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as PhaseTwoBoss;
    actor.hp = actor.maxHp * 0.5;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    expect(actor.bossBloomPattern()).toBe(ROOTBOUND_BLOOM_PATTERN_IDS[0]);
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "rootbound-bloom-production" });
    environment.setRootboundActorsSource(() => [Object.freeze({
      id: "enemy:rootbound-live", source: actor,
      state: Object.freeze({ stage: null, geometry: actor.rootlineGeometry(), damage: 0, cleanupReason: null,
        bloomPattern: actor.bossBloomPattern(), arena: Object.freeze({ width: CONFIG.view.w, groundY: CONFIG.world.groundY }) }),
    })]);
    environment.step(240, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    environment.step(241, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    expect(environment.fields()).toHaveLength(2);
    expect(environment.fields().every((field) => field.kind === "bloom-well" && field.ownerId === "enemy:rootbound-live")).toBe(true);
    actor.bloomPatternIndex = 2;
    environment.step(242, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    expect(environment.fields().filter((field) => field.patternId?.startsWith("bloom-well/rootbound/cage-route") === true)).toHaveLength(3);
  });

  it("runs Memory Choir as three bounded boss-owned attack manifestations rather than enemy clones", () => {
    const harness = createEnemyHarness();
    const actor = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as PhaseTwoBoss;
    actor.hp = actor.maxHp * 0.5;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    expect(actor.startMemoryChoir()).toBe(true);
    expect(actor.memoryChoirManifestations).toHaveLength(ROOTBOUND_MEMORY_CHOIR.maxManifestations);
    expect(actor.memoryChoirManifestations.every((manifestation) => !("hp" in manifestation) && !("kind" in manifestation))).toBe(true);
    const first = actor.memoryChoirManifestations[0];
    if (first === undefined) throw new TypeError("expected Memory Choir manifestation");
    harness.player.x = first.x + first.w / 2;
    harness.player.y = first.y + first.h / 2;
    actor.update(ROOTBOUND_MEMORY_CHOIR.warning - 1 / 120, harness.platforms, harness.player, []);
    expect(harness.player.damage).toEqual([]);
    actor.update(1 / 120, harness.platforms, harness.player, []);
    expect(actor.memoryChoirStage).toBe("active");
    expect(harness.player.damage).toEqual([]);
    actor.update(1 / 120, harness.platforms, harness.player, []);
    actor.update(1 / 120, harness.platforms, harness.player, []);
    expect(harness.player.damage).toEqual([expect.objectContaining({ amount: ROOTBOUND_MEMORY_CHOIR.damage, source: actor })]);

    actor.hp = actor.maxHp * 0.2;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    expect(actor.memoryChoirStage).toBeNull();
    expect(actor.memoryChoirManifestations).toEqual([]);
  });

  it("places Root Cage through the canonical root-link owner with a guaranteed sever response and bounded expiry", () => {
    const harness = createEnemyHarness();
    const actor = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as PhaseTwoBoss;
    actor.hp = actor.maxHp * 0.5;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    expect(actor.startRootCage(harness.player.x)).toBe(true);
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "rootbound-root-cage" });
    const cagePlayer = { x: CONFIG.view.w / 2, y: CONFIG.world.groundY - 32, vx: 0 };
    environment.setRootboundActorsSource(() => [Object.freeze({
      id: "enemy:rootbound-live", source: actor, completeRootCage: () => { actor.completeRootCage(); },
      player: Object.freeze({ ...cagePlayer, hw: 20, hh: 32, invulnerable: false, hazardDamageMultiplier: 1,
        takeDamage: () => undefined, applyCageConstraint: (x: number, vx: number) => { cagePlayer.x = x; cagePlayer.vx = vx; } }),
      state: Object.freeze({ stage: null, geometry: actor.rootlineGeometry(), damage: 0, cleanupReason: null,
        rootCagePlacement: actor.rootCagePlacement() }),
    })]);

    const startTick = 300;
    environment.step(startTick, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    const warning = environment.combatObjects().filter(isRootCageState);
    expect(warning).toHaveLength(2);
    expect(warning.map((boundary) => boundary.boundarySide)).toEqual(["left", "right"]);
    expect(warning.every((boundary) => boundary.state === "warning"
      && boundary.counterplayTags.includes("cut") && boundary.counterplayTags.includes("break")
      && boundary.ownerId === "enemy:rootbound-live" && !boundary.procEligible)).toBe(true);
    expect(validateEnvironmentCodecPayload({ slowZones: [], walls: [], ...environment.snapshot() })).toEqual([]);
    expect(environmentSnapshotToObservation(environment.snapshot()).combatObjects).toEqual(expect.arrayContaining([
      expect.objectContaining({ rootCageId: "enemy:rootbound-live:root-cage:g1", boundarySide: "left", response: "sever-either-boundary" }),
      expect.objectContaining({ rootCageId: "enemy:rootbound-live:root-cage:g1", boundarySide: "right", response: "sever-either-boundary" }),
    ]));
    const [left, right] = warning;
    if (left === undefined || right === undefined || left.geometry.w === undefined) throw new TypeError("expected Root Cage boundaries");
    expect(right.geometry.x - (left.geometry.x + left.geometry.w)).toBe(ROOT_CAGE_GEOMETRY.interiorWidth);

    environment.step(startTick + ROOT_CAGE_TIMING.warningTicks - 1, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    expect(environment.combatObjects().filter(isRootCageState).every((boundary) => boundary.state === "warning")).toBe(true);
    environment.step(startTick + ROOT_CAGE_TIMING.warningTicks, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    const active = environment.combatObjects().filter(isRootCageState);
    expect(active.every((boundary) => boundary.state === "active")).toBe(true);
    const leftActive = active.find((boundary) => boundary.boundarySide === "left");
    if (leftActive?.geometry.w === undefined) throw new TypeError("expected left Root Cage boundary");
    cagePlayer.x = leftActive.geometry.x + leftActive.geometry.w + 10;
    cagePlayer.vx = -120;
    environment.step(startTick + ROOT_CAGE_TIMING.warningTicks + 1, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    expect(cagePlayer).toMatchObject({ x: leftActive.geometry.x + leftActive.geometry.w + 20, vx: 0 });
    expect(environment.damageCombatObject(leftActive.id, leftActive.integrity, "sever-root-cage", startTick + ROOT_CAGE_TIMING.warningTicks + 1).destroyed).toBe(true);
    expect(environment.combatObjects().filter(isRootCageState).some((boundary) => boundary.boundarySide === "right" && boundary.state === "active")).toBe(true);
    cagePlayer.x = leftActive.geometry.x + leftActive.geometry.w + 10;
    cagePlayer.vx = -120;
    environment.step(startTick + ROOT_CAGE_TIMING.warningTicks + 2, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    expect(cagePlayer).toMatchObject({ x: leftActive.geometry.x + leftActive.geometry.w + 10, vx: -120 });

    environment.step(startTick + ROOT_CAGE_TIMING.warningTicks + ROOT_CAGE_TIMING.activeTicks, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    expect(environment.combatObjects().filter(isRootCageState).every((boundary) => boundary.state === "destroyed" || boundary.state === "expired")).toBe(true);
    expect(actor.rootCagePlacement()).toBeNull();
  });

  it("suspends Root Cage collision while the canonical player leash is active, then restores it after leash cleanup", () => {
    const harness = createEnemyHarness();
    const actor = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as PhaseTwoBoss;
    actor.hp = actor.maxHp * 0.5;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    expect(actor.startRootCage(CONFIG.view.w / 2)).toBe(true);
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "root-cage-leash-policy" });
    const cagePlayer = { x: CONFIG.view.w / 2, y: CONFIG.world.groundY - 32, vx: 0, vy: 0, jumpEnabled: true, dashEnabled: true };
    const rootbinder = createRootbinderState({ id: "rootbinder:live", worldId: environment.worldId, stageId: environment.stageId, x: 0, y: cagePlayer.y });
    let rootbinderPhase: "linked" | "broken" = "linked";
    environment.setRootbinderActorsSource(() => [Object.freeze({
      id: rootbinder.id, state: Object.freeze({ ...rootbinder, state: rootbinderPhase, transitionTick: 1_000 }),
      candidates: Object.freeze([]),
      player: Object.freeze({ id: "player", ...cagePlayer, alive: true,
        apply: (value: { readonly vx: number; readonly vy: number }) => { cagePlayer.vx = value.vx; cagePlayer.vy = value.vy; } }),
    })]);
    environment.setRootboundActorsSource(() => [Object.freeze({
      id: "enemy:rootbound-live", source: actor, completeRootCage: () => { actor.completeRootCage(); },
      player: Object.freeze({ ...cagePlayer, hw: 20, hh: 32, invulnerable: false, hazardDamageMultiplier: 1,
        takeDamage: () => undefined, applyCageConstraint: (x: number, vx: number) => { cagePlayer.x = x; cagePlayer.vx = vx; } }),
      state: Object.freeze({ stage: null, geometry: actor.rootlineGeometry(), damage: 0, cleanupReason: null,
        rootCagePlacement: actor.rootCagePlacement() }),
    })]);

    const startTick = 400;
    environment.step(startTick, 1 / 120, () => undefined, new Set(["enemy:rootbound-live", rootbinder.id, "player"]));
    environment.step(startTick + 1, 1 / 120, () => undefined, new Set(["enemy:rootbound-live", rootbinder.id, "player"]));
    const leash = environment.combatObjects().find((object) => object.id.includes(":leash:"));
    expect(leash?.state).toBe("active");
    environment.step(startTick + ROOT_CAGE_TIMING.warningTicks, 1 / 120, () => undefined, new Set(["enemy:rootbound-live", rootbinder.id, "player"]));
    const left = environment.combatObjects().filter(isRootCageState).find((boundary) => boundary.boundarySide === "left");
    if (left?.geometry.w === undefined) throw new TypeError("expected active left Root Cage boundary");
    cagePlayer.x = left.geometry.x + left.geometry.w + 10;
    cagePlayer.vx = -120;
    environment.step(startTick + ROOT_CAGE_TIMING.warningTicks + 1, 1 / 120, () => undefined, new Set(["enemy:rootbound-live", rootbinder.id, "player"]));
    expect(cagePlayer.x).toBe(left.geometry.x + left.geometry.w + 10);
    expect(cagePlayer.vx).toBeLessThan(0);
    expect(cagePlayer.jumpEnabled && cagePlayer.dashEnabled).toBe(true);

    rootbinderPhase = "broken";
    environment.step(startTick + ROOT_CAGE_TIMING.warningTicks + 2, 1 / 120, () => undefined, new Set(["enemy:rootbound-live", rootbinder.id, "player"]));
    expect(cagePlayer).toMatchObject({ x: left.geometry.x + left.geometry.w + 20, vx: 0 });
    expect(environment.combatObjects().find((object) => object.id.includes(":leash:"))).toMatchObject({ state: "expired", cleanupReason: "stage-transition" });
  });
});

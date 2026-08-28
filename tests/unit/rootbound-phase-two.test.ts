import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { GRAFT_ANCHOR_TYPES, isGraftAnchorState, type GraftAnchorPlacementRequest } from "../../src/gameplay/environment/graft-anchor";
import { ROOTBOUND_GRAFT_ANCHOR_GEOMETRY } from "../../src/gameplay/entities/enemy-types/rootbound";
import { createEnemyHarness } from "./enemy-test-harness";

type PhaseTwoBoss = InstanceType<ReturnType<typeof createEnemyHarness>["types"]["Rootbound"]> & {
  graftAnchorPlacements(): readonly GraftAnchorPlacementRequest[];
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
});

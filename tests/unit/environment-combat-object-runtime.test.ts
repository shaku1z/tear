import { describe, expect, it } from "vitest";
import { cleanupOrphanedEnvironmentCombatObjects, createEnvironmentCombatObjectRuntime } from "../../src/gameplay/environment/combat-object-runtime";
import { ENVIRONMENT_OBJECT_DEFINITIONS } from "../../src/gameplay/environment/environment-definitions";
import type { EnvironmentCombatObjectState } from "../../src/gameplay/environment/environment-contracts";
import { forgeEnvironmentCombatObjectState } from "../../src/tearbench/state-forge-factories";
import type { TearSdlDocumentV1 } from "../../src/tearbench/tearsdl";
import { TearGameplayEventBus } from "../../src/gameplay/runtime/gameplay-events";

const object: EnvironmentCombatObjectState = {
  id: "link-test", kind: "root-link", ownerId: "enemy:1", targetId: "player", geometry: { x: 0, y: 0, w: 10, h: 4 },
  integrity: 5, maxIntegrity: 5, counterplayTags: ["cut"], procEligible: false, damageDedupeId: "link-test-hit",
  state: "active", stateTick: 0, cleanupReason: null,
};

describe("generic environment combat-object kernel", () => {
  it("uses source-owned counterplay metadata and keeps routes behavior-minimal", () => {
    expect(ENVIRONMENT_OBJECT_DEFINITIONS["root-link"].counterplayTags).toEqual(["cut", "break"]);
    expect(ENVIRONMENT_OBJECT_DEFINITIONS["graft-anchor"].counterplayTags).toEqual(["cut", "break", "projectile-cut"]);
    expect(ENVIRONMENT_OBJECT_DEFINITIONS["regrowth-link"].behavior).toBe("data-only-route");
    const base: TearSdlDocumentV1 = {
      format: "tearsdl", schemaVersion: 1, id: "combat-forge", stateClass: "surgical-valid", seed: "combat-forge",
      start: { mode: "endless", difficulty: "normal", weapon: "sword" },
    };
    const forged = forgeEnvironmentCombatObjectState(base, object);
    const entry = (forged.state?.environment as { combatObjects: readonly Record<string, unknown>[] }).combatObjects[0];
    expect(entry?.factoryId).toBe("environment-combat-object");
  });

  it("deduplicates attack IDs, destroys at zero integrity, and denies enemy rewards/procs", () => {
    const runtime = createEnvironmentCombatObjectRuntime(object);
    expect(runtime.policy).toMatchObject({ countsAsOrdinaryEnemy: false, grantsEnemyReward: false, procEligible: false });
    expect(runtime.damage(2, "attack-1")).toMatchObject({ accepted: true, integrity: 3, duplicate: false });
    expect(runtime.damage(2, "attack-1")).toMatchObject({ accepted: false, duplicate: true, integrity: 3 });
    expect(runtime.damage(3, "attack-2")).toMatchObject({ accepted: true, integrity: 0, destroyed: true });
    expect(runtime.state.state).toBe("destroyed");
  });

  it("publishes damage and destruction in stable within-tick order", () => {
    const events = new TearGameplayEventBus(() => 0);
    const names: string[] = [];
    events.subscribe((event) => { if (event.kind === "environment") names.push(event.event); });
    const runtime = createEnvironmentCombatObjectRuntime({ ...object, integrity: 1, maxIntegrity: 1 }, undefined, events);
    runtime.damage(1, "attack-event", 7);
    expect(names).toEqual(["combat-object-damaged", "combat-object-destroyed"]);
  });

  it("supports explicit cleanup and rejects invalid damage", () => {
    const runtime = createEnvironmentCombatObjectRuntime(object);
    expect(runtime.cleanup("boss-terminal").cleanupReason).toBe("boss-terminal");
    expect(runtime.state.state).toBe("expired");
    expect(() => runtime.damage(-1, "attack")).toThrow(/damage/u);
    expect(() => runtime.damage(1, "")).toThrow(/attack ID/u);
  });

  it("cleans owner/target orphans without mutating another world", () => {
    const orphan = cleanupOrphanedEnvironmentCombatObjects([object], new Set(["player"]), "stage-transition")[0];
    expect(orphan?.state).toBe("expired");
    expect(orphan?.cleanupReason).toBe("stage-transition");
    const worldA = createEnvironmentCombatObjectRuntime({ ...object, id: "world-a:combat-object:0", ownerId: null });
    const worldB = createEnvironmentCombatObjectRuntime({ ...object, id: "world-b:combat-object:0", ownerId: null });
    expect(worldA.damage(1, "shared-attack").accepted).toBe(true);
    expect(worldB.damage(1, "shared-attack").accepted).toBe(true);
    expect(worldA.state.integrity).toBe(4);
    expect(worldB.state.integrity).toBe(4);
  });

  it("rejects non-finite or out-of-range initial integrity", () => {
    expect(() => createEnvironmentCombatObjectRuntime({ ...object, integrity: Number.NaN })).toThrow(/integrity/u);
    expect(() => createEnvironmentCombatObjectRuntime({ ...object, integrity: 6 })).toThrow(/integrity/u);
    expect(() => createEnvironmentCombatObjectRuntime(object, ["projectile-cut"])).toThrow(/not allowed/u);
    expect(() => createEnvironmentCombatObjectRuntime(object).damage(1, "x".repeat(257))).toThrow(/length/u);
  });
});

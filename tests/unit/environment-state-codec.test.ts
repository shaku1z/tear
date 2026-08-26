import { describe, expect, it } from "vitest";
import {
  ENVIRONMENT_OBJECT_KIND_REGISTRY,
  createDefaultStateCodecRegistry,
  createLiveStateCodec,
  TearStateCodecRegistry,
  buildTearIdentityGraph,
  restoreSnapshotTransactionally,
  environmentHash,
  projectEnvironmentSemanticSnapshot,
  environmentSnapshotToObservation,
  runInvariantChecks,
  type TearCodecWorld,
  type TearObservationV1,
} from "../../src/tearbench";
import { stableVerificationHash } from "../../src/replay/hash";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import type { EnvironmentSnapshot } from "../../src/gameplay/environment/environment-contracts";
import { projectCanonicalGameplayState } from "../../src/gameplay/runtime/canonical-state";

const hazard = {
  slowZones: [{ id: "slow-1", x: 10, y: 20 }],
  walls: [{ id: "wall-1", x: 40, y: 20, w: 10, h: 100 }],
  fields: [{ id: "field-1", kind: "bloom-well", geometry: { x: 10.12345, y: 20, radius: 25 }, state: "active", stateTick: 3, timer: 0.25, ownerId: null, schedule: null, eligibility: { player: true, enemies: true, bosses: false }, force: null, cleanupReason: null }],
  combatObjects: [{ id: "link-1", kind: "root-link", ownerId: "enemy-1", targetId: "player", geometry: { x: 0, y: 0, w: 80, h: 8 }, integrity: 4, maxIntegrity: 10, counterplayTags: ["cut"], procEligible: false, damageDedupeId: "link-1-hit", state: "active", stateTick: 3, cleanupReason: null }],
  routes: [{ id: "route-1", kind: "regrowth-link", points: [{ x: 0, y: 0 }, { x: 20, y: 40 }], state: "active", stateTick: 3, ownerId: "enemy-1", cleanupReason: null }],
} as const;

function world(): TearCodecWorld {
  return { components: new Map([["tear.hazard.v1", hazard]]), references: new Map(), entityIds: new Set(["player", "enemy-1"]) };
}

function observation(environment: NonNullable<TearObservationV1["environment"]>): TearObservationV1 {
  return {
    format: "tear-contract", kind: "observation", schemaVersion: 1, tick: 3, observationClass: "structured-state",
    player: { x: 0, y: 0, vx: 0, vy: 0, hp: 10, maxHp: 10, facing: 1, grounded: true, dashCharges: 0 },
    blade: { handX: 0, handY: 0, tipX: 0, tipY: 0, vx: 0, vy: 0, tipSpeed: 0, state: "held" },
    entities: [{ id: "enemy-1", kind: "charger", x: 0, y: 0, vx: 0, vy: 0 }],
    run: { mode: "endless", difficulty: "normal", weapon: "sword", stage: "forest", wave: 1, score: 0, elapsedTicks: 3 },
    availableActions: [], environment,
  };
}

describe("Verdant C3 environment codec contract", () => {
  it("reports hazard codec v2 and migrates v1 without dropping legacy hazards", () => {
    const codec = createDefaultStateCodecRegistry().get("tear.hazard.v1");
    expect(codec.version).toBe(2);
    const migrated = codec.migrate({ slowZones: hazard.slowZones, walls: hazard.walls }, 1) as Record<string, unknown>;
    expect(migrated.slowZones).toEqual(hazard.slowZones);
    expect(migrated.walls).toEqual(hazard.walls);
    expect(migrated.fields).toEqual([]);
    expect(migrated.combatObjects).toEqual([]);
    expect(migrated.routes).toEqual([]);
    expect(() => codec.migrate(migrated, 3)).toThrow(/schema version/);
  });

  it("validates environment geometry, caps, kinds, and references before restore", () => {
    const codec = createDefaultStateCodecRegistry().get("tear.hazard.v1");
    expect(codec.validate(hazard)).toEqual([]);
    const invalid = { ...hazard, fields: [{ ...hazard.fields[0], kind: "unknown-kind", geometry: { x: Number.NaN, y: 0 } }] };
    const issues = codec.validate(invalid);
    expect(issues.some((entry) => entry.path.endsWith(".kind"))).toBe(true);
    expect(issues.some((entry) => entry.path.endsWith(".geometry.x"))).toBe(true);
  });

  it("indexes environment IDs and owner/target references as one graph", () => {
    const graph = buildTearIdentityGraph(world());
    expect(graph.identities.get("field-1")?.codecId).toBe("tear.hazard.v1");
    expect(graph.identities.get("link-1")?.codecId).toBe("tear.hazard.v1");
    expect(graph.issues).toEqual([]);
    const orphan = world();
    orphan.components.set("tear.hazard.v1", { ...hazard, combatObjects: [{ ...hazard.combatObjects[0], targetId: "missing" }] });
    expect(buildTearIdentityGraph(orphan).issues.some((entry) => entry.message.includes("missing"))).toBe(true);
    const plural = world();
    plural.components.set("tear.hazard.v1", { ...hazard, combatObjects: [{ ...hazard.combatObjects[0], targetIds: ["player", "missing"], linkedActorIds: ["player", "missing"] }] });
    const pluralGraph = buildTearIdentityGraph(plural);
    expect(pluralGraph.references.has("tear.hazard.v1:$.combatObjects[0].targetIds[1]")).toBe(true);
    expect(pluralGraph.issues.filter((entry) => entry.message.includes("missing")).length).toBeGreaterThanOrEqual(2);
    const duplicate = world();
    duplicate.components.set("tear.hazard.v1", { ...hazard, combatObjects: [{ ...hazard.combatObjects[0], id: "field-1" }] });
    expect(buildTearIdentityGraph(duplicate).issues.some((entry) => entry.message.includes("duplicate entity id field-1"))).toBe(true);
  });

  it("hashes gameplay environment state while excluding presentation-only fields", () => {
    const first = { ...hazard, fields: [{ ...hazard.fields[0], cosmeticPetalSeed: 1 }] };
    const second = { ...hazard, fields: [{ ...hazard.fields[0], cosmeticPetalSeed: 99 }] };
    expect(environmentHash(first)).toBe(environmentHash(second));
    expect(environmentHash({ ...hazard, fields: [{ ...hazard.fields[0], timer: 0.5 }] })).not.toBe(environmentHash(hazard));
  });

  it("keeps non-empty semantic hashes and observations portable across world-scoped IDs", () => {
    const live = { worldId: "live-world", stageId: "verdant-sanctum", ...hazard,
      fields: [{ ...hazard.fields[0], id: "live-world:field:1" }],
      combatObjects: [{ ...hazard.combatObjects[0], id: "live-world:combat-object:2", ownerId: "live-world:field:1" }],
      routes: [{ ...hazard.routes[0], id: "live-world:route:3", ownerId: "live-world:combat-object:2" }] };
    const detached = { ...live, worldId: "detached-world",
      fields: [{ ...live.fields[0], id: "detached-world:field:1" }],
      combatObjects: [{ ...live.combatObjects[0], id: "detached-world:combat-object:2", ownerId: "detached-world:field:1" }],
      routes: [{ ...live.routes[0], id: "detached-world:route:3", ownerId: "detached-world:combat-object:2" }] };
    const liveRuntime = createEnvironmentRuntime({ stageId: live.stageId, worldId: live.worldId });
    const detachedRuntime = createEnvironmentRuntime({ stageId: detached.stageId, worldId: detached.worldId });
    liveRuntime.replace(live);
    detachedRuntime.replace(detached as unknown as EnvironmentSnapshot);
    expect(environmentHash(liveRuntime.snapshot())).toBe(environmentHash(detachedRuntime.snapshot()));
    expect(environmentSnapshotToObservation(liveRuntime.snapshot())).toEqual(environmentSnapshotToObservation(detachedRuntime.snapshot()));
    const input = { tick: 3, moveX: 0, moveY: 0, aimTurn: 0, primaryHeld: false } as const;
    const liveCanonical = projectCanonicalGameplayState(3, input, null, null, null, [], liveRuntime.snapshot());
    const detachedCanonical = projectCanonicalGameplayState(3, input, null, null, null, [], detachedRuntime.snapshot());
    expect(stableVerificationHash(liveCanonical)).toBe(stableVerificationHash(detachedCanonical));
    expect(projectEnvironmentSemanticSnapshot(live)).not.toHaveProperty("worldId");
  });

  it("projects structured environment facts and rejects unsupported invariant evidence", () => {
    const projected = environmentSnapshotToObservation({ stageId: "verdant-sanctum", ...hazard });
    const firstField = projected.fields[0];
    const firstCombatObject = projected.combatObjects[0];
    if (firstField === undefined || firstCombatObject === undefined) throw new Error("expected projected environment fixtures");
    expect(projected.fields[0]).toMatchObject({ id: "field-1", kind: "bloom-well", active: true });
    expect(projected.combatObjects[0]).toMatchObject({ integrityRatio: 0.4, targetId: "player" });
    const current = observation(projected);
    expect(runInvariantChecks(current, ["environment.finite-state", "environment.unique-id", "environment.valid-references", "environment.no-orphan-link", "environment.legal-transition", "environment.bounded"])).toEqual([]);
    const orphanObservation = observation({ ...projected, combatObjects: [{ ...firstCombatObject, ownerId: "missing" }] });
    expect(runInvariantChecks(orphanObservation, ["environment.no-orphan-link"])).toHaveLength(1);
    const prior = observation({ ...projected, fields: [{ ...firstField, state: "scheduled" }] });
    expect(runInvariantChecks(current, ["environment.legal-transition"], undefined, prior)).toEqual([]);
    const illegal = observation({ ...projected, fields: [{ ...firstField, state: "active" }] });
    expect(runInvariantChecks(illegal, ["environment.legal-transition"], undefined, observation({ ...projected, fields: [{ ...firstField, state: "destroyed" }] }))).toHaveLength(1);
    const missing = { ...observation(projected) } as { environment?: NonNullable<TearObservationV1["environment"]> };
    delete missing.environment;
    expect(() => runInvariantChecks(missing as TearObservationV1, ["environment.finite-state"])).toThrow(/structured environment/);
  });

  it("derives environment kind registry from the production owner", () => {
    expect(ENVIRONMENT_OBJECT_KIND_REGISTRY.has("bloom-well")).toBe(true);
    expect(ENVIRONMENT_OBJECT_KIND_REGISTRY.has("not-production")).toBe(false);
  });

  it("round-trips v2 serialization and leaves the active world untouched after a failed restore", () => {
    const registry = new TearStateCodecRegistry();
    registry.register(createLiveStateCodec("tear.hazard.v1"));
    const source = world();
    source.components.set("tear.hazard.v1", { ...hazard,
      combatObjects: [{ ...hazard.combatObjects[0], ownerId: null }], routes: [{ ...hazard.routes[0], ownerId: null }] });
    const captured = registry.get("tear.hazard.v1").capture(source);
    const snapshot = { format: "tear-contract" as const, kind: "snapshot" as const, schemaVersion: 1 as const,
      id: "environment-roundtrip", tick: 3, stateClass: "surgical-valid" as const, seed: "env", hashes: { exact: "", semantic: "", visual: "", progression: "", environment: "" },
      provenance: { actor: "state-forge" as const, producer: "environment-state-codec.test", build: { version: "1", revision: "test", target: "unit", rulesetVersion: "test", contentHash: "test", configHash: "test" }, executionClass: "engineering" as const, observationClass: "structured-state" as const, trainingConsent: "no-training" as const },
      rng: {}, codecs: { "tear.hazard.v1": 2 }, state: { "tear.hazard.v1": captured } };
    let active: TearCodecWorld = source; let commits = 0;
    const factory = { createEmpty: () => ({ components: new Map(), references: new Map(), entityIds: new Set<string>() }), validate: () => [] };
    const first = restoreSnapshotTransactionally(snapshot, registry, factory, { replace: (candidate) => { active = candidate; commits += 1; } });
    expect(first.ok).toBe(true);
    expect(environmentHash(active.components.get("tear.hazard.v1"))).toBe(environmentHash(captured));
    const hostile = { ...snapshot, state: { "tear.hazard.v1": { ...(captured as Record<string, unknown>), combatObjects: [{ ...hazard.combatObjects[0], ownerId: null, targetId: "orphan" }] } } };
    const failed = restoreSnapshotTransactionally(hostile, registry, factory, { replace: () => { commits += 1; } });
    expect(failed.ok).toBe(false);
    expect(commits).toBe(1);
    expect(stableVerificationHash(active.components.get("tear.hazard.v1"))).toBe(stableVerificationHash(captured));
  });
});

import { describe, expect, it } from "vitest";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import type { EnvironmentFieldState } from "../../src/gameplay/environment/environment-contracts";
import { TearSimulationRuntime } from "../../src/gameplay/runtime/tear-simulation-runtime";
import { TearGameplayEventBus, type TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";
import { environmentHash } from "../../src/tearbench/environment-codec";

const field = (state: EnvironmentFieldState["state"] = "scheduled") => ({
  kind: "bloom-well" as const, geometry: { x: 10, y: 20, radius: 30 }, state,
  stateTick: 0, timer: 0, ownerId: null, schedule: null,
  eligibility: { player: true, enemies: true, bosses: false }, force: null, cleanupReason: null,
});

describe("environment runtime", () => {
  it("reuses immutable snapshots until the environment revision changes", () => {
    const runtime = createEnvironmentRuntime({ stageId: "test", worldId: "snapshot-cache" });
    const first = runtime.snapshot();
    expect(runtime.snapshot()).toBe(first);
    const authored = field("active");
    runtime.addField(authored);
    authored.geometry.x = 999;
    expect(runtime.fields()[0]?.geometry.x).toBe(10);
    expect(Object.isFrozen(runtime.fields()[0]?.geometry)).toBe(true);
    const changed = runtime.snapshot();
    expect(changed).not.toBe(first);
    expect(runtime.snapshot()).toBe(changed);
    const fieldId = changed.fields[0]?.id;
    if (fieldId === undefined) throw new Error("expected the admitted environment field");
    runtime.updateField(fieldId, { timer: 2 });
    expect(changed.fields[0]?.timer).toBe(0);
    expect(runtime.snapshot().fields[0]?.timer).toBe(2);
  });

  it("owns data-only fields, combat objects, and routes with bounded deterministic IDs", () => {
    const first = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "alpha" });
    const second = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "beta" });
    const fieldId = first.addField(field());
    const objectId = first.addCombatObject({ kind: "graft-anchor", ownerId: null, targetId: null,
      geometry: { x: 1, y: 2 }, integrity: 10, maxIntegrity: 10, counterplayTags: ["cut", "break"],
      procEligible: false, damageDedupeId: "alpha-damage-1", state: "active", stateTick: 0, cleanupReason: null });
    const routeId = first.addRoute({ kind: "regrowth-link", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      state: "active", stateTick: 0, ownerId: null, cleanupReason: null });
    expect(fieldId).toBe("alpha:field:1"); expect(objectId).toBe("alpha:combat-object:2"); expect(routeId).toBe("alpha:route:3");
    expect(second.fields()).toEqual([]); expect(second.combatObjects()).toEqual([]); expect(second.routes()).toEqual([]);
    expect(first.fields()).not.toBe(second.fields()); expect(first.configuration).not.toBe(second.configuration);
    expect(first.simulationView()).toMatchObject({ stageId: "verdant-sanctum", worldId: "alpha" });
    expect(first.simulationView().fields[0]).not.toBe(field());
    const generatedA = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "generated-a" }); const generatedB = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "generated-b" });
    expect(generatedA.addField(field())).not.toBe(generatedB.addField(field()));
  });

  it("replaces transactionally and clears every supported lifecycle reason", () => {
    const runtime = createEnvironmentRuntime({ stageId: "test", worldId: "reset" });
    runtime.addField(field("active"));
    const snapshot = runtime.snapshot();
    runtime.replace(snapshot);
    expect(runtime.fields()).toHaveLength(1);
    for (const reason of ["new-run", "retry", "stage-transition", "boss-encounter-replacement", "boss-terminal", "defeat", "abandon", "tutorial-reset", "restore", "replay-seek", "disposal"] as const) {
      runtime.clear(reason); expect(runtime.fields()).toEqual([]); expect(runtime.simulationView().lastClearReason).toBe(reason);
      expect(runtime.addField(field())).toBe("reset:field:1"); runtime.clear(reason);
    }
  });

  it("owns the four environment phases in fixed order", () => {
    const phases: string[] = [];
    const runtime = createEnvironmentRuntime({ stageId: "test", worldId: "phases", hooks: {
      preStep: ({ phase }) => phases.push(phase), activeFields: ({ phase }) => phases.push(phase),
      resolveCollisions: ({ phase }) => phases.push(phase), postCommit: ({ phase }) => phases.push(phase),
    } });
    runtime.step(1, 1 / 120, () => undefined);
    expect(phases).toEqual(["pre-step", "active-fields", "collision-resolution", "post-commit"]);
    expect(runtime.phaseLog).toEqual(phases);
  });

  it("is invoked by the authoritative fixed-step owner around gameplay", () => {
    const order: string[] = [];
    const environment = createEnvironmentRuntime({ stageId: "test", worldId: "authoritative", hooks: {
      preStep: () => order.push("environment:pre-step"), activeFields: () => order.push("environment:active-fields"),
      resolveCollisions: () => order.push("environment:collision-resolution"), postCommit: () => order.push("environment:post-commit"),
    } });
    const runtime = new TearSimulationRuntime<{ readonly tick: number }>({
      environment, actionPort: { apply: () => { order.push("input"); } },
      step: () => { order.push("gameplay"); }, snapshot: (tick) => ({ tick }),
    });
    runtime.advanceOne([]);
    expect(order).toEqual(["input", "environment:pre-step", "gameplay", "environment:active-fields", "environment:collision-resolution", "environment:post-commit"]);
  });

  it("advances non-empty field/object state in the shared live and detached phase owner", () => {
    const run = (worldId: string) => {
      const events = new TearGameplayEventBus(() => 0);
      const native: TearGameplayEvent[] = [];
      events.subscribe((event) => native.push(event));
      const environment = createEnvironmentRuntime({ stageId: "test", worldId, events });
      const fieldId = environment.addField({ ...field(), schedule: { startTick: 1, endTick: 3 } });
      const objectId = environment.addCombatObject({ kind: "root-link", ownerId: null, targetId: "player", geometry: { x: 1, y: 2 }, integrity: 1, maxIntegrity: 1,
        counterplayTags: ["cut", "break"], procEligible: false, damageDedupeId: "shared-hit-id", state: "active", stateTick: 0, cleanupReason: null });
      const simulation = new TearSimulationRuntime({ environment, actionPort: { apply: () => undefined }, step: () => undefined, snapshot: () => environment.snapshot(), events });
      simulation.advanceOne([]);
      environment.damageCombatObject(objectId, 1, "shared-hit", 2);
      simulation.advanceOne([]);
      simulation.advanceOne([]);
      return { environment, fieldId, native };
    };
    const live = run("live-world");
    const detached = run("detached-world");
    expect(live.environment.snapshot().fields.find((entry) => entry.id === live.fieldId)?.state).toBe("expired");
    expect(live.environment.combatObjects()[0]?.state).toBe("destroyed");
    expect(environmentHash(live.environment.snapshot())).toBe(environmentHash(detached.environment.snapshot()));
    expect(live.native.map((event) => event.kind === "environment" ? event.event : event.kind)).toEqual([
      "field-started", "combat-object-damaged", "combat-object-destroyed", "field-resolved",
    ]);
    expect(detached.native.map((event) => event.kind === "environment" ? event.event : event.kind)).toEqual(live.native.map((event) => event.kind === "environment" ? event.event : event.kind));
  });

  it("cleans orphan owners across fields, combat objects, and routes at post-commit", () => {
    const runtime = createEnvironmentRuntime({ stageId: "test", worldId: "cleanup" });
    runtime.addField({ ...field("active"), ownerId: "missing-owner" });
    runtime.addCombatObject({ kind: "root-link", ownerId: "missing-owner", targetId: null, geometry: { x: 1, y: 2 }, integrity: 2, maxIntegrity: 2,
      counterplayTags: ["cut", "break"], procEligible: false, damageDedupeId: "cleanup-hit", state: "active", stateTick: 0, cleanupReason: null });
    runtime.addRoute({ kind: "regrowth-link", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], state: "active", stateTick: 0, ownerId: "missing-owner", cleanupReason: null });
    runtime.step(1, 1 / 120, () => undefined, new Set(["player"]));
    expect(runtime.fields()[0]?.cleanupReason).toBe("stage-transition");
    expect(runtime.combatObjects()[0]?.cleanupReason).toBe("stage-transition");
    expect(runtime.routes()[0]?.cleanupReason).toBe("stage-transition");
  });

  it("retains surviving attack-ID dedupe when an unrelated orphan is cleaned", () => {
    const runtime = createEnvironmentRuntime({ stageId: "test", worldId: "dedupe-cleanup" });
    const survivorId = runtime.addCombatObject({ kind: "root-link", ownerId: null, targetId: "player", geometry: { x: 1, y: 2 }, integrity: 3, maxIntegrity: 3,
      counterplayTags: ["cut", "break"], procEligible: false, damageDedupeId: "survivor-hit", state: "active", stateTick: 0, cleanupReason: null });
    runtime.addField({ ...field("active"), ownerId: "missing-owner" });
    expect(runtime.damageCombatObject(survivorId, 1, "attack-1", 1).accepted).toBe(true);
    runtime.step(1, 1 / 120, () => undefined, new Set(["player"]));
    expect(runtime.fields()[0]?.state).toBe("expired");
    expect(runtime.damageCombatObject(survivorId, 1, "attack-1", 2)).toMatchObject({ accepted: false, duplicate: true, integrity: 2 });
    runtime.updateCombatObject(survivorId, { integrity: 1 });
    expect(runtime.damageCombatObject(survivorId, 1, "attack-1", 3).accepted).toBe(true);
    runtime.removeCombatObject(survivorId);
    expect(() => runtime.damageCombatObject(survivorId, 1, "attack-1", 4)).toThrow(/unknown/u);
  });

  it("keeps live and detached owner/target cleanup semantically equal", () => {
    const run = (worldId: string) => {
      const events = new TearGameplayEventBus(() => 0);
      const native: TearGameplayEvent[] = [];
      events.subscribe((event) => native.push(event));
      const environment = createEnvironmentRuntime({ stageId: "test", worldId, events, availableActorIds: () => new Set(["player"]) });
      environment.addField({ ...field("active"), ownerId: "missing" });
      environment.addCombatObject({ kind: "root-link", ownerId: null, targetId: "missing", geometry: { x: 1, y: 2 }, integrity: 2, maxIntegrity: 2,
        counterplayTags: ["cut", "break"], procEligible: false, damageDedupeId: "orphan-hit", state: "active", stateTick: 0, cleanupReason: null });
      environment.addRoute({ kind: "regrowth-link", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], state: "active", stateTick: 0, ownerId: "missing", cleanupReason: null });
      const simulation = new TearSimulationRuntime({ environment, actionPort: { apply: () => undefined }, step: () => undefined, snapshot: () => environment.snapshot(), events });
      simulation.advanceOne([]);
      return { environment, native };
    };
    const live = run("live-cleanup");
    const detached = run("detached-cleanup");
    expect(environmentHash(live.environment.snapshot())).toBe(environmentHash(detached.environment.snapshot()));
    expect(live.environment.fields()[0]?.state).toBe("expired");
    expect(live.environment.combatObjects()[0]?.state).toBe("expired");
    expect(live.environment.routes()[0]?.state).toBe("expired");
    expect(live.native.filter((event) => event.kind === "environment").map((event) => event.event)).toEqual(["object-cleaned", "object-cleaned", "object-cleaned"]);
  });

  it("rejects duplicate identities and population overflow before mutation", () => {
    const runtime = createEnvironmentRuntime({ stageId: "test", worldId: "bounded", configuration: { maxFields: 1 } });
    runtime.addField({ ...field(), id: "explicit-field" });
    expect(() => runtime.addField(field())).toThrow(/population bound/u);
    const duplicate = createEnvironmentRuntime({ stageId: "test", worldId: "duplicate" });
    expect(() => {
      duplicate.replace({ stageId: "test", fields: [{ ...field(), id: "same" }, { ...field(), id: "same" }], combatObjects: [], routes: [] });
    }).toThrow(/duplicate/u);
    expect(runtime.fields()).toHaveLength(1);
  });
});

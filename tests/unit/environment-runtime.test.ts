import { describe, expect, it } from "vitest";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import type { EnvironmentFieldState } from "../../src/gameplay/environment/environment-contracts";
import { TearSimulationRuntime } from "../../src/gameplay/runtime/tear-simulation-runtime";

const field = (state: EnvironmentFieldState["state"] = "scheduled") => ({
  kind: "bloom-well" as const, geometry: { x: 10, y: 20, radius: 30 }, state,
  stateTick: 0, timer: 0, ownerId: null, schedule: null,
  eligibility: { player: true, enemies: true, bosses: false }, force: null, cleanupReason: null,
});

describe("environment runtime", () => {
  it("owns data-only fields, combat objects, and routes with bounded deterministic IDs", () => {
    const first = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "alpha" });
    const second = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "beta" });
    const fieldId = first.addField(field());
    const objectId = first.addCombatObject({ kind: "graft-anchor", ownerId: null, targetId: null,
      geometry: { x: 1, y: 2 }, integrity: 10, maxIntegrity: 10, counterplayTags: ["cuttable"],
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

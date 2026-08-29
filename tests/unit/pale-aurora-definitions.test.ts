import { describe, expect, it } from "vitest";

import {
  AURORA_TRACK_DEFINITIONS, GHOST_TRACK_DEFINITION,
  createAuroraTrackFieldState, createGhostTrackRouteState,
} from "../../src/gameplay/environment/aurora-track";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import {
  ENVIRONMENT_FIELD_KIND_IDS, ENVIRONMENT_ROUTE_KIND_IDS, environmentObjectDefinition,
} from "../../src/gameplay/environment/environment-definitions";
import {
  environmentHash, environmentSnapshotToObservation, validateEnvironmentCodecPayload,
} from "../../src/tearbench/environment-codec";
import { buildTearIdentityGraph, createDefaultStateCodecRegistry, type TearCodecWorld } from "../../src/tearbench";
import { forgeEnvironmentFieldState, forgeEnvironmentRouteState } from "../../src/tearbench/state-forge-factories";

const field = createAuroraTrackFieldState({ id: "track:stage:left", ownerId: "pale-traverse", variant: "stage",
  direction: 1, geometry: { x: 100, y: 680, w: 500, h: 48, points: [{ x: 100, y: 704 }, { x: 600, y: 704 }] },
  startTick: 120, patternId: "left-run" });
const route = createGhostTrackRouteState({ id: "track:ghost:1", ownerId: "white-hart", direction: -1,
  width: 56, points: [{ x: 1240, y: 700 }, { x: 840, y: 700 }, { x: 460, y: 620 }], startTick: 240,
  sourceTrackId: field.id });

const payload = { slowZones: [], walls: [], fields: [field], combatObjects: [], routes: [route] };

describe("Pale Aurora environment definitions", () => {
  it("derives Aurora and Ghost Track kinds from the singular environment catalog", () => {
    expect(ENVIRONMENT_FIELD_KIND_IDS).toContain("aurora-track");
    expect(ENVIRONMENT_ROUTE_KIND_IDS).toContain("ghost-track");
    expect(environmentObjectDefinition("aurora-track").category).toBe("field");
    expect(environmentObjectDefinition("ghost-track").category).toBe("route");
  });

  it("defines immutable stage, boss-wake, and bounded Ghost Track data", () => {
    expect(Object.keys(AURORA_TRACK_DEFINITIONS)).toEqual(["stage", "boss-wake"]);
    expect(AURORA_TRACK_DEFINITIONS.stage).toMatchObject({ ownership: "stage", maximumConcurrent: 4 });
    expect(AURORA_TRACK_DEFINITIONS["boss-wake"]).toMatchObject({ ownership: "boss", maximumConcurrent: 3 });
    expect(GHOST_TRACK_DEFINITION).toMatchObject({ ownership: "boss", maximumConcurrent: 3 });
    expect(Object.isFrozen(AURORA_TRACK_DEFINITIONS.stage.lifecycle)).toBe(true);
    expect(Object.isFrozen(field.transportEligibility)).toBe(true);
    expect(Object.isFrozen(route.points)).toBe(true);
  });

  it("round-trips direction, lifecycle, eligibility, carry, ownership, and reference data", () => {
    expect(validateEnvironmentCodecPayload(payload)).toEqual([]);
    const runtime = createEnvironmentRuntime({ stageId: "pale-traverse", worldId: "pale-definitions" });
    runtime.addField(field);
    runtime.addRoute(route);
    const snapshot = runtime.snapshot();
    expect(snapshot.fields[0]).toEqual(field);
    expect(snapshot.routes[0]).toEqual(route);
    const observation = environmentSnapshotToObservation(snapshot);
    expect(observation.fields[0]).toMatchObject({ kind: "aurora-track", direction: 1, variant: "stage",
      lifecycle: field.lifecycle, momentum: field.momentum });
    expect(observation.routes[0]).toMatchObject({ kind: "ghost-track", direction: -1, maximumConcurrent: 3,
      sourceTrackId: field.id });
    expect(environmentHash({ stageId: "pale-traverse", ...payload })).not.toBe(
      environmentHash({ stageId: "pale-traverse", ...payload, fields: [{ ...field, direction: -1 }] }),
    );

    const world: TearCodecWorld = { components: new Map(), references: new Map(),
      entityIds: new Set(["pale-traverse", "white-hart"]) };
    world.components.set("tear.hazard.v1", structuredClone(payload) as never);
    const graph = buildTearIdentityGraph(world);
    expect(graph.references.get("tear.hazard.v1:$.routes[0].sourceTrackId")).toBe(field.id);
    expect(graph.issues).toEqual([]);
    expect(createDefaultStateCodecRegistry().get("tear.hazard.v1").validate(payload)).toEqual([]);

    const base = { format: "tearsdl" as const, schemaVersion: 1 as const, id: "pale-track",
      stateClass: "surgical-valid" as const, seed: "pale-track", start: { mode: "campaign", difficulty: "normal", weapon: "sword" } };
    expect(forgeEnvironmentFieldState(base, field).state?.environment).toMatchObject({ fields: [{ kind: "aurora-track" }] });
    expect(forgeEnvironmentRouteState(base, route).state?.environment).toMatchObject({ routes: [{ kind: "ghost-track" }] });
  });

  it("fails closed on malformed direction, carry, lifecycle, caps, and collection category", () => {
    const runtime = createEnvironmentRuntime({ stageId: "pale-traverse", worldId: "pale-malformed" });
    expect(() => runtime.addField({ ...field, direction: 0 } as never)).toThrow(/direction/u);
    expect(() => runtime.addField({ ...field, momentum: { ...field.momentum, heavyInfluenceScale: 2 } })).toThrow(/heavy influence/u);
    expect(() => runtime.addRoute({ ...route, maximumConcurrent: 4 } as never)).toThrow(/remain three/u);
    expect(() => runtime.addRoute({ ...route, kind: "aurora-track" } as never)).toThrow(/not approved for route/u);
    expect(validateEnvironmentCodecPayload({ ...payload, routes: [{ ...route, lifecycle: { ...route.lifecycle, warningTicks: 0 } }] }).some((issue) => issue.message.includes("warningTicks"))).toBe(true);
    expect(validateEnvironmentCodecPayload({ ...payload, fields: [{ ...field, transportEligibility: undefined }] }).some((issue) => issue.message.includes("transport data"))).toBe(true);
  });
});

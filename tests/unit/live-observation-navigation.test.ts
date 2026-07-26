import { describe, expect, it } from "vitest";

import type { TearObservationV1 } from "../../src/tearbench/contracts";
import { projectLiveNavigationObservation } from "../../src/tearbench/live-observation-navigation";
import { validateTearContract } from "../../src/tearbench/validation";

function observation(navigation: NonNullable<TearObservationV1["navigation"]>): TearObservationV1 {
  return {
    format: "tear-contract",
    kind: "observation",
    schemaVersion: 1,
    tick: 7,
    observationClass: "structured-state",
    player: {
      x: 100, y: 600, vx: 0, vy: 0, hp: 100, maxHp: 100,
      facing: 1, grounded: true, dashCharges: 1,
    },
    blade: {
      handX: 120, handY: 580, tipX: 180, tipY: 560,
      vx: 0, vy: 0, tipSpeed: 0, state: "held",
    },
    entities: [],
    navigation,
    run: {
      mode: "campaign", difficulty: "easy", weapon: "sword",
      stage: "source", wave: 6, score: 2_000, elapsedTicks: 7,
    },
    availableActions: ["move", "jump", "dash"],
  };
}

describe("live structured navigation observation", () => {
  it("projects stable surface and live hazard affordances from host geometry", () => {
    const first = projectLiveNavigationObservation([{
      id: "void:seed:3:l:0",
      platformId: "void:seed:3:l:0",
      x: 280, y: 610, w: 220, h: 20, oneway: true, void: true,
      voidLane: "lower", voidType: "fire", voidRole: "route",
      materializationState: "active", transferNode: true,
      connectionIds: ["void:seed:3:u:0"], fireOn: true, fireState: "hot",
    }], "THE SOURCE");
    const scrolled = projectLiveNavigationObservation([{
      id: "void:seed:3:l:0",
      platformId: "void:seed:3:l:0",
      x: 250, y: 610, w: 220, h: 20, oneway: true, void: true,
      voidLane: "lower", voidType: "fire", voidRole: "route",
      materializationState: "active", transferNode: true,
      connectionIds: ["void:seed:3:u:0"], fireOn: false, fireState: "cold",
    }], "THE SOURCE");

    expect(first.surfaces[0]).toMatchObject({
      id: "void:seed:3:l:0",
      oneWay: true,
      collidable: true,
      lane: "lower",
      role: "route",
      transferNode: true,
      connectionIds: ["void:seed:3:u:0"],
      bounds: { minX: 280, maxX: 500, minY: 610, maxY: 630 },
    });
    expect(first.hazards[0]).toMatchObject({
      id: "hazard:void:seed:3:l:0",
      surfaceId: "void:seed:3:l:0",
      type: "fire",
      state: "hot",
      active: true,
    });
    expect(scrolled.surfaces[0]?.id).toBe(first.surfaces[0]?.id);
    expect(scrolled.hazards[0]?.active).toBe(false);
    expect(Object.isFrozen(first.surfaces)).toBe(true);
  });

  it("uses cage collision geometry and a deterministic fallback for authored stages", () => {
    const navigation = projectLiveNavigationObservation([
      { x: 0, y: 780, w: 1_600, h: 120, floor: true },
      {
        platformId: "void:cage",
        x: 500, y: 620, w: 180, h: 20, oneway: true, void: true,
        voidLane: "upper", voidType: "cage", materializationState: "active",
        cageRect: { x: 690, y: 400, w: 80, h: 220 },
      },
    ], "Source");

    expect(navigation.surfaces[0]?.id).toBe("surface:source:0:780:1600:120");
    expect(navigation.hazards[0]?.bounds).toEqual({
      minX: 690, maxX: 770, minY: 400, maxY: 620,
    });
    expect(validateTearContract(observation(navigation)).ok).toBe(true);
  });

  it("rejects malformed structured geometry at the portable-contract boundary", () => {
    const navigation = projectLiveNavigationObservation([
      { x: 0, y: 780, w: 1_600, h: 120, floor: true },
    ], "grounds");
    const malformed = {
      ...observation(navigation),
      navigation: {
        ...navigation,
        surfaces: [{ ...navigation.surfaces[0], bounds: {
          minX: 10, maxX: 0, minY: 0, maxY: 10,
        } }],
      },
    };
    const result = validateTearContract(malformed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) =>
      issue.path === "navigation.surfaces[0].bounds")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import {
  EMPTY_SURVIVAL_MEMORY,
  planPredictiveSurvival,
  type TearAgentObservation,
} from "../../src/agents";
import type { TearObservationV1, TearObservedActorV1 } from "../../src/tearbench";

function actor(
  id: string,
  x: number,
  patch: Partial<TearObservedActorV1> = {},
): TearObservedActorV1 {
  return {
    id, kind: "charger", x, y: 600, vx: 0, vy: 0, hpRatio: 1, threat: 1,
    halfWidth: 24, halfHeight: 25, contactReach: 0, contactDamage: 20,
    chargeMult: 1, auraDmg: 1, contactEnabled: true,
    ...patch,
  };
}

function observation(
  entities: readonly TearObservedActorV1[],
  player: Partial<TearObservationV1["player"]> = {},
  tick = 10,
): TearAgentObservation {
  return {
    state: {
      format: "tear-contract", kind: "observation", schemaVersion: 1,
      tick, observationClass: "privileged-diagnostic",
      player: {
        x: 800, y: 600, vx: 0, vy: 0, hp: 100, maxHp: 100,
        facing: 1, grounded: true, dashCharges: 1,
        halfWidth: 16, halfHeight: 25, dashTimer: 0, dashCooldown: 0,
        iframe: 0.15, maxCharges: 1,
        ...player,
      },
      blade: {
        handX: 800, handY: 594, tipX: 880, tipY: 594,
        vx: 0, vy: 0, tipSpeed: 0, state: "held",
      },
      entities,
      run: {
        mode: "campaign", difficulty: "easy", weapon: "riftlock",
        stage: "grounds", wave: 7, score: 0, elapsedTicks: tick,
      },
      diagnostics: {
        worldBounds: { minX: 0, maxX: 1_600, minY: 0, maxY: 900 },
      },
      availableActions: ["move", "jump", "dash"],
    },
    ui: { screen: "playing" },
  };
}

function projectile(
  id: string,
  x: number,
  vx: number,
  state = "ordinaryProjectile:deflect",
): TearObservedActorV1 {
  return actor(id, x, {
    kind: "projectile", vx, state, radius: 12, damage: 40,
    counterplay: state.startsWith("groundShock") ? "jump" : "deflect",
    unparryable: state.startsWith("groundShock"),
  });
}

describe("predictive survival planner", () => {
  it("never emits dash while the authoritative timer or cooldown rejects it", () => {
    for (const player of [
      { dashTimer: 0.1, dashCooldown: 0 },
      { dashTimer: 0, dashCooldown: 0.4 },
    ]) {
      const decision = planPredictiveSurvival(
        observation([actor("commit", 840, { vx: -700, state: "commit" })], player),
        undefined,
      );
      expect(decision.actions.some((action) => action.type === "dash")).toBe(false);
    }
  });

  it("preserves a benign landing refill instead of proximity-dashing", () => {
    const decision = planPredictiveSurvival(
      observation([actor("near", 1_050)]),
      actor("near", 1_050),
    );
    expect(decision.actions.some((action) => action.type === "dash")).toBe(false);
  });

  it("emits one dash for an imminent damaging intercept and waits for acceptance", () => {
    const input = observation([projectile("shot", 850, -900)]);
    const first = planPredictiveSurvival(input, undefined);
    expect(first.actions.some((action) => action.type === "dash")).toBe(true);
    expect(first.dashAttempted).toBe(true);
    const second = planPredictiveSurvival(
      { ...input, state: { ...input.state, tick: 12 } },
      undefined,
      first.memory,
    );
    expect(second.actions.some((action) => action.type === "dash")).toBe(false);
    expect(second.dashAttempted).toBe(false);
  });

  it("may spend a landing refill when the predicted hit is lethal", () => {
    const decision = planPredictiveSurvival(
      observation([actor("lethal", 845, { vx: -500, state: "commit", contactDamage: 120 })]),
      undefined,
    );
    expect(decision.actions.some((action) => action.type === "dash")).toBe(true);
  });

  it("sums two-sided pressure instead of retreating into the second actor", () => {
    const left = actor("left", 620, { contactDamage: 10 });
    const right = actor("right", 850, {
      vx: 0, halfHeight: 140, contactDamage: 35,
    });
    const decision = planPredictiveSurvival(
      observation([left, right], { dashCharges: 0 }),
      right,
    );
    expect(decision.actions).toContainEqual({ type: "move", x: -1_000, y: 0 });
    expect(decision.actions.some((action) => action.type === "dash")).toBe(false);
  });

  it("jumps a ground shock without wasting dash", () => {
    const shock = projectile("shock", 650, 700, "groundShock:jump");
    const decision = planPredictiveSurvival(observation([shock]), undefined);
    expect(decision.actions).toContainEqual({ type: "jump", phase: "pressed" });
    expect(decision.actions.some((action) => action.type === "dash")).toBe(false);
  });

  it("uses collision size and contact reach when selecting a route", () => {
    const narrow = planPredictiveSurvival(
      observation([actor("left", 680), actor("right", 950)]),
      undefined,
    );
    const wide = planPredictiveSurvival(
      observation([actor("left", 680), actor("right", 950, { halfWidth: 150, contactReach: 80 })]),
      undefined,
    );
    expect(wide.candidate).not.toBe(narrow.candidate);
  });

  it("is byte deterministic for the same observation and memory", () => {
    const input = observation([
      actor("a", 700, { vx: 100 }),
      projectile("p", 1_000, -500),
    ]);
    const results = Array.from({ length: 50 }, () =>
      JSON.stringify(planPredictiveSurvival(input, undefined, EMPTY_SURVIVAL_MEMORY)));
    expect(new Set(results)).toHaveLength(1);
  });
});

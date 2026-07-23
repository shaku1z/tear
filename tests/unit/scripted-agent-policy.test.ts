import { describe, expect, it } from "vitest";

import {
  SCRIPTED_POLICY_PROFILES,
  TearScriptedPolicy,
  projectAgentActionsToLegacyControls,
  type TearAgentObservation,
} from "../../src/agents";
import type { TearObservationV1, TearObservedActorV1 } from "../../src/tearbench";

function state(
  tick: number,
  entities: readonly TearObservedActorV1[],
  patch: Partial<TearObservationV1["player"]> = {},
  bladeState = "held",
): TearObservationV1 {
  return {
    format: "tear-contract",
    kind: "observation",
    schemaVersion: 1,
    tick,
    observationClass: "structured-state",
    player: {
      x: 100, y: 600, vx: 0, vy: 0, hp: 100, maxHp: 100,
      facing: 1, grounded: true, dashCharges: 1, ...patch,
    },
    blade: {
      handX: 120, handY: 580, tipX: 180, tipY: 560,
      vx: 0, vy: 0, tipSpeed: 0, state: bladeState,
    },
    entities,
    run: {
      mode: "campaign", difficulty: "easy", weapon: "sword",
      stage: "grounds", wave: 1, score: 0, elapsedTicks: tick,
    },
    availableActions: ["move", "jump", "dash", "aim", "weapon"],
  };
}

function actor(id: string, x: number, y = 600, kind: TearObservedActorV1["kind"] = "charger"): TearObservedActorV1 {
  return { id, kind, x, y, vx: 0, vy: 0, hpRatio: 1, threat: 1 };
}

function observation(current: TearObservationV1): TearAgentObservation {
  return { state: current, ui: { screen: "playing" } };
}

describe("deterministic scripted agent hierarchy", () => {
  it("exercises slash, secondary, throw, recall, parry, navigation, jump, and dash mechanics", () => {
    const competent = new TearScriptedPolicy("competent");
    const style = new TearScriptedPolicy("style");
    const near = competent.decide(observation(state(10, [actor("near", 180)])));
    expect(near.trace.maneuver).toBe("slash");
    expect(near.actions).toContainEqual({ type: "weapon", intent: "primary", phase: "pressed" });

    const flourish = style.decide(observation(state(180, [actor("near", 180)])));
    expect(flourish.trace.maneuver).toBe("secondary");
    expect(flourish.actions).toContainEqual({ type: "weapon", intent: "secondary", phase: "pressed" });

    const distant = competent.decide(observation(state(20, [actor("far", 600, 450)])));
    expect(distant.trace.maneuver).toBe("throw");
    expect(distant.actions).toContainEqual({ type: "weapon", intent: "throw", phase: "pressed" });
    expect(distant.actions.some((action) => action.type === "dash")).toBe(true);
    expect(distant.actions).toContainEqual({ type: "jump", phase: "pressed" });

    const recall = competent.decide(observation(state(21, [actor("far", 600)], {}, "thrown")));
    expect(recall.trace.maneuver).toBe("recall");

    const parry = competent.decide(observation(state(22, [actor("shot", 160, 600, "projectile")])));
    expect(parry.trace.maneuver).toBe("parry");
  });

  it("clears representative early waves by acting through semantic controls", () => {
    const policy = new TearScriptedPolicy("competent");
    let enemies = [actor("enemy-1", 180), actor("enemy-2", 420), actor("enemy-3", 650)];
    let bladeState = "held";
    const traces = [];
    for (let tick = 0; tick < 120 && enemies.length > 0; tick += 1) {
      const decision = policy.decide(observation(state(tick, enemies, {}, bladeState)));
      traces.push(decision.trace);
      const attack = decision.actions.find((action) => action.type === "weapon");
      if (attack?.type === "weapon" && attack.intent === "throw") {
        bladeState = "thrown";
        enemies = enemies.slice(1);
      } else if (attack?.type === "weapon" && attack.intent === "recall") {
        bladeState = "held";
      } else if (attack?.type === "weapon" && (attack.intent === "primary" || attack.intent === "secondary")) {
        enemies = enemies.slice(1);
      }
    }
    expect(enemies).toEqual([]);
    expect(traces.some((trace) => trace.objective === "clear-wave")).toBe(true);
    expect(traces.every((trace) => trace.observationClass === "structured-state")).toBe(true);
  });

  it("is byte-deterministic for every initial profile under fixed observations", () => {
    const input = observation(state(77, [actor("a", 260), actor("b", 500)]));
    for (const profile of SCRIPTED_POLICY_PROFILES) {
      const decisions = Array.from({ length: 100 }, () =>
        JSON.stringify(new TearScriptedPolicy(profile).decide(input)));
      expect(new Set(decisions), profile).toHaveLength(1);
    }
  });

  it("projects semantic actions into the typed legacy player and blade seams", () => {
    const controls = projectAgentActionsToLegacyControls([
      { type: "move", x: 1_000, y: -1_000 },
      { type: "dash", x: 1_000, y: 0 },
      { type: "jump", phase: "pressed" },
      { type: "aim", turn: 250_000 },
      { type: "weapon", intent: "primary", phase: "pressed" },
    ]);
    expect(controls.playerInput.right()).toBe(true);
    expect(controls.playerInput.up()).toBe(true);
    expect(controls.playerInput.dashPressed()).toBe(true);
    expect(controls.playerInput.jumpPressed()).toBe(true);
    expect(controls.primaryHeld).toBe(true);
    expect(controls.aim.x).toBeCloseTo(0);
    expect(controls.aim.y).toBeCloseTo(1);
  });
});

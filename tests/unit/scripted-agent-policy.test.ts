import { describe, expect, it } from "vitest";

import {
  SCRIPTED_POLICY_PROFILES,
  MovementModule,
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

    const distant = style.decide(observation(state(240, [actor("far", 750, 450)])));
    expect(distant.trace.maneuver).toBe("throw");
    expect(distant.actions).toContainEqual({ type: "weapon", intent: "throw", phase: "pressed" });
    expect(distant.actions.some((action) => action.type === "dash")).toBe(true);
    expect(distant.actions).toContainEqual({ type: "jump", phase: "pressed" });

    const recall = competent.decide(observation(state(21, [actor("far", 600)], {}, "thrown")));
    expect(recall.trace.maneuver).toBe("recall");

    const parryProjectile = { ...actor("shot", 260, 600, "projectile"), vx: -500 };
    const parry = competent.decide(observation(state(22, [parryProjectile])));
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

  it("locks a living target and uses the real throw lifecycle for held-blade-immune wraiths", () => {
    const policy = new TearScriptedPolicy("competent");
    expect(policy.decide(observation(state(1, [actor("locked", 180), actor("other", 500)]))).trace.targetId)
      .toBe("locked");
    const locked = policy.decide(observation(state(2, [actor("locked", 500), actor("other", 180)])));
    expect(locked.trace.targetId).toBe("locked");

    const wraith = new TearScriptedPolicy("competent").decide(
      observation(state(3, [actor("wraith", 220, 600, "wraith")])),
    );
    expect(wraith.actions).toContainEqual({ type: "weapon", intent: "throw", phase: "pressed" });
    const flying = new TearScriptedPolicy("competent").decide(
      observation(state(4, [actor("wraith", 500, 600, "wraith")], {}, "flying")),
    );
    expect(flying.actions.some((action) => action.type === "weapon")).toBe(false);
    const embedded = new TearScriptedPolicy("competent").decide(
      observation(state(5, [actor("wraith", 500, 600, "wraith")], {}, "embedded")),
    );
    expect(embedded.actions).toContainEqual({ type: "weapon", intent: "recall", phase: "pressed" });
  });

  it("requests one controlled Ringblade Circuit return at low energy without steering or spam", () => {
    const policy = new TearScriptedPolicy("competent");
    const circuit = (tick: number, circuitEnergy: number): TearAgentObservation => {
      const current = state(tick, [actor("target", 500)], {}, "circuiting");
      return observation({
        ...current,
        blade: { ...current.blade, circuitEnergy },
        run: { ...current.run, weapon: "ringblade" },
      });
    };

    const aboveThreshold = policy.decide(circuit(40, 0.81));
    expect(aboveThreshold.actions.some((action) => action.type === "weapon")).toBe(false);

    const firstReturn = policy.decide(circuit(41, 0.8));
    expect(firstReturn.trace.maneuver).toBe("secondary");
    expect(firstReturn.actions).toContainEqual({
      type: "weapon", intent: "secondary", phase: "pressed",
    });

    const repeatedLowEnergy = policy.decide(circuit(42, 0.2));
    expect(repeatedLowEnergy.actions.some((action) => action.type === "weapon")).toBe(false);

    const returning = state(43, [actor("target", 500)], {}, "returning");
    policy.decide(observation({
      ...returning,
      run: { ...returning.run, weapon: "ringblade" },
    }));
    const nextCircuit = policy.decide(circuit(44, 0.3));
    expect(nextCircuit.actions).toContainEqual({
      type: "weapon", intent: "secondary", phase: "pressed",
    });
  });

  it("does not apply Ringblade Circuit return control to another weapon", () => {
    const current = state(50, [actor("target", 500)], {}, "circuiting");
    const decision = new TearScriptedPolicy("competent").decide(observation({
      ...current,
      blade: { ...current.blade, circuitEnergy: 0.1 },
      run: { ...current.run, weapon: "sword" },
    }));

    expect(decision.actions.some((action) => action.type === "weapon")).toBe(false);
  });

  it("evades a nearby movement threat without abandoning its locked attack target", () => {
    const policy = new TearScriptedPolicy("competent");
    const ringbladeState = (tick: number, entities: readonly TearObservedActorV1[]) => {
      const current = state(tick, entities);
      return { ...current, run: { ...current.run, weapon: "ringblade" } } satisfies TearObservationV1;
    };
    expect(policy.decide(observation(ringbladeState(1, [actor("locked", -300)]))).trace.targetId)
      .toBe("locked");

    const decision = policy.decide(observation(ringbladeState(
      2,
      [actor("locked", -300), actor("contact", 180)],
    )));

    expect(decision.trace.targetId).toBe("locked");
    expect(decision.actions).toContainEqual({ type: "move", x: -1_000, y: 0 });
    expect(decision.actions).toContainEqual({ type: "weapon", intent: "throw", phase: "pressed" });
  });

  it("offers Source a non-ringblade throw in the void and waits through hostile recovery", () => {
    const source = { ...actor("source", 500, 400, "source"), behaviorMode: "void" };
    const voidObservation = (tick: number, bladeState: string): TearAgentObservation => ({
      state: state(tick, [source], {}, bladeState),
      ui: { screen: "playing" },
      boss: { id: "source", phase: "3" },
    });
    const policy = new TearScriptedPolicy("competent");

    const offered = policy.decide(voidObservation(10, "held"));
    expect(offered.trace.maneuver).toBe("throw");
    expect(offered.actions).toContainEqual({ type: "weapon", intent: "throw", phase: "pressed" });
    for (const bladeState of ["flying", "returning"]) {
      const recovery = policy.decide(voidObservation(11, bladeState));
      expect(recovery.actions.some((action) => action.type === "weapon")).toBe(false);
    }
  });

  it("routes across observed transfer surfaces and avoids active live hazards", () => {
    const movement = new MovementModule();
    const target = actor("upper-target", 600, 580);
    const navigation = {
      surfaces: [
        {
          id: "lower", bounds: { minX: 0, maxX: 300, minY: 780, maxY: 800 },
          oneWay: false, collidable: true, materializationState: "active",
          lane: "lower" as const, connectionIds: ["upper"],
        },
        {
          id: "transfer", bounds: { minX: 250, maxX: 350, minY: 700, maxY: 720 },
          oneWay: true, collidable: true, materializationState: "active",
          lane: "lower" as const, transferNode: true, connectionIds: ["upper"],
        },
        {
          id: "upper", bounds: { minX: 500, maxX: 700, minY: 600, maxY: 620 },
          oneWay: true, collidable: true, materializationState: "active",
          lane: "upper" as const, transferNode: true, connectionIds: ["lower"],
        },
      ],
      hazards: [],
    };
    const route = movement.decide({
      observation: observation({ ...state(30, [target]), navigation }),
      target,
      profile: "competent",
    });
    expect(route.actions).toContainEqual({ type: "move", x: 1_000, y: 0 });
    expect(route.actions).toContainEqual({ type: "jump", phase: "pressed" });

    const hazard = movement.decide({
      observation: observation({
        ...state(31, [actor("enemy", 500)]),
        navigation: {
          surfaces: navigation.surfaces.slice(0, 1),
          hazards: [{
            id: "hazard:fire", surfaceId: "lower", type: "fire", state: "hot", active: true,
            bounds: { minX: 140, maxX: 300, minY: 580, maxY: 800 },
          }],
        },
      }),
      target: actor("enemy", 500),
      profile: "competent",
    });
    expect(hazard.actions).toContainEqual({ type: "move", x: -1_000, y: 0 });
    expect(hazard.actions).toContainEqual({ type: "jump", phase: "pressed" });
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

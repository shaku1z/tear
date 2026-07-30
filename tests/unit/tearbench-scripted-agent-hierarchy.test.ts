import { describe, expect, it } from "vitest";

import type { TearObservedActorV1, TearObservationV1 } from "../../src/tearbench/contracts";
import type { TearAgentDecision } from "../../src/agents/contracts";
import {
  TearAgentWatchdog,
  TearHierarchicalAgentOrchestrator,
  TearLongHorizonMemory,
  type TearHierarchicalObservation,
} from "../../src/tearbench/scripted-agent-hierarchy";

function actor(id: string, x: number, kind: TearObservedActorV1["kind"] = "charger"): TearObservedActorV1 {
  return { id, kind, x, y: 600, vx: 0, vy: 0, hpRatio: 1, threat: 1 };
}

function state(
  tick: number,
  entities: readonly TearObservedActorV1[] = [actor("enemy", 500)],
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
    blade: { handX: 120, handY: 580, tipX: 180, tipY: 560, vx: 0, vy: 0, tipSpeed: 0, state: bladeState },
    entities,
    run: {
      mode: "campaign", difficulty: "easy", weapon: "sword",
      stage: "grounds", wave: 1, score: 0, elapsedTicks: tick,
    },
    availableActions: ["move", "jump", "dash", "aim", "weapon"],
  };
}

function observation(
  tick: number,
  patch: Partial<TearHierarchicalObservation> = {},
): TearHierarchicalObservation {
  return { state: state(tick), ui: { screen: "playing" }, ...patch };
}

function operational(actions: TearAgentDecision["actions"]): TearAgentDecision {
  return {
    actions,
    trace: {
      tick: 0,
      profile: "competent",
      objective: "clear-wave",
      targetId: "operational-target",
      maneuver: "slash",
      confidence: 0.83,
      recovery: false,
      observationClass: "structured-state",
      critic: [],
    },
  };
}

describe("C24 hierarchical scripted agent core", () => {
  it("produces a stable structured intent through the full combat hierarchy", () => {
    const first = new TearHierarchicalAgentOrchestrator("competent").decide(observation(12));
    const second = new TearHierarchicalAgentOrchestrator("competent").decide(observation(12));
    expect(first).toEqual(second);
    expect(first.intent).toMatchObject({
      tick: 12,
      objective: "clear-wave",
      targetId: "enemy",
      maneuver: "throw",
      observationClass: "structured-state",
      recovery: false,
    });
    expect(first.actions).toContainEqual({ type: "dash", x: 1_000, y: 0 });
    expect(first.actions).toContainEqual({ type: "weapon", intent: "throw", phase: "pressed" });
    expect(first.intent.memory.decisions).toBe(1);
  });

  it("routes draft, stolen-blade, projectile parry, and survival decisions", () => {
    const policy = new TearHierarchicalAgentOrchestrator();
    const draft = policy.decide(observation(1, {
      ui: { screen: "draft", choices: [{ id: "guard", score: 1 }, { id: "power", score: 3 }] },
    }));
    expect(draft.intent.objective).toBe("select-build");
    expect(draft.actions).toEqual([{ type: "draft-choice", choiceId: "power" }]);

    const stolen = policy.decide({ state: state(2, [actor("enemy", 200)], {}, "stolen"), ui: { screen: "playing" } });
    expect(stolen.intent.objective).toBe("recover-blade");
    expect(stolen.actions).toEqual([{ type: "interact" }]);

    const parry = new TearHierarchicalAgentOrchestrator().decide({
      state: state(3, [actor("shot", 170, "projectile")]),
      ui: { screen: "playing" },
    });
    expect(parry.intent.maneuver).toBe("parry");

    const survive = new TearHierarchicalAgentOrchestrator().decide({
      state: state(4, [actor("enemy", 200)], { hp: 10 }),
      ui: { screen: "playing" },
    });
    expect(survive.intent.objective).toBe("survive");
    expect(survive.actions).toContainEqual({ type: "move", x: -1_000, y: 0 });
  });

  it("turns invariant failures and operational watchdogs into bounded recovery", () => {
    const invalid = new TearHierarchicalAgentOrchestrator().decide({
      state: state(1, [], { hp: 101 }),
      ui: { screen: "playing" },
    });
    expect(invalid.intent.invariantViolations).toContain("invalid-player-health");
    expect(invalid.intent.objective).toBe("recover-runtime");
    expect(invalid.actions).toEqual([{ type: "pause" }]);

    const ordinaryActions = [{ type: "move", x: 321, y: 0 }] as const;
    const focus = new TearHierarchicalAgentOrchestrator().decide(observation(2, {
      signals: { focused: false, deviceConnected: false },
    }), operational(ordinaryActions));
    expect(focus.intent.watchdog.map((entry) => entry.kind)).toEqual(["focus-lost", "device-disconnected"]);
    expect(focus.intent.objective).toBe("clear-wave");
    expect(focus.actions).toEqual(ordinaryActions);
  });

  it("remembers the final operational batch used by repeated-input detection", () => {
    const policy = new TearHierarchicalAgentOrchestrator("competent", {
      transitionTicks: 100,
      noProgressTicks: 100,
      repeatedInputLimit: 2,
      loadingTicks: 100,
    });
    const finalActions = [{ type: "move", x: 321, y: 0 }] as const;
    const shadowWouldChange = [
      observation(1, { signals: { progressToken: "same" } }),
      observation(2, {
        state: state(2, [actor("other-shadow-target", 900)]),
        signals: { progressToken: "same" },
      }),
      observation(3, {
        state: state(3, [actor("third-shadow-target", 150)]),
        signals: { progressToken: "same" },
      }),
    ];
    const decisions = shadowWouldChange.map((input) => policy.decide(input, operational(finalActions)));
    expect(decisions.map((decision) => decision.actions)).toEqual([
      finalActions, finalActions, finalActions,
    ]);
    expect(decisions[2]?.intent.watchdog.map((entry) => entry.kind)).toContain("repeated-input");
    expect(decisions[2]?.intent.objective).toBe("clear-wave");
    expect(decisions[2]?.intent.memory.repeatedActions).toBe(3);
    expect(decisions[2]?.intent.targetId).toBe("operational-target");
    expect(decisions[2]?.intent.maneuver).toBe("slash");
    expect(decisions[2]?.intent.confidence).toBe(0.83);
  });

  it("lets a fatal watchdog incident arbitrate over the operational batch", () => {
    const policy = new TearHierarchicalAgentOrchestrator("competent", {
      transitionTicks: 100,
      noProgressTicks: 1,
      repeatedInputLimit: 100,
      loadingTicks: 100,
    });
    const finalActions = [{ type: "move", x: 321, y: 0 }] as const;
    policy.decide(observation(0, {
      signals: { progressToken: "stalled" },
    }), operational(finalActions));
    const fatal = policy.decide(observation(2, {
      state: {
        ...state(2),
        diagnostics: { softlockLimitTicks: 1 },
      },
      signals: { progressToken: "stalled" },
    }), operational(finalActions));
    expect(fatal.intent.watchdog.map((entry) => entry.kind)).toEqual(["no-progress", "softlock"]);
    expect(fatal.intent.objective).toBe("recover-runtime");
    expect(fatal.intent.maneuver).toBe("recover");
    expect(fatal.intent.confidence).toBe(0);
    expect(fatal.actions).toEqual([{ type: "pause" }]);
    expect(fatal.intent.memory.repeatedActions).toBe(1);
  });

  it("detects transition, progress, loading, repeated-input, pause, softlock, and terminal incidents", () => {
    const memory = new TearLongHorizonMemory();
    const contract = { transitionTicks: 2, noProgressTicks: 2, repeatedInputLimit: 2, loadingTicks: 2 };
    const watchdog = new TearAgentWatchdog(contract);
    const initial = observation(0, { ui: { screen: "setup" }, signals: { loading: true, progressToken: "same" } });
    memory.observe(initial);
    memory.rememberDecision([{ type: "confirm" }], undefined, false);
    memory.rememberDecision([{ type: "confirm" }], undefined, false);
    const stalled = observation(3, {
      ui: { screen: "setup" },
      signals: { loading: true, terminal: true, progressToken: "same" },
      state: { ...state(3), diagnostics: { paused: true, softlockLimitTicks: 2 } },
    });
    memory.observe(stalled);
    const kinds = watchdog.inspect(stalled, memory.snapshot()).map((entry) => entry.kind);
    expect(kinds).toEqual([
      "terminal", "paused", "loading-stall", "transition-stall",
      "no-progress", "softlock", "repeated-input",
    ]);
  });

  it("resets long-horizon state deterministically when a runtime rewinds", () => {
    const memory = new TearLongHorizonMemory();
    memory.observe(observation(10));
    memory.rememberDecision([{ type: "confirm" }], "enemy", true);
    memory.observe(observation(5));
    expect(memory.snapshot()).toMatchObject({
      decisions: 1,
      lastTick: 5,
      lastProgressTick: 5,
      recoveryAttempts: 0,
      repeatedActions: 0,
    });
  });
});

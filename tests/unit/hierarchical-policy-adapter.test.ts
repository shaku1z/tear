import { describe, expect, it } from "vitest";
import { TearLiveHierarchicalPolicy } from "../../src/agents/hierarchical-policy-adapter";
import { TearAgentOrchestrator } from "../../src/agents/scripted-policy";
import type { TearAgentObservation } from "../../src/agents/contracts";

function observation(tick: number, hp = 100): TearAgentObservation {
  return {
    state: {
      format: "tear-contract",
      kind: "observation",
      schemaVersion: 1,
      tick,
      observationClass: "privileged-diagnostic",
      player: {
        x: 100, y: 700, vx: 0, vy: 0, hp, maxHp: 100,
        facing: 1, grounded: true, dashCharges: 1,
      },
      blade: {
        handX: 100, handY: 690, tipX: 180, tipY: 690,
        vx: 0, vy: 0, tipSpeed: 0, state: "held",
      },
      entities: [{
        id: "enemy:1", kind: "charger", x: 250, y: 700,
        vx: 0, vy: 0, hpRatio: 1, state: "idle", threat: 0.2,
      }],
      run: {
        mode: "campaign", difficulty: "easy", weapon: "sword",
        stage: "The Grounds", wave: 1, score: 0, elapsedTicks: tick,
      },
      availableActions: ["move", "jump", "dash", "aim", "weapon"],
      diagnostics: {
        worldBounds: { minX: 0, maxX: 1600, minY: 0, maxY: 900 },
        waveComplete: false,
        livingWaveEnemies: 1,
        paused: false,
        ui: { focusableIds: [] },
        progressTick: tick,
        softlockLimitTicks: 3_600,
        lifecyclePhase: "active",
      },
    },
    ui: { screen: "playing" },
  };
}

describe("live hierarchical policy adapter", () => {
  it("runs the complete hierarchy and returns player-valid semantic controls", () => {
    const policy = new TearLiveHierarchicalPolicy("competent");
    const input = observation(1);
    const operational = new TearAgentOrchestrator("competent").decide(input);
    const decision = policy.decide(input);
    expect(decision.actions).toEqual(operational.actions);
    expect(decision.actions.some((action) => action.type === "weapon")).toBe(true);
    expect(decision.structuredIntent.objective).toBe("clear-wave");
    expect(decision.structuredIntent.targetId).toBe(decision.trace.targetId);
    expect(decision.structuredIntent.maneuver).toBe(decision.trace.maneuver);
    expect(decision.structuredIntent.confidence).toBe(decision.trace.confidence);
    expect(decision.structuredIntent.recovery).toBe(decision.trace.recovery);
    expect(decision.structuredIntent.observationClass).toBe("privileged-diagnostic");
    expect(decision.structuredIntent.memory.decisions).toBe(1);
  });

  it("lets fatal invariant recovery override combat actions", () => {
    const policy = new TearLiveHierarchicalPolicy("competent");
    const decision = policy.decide(observation(2, -1));
    expect(decision.structuredIntent.objective).toBe("recover-runtime");
    expect(decision.structuredIntent.invariantViolations).toContain("invalid-player-health");
    expect(decision.actions).toEqual([{ type: "pause" }]);
  });
});

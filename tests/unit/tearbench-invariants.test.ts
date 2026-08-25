import { describe, expect, it } from "vitest";
import { TEAR_CONTRACT_FORMAT, type TearObservationV1 } from "../../src/tearbench/contracts";
import { runInvariantChecks } from "../../src/tearbench/invariants";

function observation(patch: Partial<TearObservationV1> = {}): TearObservationV1 {
  return {
    format: TEAR_CONTRACT_FORMAT, kind: "observation", schemaVersion: 1, tick: 10,
    observationClass: "privileged-diagnostic",
    player: { x: 10, y: 20, vx: 0, vy: 0, hp: 100, maxHp: 100, facing: 1, grounded: true, dashCharges: 1 },
    blade: { handX: 10, handY: 20, tipX: 20, tipY: 20, vx: 0, vy: 0, tipSpeed: 0, state: "held" },
    entities: [{ id: "enemy:1", kind: "charger", x: 30, y: 20, vx: 0, vy: 0, hpRatio: 1 }],
    run: { mode: "campaign", difficulty: "normal", weapon: "sword", stage: "grounds", wave: 1,
      score: 0, elapsedTicks: 10 },
    diagnostics: { worldBounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 }, waveComplete: false,
      livingWaveEnemies: 1, boss: { id: "warden", phase: "1", validPhases: ["1", "2", "3"] },
      ui: { focusedId: "resume", focusableIds: ["resume"] }, progressTick: 9, softlockLimitTicks: 5 },
    availableActions: ["move", "weapon"], ...patch,
  };
}

describe("TearBench current-game invariants", () => {
  it("fails closed for assertions without an applicable real implementation", () => {
    expect(() => runInvariantChecks(observation(), ["replay.branch-equivalence"])).toThrow(/comparison inputs/u);
    expect(() => runInvariantChecks(observation(), ["test.production-isolation"])).toThrow(/implementation/u);
    const { diagnostics, ...withoutDiagnostics } = observation();
    expect(diagnostics).toBeDefined();
    const structured: TearObservationV1 = { ...withoutDiagnostics, observationClass: "structured-state" };
    expect(() => runInvariantChecks(structured, ["runtime.no-softlock"])).toThrow(/privileged diagnostic/u);
    expect(() => runInvariantChecks(structured, ["ui.valid-focus"])).toThrow(/privileged diagnostic/u);
  });

  it("accepts healthy Warden ordinal phases and rejects thresholds or unknown phases", () => {
    expect(runInvariantChecks(observation(), ["boss.valid-phase"])).toEqual([]);
    const current = observation();
    expect(runInvariantChecks({ ...current, diagnostics: { ...current.diagnostics,
      boss: { id: "warden", phase: "0.65", validPhases: ["1", "2", "3"] } } },
    ["boss.valid-phase"])).toHaveLength(1);
  });

  it("distinguishes progressing runtimes from genuine stalled runtimes", () => {
    expect(runInvariantChecks(observation(), ["runtime.no-softlock"])).toEqual([]);
    const current = observation();
    expect(runInvariantChecks({ ...current, tick: 20, diagnostics: { ...current.diagnostics,
      progressTick: 9, softlockLimitTicks: 5 } }, ["runtime.no-softlock"])).toHaveLength(1);
  });

  it("detects independent wave ownership, invalid focus, missing owners, and nonfinite actors", () => {
    const current = observation();
    const actor = current.entities[0];
    if (actor === undefined) throw new Error("fixture actor is unavailable");
    expect(runInvariantChecks(current, ["wave.valid-completion", "ui.valid-focus", "entity.valid-owner",
      "runtime.finite-state"])).toEqual([]);
    expect(runInvariantChecks({ ...current, diagnostics: { ...current.diagnostics,
      waveComplete: true, livingWaveEnemies: 1 } }, ["wave.valid-completion"])).toHaveLength(1);
    expect(runInvariantChecks({ ...current, diagnostics: { ...current.diagnostics,
      ui: { focusedId: "missing", focusableIds: ["resume"] } } }, ["ui.valid-focus"])).toHaveLength(1);
    expect(runInvariantChecks({ ...current, entities: [{ ...actor, ownerId: "missing" }] },
      ["entity.valid-owner"])).toHaveLength(1);
    expect(runInvariantChecks({ ...current, entities: [{ ...actor, vx: Number.NaN }] },
      ["runtime.finite-state"])).toHaveLength(1);
  });
});

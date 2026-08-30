import { describe, expect, it } from "vitest";
import { TEAR_CONTRACT_FORMAT, type TearObservationV1 } from "../../src/tearbench/contracts";
import {
  ENVIRONMENT_REQUIRED_INVARIANT_IDS,
  effectiveInvariantIdsForScenario,
  requiredInvariantIdsForSubject,
  runInvariantChecks,
} from "../../src/tearbench/invariants";
import { createSourceWaveOwnershipTracker } from "../../src/tearbench/observation-identity";
import { CANONICAL_ENGINEERING_SCENARIOS } from "../../src/tearbench/canonical-scenarios";
import { validateTearContract } from "../../src/tearbench/validation";

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
      livingWaveEnemies: 1, waveOwnership: "source-events", boss: { id: "warden", phase: "1", validPhases: ["1", "2", "3"], homeStage: "grounds" },
      ui: { focusedId: "resume", focusableIds: ["resume"] }, progressTick: 9, softlockLimitTicks: 5 },
    availableActions: ["move", "weapon"], ...patch,
  };
}

describe("TearBench current-game invariants", () => {
  it("binds the complete environment requirement set and leaves ordinary subjects unchanged", () => {
    const explicit = ["runtime.finite-state", "player.valid-health"] as const;
    expect(requiredInvariantIdsForSubject({ kind: "environment-field" })).toEqual(ENVIRONMENT_REQUIRED_INVARIANT_IDS);
    expect(requiredInvariantIdsForSubject({ kind: "environment-combat-object" })).toEqual(ENVIRONMENT_REQUIRED_INVARIANT_IDS);
    expect(effectiveInvariantIdsForScenario({ subject: { kind: "environment-field", id: "generic-field" }, assertions: explicit }))
      .toEqual([...explicit, ...ENVIRONMENT_REQUIRED_INVARIANT_IDS.slice(1)]);
    expect(effectiveInvariantIdsForScenario({ subject: { kind: "gameplay", id: "movement" }, assertions: explicit }))
      .toEqual(explicit);
  });

  it("fails closed for assertions without an applicable real implementation", () => {
    expect(() => runInvariantChecks(observation(), ["replay.branch-equivalence"])).toThrow(/comparison inputs/u);
    expect(() => runInvariantChecks(observation(), ["test.production-isolation"])).toThrow(/unsupported/u);
    const { diagnostics, ...withoutDiagnostics } = observation();
    expect(diagnostics).toBeDefined();
    const structured: TearObservationV1 = { ...withoutDiagnostics, observationClass: "structured-state" };
    expect(() => runInvariantChecks(structured, ["runtime.no-softlock"])).toThrow(/privileged diagnostic/u);
    expect(() => runInvariantChecks(structured, ["ui.valid-focus"])).toThrow(/privileged diagnostic/u);
  });

  it("fails closed when a requested privileged diagnostic field is absent", () => {
    const current = observation();
    const currentDiagnostics = current.diagnostics;
    if (currentDiagnostics === undefined) throw new Error("fixture diagnostics are unavailable");
    const { worldBounds, ...withoutWorldBounds } = currentDiagnostics;
    const { boss, ...withoutBoss } = currentDiagnostics;
    const { ui, ...withoutUi } = currentDiagnostics;
    const { progressTick, ...withoutProgressTick } = currentDiagnostics;
    const { waveOwnership, ...withoutWaveOwnership } = currentDiagnostics;
    expect(worldBounds).toBeDefined();
    expect(boss).toBeDefined();
    expect(ui).toBeDefined();
    expect(progressTick).toBeDefined();
    expect(waveOwnership).toBeDefined();
    expect(() => runInvariantChecks({ ...current, diagnostics: withoutWorldBounds }, ["world.legal-bounds"]))
      .toThrow(/worldBounds/u);
    expect(() => runInvariantChecks({ ...current, diagnostics: withoutBoss }, ["boss.valid-phase"]))
      .toThrow(/boss/u);
    expect(() => runInvariantChecks({ ...current, diagnostics: withoutUi }, ["ui.valid-focus"]))
      .toThrow(/ui/u);
    expect(() => runInvariantChecks({ ...current, diagnostics: withoutProgressTick }, ["runtime.no-softlock"]))
      .toThrow(/progressTick/u);
    expect(() => runInvariantChecks({ ...current, diagnostics: withoutWaveOwnership }, ["wave.valid-completion"]))
      .toThrow(/waveOwnership/u);
  });

  it("rejects registered but unsupported comparison claims at contract validation", () => {
    const scenario = CANONICAL_ENGINEERING_SCENARIOS.find((entry) => entry.subject.kind === "gameplay");
    if (scenario === undefined) throw new Error("canonical gameplay scenario fixture is unavailable");
    const result = validateTearContract({ ...scenario, assertions: ["replay.branch-equivalence"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((entry) => entry.message.includes("unsupported invariant"))).toBe(true);
  });

  it("accepts healthy Warden ordinal phases and rejects thresholds or unknown phases", () => {
    expect(runInvariantChecks(observation(), ["boss.valid-phase"])).toEqual([]);
    const current = observation();
    expect(runInvariantChecks({ ...current, diagnostics: { ...current.diagnostics,
      boss: { id: "warden", phase: "0.65", validPhases: ["1", "2", "3"], homeStage: "grounds" } } },
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
    expect(runInvariantChecks({ ...current, entities: [{ ...actor, ownerId: actor.id }] },
      ["entity.valid-owner"])).toHaveLength(1);
    expect(runInvariantChecks({ ...current, entities: [{ ...actor, vx: Number.NaN }] },
      ["runtime.finite-state"])).toHaveLength(1);
    expect(runInvariantChecks({ ...current, navigation: { surfaces: [{
      id: "surface:test", bounds: { minX: Number.NaN, maxX: 10, minY: 0, maxY: 10 },
      oneWay: false, collidable: true, materializationState: "active", connectionIds: [],
    }], hazards: [] } }, ["runtime.finite-state"])).toHaveLength(1);
  });

  it("tracks wave-owned actors from source events without counting unrelated living entities", () => {
    const ownership = createSourceWaveOwnershipTracker();
    ownership.consume({ kind: "wave", tick: 0, wave: 1, event: "start" });
    ownership.consume({ kind: "run", tick: 0, transition: "started", runId: "run:opening",
      mode: "endless", difficulty: "normal", weaponId: "sword", wave: 0, score: 0, runTimeSeconds: 0 });
    ownership.consume({ kind: "spawn", tick: 0, actorId: "enemy:old", actorKind: "charger", x: 1, y: 2 });
    expect([...ownership.actors(1) ?? []]).toEqual(["enemy:old"]);

    ownership.consume({ kind: "wave", tick: 4, wave: 2, event: "start" });
    ownership.consume({ kind: "spawn", tick: 4, actorId: "enemy:current", actorKind: "charger", x: 3, y: 4 });
    expect([...ownership.actors(2) ?? []]).toEqual(["enemy:current"]);
    expect(ownership.actors(1)).toBeUndefined();

    const current = observation();
    expect(runInvariantChecks({ ...current, diagnostics: { ...current.diagnostics,
      waveOwnership: "source-events", waveComplete: true, livingWaveEnemies: 0 } }, ["wave.valid-completion"]))
      .toEqual([]);
    const { livingWaveEnemies, ...unknownWaveDiagnostics } = current.diagnostics ?? {};
    expect(livingWaveEnemies).toBe(1);
    expect(() => runInvariantChecks({ ...current, diagnostics: { ...unknownWaveDiagnostics,
      waveOwnership: "unavailable" } }, ["wave.valid-completion"]))
      .toThrow(/source-owned current-wave actor evidence/u);
    expect(runInvariantChecks({ ...current, run: { ...current.run, mode: "playground" },
      diagnostics: { ...unknownWaveDiagnostics, waveOwnership: "unavailable" } }, ["wave.valid-completion"]))
      .toEqual([]);

    ownership.consume({ kind: "death", tick: 5, actorId: "enemy:current", cause: "blade" });
    expect([...ownership.actors(2) ?? []]).toEqual([]);
    ownership.invalidate();
    expect(ownership.actors(2)).toBeUndefined();
    ownership.restoreEmptyWave(2);
    expect([...ownership.actors(2) ?? []]).toEqual([]);
    ownership.consume({ kind: "spawn", tick: 6, actorId: "enemy:restored", actorKind: "charger", x: 5, y: 6 });
    expect([...ownership.actors(2) ?? []]).toEqual(["enemy:restored"]);
    expect(() => { ownership.restoreEmptyWave(-1); }).toThrow(/non-negative safe integer/u);
  });
});

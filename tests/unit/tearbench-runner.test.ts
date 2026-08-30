import { describe, expect, it } from "vitest";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import {
  CANONICAL_ENGINEERING_SCENARIOS,
  TEAR_CONTRACT_FORMAT,
  TearBenchRunner,
  createRunArtifact,
  createFailureArtifact,
  createBranchDivergenceFailure,
  investigateRegressionRuns,
  createCanonicalScenarioRegistry,
  createProductionHeadlessEnvironment,
  type TearObservationV1,
  type TearScenarioRuntime,
  type TearScenarioV1,
} from "../../src/tearbench";
import type { TearScenarioTransition } from "../../src/tearbench/runner";

function observation(tick: number, hp = 100, scenario?: TearScenarioV1): TearObservationV1 {
  return {
    format: TEAR_CONTRACT_FORMAT, kind: "observation", schemaVersion: 1, tick,
    observationClass: "structured-state",
    player: { x: 100 + tick, y: 600, vx: 120, vy: 0, hp, maxHp: 100, facing: 1, grounded: true, dashCharges: 1 },
    blade: { handX: 120, handY: 580, tipX: 180, tipY: 560, vx: 60, vy: -20, tipSpeed: 64, state: "held" },
    entities: [],
    run: {
      mode: scenario?.start.mode ?? "campaign", difficulty: scenario?.start.difficulty ?? "normal",
      weapon: scenario?.start.weapon ?? "sword", stage: scenario?.start.stage ?? "grounds",
      wave: scenario?.start.wave ?? 1, score: 0, elapsedTicks: tick,
    },
    availableActions: ["move", "jump", "dash", "aim", "weapon"],
  };
}

class FixtureRuntime implements TearScenarioRuntime {
  #tick = 0;
  #failAt: number | undefined;
  #scenario: TearScenarioV1 | undefined;

  constructor(failAt?: number) { this.#failAt = failAt; }

  reset(scenario: TearScenarioV1): TearObservationV1 {
    this.#scenario = scenario;
    this.#tick = 0;
    return observation(0, 100, scenario);
  }

  step(actions: Parameters<TearScenarioRuntime["step"]>[0]) {
    this.#tick += 1;
    return {
      observation: observation(this.#tick, this.#tick === this.#failAt ? Number.NaN : 100, this.#scenario),
      events: [],
      actions,
      terminated: this.#tick === 5,
      truncated: false,
      info: {},
    };
  }

  metrics() { return { steps: this.#tick }; }
}

type EnvironmentObservation = NonNullable<TearObservationV1["environment"]>;

function environmentObservation(
  tick: number,
  scenario: TearScenarioV1,
  environment: EnvironmentObservation,
): TearObservationV1 {
  return { ...observation(tick, 100, scenario), environment };
}

function environmentField(id: string, state = "active") {
  return {
    id, kind: "bloom-well" as const,
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }, state, active: state === "active",
  };
}

function environmentCombatObject(overrides: Partial<EnvironmentObservation["combatObjects"][number]> = {}) {
  return {
    id: "combat:1", kind: "root-link" as const, ownerId: "player", targetId: "player",
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }, integrityRatio: 1, state: "active",
    counterplayTags: [], procEligible: false, ...overrides,
  };
}

function environment(fields: EnvironmentObservation["fields"] = [], combatObjects: EnvironmentObservation["combatObjects"] = []): EnvironmentObservation {
  return { fields, combatObjects, routes: [] };
}

class SequenceEnvironmentRuntime implements TearScenarioRuntime {
  #index = 0;

  constructor(readonly observations: readonly TearObservationV1[]) {}

  reset(): TearObservationV1 {
    this.#index = 0;
    return this.observations[0]!;
  }

  step(actions: Parameters<TearScenarioRuntime["step"]>[0]): TearScenarioTransition {
    this.#index = Math.min(this.#index + 1, this.observations.length - 1);
    return { observation: this.observations[this.#index]!, events: [], actions,
      terminated: true, truncated: false, info: {} };
  }

  metrics() { return { steps: this.#index }; }
}

function environmentScenario(): TearScenarioV1 {
  const scenario = createCanonicalScenarioRegistry().get("generic-environment-field-transition");
  return { ...scenario, assertions: ["runtime.finite-state"] };
}

function runEnvironmentSequence(observations: readonly TearObservationV1[]) {
  return new TearBenchRunner(new SequenceEnvironmentRuntime(observations)).run(environmentScenario());
}

describe("TearBench engineering runner", () => {
  it("registers the canonical engineering scenarios", () => {
    const registry = createCanonicalScenarioRegistry();
    expect(registry.list()).toHaveLength(CANONICAL_ENGINEERING_SCENARIOS.length);
    expect(registry.get("projectile-parry-basic").tags).toContain("parry");
    expect(registry.get("source-void-low-hp-rescue-seek").tags).toEqual(expect.arrayContaining(["source", "void", "hazard", "rescue", "seek"]));
    expect(registry.get("chainblade-hook-sling-catch-seek").tags).toEqual(expect.arrayContaining(["chainblade", "hook", "sling", "catch", "seek"]));
    expect(registry.get("hammer-meteor-terrain-catch-seek").tags).toEqual(expect.arrayContaining(["hammer", "meteor", "terrain", "catch", "seek"]));
    expect(registry.get("greatsword-wheelcut-catch-seek").tags).toEqual(expect.arrayContaining(["greatsword", "wheelcut", "catch", "seek"]));
    expect(registry.get("riftlock-loose-cannon-catch-seek").tags).toEqual(expect.arrayContaining(["riftlock", "capture", "backblast", "catch", "seek"]));
    expect(registry.get("sword-reversal-threadcut-catch-seek").tags).toEqual(expect.arrayContaining(["sword", "reversal", "threadcut", "catch", "seek"]));
    const firstScenario = registry.get(CANONICAL_ENGINEERING_SCENARIOS[0]?.id ?? "");
    expect(() => { registry.register(firstScenario); }).toThrow(/version/u);
  });

  it("binds each current-game subject to its compatible natural opening", () => {
    const registry = createCanonicalScenarioRegistry();
    for (const scenario of CANONICAL_ENGINEERING_SCENARIOS) {
      expect(scenario.stateClass, scenario.id).toBe("recorded-canonical");
      expect(scenario.start.stage, scenario.id).toBeUndefined();
    }
    for (const weapon of WEAPON_IDS) {
      const scenario = CANONICAL_ENGINEERING_SCENARIOS.find((entry) => entry.id.startsWith(`${weapon}-`));
      expect(scenario?.start.weapon, weapon).toBe(weapon);
    }
    expect(registry.get("source-void-low-hp-rescue-seek").start).toMatchObject({
      mode: "bossonly", boss: "source", weapon: "sword",
    });
  });

  it("resets every headless-compatible canonical scenario through the source-owned backend", () => {
    for (const scenario of CANONICAL_ENGINEERING_SCENARIOS.filter((entry) => entry.backends.includes("headless"))) {
      const environment = createProductionHeadlessEnvironment();
      environment.reset(scenario);
      expect(environment.policyObservation().run, scenario.id).toMatchObject({
        mode: scenario.start.mode, difficulty: scenario.start.difficulty, weapon: scenario.start.weapon,
      });
      environment.dispose();
    }
  });

  it("repeats the isolated runner fixture without presenting it as gameplay-mechanic evidence", () => {
    const scenario = createCanonicalScenarioRegistry().get("movement-jump");
    const hashes = Array.from({ length: 2 }, () => new TearBenchRunner(new FixtureRuntime()).run(scenario).semanticHash);
    expect(new Set(hashes)).toHaveLength(1);
    expect(new TearBenchRunner(new FixtureRuntime()).run(scenario).status).toBe("passed");
  });

  it("captures the first deterministic invariant failure", () => {
    const scenario = createCanonicalScenarioRegistry().get("movement-jump");
    const result = new TearBenchRunner(new FixtureRuntime(3)).run(scenario);
    expect(result.status).toBe("failed");
    expect(result.ticks).toBe(3);
    expect(result.failures.map((entry) => entry.id)).toContain("player.valid-health");
    const artifact = createFailureArtifact(result, {
      id: "failure-1",
      build: {
        version: "0.1.0", revision: "test", target: "unit", rulesetVersion: "test-rules",
        contentHash: "sha256:aaaaaaaa", configHash: "sha256:bbbbbbbb",
      },
      hashes: {
        exact: "sha256:11111111", semantic: "sha256:22222222", visual: "sha256:33333333",
        progression: "sha256:44444444", environment: "sha256:55555555",
      },
      attachments: { report: "artifacts/failure-1/report.md" },
    });
    expect(artifact.firstFailureTick).toBe(3);
    expect(artifact.invariantId).toBe("player.valid-health");
  });

  it.each([
    ["duplicate environment IDs", (scenario: TearScenarioV1) => environmentObservation(0, scenario,
      environment([environmentField("duplicate"), environmentField("duplicate")])), "environment.unique-id"],
    ["missing environment owner/target", (scenario: TearScenarioV1) => environmentObservation(0, scenario,
      environment([], [environmentCombatObject({ ownerId: "missing-owner", targetId: "missing-target" })])), "environment.valid-references"],
    ["illegal environment transition", (scenario: TearScenarioV1) => environmentObservation(1, scenario,
      environment([environmentField("transition", "active")])), "environment.legal-transition"],
    ["environment population bound", (scenario: TearScenarioV1) => environmentObservation(0, scenario,
      environment(Array.from({ length: 65 }, (_, index) => environmentField(`field:${String(index)}`)))), "environment.bounded"],
  ] as const)("automatically fails on %s even when the caller supplies only base assertions", (name, makeObservation, failureId) => {
    const scenario = environmentScenario();
    const initial = name === "illegal environment transition"
      ? environmentObservation(0, scenario, environment([environmentField("transition", "destroyed")]))
      : makeObservation(scenario);
    const observations = name === "illegal environment transition"
      ? [initial, makeObservation(scenario)]
      : [initial];
    const result = runEnvironmentSequence(observations);
    expect(result.status, name).toBe("failed");
    expect(result.failures.some((failure) => failure.id === failureId), name).toBe(true);
  });

  it("pauses without advancing simulation and resumes deterministically", () => {
    const scenario = createCanonicalScenarioRegistry().get("movement-jump");
    const session = new TearBenchRunner(new FixtureRuntime()).createSession(scenario);
    expect(session.step().ticks).toBe(1);
    session.pause();
    expect(session.step().ticks).toBe(1);
    expect(session.snapshot().status).toBe("paused");
    session.resume();
    expect(session.step().ticks).toBe(2);
    session.terminate();
    expect(session.done()).toBe(true);
    expect(session.result().status).toBe("truncated");
  });

  it("packages the resolved scenario, evidence, and exact rerun coordinates", () => {
    const scenario = createCanonicalScenarioRegistry().get("blade-valid-cut");
    const result = new TearBenchRunner(new FixtureRuntime()).run(scenario);
    const artifact = createRunArtifact(result, {
      id: "run-1",
      createdAt: "2026-07-23T00:00:00.000Z",
      build: {
        version: "0.1.0", revision: "test", target: "unit", rulesetVersion: "test-rules",
        contentHash: "sha256:aaaaaaaa", configHash: "sha256:bbbbbbbb",
      },
      console: [{ level: "info", message: "fixture completed" }],
      hooks: {
        captureScreenshot: (name) => `artifacts/${name}`,
        captureReplay: (name) => `artifacts/${name}`,
      },
    });
    expect(artifact.resolvedScenario.id).toBe("blade-valid-cut");
    expect(artifact.attachments).toEqual({
      actionTrace: "run-1.actions.json",
      screenshot: "artifacts/run-1.png",
      replay: "artifacts/run-1.replay.json",
    });
    expect(artifact.rerun).toMatchObject({ scenarioId: "blade-valid-cut", seed: "1001" });
  });

  it("persists an input-locked base/candidate investigation at the first material tick", () => {
    const scenario = createCanonicalScenarioRegistry().get("blade-valid-cut");
    const build = {
      version: "0.1.0", revision: "base", target: "unit", rulesetVersion: "test-rules",
      contentHash: "sha256:aaaaaaaa", configHash: "sha256:bbbbbbbb",
    } as const;
    const base = createRunArtifact(new TearBenchRunner(new FixtureRuntime()).run(scenario), {
      id: "base-run", createdAt: "2026-07-28T00:00:00.000Z", build,
    });
    const candidate = {
      ...base, id: "candidate-run", build: { ...build, revision: "candidate", contentHash: "sha256:cccccccc" },
      observations: base.observations.map((entry) => entry.tick === 3
        ? { ...entry, player: { ...entry.player, x: entry.player.x + 1 } } : entry),
    };
    const investigation = investigateRegressionRuns({ base, candidate, createdAt: "2026-07-28T00:01:00.000Z" });
    expect(investigation).toMatchObject({ status: "diverged", comparison: { firstMaterialDivergence: { tick: 3 } } });
    const failure = createBranchDivergenceFailure({
      investigation, candidate, baseRunPath: "artifacts/base-run.json", candidateRunPath: "artifacts/candidate-run.json",
      investigationPath: "artifacts/investigation.json",
    });
    expect(failure).toMatchObject({ invariantId: "replay.branch-equivalence", firstFailureTick: 3 });
    expect(failure.attachments).toEqual({
      baseRun: "artifacts/base-run.json", candidateRun: "artifacts/candidate-run.json", investigation: "artifacts/investigation.json",
    });
    expect(() => investigateRegressionRuns({
      base, candidate: { ...candidate, seed: "different-seed" }, createdAt: "2026-07-28T00:01:00.000Z",
    })).toThrow(/identical seed/u);
  });
});

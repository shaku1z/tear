import { describe, expect, it } from "vitest";
import {
  CANONICAL_ENGINEERING_SCENARIOS,
  TEAR_CONTRACT_FORMAT,
  TearBenchRunner,
  createRunArtifact,
  createFailureArtifact,
  createCanonicalScenarioRegistry,
  type TearObservationV1,
  type TearScenarioRuntime,
  type TearScenarioV1,
} from "../../src/tearbench";

function observation(tick: number, hp = 100): TearObservationV1 {
  return {
    format: TEAR_CONTRACT_FORMAT, kind: "observation", schemaVersion: 1, tick,
    observationClass: "structured-state",
    player: { x: 100 + tick, y: 600, vx: 120, vy: 0, hp, maxHp: 100, facing: 1, grounded: true, dashCharges: 1 },
    blade: { handX: 120, handY: 580, tipX: 180, tipY: 560, vx: 60, vy: -20, tipSpeed: 64, state: "held" },
    entities: [],
    run: { mode: "campaign", difficulty: "normal", weapon: "sword", stage: "grounds", wave: 1, score: 0, elapsedTicks: tick },
    availableActions: ["move", "jump", "dash", "aim", "weapon"],
  };
}

class FixtureRuntime implements TearScenarioRuntime {
  #tick = 0;
  #failAt: number | undefined;

  constructor(failAt?: number) { this.#failAt = failAt; }

  reset(scenario: TearScenarioV1): TearObservationV1 {
    void scenario;
    this.#tick = 0;
    return observation(0);
  }

  step(actions: Parameters<TearScenarioRuntime["step"]>[0]) {
    this.#tick += 1;
    return {
      observation: observation(this.#tick, this.#tick === this.#failAt ? Number.NaN : 100),
      events: [],
      actions,
      terminated: this.#tick === 5,
      truncated: false,
      info: {},
    };
  }

  metrics() { return { steps: this.#tick }; }
}

describe("TearBench engineering runner", () => {
  it("registers the seven canonical engineering scenarios", () => {
    const registry = createCanonicalScenarioRegistry();
    expect(registry.list()).toHaveLength(7);
    expect(registry.get("projectile-parry-basic").tags).toContain("parry");
    const firstScenario = registry.get(CANONICAL_ENGINEERING_SCENARIOS[0]?.id ?? "");
    expect(() => { registry.register(firstScenario); }).toThrow(/version/u);
  });

  it("repeats every canonical scenario with an identical semantic result", () => {
    for (const scenario of CANONICAL_ENGINEERING_SCENARIOS) {
      const hashes = Array.from({ length: 100 }, () => new TearBenchRunner(new FixtureRuntime()).run(scenario).semanticHash);
      expect(new Set(hashes), scenario.id).toHaveLength(1);
      expect(new TearBenchRunner(new FixtureRuntime()).run(scenario).status).toBe("passed");
    }
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
});

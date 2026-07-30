import { describe, expect, it } from "vitest";
import type { CommandEnvelope } from "../../src/domain/envelopes";
import type { GameAction } from "../../src/input/game-action";
import {
  TEAR_CONTRACT_FORMAT,
  investigateRegressionRuns,
  minimizeRegressionReplay,
  type TearBenchRunArtifactV1,
  type TearObservationV1,
  type TearSnapshotV1,
  type TearRegressionReplayRequest,
} from "../../src/tearbench";

const actions: readonly CommandEnvelope<GameAction>[] = Object.freeze([
  { kind: "command", id: 1, tick: 1, command: { type: "move", x: 1000, y: 0 } },
  { kind: "command", id: 2, tick: 2, command: { type: "dash", x: 1000, y: 0 } },
  { kind: "command", id: 3, tick: 3, command: { type: "aim", turn: 0, magnitude: 1000 } },
  { kind: "command", id: 4, tick: 4, command: { type: "weapon", intent: "primary", phase: "pressed" } },
]);

function replayContext(side: "base" | "candidate", snapshot?: TearSnapshotV1) {
  return {
    expectedBuild: { version: "0.1.0", revision: side, target: "unit", rulesetVersion: "test-rules", contentHash: `sha256:${side}`, configHash: "sha256:config" },
    ...(snapshot === undefined ? {} : { initialSnapshot: snapshot, presentation: { viewport: { width: 1600, height: 900 }, colorScheme: "dark" as const, reducedMotion: "reduce" as const } }),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEntityWithId(value: unknown, id: string): boolean {
  return isRecord(value) && value.id === id;
}

function artifact(request: TearRegressionReplayRequest): TearBenchRunArtifactV1 {
  const hasDash = request.actions.some((entry) => entry.command.type === "dash");
  const observations: readonly TearObservationV1[] = Array.from({ length: request.maxTicks + 1 }, (_, tick) => ({
    format: TEAR_CONTRACT_FORMAT, kind: "observation" as const, schemaVersion: 1 as const, tick,
    observationClass: "structured-state" as const,
    player: { x: 100 + tick + (request.side === "candidate" && hasDash && tick >= 2 ? 1 : 0), y: 600, vx: 0, vy: 0, hp: 100, maxHp: 100, facing: 1 as const, grounded: true, dashCharges: 1 },
    blade: { handX: 120, handY: 580, tipX: 180, tipY: 560, vx: 0, vy: 0, tipSpeed: 0, state: "held" as const },
    entities: [],
    run: { mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const, stage: "grounds", wave: 1, score: 0, elapsedTicks: tick },
    availableActions: ["move", "jump", "dash", "aim", "weapon"] as const,
  }));
  return {
    format: "tearbench-run", schemaVersion: 1,
    id: `${request.side}-${String(request.attempt)}-${String(request.actions.length)}-${String(request.maxTicks)}`,
    createdAt: "2026-07-28T00:00:00.000Z",
    build: { version: "0.1.0", revision: request.side, target: "unit", rulesetVersion: "test-rules", contentHash: `sha256:${request.side}`, configHash: "sha256:config" },
    resolvedScenario: {
      format: TEAR_CONTRACT_FORMAT, kind: "scenario", schemaVersion: 1,
      id: "movement-jump", version: 1, description: "fixture", stateClass: "recorded-canonical", executionClass: "engineering",
      seed: "minimizer-seed", start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: request.maxTicks, assertions: [], tags: [],
    },
    seed: "minimizer-seed", status: "passed", ticks: request.maxTicks, actions: request.actions,
    events: [], observations, metrics: { fixedTicks: request.maxTicks }, failures: [], console: [],
    hashes: { semantic: `${request.side}-${hasDash ? "dash" : "idle"}-${String(request.maxTicks)}` }, attachments: {},
    rerun: { scenarioId: "movement-jump", scenarioVersion: 1, seed: "minimizer-seed", actionTrace: "fixture.actions.json" },
    ...(request.context.initialSnapshot === undefined && request.context.presentation === undefined ? {} : {
      replayContext: {
        ...(request.context.initialSnapshot === undefined ? {} : { initialSnapshot: request.context.initialSnapshot }),
        ...(request.context.presentation === undefined ? {} : { presentation: request.context.presentation }),
      },
    }),
  };
}

function dimensionalSnapshot(): TearSnapshotV1 {
  return {
    format: TEAR_CONTRACT_FORMAT, kind: "snapshot", schemaVersion: 1, id: "dimension-fixture", tick: 0,
    stateClass: "surgical-valid", seed: "minimizer-seed",
    hashes: { exact: "snapshot-exact", semantic: "snapshot-semantic", visual: "snapshot-visual", progression: "snapshot-progression", environment: "snapshot-environment" },
    provenance: {
      actor: "state-forge", producer: "unit-fixture",
      build: { version: "0.1.0", revision: "fixture", target: "unit", rulesetVersion: "test-rules", contentHash: "sha256:fixture", configHash: "sha256:fixture" },
      executionClass: "engineering", observationClass: "privileged-diagnostic", trainingConsent: "no-training",
    },
    rng: { combat: { algorithm: "mulberry32", state: "11" }, cosmetic: { algorithm: "mulberry32", state: "22" } },
    codecs: { "tear.player.v1": 1, "tear.enemy.v1": 1, "tear.rng.v1": 1, "tear.unused.v1": 1 },
    state: {
      "tear.player.v1": { id: "player", hp: 100 },
      "tear.enemy.v1": [{ id: "needed" }, { id: "unneeded" }],
      "tear.rng.v1": { combat: { state: 11 }, cosmetic: { state: 22 } },
      "tear.unused.v1": { diagnostic: true },
    },
  };
}

describe("TearBench replay regression minimization", () => {
  it("replays both revisions, minimizes irrelevant actions and timeline, and keeps a stable child lineage", async () => {
    const originalBase = artifact({ side: "base", actions, maxTicks: 8, attempt: 0, context: replayContext("base") });
    const originalCandidate = artifact({ side: "candidate", actions, maxTicks: 8, attempt: 0, context: replayContext("candidate") });
    expect(investigateRegressionRuns({ base: originalBase, candidate: originalCandidate, createdAt: "2026-07-28T00:00:00.000Z" }).status).toBe("diverged");
    const requests: TearRegressionReplayRequest[] = [];
    const minimized = await minimizeRegressionReplay({
      originalBase,
      originalCandidate,
      createdAt: "2026-07-28T00:05:00.000Z",
      repetitions: 2,
      maxPairExecutions: 30,
      executor: {
        async materialize(request) {
          requests.push(request);
          return await Promise.resolve(artifact(request));
        },
      },
    });
    expect(minimized.status).toBe("minimized");
    expect(minimized.signature.firstDivergenceTick).toBe(2);
    expect(minimized.original.actionCount).toBe(4);
    expect(minimized.minimalChild.actions.map((entry) => entry.command.type)).toEqual(["dash"]);
    expect(minimized.minimalChild.maxTicks).toBe(2);
    expect(minimized.minimalChild.base.artifactHash).not.toBe(minimized.original.base.artifactHash);
    expect(requests.filter((entry) => entry.side === "base")).toHaveLength(requests.filter((entry) => entry.side === "candidate").length);
    expect(requests.every((entry) => entry.attempt > 0)).toBe(true);
  });

  it("rejects a minimizer whose replay no longer has the original material divergence", async () => {
    const originalBase = artifact({ side: "base", actions, maxTicks: 8, attempt: 0, context: replayContext("base") });
    const originalCandidate = artifact({ side: "candidate", actions, maxTicks: 8, attempt: 0, context: replayContext("candidate") });
    await expect(minimizeRegressionReplay({
      originalBase, originalCandidate, createdAt: "2026-07-28T00:05:00.000Z", repetitions: 2,
      executor: {
        async materialize(request) {
          const base = artifact({ ...request, side: "base" });
          return await Promise.resolve({ ...base, build: request.context.expectedBuild });
        },
      },
    })).rejects.toThrow(/does not reproduce the material divergence stably/u);
  });

  it("replays and minimizes persisted State Forge state, entity, RNG, presentation, and pinned build coordinates", async () => {
    const snapshot = dimensionalSnapshot();
    const originalBase = artifact({ side: "base", actions, maxTicks: 8, attempt: 0, context: replayContext("base", snapshot) });
    const originalCandidate = artifact({ side: "candidate", actions, maxTicks: 8, attempt: 0, context: replayContext("candidate", snapshot) });
    const requests: TearRegressionReplayRequest[] = [];
    const minimized = await minimizeRegressionReplay({
      originalBase, originalCandidate, createdAt: "2026-07-28T00:05:00.000Z", repetitions: 2, maxPairExecutions: 80,
      executor: {
        async materialize(request) {
          requests.push(request);
          const output = artifact(request);
          const snapshot = request.context.initialSnapshot;
          const state = snapshot?.state;
          const enemies = state?.["tear.enemy.v1"];
          const rngCodec = state?.["tear.rng.v1"];
          const validInitialCoordinate = state?.["tear.player.v1"] !== undefined
            && Array.isArray(enemies) && enemies.some((entry) => isEntityWithId(entry, "needed"))
            && snapshot?.rng.combat !== undefined && isRecord(rngCodec) && rngCodec.combat !== undefined;
          if (request.side !== "candidate" || validInitialCoordinate) return await Promise.resolve(output);
          throw new Error("State Forge snapshot restore failed during materialization: decode");
        },
      },
    });
    const minimalSnapshot = minimized.minimalChild.replayContext.base.initialSnapshot;
    expect(minimized.minimalChild.reducedDimensions).toEqual(expect.arrayContaining(["actions", "timeline", "state", "entities", "rng", "presentation", "build"]));
    expect(minimalSnapshot?.state["tear.unused.v1"]).toBeUndefined();
    expect(minimalSnapshot?.state["tear.enemy.v1"]).toEqual([{ id: "needed" }]);
    expect(minimalSnapshot?.rng.cosmetic).toBeUndefined();
    expect((minimalSnapshot?.state["tear.rng.v1"] as Record<string, unknown>).cosmetic).toBeUndefined();
    expect(minimized.minimalChild.replayContext.base.presentation).toEqual({});
    expect(minimized.minimalChild.lineage.relation).toBe("minimized-from");
    expect(requests.every((request) => request.context.expectedBuild.revision === request.side)).toBe(true);
    expect(requests.some((request) => request.context.initialSnapshot?.state["tear.unused.v1"] === undefined)).toBe(true);
  });
});

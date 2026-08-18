import { describe, expect, it } from "vitest";

import { stableVerificationHash } from "../../src/replay/hash";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import {
  advanceTearOfflineRlCheckpoint,
  completeTearOfflineRlCheckpoint,
  createTearOfflineRlCheckpoint,
  createTearOfflineRlPlan,
  extractTearOfflineRlTrajectories,
  parseTearOfflineRlPlan,
  TearOfflineRlCheckpointVault,
  TearOfflineRlTrainingVault,
  TearOfflineRlTrajectoryVault,
  type TearAcademyTrainingDatasetV1,
  type TearOfflineRlTrainingConfigV1,
  type TearOfflineRlPlanRequestV1,
} from "../../src/agents";
import type { CanonicalGameplayState } from "../../src/gameplay/runtime/canonical-state";

function state(tick: number, score: number): CanonicalGameplayState {
  return Object.freeze({ tick, input: {} as never, run: Object.freeze({ mode: "endless", wave: 1, score, time: tick, seed: 7 }),
    player: Object.freeze({ x: 0, y: 0, vx: 0, vy: 0, hp: 100_000 }), blade: Object.freeze({ state: "held", x: 0, y: 0, vx: 0, vy: 0 }), enemies: Object.freeze([]) });
}

function scenario(id = "c34-training", seed = "c34-training-seed") {
  return Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const, id, version: 1,
    description: "C34 governed source-world fixture", stateClass: "recorded-canonical" as const, executionClass: "training" as const, seed,
    start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 12,
    assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c34"] as const) });
}

const request: TearOfflineRlPlanRequestV1 = Object.freeze({ id: "c34-offline-fixture", version: 1, seed: 7,
  reward: Object.freeze({ components: Object.freeze([
    Object.freeze({ id: "completion", source: "run.completed" as const, weight: 5, maximumSourceValue: 1, perTransitionCap: 5 }),
    Object.freeze({ id: "defeat", source: "run.defeated" as const, weight: -8, maximumSourceValue: 1, perTransitionCap: 8 }),
    Object.freeze({ id: "wave", source: "wave.cleared" as const, weight: 0.5, maximumSourceValue: 2, perTransitionCap: 1 }),
    Object.freeze({ id: "enemy", source: "enemy.defeated" as const, weight: 0.25, maximumSourceValue: 4, perTransitionCap: 1 }),
    Object.freeze({ id: "score", source: "score.delta" as const, weight: 0.1, maximumSourceValue: 20, perTransitionCap: 2 }),
  ]), totalMinimum: -10, totalMaximum: 10 }),
  limits: Object.freeze({ maxTransitions: 20, maxEventsPerTransition: 4, maxRewardViolations: 0 as const }) });

const trainingConfig: TearOfflineRlTrainingConfigV1 = Object.freeze({ epochs: 2, learningRate: 0.5, gamma: 0.9,
  maxStateActionEntries: 8, maxAbsoluteQ: 100, maxMeanAbsoluteTdError: 100, maxConsecutiveDivergentEpochs: 2 });

function dataset(options: Readonly<{ split?: "training" | "validation"; duplicateCompletion?: boolean; invalidActionTick?: boolean; scenarioId?: string }> = {}): TearAcademyTrainingDatasetV1 {
  const states = [state(0, 0), state(1, 4), state(2, 6)];
  const terminal = Object.freeze({ tick: 2, semanticHash: stableVerificationHash(states[2]), terminated: true, truncated: false });
  const tracks = Object.freeze({ observations: Object.freeze(states), actions: Object.freeze([
    Object.freeze({ kind: "command" as const, id: 1, tick: options.invalidActionTick === true ? 3 : 1, command: Object.freeze({ type: "move" as const, x: 100, y: 0 }) }),
  ]), nativeEvents: Object.freeze([
    Object.freeze({ kind: "death" as const, tick: 1, actorId: "enemy-1", cause: "blade" }),
    Object.freeze({ kind: "wave" as const, tick: 1, wave: 1, event: "cleared" }),
    Object.freeze({ kind: "run" as const, tick: 2, transition: "completed" as const, runId: "run-c34", mode: "endless", difficulty: "normal", weaponId: "sword", wave: 1, score: 6, runTimeSeconds: 1 }),
    ...(options.duplicateCompletion === true ? [Object.freeze({ kind: "run" as const, tick: 2, transition: "completed" as const, runId: "run-c34", mode: "endless", difficulty: "normal", weaponId: "sword", wave: 1, score: 6, runTimeSeconds: 1 })] : []),
  ]), rewardComponents: Object.freeze(states.map((entry) => Object.freeze({ tick: entry.tick, value: null }))), intents: Object.freeze([]), terminal }) as never;
  const source = scenario(options.scenarioId);
  return Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1,
    manifest: Object.freeze({ id: "c34-manifest", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }),
    sequences: Object.freeze([Object.freeze({ candidateHash: "c".repeat(16), split: options.split ?? "training", lessonId: "movement-foundations", segmentKind: "demonstration",
      tags: Object.freeze([]), sourceScenario: source, tracks, sequenceHash: "d".repeat(16) })]), observationCount: 3, actionCount: 1, datasetHash: "e".repeat(16) });
}

describe("C34 offline RL training input", () => {
  it("binds deterministic source-world training transitions, observable rewards, and one terminal to an immutable plan", () => {
    const governed = dataset(), plan = createTearOfflineRlPlan(governed, request);
    const first = extractTearOfflineRlTrajectories(governed, plan), second = extractTearOfflineRlTrajectories(governed, plan);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ format: "tear-offline-rl-trajectory-receipt", metrics: { sequenceCount: 1, transitionCount: 2, terminalTransitions: 1 } });
    expect(first.trajectories[0]?.reward.total).toBeCloseTo(1.15);
    expect(first.trajectories[1]).toMatchObject({ terminal: true, reward: { total: 5.2 } });
    expect(first.metrics.componentTotals).toMatchObject({ completion: 5, defeat: 0, wave: 0.5, enemy: 0.25 });
    expect(first.metrics.componentTotals.score).toBeCloseTo(0.6);
    expect(first.trajectories[0]?.actions).toHaveLength(1);
    expect(first.trajectories[1]?.actions).toHaveLength(0);
  });

  it("accepts only a training split and binds every selected source scenario exactly once", () => {
    expect(() => createTearOfflineRlPlan(dataset({ split: "validation" }), request)).toThrow(/training split/u);
    const plan = createTearOfflineRlPlan(dataset(), request);
    const altered = structuredClone(plan) as unknown as { curriculum: { scenarioHashes: string[] } };
    altered.curriculum.scenarioHashes.push("f".repeat(16));
    expect(() => parseTearOfflineRlPlan(altered)).toThrow(/governed selection|integrity/u);
  });

  it("fails closed on a planted reward hack instead of rewarding duplicate terminal facts", () => {
    const governed = dataset({ duplicateCompletion: true }), plan = createTearOfflineRlPlan(governed, request);
    expect(() => extractTearOfflineRlTrajectories(governed, plan)).toThrow(/reward source bound exceeded: completion/u);
  });

  it("rejects an action trace that leaves its sealed source episode", () => {
    const governed = dataset({ invalidActionTick: true }), plan = createTearOfflineRlPlan(governed, request);
    expect(() => extractTearOfflineRlTrajectories(governed, plan)).toThrow(/action trace/u);
  });

  it("performs real deterministic fitted-Q updates and a resumed checkpoint equals a one-shot completed result", () => {
    const governed = dataset(), receipt = extractTearOfflineRlTrajectories(governed, createTearOfflineRlPlan(governed, request));
    const initial = createTearOfflineRlCheckpoint(receipt, trainingConfig);
    const oneShot = completeTearOfflineRlCheckpoint(advanceTearOfflineRlCheckpoint(initial, receipt, trainingConfig, 2), receipt, trainingConfig);
    const resumed = completeTearOfflineRlCheckpoint(advanceTearOfflineRlCheckpoint(
      advanceTearOfflineRlCheckpoint(initial, receipt, trainingConfig, 1), receipt, trainingConfig, 1,
    ), receipt, trainingConfig);
    expect(resumed).toEqual(oneShot);
    expect(oneShot).toMatchObject({ disposition: "completed", model: { format: "tear-offline-tabular-q-model-v2" } });
    expect(oneShot.model?.entries.some((entry) => entry.value !== 0)).toBe(true);
  });

  it("stops a diverging run before a completed model exists", () => {
    const governed = dataset(), receipt = extractTearOfflineRlTrajectories(governed, createTearOfflineRlPlan(governed, request));
    const guard = Object.freeze({ ...trainingConfig, maxAbsoluteQ: 0.01 });
    const stopped = advanceTearOfflineRlCheckpoint(createTearOfflineRlCheckpoint(receipt, guard), receipt, guard, 2);
    const result = completeTearOfflineRlCheckpoint(stopped, receipt, guard);
    expect(stopped.status).toBe("stopped-divergence");
    expect(result).toMatchObject({ disposition: "stopped-divergence" });
    expect(result.model).toBeUndefined();
  });

  it("retains trajectory, checkpoint, and result custody without registering or activating a policy, and quarantines corrupt result bytes", async () => {
    const backend = createMemoryGhostVaultBackend(), governed = dataset();
    const receipt = extractTearOfflineRlTrajectories(governed, createTearOfflineRlPlan(governed, request));
    const checkpoint = advanceTearOfflineRlCheckpoint(createTearOfflineRlCheckpoint(receipt, trainingConfig), receipt, trainingConfig, 2);
    const result = completeTearOfflineRlCheckpoint(checkpoint, receipt, trainingConfig);
    const trajectories = new TearOfflineRlTrajectoryVault(backend), checkpoints = new TearOfflineRlCheckpointVault(backend), training = new TearOfflineRlTrainingVault(backend);
    expect(await trajectories.persist(receipt)).toEqual(receipt);
    expect(await trajectories.persist(receipt)).toEqual(receipt);
    expect(await checkpoints.persist(checkpoint)).toEqual(checkpoint);
    expect(await training.persist(result)).toEqual(result);
    expect(await training.get(result.trainingHash)).toEqual(result);
    expect((await backend.keys("analysis")).some((key) => key.startsWith("policy-artifact:v1:") || key === "policy-active:v1")).toBe(false);
    await backend.put("analysis", `offline-rl-training:v1:${result.trainingHash}`, "not-json");
    expect(await training.get(result.trainingHash)).toBeUndefined();
    expect((await backend.keys("quarantine")).some((key) => key.endsWith(result.trainingHash))).toBe(true);
  });
});

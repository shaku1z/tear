import { describe, expect, it } from "vitest";

import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  advanceTearOfflineRlV3Checkpoint,
  advanceTearOnlineRlV3Checkpoint,
  completeTearOfflineRlV3Checkpoint,
  createTearOfflineRlV3Checkpoint,
  createTearOfflineRlV3Plan,
  createTearOfflineRlPlan,
  createTearOnlineRlV3Checkpoint,
  createTearOnlineRlV3Plan,
  evaluateTearOnlineRlV3InSource,
  extractTearOfflineRlTrajectories,
  parseTearOnlineRlV3Checkpoint,
  TearOnlineRlV3CheckpointVault,
  TearOnlineRlV3EvaluationVault,
  type TearAcademyTrainingDatasetV1,
} from "../../src/agents";

const scenario = Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const, id: "c34-v3-online", version: 1, description: "C34 V3 online source fixture", stateClass: "recorded-canonical" as const, executionClass: "training" as const, seed: "c34-v3-online", start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 4, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c34"] as const) });

function setup() {
  const states = [0, 1].map((tick) => Object.freeze({ tick, input: {} as never, run: Object.freeze({ mode: "endless", wave: 1, score: tick, time: tick, seed: 7 }), player: Object.freeze({ x: 0, y: 0, vx: 0, vy: 0, hp: 100 }), blade: Object.freeze({ state: "held", x: 0, y: 0, vx: 0, vy: 0 }), enemies: Object.freeze([]) }));
  const data = Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1, manifest: Object.freeze({ id: "c34-v3-online", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }), sequences: Object.freeze([Object.freeze({ candidateHash: "c".repeat(16), split: "training" as const, lessonId: "movement-foundations", segmentKind: "demonstration", tags: Object.freeze([]), sourceScenario: scenario, tracks: Object.freeze({ observations: Object.freeze(states), actions: Object.freeze([Object.freeze({ kind: "command" as const, id: 1, tick: 1, command: Object.freeze({ type: "move" as const, x: 1_000, y: 0 }) })]), nativeEvents: Object.freeze([]), rewardComponents: Object.freeze(states.map((entry) => Object.freeze({ tick: entry.tick, value: null }))), intents: Object.freeze([]), terminal: Object.freeze({ tick: 1, semanticHash: stableVerificationHash(states[1]), terminated: true, truncated: false }) }) as never, sequenceHash: "d".repeat(16) })]), observationCount: 2, actionCount: 1, datasetHash: "e".repeat(16) }) satisfies TearAcademyTrainingDatasetV1;
  const reward = createTearOfflineRlPlan(data, { id: "c34-v3-online", version: 1, seed: 7, reward: { components: [{ id: "score", source: "score.delta", weight: 1, maximumSourceValue: 10, perTransitionCap: 10 }], totalMinimum: -10, totalMaximum: 10 }, limits: { maxTransitions: 4, maxEventsPerTransition: 4, maxRewardViolations: 0 } });
  const receipt = extractTearOfflineRlTrajectories(data, reward);
  const offline = createTearOfflineRlV3Plan(receipt, { id: "c34-v3-online", version: 1, actionVocabulary: [{ type: "move", x: 1_000, y: 0 }], config: { epochs: 1, learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 100, maxMeanAbsoluteTdError: 100, maxConsecutiveDivergentEpochs: 2 } });
  const offlineResult = completeTearOfflineRlV3Checkpoint(offline, receipt, advanceTearOfflineRlV3Checkpoint(offline, receipt, createTearOfflineRlV3Checkpoint(offline, receipt), 1));
  const online = createTearOnlineRlV3Plan(offline, offlineResult, reward, { id: "c34-v3-online", scenarios: [scenario], config: { learningRate: 0.5, gamma: 0.9, maxTicks: 4, maxUpdates: 10, maxAbsoluteQ: 100 } });
  return { reward, receipt, offline, offlineResult, online };
}

describe("C34 V3 online source-world training", () => {
  it("updates in fresh C30 worlds and exact source-checkpoint resume equals one shot", () => {
    const { reward, offline, offlineResult, online } = setup(), initial = createTearOnlineRlV3Checkpoint(online, offlineResult);
    const oneShot = advanceTearOnlineRlV3Checkpoint(online, offline, offlineResult, reward, initial);
    const paused = advanceTearOnlineRlV3Checkpoint(online, offline, offlineResult, reward, initial, { maxTicks: 1 });
    const resumed = advanceTearOnlineRlV3Checkpoint(online, offline, offlineResult, reward, paused);
    expect(paused).toMatchObject({ status: "running", ticks: 1, updates: 1 });
    expect(paused.resume).toBeDefined();
    expect(resumed).toEqual(oneShot);
    expect(oneShot).toMatchObject({ status: "complete", cursor: 1, ticks: 4, updates: 4 });
  });

  it("retains cancellation, timeout, update-budget divergence, and source evaluation without a promotion path", () => {
    const { reward, offline, offlineResult, online } = setup(), initial = createTearOnlineRlV3Checkpoint(online, offlineResult);
    const cancelled = advanceTearOnlineRlV3Checkpoint(online, offline, offlineResult, reward, initial, { cancelled: () => true });
    let clock = 0;
    const timedOut = advanceTearOnlineRlV3Checkpoint(online, offline, offlineResult, reward, initial, { now: () => ++clock, timeoutMilliseconds: 1 });
    const bounded = createTearOnlineRlV3Plan(offline, offlineResult, reward, { id: "c34-v3-online-bound", scenarios: [scenario], config: { ...online.config, maxUpdates: 1 } });
    const stopped = advanceTearOnlineRlV3Checkpoint(bounded, offline, offlineResult, reward, createTearOnlineRlV3Checkpoint(bounded, offlineResult));
    expect(cancelled.status).toBe("cancelled");
    expect(timedOut.status).toBe("timed-out");
    expect(stopped.status).toBe("stopped-divergence");
    const complete = advanceTearOnlineRlV3Checkpoint(online, offline, offlineResult, reward, initial);
    const evaluation = evaluateTearOnlineRlV3InSource(online, offline, offlineResult, reward, complete);
    expect(evaluation).toMatchObject({ promotional: false, traces: [{ side: "baseline" }, { side: "challenger" }] });
  });

  it("validates V3 custody, quarantines corrupt bytes, and refuses tampered resume provenance", async () => {
    const { reward, offline, offlineResult, online } = setup(), backend = createMemoryGhostVaultBackend(), initial = createTearOnlineRlV3Checkpoint(online, offlineResult);
    const paused = advanceTearOnlineRlV3Checkpoint(online, offline, offlineResult, reward, initial, { maxTicks: 1 });
    const checkpoints = new TearOnlineRlV3CheckpointVault(backend), evaluations = new TearOnlineRlV3EvaluationVault(backend);
    expect(await checkpoints.persist(paused)).toEqual(paused);
    expect(await checkpoints.get(paused.checkpointHash)).toEqual(paused);
    const complete = advanceTearOnlineRlV3Checkpoint(online, offline, offlineResult, reward, paused), evaluation = evaluateTearOnlineRlV3InSource(online, offline, offlineResult, reward, complete);
    expect(await evaluations.persist(evaluation)).toEqual(evaluation);
    expect(await evaluations.get(evaluation.resultHash)).toEqual(evaluation);
    const badResume = structuredClone(paused); if (badResume.resume === undefined) throw new Error("missing fixture resume"); (badResume.resume as { cursor: number }).cursor = 1;
    expect(() => parseTearOnlineRlV3Checkpoint(badResume)).toThrow(/integrity|invalid/u);
    await backend.put("analysis", `online-rl-v3-evaluation:v1:${evaluation.resultHash}`, "corrupt");
    expect(await evaluations.get(evaluation.resultHash)).toBeUndefined();
    expect((await backend.keys("quarantine")).some((key) => key.endsWith(evaluation.resultHash))).toBe(true);
    expect((await backend.keys("analysis")).some((key) => key.startsWith("policy-") || key.startsWith("artifact-"))).toBe(false);
  });
});

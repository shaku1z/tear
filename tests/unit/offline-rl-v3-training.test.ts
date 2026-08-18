import { describe, expect, it } from "vitest";

import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  advanceTearOfflineRlV3Checkpoint,
  completeTearOfflineRlV3Checkpoint,
  createTearOfflineRlV3Checkpoint,
  createTearOfflineRlV3Plan,
  createTearOfflineRlPlan,
  extractTearOfflineRlTrajectories,
  parseTearOfflineRlV3Checkpoint,
  parseTearOfflineRlV3Plan,
  requireTearC34C32AdapterEligibleTrainingResult,
  selectTearC34C32RuntimeAction,
  TearOfflineRlV3CheckpointVault,
  TearOfflineRlV3TrainingVault,
  type TearAcademyTrainingDatasetV1,
} from "../../src/agents";
import type { CanonicalGameplayState } from "../../src/gameplay/runtime/canonical-state";

function state(tick: number, score: number): CanonicalGameplayState {
  return Object.freeze({ tick, input: {} as never, run: Object.freeze({ mode: "endless", wave: 1, score, time: tick, seed: 7 }),
    player: Object.freeze({ x: 0, y: 0, vx: 0, vy: 0, hp: 100_000 }), blade: Object.freeze({ state: "held", x: 0, y: 0, vx: 0, vy: 0 }), enemies: Object.freeze([]) });
}

function input() {
  const states = Object.freeze([state(0, 0), state(1, 5)]), scenario = Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const,
    id: "c34-v3", version: 1, description: "C34 V3 source fixture", stateClass: "recorded-canonical" as const, executionClass: "training" as const, seed: "c34-v3",
    start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 3, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c34"] as const) });
  const data = Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1, manifest: Object.freeze({ id: "c34-v3", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }),
    sequences: Object.freeze([Object.freeze({ candidateHash: "c".repeat(16), split: "training" as const, lessonId: "movement", segmentKind: "demonstration", tags: Object.freeze([]), sourceScenario: scenario,
      tracks: Object.freeze({ observations: states, actions: Object.freeze([Object.freeze({ kind: "command" as const, id: 1, tick: 1, command: Object.freeze({ type: "move" as const, x: 1_000, y: 0 }) })]), nativeEvents: Object.freeze([]),
        rewardComponents: Object.freeze(states.map((entry) => Object.freeze({ tick: entry.tick, value: null }))), intents: Object.freeze([]), terminal: Object.freeze({ tick: 1, semanticHash: stableVerificationHash(states[1]), terminated: true, truncated: false }) }) as never, sequenceHash: "d".repeat(16) })]), observationCount: 2, actionCount: 1, datasetHash: "e".repeat(16) }) satisfies TearAcademyTrainingDatasetV1;
  const offline = createTearOfflineRlPlan(data, { id: "c34-v3", version: 1, seed: 7, reward: { components: [{ id: "score", source: "score.delta", weight: 1, maximumSourceValue: 10, perTransitionCap: 10 }], totalMinimum: -10, totalMaximum: 10 }, limits: { maxTransitions: 4, maxEventsPerTransition: 4, maxRewardViolations: 0 } });
  const receipt = extractTearOfflineRlTrajectories(data, offline);
  const plan = createTearOfflineRlV3Plan(receipt, { id: "c34-v3-runtime", version: 1, actionVocabulary: [{ type: "move", x: 1_000, y: 0 }], config: { epochs: 2, learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 4, maxAbsoluteQ: 100, maxMeanAbsoluteTdError: 100, maxConsecutiveDivergentEpochs: 2 } });
  return { receipt, plan, first: state(0, 0) };
}

describe("C34 V3 canonical runtime-compatible offline training", () => {
  it("is deterministic across resume and emits the explicit C34/C32 model envelope", () => {
    const { receipt, plan, first } = input(), initial = createTearOfflineRlV3Checkpoint(plan, receipt);
    const oneShot = completeTearOfflineRlV3Checkpoint(plan, receipt, advanceTearOfflineRlV3Checkpoint(plan, receipt, initial, 2));
    const resumed = completeTearOfflineRlV3Checkpoint(plan, receipt, advanceTearOfflineRlV3Checkpoint(plan, receipt, advanceTearOfflineRlV3Checkpoint(plan, receipt, initial, 1), 1));
    expect(resumed).toEqual(oneShot);
    expect(oneShot).toMatchObject({ disposition: "complete", model: { format: "tear-c34-c32-tabular-q-model" } });
    expect(oneShot.model?.entries.some((entry) => entry.value !== 0)).toBe(true);
    if (oneShot.model === undefined) throw new Error("completed V3 result omitted its model");
    expect(selectTearC34C32RuntimeAction(oneShot.model, first, plan.actionVocabulary, ["move"])?.source).toBe("q");
  });

  it("refuses V2 fallback, altered plans/checkpoints, and divergence before a compatible model exists", () => {
    const { receipt, plan } = input(), initial = createTearOfflineRlV3Checkpoint(plan, receipt);
    expect(() => requireTearC34C32AdapterEligibleTrainingResult({} as never)).toThrow(/V3-compatible/u);
    const altered = { ...structuredClone(plan), actionVocabulary: [...plan.actionVocabulary, { type: "jump", phase: "pressed" }] };
    expect(() => parseTearOfflineRlV3Plan(altered)).toThrow(/integrity/u);
    const corrupt = { ...structuredClone(initial), qValues: initial.qValues.map((entry, index) => index === 0 ? { ...entry, value: 1 } : entry) };
    expect(() => parseTearOfflineRlV3Checkpoint(corrupt)).toThrow(/integrity/u);
    const divergentPlan = createTearOfflineRlV3Plan(receipt, { id: "c34-v3-divergent", version: 1, actionVocabulary: plan.actionVocabulary, config: { ...plan.config, maxAbsoluteQ: 0.01 } });
    const stopped = advanceTearOfflineRlV3Checkpoint(divergentPlan, receipt, createTearOfflineRlV3Checkpoint(divergentPlan, receipt), 2);
    const stoppedResult = completeTearOfflineRlV3Checkpoint(divergentPlan, receipt, stopped);
    expect(stoppedResult.disposition).toBe("stopped-divergence"); expect(stoppedResult.model).toBeUndefined();
  });

  it("keeps V3 custody separate and quarantines corrupt bytes", async () => {
    const { receipt, plan } = input(), backend = createMemoryGhostVaultBackend();
    const checkpoint = advanceTearOfflineRlV3Checkpoint(plan, receipt, createTearOfflineRlV3Checkpoint(plan, receipt), 2), result = completeTearOfflineRlV3Checkpoint(plan, receipt, checkpoint);
    const checkpoints = new TearOfflineRlV3CheckpointVault(backend), results = new TearOfflineRlV3TrainingVault(backend);
    expect(await checkpoints.persist(checkpoint)).toEqual(checkpoint); expect(await results.persist(result)).toEqual(result); expect(await results.get(result.trainingHash)).toEqual(result);
    expect((await backend.keys("analysis")).some((key) => key.startsWith("offline-rl-training:v1:") || key.startsWith("policy-"))).toBe(false);
    await backend.put("analysis", `offline-rl-v3-training:v1:${result.trainingHash}`, "corrupt");
    expect(await results.get(result.trainingHash)).toBeUndefined(); expect((await backend.keys("quarantine")).some((key) => key.endsWith(result.trainingHash))).toBe(true);
  });
});

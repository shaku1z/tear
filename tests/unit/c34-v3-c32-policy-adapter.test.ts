import { describe, expect, it } from "vitest";

import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import { createProductionHeadlessEnvironment } from "../../src/tearbench";
import {
  advanceTearOfflineRlV3Checkpoint, advanceTearOnlineRlV3Checkpoint, completeTearOfflineRlV3Checkpoint,
  createTearC32CanonicalSourceObservation, createTearC34V3C32PolicyCandidate, createTearOfflineRlV3Checkpoint,
  createTearOfflineRlV3Plan, createTearOfflineRlPlan, createTearOnlineRlV3Checkpoint, createTearOnlineRlV3Plan,
  evaluateTearOnlineRlV3InSource, parseTearC34V3C32PolicyCandidate, TearC34V3C32PolicyRuntime,
  TearC34V3C32CandidateRegistry, TearC32CanonicalActivePolicyRuntime, TearPolicyArtifactRegistry, TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY, extractTearOfflineRlTrajectories,
  type TearAcademyTrainingDatasetV1,
} from "../../src/agents";

const scenario = Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const, id: "c34-v3-c32-adapter", version: 1, description: "C34 V3 C32 canonical adapter fixture", stateClass: "recorded-canonical" as const, executionClass: "training" as const, seed: "c34-v3-c32-adapter", start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 4, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c34", "c32"] as const) });

function fixture() {
  const states = [0, 1].map((tick) => Object.freeze({ tick, input: {} as never, run: Object.freeze({ mode: "endless", wave: 1, score: tick, time: tick, seed: 7 }), player: Object.freeze({ x: 0, y: 0, vx: 0, vy: 0, hp: 100 }), blade: Object.freeze({ state: "held", x: 0, y: 0, vx: 0, vy: 0 }), enemies: Object.freeze([]) }));
  const data = Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1, manifest: Object.freeze({ id: "c34-v3-c32-adapter", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }), sequences: Object.freeze([Object.freeze({ candidateHash: "c".repeat(16), split: "training" as const, lessonId: "movement", segmentKind: "demonstration", tags: Object.freeze([]), sourceScenario: scenario, tracks: Object.freeze({ observations: Object.freeze(states), actions: Object.freeze([Object.freeze({ kind: "command" as const, id: 1, tick: 1, command: Object.freeze({ type: "move" as const, x: 1_000, y: 0 }) })]), nativeEvents: Object.freeze([]), rewardComponents: Object.freeze(states.map((entry) => Object.freeze({ tick: entry.tick, value: null }))), intents: Object.freeze([]), terminal: Object.freeze({ tick: 1, semanticHash: stableVerificationHash(states[1]), terminated: true, truncated: false }) }) as never, sequenceHash: "d".repeat(16) })]), observationCount: 2, actionCount: 1, datasetHash: "e".repeat(16) }) satisfies TearAcademyTrainingDatasetV1;
  const reward = createTearOfflineRlPlan(data, { id: "c34-v3-c32-adapter", version: 1, seed: 7, reward: { components: [{ id: "score", source: "score.delta", weight: 1, maximumSourceValue: 10, perTransitionCap: 10 }], totalMinimum: -10, totalMaximum: 10 }, limits: { maxTransitions: 4, maxEventsPerTransition: 4, maxRewardViolations: 0 } });
  const receipt = extractTearOfflineRlTrajectories(data, reward), offline = createTearOfflineRlV3Plan(receipt, { id: "offline", version: 1, actionVocabulary: [{ type: "move", x: 1_000, y: 0 }], config: { epochs: 1, learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 100, maxMeanAbsoluteTdError: 100, maxConsecutiveDivergentEpochs: 2 } });
  const training = completeTearOfflineRlV3Checkpoint(offline, receipt, advanceTearOfflineRlV3Checkpoint(offline, receipt, createTearOfflineRlV3Checkpoint(offline, receipt), 1)), online = createTearOnlineRlV3Plan(offline, training, reward, { id: "online", scenarios: [scenario], config: { learningRate: 0.5, gamma: 0.9, maxTicks: 4, maxUpdates: 10, maxAbsoluteQ: 100 } });
  const checkpoint = advanceTearOnlineRlV3Checkpoint(online, offline, training, reward, createTearOnlineRlV3Checkpoint(online, training)), evaluation = evaluateTearOnlineRlV3InSource(online, offline, training, reward, checkpoint);
  const candidate = createTearC34V3C32PolicyCandidate(offline, training, online, checkpoint, evaluation, { id: "v3-candidate", createdAt: "2026-08-08T00:00:00.000Z", encoder: { id: "tear-c34-c32-canonical-source-state.v1", schemaVersion: 1, observationClass: "structured-state", normalizationHash: "1".repeat(16) }, actionSchema: "tear-game-action-command-envelope.v1", recurrentState: { kind: "none", schemaVersion: 1 }, trainingManifest: { id: "c31-manifest", version: 1, rootHash: "2".repeat(16) }, rewardVersion: "c34-v3", build: { version: "test", revision: "c34", target: "unit", rulesetVersion: "r", contentHash: "c", configHash: "g" }, metrics: { pairedPassed: 1 }, levelTarget: "class-a", lineage: { trainingRunId: training.trainingHash }, signature: { kind: "local-unsigned", keyId: "development" } });
  return { offline, training, online, checkpoint, evaluation, candidate };
}

describe("C34 V3 to C32 canonical policy candidate", () => {
  it("executes one inactive evaluated candidate against an exact real C30/C32 source observation", async () => {
    const { candidate } = fixture(), backend = createMemoryGhostVaultBackend(), registry = new TearC34V3C32CandidateRegistry(backend);
    await registry.register(candidate.artifact);
    expect(await registry.get(candidate.artifact.id)).toEqual(candidate.artifact);
    const environment = createProductionHeadlessEnvironment();
    try {
      const state = environment.reset(scenario), source = createTearC32CanonicalSourceObservation(state, ["move"]), runtime = new TearC34V3C32PolicyRuntime(candidate.artifact, () => [{ type: "jump", phase: "pressed" }]);
      expect(runtime.decide(source)).toMatchObject({ source: "artifact", actions: [{ type: "move", x: 1_000, y: 0 }] });
      expect(environment.step(runtime.decide(source).actions).observation.tick).toBe(1);
    } finally { environment.dispose(); }
    expect((await backend.keys("analysis")).some((key) => key === "policy-active:v1")).toBe(false);
  });

  it("masks unavailable model actions and uses fallback only for absent or unavailable candidates", () => {
    const { candidate } = fixture(), environment = createProductionHeadlessEnvironment();
    try {
      const state = environment.reset(scenario), unavailable = createTearC32CanonicalSourceObservation(state, []);
      expect(new TearC34V3C32PolicyRuntime(candidate.artifact, () => [{ type: "move", x: -1_000, y: 0 }]).decide(unavailable)).toMatchObject({ source: "scripted-fallback", reason: "no-legal-action" });
      expect(new TearC34V3C32PolicyRuntime(undefined, () => [{ type: "move", x: -1_000, y: 0 }]).decide(createTearC32CanonicalSourceObservation(state, ["move"]))).toMatchObject({ source: "scripted-fallback", reason: "no-candidate" });
    } finally { environment.dispose(); }
  });

  it("refuses legacy, tampered, and unevaluated provenance instead of falling back", () => {
    const { offline, training, online, checkpoint, evaluation, candidate } = fixture();
    expect(() => createTearC34V3C32PolicyCandidate(offline, training, online, checkpoint, { ...evaluation, metrics: { ...evaluation.metrics, passed: false } }, { ...candidate.artifact, id: "rejected" })).toThrow(/integrity|passed/u);
    const altered = { ...candidate.artifact, model: { ...candidate.artifact.model, payload: "{}" } };
    expect(() => parseTearC34V3C32PolicyCandidate(altered)).toThrow(/invalid|integrity/u);
    expect(() => new TearC34V3C32PolicyRuntime(altered, () => [])).toThrow();
  });

  it("quarantines corrupt registered candidate bytes without touching an active pointer", async () => {
    const { candidate } = fixture(), backend = createMemoryGhostVaultBackend(), registry = new TearC34V3C32CandidateRegistry(backend);
    await registry.register(candidate.artifact);
    await backend.put("analysis", `policy-artifact:v1:${candidate.artifact.id}`, "corrupt");
    expect(await registry.get(candidate.artifact.id)).toBeUndefined();
    expect((await backend.keys("quarantine")).some((key) => key === `policy-artifact:v1:${candidate.artifact.id}`)).toBe(true);
    expect(await backend.get("analysis", "policy-active:v1")).toBeUndefined();
  });

  it("executes an active exact V3 envelope against a real C30 canonical state", async () => {
    const { candidate } = fixture(), backend = createMemoryGhostVaultBackend(), candidates = new TearC34V3C32CandidateRegistry(backend); await candidates.register(candidate.artifact);
    const registry = new TearPolicyArtifactRegistry(backend, TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY); await registry.activate(candidate.artifact.id, "2026-08-08T00:01:00.000Z");
    const runtime = new TearC32CanonicalActivePolicyRuntime(backend, () => [{ type: "jump", phase: "pressed" }]); await runtime.reset(); const environment = createProductionHeadlessEnvironment();
    try { const state = environment.reset(scenario), decision = runtime.decide(state, ["move"]); expect(decision).toMatchObject({ source: "artifact", artifactId: candidate.artifact.id, actions: [{ type: "move", x: 1_000, y: 0 }] }); expect(environment.step(decision.actions).observation.tick).toBe(1); } finally { environment.dispose(); }
  });
});

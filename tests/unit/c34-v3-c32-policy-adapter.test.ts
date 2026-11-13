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
import { tearReturnAdapter, type TearReturnVariant } from "../../src/agents/c34-source-feature-state";
import { createTearC34C32RuntimeModel } from "../../src/agents/c34-c32-runtime-compatibility";
import { createTearPolicyArtifact } from "../../src/agents/policy-artifact-registry";
import { TEAR_C34_CANONICAL_POLICY_RUNTIME_COMPATIBILITY } from "../../src/agents/c34-v3-c32-policy-adapter";
import { createTrainingOperationsV3ChampionEvaluationPlan, evaluateTrainingOperationsV3ChampionInSource } from "../../src/agents/training-operations-v3-champion-evaluation";
import { parseTrainingOperationsV3ChampionEvaluationResult } from "../../src/agents/training-operations-v3-comparison-result";
import { createTearFoundryJobV2 } from "../../src/agents/foundry-job-state";
import { TearPolicyDecisionJournal } from "../../src/agents/policy-decision-journal";

const scenario = Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const, id: "c34-v3-c32-adapter", version: 1, description: "C34 V3 C32 canonical adapter fixture", stateClass: "recorded-canonical" as const, executionClass: "training" as const, seed: "c34-v3-c32-adapter", start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 4, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c34", "c32"] as const) });

function fixture(variant?: TearReturnVariant) {
  const states = [0, 1].map((tick) => Object.freeze({ tick, input: variant === undefined ? {} as never : { tick, moveX: 0, moveY: 0, aimTurn: 0, primaryHeld: false }, run: Object.freeze({ mode: "endless", wave: 1, score: tick, time: tick, seed: 7 }), player: Object.freeze({ x: 0, y: 0, vx: 0, vy: 0, hp: 100 }), blade: Object.freeze({ state: "held", x: 0, y: 0, vx: 0, vy: 0 }), enemies: Object.freeze([]) }));
  const data = Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1, manifest: Object.freeze({ id: "c34-v3-c32-adapter", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }), sequences: Object.freeze([Object.freeze({ candidateHash: "c".repeat(16), split: "training" as const, lessonId: "movement", segmentKind: "demonstration", tags: Object.freeze([]), sourceScenario: scenario, tracks: Object.freeze({ observations: Object.freeze(states), actions: Object.freeze([Object.freeze({ kind: "command" as const, id: 1, tick: 1, command: Object.freeze({ type: "move" as const, x: 1_000, y: 0 }) })]), nativeEvents: Object.freeze([]), rewardComponents: Object.freeze(states.map((entry) => Object.freeze({ tick: entry.tick, value: null }))), intents: Object.freeze([]), terminal: Object.freeze({ tick: 1, semanticHash: stableVerificationHash(states[1]), terminated: true, truncated: false }) }) as never, sequenceHash: "d".repeat(16) })]), observationCount: 2, actionCount: 1, datasetHash: "e".repeat(16) }) satisfies TearAcademyTrainingDatasetV1;
  const reward = createTearOfflineRlPlan(data, { id: "c34-v3-c32-adapter", version: 1, seed: 7, reward: { ...(variant === undefined ? {} : { schemaVersion: 2 as const }), components: [{ id: "score", source: "score.delta", weight: 1, maximumSourceValue: 10, perTransitionCap: 10 }], totalMinimum: -10, totalMaximum: 10 }, limits: { maxTransitions: 4, maxEventsPerTransition: 4, maxRewardViolations: 0 } });
  const receipt = extractTearOfflineRlTrajectories(data, reward), offline = createTearOfflineRlV3Plan(receipt, { id: "offline", version: 1, ...(variant === undefined ? {} : { variant }), actionVocabulary: [{ type: "move", x: 1_000, y: 0 }], config: { epochs: 1, learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 100, maxMeanAbsoluteTdError: 100, maxConsecutiveDivergentEpochs: 2 } });
  const training = completeTearOfflineRlV3Checkpoint(offline, receipt, advanceTearOfflineRlV3Checkpoint(offline, receipt, createTearOfflineRlV3Checkpoint(offline, receipt), 1)), online = createTearOnlineRlV3Plan(offline, training, reward, { id: "online", scenarios: [scenario], config: { learningRate: 0.5, gamma: 0.9, maxTicks: 4, maxUpdates: 10, maxAbsoluteQ: 100 } });
  const checkpoint = advanceTearOnlineRlV3Checkpoint(online, offline, training, reward, createTearOnlineRlV3Checkpoint(online, training)), evaluation = evaluateTearOnlineRlV3InSource(online, offline, training, reward, checkpoint);
  const candidate = createTearC34V3C32PolicyCandidate(offline, training, online, checkpoint, evaluation, { id: variant ?? "v3-candidate", createdAt: "2026-08-08T00:00:00.000Z", encoder: { id: variant === undefined ? "tear-c34-c32-canonical-source-state.v1" : tearReturnAdapter(variant).id, schemaVersion: variant === undefined ? 1 : 2, observationClass: "structured-state", normalizationHash: variant === undefined ? "1".repeat(16) : tearReturnAdapter(variant).adapterHash }, actionSchema: "tear-game-action-command-envelope.v1", recurrentState: { kind: "none", schemaVersion: 1 }, trainingManifest: { id: "c31-manifest", version: 1, rootHash: "2".repeat(16) }, rewardVersion: variant === undefined ? "c34-v3" : reward.reward.rewardHash, build: { version: "test", revision: "c34", target: "unit", rulesetVersion: "r", contentHash: "c", configHash: "g" }, metrics: { pairedPassed: 1 }, levelTarget: "class-a", lineage: { trainingRunId: training.trainingHash }, signature: { kind: "local-unsigned", keyId: "development" } });
  return { offline, training, online, checkpoint, evaluation, candidate, reward };
}

describe("C34 V3 to C32 canonical policy candidate", () => {
  it("binds additive V3 selection protocol identities without reinterpreting V2 candidates", () => {
    // Constructed four-tick source-owner/lineage controls, not a governed experiment.
    for (const [v2, v3] of [["return-exact.v2", "return-exact.v3"], ["return-features.v2", "return-features.v3"]] as const) {
      const old = fixture(v2).candidate, current = fixture(v3).candidate;
      const prior = parseTearC34V3C32PolicyCandidate(old.artifact), next = parseTearC34V3C32PolicyCandidate(current.artifact);
      expect(prior.protocolHash).toBe(stableVerificationHash({ id: "tear-c34-v3-return-candidate.v2", adapter: tearReturnAdapter(v2), decisions: "empty-or-one", runtimeBudget: 8 }));
      expect(next.protocolHash).toBe(stableVerificationHash({ id: "tear-c34-v3-return-candidate.v3", adapter: tearReturnAdapter(v3), decisions: "empty-or-one", runtimeBudget: 8 }));
      expect(next.sourceStateAdapter).toEqual(tearReturnAdapter(v3));
      expect(next.schemaVersion).toBe(2); // Same wire shape; adapter/protocol own changed selection semantics.
      const repackage = (body: unknown) => createTearPolicyArtifact({ ...current.artifact, model: { format: current.artifact.model.format, payload: JSON.stringify(body) } });
      expect(() => parseTearC34V3C32PolicyCandidate(repackage({ ...next, protocolHash: prior.protocolHash }))).toThrow(/mixed/);
      expect(() => parseTearC34V3C32PolicyCandidate(repackage({ ...next, model: createTearC34C32RuntimeModel(next.model.entries, v2) }))).toThrow(/adapter mismatch/);
      expect(() => parseTearC34V3C32PolicyCandidate(createTearPolicyArtifact({ ...current.artifact, encoder: old.artifact.encoder }))).toThrow(/encoder identity/);
    }
  });

  it("carries version2 defaults and native return evidence through the existing source champion/comparison owner", () => {
    // Constructed four-tick protocol fixture, not unseen-seed or learned quality evidence.
    const champion = fixture("return-exact.v2"), challenger = fixture("return-features.v2"), cases = [scenario];
    const job = createTearFoundryJobV2({ id: "return-comparison", createdAt: "2026-08-08T00:00:00.000Z", reason: "constructed owner regression",
      inputs: { champion: { id: champion.candidate.artifact.id, artifactHash: champion.candidate.artifact.artifactHash }, corpusRecordHashes: ["a".repeat(16)],
        evaluationPlanHash: stableVerificationHash(cases), rewardDefinitionHash: challenger.reward.reward.rewardHash,
        invariantSetHash: "1".repeat(16), budgetHash: "2".repeat(16), stopConditionsHash: "3".repeat(16),
        evaluationProtocol: { version: 1, id: "return-comparison", thresholds: { minimumRewardGain: 0, requireCompletionRateNotLower: true, maxTicksPerCase: 4, maxAbsoluteRewardPerCase: 100 } } } });
    const plan = createTrainingOperationsV3ChampionEvaluationPlan(job, cases, challenger.reward, champion.candidate.artifact, challenger.candidate.artifact);
    const result = evaluateTrainingOperationsV3ChampionInSource(plan, job, challenger.reward, champion.candidate.artifact, challenger.candidate.artifact);
    expect(result.traces.every(trace => trace.returnEvidence !== undefined && trace.returnEvidence.entryDecisions + trace.returnEvidence.defaultDecisions === 4 && trace.returnEvidence.nativeReturns.matchedCatches === 0)).toBe(true);
    expect(parseTrainingOperationsV3ChampionEvaluationResult(result, plan, job, challenger.reward, champion.candidate.artifact, challenger.candidate.artifact)).toEqual(result);
    const { resultHash: oldHash, ...draft } = structuredClone(result); void oldHash;
    const first = draft.traces[0]?.returnEvidence;
    if (first === undefined) throw new Error("return owner omitted evidence");
    Object.assign(first, { entryDecisions: first.entryDecisions + 1 });
    expect(() => parseTrainingOperationsV3ChampionEvaluationResult({ ...draft, resultHash: stableVerificationHash(draft) }, plan, job, challenger.reward, champion.candidate.artifact, challenger.candidate.artifact)).toThrow(/support counts/);
  });

  it("retains explicit return defaults and budget fallback through admitted C32 while refusing mixed encoders", async () => {
    const { candidate } = fixture("return-exact.v2"), backend = createMemoryGhostVaultBackend();
    const candidates = new TearC34V3C32CandidateRegistry(backend); await candidates.register(candidate.artifact);
    const registry = new TearPolicyArtifactRegistry(backend, TEAR_C34_CANONICAL_POLICY_RUNTIME_COMPATIBILITY);
    await registry.activate(candidate.artifact.id, "2026-08-08T00:01:00.000Z");
    const fallback = () => [{ type: "move", x: -1000, y: 0 }] as const;
    const runtime = new TearC32CanonicalActivePolicyRuntime(backend, fallback, false, { now: () => 0 }); await runtime.reset();
    const environment = createProductionHeadlessEnvironment();
    try {
      const state = environment.reset({ ...scenario, seed: "return-missing-exact-key-fixture" });
      const decision = runtime.decide(state, ["move", "aim", "weapon"]);
      expect(decision).toMatchObject({ source: "model-default", support: { entryPresent: false }, artifactId: candidate.artifact.id });
      const journal = new TearPolicyDecisionJournal(backend); journal.begin("return-support");
      const trace = { tick: state.tick, profile: "survival", objective: "survive", maneuver: "track", confidence: 0, recovery: false,
        observationClass: "structured-state", critic: [] } as const;
      const receipt = { ...decision, observationHash: decision.stateHash };
      journal.append({ tick: state.tick, receipt, actions: decision.actions, trace });
      expect(() => { journal.append({ tick: state.tick, receipt: { ...receipt, support: { entryPresent: true, value: 0, stateKey: "a".repeat(16), semanticActionHash: "b".repeat(16) } }, actions: decision.actions, trace }); }).toThrow(/support/);
      await journal.flush();
      expect((await journal.read("return-support"))?.entries[0]?.receipt).toMatchObject({ source: "model-default", support: { entryPresent: false } });
      let clock = 0;
      const delayed = new TearC32CanonicalActivePolicyRuntime(backend, fallback, false, { now: () => { clock += 9; return clock; } }); await delayed.reset();
      expect(delayed.decide(state, ["move", "aim", "weapon"])).toMatchObject({ source: "scripted-fallback", reason: "decision-budget-exceeded", decisionMilliseconds: 9, actions: fallback() });
      const body = JSON.parse(candidate.artifact.model.payload) as Record<string, unknown>;
      body.model = createTearC34C32RuntimeModel([], "return-features.v2");
      const mixed = createTearPolicyArtifact({ ...candidate.artifact, id: "mixed-return", model: { format: candidate.artifact.model.format, payload: JSON.stringify(body) } });
      expect(() => parseTearC34V3C32PolicyCandidate(mixed)).toThrow(/adapter mismatch/);
    } finally { environment.dispose(); }
  });

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

import { describe, expect, it } from "vitest";

import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  advanceTearOfflineRlV3Checkpoint, advanceTearOnlineRlV3Checkpoint, completeTearOfflineRlV3Checkpoint,
  createTearBotV3CanonicalEvaluationPlan, createTearC34V3C32PolicyCandidate, createTearOfflineRlPlan,
  createTearOfflineRlV3Checkpoint, createTearOfflineRlV3Plan, createTearOnlineRlV3Checkpoint, createTearOnlineRlV3Plan,
  evaluateTearOnlineRlV3InSource, extractTearOfflineRlTrajectories, TearBotV3CanonicalEvaluationExecutor, TearBotV3CanonicalEvidenceVault,
  TearC34V3C32CandidateRegistry, TearPolicyArtifactRegistry, TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY,
  type TearAcademyTrainingDatasetV1,
} from "../../src/agents";
import { LiveBotEvidenceController } from "../../src/app/live-bot-evidence-controller";
import type { TearScenarioV1 } from "../../src/tearbench";

const scenario: TearScenarioV1 = Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const, id: "c35-v3-canonical", version: 1, description: "C35 C32 canonical source-world fixture", stateClass: "recorded-canonical" as const, executionClass: "training" as const, seed: "c35-v3-canonical", start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 3, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c35", "c36"] as const) });

function candidateFixture() {
  const states = [0, 1].map((tick) => Object.freeze({ tick, input: {} as never, run: Object.freeze({ mode: "endless", wave: 1, score: tick, time: tick, seed: 7 }), player: Object.freeze({ x: 0, y: 0, vx: 0, vy: 0, hp: 100 }), blade: Object.freeze({ state: "held", x: 0, y: 0, vx: 0, vy: 0 }), enemies: Object.freeze([]) }));
  const data = Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1, manifest: Object.freeze({ id: "c35-v3-canonical", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }), sequences: Object.freeze([Object.freeze({ candidateHash: "c".repeat(16), split: "training" as const, lessonId: "movement", segmentKind: "demonstration", tags: Object.freeze([]), sourceScenario: scenario, tracks: Object.freeze({ observations: Object.freeze(states), actions: Object.freeze([Object.freeze({ kind: "command" as const, id: 1, tick: 1, command: Object.freeze({ type: "move" as const, x: 1_000, y: 0 }) })]), nativeEvents: Object.freeze([]), rewardComponents: Object.freeze(states.map((entry) => Object.freeze({ tick: entry.tick, value: null }))), intents: Object.freeze([]), terminal: Object.freeze({ tick: 1, semanticHash: stableVerificationHash(states[1]), terminated: true, truncated: false }) }) as never, sequenceHash: "d".repeat(16) })]), observationCount: 2, actionCount: 1, datasetHash: "e".repeat(16) }) satisfies TearAcademyTrainingDatasetV1;
  const reward = createTearOfflineRlPlan(data, { id: "c35-v3-canonical", version: 1, seed: 7, reward: { components: [{ id: "score", source: "score.delta", weight: 1, maximumSourceValue: 10, perTransitionCap: 10 }], totalMinimum: -10, totalMaximum: 10 }, limits: { maxTransitions: 4, maxEventsPerTransition: 4, maxRewardViolations: 0 } });
  const receipt = extractTearOfflineRlTrajectories(data, reward), offline = createTearOfflineRlV3Plan(receipt, { id: "offline", version: 1, actionVocabulary: [{ type: "move", x: 1_000, y: 0 }], config: { epochs: 1, learningRate: 0.5, gamma: 0.9, maxStateActionEntries: 10, maxAbsoluteQ: 100, maxMeanAbsoluteTdError: 100, maxConsecutiveDivergentEpochs: 2 } });
  const training = completeTearOfflineRlV3Checkpoint(offline, receipt, advanceTearOfflineRlV3Checkpoint(offline, receipt, createTearOfflineRlV3Checkpoint(offline, receipt), 1)), online = createTearOnlineRlV3Plan(offline, training, reward, { id: "online", scenarios: [scenario], config: { learningRate: 0.5, gamma: 0.9, maxTicks: 3, maxUpdates: 10, maxAbsoluteQ: 100 } });
  const checkpoint = advanceTearOnlineRlV3Checkpoint(online, offline, training, reward, createTearOnlineRlV3Checkpoint(online, training)), evaluation = evaluateTearOnlineRlV3InSource(online, offline, training, reward, checkpoint);
  return createTearC34V3C32PolicyCandidate(offline, training, online, checkpoint, evaluation, { id: "c35-promoted-v3", createdAt: "2026-08-08T00:00:00.000Z", encoder: { id: "tear-c34-c32-canonical-source-state.v1", schemaVersion: 1, observationClass: "structured-state", normalizationHash: "1".repeat(16) }, actionSchema: "tear-game-action-command-envelope.v1", recurrentState: { kind: "none", schemaVersion: 1 }, trainingManifest: { id: "c31-manifest", version: 1, rootHash: "2".repeat(16) }, rewardVersion: "c34-v3", build: { version: "test", revision: "c34", target: "unit", rulesetVersion: "r", contentHash: "c", configHash: "g" }, metrics: { pairedPassed: 1 }, levelTarget: "class-a", lineage: { trainingRunId: training.trainingHash }, signature: { kind: "local-unsigned", keyId: "development" } });
}

async function promoted() {
  const backend = createMemoryGhostVaultBackend(), candidate = candidateFixture(); await new TearC34V3C32CandidateRegistry(backend).register(candidate.artifact);
  const activation = await new TearPolicyArtifactRegistry(backend, TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY).activate(candidate.artifact.id, "2026-08-08T00:01:00.000Z");
  const draft = { format: "tear-foundry-v3-promotion-receipt" as const, schemaVersion: 1 as const, approvalHash: "f".repeat(16), artifactId: candidate.artifact.id, artifactHash: candidate.artifact.artifactHash, activationHash: activation.activationHash, revision: activation.revision, promotedAt: "2026-08-08T00:01:00.000Z" }, receipt = Object.freeze({ ...draft, receiptHash: stableVerificationHash(draft) });
  await backend.put("analysis", `foundry-job-v3-promotion-receipt:v1:${receipt.approvalHash}`, JSON.stringify(receipt));
  const plan = createTearBotV3CanonicalEvaluationPlan({ id: "promoted-canonical", candidate: { approvalHash: receipt.approvalHash, artifactId: candidate.artifact.id, artifactHash: candidate.artifact.artifactHash, activationHash: activation.activationHash }, cases: [{ id: "one", scenario, scenarioHash: stableVerificationHash(scenario) }, { id: "two", scenario: { ...scenario, id: "c35-v3-canonical-2", seed: "c35-v3-canonical-2" }, scenarioHash: stableVerificationHash({ ...scenario, id: "c35-v3-canonical-2", seed: "c35-v3-canonical-2" }) }], maxTicksPerCase: 3 });
  return { backend, candidate, activation, receipt, plan };
}

describe("C35 promoted V3 canonical source evaluation", () => {
  it("runs only the exact promoted V3 candidate through fresh C30/C32 source worlds with bounded distributions", async () => {
    const f = await promoted(), report = await new TearBotV3CanonicalEvaluationExecutor(f.backend).execute(f.plan);
    expect(report.placement).toBe("unassigned"); expect(report.humanCalibration).toBe("not-compared"); expect(report.episodes).toHaveLength(2);
    expect(report.episodes.map((entry) => entry.freshWorldOrdinal)).toEqual([1, 2]); expect(report.episodes.every((entry) => entry.decisions.length > 0 && entry.decisions.every((decision) => decision.artifactId === f.candidate.artifact.id))).toBe(true);
    expect(report.distribution).toMatchObject({ episodes: 2, maxTicksPerCase: 3 }); expect(report.provenance).toMatchObject({ promotionReceiptHash: f.receipt.receiptHash, activationHash: f.activation.activationHash, artifactHash: f.candidate.artifact.artifactHash });
    expect(await f.backend.get("analysis", "policy-active:v1")).toBeDefined();
  });

  it("refuses absent, tampered, replaced, or promotion-mismatched provenance before a world starts", async () => {
    const f = await promoted(), executor = new TearBotV3CanonicalEvaluationExecutor(f.backend);
    await f.backend.put("analysis", `foundry-job-v3-promotion-receipt:v1:${f.receipt.approvalHash}`, "corrupt"); await expect(executor.execute(f.plan)).rejects.toThrow(/promotion receipt/u);
    const fresh = await promoted(), { planHash, format, schemaVersion, ...draft } = fresh.plan;
    void planHash; void format; void schemaVersion;
    const mismatched = createTearBotV3CanonicalEvaluationPlan({ ...draft, candidate: { ...fresh.plan.candidate, activationHash: "0".repeat(16) } }); await expect(new TearBotV3CanonicalEvaluationExecutor(fresh.backend).execute(mismatched)).rejects.toThrow(/provenance mismatch/u);
    const changed = await promoted(); await changed.backend.put("analysis", "policy-active:v1", JSON.stringify({ ...changed.activation, artifactHash: "0".repeat(16) })); await expect(new TearBotV3CanonicalEvaluationExecutor(changed.backend).execute(changed.plan)).rejects.toThrow(/active promoted head|candidate/u);
  });

  it("projects only an exact retained parsed report and visibly refuses a tampered record", async () => {
    const f = await promoted(), report = await new TearBotV3CanonicalEvaluationExecutor(f.backend).execute(f.plan);
    const vault = new TearBotV3CanonicalEvidenceVault(f.backend); await vault.retain(f.plan, report);
    const controller = new LiveBotEvidenceController(undefined, () => report.reportHash, async () => vault.get(report.reportHash));
    await controller.refresh();
    expect(controller.snapshot()).toMatchObject({ status: "ready", report: { reportHash: report.reportHash, episodes: 2, placement: "unassigned", humanCalibration: "not-compared", certification: "not-certified" } });
    await f.backend.put("analysis", `tearbot-v3-canonical-evidence:v1:${report.reportHash}`, "tampered");
    await controller.refresh(); expect(controller.snapshot()).toMatchObject({ status: "unavailable" });
  });
});

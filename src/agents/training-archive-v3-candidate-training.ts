/** Training Archive candidate computation; existing serialized lineage is unchanged. */
import { stableVerificationHash } from "../replay/hash";
import { assertTrainingArchiveV3DerivedRequest } from "./training-archive-v3-derived-evidence-contract";
import { createProductionHeadlessEnvironment } from "../tearbench/production-headless-environment";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCandidateCurationStore } from "./academy-candidate-curation";
import type { TearAcademyCorpusStore } from "./academy-corpus";
import type { TearAcademyTrainingDatasetLoader, TearAcademyTrainingDatasetRequestV1 } from "./academy-training-dataset";
import { TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1, TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1 } from "./c34-c32-runtime-compatibility";
import { createTearC34V3C32PolicyCandidate } from "./c34-v3-c32-policy-adapter";
import { createTearOfflineRlPlan, extractTearOfflineRlTrajectories, validateTearOfflineRlPlanRequest, type TearOfflineRlPlanRequestV1 } from "./offline-rl-training";
import { advanceTearOfflineRlV3Checkpoint, completeTearOfflineRlV3Checkpoint, createTearOfflineRlV3Checkpoint, createTearOfflineRlV3Plan, validateTearOfflineRlV3Request } from "./offline-rl-v3-training";
import { advanceTearOnlineRlV3Checkpoint, createTearOnlineRlV3Checkpoint, createTearOnlineRlV3Plan, evaluateTearOnlineRlV3InSource, validateTearOnlineRlV3Request } from "./online-rl-v3-training";
import { isTearPolicyArtifactIdentity, type TearPolicyArtifactDraft } from "./policy-artifact-registry";

export interface TrainingArchiveV3CandidateTrainingRequest {
  readonly dataset: TearAcademyTrainingDatasetRequestV1;
  readonly manifestHash: string;
  readonly manifestRootHash: string;
  readonly actor: string;
  readonly at: string;
  readonly reward: TearOfflineRlPlanRequestV1;
  readonly offline: Parameters<typeof createTearOfflineRlV3Plan>[1];
  readonly online: Parameters<typeof createTearOnlineRlV3Plan>[3];
  readonly minimumRewardGain: number;
  readonly artifact: Pick<TearPolicyArtifactDraft, "id" | "createdAt" | "levelTarget" | "signature">;
  readonly parentArtifactId?: string;
}

/** Pure value validation shared by launch admission and actual candidate computation. */
export function validateTrainingArchiveV3CandidateTrainingRequest(request: TrainingArchiveV3CandidateTrainingRequest): void {
  assertTrainingArchiveV3DerivedRequest(request);
  const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
  const hash = (value: unknown): boolean => typeof value === "string" && /^[a-f0-9]{16}$/u.test(value);
  if (!text(request.actor) || !text(request.at) || !Number.isFinite(Date.parse(request.at))
    || !hash(request.manifestHash) || !hash(request.manifestRootHash)
    || !text(request.dataset.manifestId) || !text(request.dataset.trainerId) || !Number.isSafeInteger(request.dataset.version) || request.dataset.version < 1
    || !Number.isFinite(request.minimumRewardGain) || request.minimumRewardGain < 0
    || request.parentArtifactId !== undefined && !text(request.parentArtifactId)
    || !isTearPolicyArtifactIdentity(request.artifact)) throw new TypeError("invalid governed V3 candidate training request");
  validateTearOfflineRlPlanRequest(request.reward);
  const actions = validateTearOfflineRlV3Request(request.offline);
  if (actions.length !== request.offline.actionVocabulary.length) throw new TypeError("governed V3 action vocabulary repeats");
  validateTearOnlineRlV3Request(request.online);
}

/**
 * One explicit local C31 -> C34 V3 -> inactive C32 candidate computation.
 * No storage writes, activation, approval, promotion, or background loop. The
 * caller must admit/persist the returned lineage under its own commit authority.
 */
export async function trainTrainingArchiveV3Candidate(
  services: Readonly<{ custody: TearAcademyCandidateCustodyStore; curation: TearAcademyCandidateCurationStore;
    corpus: TearAcademyCorpusStore; loader: TearAcademyTrainingDatasetLoader }>,
  requestInput: TrainingArchiveV3CandidateTrainingRequest,
) {
  validateTrainingArchiveV3CandidateTrainingRequest(requestInput);
  const request = structuredClone(requestInput);
  const backend = services.custody.backend();
  if (services.curation.backend() !== backend || services.corpus.backend() !== backend || services.loader.backend() !== backend) {
    throw new TypeError("governed V3 training services must share one Vault backend");
  }
  const manifest = await services.corpus.getManifest(request.dataset.manifestId,
    { kind: "trainer", id: request.dataset.trainerId }, request.dataset.version);
  if (manifest?.manifestHash !== request.manifestHash || manifest.rootHash !== request.manifestRootHash) {
    throw new RangeError("governed V3 training requires the exact published trainer manifest");
  }
  const requireCustody = async () => {
    const currentManifest = await services.corpus.getManifest(request.dataset.manifestId,
      { kind: "trainer", id: request.dataset.trainerId }, request.dataset.version);
    if (currentManifest?.manifestHash !== manifest.manifestHash || currentManifest.rootHash !== manifest.rootHash) {
      throw new RangeError("governed V3 published manifest is unavailable or changed");
    }
    const held = await services.custody.held(request.at);
    const curated = await services.curation.active(request.at);
    for (const entry of manifest.entries) {
      const record = held.find((value) => value.candidateHash === entry.candidateHash && value.recordHash === entry.custodyRecordHash);
      if (record === undefined || !record.privacyRetention.authorizedActorIds.includes(request.actor)
        || record.consent.modelTraining === "no-training") throw new RangeError("governed V3 training custody is unavailable or changed");
      if (!curated.some((decision) => decision.candidateHash === entry.candidateHash
        && decision.disposition === "curation-approved" && decision.decisionHash === entry.curationDecisionHash)) {
        throw new RangeError("governed V3 training curation approval is unavailable or changed");
      }
    }
  };
  await requireCustody();
  const dataset = await services.loader.load(request.dataset);
  if (dataset.manifest.manifestHash !== manifest.manifestHash || dataset.manifest.rootHash !== manifest.rootHash) {
    throw new RangeError("governed V3 dataset no longer matches its frozen manifest");
  }
  await requireCustody();
  const reward = createTearOfflineRlPlan(dataset, request.reward);
  const trajectories = extractTearOfflineRlTrajectories(dataset, reward);
  const offline = createTearOfflineRlV3Plan(trajectories, request.offline);
  const offlineCheckpoint = advanceTearOfflineRlV3Checkpoint(offline, trajectories,
    createTearOfflineRlV3Checkpoint(offline, trajectories), offline.config.epochs);
  const training = completeTearOfflineRlV3Checkpoint(offline, trajectories, offlineCheckpoint);
  const online = createTearOnlineRlV3Plan(offline, training, reward, request.online);
  const sourceBuilds = Object.freeze(online.scenarios.map((scenario) => {
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset(scenario);
      return Object.freeze({ scenarioHash: stableVerificationHash(scenario), build: environment.sourceBuild() });
    } finally { environment.dispose(); }
  }));
  const primaryBuild = sourceBuilds[0]?.build;
  if (primaryBuild === undefined) throw new RangeError("governed V3 training has no source build identity");
  const checkpoint = advanceTearOnlineRlV3Checkpoint(online, offline, training, reward,
    createTearOnlineRlV3Checkpoint(online, training));
  const evaluation = evaluateTearOnlineRlV3InSource(online, offline, training, reward, checkpoint, request.minimumRewardGain);
  // Awaited reads can observe a revocation that occurred during dataset loading.
  // This is an output boundary, not a substitute for guarded durable admission.
  await requireCustody();
  const candidate = createTearC34V3C32PolicyCandidate(offline, training, online, checkpoint, evaluation, {
    ...request.artifact,
    build: primaryBuild,
    encoder: { id: TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id, schemaVersion: 1,
      observationClass: "structured-state", normalizationHash: TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1 },
    actionSchema: "tear-game-action-command-envelope.v1", recurrentState: { kind: "none", schemaVersion: 1 },
    trainingManifest: { id: manifest.id, version: manifest.version, rootHash: manifest.rootHash },
    rewardVersion: reward.reward.rewardHash,
    metrics: { baselineReward: evaluation.metrics.baselineReward, challengerReward: evaluation.metrics.challengerReward },
    lineage: { trainingRunId: training.trainingHash,
      ...(request.parentArtifactId === undefined ? {} : { parentArtifactId: request.parentArtifactId }) },
  });
  const lineage = Object.freeze({ requestHash: stableVerificationHash(request), manifestHash: manifest.manifestHash, manifestRootHash: manifest.rootHash,
    datasetHash: dataset.datasetHash, sourceBuildsHash: stableVerificationHash(sourceBuilds),
    custodyRecordHashes: Object.freeze(manifest.entries.map((entry) => entry.custodyRecordHash)),
    rewardPlanHash: reward.planHash, trajectoryReceiptHash: trajectories.receiptHash, offlinePlanHash: offline.planHash,
    trainingHash: training.trainingHash, onlinePlanHash: online.planHash, checkpointHash: checkpoint.checkpointHash,
    evaluationHash: evaluation.resultHash, candidateReceiptHash: candidate.receipt.receiptHash });
  return Object.freeze({ request: Object.freeze(request), lineage, lineageHash: stableVerificationHash(lineage), sourceBuilds, dataset, reward, trajectories,
    offline, offlineCheckpoint, training, online, checkpoint, evaluation, candidate });
}

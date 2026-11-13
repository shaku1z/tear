/** Training Operations admission; legacy wire identifiers remain byte-compatible. */
import type { GhostVaultStore } from "../ghost";
import type { GhostVaultWrite } from "../ghost";
import {
  trainingOperationsV3CommitParts,
  verifyTrainingOperationsV3Commit,
  type TrainingOperationsV3Continuation,
  type TrainingOperationsV3Guard,
} from "./training-operations-v3-commit";
import { stableVerificationHash } from "../replay/hash";
import { readTearReturnVariant } from "./c34-source-feature-state";
import { commitTrainingOperationsJobWrites, trainingOperationsJobBudgetAuthority } from "./training-operations-budget";
import { trainingOperationsTrainingComputeUnits } from "./training-operations-compute-budget";
import { assertTrainingOperationsV3DerivedReceiptPayload } from "./training-archive-v3-derived-evidence-contract";
import {
  trainTrainingArchiveV3Candidate,
  type TrainingArchiveV3CandidateTrainingRequest,
} from "./training-archive-v3-candidate-training";
import { canonicalizeTearC34C32ActionVocabulary } from "./c34-c32-runtime-compatibility";
import { createTearC34V3C32PolicyCandidate, parseTearC34V3C32PolicyCandidate } from "./c34-v3-c32-policy-adapter";
import { parseTearFoundryJob, transitionTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import { parseTearOfflineRlPlan } from "./offline-rl-training";
import { parseTearOfflineRlV3Plan, parseTearOfflineRlV3TrainingResult } from "./offline-rl-v3-training";
import {
  parseTearOnlineRlV3Checkpoint,
  parseTearOnlineRlV3EvaluationResult,
  parseTearOnlineRlV3Plan,
} from "./online-rl-v3-training";
import { parseTearPolicyActivation, parseTearPolicyArtifact } from "./policy-artifact-registry";

const KEY = "foundry-job-v3-training:v1:";
const REASON = "governed V3 training and inactive candidate retained";
const HASH = /^[a-f0-9]{16}$/u;
type Services = Parameters<typeof trainTrainingArchiveV3Candidate>[0];
type Training = Awaited<ReturnType<typeof trainTrainingArchiveV3Candidate>>;
type Evidence = Pick<
  Training,
  | "request"
  | "lineage"
  | "lineageHash"
  | "sourceBuilds"
  | "reward"
  | "offline"
  | "training"
  | "online"
  | "checkpoint"
  | "evaluation"
  | "candidate"
>;
export interface TrainingOperationsV3TrainingReceiptV1 {
  readonly format: "tear-foundry-v3-training-receipt";
  readonly schemaVersion: 1;
  readonly sourceJob: TearFoundryJobV1;
  readonly job: TearFoundryJobV1;
  /** Derived evidence only: no raw dataset, observations, or source tracks. */
  readonly evidence: Evidence;
  readonly receiptHash: string;
}
function exact(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && new Set(b).size === b.length && b.every((entry) => a.includes(entry));
}
function same(a: unknown, b: unknown): boolean {
  return stableVerificationHash(a) === stableVerificationHash(b);
}
function trainingWrites(receipt: TrainingOperationsV3TrainingReceiptV1): readonly GhostVaultWrite[] {
  const artifact = receipt.evidence.candidate.artifact;
  return Object.freeze([
    { store: "analysis", key: `${KEY}${receipt.sourceJob.jobHash}`, value: JSON.stringify(receipt) },
    { store: "analysis", key: `policy-artifact:v1:${artifact.id}`, value: JSON.stringify(artifact) },
    {
      store: "indexes",
      key: `policy-artifact:${artifact.id}`,
      value: JSON.stringify({ artifactHash: artifact.artifactHash, createdAt: artifact.createdAt }),
    },
    {
      store: "indexes",
      key: `foundry-job-v3-training:${receipt.sourceJob.id}:${receipt.receiptHash}`,
      value: JSON.stringify({ jobHash: receipt.job.jobHash, artifactHash: artifact.artifactHash }),
    },
  ]);
}

/** Integrity/lineage validation is not action-time admission authority. */
export function parseTrainingOperationsV3TrainingReceipt(value: unknown): TrainingOperationsV3TrainingReceiptV1 {
  assertTrainingOperationsV3DerivedReceiptPayload(value);
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("invalid Foundry V3 training receipt");
  const envelope = value as Record<string, unknown>;
  const envelopeKeys = ["format", "schemaVersion", "sourceJob", "job", "evidence", "receiptHash"];
  if (
    Object.keys(envelope).length !== envelopeKeys.length ||
    Object.keys(envelope).some((key) => !envelopeKeys.includes(key))
  ) {
    throw new TypeError("Foundry V3 training receipt accepts derived evidence only");
  }
  if (
    envelope.format !== "tear-foundry-v3-training-receipt" ||
    envelope.schemaVersion !== 1 ||
    typeof envelope.receiptHash !== "string" ||
    !HASH.test(envelope.receiptHash)
  )
    throw new TypeError("invalid Foundry V3 training receipt");
  const typed = value as TrainingOperationsV3TrainingReceiptV1;
  const { receiptHash, ...draft } = typed;
  if (stableVerificationHash(draft) !== receiptHash)
    throw new TypeError("Foundry V3 training receipt integrity mismatch");
  const source = parseTearFoundryJob(typed.sourceJob),
    job = parseTearFoundryJob(typed.job),
    data = typed.evidence;
  const allowed = [
    "request",
    "lineage",
    "lineageHash",
    "sourceBuilds",
    "reward",
    "offline",
    "training",
    "online",
    "checkpoint",
    "evaluation",
    "candidate",
  ];
  if (Object.keys(data).length !== allowed.length || Object.keys(data).some((key) => !allowed.includes(key))) {
    throw new TypeError("Foundry V3 training receipt accepts derived evidence only");
  }
  const reward = parseTearOfflineRlPlan(data.reward),
    offline = parseTearOfflineRlV3Plan(data.offline),
    training = parseTearOfflineRlV3TrainingResult(data.training);
  const online = parseTearOnlineRlV3Plan(data.online),
    checkpoint = parseTearOnlineRlV3Checkpoint(data.checkpoint),
    evaluation = parseTearOnlineRlV3EvaluationResult(data.evaluation);
  const artifact = parseTearPolicyArtifact(data.candidate.artifact);
  parseTearC34V3C32PolicyCandidate(artifact);
  const candidate = createTearC34V3C32PolicyCandidate(offline, training, online, checkpoint, evaluation, artifact);
  if (
    source.phase !== "curating" ||
    source.schemaVersion === 1 ||
    artifact.id === source.inputs.champion.id ||
    artifact.id !== data.request.artifact.id ||
    artifact.createdAt !== data.request.artifact.createdAt ||
    artifact.levelTarget !== data.request.artifact.levelTarget ||
    !same(artifact.signature, data.request.artifact.signature) ||
    artifact.lineage.trainingRunId !== training.trainingHash ||
    artifact.lineage.parentArtifactId !== data.request.parentArtifactId ||
    offline.id !== data.request.offline.id ||
    offline.version !== data.request.offline.version ||
    !same(offline.config, data.request.offline.config) ||
    readTearReturnVariant(offline.sourceStateAdapter) !== data.request.offline.variant ||
    !same(offline.actionVocabulary, canonicalizeTearC34C32ActionVocabulary(data.request.offline.actionVocabulary)) ||
    online.id !== data.request.online.id ||
    !same(online.config, data.request.online.config) ||
    !same(online.scenarios, data.request.online.scenarios) ||
    reward.id !== data.request.reward.id ||
    reward.version !== data.request.reward.version ||
    reward.seed !== data.request.reward.seed ||
    !same(reward.limits, data.request.reward.limits) ||
    reward.reward.rewardHash !==
      stableVerificationHash({
        format: "tear-offline-rl-reward-definition",
        schemaVersion: 1,
        ...data.request.reward.reward,
      }) ||
    !same(transitionTearFoundryJob(source, "training", data.request.at, REASON), job) ||
    !same(data.candidate, candidate) ||
    !same(data.lineageHash, stableVerificationHash(data.lineage)) ||
    data.lineage.requestHash !== stableVerificationHash(data.request) ||
    !exact(source.inputs.corpusRecordHashes, data.lineage.custodyRecordHashes) ||
    data.lineage.manifestHash !== data.request.manifestHash ||
    data.lineage.manifestRootHash !== data.request.manifestRootHash ||
    data.lineage.datasetHash !== reward.dataset.datasetHash ||
    data.lineage.manifestRootHash !== reward.dataset.manifestRootHash ||
    reward.dataset.manifestId !== data.request.dataset.manifestId ||
    reward.dataset.manifestVersion !== data.request.dataset.version ||
    reward.reward.rewardHash !== source.inputs.rewardDefinitionHash ||
    artifact.rewardVersion !== source.inputs.rewardDefinitionHash ||
    data.lineage.rewardPlanHash !== reward.planHash ||
    offline.receipt.planHash !== reward.planHash ||
    data.lineage.trajectoryReceiptHash !== offline.receipt.receiptHash ||
    data.lineage.offlinePlanHash !== offline.planHash ||
    data.lineage.trainingHash !== training.trainingHash ||
    data.lineage.onlinePlanHash !== online.planHash ||
    data.lineage.checkpointHash !== checkpoint.checkpointHash ||
    data.lineage.evaluationHash !== evaluation.resultHash ||
    data.lineage.candidateReceiptHash !== candidate.receipt.receiptHash ||
    data.lineage.sourceBuildsHash !== stableVerificationHash(data.sourceBuilds) ||
    data.sourceBuilds.length !== online.scenarios.length ||
    !data.sourceBuilds.every(
      (entry, index) => entry.scenarioHash === stableVerificationHash(online.scenarios[index]),
    ) ||
    !data.sourceBuilds.every(
      ({ build }) =>
        (["version", "revision", "target", "rulesetVersion", "contentHash"] as const).every(
          (field) => build[field] === artifact.build[field],
        ) &&
        typeof build.configHash === "string" &&
        build.configHash.trim().length > 0,
    ) ||
    !same(artifact.build, data.sourceBuilds[0]?.build) ||
    !same(artifact.trainingManifest, {
      id: reward.dataset.manifestId,
      version: reward.dataset.manifestVersion,
      rootHash: reward.dataset.manifestRootHash,
    })
  ) {
    throw new RangeError("Foundry V3 training receipt lineage changed");
  }
  return Object.freeze(structuredClone(typed));
}

export class TrainingOperationsV3TrainingAdmissionExecutor {
  readonly #jobs: TearFoundryJobVault;
  readonly #services: Services;
  constructor(jobs: TearFoundryJobVault, services: Services) {
    const backend = jobs.backend();
    if (
      [
        services.custody.backend(),
        services.curation.backend(),
        services.corpus.backend(),
        services.loader.backend(),
      ].some((entry) => entry !== backend)
    ) {
      throw new TypeError("Foundry V3 admission must share one C31 Vault");
    }
    this.#jobs = jobs;
    this.#services = services;
  }

  async get(sourceJobHash: string): Promise<TrainingOperationsV3TrainingReceiptV1 | undefined> {
    if (!HASH.test(sourceJobHash)) throw new TypeError("invalid Foundry V3 source job hash");
    const backend = this.#jobs.backend(),
      key = `${KEY}${sourceJobHash}`,
      raw = await backend.get("analysis", key);
    if (raw === undefined) return undefined;
    try {
      const result = parseTrainingOperationsV3TrainingReceipt(JSON.parse(raw));
      if (result.sourceJob.jobHash !== sourceJobHash) throw new TypeError("Foundry V3 training receipt key mismatch");
      return result;
    } catch {
      await backend.put("quarantine", key, raw);
      return undefined;
    }
  }

  async start(
    jobInput: TearFoundryJobV1,
    requestInput: TrainingArchiveV3CandidateTrainingRequest,
    continuation?: TrainingOperationsV3Continuation<TrainingOperationsV3TrainingReceiptV1>,
  ): Promise<TrainingOperationsV3TrainingReceiptV1> {
    const sourceJob = parseTearFoundryJob(jobInput),
      request = structuredClone(requestInput),
      backend = this.#jobs.backend();
    if (
      sourceJob.phase !== "curating" ||
      sourceJob.schemaVersion === 1 ||
      request.artifact.id === sourceJob.inputs.champion.id
    ) {
      throw new RangeError("Foundry V3 admission requires an exact curating job and distinct candidate");
    }
    const key = `${KEY}${sourceJob.jobHash}`,
      old = await backend.get("analysis", key);
    if (old !== undefined) {
      const prior = await this.get(sourceJob.jobHash);
      if (
        prior === undefined ||
        !same(prior.evidence.request, request) ||
        (await this.#jobs.get(sourceJob.id))?.jobHash !== prior.job.jobHash ||
        (await backend.get("analysis", `policy-artifact:v1:${request.artifact.id}`)) !==
          JSON.stringify(prior.evidence.candidate.artifact) ||
        (await backend.get("indexes", `policy-artifact:${request.artifact.id}`)) !==
          JSON.stringify({
            artifactHash: prior.evidence.candidate.artifact.artifactHash,
            createdAt: prior.evidence.candidate.artifact.createdAt,
          })
      ) {
        throw new RangeError("Foundry V3 admission retry evidence changed");
      }
      const manifest = await this.#services.corpus.getManifest(
        request.dataset.manifestId,
        { kind: "trainer", id: request.dataset.trainerId },
        request.dataset.version,
      );
      const held = await this.#services.custody.held(request.at),
        curated = await this.#services.curation.active(request.at);
      const championRaw = await backend.get("analysis", `policy-artifact:v1:${sourceJob.inputs.champion.id}`);
      const champion = championRaw === undefined ? undefined : parseTearPolicyArtifact(JSON.parse(championRaw));
      const activeRaw = await backend.get("analysis", "policy-active:v1");
      const active = activeRaw === undefined ? undefined : parseTearPolicyActivation(JSON.parse(activeRaw));
      if (
        champion?.artifactHash !== sourceJob.inputs.champion.artifactHash ||
        (active !== undefined && (active.artifactId !== champion.id || active.artifactHash !== champion.artifactHash))
      ) {
        throw new RangeError("Foundry V3 admission retry champion changed");
      }
      if (
        manifest?.manifestHash !== request.manifestHash ||
        manifest.rootHash !== request.manifestRootHash ||
        !exact(
          sourceJob.inputs.corpusRecordHashes,
          manifest.entries.map((entry) => entry.custodyRecordHash),
        ) ||
        !manifest.entries.every(
          (entry) =>
            held.some(
              (record) =>
                record.recordHash === entry.custodyRecordHash &&
                record.candidateHash === entry.candidateHash &&
                record.privacyRetention.authorizedActorIds.includes(request.actor) &&
                record.consent.modelTraining !== "no-training",
            ) &&
            curated.some(
              (decision) =>
                decision.decisionHash === entry.curationDecisionHash && decision.disposition === "curation-approved",
            ),
        )
      ) {
        throw new RangeError("Foundry V3 admission retry custody or approval changed");
      }
      const retryGuards: TrainingOperationsV3Guard[] = [
        { store: "analysis", key, expected: old },
        { store: "analysis", key: `foundry-job:v1:${sourceJob.id}`, expected: JSON.stringify(prior.job) },
        {
          store: "analysis",
          key: `policy-artifact:v1:${sourceJob.inputs.champion.id}`,
          ...(championRaw === undefined ? {} : { expected: championRaw }),
        },
        { store: "analysis", key: "policy-active:v1", ...(activeRaw === undefined ? {} : { expected: activeRaw }) },
        {
          store: "analysis",
          key: `academy-corpus-manifest:v1:trainer:${request.dataset.trainerId}:${request.dataset.manifestId}:${String(request.dataset.version)}`,
          expected: JSON.stringify(manifest),
        },
      ];
      for (const entry of manifest.entries) {
        const custody = held.find((record) => record.recordHash === entry.custodyRecordHash);
        const approval = curated.find((decision) => decision.decisionHash === entry.curationDecisionHash);
        if (custody === undefined || approval === undefined)
          throw new RangeError("Foundry V3 admission retry custody changed");
        retryGuards.push(...(await this.#services.custody.sourceGuards(custody)));
        retryGuards.push(
          {
            store: "analysis",
            key: `academy-candidate-custody:v1:${entry.candidateHash}`,
            expected: JSON.stringify(custody),
          },
          {
            store: "analysis",
            key: `academy-candidate-curation:v1:${entry.candidateHash}`,
            expected: JSON.stringify(approval),
          },
        );
        const sampleKey = `academy-reviewed-sample:v1:${entry.candidateHash}`,
          sampleRaw = await backend.get("analysis", sampleKey);
        if (sampleRaw === undefined) throw new RangeError("Foundry V3 admission retry reviewed sample is unavailable");
        retryGuards.push({ store: "analysis", key: sampleKey, expected: sampleRaw });
      }
      const dataset = await this.#services.loader.load(request.dataset);
      if (
        dataset.datasetHash !== prior.evidence.lineage.datasetHash ||
        dataset.manifest.manifestHash !== request.manifestHash ||
        dataset.manifest.rootHash !== request.manifestRootHash
      )
        throw new RangeError("Foundry V3 admission retry reviewed dataset changed");
      retryGuards.push(...(await trainingOperationsJobBudgetAuthority(backend, sourceJob)).guards);
      const parts = trainingOperationsV3CommitParts(prior, retryGuards, trainingWrites(prior), continuation);
      // An intact receipt must also retain its exact event/current-index pair.
      // The shared identical-successor branch verifies bytes without rewriting
      // them or charging the already completed attempt again.
      await this.#jobs.persistSuccessorIfMatches(sourceJob, prior.job, parts.guards, parts.writes);
      return prior;
    }
    const guards: Readonly<{ store: GhostVaultStore; key: string; expected?: string }>[] = [];
    const pin = async (store: GhostVaultStore, storageKey: string, expected: string | undefined) => {
      const raw = await backend.get(store, storageKey);
      if (raw !== expected) throw new RangeError("Foundry V3 admission authority bytes changed");
      guards.push(Object.freeze({ store, key: storageKey, ...(raw === undefined ? {} : { expected: raw }) }));
    };
    await pin("analysis", `foundry-job:v1:${sourceJob.id}`, JSON.stringify(sourceJob));
    const manifest = await this.#services.corpus.getManifest(
      request.dataset.manifestId,
      { kind: "trainer", id: request.dataset.trainerId },
      request.dataset.version,
    );
    if (
      manifest?.manifestHash !== request.manifestHash ||
      manifest.rootHash !== request.manifestRootHash ||
      !exact(
        sourceJob.inputs.corpusRecordHashes,
        manifest.entries.map((entry) => entry.custodyRecordHash),
      )
    ) {
      throw new RangeError("Foundry V3 admission requires the exact frozen C31 corpus");
    }
    await pin(
      "analysis",
      `academy-corpus-manifest:v1:trainer:${request.dataset.trainerId}:${request.dataset.manifestId}:${String(request.dataset.version)}`,
      JSON.stringify(manifest),
    );
    const held = await this.#services.custody.held(request.at),
      curated = await this.#services.curation.active(request.at);
    for (const entry of manifest.entries) {
      const custody = held.find(
        (record) => record.recordHash === entry.custodyRecordHash && record.candidateHash === entry.candidateHash,
      );
      const approval = curated.find(
        (decision) =>
          decision.decisionHash === entry.curationDecisionHash &&
          decision.candidateHash === entry.candidateHash &&
          decision.disposition === "curation-approved",
      );
      if (custody === undefined || approval === undefined)
        throw new RangeError("Foundry V3 admission custody or approval is unavailable");
      guards.push(...(await this.#services.custody.sourceGuards(custody)));
      await pin("analysis", `academy-candidate-custody:v1:${entry.candidateHash}`, JSON.stringify(custody));
      await pin("analysis", `academy-candidate-curation:v1:${entry.candidateHash}`, JSON.stringify(approval));
      // The loader validates these exact sample bytes; pin them before loading
      // so deletion or replacement cannot race the final model admission.
      const sampleKey = `academy-reviewed-sample:v1:${entry.candidateHash}`;
      const sampleRaw = await backend.get("analysis", sampleKey);
      if (sampleRaw === undefined) throw new RangeError("Foundry V3 admission reviewed sample is unavailable");
      await pin("analysis", sampleKey, sampleRaw);
    }
    const championKey = `policy-artifact:v1:${sourceJob.inputs.champion.id}`,
      championRaw = await backend.get("analysis", championKey);
    const champion = championRaw === undefined ? undefined : parseTearPolicyArtifact(JSON.parse(championRaw));
    if (
      champion?.id !== sourceJob.inputs.champion.id ||
      champion.artifactHash !== sourceJob.inputs.champion.artifactHash
    )
      throw new RangeError("Foundry V3 admission champion changed");
    parseTearC34V3C32PolicyCandidate(champion);
    await pin("analysis", championKey, championRaw);
    const activeRaw = await backend.get("analysis", "policy-active:v1");
    if (activeRaw !== undefined) {
      const active = parseTearPolicyActivation(JSON.parse(activeRaw));
      if (active.artifactId !== champion.id || active.artifactHash !== champion.artifactHash)
        throw new RangeError("Foundry V3 admission active champion changed");
    }
    await pin("analysis", "policy-active:v1", activeRaw);
    await pin("analysis", key, undefined);
    await pin("analysis", `policy-artifact:v1:${request.artifact.id}`, undefined);
    await pin("indexes", `policy-artifact:${request.artifact.id}`, undefined);
    await commitTrainingOperationsJobWrites(
      backend,
      sourceJob,
      guards,
      [],
      trainingOperationsTrainingComputeUnits(request),
    );
    const result = await trainTrainingArchiveV3Candidate(this.#services, request);
    const { dataset, trajectories, offlineCheckpoint, ...evidence } = result;
    void dataset;
    void trajectories;
    void offlineCheckpoint;
    const job = transitionTearFoundryJob(sourceJob, "training", request.at, REASON);
    const draft = {
      format: "tear-foundry-v3-training-receipt" as const,
      schemaVersion: 1 as const,
      sourceJob,
      job,
      evidence,
    };
    const receipt = parseTrainingOperationsV3TrainingReceipt({ ...draft, receiptHash: stableVerificationHash(draft) });
    await pin("indexes", `foundry-job-v3-training:${sourceJob.id}:${receipt.receiptHash}`, undefined);
    const parts = trainingOperationsV3CommitParts(receipt, guards, trainingWrites(receipt), continuation);
    await this.#jobs.persistSuccessorIfMatches(sourceJob, job, parts.guards, parts.writes);
    // The shared successor helper may recognize an already-written identical
    // job head. That alone does not prove this invocation's receipt was stored.
    await verifyTrainingOperationsV3Commit(backend, parts.guards, [
      ...parts.writes,
      { store: "analysis", key: `foundry-job:v1:${job.id}`, value: JSON.stringify(job) },
    ]);
    return receipt;
  }
}

import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCorpusStore } from "./academy-corpus";
import type { TearAcademyTrainingDatasetLoader } from "./academy-training-dataset";
import { completeTearOfflineRlCheckpoint, TearOfflineRlCheckpointVault, TearOfflineRlTrainingVault, TearOfflineRlTrajectoryVault, type TearOfflineRlTrainingResultV1 } from "./offline-rl-training";
import { TearFoundryOfflineTrainingLaunchVault } from "./foundry-job-offline-training";
import { parseTearFoundryJob, transitionTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";

const KEY = "foundry-job-evaluation-ready:v1:";
const HASH = /^[a-f0-9]{16}$/u;

export interface TearFoundryEvaluationReadinessReceiptV1 {
  readonly format: "tear-foundry-evaluation-readiness-receipt";
  readonly schemaVersion: 1;
  readonly job: Readonly<{ id: string; sourceJobHash: string; resultJobHash: string }>;
  readonly finalizedAt: string;
  readonly disposition: "evaluation-ready" | "training-diverged";
  readonly launchHash: string;
  readonly receiptHash: string;
  readonly checkpointHash: string;
  readonly trainingHash: string;
  readonly receiptHashValue: string;
}

function time(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value)); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function exact(expected: readonly string[], actual: readonly string[]): boolean { return expected.length === actual.length && new Set(actual).size === actual.length && actual.every((value) => expected.includes(value)); }
function freeze(draft: Omit<TearFoundryEvaluationReadinessReceiptV1, "receiptHashValue">): TearFoundryEvaluationReadinessReceiptV1 {
  if (!time(draft.finalizedAt) || !["evaluation-ready", "training-diverged"].includes(draft.disposition)
    || ![draft.job.sourceJobHash, draft.job.resultJobHash, draft.launchHash, draft.receiptHash, draft.checkpointHash, draft.trainingHash].every(hash)
    || typeof draft.job.id !== "string" || draft.job.id.trim().length === 0) throw new TypeError("invalid Foundry evaluation-readiness receipt");
  const value = Object.freeze({ ...draft, job: Object.freeze({ ...draft.job }) });
  return Object.freeze({ ...value, receiptHashValue: stableVerificationHash(value) });
}

/**
 * Finalizes only an exact, terminal C34 checkpoint. A completed result becomes
 * evaluation-ready; a divergence is explicitly rejected. Neither outcome
 * evaluates, registers, activates, or promotes a policy.
 */
export class TearFoundryOfflineTrainingFinalizationExecutor {
  readonly #jobs: TearFoundryJobVault; readonly #custody: TearAcademyCandidateCustodyStore; readonly #corpus: TearAcademyCorpusStore; readonly #loader: TearAcademyTrainingDatasetLoader;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore, corpus: TearAcademyCorpusStore, loader: TearAcademyTrainingDatasetLoader) {
    if (jobs.backend() !== custody.backend() || jobs.backend() !== corpus.backend()) throw new TypeError("Foundry training finalization must share the C31 Vault boundary");
    this.#jobs = jobs; this.#custody = custody; this.#corpus = corpus; this.#loader = loader;
  }

  async finalize(jobInput: TearFoundryJobV1, launchHash: string, finalizedAt: string): Promise<Readonly<{ job: TearFoundryJobV1; receipt: TearFoundryEvaluationReadinessReceiptV1; training: TearOfflineRlTrainingResultV1 }>> {
    const job = parseTearFoundryJob(jobInput), backend = this.#jobs.backend();
    if (job.phase !== "training" || !hash(launchHash) || !time(finalizedAt)) throw new RangeError("Foundry training finalization requires a training job and exact launch");
    const launch = await new TearFoundryOfflineTrainingLaunchVault(backend).get(launchHash);
    if (launch?.job.id !== job.id || launch.job.resultJobHash !== job.jobHash) throw new RangeError("Foundry training finalization lineage is unavailable");
    const [manifest, held, dataset, sourceReceipt, checkpoint] = await Promise.all([
      this.#corpus.getManifest(launch.manifest.id, { kind: "trainer", id: launch.manifest.trainerId }, launch.manifest.version),
      this.#custody.held(finalizedAt), this.#loader.load({ manifestId: launch.manifest.id, trainerId: launch.manifest.trainerId, version: launch.manifest.version }),
      new TearOfflineRlTrajectoryVault(backend).get(launch.receiptHash), new TearOfflineRlCheckpointVault(backend).get(launch.checkpointHash),
    ]);
    if (manifest?.manifestHash !== launch.manifest.manifestHash || manifest.rootHash !== launch.manifest.rootHash
      || dataset.datasetHash !== launch.datasetHash || !exact(job.inputs.corpusRecordHashes, manifest.entries.map((entry) => entry.custodyRecordHash))
      || !job.inputs.corpusRecordHashes.every((entry) => held.some((record) => record.recordHash === entry))
      || sourceReceipt === undefined || checkpoint === undefined || sourceReceipt.receiptHash !== launch.receiptHash
      || sourceReceipt.plan.planHash !== launch.plan.planHash || sourceReceipt.plan.rewardHash !== launch.plan.reward.rewardHash
      || launch.plan.dataset.datasetHash !== dataset.datasetHash || launch.plan.dataset.manifestId !== manifest.id
      || launch.plan.dataset.manifestVersion !== manifest.version || launch.plan.dataset.manifestRootHash !== manifest.rootHash
      || launch.plan.reward.rewardHash !== job.inputs.rewardDefinitionHash) throw new RangeError("Foundry training finalization lineage changed");
    if (checkpoint.status === "running") throw new RangeError("Foundry training checkpoint is incomplete");
    const training = completeTearOfflineRlCheckpoint(checkpoint, sourceReceipt, launch.config);
    const accepted = training.disposition === "completed";
    const next = transitionTearFoundryJob(job, accepted ? "evaluating" : "rejected", finalizedAt,
      accepted ? "exact offline C34 result is evaluation-ready" : "offline C34 training diverged");
    const receipt = freeze({ format: "tear-foundry-evaluation-readiness-receipt", schemaVersion: 1,
      job: { id: job.id, sourceJobHash: job.jobHash, resultJobHash: next.jobHash }, finalizedAt,
      disposition: accepted ? "evaluation-ready" : "training-diverged", launchHash, receiptHash: sourceReceipt.receiptHash,
      checkpointHash: checkpoint.checkpointHash, trainingHash: training.trainingHash });
    await new TearOfflineRlTrainingVault(backend).persist(training);
    await this.#jobs.persistSuccessor(job, next, Object.freeze([
      { store: "analysis", key: `${KEY}${receipt.receiptHashValue}`, value: JSON.stringify(receipt) },
      { store: "indexes", key: `foundry-job-evaluation-ready:${job.id}:${receipt.receiptHashValue}`,
        value: JSON.stringify(Object.freeze({ disposition: receipt.disposition, trainingHash: training.trainingHash, resultJobHash: next.jobHash })) },
    ]));
    return Object.freeze({ job: next, receipt, training });
  }
}

import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCorpusStore } from "./academy-corpus";
import type { TearAcademyTrainingDatasetLoader } from "./academy-training-dataset";
import { createTearOfflineRlCheckpoint, createTearOfflineRlPlan, extractTearOfflineRlTrajectories, advanceTearOfflineRlCheckpoint, TearOfflineRlCheckpointVault, TearOfflineRlTrajectoryVault, type TearOfflineRlPlanRequestV1, type TearOfflineRlTrainingConfigV1 } from "./offline-rl-training";
import { parseTearFoundryJob, transitionTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";

const KEY = "foundry-job-offline-training:v1:";
const HASH = /^[a-f0-9]{16}$/u;
export interface TearFoundryOfflineTrainingRequestV1 { readonly manifestId: string; readonly trainerId: string; readonly manifestVersion: number; readonly plan: TearOfflineRlPlanRequestV1; readonly config: TearOfflineRlTrainingConfigV1; }
export interface TearFoundryOfflineTrainingLaunchV1 { readonly format: "tear-foundry-offline-training-launch"; readonly schemaVersion: 1; readonly job: Readonly<{ id: string; sourceJobHash: string; resultJobHash: string }>; readonly datasetHash: string; readonly manifestHash: string; readonly planHash: string; readonly receiptHash: string; readonly configHash: string; readonly checkpointHash: string; readonly launchHash: string; }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function exact(records: readonly string[], entries: readonly string[]): boolean { return records.length === entries.length && new Set(entries).size === entries.length && entries.every((entry) => records.includes(entry)); }
function freeze(draft: Omit<TearFoundryOfflineTrainingLaunchV1, "launchHash">): TearFoundryOfflineTrainingLaunchV1 { if (!text(draft.job.id) || ![draft.job.sourceJobHash, draft.job.resultJobHash, draft.datasetHash, draft.manifestHash, draft.planHash, draft.receiptHash, draft.configHash, draft.checkpointHash].every(hash)) throw new TypeError("invalid Foundry offline training launch"); return Object.freeze({ ...draft, job: Object.freeze({ ...draft.job }), launchHash: stableVerificationHash(draft) }); }

/** Starts one persisted bounded C34 epoch from an immutable C31 trainer manifest; it emits no model result or policy artifact. */
export class TearFoundryOfflineTrainingExecutor {
  readonly #jobs: TearFoundryJobVault; readonly #custody: TearAcademyCandidateCustodyStore; readonly #corpus: TearAcademyCorpusStore; readonly #loader: TearAcademyTrainingDatasetLoader;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore, corpus: TearAcademyCorpusStore, loader: TearAcademyTrainingDatasetLoader) { if (jobs.backend() !== custody.backend() || jobs.backend() !== corpus.backend()) throw new TypeError("Foundry offline training must share the C31 Vault boundary"); this.#jobs = jobs; this.#custody = custody; this.#corpus = corpus; this.#loader = loader; }
  async start(jobInput: TearFoundryJobV1, request: TearFoundryOfflineTrainingRequestV1, at: string): Promise<Readonly<{ job: TearFoundryJobV1; launch: TearFoundryOfflineTrainingLaunchV1 }>> {
    const job = parseTearFoundryJob(jobInput); if (job.phase !== "curating" || !text(request.manifestId) || !text(request.trainerId) || !Number.isSafeInteger(request.manifestVersion) || request.manifestVersion < 1 || !text(at)) throw new RangeError("Foundry offline training requires a curating job and immutable manifest request");
    const [manifest, held, dataset] = await Promise.all([this.#corpus.getManifest(request.manifestId, { kind: "trainer", id: request.trainerId }, request.manifestVersion), this.#custody.held(at), this.#loader.load({ manifestId: request.manifestId, trainerId: request.trainerId, version: request.manifestVersion })]);
    if (manifest === undefined) throw new RangeError("Foundry offline training manifest or custody changed before output");
    if (dataset.manifest.manifestHash !== manifest.manifestHash || dataset.manifest.rootHash !== manifest.rootHash || !exact(job.inputs.corpusRecordHashes, manifest.entries.map((entry) => entry.custodyRecordHash)) || !job.inputs.corpusRecordHashes.every((entry) => held.some((record) => record.recordHash === entry))) throw new RangeError("Foundry offline training manifest or custody changed before output");
    const plan = createTearOfflineRlPlan(dataset, request.plan); if (plan.reward.rewardHash !== job.inputs.rewardDefinitionHash) throw new RangeError("Foundry offline training reward is not frozen by the job");
    const receipt = extractTearOfflineRlTrajectories(dataset, plan), initial = createTearOfflineRlCheckpoint(receipt, request.config), checkpoint = advanceTearOfflineRlCheckpoint(initial, receipt, request.config, 1);
    const next = transitionTearFoundryJob(job, "training", at, "one bounded offline C34 epoch persisted");
    const launch = freeze({ format: "tear-foundry-offline-training-launch", schemaVersion: 1, job: { id: job.id, sourceJobHash: job.jobHash, resultJobHash: next.jobHash }, datasetHash: dataset.datasetHash, manifestHash: manifest.manifestHash, planHash: plan.planHash, receiptHash: receipt.receiptHash, configHash: stableVerificationHash(request.config), checkpointHash: checkpoint.checkpointHash });
    await new TearOfflineRlTrajectoryVault(this.#jobs.backend()).persist(receipt); await new TearOfflineRlCheckpointVault(this.#jobs.backend()).persist(checkpoint);
    await this.#jobs.persistSuccessor(job, next, Object.freeze([{ store: "analysis", key: `${KEY}${launch.launchHash}`, value: JSON.stringify(launch) }, { store: "indexes", key: `foundry-job-offline-training:${job.id}:${launch.launchHash}`, value: JSON.stringify(Object.freeze({ checkpointHash: checkpoint.checkpointHash, planHash: plan.planHash })) }]));
    return Object.freeze({ job: next, launch });
  }
}

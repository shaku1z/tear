import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCorpusStore } from "./academy-corpus";
import type { TearAcademyTrainingDatasetLoader } from "./academy-training-dataset";
import { parseTearFoundryEvaluationReadinessReceipt, type TearFoundryEvaluationReadinessReceiptV1 } from "./foundry-job-offline-training-finalization";
import { TearFoundryOfflineTrainingLaunchVault } from "./foundry-job-offline-training";
import { parseTearFoundryJob, transitionTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import { TearOfflineRlTrainingVault, TearOfflineRlTrajectoryVault } from "./offline-rl-training";
import { createTearOnlineRlCurriculumPlan, parseTearOnlineRlCurriculumPlan, type TearOnlineRlCurriculumPlanV1 } from "./online-rl-curriculum";
import { advanceTearOnlineRlCheckpoint, createTearOnlineRlCheckpoint, TearOnlineRlCheckpointVault, TearOnlineRlTrainingVault, type TearOnlineRlAdvanceControl, type TearOnlineRlCheckpointV1, type TearOnlineRlTrainingConfigV1 } from "./online-rl-training";

const KEY = "foundry-job-online-training-launch:v1:";
const HASH = /^[a-f0-9]{16}$/u;
export interface TearFoundryOnlineTrainingRequestV1 { readonly curriculum: Omit<TearOnlineRlCurriculumPlanV1, "format" | "schemaVersion" | "planHash" | "offline" | "actionVocabulary">; readonly config: TearOnlineRlTrainingConfigV1; }
export interface TearFoundryOnlineTrainingLaunchV1 { readonly format: "tear-foundry-online-training-launch"; readonly schemaVersion: 1; readonly jobHash: string; readonly readinessReceiptHash: string; readonly offlineTrainingHash: string; readonly curriculum: TearOnlineRlCurriculumPlanV1; readonly config: TearOnlineRlTrainingConfigV1; readonly checkpointHash: string; readonly previousLaunchHash?: string; readonly launchHash: string; }
export interface TearFoundryOnlineTrainingExecutionReceiptV1 { readonly format: "tear-foundry-online-training-execution"; readonly schemaVersion: 1; readonly job: Readonly<{ sourceJobHash: string; resultJobHash: string }>; readonly launchHash: string; readonly nextLaunchHash: string; readonly checkpointHash: string; readonly status: TearOnlineRlCheckpointV1["status"]; readonly executedAt: string; readonly receiptHash: string; }
export interface TearFoundryPairedEvaluationReadinessReceiptV1 { readonly format: "tear-foundry-paired-evaluation-readiness"; readonly schemaVersion: 1; readonly job: Readonly<{ sourceJobHash: string; resultJobHash: string }>; readonly launchHash: string; readonly checkpointHash: string; readonly onlineResultHash: string; readonly evaluationPlanHash: string; readonly disposition: "ready" | "online-training-stopped"; readonly finalizedAt: string; readonly receiptHash: string; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function exact(expected: readonly string[], actual: readonly string[]): boolean { return expected.length === actual.length && new Set(actual).size === actual.length && actual.every((value) => expected.includes(value)); }
function freeze(draft: Omit<TearFoundryOnlineTrainingLaunchV1, "launchHash">): TearFoundryOnlineTrainingLaunchV1 { const curriculum = parseTearOnlineRlCurriculumPlan(draft.curriculum); if (!hash(draft.jobHash) || !hash(draft.readinessReceiptHash) || !hash(draft.offlineTrainingHash) || !hash(draft.checkpointHash) || (draft.previousLaunchHash !== undefined && !hash(draft.previousLaunchHash))) throw new TypeError("invalid Foundry online training launch"); const value = Object.freeze({ ...draft, curriculum, config: Object.freeze({ ...draft.config }) }); return Object.freeze({ ...value, launchHash: stableVerificationHash(value) }); }
export function parseTearFoundryOnlineTrainingLaunch(value: unknown): TearFoundryOnlineTrainingLaunchV1 { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid Foundry online training launch"); const typed = value as TearFoundryOnlineTrainingLaunchV1, { launchHash, ...draft } = typed, parsed = freeze(draft); if (!hash(launchHash) || launchHash !== parsed.launchHash) throw new TypeError("Foundry online training launch integrity mismatch"); return parsed; }

/** Binds a completed C34 result to one persisted, still-unrun C30 online-Q checkpoint; it does not evaluate or publish a policy. */
export class TearFoundryOnlineTrainingLaunchExecutor {
  readonly #jobs: TearFoundryJobVault; readonly #custody: TearAcademyCandidateCustodyStore; readonly #corpus: TearAcademyCorpusStore; readonly #loader: TearAcademyTrainingDatasetLoader;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore, corpus: TearAcademyCorpusStore, loader: TearAcademyTrainingDatasetLoader) { if (jobs.backend() !== custody.backend() || jobs.backend() !== corpus.backend()) throw new TypeError("Foundry online training must share the C31 Vault boundary"); this.#jobs = jobs; this.#custody = custody; this.#corpus = corpus; this.#loader = loader; }
  async launch(jobInput: TearFoundryJobV1, readinessInput: TearFoundryEvaluationReadinessReceiptV1, request: TearFoundryOnlineTrainingRequestV1, at: string): Promise<Readonly<{ launch: TearFoundryOnlineTrainingLaunchV1; checkpoint: TearOnlineRlCheckpointV1 }>> {
    const job = parseTearFoundryJob(jobInput), readiness = parseTearFoundryEvaluationReadinessReceipt(readinessInput), backend = this.#jobs.backend();
    if (job.phase !== "evaluating" || readiness.disposition !== "evaluation-ready" || readiness.job.id !== job.id || readiness.job.resultJobHash !== job.jobHash || !Number.isFinite(Date.parse(at))) throw new RangeError("Foundry online training requires exact evaluation readiness");
    if ((await this.#jobs.get(job.id))?.jobHash !== job.jobHash) throw new RangeError("Foundry online training current job changed");
    const offlineLaunch = await new TearFoundryOfflineTrainingLaunchVault(backend).get(readiness.launchHash), training = await new TearOfflineRlTrainingVault(backend).get(readiness.trainingHash);
    if (offlineLaunch === undefined || training?.disposition !== "completed" || training.model === undefined || training.trainingHash !== readiness.trainingHash || training.checkpoint.checkpointHash !== readiness.checkpointHash || training.receipt.receiptHash !== readiness.receiptHash || offlineLaunch.job.resultJobHash !== readiness.job.sourceJobHash) throw new RangeError("Foundry online training completed lineage is unavailable");
    const [manifest, held, dataset, receipt] = await Promise.all([this.#corpus.getManifest(offlineLaunch.manifest.id, { kind: "trainer", id: offlineLaunch.manifest.trainerId }, offlineLaunch.manifest.version), this.#custody.held(at), this.#loader.load({ manifestId: offlineLaunch.manifest.id, trainerId: offlineLaunch.manifest.trainerId, version: offlineLaunch.manifest.version }), new TearOfflineRlTrajectoryVault(backend).get(offlineLaunch.receiptHash)]);
    if (manifest?.manifestHash !== offlineLaunch.manifest.manifestHash || manifest.rootHash !== offlineLaunch.manifest.rootHash || dataset.datasetHash !== offlineLaunch.datasetHash || !exact(job.inputs.corpusRecordHashes, manifest.entries.map((entry) => entry.custodyRecordHash)) || !job.inputs.corpusRecordHashes.every((entry) => held.some((record) => record.recordHash === entry))) throw new RangeError("Foundry online training custody or dataset changed");
    if (receipt?.receiptHash !== readiness.receiptHash || receipt.plan.planHash !== offlineLaunch.plan.planHash || receipt.plan.rewardHash !== offlineLaunch.plan.reward.rewardHash) throw new RangeError("Foundry online training receipt changed");
    const curriculum = createTearOnlineRlCurriculumPlan(dataset, offlineLaunch.plan, receipt, { ...request.curriculum, trainingHash: training.trainingHash }), checkpoint = createTearOnlineRlCheckpoint(curriculum, offlineLaunch.plan, receipt, training, request.config);
    const launch = freeze({ format: "tear-foundry-online-training-launch", schemaVersion: 1, jobHash: job.jobHash, readinessReceiptHash: readiness.receiptHashValue, offlineTrainingHash: training.trainingHash, curriculum, config: request.config, checkpointHash: checkpoint.checkpointHash });
    await new TearOnlineRlCheckpointVault(backend).persist(checkpoint);
    const key = `${KEY}${launch.launchHash}`, existing = await backend.get("analysis", key);
    if (existing !== undefined) return Object.freeze({ launch: parseTearFoundryOnlineTrainingLaunch(JSON.parse(existing)), checkpoint });
    await backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(launch) }, { store: "indexes", key: `foundry-job-online-training:${job.id}:${launch.launchHash}`, value: JSON.stringify(Object.freeze({ checkpointHash: checkpoint.checkpointHash, curriculumPlanHash: curriculum.planHash })) }]));
    return Object.freeze({ launch, checkpoint });
  }
}

/** Runs one exact persisted online-Q continuation through C30 and retains its bounded stop state without evaluating a candidate. */
export class TearFoundryOnlineTrainingExecutionExecutor {
  readonly #jobs: TearFoundryJobVault; readonly #custody: TearAcademyCandidateCustodyStore; readonly #corpus: TearAcademyCorpusStore; readonly #loader: TearAcademyTrainingDatasetLoader;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore, corpus: TearAcademyCorpusStore, loader: TearAcademyTrainingDatasetLoader) { if (jobs.backend() !== custody.backend() || jobs.backend() !== corpus.backend()) throw new TypeError("Foundry online execution must share the C31 Vault boundary"); this.#jobs = jobs; this.#custody = custody; this.#corpus = corpus; this.#loader = loader; }
  async execute(jobInput: TearFoundryJobV1, readinessInput: TearFoundryEvaluationReadinessReceiptV1, launchHash: string, executedAt: string, control: TearOnlineRlAdvanceControl = {}): Promise<Readonly<{ job: TearFoundryJobV1; launch: TearFoundryOnlineTrainingLaunchV1; receipt: TearFoundryOnlineTrainingExecutionReceiptV1 }>> {
    const job = parseTearFoundryJob(jobInput), readiness = parseTearFoundryEvaluationReadinessReceipt(readinessInput), backend = this.#jobs.backend();
    if (job.phase !== "evaluating" || !hash(launchHash) || !Number.isFinite(Date.parse(executedAt))) throw new RangeError("Foundry online execution requires exact evaluating readiness");
    const raw = await backend.get("analysis", `${KEY}${launchHash}`), launch = raw === undefined ? undefined : parseTearFoundryOnlineTrainingLaunch(JSON.parse(raw));
    if (launch?.jobHash !== job.jobHash || launch.readinessReceiptHash !== readiness.receiptHashValue || launch.offlineTrainingHash !== readiness.trainingHash || (await this.#jobs.get(job.id))?.jobHash !== job.jobHash) throw new RangeError("Foundry online execution launch lineage is unavailable");
    const offlineLaunch = await new TearFoundryOfflineTrainingLaunchVault(backend).get(readiness.launchHash), training = await new TearOfflineRlTrainingVault(backend).get(readiness.trainingHash);
    if (offlineLaunch === undefined || training?.disposition !== "completed" || training.trainingHash !== launch.offlineTrainingHash || training.model === undefined) throw new RangeError("Foundry online execution offline lineage changed");
    const [manifest, held, dataset, sourceReceipt, checkpoint] = await Promise.all([this.#corpus.getManifest(offlineLaunch.manifest.id, { kind: "trainer", id: offlineLaunch.manifest.trainerId }, offlineLaunch.manifest.version), this.#custody.held(executedAt), this.#loader.load({ manifestId: offlineLaunch.manifest.id, trainerId: offlineLaunch.manifest.trainerId, version: offlineLaunch.manifest.version }), new TearOfflineRlTrajectoryVault(backend).get(offlineLaunch.receiptHash), new TearOnlineRlCheckpointVault(backend).get(launch.checkpointHash)]);
    if (manifest?.manifestHash !== offlineLaunch.manifest.manifestHash || dataset.datasetHash !== offlineLaunch.datasetHash || !exact(job.inputs.corpusRecordHashes, manifest.entries.map((entry) => entry.custodyRecordHash)) || !job.inputs.corpusRecordHashes.every((entry) => held.some((record) => record.recordHash === entry)) || sourceReceipt === undefined || checkpoint === undefined || sourceReceipt.receiptHash !== readiness.receiptHash) throw new RangeError("Foundry online execution custody or source lineage changed");
    const advanced = await advanceTearOnlineRlCheckpoint(backend, launch.curriculum, offlineLaunch.plan, sourceReceipt, training, launch.config, checkpoint, control), next = transitionTearFoundryJob(job, "evaluating", executedAt, `one bounded C30 online-Q advance: ${advanced.status}`), { launchHash: ignoredLaunchHash, ...launchDraft } = launch, nextLaunch = freeze({ ...launchDraft, jobHash: next.jobHash, checkpointHash: advanced.checkpointHash, previousLaunchHash: launch.launchHash });
    void ignoredLaunchHash;
    const receiptDraft = { format: "tear-foundry-online-training-execution" as const, schemaVersion: 1 as const, job: Object.freeze({ sourceJobHash: job.jobHash, resultJobHash: next.jobHash }), launchHash, nextLaunchHash: nextLaunch.launchHash, checkpointHash: advanced.checkpointHash, status: advanced.status, executedAt };
    const receipt = Object.freeze({ ...receiptDraft, receiptHash: stableVerificationHash(receiptDraft) });
    await new TearOnlineRlCheckpointVault(backend).persist(advanced);
    await this.#jobs.persistSuccessor(job, next, Object.freeze([{ store: "analysis", key: `${KEY}${nextLaunch.launchHash}`, value: JSON.stringify(nextLaunch) }, { store: "analysis", key: `foundry-job-online-training-execution:v1:${receipt.receiptHash}`, value: JSON.stringify(receipt) }, { store: "indexes", key: `foundry-job-online-training-execution:${job.id}:${receipt.receiptHash}`, value: JSON.stringify(Object.freeze({ status: advanced.status, checkpointHash: advanced.checkpointHash })) }]));
    return Object.freeze({ job: next, launch: nextLaunch, receipt });
  }
}

/** Finalizes a retained online checkpoint into non-promotional paired-evaluation readiness only. */
export class TearFoundryOnlineTrainingFinalizationExecutor {
  readonly #jobs: TearFoundryJobVault;
  constructor(jobs: TearFoundryJobVault) { this.#jobs = jobs; }
  async finalize(jobInput: TearFoundryJobV1, readinessInput: TearFoundryEvaluationReadinessReceiptV1, launchHash: string, finalizedAt: string): Promise<Readonly<{ job: TearFoundryJobV1; receipt: TearFoundryPairedEvaluationReadinessReceiptV1 }>> {
    const job = parseTearFoundryJob(jobInput), readiness = parseTearFoundryEvaluationReadinessReceipt(readinessInput), backend = this.#jobs.backend();
    if (job.phase !== "evaluating" || !hash(launchHash) || !Number.isFinite(Date.parse(finalizedAt)) || (await this.#jobs.get(job.id))?.jobHash !== job.jobHash) throw new RangeError("Foundry online finalization requires exact evaluating readiness");
    const raw = await backend.get("analysis", `${KEY}${launchHash}`), launch = raw === undefined ? undefined : parseTearFoundryOnlineTrainingLaunch(JSON.parse(raw));
    if (launch?.jobHash !== job.jobHash || launch.readinessReceiptHash !== readiness.receiptHashValue || launch.offlineTrainingHash !== readiness.trainingHash) throw new RangeError("Foundry online finalization lineage is unavailable");
    const checkpoint = await new TearOnlineRlCheckpointVault(backend).get(launch.checkpointHash);
    if (checkpoint?.input.curriculumPlanHash !== launch.curriculum.planHash || checkpoint.input.trainingHash !== readiness.trainingHash || checkpoint.status === "running") throw new RangeError("Foundry online checkpoint is incomplete or changed");
    const result = await new TearOnlineRlTrainingVault(backend).persist(checkpoint), ready = checkpoint.status === "complete", next = transitionTearFoundryJob(job, ready ? "evaluating" : "rejected", finalizedAt, ready ? "online C30 checkpoint is paired-evaluation-ready" : `online C30 checkpoint stopped: ${checkpoint.status}`);
    const draft = { format: "tear-foundry-paired-evaluation-readiness" as const, schemaVersion: 1 as const, job: Object.freeze({ sourceJobHash: job.jobHash, resultJobHash: next.jobHash }), launchHash, checkpointHash: checkpoint.checkpointHash, onlineResultHash: result.resultHash, evaluationPlanHash: job.inputs.evaluationPlanHash, disposition: ready ? "ready" as const : "online-training-stopped" as const, finalizedAt };
    const receipt = Object.freeze({ ...draft, receiptHash: stableVerificationHash(draft) });
    await this.#jobs.persistSuccessor(job, next, Object.freeze([{ store: "analysis", key: `foundry-job-paired-evaluation-ready:v1:${receipt.receiptHash}`, value: JSON.stringify(receipt) }, { store: "indexes", key: `foundry-job-paired-evaluation-ready:${job.id}:${receipt.receiptHash}`, value: JSON.stringify(Object.freeze({ disposition: receipt.disposition, checkpointHash: checkpoint.checkpointHash })) }]));
    return Object.freeze({ job: next, receipt });
  }
}

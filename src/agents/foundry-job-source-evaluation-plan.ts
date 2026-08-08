import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCorpusStore } from "./academy-corpus";
import type { TearAcademyTrainingDatasetLoader } from "./academy-training-dataset";
import { parseTearFoundryEvaluationReadinessReceipt, type TearFoundryEvaluationReadinessReceiptV1 } from "./foundry-job-offline-training-finalization";
import { TearFoundryOfflineTrainingLaunchVault } from "./foundry-job-offline-training";
import { parseTearFoundryOnlineTrainingLaunch, parseTearFoundryPairedEvaluationReadinessReceipt, type TearFoundryPairedEvaluationReadinessReceiptV1 } from "./foundry-job-online-training-launch";
import { parseTearFoundryJob, requireTearFoundryEvaluationProtocol, type TearFoundryJobV1 } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import { TearOfflineRlTrainingVault, TearOfflineRlTrajectoryVault } from "./offline-rl-training";
import { TearOnlineRlCheckpointVault, TearOnlineRlTrainingVault } from "./online-rl-training";
import { createTearOnlineRlSourceEvaluationPlan, parseTearOnlineRlSourceEvaluationPlan, type TearOnlineRlSourceEvaluationPlanV1 } from "./online-rl-source-evaluation";

const KEY = "foundry-job-source-evaluation-plan:v1:";
const HASH = /^[a-f0-9]{16}$/u;
export interface TearFoundrySourceEvaluationPlanReceiptV1 {
  readonly format: "tear-foundry-source-evaluation-plan-receipt";
  readonly schemaVersion: 1;
  readonly job: Readonly<{ id: string; jobHash: string }>;
  readonly protocolHash: string;
  readonly pairedReadinessHash: string;
  readonly planHash: string;
  readonly derivedAt: string;
  readonly receiptHash: string;
}
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function time(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value)); }
function exact(expected: readonly string[], actual: readonly string[]): boolean { return expected.length === actual.length && new Set(actual).size === actual.length && actual.every((value) => expected.includes(value)); }
function receipt(draft: Omit<TearFoundrySourceEvaluationPlanReceiptV1, "receiptHash">): TearFoundrySourceEvaluationPlanReceiptV1 {
  if (!time(draft.derivedAt) || !draft.job.id.trim() || ![draft.job.jobHash, draft.protocolHash, draft.pairedReadinessHash, draft.planHash].every(hash)) throw new TypeError("invalid Foundry source-evaluation plan receipt");
  const value = Object.freeze({ ...draft, job: Object.freeze({ ...draft.job }) }); return Object.freeze({ ...value, receiptHash: stableVerificationHash(value) });
}

/**
 * Derives (but deliberately does not execute) one C34 paired source-evaluation
 * plan. V2 freezes the pre-challenger protocol at job creation; this bridge
 * adds the completed challenger lineage afterwards, so neither hash contains
 * itself and historical V1 jobs cannot claim an unrecoverable protocol.
 */
export class TearFoundrySourceEvaluationPlanExecutor {
  readonly #jobs: TearFoundryJobVault; readonly #custody: TearAcademyCandidateCustodyStore; readonly #corpus: TearAcademyCorpusStore; readonly #loader: TearAcademyTrainingDatasetLoader;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore, corpus: TearAcademyCorpusStore, loader: TearAcademyTrainingDatasetLoader) {
    if (jobs.backend() !== custody.backend() || jobs.backend() !== corpus.backend()) throw new TypeError("Foundry source evaluation must share the C31 Vault boundary");
    this.#jobs = jobs; this.#custody = custody; this.#corpus = corpus; this.#loader = loader;
  }
  async derive(jobInput: TearFoundryJobV1, readinessInput: TearFoundryEvaluationReadinessReceiptV1, pairedInput: TearFoundryPairedEvaluationReadinessReceiptV1, derivedAt: string): Promise<Readonly<{ plan: TearOnlineRlSourceEvaluationPlanV1; receipt: TearFoundrySourceEvaluationPlanReceiptV1 }>> {
    const job = parseTearFoundryJob(jobInput), protocol = requireTearFoundryEvaluationProtocol(job), readiness = parseTearFoundryEvaluationReadinessReceipt(readinessInput), paired = parseTearFoundryPairedEvaluationReadinessReceipt(pairedInput), backend = this.#jobs.backend();
    if (job.phase !== "evaluating" || paired.disposition !== "ready" || !time(derivedAt) || readiness.job.id !== job.id || paired.job.resultJobHash !== job.jobHash || (await this.#jobs.get(job.id))?.jobHash !== job.jobHash) throw new RangeError("Foundry source evaluation requires the exact current V2 ready job");
    const rawLaunch = await backend.get("analysis", `foundry-job-online-training-launch:v1:${paired.launchHash}`), launch = rawLaunch === undefined ? undefined : parseTearFoundryOnlineTrainingLaunch(JSON.parse(rawLaunch));
    if (launch?.jobHash !== paired.job.sourceJobHash || launch.readinessReceiptHash !== readiness.receiptHashValue || launch.offlineTrainingHash !== readiness.trainingHash || launch.checkpointHash !== paired.checkpointHash) throw new RangeError("Foundry source evaluation online lineage changed");
    const [offlineLaunch, baseline, online] = await Promise.all([new TearFoundryOfflineTrainingLaunchVault(backend).get(readiness.launchHash), new TearOfflineRlTrainingVault(backend).get(readiness.trainingHash), new TearOnlineRlCheckpointVault(backend).get(paired.checkpointHash)]);
    if (offlineLaunch === undefined || baseline === undefined || online === undefined) throw new RangeError("Foundry source evaluation completed model lineage is unavailable");
    if (baseline.disposition !== "completed" || baseline.model === undefined || online.status !== "complete") throw new RangeError("Foundry source evaluation completed model lineage is unavailable");
    const onlineResult = await new TearOnlineRlTrainingVault(backend).persist(online);
    if (onlineResult.checkpointHash !== online.checkpointHash || onlineResult.resultHash !== paired.onlineResultHash) throw new RangeError("Foundry source evaluation completed model lineage is unavailable");
    const [manifest, held, dataset, trajectory] = await Promise.all([this.#corpus.getManifest(offlineLaunch.manifest.id, { kind: "trainer", id: offlineLaunch.manifest.trainerId }, offlineLaunch.manifest.version), this.#custody.held(derivedAt), this.#loader.load({ manifestId: offlineLaunch.manifest.id, trainerId: offlineLaunch.manifest.trainerId, version: offlineLaunch.manifest.version }), new TearOfflineRlTrajectoryVault(backend).get(offlineLaunch.receiptHash)]);
    if (manifest === undefined || trajectory === undefined) throw new RangeError("Foundry source evaluation custody or dataset changed");
    if (manifest.manifestHash !== offlineLaunch.manifest.manifestHash || manifest.rootHash !== offlineLaunch.manifest.rootHash || dataset.datasetHash !== offlineLaunch.datasetHash || trajectory.receiptHash !== readiness.receiptHash || !exact(job.inputs.corpusRecordHashes, manifest.entries.map((entry) => entry.custodyRecordHash)) || !job.inputs.corpusRecordHashes.every((entry) => held.some((record) => record.recordHash === entry))) throw new RangeError("Foundry source evaluation custody or dataset changed");
    const plan = createTearOnlineRlSourceEvaluationPlan(launch.curriculum, offlineLaunch.plan, trajectory, baseline, online, { id: protocol.id, thresholds: protocol.thresholds });
    const output = receipt({ format: "tear-foundry-source-evaluation-plan-receipt", schemaVersion: 1, job: { id: job.id, jobHash: job.jobHash }, protocolHash: protocol.protocolHash, pairedReadinessHash: paired.receiptHash, planHash: plan.planHash, derivedAt });
    const existing = await backend.get("analysis", `${KEY}${output.receiptHash}`);
    if (existing !== undefined) return Object.freeze({ plan: parseTearOnlineRlSourceEvaluationPlan(JSON.parse((await backend.get("analysis", `${KEY}plan:${plan.planHash}`)) ?? "null")), receipt: output });
    await backend.commit(Object.freeze([{ store: "analysis", key: `${KEY}${output.receiptHash}`, value: JSON.stringify(output) }, { store: "analysis", key: `${KEY}plan:${plan.planHash}`, value: JSON.stringify(plan) }, { store: "indexes", key: `foundry-job-source-evaluation-plan:${job.id}:${output.receiptHash}`, value: JSON.stringify(Object.freeze({ jobHash: job.jobHash, protocolHash: protocol.protocolHash, planHash: plan.planHash, promotional: false })) }]));
    return Object.freeze({ plan, receipt: output });
  }
}

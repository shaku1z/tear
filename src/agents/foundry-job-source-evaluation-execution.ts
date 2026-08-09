import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultWrite } from "../ghost/capsule-vault";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCorpusStore } from "./academy-corpus";
import type { TearAcademyTrainingDatasetLoader } from "./academy-training-dataset";
import { parseTearFoundryEvaluationReadinessReceipt, type TearFoundryEvaluationReadinessReceiptV1 } from "./foundry-job-offline-training-finalization";
import { TearFoundryOfflineTrainingLaunchVault } from "./foundry-job-offline-training";
import { parseTearFoundryOnlineTrainingLaunch, parseTearFoundryPairedEvaluationReadinessReceipt, type TearFoundryPairedEvaluationReadinessReceiptV1 } from "./foundry-job-online-training-launch";
import { parseTearFoundryJob, requireTearFoundryEvaluationProtocol, transitionTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import { TearOfflineRlTrainingVault, TearOfflineRlTrajectoryVault } from "./offline-rl-training";
import { TearOnlineRlCheckpointVault } from "./online-rl-training";
import { parseTearOnlineRlSourceEvaluationPlan, TearOnlineRlSourceEvaluationExecutor, type TearOnlineRlSourceEvaluationResultV1 } from "./online-rl-source-evaluation";
import type { TearFoundrySourceEvaluationPlanReceiptV1 } from "./foundry-job-source-evaluation-plan";

const KEY = "foundry-job-source-evaluation:v1:";
const PLAN_KEY = "foundry-job-source-evaluation-plan:v1:plan:";
const HASH = /^[a-f0-9]{16}$/u;
export interface TearFoundrySourceEvaluationReceiptV1 {
  readonly format: "tear-foundry-source-evaluation-receipt"; readonly schemaVersion: 1;
  readonly job: Readonly<{ sourceJobHash: string; resultJobHash: string }>;
  readonly planReceiptHash: string; readonly planHash: string; readonly resultHash?: string;
  readonly disposition: "executed" | "rejected"; readonly executedAt: string; readonly receiptHash: string;
}
export interface TearFoundrySourceEvaluationContinuationV1 {
  readonly guards: (output: Readonly<{ job: TearFoundryJobV1; receipt: TearFoundrySourceEvaluationReceiptV1; result: TearOnlineRlSourceEvaluationResultV1 }>) => readonly Readonly<{ store: "analysis"; key: string; expected?: string }>[];
  readonly writes: (output: Readonly<{ job: TearFoundryJobV1; receipt: TearFoundrySourceEvaluationReceiptV1; result: TearOnlineRlSourceEvaluationResultV1 }>) => readonly GhostVaultWrite[];
}
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function time(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value)); }
function exact(expected: readonly string[], actual: readonly string[]): boolean { return expected.length === actual.length && new Set(actual).size === actual.length && actual.every((value) => expected.includes(value)); }
export function parseTearFoundrySourceEvaluationPlanReceipt(value: unknown): TearFoundrySourceEvaluationPlanReceiptV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid Foundry source-evaluation plan receipt");
  const source = value as Record<string, unknown>, job = source.job;
  if (source.format !== "tear-foundry-source-evaluation-plan-receipt" || source.schemaVersion !== 1 || typeof job !== "object" || job === null || Array.isArray(job)) throw new TypeError("invalid Foundry source-evaluation plan receipt");
  const fields = job as Record<string, unknown>;
  if (typeof fields.id !== "string" || ![fields.jobHash, source.protocolHash, source.pairedReadinessHash, source.planHash, source.receiptHash].every(hash) || !time(source.derivedAt)) throw new TypeError("invalid Foundry source-evaluation plan receipt");
  const draft = { format: source.format, schemaVersion: source.schemaVersion, job: Object.freeze({ id: fields.id, jobHash: fields.jobHash }), protocolHash: source.protocolHash, pairedReadinessHash: source.pairedReadinessHash, planHash: source.planHash, derivedAt: source.derivedAt } as Omit<TearFoundrySourceEvaluationPlanReceiptV1, "receiptHash">;
  const parsed = Object.freeze({ ...draft, receiptHash: stableVerificationHash(draft) }); if (source.receiptHash !== parsed.receiptHash) throw new TypeError("Foundry source-evaluation plan receipt integrity mismatch"); return parsed;
}
function receipt(draft: Omit<TearFoundrySourceEvaluationReceiptV1, "receiptHash">): TearFoundrySourceEvaluationReceiptV1 {
  if (![draft.job.sourceJobHash, draft.job.resultJobHash, draft.planReceiptHash, draft.planHash].every(hash) || !time(draft.executedAt) || (draft.resultHash !== undefined && !hash(draft.resultHash))) throw new TypeError("invalid Foundry source-evaluation receipt");
  const value = Object.freeze({ ...draft, job: Object.freeze({ ...draft.job }) }); return Object.freeze({ ...value, receiptHash: stableVerificationHash(value) });
}
export function parseTearFoundrySourceEvaluationReceipt(value: unknown): TearFoundrySourceEvaluationReceiptV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid Foundry source-evaluation receipt");
  const typed = value as TearFoundrySourceEvaluationReceiptV1, { receiptHash, ...draft } = typed, parsed = receipt(draft);
  if (!hash(receiptHash) || receiptHash !== parsed.receiptHash) throw new TypeError("Foundry source-evaluation receipt integrity mismatch"); return parsed;
}

/** Executes one already-derived V2 plan and records factual custody only; no result metric becomes a Foundry decision. */
export class TearFoundrySourceEvaluationExecutionExecutor {
  readonly #jobs: TearFoundryJobVault; readonly #custody: TearAcademyCandidateCustodyStore; readonly #corpus: TearAcademyCorpusStore; readonly #loader: TearAcademyTrainingDatasetLoader;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore, corpus: TearAcademyCorpusStore, loader: TearAcademyTrainingDatasetLoader) { if (jobs.backend() !== custody.backend() || jobs.backend() !== corpus.backend()) throw new TypeError("Foundry source evaluation must share the C31 Vault boundary"); this.#jobs = jobs; this.#custody = custody; this.#corpus = corpus; this.#loader = loader; }
  async execute(jobInput: TearFoundryJobV1, readinessInput: TearFoundryEvaluationReadinessReceiptV1, pairedInput: TearFoundryPairedEvaluationReadinessReceiptV1, planReceiptInput: TearFoundrySourceEvaluationPlanReceiptV1, executedAt: string, continuation?: TearFoundrySourceEvaluationContinuationV1): Promise<Readonly<{ job: TearFoundryJobV1; receipt: TearFoundrySourceEvaluationReceiptV1 }>> {
    const job = parseTearFoundryJob(jobInput), backend = this.#jobs.backend();
    if (job.phase !== "evaluating" || !time(executedAt) || (await this.#jobs.get(job.id))?.jobHash !== job.jobHash) throw new RangeError("Foundry source evaluation requires the exact current evaluating job");
    let planReceipt: TearFoundrySourceEvaluationPlanReceiptV1 | undefined;
    try {
      const protocol = requireTearFoundryEvaluationProtocol(job), readiness = parseTearFoundryEvaluationReadinessReceipt(readinessInput), paired = parseTearFoundryPairedEvaluationReadinessReceipt(pairedInput), exactPlanReceipt = parseTearFoundrySourceEvaluationPlanReceipt(planReceiptInput); planReceipt = exactPlanReceipt;
      if (readiness.job.id !== job.id || paired.disposition !== "ready" || paired.job.resultJobHash !== job.jobHash || exactPlanReceipt.job.id !== job.id || exactPlanReceipt.job.jobHash !== job.jobHash || exactPlanReceipt.protocolHash !== protocol.protocolHash || exactPlanReceipt.pairedReadinessHash !== paired.receiptHash) throw new RangeError("Foundry source evaluation readiness changed");
      const rawPlan = await backend.get("analysis", `${PLAN_KEY}${exactPlanReceipt.planHash}`), rawLaunch = await backend.get("analysis", `foundry-job-online-training-launch:v1:${paired.launchHash}`);
      const plan = rawPlan === undefined ? undefined : parseTearOnlineRlSourceEvaluationPlan(JSON.parse(rawPlan)), launch = rawLaunch === undefined ? undefined : parseTearFoundryOnlineTrainingLaunch(JSON.parse(rawLaunch));
      if (plan?.planHash !== exactPlanReceipt.planHash || plan.id !== protocol.id || plan.lineage.challengerCheckpointHash !== paired.checkpointHash || launch?.jobHash !== paired.job.sourceJobHash || launch.readinessReceiptHash !== readiness.receiptHashValue || launch.curriculum.planHash !== plan.lineage.curriculumPlanHash) throw new RangeError("Foundry source evaluation plan or online lineage changed");
      const [offlineLaunch, baseline, online] = await Promise.all([new TearFoundryOfflineTrainingLaunchVault(backend).get(readiness.launchHash), new TearOfflineRlTrainingVault(backend).get(readiness.trainingHash), new TearOnlineRlCheckpointVault(backend).get(paired.checkpointHash)]);
      if (offlineLaunch === undefined || baseline === undefined || online === undefined || baseline.disposition !== "completed" || baseline.model === undefined || online.status !== "complete" || plan.lineage.offlinePlanHash !== offlineLaunch.plan.planHash || plan.lineage.baselineTrainingHash !== baseline.trainingHash || plan.lineage.challengerCheckpointHash !== online.checkpointHash) throw new RangeError("Foundry source evaluation model lineage changed");
      const [manifest, held, dataset, trajectory] = await Promise.all([this.#corpus.getManifest(offlineLaunch.manifest.id, { kind: "trainer", id: offlineLaunch.manifest.trainerId }, offlineLaunch.manifest.version), this.#custody.held(executedAt), this.#loader.load({ manifestId: offlineLaunch.manifest.id, trainerId: offlineLaunch.manifest.trainerId, version: offlineLaunch.manifest.version }), new TearOfflineRlTrajectoryVault(backend).get(offlineLaunch.receiptHash)]);
      if (manifest === undefined || trajectory === undefined || manifest.manifestHash !== offlineLaunch.manifest.manifestHash || manifest.rootHash !== offlineLaunch.manifest.rootHash || dataset.datasetHash !== offlineLaunch.datasetHash || trajectory.receiptHash !== readiness.receiptHash || plan.lineage.receiptHash !== trajectory.receiptHash || !exact(job.inputs.corpusRecordHashes, manifest.entries.map((entry) => entry.custodyRecordHash)) || !job.inputs.corpusRecordHashes.every((entry) => held.some((record) => record.recordHash === entry))) throw new RangeError("Foundry source evaluation custody or dataset changed");
      const next = transitionTearFoundryJob(job, "deciding", executedAt, "C34 paired source evaluation retained without a Foundry verdict"); let output: TearFoundrySourceEvaluationReceiptV1 | undefined;
      await new TearOnlineRlSourceEvaluationExecutor(backend).execute(plan, launch.curriculum, offlineLaunch.plan, trajectory, online, { commit: async (result) => {
        output = receipt({ format: "tear-foundry-source-evaluation-receipt", schemaVersion: 1, job: { sourceJobHash: job.jobHash, resultJobHash: next.jobHash }, planReceiptHash: exactPlanReceipt.receiptHash, planHash: plan.planHash, resultHash: result.resultHash, disposition: "executed", executedAt });
        const complete = Object.freeze({ job: next, receipt: output, result });
        const writes = Object.freeze([{ store: "analysis" as const, key: `online-rl-source-evaluation:v1:${result.resultHash}`, value: JSON.stringify(result) }, { store: "indexes" as const, key: `online-rl-source-evaluation:${result.planHash}:${result.resultHash}`, value: JSON.stringify({ passed: result.metrics.passed, promotional: false }) }, { store: "analysis" as const, key: `${KEY}${output.receiptHash}`, value: JSON.stringify(output) }, { store: "indexes" as const, key: `foundry-job-source-evaluation:${job.id}:${output.receiptHash}`, value: JSON.stringify(Object.freeze({ planHash: plan.planHash, resultHash: result.resultHash, disposition: output.disposition, promotional: false })) }, ...(continuation?.writes(complete) ?? [])]);
        await this.#jobs.persistSuccessorIfMatches(job, next, Object.freeze([...(continuation?.guards(complete) ?? [])]), writes);
      } });
      if (output === undefined) throw new Error("Foundry source evaluation continuation disappeared"); return Object.freeze({ job: next, receipt: output });
    } catch (error) {
      if (continuation !== undefined) throw error;
      const current = await this.#jobs.get(job.id); if (current?.jobHash !== job.jobHash) throw error;
      const planReceiptHash = planReceipt?.receiptHash, planHash = planReceipt?.planHash;
      const next = transitionTearFoundryJob(job, "rejected", executedAt, "source evaluation refused due to invalid or failed governed lineage"), output = receipt({ format: "tear-foundry-source-evaluation-receipt", schemaVersion: 1, job: { sourceJobHash: job.jobHash, resultJobHash: next.jobHash }, planReceiptHash: hash(planReceiptHash) ? planReceiptHash : "0000000000000000", planHash: hash(planHash) ? planHash : "0000000000000000", disposition: "rejected", executedAt });
      await this.#jobs.persistSuccessor(job, next, Object.freeze([{ store: "analysis", key: `${KEY}${output.receiptHash}`, value: JSON.stringify(output) }])); return Object.freeze({ job: next, receipt: output });
    }
  }
}

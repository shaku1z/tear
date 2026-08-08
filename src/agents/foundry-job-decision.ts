import { stableVerificationHash } from "../replay/hash";
import { parseTearFoundrySourceEvaluationReceipt } from "./foundry-job-source-evaluation-execution";
import { parseTearFoundryJob, requireTearFoundryEvaluationProtocol, transitionTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import { parseTearOnlineRlSourceEvaluationPlan, parseTearOnlineRlSourceEvaluationResult } from "./online-rl-source-evaluation";

const REPORT_KEY = "foundry-job-source-evaluation:v1:";
const PLAN_KEY = "foundry-job-source-evaluation-plan:v1:plan:";
const RESULT_KEY = "online-rl-source-evaluation:v1:";
const HASH = /^[a-f0-9]{16}$/u;
export interface TearFoundryDecisionReceiptV1 { readonly format: "tear-foundry-decision-receipt"; readonly schemaVersion: 1; readonly job: Readonly<{ sourceJobHash: string; resultJobHash: string }>; readonly evaluationReceiptHash: string; readonly evaluationResultHash: string; readonly disposition: "monitoring-ready" | "rejected"; readonly decidedAt: string; readonly receiptHash: string; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function time(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value)); }
function receipt(draft: Omit<TearFoundryDecisionReceiptV1, "receiptHash">): TearFoundryDecisionReceiptV1 { if (![draft.job.sourceJobHash, draft.job.resultJobHash, draft.evaluationReceiptHash, draft.evaluationResultHash].every(hash) || !time(draft.decidedAt)) throw new TypeError("invalid Foundry decision receipt"); const value = Object.freeze({ ...draft, job: Object.freeze({ ...draft.job }) }); return Object.freeze({ ...value, receiptHash: stableVerificationHash(value) }); }
export function parseTearFoundryDecisionReceipt(value: unknown): TearFoundryDecisionReceiptV1 { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid Foundry decision receipt"); const typed = value as TearFoundryDecisionReceiptV1, { receiptHash, ...draft } = typed, parsed = receipt(draft); if (!hash(receiptHash) || receiptHash !== parsed.receiptHash) throw new TypeError("Foundry decision receipt integrity mismatch"); return parsed; }

/** Applies only the V2 protocol's already-frozen C34 pass/fail result. It never creates or promotes a policy. */
export class TearFoundryDecisionExecutor {
  readonly #jobs: TearFoundryJobVault; constructor(jobs: TearFoundryJobVault) { this.#jobs = jobs; }
  async decide(jobInput: TearFoundryJobV1, evaluationReceiptHash: string, decidedAt: string): Promise<Readonly<{ job: TearFoundryJobV1; receipt: TearFoundryDecisionReceiptV1 }>> {
    const job = parseTearFoundryJob(jobInput), protocol = requireTearFoundryEvaluationProtocol(job), backend = this.#jobs.backend();
    if (job.phase !== "deciding" || !hash(evaluationReceiptHash) || !time(decidedAt) || (await this.#jobs.get(job.id))?.jobHash !== job.jobHash) throw new RangeError("Foundry decision requires the exact current deciding V2 job");
    const rawReceipt = await backend.get("analysis", `${REPORT_KEY}${evaluationReceiptHash}`), report = rawReceipt === undefined ? undefined : parseTearFoundrySourceEvaluationReceipt(JSON.parse(rawReceipt));
    if (report?.disposition !== "executed" || report.job.resultJobHash !== job.jobHash || report.resultHash === undefined) throw new RangeError("Foundry decision evaluation receipt changed");
    const [rawPlan, rawResult] = await Promise.all([backend.get("analysis", `${PLAN_KEY}${report.planHash}`), backend.get("analysis", `${RESULT_KEY}${report.resultHash}`)]);
    const plan = rawPlan === undefined ? undefined : parseTearOnlineRlSourceEvaluationPlan(JSON.parse(rawPlan)), result = rawResult === undefined ? undefined : parseTearOnlineRlSourceEvaluationResult(JSON.parse(rawResult));
    if (plan === undefined || result === undefined || plan.id !== protocol.id || result.planHash !== plan.planHash || result.resultHash !== report.resultHash || result.challengerCheckpointHash !== plan.lineage.challengerCheckpointHash || result.baselineTrainingHash !== plan.lineage.baselineTrainingHash) throw new RangeError("Foundry decision result lineage changed");
    const passed = result.metrics.passed, next = transitionTearFoundryJob(job, passed ? "monitoring" : "rejected", decidedAt, passed ? "frozen C34 protocol passed; monitoring only, not promotion" : "frozen C34 protocol did not pass"), output = receipt({ format: "tear-foundry-decision-receipt", schemaVersion: 1, job: { sourceJobHash: job.jobHash, resultJobHash: next.jobHash }, evaluationReceiptHash, evaluationResultHash: result.resultHash, disposition: passed ? "monitoring-ready" : "rejected", decidedAt });
    await this.#jobs.persistSuccessor(job, next, Object.freeze([{ store: "analysis", key: `foundry-job-decision:v1:${output.receiptHash}`, value: JSON.stringify(output) }, { store: "indexes", key: `foundry-job-decision:${job.id}:${output.receiptHash}`, value: JSON.stringify(Object.freeze({ disposition: output.disposition, resultHash: result.resultHash, promotional: false })) }]));
    return Object.freeze({ job: next, receipt: output });
  }
}

import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import { parseTearFoundryDecisionReceipt } from "./foundry-job-decision";
import { parseTearFoundryJob, requireTearFoundryEvaluationProtocol, type TearFoundryJobV1 } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";

const HASH = /^[a-f0-9]{16}$/u;
export interface TearFoundryMonitoringEntryReceiptV1 { readonly format: "tear-foundry-monitoring-entry"; readonly schemaVersion: 1; readonly jobHash: string; readonly decisionReceiptHash: string; readonly evaluationResultHash: string; readonly stopConditionsHash: string; readonly observedAt: string; readonly health: "evidence-retained"; readonly receiptHash: string; }
function hash(v: unknown): v is string { return typeof v === "string" && HASH.test(v); }
function time(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0 && Number.isFinite(Date.parse(v)); }
function receipt(d: Omit<TearFoundryMonitoringEntryReceiptV1, "receiptHash">): TearFoundryMonitoringEntryReceiptV1 { if (![d.jobHash, d.decisionReceiptHash, d.evaluationResultHash, d.stopConditionsHash].every(hash) || !time(d.observedAt)) throw new TypeError("invalid Foundry monitoring entry"); const value = Object.freeze({ ...d }); return Object.freeze({ ...value, receiptHash: stableVerificationHash(value) }); }
/** Retains a verified monitoring entry only. It changes no traffic, runtime policy, cloud state, or schedule. */
export class TearFoundryMonitoringEntryExecutor {
  readonly #jobs: TearFoundryJobVault; readonly #custody: TearAcademyCandidateCustodyStore;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore) { if (jobs.backend() !== custody.backend()) throw new TypeError("Foundry monitoring must share C31 Vault custody"); this.#jobs = jobs; this.#custody = custody; }
  async enter(jobInput: TearFoundryJobV1, decisionReceiptHash: string, observedAt: string): Promise<TearFoundryMonitoringEntryReceiptV1> {
    const job = parseTearFoundryJob(jobInput), protocol = requireTearFoundryEvaluationProtocol(job), backend = this.#jobs.backend();
    if (job.phase !== "monitoring" || !hash(decisionReceiptHash) || !time(observedAt) || (await this.#jobs.get(job.id))?.jobHash !== job.jobHash) throw new RangeError("Foundry monitoring requires exact current V2 monitoring job");
    const raw = await backend.get("analysis", `foundry-job-decision:v1:${decisionReceiptHash}`), decision = raw === undefined ? undefined : parseTearFoundryDecisionReceipt(JSON.parse(raw)), held = await this.#custody.held(observedAt);
    if (decision?.disposition !== "monitoring-ready" || decision.job.resultJobHash !== job.jobHash || !job.inputs.corpusRecordHashes.every((entry) => held.some((record) => record.recordHash === entry))) throw new RangeError("Foundry monitoring lineage or custody changed");
    const output = receipt({ format: "tear-foundry-monitoring-entry", schemaVersion: 1, jobHash: job.jobHash, decisionReceiptHash, evaluationResultHash: decision.evaluationResultHash, stopConditionsHash: job.inputs.stopConditionsHash, observedAt, health: "evidence-retained" });
    const key = `foundry-job-monitoring-entry:v1:${output.receiptHash}`, existing = await backend.get("analysis", key); if (existing !== undefined) return JSON.parse(existing) as TearFoundryMonitoringEntryReceiptV1;
    await backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(output) }, { store: "indexes", key: `foundry-job-monitoring:${job.id}:${output.receiptHash}`, value: JSON.stringify(Object.freeze({ health: output.health, protocolHash: protocol.protocolHash, promotional: false })) }])); return output;
  }
}

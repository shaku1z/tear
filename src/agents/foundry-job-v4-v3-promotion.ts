import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import { parseTearFoundryJob } from "./foundry-job-state";
import type { TearFoundryJobScheduleV1 } from "./foundry-job-schedule";
import { parseTearFoundryV3PromotionApproval } from "./foundry-job-v3-promotion-approval";
import { parseTearFoundryV3PromotionReceipt, TearFoundryV3PromotionExecutor } from "./foundry-job-v3-promotion";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import { createTearFoundryExecutionBindingV4, parseTearFoundryExecutionBindingV4, type TearFoundryExecutionBindingV4 } from "./foundry-job-v4-offline-terminal";
import { parseTearFoundryV4V3MonitoringDeclaration } from "./foundry-job-v4-v3-monitoring-bridge";

const BINDING = "foundry-job-execution-binding:v4:", POINTER = "foundry-job-execution-binding-current:v4:";
const guard = (key: string, expected: string | undefined): Readonly<{ store: "analysis"; key: string; expected?: string }> => Object.freeze({ store: "analysis" as const, key, ...(expected === undefined ? {} : { expected }) });

/** Consumes only a frozen V4 approval head. Promotion and the terminal V4 head are one conditional transaction; the schedule remains disabled. */
export class TearFoundryV4V3PromotionExecutor {
  readonly #jobs: TearFoundryJobVault; readonly #custody: TearAcademyCandidateCustodyStore;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore) { if (jobs.backend() !== custody.backend()) throw new TypeError("Foundry V4 promotion must share C31 custody"); this.#jobs = jobs; this.#custody = custody; }
  async promote(schedule: TearFoundryJobScheduleV1, source: TearFoundryExecutionBindingV4, promotedAt: string): Promise<TearFoundryExecutionBindingV4> {
    if (source.payload.kind !== "v3-promotion-approval-ready" || source.job.phase !== "monitoring" || source.schedule.scheduleHash !== schedule.scheduleHash || schedule.state !== "disabled" || !Number.isFinite(Date.parse(promotedAt))) throw new RangeError("Foundry V4 promotion requires a disabled promotion approval head");
    const promotion = source.payload, backend = this.#jobs.backend(), scheduleKey = `foundry-job-schedule:v1:${schedule.id}`, jobKey = `foundry-job:v1:${source.job.id}`, sourceKey = `${BINDING}${source.bindingHash}`, pointerKey = `${POINTER}${schedule.id}:${String(schedule.revision)}:${schedule.scheduleHash}`, declarationKey = `foundry-job-v4-v3-monitoring-declaration:v1:${promotion.declarationHash}`, approvalKey = `foundry-job-v3-promotion-approval:v1:${promotion.approvalHash}`, receiptKey = `foundry-job-v3-promotion-receipt:v1:${promotion.approvalHash}`;
    const [scheduleRaw, jobRaw, sourceRaw, pointerRaw, declarationRaw, approvalRaw, receiptRaw] = await Promise.all([backend.get("analysis", scheduleKey), backend.get("analysis", jobKey), backend.get("analysis", sourceKey), backend.get("analysis", pointerKey), backend.get("analysis", declarationKey), backend.get("analysis", approvalKey), backend.get("analysis", receiptKey)]);
    if ([scheduleRaw, jobRaw, sourceRaw, declarationRaw].some((value) => value === undefined) || scheduleRaw !== JSON.stringify(schedule) || sourceRaw !== JSON.stringify(source)) throw new RangeError("Foundry V4 promotion authority changed");
    if (pointerRaw !== source.bindingHash) {
      const nextRaw = typeof pointerRaw === "string" ? await backend.get("analysis", `${BINDING}${pointerRaw}`) : undefined;
      try { const next = nextRaw === undefined ? undefined : parseTearFoundryExecutionBindingV4(JSON.parse(nextRaw)), receipt = receiptRaw === undefined ? undefined : parseTearFoundryV3PromotionReceipt(JSON.parse(receiptRaw)); if (next?.payload.kind === "v3-promotion-terminal" && next.payload.declarationHash === promotion.declarationHash && next.payload.approvalHash === promotion.approvalHash && next.payload.promotionReceiptHash === receipt?.receiptHash && receipt.promotedAt === promotedAt) return next; } catch { throw new RangeError("Foundry V4 promotion retry evidence is invalid"); }
      throw new RangeError("Foundry V4 promotion authority changed");
    }
    let declaration; let approval; let job;
    try { declaration = parseTearFoundryV4V3MonitoringDeclaration(JSON.parse(declarationRaw ?? "")); approval = approvalRaw === undefined ? undefined : parseTearFoundryV3PromotionApproval(JSON.parse(approvalRaw)); job = parseTearFoundryJob(JSON.parse(jobRaw ?? "")); } catch { throw new RangeError("Foundry V4 promotion declaration, approval, or job is invalid"); }
    if (approval === undefined || job.jobHash !== source.job.jobHash || job.phase !== "monitoring" || declaration.bridgeHash !== approval.bridge.bridgeHash || declaration.sourceBindingHash === source.bindingHash || approval.job.jobHash !== job.jobHash) throw new RangeError("Foundry V4 promotion declaration lineage changed");
    let terminal: TearFoundryExecutionBindingV4 | undefined;
    const result = await new TearFoundryV3PromotionExecutor(this.#jobs, this.#custody).promote(promotion.approvalHash, promotedAt, { guards: (receipt) => { terminal = createTearFoundryExecutionBindingV4({ schedule: source.schedule, job: source.job, payload: { kind: "v3-promotion-terminal", declarationHash: promotion.declarationHash, approvalHash: promotion.approvalHash, promotionReceiptHash: receipt.receiptHash } }); return Object.freeze([guard(scheduleKey, scheduleRaw), guard(jobKey, jobRaw), guard(sourceKey, sourceRaw), guard(pointerKey, source.bindingHash), guard(declarationKey, declarationRaw), guard(approvalKey, approvalRaw), guard(`${BINDING}${terminal.bindingHash}`, undefined), guard(pointerKey, source.bindingHash)]); }, writes: (receipt) => { if (terminal === undefined) throw new Error("Foundry V4 promotion continuation disappeared"); return Object.freeze([{ store: "analysis" as const, key: `${BINDING}${terminal.bindingHash}`, value: JSON.stringify(terminal) }, { store: "analysis" as const, key: pointerKey, value: terminal.bindingHash }, { store: "indexes" as const, key: `foundry-job-v4-v3-promotion:${source.job.id}:${receipt.receiptHash}`, value: JSON.stringify(Object.freeze({ declarationHash: promotion.declarationHash, approvalHash: promotion.approvalHash, promotionReceiptHash: receipt.receiptHash, scheduleState: "disabled" })) }]); } });
    if (terminal?.payload.kind !== "v3-promotion-terminal" || terminal.payload.promotionReceiptHash !== result.receiptHash) throw new Error("Foundry V4 promotion terminal was not retained");
    return terminal;
  }
}

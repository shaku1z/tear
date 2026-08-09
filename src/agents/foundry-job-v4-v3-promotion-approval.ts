import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import { TearFoundryV3PromotionApprovalExecutor } from "./foundry-job-v3-promotion-approval";
import type { TearFoundryJobScheduleV1 } from "./foundry-job-schedule";
import { parseTearFoundryJob } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import { createTearFoundryExecutionBindingV4, parseTearFoundryExecutionBindingV4, type TearFoundryExecutionBindingV4 } from "./foundry-job-v4-offline-terminal";
import { parseTearFoundryV4V3MonitoringDeclaration } from "./foundry-job-v4-v3-monitoring-bridge";

const BINDING = "foundry-job-execution-binding:v4:", POINTER = "foundry-job-execution-binding-current:v4:";
const guard = (key: string, expected: string | undefined): Readonly<{ store: "analysis"; key: string; expected?: string }> => Object.freeze({ store: "analysis" as const, key, ...(expected === undefined ? {} : { expected }) });

/** Turns one frozen, disabled V4 V3-monitoring declaration into a later promotion approval. It cannot promote, activate, or reopen the schedule. */
export class TearFoundryV4V3PromotionApprovalExecutor {
  readonly #jobs: TearFoundryJobVault; readonly #custody: TearAcademyCandidateCustodyStore;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore) { if (jobs.backend() !== custody.backend()) throw new TypeError("Foundry V4 promotion approval must share C31 custody"); this.#jobs = jobs; this.#custody = custody; }
  async approve(schedule: TearFoundryJobScheduleV1, source: TearFoundryExecutionBindingV4, approvedAt: string): Promise<TearFoundryExecutionBindingV4> {
    if (source.payload.kind !== "v3-monitoring-bridge-ready" || source.job.phase !== "monitoring" || source.schedule.scheduleHash !== schedule.scheduleHash || schedule.state !== "disabled" || !Number.isFinite(Date.parse(approvedAt))) throw new RangeError("Foundry V4 promotion approval requires a disabled V3 monitoring bridge");
    const declarationHash = source.payload.declarationHash, backend = this.#jobs.backend(), scheduleKey = `foundry-job-schedule:v1:${schedule.id}`, jobKey = `foundry-job:v1:${source.job.id}`, sourceKey = `${BINDING}${source.bindingHash}`, pointerKey = `${POINTER}${schedule.id}:${String(schedule.revision)}:${schedule.scheduleHash}`, declarationKey = `foundry-job-v4-v3-monitoring-declaration:v1:${declarationHash}`;
    const [scheduleRaw, jobRaw, sourceRaw, pointerRaw, declarationRaw] = await Promise.all([backend.get("analysis", scheduleKey), backend.get("analysis", jobKey), backend.get("analysis", sourceKey), backend.get("analysis", pointerKey), backend.get("analysis", declarationKey)]);
    if ([scheduleRaw, jobRaw, sourceRaw, declarationRaw].some((value) => value === undefined) || scheduleRaw !== JSON.stringify(schedule) || sourceRaw !== JSON.stringify(source)) throw new RangeError("Foundry V4 promotion approval authority changed");
    if (pointerRaw !== source.bindingHash) { const nextRaw = typeof pointerRaw === "string" ? await backend.get("analysis", `${BINDING}${pointerRaw}`) : undefined; try { const next = nextRaw === undefined ? undefined : parseTearFoundryExecutionBindingV4(JSON.parse(nextRaw)); if (next?.payload.kind === "v3-promotion-approval-ready" && next.payload.declarationHash === declarationHash) { const stored = await new TearFoundryV3PromotionApprovalExecutor(this.#jobs, this.#custody).get(next.payload.approvalHash); if (stored?.approvedAt === approvedAt) return next; } } catch { throw new RangeError("Foundry V4 promotion approval retry evidence is invalid"); } throw new RangeError("Foundry V4 promotion approval authority changed"); }
    let declaration; let job; try { declaration = parseTearFoundryV4V3MonitoringDeclaration(JSON.parse(declarationRaw ?? "")); job = parseTearFoundryJob(JSON.parse(jobRaw ?? "")); } catch { throw new RangeError("Foundry V4 promotion approval declaration or job is invalid"); }
    if (job.jobHash !== source.job.jobHash || job.phase !== "monitoring") throw new RangeError("Foundry V4 promotion approval job lineage changed");
    if (declaration.sourceBindingHash === source.bindingHash || declaration.bridgeHash.length !== 16) throw new RangeError("Foundry V4 promotion approval declaration lineage changed");
    let next: TearFoundryExecutionBindingV4 | undefined;
    const approval = await new TearFoundryV3PromotionApprovalExecutor(this.#jobs, this.#custody).approve(job, declaration.bridgeHash, approvedAt, { guards: (value) => { next = createTearFoundryExecutionBindingV4({ schedule: source.schedule, job: source.job, payload: { kind: "v3-promotion-approval-ready", declarationHash, approvalHash: value.approvalHash } }); return Object.freeze([guard(scheduleKey, scheduleRaw), guard(jobKey, jobRaw), guard(sourceKey, sourceRaw), guard(pointerKey, source.bindingHash), guard(declarationKey, declarationRaw), guard(`${BINDING}${next.bindingHash}`, undefined), guard(pointerKey, source.bindingHash)]); }, writes: (value) => { if (next === undefined) throw new Error("Foundry V4 approval continuation disappeared"); return Object.freeze([{ store: "analysis" as const, key: `${BINDING}${next.bindingHash}`, value: JSON.stringify(next) }, { store: "analysis" as const, key: pointerKey, value: next.bindingHash }, { store: "indexes" as const, key: `foundry-job-v4-v3-promotion-approval:${source.job.id}:${value.approvalHash}`, value: JSON.stringify(Object.freeze({ declarationHash, approvalHash: value.approvalHash, promotional: false })) }]); } });
    if (next?.payload.kind !== "v3-promotion-approval-ready" || next.payload.approvalHash !== approval.approvalHash) throw new Error("Foundry V4 approval continuation was not retained");
    return next;
  }
}

import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import { TearFoundryMonitoringEntryExecutor } from "./foundry-job-monitoring";
import { parseTearFoundryDecisionReceipt } from "./foundry-job-decision";
import { parseTearFoundryJob } from "./foundry-job-state";
import { setTearFoundryJobScheduleEnabled, type TearFoundryJobScheduleV1 } from "./foundry-job-schedule";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import { createTearFoundryExecutionBindingV4, type TearFoundryExecutionBindingV4 } from "./foundry-job-v4-offline-terminal";

const BINDING = "foundry-job-execution-binding:v4:";
const POINTER = "foundry-job-execution-binding-current:v4:";
const guard = (key: string, expected: string | undefined): Readonly<{ store: "analysis"; key: string; expected?: string }> => Object.freeze({ store: "analysis" as const, key, ...(expected === undefined ? {} : { expected }) });
type Terminal = Extract<TearFoundryExecutionBindingV4["payload"], Readonly<{ kind: "decision-terminal" }>>;
function terminal(value: TearFoundryExecutionBindingV4["payload"]): Terminal { if (value.kind !== "decision-terminal") throw new RangeError("Foundry V4 monitoring is not declared"); return value; }

/** Retains the one factual monitoring entry, then permanently concludes this governed schedule. */
export class TearFoundryV4MonitoringEntryScheduler {
  readonly #jobs: TearFoundryJobVault; readonly #custody: TearAcademyCandidateCustodyStore;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore) { if (jobs.backend() !== custody.backend()) throw new TypeError("Foundry V4 monitoring must share C31 custody"); this.#jobs = jobs; this.#custody = custody; }
  async enter(schedule: TearFoundryJobScheduleV1, source: TearFoundryExecutionBindingV4, at: string): Promise<TearFoundryExecutionBindingV4> {
    const payload = terminal(source.payload), backend = this.#jobs.backend(), scheduleKey = `foundry-job-schedule:v1:${schedule.id}`, jobKey = `foundry-job:v1:${source.job.id}`, sourceKey = `${BINDING}${source.bindingHash}`, pointerKey = `${POINTER}${schedule.id}:${String(schedule.revision)}:${schedule.scheduleHash}`, decisionKey = `foundry-job-decision:v1:${payload.decisionReceiptHash}`;
    if (!Number.isFinite(Date.parse(at)) || source.schedule.scheduleHash !== schedule.scheduleHash || source.job.phase !== "monitoring") throw new RangeError("Foundry V4 monitoring declaration changed");
    const [scheduleRaw, jobRaw, sourceRaw, pointerRaw, decisionRaw, inventory, held] = await Promise.all([backend.get("analysis", scheduleKey), backend.get("analysis", jobKey), backend.get("analysis", sourceKey), backend.get("analysis", pointerKey), backend.get("analysis", decisionKey), this.#custody.inventory(), this.#custody.held(at)]);
    if (scheduleRaw === undefined || jobRaw === undefined || sourceRaw === undefined || decisionRaw === undefined || pointerRaw !== source.bindingHash || scheduleRaw !== JSON.stringify(schedule) || sourceRaw !== JSON.stringify(source)) throw new RangeError("Foundry V4 monitoring authority changed");
    let job; let decision; try { job = parseTearFoundryJob(JSON.parse(jobRaw)); decision = parseTearFoundryDecisionReceipt(JSON.parse(decisionRaw)); } catch { throw new RangeError("Foundry V4 monitoring evidence is invalid"); }
    if (job.jobHash !== source.job.jobHash || decision.receiptHash !== payload.decisionReceiptHash || decision.disposition !== "monitoring-ready" || decision.job.resultJobHash !== job.jobHash || (await this.#jobs.get(job.id))?.jobHash !== job.jobHash) throw new RangeError("Foundry V4 monitoring lineage changed");
    const records = inventory.records.filter((record) => job.inputs.corpusRecordHashes.includes(record.recordHash)).sort((a, b) => a.candidateHash.localeCompare(b.candidateHash));
    const custodyRaw = await Promise.all(records.map((record) => backend.get("analysis", `academy-candidate-custody:v1:${record.candidateHash}`)));
    if (records.length !== job.inputs.corpusRecordHashes.length || custodyRaw.some((raw) => raw === undefined) || !job.inputs.corpusRecordHashes.every((recordHash) => held.some((record) => record.recordHash === recordHash))) throw new RangeError("Foundry V4 monitoring custody changed");
    let next: TearFoundryExecutionBindingV4 | undefined;
    const receipt = await new TearFoundryMonitoringEntryExecutor(this.#jobs, this.#custody).enter(job, payload.decisionReceiptHash, at, {
      guards: (entry) => { const concluded = setTearFoundryJobScheduleEnabled(schedule, false, at); next = createTearFoundryExecutionBindingV4({ schedule: { id: concluded.id, revision: concluded.revision, scheduleHash: concluded.scheduleHash }, job: { id: job.id, jobHash: job.jobHash, phase: job.phase }, payload: { kind: "monitoring-entry-terminal", monitoringReceiptHash: entry.receiptHash } }); return Object.freeze([guard(scheduleKey, scheduleRaw), guard(jobKey, jobRaw), guard(sourceKey, sourceRaw), guard(pointerKey, source.bindingHash), guard(decisionKey, decisionRaw), guard(`${BINDING}${next.bindingHash}`, undefined), guard(`${POINTER}${next.schedule.id}:${String(next.schedule.revision)}:${next.schedule.scheduleHash}`, undefined), ...records.map((record, index) => guard(`academy-candidate-custody:v1:${record.candidateHash}`, custodyRaw[index]))]); },
      writes: (entry) => { if (next === undefined) throw new Error("Foundry V4 monitoring continuation disappeared"); const concluded = setTearFoundryJobScheduleEnabled(schedule, false, at); return Object.freeze([{ store: "analysis" as const, key: scheduleKey, value: JSON.stringify(concluded) }, { store: "analysis" as const, key: `${BINDING}${next.bindingHash}`, value: JSON.stringify(next) }, { store: "analysis" as const, key: `${POINTER}${next.schedule.id}:${String(next.schedule.revision)}:${next.schedule.scheduleHash}`, value: next.bindingHash }, { store: "indexes" as const, key: `foundry-job-v4-monitoring-entry:${job.id}:${entry.receiptHash}`, value: JSON.stringify({ decisionReceiptHash: payload.decisionReceiptHash, bindingHash: next.bindingHash, promotional: false }) }]); },
    });
    if (next?.payload.kind !== "monitoring-entry-terminal" || next.payload.monitoringReceiptHash !== receipt.receiptHash) throw new Error("Foundry V4 monitoring continuation was not retained"); return next;
  }
}

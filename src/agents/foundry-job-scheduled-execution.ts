import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCorpusStore } from "./academy-corpus";
import type { TearAcademyTrainingDatasetLoader } from "./academy-training-dataset";
import { TearFoundryDueDispatcher, type TearFoundryDueAttemptReceiptV1 } from "./foundry-job-due-dispatcher";
import { TearFoundryExecutionBindingVault, type TearFoundryExecutionBindingV3 } from "./foundry-job-execution-binding";
import { TearFoundryBoundContinuationCoordinator } from "./foundry-job-bound-continuation";
import type { TearFoundryJobScheduleVault } from "./foundry-job-schedule";
import type { TearFoundryJobVault } from "./foundry-job-vault";

const KEY = "foundry-job-scheduled-attempt:v1:"; const HASH = /^[a-f0-9]{16}$/u;
export interface TearFoundryScheduledAttemptV1 { readonly format: "tear-foundry-scheduled-attempt"; readonly schemaVersion: 1; readonly scheduleHash: string; readonly bindingHash: string; readonly attemptedAt: string; readonly leaseId: string; readonly phase: TearFoundryExecutionBindingV3["job"]["phase"]; readonly dueReceiptHash: string; readonly attemptHash: string; }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function time(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function freeze(draft: Omit<TearFoundryScheduledAttemptV1, "attemptHash">): TearFoundryScheduledAttemptV1 { if (!HASH.test(draft.scheduleHash) || !HASH.test(draft.bindingHash) || !time(draft.attemptedAt) || !text(draft.leaseId) || !HASH.test(draft.dueReceiptHash)) throw new TypeError("invalid Foundry scheduled attempt"); const value = Object.freeze({ ...draft }); return Object.freeze({ ...value, attemptHash: stableVerificationHash(value) }); }
function parse(value: unknown): TearFoundryScheduledAttemptV1 { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid Foundry scheduled attempt"); const source = value as TearFoundryScheduledAttemptV1, { attemptHash, ...draft } = source, parsed = freeze(draft); if (attemptHash !== parsed.attemptHash) throw new TypeError("Foundry scheduled attempt integrity mismatch"); return parsed; }
/** Explicit local one-shot composition. It owns no loop: callers must invoke one exact bound phase themselves. */
export class TearFoundryScheduledExecution {
  readonly #jobs: TearFoundryJobVault; readonly #schedules: TearFoundryJobScheduleVault; readonly #bindings: TearFoundryExecutionBindingVault; readonly #dispatcher: TearFoundryDueDispatcher; readonly #continuation: TearFoundryBoundContinuationCoordinator;
  constructor(jobs: TearFoundryJobVault, schedules: TearFoundryJobScheduleVault, custody: TearAcademyCandidateCustodyStore, corpus?: TearAcademyCorpusStore, loader?: TearAcademyTrainingDatasetLoader) { this.#jobs = jobs; this.#schedules = schedules; this.#bindings = new TearFoundryExecutionBindingVault(jobs); this.#dispatcher = new TearFoundryDueDispatcher(jobs, schedules, custody, corpus, loader); this.#continuation = new TearFoundryBoundContinuationCoordinator(jobs, schedules, { held: async (job, at) => { const held = await custody.held(at); return job.inputs.corpusRecordHashes.every((hash) => held.some((entry) => entry.recordHash === hash)); } }); }
  async runScheduledOnce(scheduleHash: string, at: string, leaseId: string): Promise<TearFoundryScheduledAttemptV1> {
    if (!HASH.test(scheduleHash) || !time(at) || !text(leaseId)) throw new TypeError("invalid Foundry scheduled execution request");
    const key = `${KEY}${stableVerificationHash({ scheduleHash, at, leaseId })}`, old = await this.#jobs.backend().get("analysis", key);
    if (old !== undefined) { try { return parse(JSON.parse(old)); } catch { await this.#jobs.backend().put("quarantine", key, JSON.stringify(Object.freeze({ format: "foundry-scheduled-attempt-quarantine", schemaVersion: 1, key, raw: old }))); throw new RangeError("Foundry scheduled execution attempt is corrupt"); } }
    const schedule = (await this.#schedules.list()).find((entry) => entry.scheduleHash === scheduleHash); if (schedule?.state !== "enabled") throw new RangeError("Foundry scheduled execution requires an enabled schedule");
    const binding = await this.#bindings.getCurrentV3(schedule); if (binding?.schedule.scheduleHash !== scheduleHash) throw new RangeError("Foundry scheduled execution requires a current V3 binding");
    const job = await this.#jobs.get(schedule.jobId); if (job?.jobHash !== schedule.jobHash || binding.job.jobHash !== schedule.jobHash || binding.job.phase !== job.phase) throw new RangeError("Foundry scheduled execution binding is stale");
    const budgets = Object.freeze({ computeBudgetHash: schedule.computeBudgetHash, storageBudgetHash: schedule.storageBudgetHash }); let due: TearFoundryDueAttemptReceiptV1;
    if (binding.payload.kind === "none") due = await this.#dispatcher.runDueOnce(scheduleHash, at, budgets, leaseId);
    else if (binding.payload.kind === "trainer-manifest") due = await this.#dispatcher.runManifestAdmissionDueOnce(scheduleHash, binding.payload.manifest, at, budgets, leaseId);
    else if (binding.payload.kind === "offline-launch") { const offline = binding.payload.offline; due = await this.#dispatcher.runOfflineTrainingDueOnce(scheduleHash, Object.freeze({ training: offline.training, manifestHash: offline.manifestHash, manifestRootHash: offline.manifestRootHash, datasetHash: offline.datasetHash, planHash: offline.planHash, configurationHash: offline.configurationHash, rewardHash: offline.rewardHash }), at, budgets, leaseId); }
    else due = await this.#dispatcher.runOfflineResumeDueOnce(scheduleHash, binding.payload.launchHash, at, budgets, leaseId);
    const next = await this.#jobs.get(schedule.jobId); if (due.disposition === "collected") { if (next === undefined || next.jobHash === schedule.jobHash) throw new RangeError("Foundry scheduled execution retained no successor"); await this.#continuation.continueBoundAttempt(scheduleHash, binding.bindingHash, job, next, due, at, budgets); }
    const output = freeze({ format: "tear-foundry-scheduled-attempt", schemaVersion: 1, scheduleHash, bindingHash: binding.bindingHash, attemptedAt: at, leaseId, phase: binding.job.phase, dueReceiptHash: due.receiptHash });
    await this.#jobs.backend().commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(output) }, { store: "indexes", key: `foundry-job-scheduled-attempt:${scheduleHash}:${output.attemptHash}`, value: JSON.stringify(Object.freeze({ bindingHash: binding.bindingHash, phase: binding.job.phase, dueReceiptHash: due.receiptHash })) }])); return output;
  }
}

import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCorpusStore } from "./academy-corpus";
import type { TearAcademyTrainingDatasetLoader } from "./academy-training-dataset";
import { TearFoundryDueDispatcher, type TearFoundryDueAttemptReceiptV1 } from "./foundry-job-due-dispatcher";
import { TearFoundryExecutionBindingVault, type TearFoundryExecutionBindingV3 } from "./foundry-job-execution-binding";
import { TearFoundryBoundContinuationCoordinator } from "./foundry-job-bound-continuation";
import { TearFoundryExecutionBindingV4Vault, TearFoundryV4OfflineTerminalScheduler } from "./foundry-job-v4-offline-terminal";
import { TearFoundryV4OnlineLaunchScheduler } from "./foundry-job-v4-online-launch-scheduler";
import { TearFoundryV4OnlineExecutionScheduler } from "./foundry-job-v4-online-execution-scheduler";
import { TearFoundryV4OnlineTerminalScheduler } from "./foundry-job-v4-online-terminal";
import { TearFoundryV4SourceEvaluationPlanScheduler } from "./foundry-job-v4-source-evaluation-plan";
import { parseTearFoundryOfflineTrainingLaunch, TearFoundryOfflineTrainingLaunchVault } from "./foundry-job-offline-training";
import { TearOfflineRlCheckpointVault } from "./offline-rl-training";
import type { TearFoundryJobScheduleVault } from "./foundry-job-schedule";
import type { TearFoundryJobVault } from "./foundry-job-vault";

const KEY = "foundry-job-scheduled-attempt:v1:"; const HASH = /^[a-f0-9]{16}$/u;
export interface TearFoundryScheduledAttemptV1 { readonly format: "tear-foundry-scheduled-attempt"; readonly schemaVersion: 1; readonly scheduleHash: string; readonly bindingHash: string; readonly attemptedAt: string; readonly leaseId: string; readonly phase: TearFoundryExecutionBindingV3["job"]["phase"]; readonly dueReceiptHash: string; readonly attemptHash: string; }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function time(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function nonterminal(phase: TearFoundryExecutionBindingV3["job"]["phase"]): boolean { return !["rejected", "rolled-back", "completed", "cancelled", "failed"].includes(phase); }
function freeze(draft: Omit<TearFoundryScheduledAttemptV1, "attemptHash">): TearFoundryScheduledAttemptV1 { if (!HASH.test(draft.scheduleHash) || !HASH.test(draft.bindingHash) || !time(draft.attemptedAt) || !text(draft.leaseId) || !HASH.test(draft.dueReceiptHash)) throw new TypeError("invalid Foundry scheduled attempt"); const value = Object.freeze({ ...draft }); return Object.freeze({ ...value, attemptHash: stableVerificationHash(value) }); }
function parse(value: unknown): TearFoundryScheduledAttemptV1 { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid Foundry scheduled attempt"); const source = value as TearFoundryScheduledAttemptV1, { attemptHash, ...draft } = source, parsed = freeze(draft); if (attemptHash !== parsed.attemptHash) throw new TypeError("Foundry scheduled attempt integrity mismatch"); return parsed; }
/** Explicit local one-shot composition. It owns no loop: callers must invoke one exact bound phase themselves. */
export class TearFoundryScheduledExecution {
  readonly #jobs: TearFoundryJobVault; readonly #schedules: TearFoundryJobScheduleVault; readonly #custody: TearAcademyCandidateCustodyStore; readonly #corpus: TearAcademyCorpusStore | undefined; readonly #loader: TearAcademyTrainingDatasetLoader | undefined; readonly #bindings: TearFoundryExecutionBindingVault; readonly #dispatcher: TearFoundryDueDispatcher; readonly #continuation: TearFoundryBoundContinuationCoordinator;
  constructor(jobs: TearFoundryJobVault, schedules: TearFoundryJobScheduleVault, custody: TearAcademyCandidateCustodyStore, corpus?: TearAcademyCorpusStore, loader?: TearAcademyTrainingDatasetLoader) { this.#jobs = jobs; this.#schedules = schedules; this.#custody = custody; this.#corpus = corpus; this.#loader = loader; this.#bindings = new TearFoundryExecutionBindingVault(jobs); this.#dispatcher = new TearFoundryDueDispatcher(jobs, schedules, custody, corpus, loader); this.#continuation = new TearFoundryBoundContinuationCoordinator(jobs, schedules, { held: async (job, at) => { const held = await custody.held(at); return job.inputs.corpusRecordHashes.every((hash) => held.some((entry) => entry.recordHash === hash)); } }); }
  async runScheduledOnce(scheduleHash: string, at: string, leaseId: string): Promise<TearFoundryScheduledAttemptV1> {
    if (!HASH.test(scheduleHash) || !time(at) || !text(leaseId)) throw new TypeError("invalid Foundry scheduled execution request");
    const key = `${KEY}${stableVerificationHash({ scheduleHash, at, leaseId })}`, old = await this.#jobs.backend().get("analysis", key);
    if (old !== undefined) { try { return parse(JSON.parse(old)); } catch { await this.#jobs.backend().put("quarantine", key, JSON.stringify(Object.freeze({ format: "foundry-scheduled-attempt-quarantine", schemaVersion: 1, key, raw: old }))); throw new RangeError("Foundry scheduled execution attempt is corrupt"); } }
    const schedule = (await this.#schedules.list()).find((entry) => entry.scheduleHash === scheduleHash); if (schedule?.state !== "enabled") throw new RangeError("Foundry scheduled execution requires an enabled schedule");
    // V4 is terminal-only and deliberately checked before V3. A V1--V3
    // binding remains recovery-readable; it is never rewritten merely because
    // a later scheduler knows about V4.
    const v4 = await new TearFoundryExecutionBindingV4Vault(this.#jobs).current(schedule);
    if (v4 !== undefined) {
      if (v4.payload.kind === "online-launch-ready") {
        const corpus = this.#corpus, loader = this.#loader; if (corpus === undefined || loader === undefined) throw new TypeError("Foundry V4 online launch requires shared C31 corpus and dataset loader");
        const launched = await new TearFoundryV4OnlineLaunchScheduler(this.#jobs, this.#custody, corpus, loader).launch(schedule, v4, at);
        const output = freeze({ format: "tear-foundry-scheduled-attempt", schemaVersion: 1, scheduleHash, bindingHash: launched.binding.bindingHash, attemptedAt: at, leaseId, phase: launched.binding.job.phase, dueReceiptHash: stableVerificationHash({ kind: "v4-online-launch", authorityHash: v4.payload.authorityHash, handoffReceiptHash: v4.payload.handoffReceiptHash, launchHash: launched.launch.launchHash, at }) });
        await this.#jobs.backend().commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(output) }])); return output;
      }
      if (v4.payload.kind === "online-resume") {
        const corpus = this.#corpus, loader = this.#loader; if (corpus === undefined || loader === undefined) throw new TypeError("Foundry V4 online execution requires shared C31 corpus and dataset loader");
        const terminal = await new TearFoundryV4OnlineTerminalScheduler(this.#jobs, this.#custody).detect(schedule, v4, at);
        if (terminal !== undefined) { const output = freeze({ format: "tear-foundry-scheduled-attempt", schemaVersion: 1, scheduleHash, bindingHash: terminal.bindingHash, attemptedAt: at, leaseId, phase: terminal.job.phase, dueReceiptHash: stableVerificationHash({ kind: "v4-online-terminal-detect", sourceBindingHash: v4.bindingHash, terminalBindingHash: terminal.bindingHash, at }) }); await this.#jobs.backend().commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(output) }])); return output; }
        const advanced = await new TearFoundryV4OnlineExecutionScheduler(this.#jobs, this.#custody, corpus, loader).execute(schedule, v4, at);
        const output = freeze({ format: "tear-foundry-scheduled-attempt", schemaVersion: 1, scheduleHash, bindingHash: advanced.binding.bindingHash, attemptedAt: at, leaseId, phase: advanced.binding.job.phase, dueReceiptHash: stableVerificationHash({ kind: "v4-online-execution", authorityHash: v4.payload.authorityHash, handoffReceiptHash: v4.payload.handoffReceiptHash, launchHash: advanced.launch.launchHash, receiptHash: advanced.receipt.receiptHash, status: advanced.receipt.status, at }) });
        await this.#jobs.backend().commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(output) }])); return output;
      }
      if (v4.payload.kind === "online-finalization") {
        const next = await new TearFoundryV4OnlineTerminalScheduler(this.#jobs, this.#custody).finalize(schedule, v4, at), output = freeze({ format: "tear-foundry-scheduled-attempt", schemaVersion: 1, scheduleHash, bindingHash: v4.bindingHash, attemptedAt: at, leaseId, phase: v4.job.phase, dueReceiptHash: stableVerificationHash({ kind: "v4-online-terminal-finalization", bindingHash: v4.bindingHash, nextBindingHash: next?.bindingHash ?? null, at }) }); await this.#jobs.backend().commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(output) }])); return output;
      }
      if (v4.payload.kind === "source-evaluation-plan-ready") {
        const corpus = this.#corpus, loader = this.#loader; if (corpus === undefined || loader === undefined) throw new TypeError("Foundry V4 source-evaluation plan requires shared C31 corpus and dataset loader");
        const next = await new TearFoundryV4SourceEvaluationPlanScheduler(this.#jobs, this.#custody, corpus, loader).derive(schedule, v4, at);
        const output = freeze({ format: "tear-foundry-scheduled-attempt", schemaVersion: 1, scheduleHash, bindingHash: next.bindingHash, attemptedAt: at, leaseId, phase: next.job.phase, dueReceiptHash: stableVerificationHash({ kind: "v4-source-evaluation-plan", sourceBindingHash: v4.bindingHash, planReceiptHash: next.payload.kind === "source-evaluation-execution-ready" ? next.payload.planReceiptHash : null, at }) });
        await this.#jobs.backend().commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(output) }])); return output;
      }
      const corpus = this.#corpus, loader = this.#loader; if (corpus === undefined || loader === undefined) throw new TypeError("Foundry V4 terminal execution requires shared C31 corpus and dataset loader");
      const terminal = new TearFoundryV4OfflineTerminalScheduler(this.#jobs, this.#schedules, this.#custody, corpus, loader);
      const next = v4.payload.kind === "offline-resume" ? await terminal.detect(schedule, v4) : v4.payload.kind === "offline-finalization" ? await terminal.finalize(schedule, v4, at) : undefined;
      const output = freeze({ format: "tear-foundry-scheduled-attempt", schemaVersion: 1, scheduleHash, bindingHash: v4.bindingHash, attemptedAt: at, leaseId, phase: v4.job.phase, dueReceiptHash: stableVerificationHash({ kind: "v4-offline-terminal", bindingHash: v4.bindingHash, nextBindingHash: next?.bindingHash ?? null, at }) });
      await this.#jobs.backend().commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(output) }])); return output;
    }
    const binding = await this.#bindings.getCurrentV3(schedule); if (binding?.schedule.scheduleHash !== scheduleHash) throw new RangeError("Foundry scheduled execution requires a current V3 binding");
    const job = await this.#jobs.get(schedule.jobId); if (job?.jobHash !== schedule.jobHash || binding.job.jobHash !== schedule.jobHash || binding.job.phase !== job.phase) throw new RangeError("Foundry scheduled execution binding is stale");
    // A V3 repeat-resume stays readable, but never resumes past its own exact
    // terminal checkpoint. It is explicitly admitted into V4 finalization.
    if (binding.payload.kind === "offline-resume") {
      const corpus = this.#corpus, loader = this.#loader, direct = await new TearFoundryOfflineTrainingLaunchVault(this.#jobs.backend()).get(binding.payload.launchHash);
      // V3 repeat declarations historically retained their preceding launch
      // hash. Accept only its one persisted direct successor for this exact
      // current job head; no broad "latest checkpoint" search is permitted.
      const successor = direct === undefined ? undefined : (await Promise.all((await this.#jobs.backend().keys("analysis")).filter((key) => key.startsWith("foundry-job-offline-training:v1:")).map(async (key) => { const raw = await this.#jobs.backend().get("analysis", key); try { return raw === undefined ? undefined : parseTearFoundryOfflineTrainingLaunch(JSON.parse(raw)); } catch { return undefined; } }))).filter((entry) => entry?.job.resultJobHash === job.jobHash && entry.previousLaunchHash === direct.launchHash);
      const launch = direct?.job.resultJobHash === job.jobHash ? direct : successor?.length === 1 ? successor[0] : undefined;
      const checkpoint = launch === undefined ? undefined : await new TearOfflineRlCheckpointVault(this.#jobs.backend()).get(launch.checkpointHash);
      if (corpus !== undefined && loader !== undefined && launch?.job.resultJobHash === job.jobHash && checkpoint?.checkpointHash === launch.checkpointHash && checkpoint.status !== "running") {
        const v4 = await new TearFoundryExecutionBindingV4Vault(this.#jobs).bind(schedule, job, { kind: "offline-resume", launchHash: launch.launchHash });
        const finalization = await new TearFoundryV4OfflineTerminalScheduler(this.#jobs, this.#schedules, this.#custody, corpus, loader).detect(schedule, v4);
        const output = freeze({ format: "tear-foundry-scheduled-attempt", schemaVersion: 1, scheduleHash, bindingHash: v4.bindingHash, attemptedAt: at, leaseId, phase: job.phase, dueReceiptHash: stableVerificationHash({ kind: "v3-terminal-to-v4", bindingHash: v4.bindingHash, finalizationBindingHash: finalization?.bindingHash ?? null, at }) });
        await this.#jobs.backend().commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(output) }])); return output;
      }
    }
    const budgets = Object.freeze({ computeBudgetHash: schedule.computeBudgetHash, storageBudgetHash: schedule.storageBudgetHash }); let due: TearFoundryDueAttemptReceiptV1;
    if (binding.payload.kind === "none") due = await this.#dispatcher.runDueOnce(scheduleHash, at, budgets, leaseId);
    else if (binding.payload.kind === "trainer-manifest") due = await this.#dispatcher.runManifestAdmissionDueOnce(scheduleHash, binding.payload.manifest, at, budgets, leaseId);
    else if (binding.payload.kind === "offline-launch") { const offline = binding.payload.offline; due = await this.#dispatcher.runOfflineTrainingDueOnce(scheduleHash, Object.freeze({ training: offline.training, manifestHash: offline.manifestHash, manifestRootHash: offline.manifestRootHash, datasetHash: offline.datasetHash, planHash: offline.planHash, configurationHash: offline.configurationHash, rewardHash: offline.rewardHash }), at, budgets, leaseId); }
    else due = await this.#dispatcher.runOfflineResumeDueOnce(scheduleHash, binding.payload.launchHash, at, budgets, leaseId);
    const next = await this.#jobs.get(schedule.jobId);
    // Only a successful, state-changing nonterminal action has an exact V3
    // successor to rebind. A terminal or no-op receipt must not invent one.
    if (due.disposition === "collected" && next !== undefined && next.jobHash !== job.jobHash && nonterminal(next.phase)) {
      await this.#continuation.continueBoundAttempt(scheduleHash, binding.bindingHash, job, next, due, at, budgets);
    }
    const output = freeze({ format: "tear-foundry-scheduled-attempt", schemaVersion: 1, scheduleHash, bindingHash: binding.bindingHash, attemptedAt: at, leaseId, phase: binding.job.phase, dueReceiptHash: due.receiptHash });
    await this.#jobs.backend().commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(output) }, { store: "indexes", key: `foundry-job-scheduled-attempt:${scheduleHash}:${output.attemptHash}`, value: JSON.stringify(Object.freeze({ bindingHash: binding.bindingHash, phase: binding.job.phase, dueReceiptHash: due.receiptHash })) }])); return output;
  }
}

import { stableVerificationHash } from "../replay/hash";
import type { trainTrainingArchiveV3Candidate } from "./training-archive-v3-candidate-training";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import type { TearFoundryJobScheduleVault } from "./foundry-job-schedule";
import { parseTrainingOperationsExecutionBinding, TrainingOperationsV3ScheduledCycle } from "./training-operations-v3-scheduled-cycle";
import { parseTrainingOperationsV3NativePromotionApproval } from "./foundry-job-v3-promotion-approval";
import { parseTearFoundryV3PromotionReceipt } from "./foundry-job-v3-promotion";
import { parseTearFoundryV3PostPromotionMonitorRecord } from "./foundry-job-v3-post-promotion-monitor";
import { createTrainingOperationsV3RollbackIntent, parseTearFoundryV3PostPromotionRollbackReceipt,
  TearFoundryV3PostPromotionRollbackExecutor, type TearFoundryV3PostPromotionRollbackReceiptV1 } from "./foundry-job-v3-post-promotion-rollback";
import { parseTearPolicyActivation } from "./policy-artifact-registry";
import { TrainingOperationsV3EvaluationExecutor } from "./training-operations-v3-evaluation";
import { trainingOperationsJobBudgetAuthority } from "./training-operations-budget";

type Services = Parameters<typeof trainTrainingArchiveV3Candidate>[0];
const keyFor = (scheduleHash: string, intentHash: string) => `training-operations-v3-post-promotion-cycle:v1:${scheduleHash}:${intentHash}`;

/** Classify-only remains the default. Only an exact deliberate action restores the baseline. */
export class TrainingOperationsV3PostPromotionCycle {
  readonly #cycle: TrainingOperationsV3ScheduledCycle;
  constructor(readonly jobs: TearFoundryJobVault, readonly schedules: TearFoundryJobScheduleVault, readonly services: Services) {
    this.#cycle = new TrainingOperationsV3ScheduledCycle(jobs, schedules, services);
  }
  async prepare(scheduleHash: string, at: string, monitorHash?: string) {
    const backend = this.jobs.backend(), schedule = (await this.schedules.list()).find((entry) => entry.scheduleHash === scheduleHash);
    if (schedule === undefined) throw new RangeError("native restoration current schedule unavailable");
    const binding = await this.#cycle.current(schedule);
    if (schedule.state !== "disabled" || binding?.step !== "promoted" || binding.promotion === undefined) throw new RangeError("native restoration requires exact promoted binding");
    const required = async (store: "analysis" | "indexes", key: string) => {
      const raw = await backend.get(store, key); if (raw === undefined) throw new RangeError("native restoration evidence unavailable"); return raw;
    };
    const approval = parseTrainingOperationsV3NativePromotionApproval(JSON.parse(await required("analysis", `foundry-job-v3-promotion-approval:v1:${binding.promotion.approvalHash}`)));
    const promotion = parseTearFoundryV3PromotionReceipt(JSON.parse(await required("analysis", `foundry-job-v3-promotion-receipt:v1:${approval.approvalHash}`)));
    const active = parseTearPolicyActivation(JSON.parse(await required("analysis", "policy-active:v1")));
    if (approval.rollbackBaseline === undefined || binding.promotion.receiptHash !== promotion.receiptHash
      || promotion.approvalHash !== approval.approvalHash || promotion.activationHash !== active.activationHash
      || binding.promotion.activationHash !== active.activationHash || active.artifactId !== approval.candidate.id
      || active.artifactHash !== approval.candidate.artifactHash || approval.job.jobHash !== binding.job.jobHash
      || approval.nativeOrigin.trainingSourceJobHash !== binding.sourceJob.jobHash) throw new RangeError("native restoration promotion changed");
    const captured = await new TrainingOperationsV3EvaluationExecutor(this.jobs, this.services).captureMonitoring(binding.sourceJob.jobHash, at, true);
    if (captured.current.jobHash !== binding.job.jobHash || captured.decision.receiptHash !== approval.nativeOrigin.decisionReceiptHash) throw new RangeError("native restoration source lineage changed");
    const keys = (await backend.keys("analysis")).filter((key) => key.startsWith("foundry-job-v3-post-promotion-monitor:v1:"));
    if (keys.length > 256) throw new RangeError("native restoration refuses unbounded observation lookup");
    const budget = (await trainingOperationsJobBudgetAuthority(backend, captured.current)).budget;
    const matches = [];
    for (const key of keys) {
      const raw = await required("analysis", key), monitor = parseTearFoundryV3PostPromotionMonitorRecord(JSON.parse(raw));
      if (key !== `foundry-job-v3-post-promotion-monitor:v1:${monitor.recordHash}` || monitorHash !== undefined && monitorHash !== monitor.recordHash
        || monitor.classification !== "threshold-breach" || (monitor.policy as unknown as Record<string, unknown>).regressionPolicy !== "classify-only-no-rollback"
        || monitor.promotion.approvalHash !== approval.approvalHash || monitor.promotion.promotionReceiptHash !== promotion.receiptHash
        || monitor.promotion.activationHash !== active.activationHash || monitor.promotion.artifactHash !== active.artifactHash
        || monitor.policy.protocolHash !== approval.job.protocolHash || monitor.policy.stopConditionsHash !== binding.sourceJob.inputs.stopConditionsHash
        || Date.parse(at) < Date.parse(monitor.recordedAt) || Date.parse(monitor.recordedAt) < Date.parse(promotion.promotedAt)) continue;
      const indexKey = `foundry-job-v3-post-promotion-monitor:${active.artifactHash}:${monitor.recordHash}`;
      const indexRaw = await required("indexes", indexKey);
      if (indexRaw !== JSON.stringify({ classification: monitor.classification, active: true, aggregateOnly: true })
        || budget !== undefined && ![["analysis", key, raw], ["indexes", indexKey, indexRaw]].every(([store, key, value]) => budget.records.some((record) => record.store === store && record.key === key && record.valueHash === stableVerificationHash(value)))) continue;
      matches.push(monitor);
    }
    const monitor = matches.sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt) || left.recordHash.localeCompare(right.recordHash))[0];
    if (monitor === undefined) throw new RangeError("native restoration requires eligible retained breach");
    const intent = createTrainingOperationsV3RollbackIntent({ format: "training-operations-v3-restore-baseline-intent", schemaVersion: 1,
      scheduleHash, bindingHash: binding.bindingHash, jobHash: binding.job.jobHash, monitorHash: monitor.recordHash,
      approvalHash: approval.approvalHash, promotionReceiptHash: promotion.receiptHash, sourceActivationHash: active.activationHash,
      baselineActivationHash: approval.rollbackBaseline.activationHash, candidateArtifactHash: active.artifactHash });
    return { schedule, binding, monitor, intent };
  }

  async restore(scheduleHash: string, intentHash: string, at: string): Promise<TearFoundryV3PostPromotionRollbackReceiptV1> {
    if (![scheduleHash, intentHash].every((value) => typeof value === "string" && /^[a-f0-9]{16}$/u.test(value)) || !Number.isFinite(Date.parse(at))) throw new TypeError("native restoration requires exact explicit token");
    const backend = this.jobs.backend(), key = keyFor(scheduleHash, intentHash), raw = await backend.get("analysis", key);
    let prepared: Awaited<ReturnType<TrainingOperationsV3PostPromotionCycle["prepare"]>>;
    if (raw === undefined) {
      prepared = await this.prepare(scheduleHash, at);
      if (prepared.intent.intentHash !== intentHash) throw new RangeError("native restoration explicit token is stale");
    } else {
      const value: unknown = JSON.parse(raw);
      if (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 2 || !("intent" in value) || !("receipt" in value)) throw new TypeError("invalid native restoration terminal");
      const typed = value.intent as ReturnType<typeof createTrainingOperationsV3RollbackIntent>, { intentHash: retainedHash, ...draft } = typed;
      const intent = createTrainingOperationsV3RollbackIntent(draft), receipt = parseTearFoundryV3PostPromotionRollbackReceipt(value.receipt);
      if (intent.intentHash !== retainedHash || retainedHash !== intentHash || intent.scheduleHash !== scheduleHash || receipt.monitorHash !== intent.monitorHash) throw new RangeError("native restoration terminal intent changed");
      const source5 = await backend.get("analysis", `training-operations-execution-binding:v5:${intent.bindingHash}`), source6 = await backend.get("analysis", `training-operations-execution-binding:v6:${intent.bindingHash}`);
      if ((source5 === undefined) === (source6 === undefined)) throw new RangeError("native restoration source unavailable or ambiguous");
      const binding = parseTrainingOperationsExecutionBinding(JSON.parse(source6 ?? source5 ?? "")), schedule = await this.schedules.get(binding.schedule.id);
      if (schedule?.scheduleHash !== scheduleHash) throw new RangeError("native restoration terminal schedule changed");
      const current = await this.#cycle.current(schedule);
      if (current?.restoration?.receiptHash !== receipt.receiptHash || current.restoration.intentHash !== intentHash) throw new RangeError("native restoration terminal binding changed");
      const monitorRaw = await backend.get("analysis", `foundry-job-v3-post-promotion-monitor:v1:${intent.monitorHash}`);
      if (monitorRaw === undefined) throw new RangeError("native restoration terminal observation missing");
      prepared = { schedule, binding, monitor: parseTearFoundryV3PostPromotionMonitorRecord(JSON.parse(monitorRaw)), intent };
    }
    const { schedule, binding, intent } = prepared;
    const derived = (receipt: TearFoundryV3PostPromotionRollbackReceiptV1) => {
      const next = this.#cycle.restorationContinuation(schedule, binding, { receiptHash: receipt.receiptHash, intentHash,
        monitorHash: receipt.monitorHash, activationHash: receipt.rollback.activationHash }, raw !== undefined);
      const value = JSON.stringify({ intent, receipt });
      if (raw !== undefined && raw !== value) throw new RangeError("native restoration terminal bytes changed");
      return { guards: [...next.guards, { store: "analysis" as const, key, ...(raw === undefined ? {} : { expected: raw }) }],
        writes: [...next.writes.map((write) => ({ ...write, value: write.value ?? "" })), { store: "analysis" as const, key, value }] };
    };
    try { return await new TearFoundryV3PostPromotionRollbackExecutor(this.jobs, this.services.custody).rollback(intent.monitorHash, at,
      { guards: (receipt) => derived(receipt).guards, writes: (receipt) => derived(receipt).writes }, { intent, services: this.services }); }
    catch (error) {
      if (raw === undefined && await backend.get("analysis", key) !== undefined) return this.restore(scheduleHash, intentHash, at);
      throw error;
    }
  }

  async terminal(scheduleHash: string, at: string): Promise<TearFoundryV3PostPromotionRollbackReceiptV1 | undefined> {
    const schedule = (await this.schedules.list()).find((entry) => entry.scheduleHash === scheduleHash);
    if (schedule === undefined) return undefined;
    const binding = await this.#cycle.current(schedule);
    if (binding?.step !== "restored" || binding.restoration === undefined) return undefined;
    return this.restore(scheduleHash, binding.restoration.intentHash, at);
  }
}

import { stableVerificationHash } from "../replay/hash";
import { parseTearC34V3C32PolicyCandidate } from "./c34-v3-c32-policy-adapter";
import {
  createTrainingOperationsV3NativePromotionApproval,
  parseTrainingOperationsV3NativePromotionApproval,
} from "./foundry-job-v3-promotion-approval";
import {
  TearFoundryV3PromotionExecutor,
  parseTearFoundryV3PromotionReceipt,
  type TearFoundryV3PromotionReceiptV1,
} from "./foundry-job-v3-promotion";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import type { TearFoundryJobScheduleVault } from "./foundry-job-schedule";
import type { trainTrainingArchiveV3Candidate } from "./training-archive-v3-candidate-training";
import { TrainingOperationsV3MonitoringAuthority } from "./training-operations-v3-monitoring-authority";
import {
  parseTrainingOperationsExecutionBinding,
  TrainingOperationsV3ScheduledCycle,
  type TrainingOperationsExecutionBinding,
} from "./training-operations-v3-scheduled-cycle";

type Services = Parameters<typeof trainTrainingArchiveV3Candidate>[0];
const resultKey = (scheduleHash: string, intentHash: string) =>
  `training-operations-v3-promotion-cycle:v1:${scheduleHash}:${intentHash}`;
export interface TrainingOperationsV3PromotionIntentV1 {
  readonly format: "training-operations-v3-promotion-intent";
  readonly schemaVersion: 1;
  readonly scheduleHash: string;
  readonly bindingHash: string;
  readonly jobHash: string;
  readonly decisionReceiptHash: string;
  readonly candidateArtifactHash: string;
  readonly rollbackActivationHash: string;
  readonly intentHash: string;
}

/** An enabled schedule never grants promotion. The explicit action must return this exact intent hash. */
export class TrainingOperationsV3PromotionCycle {
  readonly #cycle: TrainingOperationsV3ScheduledCycle;
  constructor(
    readonly jobs: TearFoundryJobVault,
    readonly schedules: TearFoundryJobScheduleVault,
    readonly services: Services,
  ) {
    this.#cycle = new TrainingOperationsV3ScheduledCycle(jobs, schedules, services);
  }
  async prepare(scheduleHash: string, at: string) {
    const schedule = (await this.schedules.list()).find((entry) => entry.scheduleHash === scheduleHash);
    if (schedule === undefined) throw new RangeError("native promotion current schedule unavailable");
    const binding = await this.#cycle.current(schedule);
    if (binding?.step !== "awaiting-promotion" || schedule.state !== "disabled")
      throw new RangeError("native promotion schedule is not eligible");
    const captured = await new TrainingOperationsV3MonitoringAuthority(this.jobs, this.services).capture(
      binding.sourceJob.jobHash,
      at,
    );
    if (captured.current.jobHash !== binding.job.jobHash) throw new RangeError("native promotion binding head changed");
    const authority = captured.receipt,
      draft = {
        format: "training-operations-v3-promotion-intent" as const,
        schemaVersion: 1 as const,
        scheduleHash,
        bindingHash: binding.bindingHash,
        jobHash: binding.job.jobHash,
        decisionReceiptHash: authority.decisionReceiptHash,
        candidateArtifactHash: authority.candidateArtifactHash,
        rollbackActivationHash: authority.rollbackBaseline.activationHash,
      };
    return {
      schedule,
      binding,
      captured,
      intent: Object.freeze({ ...draft, intentHash: stableVerificationHash(draft) }),
    };
  }

  async promote(scheduleHash: string, intentHash: string, at: string): Promise<TearFoundryV3PromotionReceiptV1> {
    if (
      ![scheduleHash, intentHash].every((value) => typeof value === "string" && /^[a-f0-9]{16}$/u.test(value)) ||
      !Number.isFinite(Date.parse(at))
    )
      throw new TypeError("native promotion requires exact explicit intent");
    const backend = this.jobs.backend(),
      key = resultKey(scheduleHash, intentHash),
      raw = await backend.get("analysis", key);
    let binding: TrainingOperationsExecutionBinding;
    let approval: ReturnType<typeof parseTrainingOperationsV3NativePromotionApproval>;
    let schedule: NonNullable<Awaited<ReturnType<TearFoundryJobScheduleVault["get"]>>>;
    if (raw !== undefined) {
      const result: unknown = JSON.parse(raw);
      if (
        result === null ||
        typeof result !== "object" ||
        Array.isArray(result) ||
        Object.keys(result).length !== 2 ||
        !("approval" in result) ||
        !("receipt" in result)
      )
        throw new TypeError("invalid native promotion cycle record");
      approval = parseTrainingOperationsV3NativePromotionApproval(result.approval);
      const receipt = parseTearFoundryV3PromotionReceipt(result.receipt);
      if (
        approval.nativeOrigin.intentHash !== intentHash ||
        approval.nativeOrigin.scheduleHash !== scheduleHash ||
        receipt.approvalHash !== approval.approvalHash
      )
        throw new RangeError("native promotion retry intent changed");
      const sourceRaw =
        (await backend.get(
          "analysis",
          `training-operations-execution-binding:v6:${approval.nativeOrigin.bindingHash}`,
        )) ??
        (await backend.get(
          "analysis",
          `training-operations-execution-binding:v5:${approval.nativeOrigin.bindingHash}`,
        ));
      if (sourceRaw === undefined) throw new RangeError("native promotion source binding unavailable");
      binding = parseTrainingOperationsExecutionBinding(JSON.parse(sourceRaw));
      const current = await this.schedules.get(binding.schedule.id);
      if (current?.scheduleHash !== scheduleHash) throw new RangeError("native promotion retry schedule changed");
      schedule = current;
      const head = await this.#cycle.current(schedule);
      if (head?.promotion?.receiptHash !== receipt.receiptHash || head.promotion.intentHash !== intentHash)
        throw new RangeError("native promotion retry binding changed");
    } else {
      const prepared = await this.prepare(scheduleHash, at);
      if (prepared.intent.intentHash !== intentHash) throw new RangeError("native promotion explicit intent is stale");
      ({ schedule, binding } = prepared);
      const { captured } = prepared,
        authority = captured.receipt,
        candidate = captured.training.evidence.candidate.artifact;
      const payload = parseTearC34V3C32PolicyCandidate(candidate),
        baseline = authority.rollbackBaseline;
      approval = createTrainingOperationsV3NativePromotionApproval({
        format: "training-operations-v3-native-promotion-approval",
        schemaVersion: 1,
        job: {
          id: captured.current.id,
          jobHash: captured.current.jobHash,
          protocolHash: captured.protocol.protocolHash,
          stopConditionsHash: captured.current.inputs.stopConditionsHash,
        },
        candidate: {
          id: candidate.id,
          artifactHash: candidate.artifactHash,
          adapterHash: payload.sourceStateAdapter.adapterHash,
          actionVocabularyHash: payload.lineage.actionVocabularyHash,
          offlinePlanHash: payload.lineage.offlinePlanHash,
          offlineTrainingHash: payload.lineage.offlineTrainingHash,
          onlinePlanHash: payload.lineage.onlinePlanHash,
          onlineCheckpointHash: payload.lineage.onlineCheckpointHash,
          evaluationHash: payload.lineage.onlineEvaluationHash,
        },
        rollbackBaseline: {
          revision: baseline.revision,
          artifactId: baseline.artifactId,
          artifactHash: baseline.artifactHash,
          activationHash: baseline.activationHash,
        },
        nativeOrigin: {
          authorityHash: authority.authorityHash,
          trainingSourceJobHash: binding.sourceJob.jobHash,
          trainingReceiptHash: authority.trainingReceiptHash,
          evaluationReceiptHash: authority.evaluationReceiptHash,
          decisionReceiptHash: authority.decisionReceiptHash,
          intentHash,
          scheduleHash,
          bindingHash: binding.bindingHash,
        },
        conditions: {
          currentMonitoringHead: true,
          monitoringReadyDecision: true,
          evidenceRetained: true,
          heldCustody: true,
          completedPassedV3: true,
          inactiveCandidateOnly: true,
          approverFree: true,
        },
        approvedAt: at,
      });
    }
    try {
      return await new TearFoundryV3PromotionExecutor(this.jobs, this.services.custody).promoteNative(
        approval,
        at,
        this.services,
        (receipt) => {
          const extra = this.#cycle.promotionContinuation(
            schedule,
            binding,
            {
              approvalHash: approval.approvalHash,
              receiptHash: receipt.receiptHash,
              activationHash: receipt.activationHash,
              intentHash,
            },
            raw !== undefined,
          );
          const value = JSON.stringify({ approval, receipt });
          if (raw !== undefined && value !== raw) throw new RangeError("native promotion retry bytes changed");
          return {
            guards: [...extra.guards, { store: "analysis", key, ...(raw === undefined ? {} : { expected: raw }) }],
            writes: [...extra.writes, { store: "analysis", key, value }],
          };
        },
      );
    } catch (error) {
      // A lost response may join only the exact fully committed cycle; the retry validates every retained byte.
      if (raw === undefined && (await backend.get("analysis", key)) !== undefined)
        return this.promote(scheduleHash, intentHash, at);
      throw error;
    }
  }
}

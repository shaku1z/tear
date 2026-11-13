import type { GhostVaultStore, GhostVaultGuard } from "../ghost";
import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import { parseTearFoundryV3PostPromotionMonitorRecord } from "./foundry-job-v3-post-promotion-monitor";
import { parseTearFoundryV3PromotionReceipt } from "./foundry-job-v3-promotion";
import { parseTearFoundryV3PromotionApprovalOrigin } from "./foundry-job-v3-promotion-approval";
import { parseTearFoundryJob, requireTearFoundryEvaluationProtocol } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import { parseTearPolicyActivation, parseTearPolicyArtifact } from "./policy-artifact-registry";
import { parseTrainingOperationsExecutionBinding } from "./training-operations-v3-scheduled-cycle";
import { parseTearFoundryJobSchedule } from "./foundry-job-schedule";
import { TrainingOperationsV3EvaluationExecutor } from "./training-operations-v3-evaluation";
import { parseTrainingOperationsV3MonitoringAuthority } from "./training-operations-v3-monitoring-authority";
import {
  commitTrainingOperationsJobWrites,
  commitTrainingOperationsPromotionWrites,
  trainingOperationsJobBudgetAuthority,
} from "./training-operations-budget";
import type { trainTrainingArchiveV3Candidate } from "./training-archive-v3-candidate-training";

const HASH = /^[a-f0-9]{16}$/u,
  ACTIVE = "policy-active:v1",
  MONITOR = "foundry-job-v3-post-promotion-monitor:v1:";
const APPROVAL = "foundry-job-v3-promotion-approval:v1:",
  PROMOTION = "foundry-job-v3-promotion-receipt:v1:",
  RECEIPT = "foundry-job-v3-post-promotion-rollback:v1:";
export interface TearFoundryV3PostPromotionRollbackReceiptV1 {
  readonly format: "tear-foundry-v3-post-promotion-rollback";
  readonly schemaVersion: 1;
  readonly monitorHash: string;
  readonly approvalHash: string;
  readonly promotionReceiptHash: string;
  readonly sourceActivationHash: string;
  readonly rollback: Readonly<{ artifactId: string; artifactHash: string; activationHash: string; revision: number }>;
  readonly rolledBackAt: string;
  readonly receiptHash: string;
}
export interface TearFoundryV3PostPromotionRollbackContinuationV1 {
  readonly guards: (
    receipt: TearFoundryV3PostPromotionRollbackReceiptV1,
  ) => readonly Readonly<{ store: GhostVaultStore; key: string; expected?: string }>[];
  readonly writes: (
    receipt: TearFoundryV3PostPromotionRollbackReceiptV1,
  ) => readonly Readonly<{ store: GhostVaultStore; key: string; value: string }>[];
}
export interface TrainingOperationsV3RollbackIntentV1 {
  readonly format: "training-operations-v3-restore-baseline-intent";
  readonly schemaVersion: 1;
  readonly scheduleHash: string;
  readonly bindingHash: string;
  readonly jobHash: string;
  readonly monitorHash: string;
  readonly approvalHash: string;
  readonly promotionReceiptHash: string;
  readonly sourceActivationHash: string;
  readonly baselineActivationHash: string;
  readonly candidateArtifactHash: string;
  readonly intentHash: string;
}
export function createTrainingOperationsV3RollbackIntent(
  input: Omit<TrainingOperationsV3RollbackIntentV1, "intentHash">,
): TrainingOperationsV3RollbackIntentV1 {
  const raw = input as unknown as Record<string, unknown>;
  const keys =
    "format schemaVersion scheduleHash bindingHash jobHash monitorHash approvalHash promotionReceiptHash sourceActivationHash baselineActivationHash candidateArtifactHash".split(
      " ",
    );
  if (
    Object.keys(raw).length !== keys.length ||
    Object.keys(raw).some((key) => !keys.includes(key)) ||
    raw.format !== "training-operations-v3-restore-baseline-intent" ||
    raw.schemaVersion !== 1 ||
    keys.slice(2).some((key) => !hash(raw[key]))
  )
    throw new TypeError("invalid native restoration intent");
  return Object.freeze({ ...structuredClone(input), intentHash: stableVerificationHash(input) });
}
function hash(value: unknown): value is string {
  return typeof value === "string" && HASH.test(value);
}
function time(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}
function guard(
  key: string,
  expected: string | undefined,
  store: GhostVaultStore = "analysis",
): Readonly<{ store: GhostVaultStore; key: string; expected?: string }> {
  return Object.freeze({ store, key, ...(expected === undefined ? {} : { expected }) });
}
function receipt(
  draft: Omit<TearFoundryV3PostPromotionRollbackReceiptV1, "receiptHash">,
): TearFoundryV3PostPromotionRollbackReceiptV1 {
  if (
    !hash(draft.monitorHash) ||
    !hash(draft.approvalHash) ||
    !hash(draft.promotionReceiptHash) ||
    !hash(draft.sourceActivationHash) ||
    !draft.rollback.artifactId ||
    !hash(draft.rollback.artifactHash) ||
    !hash(draft.rollback.activationHash) ||
    !Number.isSafeInteger(draft.rollback.revision) ||
    draft.rollback.revision < 1 ||
    !time(draft.rolledBackAt)
  )
    throw new TypeError("invalid post-promotion rollback receipt");
  return Object.freeze({
    ...draft,
    rollback: Object.freeze({ ...draft.rollback }),
    receiptHash: stableVerificationHash(draft),
  });
}
export function parseTearFoundryV3PostPromotionRollbackReceipt(
  value: unknown,
): TearFoundryV3PostPromotionRollbackReceiptV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("invalid post-promotion rollback receipt");
  const typed = value as TearFoundryV3PostPromotionRollbackReceiptV1,
    { receiptHash, ...draft } = typed,
    parsed = receipt(draft);
  if (!hash(receiptHash) || receiptHash !== parsed.receiptHash)
    throw new TypeError("post-promotion rollback receipt integrity mismatch");
  return parsed;
}

/** The sole rollback boundary for a C36 promotion. It cannot use generic registry rollback or act on any non-breach observation. */
export class TearFoundryV3PostPromotionRollbackExecutor {
  readonly #jobs: TearFoundryJobVault;
  readonly #custody: TearAcademyCandidateCustodyStore;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore) {
    if (jobs.backend() !== custody.backend())
      throw new TypeError("post-promotion rollback must share C31 custody Vault");
    this.#jobs = jobs;
    this.#custody = custody;
  }
  async rollback(
    monitorHash: string,
    rolledBackAt: string,
    continuation?: TearFoundryV3PostPromotionRollbackContinuationV1,
    native?: Readonly<{
      intent: TrainingOperationsV3RollbackIntentV1;
      services: Parameters<typeof trainTrainingArchiveV3Candidate>[0];
    }>,
  ): Promise<TearFoundryV3PostPromotionRollbackReceiptV1> {
    if (native !== undefined) return this.#rollbackNative(monitorHash, rolledBackAt, native, continuation);
    if (!hash(monitorHash) || !time(rolledBackAt)) throw new TypeError("post-promotion rollback input is invalid");
    const backend = this.#jobs.backend(),
      receiptKey = `${RECEIPT}${monitorHash}`,
      existing = await backend.get("analysis", receiptKey);
    if (existing !== undefined) {
      try {
        return parseTearFoundryV3PostPromotionRollbackReceipt(JSON.parse(existing));
      } catch {
        await backend.put("quarantine", `${receiptKey}:read`, existing);
        throw new RangeError("post-promotion rollback receipt is corrupt");
      }
    }
    const monitorKey = `${MONITOR}${monitorHash}`,
      monitorRaw = await backend.get("analysis", monitorKey);
    if (monitorRaw === undefined) throw new RangeError("post-promotion rollback requires retained monitor evidence");
    let monitor;
    try {
      monitor = parseTearFoundryV3PostPromotionMonitorRecord(JSON.parse(monitorRaw));
    } catch {
      await backend.put("quarantine", `${monitorKey}:rollback`, monitorRaw);
      throw new RangeError("post-promotion rollback monitor is corrupt");
    }
    if (monitor.classification !== "threshold-breach")
      throw new RangeError("post-promotion rollback requires an exact threshold breach");
    const [activeRaw, approvalRaw, promotionRaw] = await Promise.all([
      backend.get("analysis", ACTIVE),
      backend.get("analysis", `${APPROVAL}${monitor.promotion.approvalHash}`),
      backend.get("analysis", `${PROMOTION}${monitor.promotion.approvalHash}`),
    ]);
    if (activeRaw === undefined || approvalRaw === undefined || promotionRaw === undefined)
      throw new RangeError("post-promotion rollback provenance is unavailable");
    const active = parseTearPolicyActivation(JSON.parse(activeRaw)),
      approval = parseTearFoundryV3PromotionApprovalOrigin(JSON.parse(approvalRaw)),
      promotion = parseTearFoundryV3PromotionReceipt(JSON.parse(promotionRaw));
    if (
      active.artifactId !== monitor.promotion.artifactId ||
      active.artifactHash !== monitor.promotion.artifactHash ||
      active.activationHash !== monitor.promotion.activationHash ||
      promotion.receiptHash !== monitor.promotion.promotionReceiptHash ||
      promotion.approvalHash !== monitor.promotion.approvalHash ||
      promotion.activationHash !== active.activationHash ||
      approval.approvalHash !== promotion.approvalHash ||
      approval.candidate.id !== active.artifactId ||
      approval.candidate.artifactHash !== active.artifactHash ||
      approval.rollbackBaseline === undefined
    )
      throw new RangeError("post-promotion rollback active provenance changed");
    const actualJobRaw = await backend.get("analysis", `foundry-job:v1:${approval.job.id}`);
    if (actualJobRaw === undefined) throw new RangeError("post-promotion rollback job is unavailable");
    const job = parseTearFoundryJob(JSON.parse(actualJobRaw)),
      protocol = requireTearFoundryEvaluationProtocol(job);
    if (
      job.phase !== "monitoring" ||
      job.jobHash !== approval.job.jobHash ||
      protocol.protocolHash !== approval.job.protocolHash ||
      job.inputs.stopConditionsHash !== approval.job.stopConditionsHash ||
      monitor.policy.protocolHash !== protocol.protocolHash ||
      monitor.policy.stopConditionsHash !== job.inputs.stopConditionsHash ||
      JSON.stringify(monitor.policy.thresholds) !== JSON.stringify(protocol.thresholds)
    )
      throw new RangeError("post-promotion rollback policy changed");
    const held = await this.#custody.held(rolledBackAt);
    if (!job.inputs.corpusRecordHashes.every((entry) => held.some((record) => record.recordHash === entry)))
      throw new RangeError("post-promotion rollback custody changed");
    const baseline = approval.rollbackBaseline,
      baselineKey = `policy-activation:v1:${String(baseline.revision).padStart(12, "0")}`,
      baselineRaw = await backend.get("indexes", baselineKey);
    if (baselineRaw === undefined) throw new RangeError("post-promotion rollback baseline is unavailable");
    const baselineActivation = parseTearPolicyActivation(JSON.parse(baselineRaw));
    if (
      baselineActivation.artifactId !== baseline.artifactId ||
      baselineActivation.artifactHash !== baseline.artifactHash ||
      baselineActivation.activationHash !== baseline.activationHash ||
      baselineActivation.revision !== baseline.revision
    )
      throw new RangeError("post-promotion rollback baseline changed");
    const artifactRaw = await backend.get("analysis", `policy-artifact:v1:${baseline.artifactId}`);
    if (
      artifactRaw === undefined ||
      parseTearPolicyArtifact(JSON.parse(artifactRaw)).artifactHash !== baseline.artifactHash
    )
      throw new RangeError("post-promotion rollback baseline artifact is unavailable");
    const revision = active.revision + 1,
      draft = {
        format: "tear-policy-activation" as const,
        schemaVersion: 1 as const,
        revision,
        artifactId: baseline.artifactId,
        artifactHash: baseline.artifactHash,
        activatedAt: rolledBackAt,
        previousArtifactId: active.artifactId,
      },
      activation = Object.freeze({ ...draft, activationHash: stableVerificationHash(draft) }),
      output = receipt({
        format: "tear-foundry-v3-post-promotion-rollback",
        schemaVersion: 1,
        monitorHash,
        approvalHash: approval.approvalHash,
        promotionReceiptHash: promotion.receiptHash,
        sourceActivationHash: active.activationHash,
        rollback: {
          artifactId: activation.artifactId,
          artifactHash: activation.artifactHash,
          activationHash: activation.activationHash,
          revision,
        },
        rolledBackAt,
      });
    const custodyGuards = await Promise.all(
      held
        .filter((entry) => job.inputs.corpusRecordHashes.includes(entry.recordHash))
        .map(async (entry) =>
          guard(
            `academy-candidate-custody:v1:${entry.candidateHash}`,
            await backend.get("analysis", `academy-candidate-custody:v1:${entry.candidateHash}`),
          ),
        ),
    );
    try {
      await backend.commitIfMatches(
        Object.freeze([
          guard(ACTIVE, activeRaw),
          guard(monitorKey, monitorRaw),
          guard(`${APPROVAL}${approval.approvalHash}`, approvalRaw),
          guard(`${PROMOTION}${approval.approvalHash}`, promotionRaw),
          guard(`foundry-job:v1:${job.id}`, actualJobRaw),
          guard(baselineKey, baselineRaw, "indexes"),
          guard(`policy-artifact:v1:${baseline.artifactId}`, artifactRaw),
          guard(receiptKey, undefined),
          ...custodyGuards,
          ...(continuation?.guards(output) ?? []),
        ]),
        Object.freeze([
          { store: "analysis", key: ACTIVE, value: JSON.stringify(activation) },
          {
            store: "indexes",
            key: `policy-activation:v1:${String(revision).padStart(12, "0")}`,
            value: JSON.stringify(activation),
          },
          { store: "analysis", key: receiptKey, value: JSON.stringify(output) },
          {
            store: "indexes",
            key: `foundry-job-v3-post-promotion-rollback:${monitorHash}`,
            value: JSON.stringify(
              Object.freeze({ rolledBack: true, baselineActivationHash: activation.activationHash }),
            ),
          },
          ...(continuation?.writes(output) ?? []),
        ]),
      );
    } catch {
      throw new RangeError("post-promotion rollback lost current evidence");
    }
    return output;
  }

  async #rollbackNative(
    monitorHash: string,
    at: string,
    native: Readonly<{
      intent: TrainingOperationsV3RollbackIntentV1;
      services: Parameters<typeof trainTrainingArchiveV3Candidate>[0];
    }>,
    continuation?: TearFoundryV3PostPromotionRollbackContinuationV1,
  ): Promise<TearFoundryV3PostPromotionRollbackReceiptV1> {
    const { intentHash, ...draftIntent } = native.intent,
      intent = createTrainingOperationsV3RollbackIntent(draftIntent);
    if (
      intent.intentHash !== intentHash ||
      intent.monitorHash !== monitorHash ||
      !time(at) ||
      continuation === undefined ||
      native.services.custody !== this.#custody
    )
      throw new RangeError("native restoration requires exact explicit intent");
    const backend = this.#jobs.backend(),
      guards: GhostVaultGuard[] = [];
    const required = async (store: GhostVaultStore, key: string) => {
      const raw = await backend.get(store, key);
      if (raw === undefined) throw new RangeError("native restoration authority unavailable");
      guards.push({ store, key, expected: raw });
      return raw;
    };
    const monitor = parseTearFoundryV3PostPromotionMonitorRecord(
      JSON.parse(await required("analysis", `${MONITOR}${monitorHash}`)),
    );
    const approval = parseTearFoundryV3PromotionApprovalOrigin(
      JSON.parse(await required("analysis", `${APPROVAL}${intent.approvalHash}`)),
    );
    const promotion = parseTearFoundryV3PromotionReceipt(
      JSON.parse(await required("analysis", `${PROMOTION}${intent.approvalHash}`)),
    );
    if (
      approval.format !== "training-operations-v3-native-promotion-approval" ||
      approval.rollbackBaseline === undefined ||
      monitor.recordHash !== monitorHash ||
      monitor.classification !== "threshold-breach" ||
      (monitor.policy as unknown as Record<string, unknown>).regressionPolicy !== "classify-only-no-rollback" ||
      monitor.promotion.approvalHash !== approval.approvalHash ||
      promotion.approvalHash !== approval.approvalHash ||
      promotion.receiptHash !== intent.promotionReceiptHash ||
      monitor.promotion.promotionReceiptHash !== promotion.receiptHash ||
      promotion.activationHash !== intent.sourceActivationHash ||
      monitor.promotion.activationHash !== promotion.activationHash ||
      monitor.promotion.artifactId !== promotion.artifactId ||
      monitor.promotion.artifactHash !== promotion.artifactHash ||
      approval.candidate.id !== promotion.artifactId ||
      approval.candidate.artifactHash !== intent.candidateArtifactHash ||
      promotion.artifactHash !== intent.candidateArtifactHash ||
      approval.rollbackBaseline.activationHash !== intent.baselineActivationHash ||
      Date.parse(at) < Date.parse(monitor.recordedAt)
    )
      throw new RangeError("native restoration retained breach or intent changed");
    const capture = await new TrainingOperationsV3EvaluationExecutor(this.#jobs, native.services).captureMonitoring(
      approval.nativeOrigin.trainingSourceJobHash,
      at,
      true,
    );
    guards.push(...capture.guards);
    const job = capture.current,
      protocol = requireTearFoundryEvaluationProtocol(job);
    const authority = parseTrainingOperationsV3MonitoringAuthority(
      JSON.parse(
        await required(
          "analysis",
          `training-operations-v3-monitoring-authority:v1:${approval.nativeOrigin.authorityHash}`,
        ),
      ),
    );
    if (
      authority.authorityHash !== approval.nativeOrigin.authorityHash ||
      authority.trainingReceiptHash !== capture.training.receiptHash ||
      authority.trainingSourceJobHash !== approval.nativeOrigin.trainingSourceJobHash ||
      authority.evaluationResultHash !== capture.evaluation.result.resultHash ||
      authority.evaluationReceiptHash !== capture.evaluation.receiptHash ||
      authority.decisionReceiptHash !== capture.decision.receiptHash ||
      authority.jobHash !== job.jobHash ||
      authority.candidateArtifactHash !== intent.candidateArtifactHash ||
      authority.rollbackBaseline.activationHash !== intent.baselineActivationHash ||
      job.jobHash !== intent.jobHash ||
      job.jobHash !== approval.job.jobHash ||
      protocol.protocolHash !== approval.job.protocolHash ||
      monitor.policy.protocolHash !== protocol.protocolHash ||
      monitor.policy.stopConditionsHash !== job.inputs.stopConditionsHash ||
      JSON.stringify(monitor.policy.thresholds) !== JSON.stringify(protocol.thresholds)
    )
      throw new RangeError("native restoration current job or source evidence changed");
    const monitorIndexKey = `foundry-job-v3-post-promotion-monitor:${promotion.artifactHash}:${monitorHash}`;
    const monitorIndexRaw = await required("indexes", monitorIndexKey);
    const budget = (await trainingOperationsJobBudgetAuthority(backend, job)).budget;
    const monitorRaw = guards.find(
      (guard) => guard.store === "analysis" && guard.key === `${MONITOR}${monitorHash}`,
    )?.expected;
    if (
      budget !== undefined &&
      ![
        ["analysis", `${MONITOR}${monitorHash}`, monitorRaw],
        ["indexes", monitorIndexKey, monitorIndexRaw],
      ].every(([store, key, raw]) =>
        budget.records.some(
          (row) => row.store === store && row.key === key && row.valueHash === stableVerificationHash(raw),
        ),
      )
    )
      throw new RangeError("native restoration observation belongs to another writer");
    const promotedActivation = parseTearPolicyActivation(
      JSON.parse(await required("indexes", `policy-activation:v1:${String(promotion.revision).padStart(12, "0")}`)),
    );
    if (
      promotedActivation.activationHash !== promotion.activationHash ||
      promotedActivation.artifactHash !== promotion.artifactHash ||
      promotedActivation.artifactId !== promotion.artifactId ||
      Date.parse(monitor.recordedAt) < Date.parse(promotion.promotedAt)
    )
      throw new RangeError("native restoration promotion history changed");
    const event = job.events.at(-1);
    if (
      event === undefined ||
      (await required("analysis", `foundry-job-event:v1:${job.id}:${String(event.sequence)}:${event.eventHash}`)) !==
        JSON.stringify(event) ||
      (await required("indexes", `foundry-job-current:${job.id}`)) !==
        JSON.stringify({ jobHash: job.jobHash, phase: job.phase })
    )
      throw new RangeError("native restoration durable head changed");
    const version5 = await backend.get("analysis", `training-operations-execution-binding:v5:${intent.bindingHash}`);
    const version6 = await backend.get("analysis", `training-operations-execution-binding:v6:${intent.bindingHash}`);
    if ((version5 === undefined) === (version6 === undefined))
      throw new RangeError("native restoration source binding unavailable or ambiguous");
    const source = parseTrainingOperationsExecutionBinding(JSON.parse(version6 ?? version5 ?? ""));
    guards.push(
      guard(`training-operations-execution-binding:v5:${intent.bindingHash}`, version5),
      guard(`training-operations-execution-binding:v6:${intent.bindingHash}`, version6),
    );
    const schedule = parseTearFoundryJobSchedule(
      JSON.parse(await required("analysis", `foundry-job-schedule:v1:${source.schedule.id}`)),
    );
    const pointerKey = `training-operations-execution-binding-current:v${String(source.schemaVersion)}:${schedule.id}:${String(schedule.revision)}:${schedule.scheduleHash}`;
    const pointer = await required("analysis", pointerKey),
      current = parseTrainingOperationsExecutionBinding(
        JSON.parse(
          await required(
            "analysis",
            `training-operations-execution-binding:v${String(source.schemaVersion)}:${pointer}`,
          ),
        ),
      );
    const receiptKey = `${RECEIPT}${monitorHash}`,
      priorRaw = await backend.get("analysis", receiptKey);
    const prior =
      priorRaw === undefined ? undefined : parseTearFoundryV3PostPromotionRollbackReceipt(JSON.parse(priorRaw));
    if (
      source.step !== "promoted" ||
      source.bindingHash !== intent.bindingHash ||
      source.job.jobHash !== job.jobHash ||
      source.sourceJob.jobHash !== approval.nativeOrigin.trainingSourceJobHash ||
      source.promotion?.approvalHash !== approval.approvalHash ||
      source.promotion.receiptHash !== promotion.receiptHash ||
      source.promotion.activationHash !== promotion.activationHash ||
      schedule.state !== "disabled" ||
      schedule.scheduleHash !== intent.scheduleHash ||
      source.schedule.scheduleHash !== schedule.scheduleHash ||
      source.schedule.revision !== schedule.revision ||
      schedule.jobHash !== job.jobHash ||
      current.bindingHash !== pointer ||
      (prior === undefined
        ? pointer !== source.bindingHash
        : current.step !== "restored" ||
          current.previousBindingHash !== source.bindingHash ||
          current.restoration?.receiptHash !== prior.receiptHash ||
          current.restoration.intentHash !== intentHash)
    )
      throw new RangeError("native restoration current binding or intent changed");
    const active = parseTearPolicyActivation(JSON.parse(await required("analysis", ACTIVE))),
      baseline = authority.rollbackBaseline;
    if (
      JSON.stringify(approval.rollbackBaseline) !==
        JSON.stringify({
          revision: baseline.revision,
          artifactId: baseline.artifactId,
          artifactHash: baseline.artifactHash,
          activationHash: baseline.activationHash,
        }) ||
      (await required("indexes", `policy-activation:v1:${String(baseline.revision).padStart(12, "0")}`)) !==
        JSON.stringify(baseline) ||
      parseTearPolicyArtifact(JSON.parse(await required("analysis", `policy-artifact:v1:${baseline.artifactId}`)))
        .artifactHash !== baseline.artifactHash ||
      (await required("indexes", `foundry-job-v3-post-promotion-monitor:${promotion.artifactHash}:${monitorHash}`)) !==
        JSON.stringify({ classification: monitor.classification, active: true, aggregateOnly: true })
    )
      throw new RangeError("native restoration frozen baseline or observation index changed");
    const revision = promotion.revision + 1,
      activationDraft = {
        format: "tear-policy-activation" as const,
        schemaVersion: 1 as const,
        revision,
        artifactId: baseline.artifactId,
        artifactHash: baseline.artifactHash,
        activatedAt: prior?.rolledBackAt ?? at,
        previousArtifactId: promotion.artifactId,
      };
    const activation = { ...activationDraft, activationHash: stableVerificationHash(activationDraft) };
    const output =
      prior ??
      receipt({
        format: "tear-foundry-v3-post-promotion-rollback",
        schemaVersion: 1,
        monitorHash,
        approvalHash: approval.approvalHash,
        promotionReceiptHash: promotion.receiptHash,
        sourceActivationHash: promotion.activationHash,
        rollback: {
          artifactId: baseline.artifactId,
          artifactHash: baseline.artifactHash,
          activationHash: activation.activationHash,
          revision,
        },
        rolledBackAt: at,
      });
    if (
      prior === undefined
        ? active.activationHash !== promotion.activationHash
        : active.activationHash !== activation.activationHash ||
          Date.parse(at) < Date.parse(output.rolledBackAt) ||
          output.monitorHash !== monitorHash ||
          output.approvalHash !== approval.approvalHash ||
          output.promotionReceiptHash !== promotion.receiptHash ||
          output.sourceActivationHash !== promotion.activationHash ||
          JSON.stringify(output.rollback) !==
            JSON.stringify({
              artifactId: baseline.artifactId,
              artifactHash: baseline.artifactHash,
              activationHash: activation.activationHash,
              revision,
            })
    )
      throw new RangeError("native restoration active successor changed");
    const base = [
      { store: "analysis" as const, key: receiptKey, value: JSON.stringify(output) },
      {
        store: "indexes" as const,
        key: `foundry-job-v3-post-promotion-rollback:${monitorHash}`,
        value: JSON.stringify({ rolledBack: true, baselineActivationHash: activation.activationHash }),
      },
    ];
    const extras = continuation.writes(output),
      extraGuards = continuation.guards(output),
      identities = new Set(base.map((write) => `${write.store}:${write.key}`));
    for (const write of extras) {
      if (
        identities.has(`${write.store}:${write.key}`) ||
        !["analysis", "indexes"].includes(write.store) ||
        !["training-operations-execution-binding", "training-operations-v3-post-promotion-cycle:"].some((prefix) =>
          write.key.startsWith(prefix),
        ) ||
        !extraGuards.some((guard) => guard.store === write.store && guard.key === write.key)
      )
        throw new RangeError("native restoration continuation cannot replace authority");
      identities.add(`${write.store}:${write.key}`);
    }
    const writes = [...base, ...extras],
      activationIndex = `policy-activation:v1:${String(revision).padStart(12, "0")}`;
    if (
      prior !== undefined &&
      budget !== undefined &&
      !writes.every((write) =>
        budget.records.some(
          (row) =>
            row.store === write.store &&
            row.key === write.key &&
            row.valueHash === stableVerificationHash(write.value) &&
            row.bytes === new TextEncoder().encode(write.store + write.key + write.value).byteLength,
        ),
      )
    )
      throw new RangeError("native restoration retained output budget ownership changed");
    if (prior !== undefined)
      await commitTrainingOperationsJobWrites(
        backend,
        job,
        [
          ...guards,
          ...extraGuards,
          ...writes.map((write) => ({ store: write.store, key: write.key, expected: write.value })),
          { store: "indexes", key: activationIndex, expected: JSON.stringify(activation) },
        ],
        [],
      );
    else
      await commitTrainingOperationsPromotionWrites(
        backend,
        job,
        [
          ...guards,
          ...extraGuards,
          ...base.map((write) => ({ store: write.store, key: write.key })),
          { store: "indexes", key: activationIndex },
        ],
        writes,
        [
          { store: "analysis", key: ACTIVE, value: JSON.stringify(activation) },
          { store: "indexes", key: activationIndex, value: JSON.stringify(activation) },
        ],
      );
    return output;
  }
}

import { stableVerificationHash } from "../replay/hash";
import { parseTearPolicyActivation, type TearPolicyActivationV1 } from "./policy-artifact-registry";
import { requireTearFoundryEvaluationProtocol } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import type { trainTrainingArchiveV3Candidate } from "./training-archive-v3-candidate-training";
import { TrainingOperationsV3EvaluationExecutor } from "./training-operations-v3-evaluation";
import { trainingOperationsJobBudgetAuthority } from "./training-operations-budget";
import type { TrainingOperationsV3Guard } from "./training-operations-v3-commit";
import type { TearFoundryV3PromotionReceiptV1 } from "./foundry-job-v3-promotion";

type Services = Parameters<typeof trainTrainingArchiveV3Candidate>[0];
export interface TrainingOperationsV3MonitoringAuthorityV1 {
  readonly format: "training-operations-v3-monitoring-authority";
  readonly schemaVersion: 1;
  readonly trainingSourceJobHash: string;
  readonly trainingReceiptHash: string;
  readonly evaluationReceiptHash: string;
  readonly evaluationResultHash: string;
  readonly decisionReceiptHash: string;
  readonly jobHash: string;
  readonly candidateArtifactHash: string;
  readonly rollbackBaseline: TearPolicyActivationV1;
  readonly recordedAt: string;
  readonly authorityHash: string;
}
export function parseTrainingOperationsV3MonitoringAuthority(
  value: unknown,
): TrainingOperationsV3MonitoringAuthorityV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("invalid native monitoring authority");
  const typed = value as TrainingOperationsV3MonitoringAuthorityV1,
    { authorityHash, ...draft } = typed;
  const raw = value as Record<string, unknown>;
  const keys = [
    "format",
    "schemaVersion",
    "trainingSourceJobHash",
    "trainingReceiptHash",
    "evaluationReceiptHash",
    "evaluationResultHash",
    "decisionReceiptHash",
    "jobHash",
    "candidateArtifactHash",
    "rollbackBaseline",
    "recordedAt",
    "authorityHash",
  ];
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    raw.format !== "training-operations-v3-monitoring-authority" ||
    raw.schemaVersion !== 1 ||
    ![
      authorityHash,
      typed.trainingSourceJobHash,
      typed.trainingReceiptHash,
      typed.evaluationReceiptHash,
      typed.evaluationResultHash,
      typed.decisionReceiptHash,
      typed.jobHash,
      typed.candidateArtifactHash,
    ].every((entry) => typeof entry === "string" && /^[a-f0-9]{16}$/u.test(entry)) ||
    !Number.isFinite(Date.parse(typed.recordedAt)) ||
    authorityHash !== stableVerificationHash(draft)
  )
    throw new TypeError("native monitoring integrity mismatch");
  parseTearPolicyActivation(typed.rollbackBaseline);
  return Object.freeze(structuredClone(typed));
}

/** Revalidates native evidence and source authority. Captured guards must join the final transaction. */
export class TrainingOperationsV3MonitoringAuthority {
  constructor(
    readonly jobs: TearFoundryJobVault,
    readonly services: Services,
  ) {}
  async capture(
    sourceHash: string,
    at: string,
    prior?: TrainingOperationsV3MonitoringAuthorityV1,
    promotion?: TearFoundryV3PromotionReceiptV1,
  ) {
    const captured = await new TrainingOperationsV3EvaluationExecutor(this.jobs, this.services).captureMonitoring(
      sourceHash,
      at,
      promotion !== undefined,
    );
    const { current: job, training, evaluation, decision, guards } = captured,
      backend = this.jobs.backend();
    const pin = async (store: TrainingOperationsV3Guard["store"], key: string) => {
      const raw = await backend.get(store, key);
      if (raw === undefined) throw new RangeError("native monitoring durable authority unavailable");
      guards.push({ store, key, expected: raw });
      return raw;
    };
    const event = job.events.at(-1);
    if (
      event === undefined ||
      (await pin("analysis", `foundry-job-event:v1:${job.id}:${String(event.sequence)}:${event.eventHash}`)) !==
        JSON.stringify(event) ||
      (await pin("indexes", `foundry-job-current:${job.id}`)) !==
        JSON.stringify({ jobHash: job.jobHash, phase: job.phase })
    )
      throw new RangeError("native monitoring durable head changed");
    const active = parseTearPolicyActivation(JSON.parse(await pin("analysis", "policy-active:v1")));
    const baseline = prior?.rollbackBaseline ?? active;
    if (
      baseline.artifactId !== captured.champion.id ||
      baseline.artifactHash !== captured.champion.artifactHash ||
      baseline.artifactId === training.evidence.candidate.artifact.id ||
      (promotion === undefined
        ? active.activationHash !== baseline.activationHash
        : active.activationHash !== promotion.activationHash ||
          active.artifactId !== promotion.artifactId ||
          active.artifactHash !== promotion.artifactHash ||
          active.revision !== baseline.revision + 1 ||
          promotion.artifactHash !== training.evidence.candidate.artifact.artifactHash)
    ) {
      throw new RangeError("native monitoring rollback or active authority changed");
    }
    if (
      (await pin("indexes", `policy-activation:v1:${String(baseline.revision).padStart(12, "0")}`)) !==
      JSON.stringify(baseline)
    )
      throw new RangeError("native monitoring rollback index changed");
    const authority = await trainingOperationsJobBudgetAuthority(backend, job);
    guards.push(...authority.guards);
    const draft = {
      format: "training-operations-v3-monitoring-authority" as const,
      schemaVersion: 1 as const,
      trainingSourceJobHash: sourceHash,
      trainingReceiptHash: training.receiptHash,
      evaluationReceiptHash: evaluation.receiptHash,
      evaluationResultHash: evaluation.result.resultHash,
      decisionReceiptHash: decision.receiptHash,
      jobHash: job.jobHash,
      candidateArtifactHash: training.evidence.candidate.artifact.artifactHash,
      rollbackBaseline: baseline,
      recordedAt: prior?.recordedAt ?? at,
    };
    const receipt = parseTrainingOperationsV3MonitoringAuthority({
      ...draft,
      authorityHash: stableVerificationHash(draft),
    });
    if (prior !== undefined && JSON.stringify(receipt) !== JSON.stringify(prior))
      throw new RangeError("native monitoring retained lineage changed");
    return { ...captured, receipt, protocol: requireTearFoundryEvaluationProtocol(job) };
  }
}

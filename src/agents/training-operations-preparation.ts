import { stableVerificationHash } from "../replay/hash";

/** An in-progress authoring reservation is separate from the live V5 owner. */
export const trainingOperationsPreparationKey = (scheduleId: string): string =>
  `training-operations-preparation:v1:${scheduleId}`;
export const trainingOperationsLaunchReceiptKey = (actionHash: string): string =>
  `training-operations-launch-receipt:v1:${actionHash}`;

export interface TrainingOperationsLaunchReceiptV1 {
  readonly format: "training-operations-launch-receipt";
  readonly schemaVersion: 1;
  readonly actionHash: string;
  readonly preparationHash: string;
  readonly scheduleId: string;
  readonly scheduleHash: string;
  readonly jobHash: string;
  readonly bindingHash: string;
  readonly enabledAt: string;
  readonly receiptHash: string;
}

export function createTrainingOperationsLaunchReceipt(
  input: Omit<TrainingOperationsLaunchReceiptV1, "format" | "schemaVersion" | "receiptHash">,
): TrainingOperationsLaunchReceiptV1 {
  if (
    ![input.actionHash, input.preparationHash, input.scheduleHash, input.jobHash, input.bindingHash].every(
      (value) => typeof value === "string" && /^[a-f0-9]{16}$/u.test(value),
    ) ||
    typeof input.scheduleId !== "string" ||
    input.scheduleId.trim().length === 0 ||
    typeof input.enabledAt !== "string" ||
    !Number.isFinite(Date.parse(input.enabledAt))
  )
    throw new TypeError("invalid Training Operations launch receipt");
  const draft = {
    format: "training-operations-launch-receipt" as const,
    schemaVersion: 1 as const,
    actionHash: input.actionHash,
    preparationHash: input.preparationHash,
    scheduleId: input.scheduleId,
    scheduleHash: input.scheduleHash,
    jobHash: input.jobHash,
    bindingHash: input.bindingHash,
    enabledAt: input.enabledAt,
  };
  return Object.freeze({ ...draft, receiptHash: stableVerificationHash(draft) });
}

export function parseTrainingOperationsLaunchReceipt(value: unknown): TrainingOperationsLaunchReceiptV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("invalid Training Operations launch receipt");
  const source = value as Record<string, unknown>,
    parsed = createTrainingOperationsLaunchReceipt(value as TrainingOperationsLaunchReceiptV1);
  if (
    source.format !== parsed.format ||
    source.schemaVersion !== parsed.schemaVersion ||
    source.receiptHash !== parsed.receiptHash ||
    Object.keys(source).length !== Object.keys(parsed).length
  )
    throw new TypeError("Training Operations launch receipt integrity mismatch");
  return parsed;
}

export interface TrainingOperationsPreparationV1 {
  readonly format: "training-operations-preparation";
  readonly schemaVersion: 1;
  readonly actionHash: string;
  readonly profileHash: string;
  readonly scheduleId: string;
  readonly jobId: string;
  readonly inputsHash: string;
  readonly requestHash: string;
  readonly evaluationPlanHash: string;
  readonly actor: string;
  readonly preparedAt: string;
  readonly preparationHash: string;
}

export function createTrainingOperationsPreparation(
  input: Omit<TrainingOperationsPreparationV1, "format" | "schemaVersion" | "preparationHash">,
): TrainingOperationsPreparationV1 {
  const hash = (value: unknown): boolean => typeof value === "string" && /^[a-f0-9]{16}$/u.test(value);
  const text = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;
  if (
    ![input.actionHash, input.profileHash, input.inputsHash, input.requestHash, input.evaluationPlanHash].every(hash) ||
    ![input.scheduleId, input.jobId, input.actor, input.preparedAt].every(text) ||
    !Number.isFinite(Date.parse(input.preparedAt))
  ) {
    throw new TypeError("invalid Training Operations preparation");
  }
  const draft = Object.freeze({
    format: "training-operations-preparation" as const,
    schemaVersion: 1 as const,
    actionHash: input.actionHash,
    profileHash: input.profileHash,
    scheduleId: input.scheduleId,
    jobId: input.jobId,
    inputsHash: input.inputsHash,
    requestHash: input.requestHash,
    evaluationPlanHash: input.evaluationPlanHash,
    actor: input.actor,
    preparedAt: input.preparedAt,
  });
  return Object.freeze({ ...draft, preparationHash: stableVerificationHash(draft) });
}

export function parseTrainingOperationsPreparation(value: unknown): TrainingOperationsPreparationV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("invalid Training Operations preparation");
  const input = value as Record<string, unknown>;
  const parsed = createTrainingOperationsPreparation(value as TrainingOperationsPreparationV1);
  if (
    input.format !== parsed.format ||
    input.schemaVersion !== parsed.schemaVersion ||
    input.preparationHash !== parsed.preparationHash ||
    Object.keys(input).length !== Object.keys(parsed).length
  )
    throw new TypeError("Training Operations preparation integrity mismatch");
  return parsed;
}

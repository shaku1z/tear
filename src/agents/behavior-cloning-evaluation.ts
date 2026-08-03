import { stableVerificationHash } from "../replay/hash";
import {
  createTearBehaviorCloningBatches,
  type TearBehaviorCloningNormalizationV1,
  type TearBehaviorCloningSplit,
} from "./academy-behavior-cloning-batches";
import type { TearAcademyTrainingDatasetV1 } from "./academy-training-dataset";
import {
  predictTearBehaviorCloningClass,
  type TearBehaviorCloningTrainingResultV1,
} from "./behavior-cloning-trainer";

export type TearBehaviorCloningHeldoutSplit = Exclude<TearBehaviorCloningSplit, "training">;

export interface TearBehaviorCloningEvaluationRequestV1 {
  readonly split: TearBehaviorCloningHeldoutSplit;
  readonly batchSize: number;
}

export interface TearBehaviorCloningEvaluationV1 {
  readonly format: "tear-behavior-cloning-evaluation";
  readonly schemaVersion: 1;
  readonly trainingHash: string;
  readonly datasetHash: string;
  readonly normalizationHash: string;
  readonly split: TearBehaviorCloningHeldoutSplit;
  readonly batchCount: number;
  readonly examples: number;
  readonly exactActionMatches: number;
  readonly actionConformance: number;
  readonly reportHash: string;
}

function heldoutSplit(value: string): value is TearBehaviorCloningHeldoutSplit {
  return value === "validation" || value === "calibration" || value === "test";
}

/**
 * Scores a persisted C33 fit only against one governed, non-training split.
 * This reports replayed demonstration action agreement, not gameplay quality,
 * eligibility, promotion, or a replacement for C35 ladder evaluation.
 */
export function evaluateTearBehaviorCloningPolicy(
  training: TearBehaviorCloningTrainingResultV1,
  dataset: TearAcademyTrainingDatasetV1,
  normalization: TearBehaviorCloningNormalizationV1,
  request: TearBehaviorCloningEvaluationRequestV1,
): TearBehaviorCloningEvaluationV1 {
  if (!heldoutSplit(request.split) || !Number.isSafeInteger(request.batchSize) || request.batchSize < 1 || request.batchSize > 256) {
    throw new TypeError("behavior cloning evaluation requires a bounded held-out split");
  }
  if (training.datasetHash !== dataset.datasetHash || training.normalizationHash !== normalization.normalizationHash
    || training.model.featureSchemaHash !== normalization.featureSchemaHash
    || training.model.mean.length !== normalization.mean.length || training.model.scale.length !== normalization.scale.length) {
    throw new RangeError("behavior cloning evaluation lineage does not match its fit");
  }
  const batches = createTearBehaviorCloningBatches(dataset, normalization, request);
  const examples = batches.flatMap((batch) => batch.examples);
  const exactActionMatches = examples.filter((example) => {
    const index = predictTearBehaviorCloningClass(training.model, example.features);
    const predicted = training.model.classes[index]?.actions;
    return predicted !== undefined && stableVerificationHash(predicted) === stableVerificationHash(example.targetActions);
  }).length;
  const draft = {
    format: "tear-behavior-cloning-evaluation" as const,
    schemaVersion: 1 as const,
    trainingHash: training.trainingHash,
    datasetHash: dataset.datasetHash,
    normalizationHash: normalization.normalizationHash,
    split: request.split,
    batchCount: batches.length,
    examples: examples.length,
    exactActionMatches,
    actionConformance: exactActionMatches / examples.length,
  };
  return Object.freeze({ ...draft, reportHash: stableVerificationHash(draft) });
}

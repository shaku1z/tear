import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyTrainingDatasetV1, TearAcademyTrainingSequenceV1 } from "./academy-training-dataset";
import { TEAR_POLICY_FEATURES_V1, TEAR_POLICY_FEATURE_SCHEMA_HASH_V1, projectCanonicalPolicyFeatures } from "./policy-feature-vector";

export const TEAR_BEHAVIOR_CLONING_FEATURES_V1 = TEAR_POLICY_FEATURES_V1;

export type TearBehaviorCloningSplit = "training" | "validation" | "calibration" | "test";

export interface TearBehaviorCloningNormalizationV1 {
  readonly format: "tear-behavior-cloning-normalization";
  readonly schemaVersion: 1;
  readonly datasetHash: string;
  readonly featureSchemaHash: string;
  readonly sampleCount: number;
  readonly mean: readonly number[];
  readonly scale: readonly number[];
  readonly normalizationHash: string;
}

export interface TearBehaviorCloningExampleV1 {
  readonly candidateHash: string;
  readonly tick: number;
  readonly features: readonly number[];
  readonly targetActions: readonly GameAction[];
}

export interface TearBehaviorCloningBatchV1 {
  readonly split: TearBehaviorCloningSplit;
  readonly index: number;
  readonly examples: readonly TearBehaviorCloningExampleV1[];
  readonly batchHash: string;
}

export interface TearBehaviorCloningBatchRequestV1 {
  readonly split: TearBehaviorCloningSplit;
  readonly batchSize: number;
}

function assertDataset(dataset: TearAcademyTrainingDatasetV1): void {
  if (dataset.sequences.length < 1 || dataset.datasetHash !== stableVerificationHash({ format: dataset.format, schemaVersion: dataset.schemaVersion, manifest: dataset.manifest,
      sequences: dataset.sequences, observationCount: dataset.observationCount, actionCount: dataset.actionCount })) {
    throw new TypeError("invalid Academy behavior cloning dataset");
  }
}
function sequences(dataset: TearAcademyTrainingDatasetV1, split: TearBehaviorCloningSplit): readonly TearAcademyTrainingSequenceV1[] {
  return Object.freeze(dataset.sequences.filter((sequence) => sequence.split === split)
    .sort((left, right) => left.candidateHash.localeCompare(right.candidateHash)));
}

/** Fits feature normalization from the training split only; held-out splits never influence it. */
export function createTearBehaviorCloningNormalization(dataset: TearAcademyTrainingDatasetV1): TearBehaviorCloningNormalizationV1 {
  assertDataset(dataset);
  const training = sequences(dataset, "training"), samples = training.flatMap((sequence) => sequence.tracks.observations.map(projectCanonicalPolicyFeatures));
  if (samples.length < 1) throw new RangeError("behavior cloning normalization requires a training split");
  const mean = TEAR_BEHAVIOR_CLONING_FEATURES_V1.map((_, index) => samples.reduce((sum, entry) => sum + (entry[index] ?? 0), 0) / samples.length);
  const scale = TEAR_BEHAVIOR_CLONING_FEATURES_V1.map((_, index) => {
    const variance = samples.reduce((sum, entry) => { const delta = (entry[index] ?? 0) - (mean[index] ?? 0); return sum + delta * delta; }, 0) / samples.length;
    return Math.sqrt(variance) || 1;
  });
  const draft = { format: "tear-behavior-cloning-normalization" as const, schemaVersion: 1 as const, datasetHash: dataset.datasetHash,
    featureSchemaHash: TEAR_POLICY_FEATURE_SCHEMA_HASH_V1, sampleCount: samples.length, mean: Object.freeze(mean), scale: Object.freeze(scale) };
  return Object.freeze({ ...draft, normalizationHash: stableVerificationHash(draft) });
}

function assertNormalization(dataset: TearAcademyTrainingDatasetV1, value: TearBehaviorCloningNormalizationV1): void {
  if (value.datasetHash !== dataset.datasetHash || value.featureSchemaHash !== TEAR_POLICY_FEATURE_SCHEMA_HASH_V1 || value.mean.length !== TEAR_BEHAVIOR_CLONING_FEATURES_V1.length
    || value.scale.length !== TEAR_BEHAVIOR_CLONING_FEATURES_V1.length || value.mean.some((entry) => !Number.isFinite(entry))
    || value.scale.some((entry) => !Number.isFinite(entry) || entry <= 0)
    || value.normalizationHash !== stableVerificationHash({ format: value.format, schemaVersion: value.schemaVersion, datasetHash: value.datasetHash,
      featureSchemaHash: value.featureSchemaHash, sampleCount: value.sampleCount, mean: value.mean, scale: value.scale })) {
    throw new TypeError("invalid behavior cloning normalization");
  }
}
function examples(sequence: TearAcademyTrainingSequenceV1, normalization: TearBehaviorCloningNormalizationV1): readonly TearBehaviorCloningExampleV1[] {
  return Object.freeze([...sequence.tracks.observations].sort((left, right) => left.tick - right.tick).map((state) => {
    const raw = projectCanonicalPolicyFeatures(state), features = Object.freeze(raw.map((value, index) => (value - (normalization.mean[index] ?? 0)) / (normalization.scale[index] ?? 1)));
    const targetActions = Object.freeze(sequence.tracks.actions.filter((entry) => entry.tick === state.tick + 1).map((entry) => Object.freeze(structuredClone(entry.command))));
    return Object.freeze({ candidateHash: sequence.candidateHash, tick: state.tick, features, targetActions });
  }));
}

/** Creates stable batches while preserving an explicit held-out split boundary. */
export function createTearBehaviorCloningBatches(
  dataset: TearAcademyTrainingDatasetV1,
  normalization: TearBehaviorCloningNormalizationV1,
  request: TearBehaviorCloningBatchRequestV1,
): readonly TearBehaviorCloningBatchV1[] {
  assertDataset(dataset); assertNormalization(dataset, normalization);
  if (!Number.isSafeInteger(request.batchSize) || request.batchSize < 1 || request.batchSize > 256
    || !["training", "validation", "calibration", "test"].includes(request.split)) throw new TypeError("invalid behavior cloning batch request");
  const entries = sequences(dataset, request.split).flatMap((sequence) => examples(sequence, normalization));
  if (entries.length < 1) throw new RangeError(`behavior cloning ${request.split} split has no examples`);
  const batches: TearBehaviorCloningBatchV1[] = [];
  for (let offset = 0; offset < entries.length; offset += request.batchSize) {
    const values = Object.freeze(entries.slice(offset, offset + request.batchSize));
    const draft = { split: request.split, index: batches.length, examples: values };
    batches.push(Object.freeze({ ...draft, batchHash: stableVerificationHash(draft) }));
  }
  return Object.freeze(batches);
}

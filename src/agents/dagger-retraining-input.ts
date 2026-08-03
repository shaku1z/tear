import { stableVerificationHash } from "../replay/hash";
import type { GameAction } from "../input/game-action";
import type { TearBehaviorCloningNormalizationV1 } from "./academy-behavior-cloning-batches";
import type { TearAcademyTrainingDatasetV1 } from "./academy-training-dataset";
import type { TearDaggerCorrectionCaptureV1 } from "./dagger-correction-capture";
import type { TearDaggerCorrectionReviewV1 } from "./dagger-correction-review";

export interface TearDaggerRetrainingExampleV1 {
  readonly correctionHash: string;
  readonly features: readonly number[];
  readonly targetActions: readonly GameAction[];
}
export interface TearDaggerRetrainingInputV1 {
  readonly format: "tear-dagger-retraining-input";
  readonly schemaVersion: 1;
  readonly datasetHash: string;
  readonly normalizationHash: string;
  readonly captureHash: string;
  readonly acceptedReviewHashes: readonly string[];
  readonly examples: readonly TearDaggerRetrainingExampleV1[];
  readonly inputHash: string;
}

/** Builds an immutable augmentation from exactly the accepted corrections in one capture. */
export function createTearDaggerRetrainingInput(
  dataset: TearAcademyTrainingDatasetV1,
  normalization: TearBehaviorCloningNormalizationV1,
  capture: TearDaggerCorrectionCaptureV1,
  reviews: readonly TearDaggerCorrectionReviewV1[],
): TearDaggerRetrainingInputV1 {
  if (normalization.datasetHash !== dataset.datasetHash || reviews.some((review) => review.captureHash !== capture.captureHash
    || review.artifactHash !== capture.artifact.hash || review.disposition !== "accepted")) {
    throw new RangeError("DAgger retraining input requires matching accepted correction reviews");
  }
  const approved = new Map(reviews.map((review) => [review.correctionHash, review]));
  if (approved.size !== reviews.length) throw new TypeError("DAgger retraining input repeats a correction review");
  const examples = capture.corrections.filter((correction) => approved.has(correction.correctionHash)).map((correction) => Object.freeze({
    correctionHash: correction.correctionHash,
    features: Object.freeze(correction.features.map((value, index) => (value - (normalization.mean[index] ?? 0)) / (normalization.scale[index] ?? 1))),
    targetActions: Object.freeze(structuredClone(correction.teacherActions)),
  })).sort((left, right) => left.correctionHash.localeCompare(right.correctionHash));
  if (examples.length < 1 || examples.length > 256) throw new RangeError("DAgger retraining input requires bounded approved corrections");
  const draft = { format: "tear-dagger-retraining-input" as const, schemaVersion: 1 as const, datasetHash: dataset.datasetHash,
    normalizationHash: normalization.normalizationHash, captureHash: capture.captureHash,
    acceptedReviewHashes: Object.freeze([...reviews].map((review) => review.reviewHash).sort()), examples: Object.freeze(examples) };
  return Object.freeze({ ...draft, inputHash: stableVerificationHash(draft) });
}

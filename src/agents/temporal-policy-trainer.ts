import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import type { TearBehaviorCloningNormalizationV1 } from "./academy-behavior-cloning-batches";
import type { TearAcademyTrainingDatasetV1 } from "./academy-training-dataset";
import type { TearBehaviorCloningTrainingConfigV1 } from "./behavior-cloning-trainer";
import { createTearPolicyArtifact, type TearPolicyArtifactDraft, type TearPolicyArtifactV1 } from "./policy-artifact-registry";
import { TEAR_POLICY_FEATURE_SCHEMA_HASH_V1, TEAR_POLICY_FEATURE_WIDTH_V1 } from "./policy-feature-vector";
import { createTearTemporalPolicyContexts } from "./temporal-policy-context";
import { TEAR_POLICY_CONDITION_SCHEMA_HASH_V2, TEAR_POLICY_CONDITION_WIDTH_V2 } from "./policy-condition-vector";
import type { TearDaggerCorrectionCaptureV1 } from "./dagger-correction-capture";
import type { TearDaggerCorrectionReviewV1 } from "./dagger-correction-review";

export interface TearTemporalPolicyTrainingConfigV1 extends TearBehaviorCloningTrainingConfigV1 {
  readonly window: number;
  readonly conditionSchemaHash: string;
  readonly conditionWidth: number;
}

export interface TearTemporalWindowLinearModelV1 {
  readonly format: "tear-temporal-window-linear-policy-model";
  readonly schemaVersion: 1;
  readonly featureSchemaHash: string;
  readonly window: number;
  readonly mean: readonly number[];
  readonly scale: readonly number[];
  readonly classes: readonly Readonly<{ actions: readonly GameAction[] }>[];
  readonly weights: readonly (readonly number[])[];
  readonly biases: readonly number[];
}

export interface TearTemporalPolicyTrainingResultV1 {
  readonly format: "tear-temporal-policy-training";
  readonly schemaVersion: 1;
  readonly datasetHash: string;
  readonly normalizationHash: string;
  readonly augmentationHash?: string;
  /** Exact governed training episode identities; later unseen-seed evaluation rejects overlap. */
  readonly trainingScenarioHashes: readonly string[];
  readonly config: TearTemporalPolicyTrainingConfigV1;
  readonly model: TearTemporalWindowLinearModelV1;
  readonly metrics: Readonly<{ examples: number; classes: number; updates: number; trainingAccuracy: number }>;
  readonly trainingHash: string;
}

export interface TearTemporalDaggerRetrainingInputV1 {
  readonly format: "tear-temporal-dagger-retraining-input";
  readonly schemaVersion: 1;
  readonly datasetHash: string;
  readonly normalizationHash: string;
  readonly captureHash: string;
  /** Source-world scenarios whose corrections become fit input and must stay held out of evaluation. */
  readonly sourceScenarioHashes: readonly string[];
  readonly window: number;
  readonly acceptedReviewHashes: readonly string[];
  readonly examples: readonly Readonly<{ correctionHash: string; features: readonly number[]; targetActions: readonly GameAction[] }>[];
  readonly inputHash: string;
}

function validConfig(config: TearTemporalPolicyTrainingConfigV1): boolean {
  return Number.isSafeInteger(config.seed) && config.seed >= 0 && Number.isSafeInteger(config.epochs) && config.epochs >= 1 && config.epochs <= 128
    && Number.isFinite(config.learningRate) && config.learningRate > 0 && config.learningRate <= 1
    && Number.isSafeInteger(config.batchSize) && config.batchSize >= 1 && config.batchSize <= 256
    && Number.isSafeInteger(config.window) && config.window >= 1 && config.window <= 64
    && config.conditionSchemaHash === TEAR_POLICY_CONDITION_SCHEMA_HASH_V2
    && config.conditionWidth === TEAR_POLICY_CONDITION_WIDTH_V2;
}
function actionKey(actions: readonly GameAction[]): string { return stableVerificationHash(actions); }
function trainingScenarioHashes(dataset: TearAcademyTrainingDatasetV1, augmentation?: TearTemporalDaggerRetrainingInputV1): readonly string[] {
  const hashes = dataset.sequences.filter((entry) => entry.split === "training").map((entry) => {
    if (entry.sourceScenario === undefined) throw new RangeError("temporal policy training requires source scenario identity");
    return stableVerificationHash(entry.sourceScenario);
  });
  return Object.freeze([...new Set([...hashes, ...(augmentation?.sourceScenarioHashes ?? [])])].sort());
}
function predict(weights: readonly (readonly number[])[], biases: readonly number[], features: readonly number[]): number {
  let selected = 0, best = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < weights.length; index += 1) {
    const score = (weights[index] ?? []).reduce((sum, weight, featureIndex) => sum + weight * (features[featureIndex] ?? 0), biases[index] ?? 0);
    if (score > best) { best = score; selected = index; }
  }
  return selected;
}
function normalizedTemporalFeatures(featureFrames: readonly (readonly number[])[], condition: readonly number[], normalization: TearBehaviorCloningNormalizationV1, window: number): readonly number[] {
  const frames = featureFrames.slice(-window).map((frame) => frame.map((value, index) => (value - (normalization.mean[index] ?? 0)) / (normalization.scale[index] ?? 1)));
  const features: number[] = [];
  for (let index = 0; index < window - frames.length; index += 1) features.push(...Array<number>(TEAR_POLICY_FEATURE_WIDTH_V1).fill(0));
  for (const frame of frames) features.push(...frame);
  return Object.freeze([...features, ...condition]);
}

/** Converts only accepted, hash-bound causal corrections into temporal fit examples. */
export function createTearTemporalDaggerRetrainingInput(dataset: TearAcademyTrainingDatasetV1, normalization: TearBehaviorCloningNormalizationV1,
  config: TearTemporalPolicyTrainingConfigV1, capture: TearDaggerCorrectionCaptureV1, reviews: readonly TearDaggerCorrectionReviewV1[]): TearTemporalDaggerRetrainingInputV1 {
  if (!validConfig(config) || normalization.datasetHash !== dataset.datasetHash || reviews.length < 1
    || reviews.some((review) => review.captureHash !== capture.captureHash || review.artifactHash !== capture.artifact.hash || review.disposition !== "accepted")) {
    throw new RangeError("temporal DAgger retraining requires matching accepted correction reviews");
  }
  const approved = new Map(reviews.map((review) => [review.correctionHash, review]));
  if (approved.size !== reviews.length) throw new TypeError("temporal DAgger retraining repeats a correction review");
  const examples = capture.corrections.filter((correction) => approved.has(correction.correctionHash)).map((correction) => {
    if (correction.temporal.featureFrames.length < 1 || correction.temporal.featureFrames.length > 64
      || correction.temporal.featureFrames.some((frame) => frame.length !== TEAR_POLICY_FEATURE_WIDTH_V1 || frame.some((value) => !Number.isFinite(value)))
      || correction.temporal.condition.length !== TEAR_POLICY_CONDITION_WIDTH_V2 || correction.temporal.condition.some((value) => !Number.isFinite(value))) {
      throw new TypeError("temporal DAgger correction has invalid causal context");
    }
    return Object.freeze({ correctionHash: correction.correctionHash,
      features: normalizedTemporalFeatures(correction.temporal.featureFrames, correction.temporal.condition, normalization, config.window),
      targetActions: Object.freeze(structuredClone(correction.teacherActions)) });
  }).sort((left, right) => left.correctionHash.localeCompare(right.correctionHash));
  if (examples.length < 1 || examples.length > 256) throw new RangeError("temporal DAgger retraining requires bounded approved corrections");
  const draft = { format: "tear-temporal-dagger-retraining-input" as const, schemaVersion: 1 as const,
    datasetHash: dataset.datasetHash, normalizationHash: normalization.normalizationHash, captureHash: capture.captureHash,
    sourceScenarioHashes: Object.freeze([capture.scenario.hash]), window: config.window,
    acceptedReviewHashes: Object.freeze(reviews.map((review) => review.reviewHash).sort()), examples: Object.freeze(examples) };
  return Object.freeze({ ...draft, inputHash: stableVerificationHash(draft) });
}

function examples(dataset: TearAcademyTrainingDatasetV1, normalization: TearBehaviorCloningNormalizationV1, config: TearTemporalPolicyTrainingConfigV1,
  augmentation?: TearTemporalDaggerRetrainingInputV1) {
  if (!validConfig(config) || normalization.datasetHash !== dataset.datasetHash || normalization.featureSchemaHash !== TEAR_POLICY_FEATURE_SCHEMA_HASH_V1
    || normalization.mean.length !== TEAR_POLICY_FEATURE_WIDTH_V1 || normalization.scale.length !== TEAR_POLICY_FEATURE_WIDTH_V1
    || normalization.scale.some((value) => !Number.isFinite(value) || value <= 0)) throw new TypeError("invalid temporal policy training input");
  if (augmentation !== undefined && (augmentation.datasetHash !== dataset.datasetHash || augmentation.normalizationHash !== normalization.normalizationHash
    || augmentation.window !== config.window || augmentation.sourceScenarioHashes.length < 1
    || augmentation.sourceScenarioHashes.some((hash) => !/^[a-f0-9]{16}$/u.test(hash)) || augmentation.examples.length < 1
    || augmentation.inputHash !== stableVerificationHash({ format: augmentation.format, schemaVersion: augmentation.schemaVersion,
      datasetHash: augmentation.datasetHash, normalizationHash: augmentation.normalizationHash, captureHash: augmentation.captureHash,
      sourceScenarioHashes: augmentation.sourceScenarioHashes, window: augmentation.window,
      acceptedReviewHashes: augmentation.acceptedReviewHashes, examples: augmentation.examples })
    || augmentation.examples.some((entry) => entry.features.length !== config.window * TEAR_POLICY_FEATURE_WIDTH_V1 + TEAR_POLICY_CONDITION_WIDTH_V2
      || entry.features.some((value) => !Number.isFinite(value))))) {
    throw new TypeError("invalid temporal DAgger retraining augmentation");
  }
  return Object.freeze([...createTearTemporalPolicyContexts(dataset, config.window).map((context) => {
    const frames = context.featureFrames.map((frame) => frame.map((value, index) => (value - (normalization.mean[index] ?? 0)) / (normalization.scale[index] ?? 1)));
    const features: number[] = [];
    for (let index = 0; index < config.window - frames.length; index += 1) features.push(...Array<number>(TEAR_POLICY_FEATURE_WIDTH_V1).fill(0));
    for (const frame of frames) features.push(...frame);
    if (context.condition.length !== TEAR_POLICY_CONDITION_WIDTH_V2) throw new Error("temporal policy condition width changed");
    return Object.freeze({ features: Object.freeze([...features, ...context.condition]), targetActions: context.targetActions });
  }), ...(augmentation?.examples ?? [])]);
}

/** Fits a bounded causal-window perceptron. It is temporal, but deliberately not a GRU/LSTM claim. */
export function trainTearTemporalWindowPolicy(dataset: TearAcademyTrainingDatasetV1, normalization: TearBehaviorCloningNormalizationV1,
  config: TearTemporalPolicyTrainingConfigV1, augmentation?: TearTemporalDaggerRetrainingInputV1): TearTemporalPolicyTrainingResultV1 {
  const training = examples(dataset, normalization, config, augmentation); if (training.length < 1) throw new RangeError("temporal policy training requires examples");
  const sourceHashes = trainingScenarioHashes(dataset, augmentation);
  const byAction = new Map<string, readonly GameAction[]>(); for (const example of training) byAction.set(actionKey(example.targetActions), example.targetActions);
  const classes = Object.freeze([...byAction.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, actions]) => Object.freeze({ actions: Object.freeze(structuredClone(actions)) })));
  const classByAction = new Map(classes.map((entry, index) => [actionKey(entry.actions), index]));
  const width = config.window * TEAR_POLICY_FEATURE_WIDTH_V1 + TEAR_POLICY_CONDITION_WIDTH_V2, weights = classes.map(() => Array<number>(width).fill(0)), biases = classes.map(() => 0); let updates = 0;
  for (let epoch = 0; epoch < config.epochs; epoch += 1) for (const example of training) {
    const expected = classByAction.get(actionKey(example.targetActions)), actual = predict(weights, biases, example.features);
    if (expected === undefined) throw new Error("temporal policy action class is unavailable");
    if (actual === expected) continue;
    const target = weights[expected], predicted = weights[actual]; if (target === undefined || predicted === undefined) throw new Error("temporal policy model class is unavailable");
    for (let index = 0; index < width; index += 1) { const value = example.features[index] ?? 0; target[index] = (target[index] ?? 0) + config.learningRate * value; predicted[index] = (predicted[index] ?? 0) - config.learningRate * value; }
    biases[expected] = (biases[expected] ?? 0) + config.learningRate; biases[actual] = (biases[actual] ?? 0) - config.learningRate; updates += 1;
  }
  const correct = training.filter((example) => classByAction.get(actionKey(example.targetActions)) === predict(weights, biases, example.features)).length;
  const model = Object.freeze({ format: "tear-temporal-window-linear-policy-model" as const, schemaVersion: 1 as const, featureSchemaHash: TEAR_POLICY_FEATURE_SCHEMA_HASH_V1,
    window: config.window, conditionSchemaHash: TEAR_POLICY_CONDITION_SCHEMA_HASH_V2, conditionWidth: TEAR_POLICY_CONDITION_WIDTH_V2,
    mean: Object.freeze([...normalization.mean]), scale: Object.freeze([...normalization.scale]), classes,
    weights: Object.freeze(weights.map((row) => Object.freeze([...row]))), biases: Object.freeze([...biases]) });
  const metrics = Object.freeze({ examples: training.length, classes: classes.length, updates, trainingAccuracy: correct / training.length });
  const draft = { format: "tear-temporal-policy-training" as const, schemaVersion: 1 as const, datasetHash: dataset.datasetHash,
    normalizationHash: normalization.normalizationHash, ...(augmentation === undefined ? {} : { augmentationHash: augmentation.inputHash }), trainingScenarioHashes: sourceHashes, config: Object.freeze({ ...config }), model, metrics };
  return Object.freeze({ ...draft, trainingHash: stableVerificationHash(draft) });
}

/** Binds a bounded temporal fit to the existing C32 data-only runtime envelope. */
export function createTearTemporalWindowPolicyArtifact(training: TearTemporalPolicyTrainingResultV1,
  artifact: Omit<TearPolicyArtifactDraft, "model">): TearPolicyArtifactV1 {
  if (artifact.lineage.trainingRunId !== training.trainingHash || !artifact.compatibility.modelFormats.includes("temporal-window-linear-policy-v1")) {
    throw new RangeError("temporal policy artifact must declare its training result and temporal runtime compatibility");
  }
  return createTearPolicyArtifact({ ...artifact, model: { format: "temporal-window-linear-policy-v1", payload: JSON.stringify(training.model) },
    metrics: Object.freeze({ ...artifact.metrics, trainingAccuracy: training.metrics.trainingAccuracy, trainingExamples: training.metrics.examples }),
    extensions: Object.freeze({ ...artifact.extensions, temporalPolicyTraining: Object.freeze({ format: "tear-temporal-policy-training-provenance", schemaVersion: 1,
      trainingHash: training.trainingHash, trainingScenarioHashes: training.trainingScenarioHashes }) }), });
}

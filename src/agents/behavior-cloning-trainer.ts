import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import { createTearBehaviorCloningBatches, type TearBehaviorCloningNormalizationV1 } from "./academy-behavior-cloning-batches";
import type { TearAcademyTrainingDatasetV1 } from "./academy-training-dataset";
import { createTearPolicyArtifact, type TearPolicyArtifactDraft, type TearPolicyArtifactV1 } from "./policy-artifact-registry";
import { TEAR_POLICY_FEATURE_SCHEMA_HASH_V1 } from "./policy-feature-vector";

export interface TearBehaviorCloningTrainingConfigV1 {
  readonly seed: number;
  readonly epochs: number;
  readonly learningRate: number;
  readonly batchSize: number;
}

export interface TearBehaviorCloningLinearModelV1 {
  readonly format: "tear-linear-policy-model";
  readonly schemaVersion: 1;
  readonly featureSchemaHash: string;
  readonly mean: readonly number[];
  readonly scale: readonly number[];
  readonly classes: readonly Readonly<{ actions: readonly GameAction[] }> [];
  readonly weights: readonly (readonly number[])[];
  readonly biases: readonly number[];
}

export interface TearBehaviorCloningTrainingResultV1 {
  readonly format: "tear-behavior-cloning-training";
  readonly schemaVersion: 1;
  readonly datasetHash: string;
  readonly normalizationHash: string;
  readonly config: TearBehaviorCloningTrainingConfigV1;
  readonly model: TearBehaviorCloningLinearModelV1;
  readonly metrics: Readonly<{ examples: number; classes: number; updates: number; trainingAccuracy: number }>;
  readonly trainingHash: string;
}

function validConfig(value: TearBehaviorCloningTrainingConfigV1): boolean {
  return Number.isSafeInteger(value.seed) && value.seed >= 0 && Number.isSafeInteger(value.epochs) && value.epochs >= 1 && value.epochs <= 128
    && Number.isFinite(value.learningRate) && value.learningRate > 0 && value.learningRate <= 1
    && Number.isSafeInteger(value.batchSize) && value.batchSize >= 1 && value.batchSize <= 256;
}
function actionKey(actions: readonly GameAction[]): string { return stableVerificationHash(actions); }
function predict(weights: readonly (readonly number[])[], biases: readonly number[], features: readonly number[]): number {
  let selected = 0, best = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < weights.length; index += 1) {
    const row = weights[index], bias = biases[index];
    if (row === undefined || bias === undefined) throw new Error("behavior cloning model changed during training");
    const score = row.reduce((sum, weight, featureIndex) => sum + weight * (features[featureIndex] ?? 0), bias);
    if (score > best) { best = score; selected = index; }
  }
  return selected;
}

/** Deterministic multiclass perceptron fit over C33's governed training split. */
export function trainTearBehaviorCloningPolicy(
  dataset: TearAcademyTrainingDatasetV1,
  normalization: TearBehaviorCloningNormalizationV1,
  config: TearBehaviorCloningTrainingConfigV1,
): TearBehaviorCloningTrainingResultV1 {
  if (!validConfig(config)) throw new TypeError("invalid behavior cloning training configuration");
  const examples = createTearBehaviorCloningBatches(dataset, normalization, { split: "training", batchSize: config.batchSize })
    .flatMap((batch) => batch.examples);
  const actionClasses = new Map<string, readonly GameAction[]>();
  for (const example of examples) actionClasses.set(actionKey(example.targetActions), Object.freeze(structuredClone(example.targetActions)));
  const classes = Object.freeze([...actionClasses.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, actions]) => Object.freeze({ actions })));
  const classByAction = new Map(classes.map((entry, index) => [actionKey(entry.actions), index]));
  const weights = classes.map(() => Array.from({ length: normalization.mean.length }, () => 0));
  const biases = classes.map(() => 0);
  let updates = 0;
  for (let epoch = 0; epoch < config.epochs; epoch += 1) {
    for (const example of examples) {
      const expected = classByAction.get(actionKey(example.targetActions));
      if (expected === undefined) throw new Error("behavior cloning action class is unavailable");
      const actual = predict(weights, biases, example.features);
      if (actual === expected) continue;
      const targetRow = weights[expected], predictedRow = weights[actual];
      if (targetRow === undefined || predictedRow === undefined) throw new Error("behavior cloning model class is unavailable");
      for (let index = 0; index < example.features.length; index += 1) {
        const value = example.features[index] ?? 0;
        targetRow[index] = (targetRow[index] ?? 0) + config.learningRate * value;
        predictedRow[index] = (predictedRow[index] ?? 0) - config.learningRate * value;
      }
      biases[expected] = (biases[expected] ?? 0) + config.learningRate;
      biases[actual] = (biases[actual] ?? 0) - config.learningRate;
      updates += 1;
    }
  }
  const correct = examples.filter((example) => {
    const expected = classByAction.get(actionKey(example.targetActions));
    return expected !== undefined && predict(weights, biases, example.features) === expected;
  }).length;
  const model = Object.freeze({ format: "tear-linear-policy-model" as const, schemaVersion: 1 as const,
    featureSchemaHash: TEAR_POLICY_FEATURE_SCHEMA_HASH_V1, mean: Object.freeze([...normalization.mean]), scale: Object.freeze([...normalization.scale]),
    classes: Object.freeze(classes.map((entry) => Object.freeze({ actions: Object.freeze(structuredClone(entry.actions)) }))),
    weights: Object.freeze(weights.map((entry) => Object.freeze([...entry]))), biases: Object.freeze([...biases]) });
  const metrics = Object.freeze({ examples: examples.length, classes: classes.length, updates,
    trainingAccuracy: examples.length === 0 ? 0 : correct / examples.length });
  const draft = { format: "tear-behavior-cloning-training" as const, schemaVersion: 1 as const, datasetHash: dataset.datasetHash,
    normalizationHash: normalization.normalizationHash, config: Object.freeze({ ...config }), model, metrics };
  return Object.freeze({ ...draft, trainingHash: stableVerificationHash(draft) });
}

/** Wraps a reproducible C33 fit in C32's versioned, compatible artifact envelope. */
export function createTearBehaviorCloningArtifact(
  training: TearBehaviorCloningTrainingResultV1,
  artifact: Omit<TearPolicyArtifactDraft, "model">,
): TearPolicyArtifactV1 {
  if (artifact.lineage.trainingRunId !== training.trainingHash || !artifact.compatibility.modelFormats.includes("linear-policy-v1")) {
    throw new RangeError("behavior cloning artifact must declare its training result and linear runtime compatibility");
  }
  return createTearPolicyArtifact({ ...artifact, model: { format: "linear-policy-v1", payload: JSON.stringify(training.model) },
    metrics: Object.freeze({ ...artifact.metrics, trainingAccuracy: training.metrics.trainingAccuracy, trainingExamples: training.metrics.examples }), });
}

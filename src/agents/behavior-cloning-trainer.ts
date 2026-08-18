import type { GameAction } from "../input/game-action";
import { normalizeGameAction } from "../input/game-action";
import type { GhostVaultBackend } from "../ghost";
import { stableVerificationHash } from "../replay/hash";
import { createTearBehaviorCloningBatches, type TearBehaviorCloningNormalizationV1 } from "./academy-behavior-cloning-batches";
import type { TearAcademyTrainingDatasetV1 } from "./academy-training-dataset";
import { createTearPolicyArtifact, type TearPolicyArtifactDraft, type TearPolicyArtifactV1 } from "./policy-artifact-registry";
import { TEAR_POLICY_FEATURE_SCHEMA_HASH_V1 } from "./policy-feature-vector";
import type { TearDaggerRetrainingInputV1 } from "./dagger-retraining-input";

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
  readonly augmentationHash?: string;
  readonly config: TearBehaviorCloningTrainingConfigV1;
  readonly model: TearBehaviorCloningLinearModelV1;
  readonly metrics: Readonly<{ examples: number; classes: number; updates: number; trainingAccuracy: number }>;
  readonly checkpoint: Readonly<{ epoch: number; modelHash: string; metricsHash: string }>;
  readonly trainingHash: string;
}

export interface TearBehaviorCloningCheckpointV1 {
  readonly format: "tear-behavior-cloning-checkpoint"; readonly schemaVersion: 1;
  readonly inputHash: string; readonly epoch: number; readonly updates: number;
  readonly classes: readonly Readonly<{ actions: readonly GameAction[] }>[];
  readonly weights: readonly (readonly number[])[]; readonly biases: readonly number[]; readonly checkpointHash: string;
}

const TRAINING_KEY = "behavior-cloning-training:v1:";
const CHECKPOINT_KEY = "behavior-cloning-checkpoint:v1:";
const HASH = /^[a-f0-9]{16}$/u;

function validConfig(value: TearBehaviorCloningTrainingConfigV1): boolean {
  return Number.isSafeInteger(value.seed) && value.seed >= 0 && Number.isSafeInteger(value.epochs) && value.epochs >= 1 && value.epochs <= 128
    && Number.isFinite(value.learningRate) && value.learningRate > 0 && value.learningRate <= 1
    && Number.isSafeInteger(value.batchSize) && value.batchSize >= 1 && value.batchSize <= 256;
}
function actionKey(actions: readonly GameAction[]): string { return stableVerificationHash(actions); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hashes(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function integerAtLeast(value: unknown, minimum: number): boolean { return Number.isSafeInteger(value) && Number(value) >= minimum; }
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
function trainingExamples(dataset: TearAcademyTrainingDatasetV1, normalization: TearBehaviorCloningNormalizationV1, config: TearBehaviorCloningTrainingConfigV1, augmentation?: TearDaggerRetrainingInputV1) {
  if (!validConfig(config)) throw new TypeError("invalid behavior cloning training configuration");
  if (augmentation !== undefined && (augmentation.datasetHash !== dataset.datasetHash || augmentation.normalizationHash !== normalization.normalizationHash || augmentation.examples.length < 1)) throw new TypeError("invalid DAgger retraining augmentation");
  return Object.freeze([...createTearBehaviorCloningBatches(dataset, normalization, { split: "training", batchSize: config.batchSize }).flatMap((batch) => batch.examples), ...(augmentation?.examples ?? [])]);
}
function inputHash(dataset: TearAcademyTrainingDatasetV1, normalization: TearBehaviorCloningNormalizationV1, config: TearBehaviorCloningTrainingConfigV1, augmentation?: TearDaggerRetrainingInputV1): string { return stableVerificationHash({ datasetHash: dataset.datasetHash, normalizationHash: normalization.normalizationHash, config, augmentationHash: augmentation?.inputHash ?? null }); }

export function createTearBehaviorCloningCheckpoint(dataset: TearAcademyTrainingDatasetV1, normalization: TearBehaviorCloningNormalizationV1, config: TearBehaviorCloningTrainingConfigV1, augmentation?: TearDaggerRetrainingInputV1): TearBehaviorCloningCheckpointV1 {
  const examples = trainingExamples(dataset, normalization, config, augmentation), actionClasses = new Map<string, readonly GameAction[]>();
  for (const example of examples) actionClasses.set(actionKey(example.targetActions), Object.freeze(structuredClone(example.targetActions)));
  const classes = Object.freeze([...actionClasses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, actions]) => Object.freeze({ actions })));
  const draft = { format: "tear-behavior-cloning-checkpoint" as const, schemaVersion: 1 as const, inputHash: inputHash(dataset, normalization, config, augmentation), epoch: 0, updates: 0, classes, weights: Object.freeze(classes.map(() => Object.freeze(Array.from({ length: normalization.mean.length }, () => 0)))), biases: Object.freeze(classes.map(() => 0)) };
  return Object.freeze({ ...draft, checkpointHash: stableVerificationHash(draft) });
}

/** Advances whole deterministic epochs and returns a content-addressed resumable state. */
export function advanceTearBehaviorCloningCheckpoint(checkpoint: TearBehaviorCloningCheckpointV1, dataset: TearAcademyTrainingDatasetV1, normalization: TearBehaviorCloningNormalizationV1, config: TearBehaviorCloningTrainingConfigV1, epochs: number, augmentation?: TearDaggerRetrainingInputV1): TearBehaviorCloningCheckpointV1 {
  if (!Number.isSafeInteger(epochs) || epochs < 0 || !validConfig(config)) throw new TypeError("invalid behavior cloning checkpoint advance");
  const initial = createTearBehaviorCloningCheckpoint(dataset, normalization, config, augmentation);
  const { checkpointHash, ...current } = checkpoint;
  if (checkpointHash !== stableVerificationHash(current) || checkpoint.inputHash !== initial.inputHash || checkpoint.epoch < 0 || checkpoint.epoch > config.epochs
    || stableVerificationHash(checkpoint.classes) !== stableVerificationHash(initial.classes) || checkpoint.weights.length !== checkpoint.classes.length
    || checkpoint.biases.length !== checkpoint.classes.length || checkpoint.weights.some((row) => row.length !== normalization.mean.length)) throw new RangeError("behavior cloning checkpoint lineage is invalid");
  const examples = trainingExamples(dataset, normalization, config, augmentation), classes = checkpoint.classes, classByAction = new Map(classes.map((entry, index) => [actionKey(entry.actions), index]));
  const weights = checkpoint.weights.map((row) => [...row]), biases = [...checkpoint.biases]; let updates = checkpoint.updates;
  const targetEpoch = Math.min(config.epochs, checkpoint.epoch + epochs);
  for (let epoch = checkpoint.epoch; epoch < targetEpoch; epoch += 1) for (const example of examples) {
    const expected = classByAction.get(actionKey(example.targetActions)), actual = predict(weights, biases, example.features);
    if (expected === undefined || actual === expected) continue;
    const target = weights[expected], predicted = weights[actual]; if (target === undefined || predicted === undefined) throw new Error("behavior cloning checkpoint class is unavailable");
    for (let index = 0; index < example.features.length; index += 1) { const value = example.features[index] ?? 0; target[index] = (target[index] ?? 0) + config.learningRate * value; predicted[index] = (predicted[index] ?? 0) - config.learningRate * value; }
    biases[expected] = (biases[expected] ?? 0) + config.learningRate; biases[actual] = (biases[actual] ?? 0) - config.learningRate; updates += 1;
  }
  const draft = { format: "tear-behavior-cloning-checkpoint" as const, schemaVersion: 1 as const, inputHash: checkpoint.inputHash, epoch: targetEpoch, updates,
    classes: Object.freeze(classes.map((entry) => Object.freeze({ actions: Object.freeze(structuredClone(entry.actions)) }))), weights: Object.freeze(weights.map((row) => Object.freeze([...row]))), biases: Object.freeze([...biases]) };
  return Object.freeze({ ...draft, checkpointHash: stableVerificationHash(draft) });
}

/** Projects only a fully completed, lineage-matching checkpoint into a C33 fit result. */
export function completeTearBehaviorCloningCheckpoint(checkpoint: TearBehaviorCloningCheckpointV1, dataset: TearAcademyTrainingDatasetV1, normalization: TearBehaviorCloningNormalizationV1, config: TearBehaviorCloningTrainingConfigV1, augmentation?: TearDaggerRetrainingInputV1): TearBehaviorCloningTrainingResultV1 {
  const completed = advanceTearBehaviorCloningCheckpoint(checkpoint, dataset, normalization, config, 0, augmentation);
  if (completed.epoch !== config.epochs) throw new RangeError("behavior cloning checkpoint is not complete");
  const examples = trainingExamples(dataset, normalization, config, augmentation), classByAction = new Map(completed.classes.map((entry, index) => [actionKey(entry.actions), index]));
  const correct = examples.filter((example) => classByAction.get(actionKey(example.targetActions)) === predict(completed.weights, completed.biases, example.features)).length;
  const model = Object.freeze({ format: "tear-linear-policy-model" as const, schemaVersion: 1 as const, featureSchemaHash: TEAR_POLICY_FEATURE_SCHEMA_HASH_V1,
    mean: Object.freeze([...normalization.mean]), scale: Object.freeze([...normalization.scale]), classes: completed.classes,
    weights: completed.weights, biases: completed.biases });
  const metrics = Object.freeze({ examples: examples.length, classes: completed.classes.length, updates: completed.updates, trainingAccuracy: correct / examples.length });
  const resultCheckpoint = Object.freeze({ epoch: completed.epoch, modelHash: stableVerificationHash(model), metricsHash: stableVerificationHash(metrics) });
  const draft = { format: "tear-behavior-cloning-training" as const, schemaVersion: 1 as const, datasetHash: dataset.datasetHash, normalizationHash: normalization.normalizationHash,
    ...(augmentation === undefined ? {} : { augmentationHash: augmentation.inputHash }), config: Object.freeze({ ...config }), model, metrics, checkpoint: resultCheckpoint };
  return Object.freeze({ ...draft, trainingHash: stableVerificationHash(draft) });
}

function parseCheckpoint(value: unknown): TearBehaviorCloningCheckpointV1 {
  if (!record(value) || value.format !== "tear-behavior-cloning-checkpoint" || value.schemaVersion !== 1 || !hashes(value.inputHash)
    || !integerAtLeast(value.epoch, 0) || !integerAtLeast(value.updates, 0) || !Array.isArray(value.classes) || !Array.isArray(value.weights)
    || !Array.isArray(value.biases) || !hashes(value.checkpointHash)) throw new TypeError("invalid behavior cloning checkpoint");
  const typed = value as unknown as TearBehaviorCloningCheckpointV1, { checkpointHash, ...draft } = typed;
  if (checkpointHash !== stableVerificationHash(draft)) throw new TypeError("behavior cloning checkpoint integrity mismatch");
  return Object.freeze(structuredClone(typed));
}

/** Local custody for cancelled/resumable deterministic fit state; it never activates an artifact. */
export class TearBehaviorCloningCheckpointVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async persist(input: TearBehaviorCloningCheckpointV1): Promise<TearBehaviorCloningCheckpointV1> {
    const checkpoint = parseCheckpoint(input), key = `${CHECKPOINT_KEY}${checkpoint.checkpointHash}`, existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) return parseCheckpoint(JSON.parse(existing));
    await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(checkpoint) }, { store: "indexes", key: `behavior-cloning-checkpoint:${checkpoint.inputHash}:${checkpoint.checkpointHash}`, value: JSON.stringify({ epoch: checkpoint.epoch }) }]));
    return checkpoint;
  }
  async get(checkpointHash: string): Promise<TearBehaviorCloningCheckpointV1 | undefined> {
    if (!hashes(checkpointHash)) throw new TypeError("behavior cloning checkpoint hash is invalid");
    const key = `${CHECKPOINT_KEY}${checkpointHash}`, raw = await this.#backend.get("analysis", key); if (raw === undefined) return undefined;
    try { return parseCheckpoint(JSON.parse(raw)); } catch (error) { await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "behavior-cloning-checkpoint-quarantine", schemaVersion: 1, key, raw, reason: error instanceof Error ? error.message : String(error) }))); return undefined; }
  }
}

/** Uses the same deterministic class selection as C33 fitting on a complete linear model. */
export function predictTearBehaviorCloningClass(
  model: TearBehaviorCloningLinearModelV1,
  features: readonly number[],
): number {
  if (features.length !== model.mean.length || model.weights.length !== model.classes.length || model.biases.length !== model.classes.length
    || model.weights.some((row) => row.length !== features.length) || features.some((value) => !Number.isFinite(value))) {
    throw new TypeError("behavior cloning prediction shape is invalid");
  }
  return predict(model.weights, model.biases, features);
}

/** Deterministic multiclass perceptron fit over C33's governed training split. */
export function trainTearBehaviorCloningPolicy(
  dataset: TearAcademyTrainingDatasetV1,
  normalization: TearBehaviorCloningNormalizationV1,
  config: TearBehaviorCloningTrainingConfigV1,
  augmentation?: TearDaggerRetrainingInputV1,
): TearBehaviorCloningTrainingResultV1 {
  if (!validConfig(config)) throw new TypeError("invalid behavior cloning training configuration");
  if (augmentation !== undefined && (augmentation.datasetHash !== dataset.datasetHash || augmentation.normalizationHash !== normalization.normalizationHash
    || augmentation.examples.length < 1 || augmentation.inputHash !== stableVerificationHash({ format: augmentation.format, schemaVersion: augmentation.schemaVersion,
      datasetHash: augmentation.datasetHash, normalizationHash: augmentation.normalizationHash, captureHash: augmentation.captureHash,
      acceptedReviewHashes: augmentation.acceptedReviewHashes, examples: augmentation.examples }))) throw new TypeError("invalid DAgger retraining augmentation");
  const examples = Object.freeze([
    ...createTearBehaviorCloningBatches(dataset, normalization, { split: "training", batchSize: config.batchSize }).flatMap((batch) => batch.examples),
    ...(augmentation?.examples ?? []),
  ]);
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
  const checkpoint = Object.freeze({ epoch: config.epochs, modelHash: stableVerificationHash(model), metricsHash: stableVerificationHash(metrics) });
  const draft = { format: "tear-behavior-cloning-training" as const, schemaVersion: 1 as const, datasetHash: dataset.datasetHash,
    normalizationHash: normalization.normalizationHash, ...(augmentation === undefined ? {} : { augmentationHash: augmentation.inputHash }),
    config: Object.freeze({ ...config }), model, metrics, checkpoint };
  return Object.freeze({ ...draft, trainingHash: stableVerificationHash(draft) });
}

function parseTraining(value: unknown): TearBehaviorCloningTrainingResultV1 {
  if (!record(value)) throw new TypeError("invalid behavior cloning training record");
  const config = value.config, model = value.model, metrics = value.metrics, checkpoint = value.checkpoint;
  if (value.format !== "tear-behavior-cloning-training" || value.schemaVersion !== 1 || !hashes(value.datasetHash)
    || !hashes(value.normalizationHash) || (value.augmentationHash !== undefined && !hashes(value.augmentationHash)) || !record(config) || !validConfig(config as unknown as TearBehaviorCloningTrainingConfigV1)
    || !record(model) || model.format !== "tear-linear-policy-model" || model.schemaVersion !== 1 || !hashes(model.featureSchemaHash)
    || !Array.isArray(model.mean) || !Array.isArray(model.scale) || model.mean.length < 1 || model.mean.length !== model.scale.length
    || !model.mean.every((entry) => typeof entry === "number" && Number.isFinite(entry)) || !model.scale.every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry > 0)
    || !Array.isArray(model.classes) || model.classes.length < 1 || model.classes.length > 16_384
    || !model.classes.every((entry) => record(entry) && Array.isArray(entry.actions) && entry.actions.every((action) => normalizeGameAction(action).ok))
    || !Array.isArray(model.weights) || model.weights.length !== model.classes.length || !model.weights.every((entry) => Array.isArray(entry) && entry.length === (Array.isArray(model.mean) ? model.mean.length : -1) && entry.every((weight) => typeof weight === "number" && Number.isFinite(weight)))
    || !Array.isArray(model.biases) || model.biases.length !== model.classes.length || !model.biases.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    || !record(metrics) || !integerAtLeast(metrics.examples, 1) || !integerAtLeast(metrics.classes, 0)
    || metrics.classes !== model.classes.length || !integerAtLeast(metrics.updates, 0)
    || typeof metrics.trainingAccuracy !== "number" || metrics.trainingAccuracy < 0 || metrics.trainingAccuracy > 1
    || !record(checkpoint) || !integerAtLeast(checkpoint.epoch, 1) || checkpoint.epoch !== config.epochs
    || !hashes(checkpoint.modelHash) || !hashes(checkpoint.metricsHash) || !hashes(value.trainingHash)) throw new TypeError("invalid behavior cloning training record");
  const typed = value as unknown as Omit<TearBehaviorCloningTrainingResultV1, "trainingHash"> & { trainingHash: string };
  if (typed.checkpoint.modelHash !== stableVerificationHash(typed.model) || typed.checkpoint.metricsHash !== stableVerificationHash(typed.metrics)) throw new TypeError("behavior cloning checkpoint integrity mismatch");
  const { trainingHash, ...draft } = typed;
  if (trainingHash !== stableVerificationHash(draft)) throw new TypeError("behavior cloning training integrity mismatch");
  return Object.freeze(structuredClone(typed));
}

/** Durable local custody for reproducible C33 fits and their final checkpoint. */
export class TearBehaviorCloningTrainingVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }

  async persist(input: TearBehaviorCloningTrainingResultV1): Promise<TearBehaviorCloningTrainingResultV1> {
    const training = parseTraining(input), key = `${TRAINING_KEY}${training.trainingHash}`, existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) return parseTraining(JSON.parse(existing));
    await this.#backend.commit(Object.freeze([
      { store: "analysis", key, value: JSON.stringify(training) },
      { store: "indexes", key: `behavior-cloning-training:${training.datasetHash}:${training.trainingHash}`,
        value: JSON.stringify({ normalizationHash: training.normalizationHash, modelHash: training.checkpoint.modelHash }) },
    ]));
    return training;
  }

  async get(trainingHash: string): Promise<TearBehaviorCloningTrainingResultV1 | undefined> {
    if (!hashes(trainingHash)) throw new TypeError("behavior cloning training hash is invalid");
    const key = `${TRAINING_KEY}${trainingHash}`, raw = await this.#backend.get("analysis", key);
    if (raw === undefined) return undefined;
    try { return parseTraining(JSON.parse(raw)); }
    catch (error) {
      await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "behavior-cloning-training-quarantine", schemaVersion: 1,
        key, raw, reason: error instanceof Error ? error.message : String(error) })));
      return undefined;
    }
  }
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

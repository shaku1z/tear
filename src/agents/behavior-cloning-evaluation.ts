import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
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

const EVALUATION_KEY = "behavior-cloning-evaluation:v1:";
const HASH = /^[a-f0-9]{16}$/u;

function heldoutSplit(value: string): value is TearBehaviorCloningHeldoutSplit {
  return value === "validation" || value === "calibration" || value === "test";
}
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function integer(value: unknown, minimum: number): boolean { return Number.isSafeInteger(value) && Number(value) >= minimum; }

function parseEvaluation(value: unknown): TearBehaviorCloningEvaluationV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid behavior cloning evaluation record");
  const report = value as Record<string, unknown>;
  if (report.format !== "tear-behavior-cloning-evaluation" || report.schemaVersion !== 1
    || !hash(report.trainingHash) || !hash(report.datasetHash) || !hash(report.normalizationHash) || !heldoutSplit(String(report.split))
    || !integer(report.batchCount, 1) || !integer(report.examples, 1) || !integer(report.exactActionMatches, 0)
    || Number(report.exactActionMatches) > Number(report.examples) || typeof report.actionConformance !== "number"
    || report.actionConformance !== Number(report.exactActionMatches) / Number(report.examples) || !hash(report.reportHash)) {
    throw new TypeError("invalid behavior cloning evaluation record");
  }
  const typed = report as unknown as TearBehaviorCloningEvaluationV1;
  const { reportHash, ...draft } = typed;
  if (reportHash !== stableVerificationHash(draft)) throw new TypeError("behavior cloning evaluation integrity mismatch");
  return Object.freeze(structuredClone(typed));
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

/** Durable machine-local custody for immutable C33 held-out evaluation reports. */
export class TearBehaviorCloningEvaluationVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }

  async persist(input: TearBehaviorCloningEvaluationV1): Promise<TearBehaviorCloningEvaluationV1> {
    const report = parseEvaluation(input), key = `${EVALUATION_KEY}${report.reportHash}`;
    const existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) return parseEvaluation(JSON.parse(existing));
    await this.#backend.commit(Object.freeze([
      { store: "analysis", key, value: JSON.stringify(report) },
      { store: "indexes", key: `behavior-cloning-evaluation:${report.trainingHash}:${report.reportHash}`,
        value: JSON.stringify({ datasetHash: report.datasetHash, split: report.split }) },
    ]));
    return report;
  }

  async get(reportHash: string): Promise<TearBehaviorCloningEvaluationV1 | undefined> {
    if (!hash(reportHash)) throw new TypeError("behavior cloning evaluation hash is invalid");
    const key = `${EVALUATION_KEY}${reportHash}`, raw = await this.#backend.get("analysis", key);
    if (raw === undefined) return undefined;
    try { return parseEvaluation(JSON.parse(raw)); }
    catch (error) {
      await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "behavior-cloning-evaluation-quarantine", schemaVersion: 1,
        key, raw, reason: error instanceof Error ? error.message : String(error) })));
      return undefined;
    }
  }
}

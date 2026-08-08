import type { GhostVaultBackend } from "../ghost";
import { stableVerificationHash } from "../replay/hash";
import { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import { TearAcademyCandidateCurationStore } from "./academy-candidate-curation";
import { TearAcademyCandidateQualityStore } from "./academy-candidate-quality";
import { TearAcademyCandidateSplitStore } from "./academy-candidate-splits";
import { TearAcademyCorpusStore } from "./academy-corpus";
import { TearAcademyReviewedSampleStore } from "./academy-reviewed-sample";
import { createTearBehaviorCloningNormalization } from "./academy-behavior-cloning-batches";
import { TearAcademyTrainingDatasetLoader, type TearAcademyTrainingDatasetRequestV1 } from "./academy-training-dataset";
import { TearDaggerCorrectionReviewStore } from "./dagger-correction-review";
import { DEFAULT_TEAR_POLICY_RUNTIME_COMPATIBILITY } from "./browser-active-policy-runtime";
import { TearPolicyArtifactRegistry } from "./policy-artifact-registry";
import { TEAR_POLICY_CONDITION_SCHEMA_HASH_V2, TEAR_POLICY_CONDITION_WIDTH_V2 } from "./policy-condition-vector";
import {
  createTearTemporalDaggerProgramSchedule,
  TearTemporalDaggerProgramController,
  TearTemporalDaggerProgramScheduler,
  type TearTemporalDaggerProgramScheduleV1,
  type TearTemporalDaggerProgramV1,
} from "./temporal-dagger-program";
import type { TearTemporalPolicyTrainingConfigV1 } from "./temporal-policy-trainer";

const PLAN_KEY = "temporal-dagger-program-plan:v1:";
const HASH = /^[a-f0-9]{16}$/u;

export interface TearTemporalDaggerProgramPlanV1 {
  readonly format: "tear-temporal-dagger-program-plan";
  readonly schemaVersion: 1;
  readonly id: string;
  /** Immutable governed C31 manifest selection; hidden exams remain unavailable to its loader. */
  readonly dataset: TearAcademyTrainingDatasetRequestV1;
  readonly config: TearTemporalPolicyTrainingConfigV1;
  /** Human authority is named in the plan; advancing a program never fabricates a review. */
  readonly authorizedReviewers: readonly string[];
  readonly schedule: TearTemporalDaggerProgramScheduleV1;
  readonly planHash: string;
}

function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function integer(value: unknown): value is number { return Number.isSafeInteger(value); }
function validDataset(value: unknown): value is TearAcademyTrainingDatasetRequestV1 {
  return record(value) && text(value.manifestId) && text(value.trainerId) && integer(value.version) && value.version >= 1;
}
function validConfig(value: unknown): value is TearTemporalPolicyTrainingConfigV1 {
  return record(value) && integer(value.seed) && value.seed >= 0 && integer(value.epochs) && value.epochs >= 1 && value.epochs <= 128
    && typeof value.learningRate === "number" && Number.isFinite(value.learningRate) && value.learningRate > 0 && value.learningRate <= 1
    && integer(value.batchSize) && value.batchSize >= 1 && value.batchSize <= 256
    && integer(value.window) && value.window >= 1 && value.window <= 64
    && value.conditionSchemaHash === TEAR_POLICY_CONDITION_SCHEMA_HASH_V2 && value.conditionWidth === TEAR_POLICY_CONDITION_WIDTH_V2;
}

/** Creates the immutable, review-governed inputs needed to resume C33 without shell orchestration. */
export function createTearTemporalDaggerProgramPlan(input: Omit<TearTemporalDaggerProgramPlanV1, "format" | "schemaVersion" | "planHash">): TearTemporalDaggerProgramPlanV1 {
  if (!text(input.id) || !validDataset(input.dataset) || !validConfig(input.config) || input.authorizedReviewers.length < 1
    || input.authorizedReviewers.some((reviewer) => !text(reviewer)) || new Set(input.authorizedReviewers).size !== input.authorizedReviewers.length) {
    throw new TypeError("invalid temporal DAgger program plan");
  }
  const schedule = createTearTemporalDaggerProgramSchedule(input.schedule.programId, input.schedule.rounds);
  if (schedule.programId !== input.id || schedule.scheduleHash !== input.schedule.scheduleHash) throw new TypeError("temporal DAgger plan schedule is invalid");
  const draft = { format: "tear-temporal-dagger-program-plan" as const, schemaVersion: 1 as const, id: input.id,
    dataset: Object.freeze({ ...input.dataset }), config: Object.freeze({ ...input.config }),
    authorizedReviewers: Object.freeze([...input.authorizedReviewers]), schedule };
  return Object.freeze({ ...draft, planHash: stableVerificationHash(draft) });
}

function parsePlan(value: unknown): TearTemporalDaggerProgramPlanV1 {
  if (!record(value) || value.format !== "tear-temporal-dagger-program-plan" || value.schemaVersion !== 1 || !text(value.id)
    || !HASH.test(String(value.planHash)) || !Array.isArray(value.authorizedReviewers)) throw new TypeError("invalid temporal DAgger program plan");
  const typed = value as unknown as TearTemporalDaggerProgramPlanV1, { planHash, ...draft } = typed;
  if (planHash !== stableVerificationHash(draft)) throw new TypeError("temporal DAgger program plan integrity mismatch");
  return createTearTemporalDaggerProgramPlan(draft);
}

/** Immutable local custody for one explicit C33 corpus/config/reviewer/schedule program. */
export class TearTemporalDaggerProgramPlanVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }

  async persist(input: TearTemporalDaggerProgramPlanV1): Promise<TearTemporalDaggerProgramPlanV1> {
    const plan = parsePlan(input), key = `${PLAN_KEY}${plan.id}`, existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) {
      const current = parsePlan(JSON.parse(existing));
      if (current.planHash !== plan.planHash) throw new RangeError("temporal DAgger program plan already exists");
      return current;
    }
    await this.#backend.commit(Object.freeze([
      { store: "analysis", key, value: JSON.stringify(plan) },
      { store: "indexes", key: `temporal-dagger-program-plan:${plan.id}:${plan.planHash}`, value: JSON.stringify({ manifestId: plan.dataset.manifestId, version: plan.dataset.version }) },
    ]));
    return plan;
  }

  async get(id: string): Promise<TearTemporalDaggerProgramPlanV1 | undefined> {
    if (!text(id)) throw new TypeError("temporal DAgger program id is required");
    const key = `${PLAN_KEY}${id}`, raw = await this.#backend.get("analysis", key);
    if (raw === undefined) return undefined;
    try { return parsePlan(JSON.parse(raw)); }
    catch (error) {
      await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "temporal-dagger-program-plan-quarantine", schemaVersion: 1, key, raw,
        reason: error instanceof Error ? error.message : String(error) })));
      return undefined;
    }
  }

  async list(): Promise<readonly TearTemporalDaggerProgramPlanV1[]> {
    const plans: TearTemporalDaggerProgramPlanV1[] = [];
    for (const key of await this.#backend.keys("analysis")) {
      if (!key.startsWith(PLAN_KEY)) continue;
      const plan = await this.get(key.slice(PLAN_KEY.length));
      if (plan !== undefined) plans.push(plan);
    }
    return Object.freeze(plans.sort((left, right) => left.id.localeCompare(right.id)));
  }
}

/**
 * Explicit C33 process owner. A caller advances a persisted plan after human
 * review; it reconstructs its governed corpus and active C32 artifact from the
 * same Vault, never from test fixtures, shell arguments, or ambient refresh.
 */
export class TearTemporalDaggerProgramRuntime {
  readonly #backend: GhostVaultBackend;
  readonly #plans: TearTemporalDaggerProgramPlanVault;
  constructor(backend: GhostVaultBackend, plans = new TearTemporalDaggerProgramPlanVault(backend)) {
    this.#backend = backend; this.#plans = plans;
  }

  async advance(id: string): Promise<TearTemporalDaggerProgramV1 | undefined> {
    const plan = await this.#plans.get(id);
    if (plan === undefined) return undefined;
    const custody = new TearAcademyCandidateCustodyStore(this.#backend);
    const quality = new TearAcademyCandidateQualityStore(this.#backend, custody);
    const curation = new TearAcademyCandidateCurationStore(this.#backend, custody, quality);
    const splits = new TearAcademyCandidateSplitStore(this.#backend, custody, quality, curation);
    const samples = new TearAcademyReviewedSampleStore(this.#backend, custody, quality, curation, splits);
    const corpus = new TearAcademyCorpusStore(this.#backend, custody, curation, splits, samples);
    const dataset = await new TearAcademyTrainingDatasetLoader(corpus, samples).load(plan.dataset);
    const normalization = createTearBehaviorCloningNormalization(dataset);
    const registry = new TearPolicyArtifactRegistry(this.#backend, DEFAULT_TEAR_POLICY_RUNTIME_COMPATIBILITY);
    const reviews = new TearDaggerCorrectionReviewStore(this.#backend, plan.authorizedReviewers);
    const programs = new TearTemporalDaggerProgramController(this.#backend, dataset, normalization, plan.config, registry, reviews);
    const scheduler = new TearTemporalDaggerProgramScheduler(programs);
    const current = await programs.get(plan.id);
    if (current === undefined || current.status === "completed") return scheduler.run(plan.schedule);
    if (current.status === "review-required") {
      const accepted = (await reviews.list(current.capture.captureHash)).filter((review) => review.disposition === "accepted");
      if (accepted.length === 0) return current;
      await programs.acceptReviews(plan.id, accepted);
    }
    const resumed = await programs.advance(plan.id, plan.config.epochs);
    return resumed.status === "completed" ? scheduler.run(plan.schedule) : resumed;
  }
}

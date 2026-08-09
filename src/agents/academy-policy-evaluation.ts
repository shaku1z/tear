import type { GhostVaultBackend } from "../ghost";
import { stableVerificationHash } from "../replay/hash";
import type { TearScenarioV1 } from "../tearbench";
import { validateTearProductionPolicyEvaluationSuite } from "./production-policy-evaluation";
import { CANONICAL_ACADEMY_LESSONS, type TearAcademyLesson, type TearLessonDomain } from "./academy";
import type { TearAcademyTrainingDatasetV1 } from "./academy-training-dataset";
import type { TearAgentProfileId } from "./contracts";

const KEY = "academy-policy-evaluation-plan:v1:";
const HASH = /^[a-f0-9]{16}$/u;

export type TearAcademyPolicyEvaluationCaseKind = "unseen" | "recovery";
export type TearAcademyPolicyPrimaryMetric = "completed-rate";

export interface TearAcademyPolicyEvaluationCaseV1 {
  readonly lessonId: string;
  readonly kind: TearAcademyPolicyEvaluationCaseKind;
  readonly scenario: TearScenarioV1;
}

/** Immutable C33 quality protocol. It establishes evidence conditions, not a result, activation, or promotion. */
export interface TearAcademyPolicyEvaluationPlanV1 {
  readonly format: "tear-academy-policy-evaluation-plan";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly datasetHash: string;
  readonly artifactTrainingHash: string;
  readonly baselineProfile: TearAgentProfileId;
  readonly primaryMetric: TearAcademyPolicyPrimaryMetric;
  /** Candidate completion rate must meet each selected canonical lesson threshold and strictly exceed the baseline by this margin. */
  readonly minimumBaselineMargin: number;
  readonly lessonThresholds: readonly Readonly<{ id: string; domain: TearLessonDomain; passThreshold: number }> [];
  /** Every dataset source and accepted DAgger source excluded before execution, not inferred from an artifact later. */
  readonly excludedScenarioHashes: readonly string[];
  readonly cases: readonly TearAcademyPolicyEvaluationCaseV1[];
  readonly planHash: string;
}

export interface TearAcademyPolicyEvaluationPlanInputV1 {
  readonly id: string;
  readonly version: number;
  readonly dataset: TearAcademyTrainingDatasetV1;
  readonly artifactTrainingHash: string;
  readonly baselineProfile: TearAgentProfileId;
  readonly primaryMetric: TearAcademyPolicyPrimaryMetric;
  readonly minimumBaselineMargin: number;
  readonly daggerSourceScenarioHashes: readonly string[];
  readonly cases: readonly TearAcademyPolicyEvaluationCaseV1[];
}

function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function unit(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1; }
function scenarioHash(scenario: TearScenarioV1): string { return stableVerificationHash(scenario); }

function validateDraft(draft: Omit<TearAcademyPolicyEvaluationPlanV1, "planHash">): void {
  if (!text(draft.id) || !Number.isSafeInteger(draft.version) || draft.version < 1 || !hash(draft.datasetHash) || !hash(draft.artifactTrainingHash)
    || !text(draft.baselineProfile) || !unit(draft.minimumBaselineMargin)
    || !Array.isArray(draft.excludedScenarioHashes) || draft.excludedScenarioHashes.length < 1 || !draft.excludedScenarioHashes.every(hash)
    || new Set(draft.excludedScenarioHashes).size !== draft.excludedScenarioHashes.length || draft.cases.length < 1 || draft.cases.length > 32) {
    throw new TypeError("invalid Academy policy evaluation plan");
  }
  const lessons: ReadonlyMap<string, TearAcademyLesson> = new Map(CANONICAL_ACADEMY_LESSONS.map((lesson) => [lesson.id, lesson]));
  const selected = new Set(draft.cases.map((entry) => entry.lessonId));
  if (selected.size !== draft.lessonThresholds.length || draft.lessonThresholds.some((entry) => {
    const lesson = lessons.get(entry.id); return lesson?.domain !== entry.domain || lesson.passThreshold !== entry.passThreshold || !selected.has(entry.id);
  })) throw new TypeError("Academy policy evaluation plan lesson thresholds do not match canonical lessons");
  validateTearProductionPolicyEvaluationSuite({ id: draft.id, version: draft.version, description: "Academy policy evaluation plan", scenarios: draft.cases.map((entry) => entry.scenario) });
  const identities = new Set<string>();
  for (const entry of draft.cases) {
    const lesson = lessons.get(entry.lessonId);
    if (!lesson?.unseenSeeds.includes(entry.scenario.seed)) {
      throw new TypeError("Academy policy evaluation case is not a canonical unseen seed");
    }
    const scenarioIdentity = scenarioHash(entry.scenario);
    if (identities.has(scenarioIdentity) || draft.excludedScenarioHashes.includes(scenarioIdentity)) throw new RangeError("Academy policy evaluation repeats or overlaps a governed source scenario");
    identities.add(scenarioIdentity);
  }
  for (const lessonId of selected) {
    const lesson = lessons.get(lessonId); if (lesson === undefined) throw new TypeError("unknown Academy lesson");
    const seeds = new Set(draft.cases.filter((entry) => entry.lessonId === lessonId).map((entry) => entry.scenario.seed));
    if (lesson.unseenSeeds.some((seed) => !seeds.has(seed)) || (lesson.recoveryRequired && !draft.cases.some((entry) => entry.lessonId === lessonId && entry.kind === "recovery"))) {
      throw new RangeError("Academy policy evaluation plan does not cover required unseen/recovery cases");
    }
  }
}

function freeze(draft: Omit<TearAcademyPolicyEvaluationPlanV1, "planHash">): TearAcademyPolicyEvaluationPlanV1 {
  validateDraft(draft);
  const value = Object.freeze({ ...draft, lessonThresholds: Object.freeze(draft.lessonThresholds.map((entry) => Object.freeze({ ...entry }))),
    excludedScenarioHashes: Object.freeze([...draft.excludedScenarioHashes]), cases: Object.freeze(draft.cases.map((entry) => Object.freeze({ lessonId: entry.lessonId, kind: entry.kind, scenario: Object.freeze(structuredClone(entry.scenario)) }))) });
  return Object.freeze({ ...value, planHash: stableVerificationHash(value) });
}

/** Binds every evaluated lesson's canonical unseen seeds and all governed exclusions before a candidate is run. */
export function createTearAcademyPolicyEvaluationPlan(input: TearAcademyPolicyEvaluationPlanInputV1): TearAcademyPolicyEvaluationPlanV1 {
  const datasetScenarioHashes = input.dataset.sequences.map((sequence) => {
    if (sequence.sourceScenario === undefined) throw new RangeError("Academy policy evaluation requires complete governed source scenario identity");
    return scenarioHash(sequence.sourceScenario);
  });
  const excludedScenarioHashes = [...new Set([...datasetScenarioHashes, ...input.daggerSourceScenarioHashes])].sort();
  return freeze({ format: "tear-academy-policy-evaluation-plan", schemaVersion: 1, id: input.id, version: input.version,
    datasetHash: input.dataset.datasetHash, artifactTrainingHash: input.artifactTrainingHash, baselineProfile: input.baselineProfile,
    primaryMetric: input.primaryMetric, minimumBaselineMargin: input.minimumBaselineMargin,
    lessonThresholds: [...new Set(input.cases.map((entry) => entry.lessonId))].sort().map((id) => {
      const lesson = CANONICAL_ACADEMY_LESSONS.find((entry) => entry.id === id); return lesson === undefined ? { id, domain: "movement", passThreshold: 0 } : { id: lesson.id, domain: lesson.domain, passThreshold: lesson.passThreshold };
    }), excludedScenarioHashes, cases: input.cases });
}

/** Throws for malformed or altered persisted plan bytes. */
export function parseTearAcademyPolicyEvaluationPlan(value: unknown): TearAcademyPolicyEvaluationPlanV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid Academy policy evaluation plan");
  const record = value as Readonly<Record<string, unknown>>;
  if (record.format !== "tear-academy-policy-evaluation-plan" || record.schemaVersion !== 1 || !hash(record.planHash)) throw new TypeError("invalid Academy policy evaluation plan");
  const typed = record as unknown as TearAcademyPolicyEvaluationPlanV1;
  const { planHash, ...draft } = typed;
  const plan = freeze(draft);
  if (planHash !== plan.planHash) throw new TypeError("Academy policy evaluation plan integrity mismatch");
  return plan;
}

/** Immutable local custody for a predeclared C33 evaluation protocol. */
export class TearAcademyPolicyEvaluationPlanVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }

  async persist(input: TearAcademyPolicyEvaluationPlanV1): Promise<TearAcademyPolicyEvaluationPlanV1> {
    const plan = parseTearAcademyPolicyEvaluationPlan(input), key = `${KEY}${plan.id}`;
    const existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) {
      const current = parseTearAcademyPolicyEvaluationPlan(JSON.parse(existing));
      if (current.planHash !== plan.planHash) throw new RangeError("Academy policy evaluation plan already exists");
      return current;
    }
    await this.#backend.commit(Object.freeze([
      { store: "analysis", key, value: JSON.stringify(plan) },
      { store: "indexes", key: `academy-policy-evaluation-plan:${plan.id}:${plan.planHash}`, value: JSON.stringify({ datasetHash: plan.datasetHash, artifactTrainingHash: plan.artifactTrainingHash }) },
    ]));
    return plan;
  }

  async get(id: string): Promise<TearAcademyPolicyEvaluationPlanV1 | undefined> {
    if (!text(id)) throw new TypeError("Academy policy evaluation plan id is required");
    const key = `${KEY}${id}`, raw = await this.#backend.get("analysis", key); if (raw === undefined) return undefined;
    try { return parseTearAcademyPolicyEvaluationPlan(JSON.parse(raw)); }
    catch (error) { await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "academy-policy-evaluation-plan-quarantine", schemaVersion: 1, key, raw, reason: error instanceof Error ? error.message : String(error) }))); return undefined; }
  }
}

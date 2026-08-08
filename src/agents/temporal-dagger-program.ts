import type { GhostVaultBackend } from "../ghost";
import { stableVerificationHash } from "../replay/hash";
import type { TearScenarioV1 } from "../tearbench";
import { captureTearDaggerCorrections, type TearDaggerCorrectionCaptureOptionsV1, type TearDaggerCorrectionCaptureV1 } from "./dagger-correction-capture";
import type { TearDaggerCorrectionReviewStore, TearDaggerCorrectionReviewV1 } from "./dagger-correction-review";
import type { TearBehaviorCloningNormalizationV1 } from "./academy-behavior-cloning-batches";
import type { TearAcademyTrainingDatasetV1 } from "./academy-training-dataset";
import type { TearPolicyArtifactRegistry } from "./policy-artifact-registry";
import { advanceTearTemporalPolicyCheckpoint, completeTearTemporalPolicyCheckpoint, createTearTemporalDaggerRetrainingInput, createTearTemporalPolicyCheckpoint } from "./temporal-policy-trainer";
import type { TearTemporalDaggerRetrainingInputV1, TearTemporalPolicyCheckpointV1, TearTemporalPolicyTrainingConfigV1, TearTemporalPolicyTrainingResultV1 } from "./temporal-policy-trainer";

const KEY = "temporal-dagger-program:v1:";
const SCHEDULE_KEY = "temporal-dagger-program-schedule:v1:";
const HASH = /^[a-f0-9]{16}$/u;

export type TearTemporalDaggerProgramStatus = "review-required" | "checkpointed" | "cancelled" | "completed";

export interface TearTemporalDaggerRoundReceiptV1 {
  readonly captureHash: string;
  readonly scenarioHash: string;
  readonly status: TearTemporalDaggerProgramStatus;
  readonly acceptedReviewHashes: readonly string[];
  readonly checkpointHash?: string;
  readonly trainingHash?: string;
}

export interface TearTemporalDaggerProgramV1 {
  readonly format: "tear-temporal-dagger-program";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly datasetHash: string;
  readonly normalizationHash: string;
  readonly configHash: string;
  readonly status: TearTemporalDaggerProgramStatus;
  readonly capture: TearDaggerCorrectionCaptureV1;
  readonly reviews: readonly TearDaggerCorrectionReviewV1[];
  readonly augmentation?: TearTemporalDaggerRetrainingInputV1;
  readonly checkpoint?: TearTemporalPolicyCheckpointV1;
  readonly training?: TearTemporalPolicyTrainingResultV1;
  readonly rounds: readonly TearTemporalDaggerRoundReceiptV1[];
  readonly programHash: string;
}

export interface TearTemporalDaggerProgramScheduleV1 {
  readonly format: "tear-temporal-dagger-program-schedule";
  readonly schemaVersion: 1;
  readonly programId: string;
  readonly rounds: readonly Readonly<{ scenario: TearScenarioV1; options?: TearDaggerCorrectionCaptureOptionsV1 }> [];
  readonly scheduleHash: string;
}

function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function freeze(value: Omit<TearTemporalDaggerProgramV1, "programHash">): TearTemporalDaggerProgramV1 {
  const base = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "programHash")) as Omit<TearTemporalDaggerProgramV1, "programHash">;
  const draft = { ...base, reviews: Object.freeze(base.reviews.map((entry) => Object.freeze(structuredClone(entry)))), rounds: Object.freeze(base.rounds.map((entry) => Object.freeze({ ...entry, acceptedReviewHashes: Object.freeze([...entry.acceptedReviewHashes]) }))) };
  return Object.freeze({ ...draft, programHash: stableVerificationHash(draft) });
}
function parse(value: unknown): TearTemporalDaggerProgramV1 {
  if (!record(value) || value.format !== "tear-temporal-dagger-program" || value.schemaVersion !== 1 || !text(value.id)
    || !HASH.test(String(value.datasetHash)) || !HASH.test(String(value.normalizationHash)) || !HASH.test(String(value.configHash))
    || !["review-required", "checkpointed", "cancelled", "completed"].includes(String(value.status)) || !record(value.capture)
    || !Array.isArray(value.reviews) || !Array.isArray(value.rounds) || value.rounds.length < 1 || !HASH.test(String(value.programHash))) throw new TypeError("invalid temporal DAgger program");
  const typed = value as unknown as TearTemporalDaggerProgramV1, { programHash, ...draft } = typed;
  if (programHash !== stableVerificationHash(draft)) throw new TypeError("temporal DAgger program integrity mismatch");
  return freeze(draft);
}

/** Declares bounded source-world rounds; it does not authorize their reviews. */
export function createTearTemporalDaggerProgramSchedule(programId: string, rounds: readonly Readonly<{ scenario: TearScenarioV1; options?: TearDaggerCorrectionCaptureOptionsV1 }>[]): TearTemporalDaggerProgramScheduleV1 {
  if (!text(programId) || rounds.length < 1 || rounds.length > 32) throw new TypeError("temporal DAgger schedule requires one to 32 rounds");
  const sourceHashes = rounds.map((round) => stableVerificationHash(round.scenario));
  if (new Set(sourceHashes).size !== sourceHashes.length) throw new TypeError("temporal DAgger schedule repeats a source scenario");
  const draft = { format: "tear-temporal-dagger-program-schedule" as const, schemaVersion: 1 as const, programId,
    rounds: Object.freeze(rounds.map((round) => Object.freeze({ scenario: Object.freeze(structuredClone(round.scenario)), ...(round.options === undefined ? {} : { options: Object.freeze(structuredClone(round.options)) }) }))), };
  return Object.freeze({ ...draft, scheduleHash: stableVerificationHash(draft) });
}
function validSchedule(value: TearTemporalDaggerProgramScheduleV1): boolean {
  const { scheduleHash, ...draft } = value;
  try { return scheduleHash === createTearTemporalDaggerProgramSchedule(value.programId, value.rounds).scheduleHash && scheduleHash === stableVerificationHash(draft); }
  catch { return false; }
}

function parseSchedule(value: unknown): TearTemporalDaggerProgramScheduleV1 {
  if (!record(value) || value.format !== "tear-temporal-dagger-program-schedule" || value.schemaVersion !== 1
    || !text(value.programId) || !Array.isArray(value.rounds) || !HASH.test(String(value.scheduleHash))) {
    throw new TypeError("invalid temporal DAgger schedule");
  }
  const typed = value as unknown as TearTemporalDaggerProgramScheduleV1;
  if (!validSchedule(typed)) throw new TypeError("temporal DAgger schedule integrity is invalid");
  return createTearTemporalDaggerProgramSchedule(typed.programId, typed.rounds);
}

/**
 * Read-only local status projection for Academy. Invalid durable bytes are
 * quarantined instead of becoming a plausible training-progress claim.
 */
export async function inspectTearTemporalDaggerPrograms(backend: GhostVaultBackend): Promise<readonly TearTemporalDaggerProgramV1[]> {
  const programs: TearTemporalDaggerProgramV1[] = [];
  for (const key of await backend.keys("analysis")) {
    if (!key.startsWith(KEY)) continue;
    const raw = await backend.get("analysis", key);
    if (raw === undefined) continue;
    try { programs.push(parse(JSON.parse(raw))); }
    catch (error) {
      await backend.put("quarantine", key, JSON.stringify(Object.freeze({
        format: "temporal-dagger-program-quarantine", schemaVersion: 1, key, raw,
        reason: error instanceof Error ? error.message : String(error),
      })));
    }
  }
  return Object.freeze(programs.sort((left, right) => left.id.localeCompare(right.id)));
}
function receipt(capture: TearDaggerCorrectionCaptureV1, status: TearTemporalDaggerProgramStatus, reviews: readonly TearDaggerCorrectionReviewV1[], checkpoint?: TearTemporalPolicyCheckpointV1, training?: TearTemporalPolicyTrainingResultV1): TearTemporalDaggerRoundReceiptV1 {
  return Object.freeze({ captureHash: capture.captureHash, scenarioHash: capture.scenario.hash, status, acceptedReviewHashes: Object.freeze(reviews.filter((entry) => entry.disposition === "accepted").map((entry) => entry.reviewHash).sort()), ...(checkpoint === undefined ? {} : { checkpointHash: checkpoint.checkpointHash }), ...(training === undefined ? {} : { trainingHash: training.trainingHash }) });
}

/** Durable, review-gated C33 round coordinator. It never registers, activates, or promotes an artifact. */
export class TearTemporalDaggerProgramController {
  readonly #backend: GhostVaultBackend;
  readonly #dataset: TearAcademyTrainingDatasetV1;
  readonly #normalization: TearBehaviorCloningNormalizationV1;
  readonly #config: TearTemporalPolicyTrainingConfigV1;
  readonly #registry: TearPolicyArtifactRegistry;
  readonly #reviews: TearDaggerCorrectionReviewStore;

  constructor(backend: GhostVaultBackend, dataset: TearAcademyTrainingDatasetV1, normalization: TearBehaviorCloningNormalizationV1,
    config: TearTemporalPolicyTrainingConfigV1, registry: TearPolicyArtifactRegistry, reviews: TearDaggerCorrectionReviewStore) {
    this.#backend = backend; this.#dataset = dataset; this.#normalization = normalization; this.#config = config; this.#registry = registry; this.#reviews = reviews;
  }

  async get(id: string): Promise<TearTemporalDaggerProgramV1 | undefined> {
    if (!text(id)) throw new TypeError("temporal DAgger program id is required");
    const key = `${KEY}${id}`, raw = await this.#backend.get("analysis", key); if (raw === undefined) return undefined;
    try { return parse(JSON.parse(raw)); }
    catch (error) { await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "temporal-dagger-program-quarantine", schemaVersion: 1, key, raw, reason: error instanceof Error ? error.message : String(error) }))); return undefined; }
  }

  async #persist(value: TearTemporalDaggerProgramV1): Promise<TearTemporalDaggerProgramV1> {
    const program = parse(value), key = `${KEY}${program.id}`;
    await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(program) }, { store: "indexes", key: `temporal-dagger-program:${program.id}:${program.programHash}`, value: JSON.stringify({ status: program.status }) }]));
    return program;
  }

  async start(id: string, scenario: TearScenarioV1, options: TearDaggerCorrectionCaptureOptionsV1 = {}): Promise<TearTemporalDaggerProgramV1> {
    const existing = await this.get(id), capture = await captureTearDaggerCorrections(this.#registry, scenario, options);
    if (existing?.status && existing.status !== "completed") throw new RangeError("temporal DAgger program already has an unfinished round");
    if (existing?.rounds.some((entry) => entry.scenarioHash === capture.scenario.hash)) throw new RangeError("temporal DAgger program repeats a source scenario");
    const rounds = existing?.rounds ?? [], program = freeze({ format: "tear-temporal-dagger-program", schemaVersion: 1, id, datasetHash: this.#dataset.datasetHash,
      normalizationHash: this.#normalization.normalizationHash, configHash: stableVerificationHash(this.#config), status: "review-required", capture, reviews: Object.freeze([]), rounds: Object.freeze([...rounds, receipt(capture, "review-required", [])]) });
    return this.#persist(program);
  }

  async acceptReviews(id: string, reviews: readonly TearDaggerCorrectionReviewV1[]): Promise<TearTemporalDaggerProgramV1> {
    const current = await this.get(id); if (current?.status !== "review-required" || reviews.length < 1) throw new RangeError("temporal DAgger program is not awaiting reviews");
    for (const review of reviews) {
      const stored = await this.#reviews.get(current.capture.captureHash, review.correctionHash);
      if (stored?.reviewHash !== review.reviewHash || review.disposition !== "accepted") throw new RangeError("temporal DAgger program requires stored authorized accepted reviews");
    }
    const augmentation = createTearTemporalDaggerRetrainingInput(this.#dataset, this.#normalization, this.#config, current.capture, reviews);
    const checkpoint = createTearTemporalPolicyCheckpoint(this.#dataset, this.#normalization, this.#config, augmentation);
    const rounds = [...current.rounds.slice(0, -1), receipt(current.capture, "checkpointed", reviews, checkpoint)];
    return this.#persist(freeze({ ...current, status: "checkpointed", reviews, augmentation, checkpoint, rounds }));
  }

  async advance(id: string, epochs: number): Promise<TearTemporalDaggerProgramV1> {
    const current = await this.get(id); if ((current?.status !== "checkpointed" && current?.status !== "cancelled") || current.augmentation === undefined || current.checkpoint === undefined) throw new RangeError("temporal DAgger program cannot advance");
    const checkpoint = advanceTearTemporalPolicyCheckpoint(current.checkpoint, this.#dataset, this.#normalization, this.#config, epochs, current.augmentation);
    const training = checkpoint.epoch === this.#config.epochs ? completeTearTemporalPolicyCheckpoint(checkpoint, this.#dataset, this.#normalization, this.#config, current.augmentation) : undefined;
    const status: TearTemporalDaggerProgramStatus = training === undefined ? "checkpointed" : "completed";
    const rounds = [...current.rounds.slice(0, -1), receipt(current.capture, status, current.reviews, checkpoint, training)];
    return this.#persist(freeze({ ...current, status, checkpoint, ...(training === undefined ? {} : { training }), rounds }));
  }

  async cancel(id: string): Promise<TearTemporalDaggerProgramV1> {
    const current = await this.get(id); if (current?.status !== "checkpointed" || current.checkpoint === undefined) throw new RangeError("temporal DAgger program cannot cancel");
    const rounds = [...current.rounds.slice(0, -1), receipt(current.capture, "cancelled", current.reviews, current.checkpoint)];
    return this.#persist(freeze({ ...current, status: "cancelled", rounds }));
  }
}

/**
 * Advances only a declared source-round queue. A run can create one capture
 * and then returns at review-required; authorized review stays outside this
 * scheduler, and it can never register, activate, or promote a policy.
 */
export class TearTemporalDaggerProgramScheduler {
  readonly #programs: TearTemporalDaggerProgramController;
  constructor(programs: TearTemporalDaggerProgramController) { this.#programs = programs; }

  async run(schedule: TearTemporalDaggerProgramScheduleV1): Promise<TearTemporalDaggerProgramV1 | undefined> {
    if (!validSchedule(schedule)) throw new TypeError("temporal DAgger schedule integrity is invalid");
    const current = await this.#programs.get(schedule.programId);
    if (current !== undefined && current.status !== "completed") return current;
    const completed = new Set(current?.rounds.map((round) => round.scenarioHash) ?? []);
    const next = schedule.rounds.find((round) => !completed.has(stableVerificationHash(round.scenario)));
    return next === undefined ? current : this.#programs.start(schedule.programId, next.scenario, next.options);
  }
}

/** Durable custody for the one declared source-round queue a scheduler may run. */
export class TearTemporalDaggerProgramScheduleVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }

  async persist(input: TearTemporalDaggerProgramScheduleV1): Promise<TearTemporalDaggerProgramScheduleV1> {
    const schedule = parseSchedule(input), key = `${SCHEDULE_KEY}${schedule.programId}`;
    const existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) {
      const parsed = parseSchedule(JSON.parse(existing));
      if (parsed.scheduleHash !== schedule.scheduleHash) throw new RangeError("temporal DAgger schedule already exists for program");
      return parsed;
    }
    await this.#backend.commit(Object.freeze([
      { store: "analysis", key, value: JSON.stringify(schedule) },
      { store: "indexes", key: `temporal-dagger-program-schedule:${schedule.programId}:${schedule.scheduleHash}`, value: JSON.stringify({ rounds: schedule.rounds.length }) },
    ]));
    return schedule;
  }

  async get(programId: string): Promise<TearTemporalDaggerProgramScheduleV1 | undefined> {
    if (!text(programId)) throw new TypeError("temporal DAgger program id is required");
    const key = `${SCHEDULE_KEY}${programId}`, raw = await this.#backend.get("analysis", key);
    if (raw === undefined) return undefined;
    try { return parseSchedule(JSON.parse(raw)); }
    catch (error) {
      await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "temporal-dagger-schedule-quarantine", schemaVersion: 1, key, raw, reason: error instanceof Error ? error.message : String(error) })));
      return undefined;
    }
  }
}

/** Explicit durable invocation boundary; it can run only a persisted schedule. */
export class TearTemporalDaggerProgramOrchestrator {
  readonly #schedules: TearTemporalDaggerProgramScheduleVault;
  readonly #scheduler: TearTemporalDaggerProgramScheduler;
  constructor(schedules: TearTemporalDaggerProgramScheduleVault, scheduler: TearTemporalDaggerProgramScheduler) {
    this.#schedules = schedules; this.#scheduler = scheduler;
  }
  async run(programId: string): Promise<TearTemporalDaggerProgramV1 | undefined> {
    const schedule = await this.#schedules.get(programId);
    if (schedule === undefined) return undefined;
    return this.#scheduler.run(schedule);
  }
}

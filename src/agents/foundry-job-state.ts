import { stableVerificationHash } from "../replay/hash";

const HASH = /^[a-f0-9]{16}$/u;

/** C36 orchestration states. A state records authorized work; it is not proof that work produced a policy. */
export type TearFoundryJobPhase =
  | "created" | "collecting" | "curating" | "training" | "evaluating" | "deciding" | "monitoring"
  | "rejected" | "rolled-back" | "completed" | "cancelled" | "failed";

export interface TearFoundryFrozenInputsV1 {
  readonly champion: Readonly<{ id: string; artifactHash: string }>;
  /** Held C31 custody records only; their content is intentionally not copied into the job. */
  readonly corpusRecordHashes: readonly string[];
  readonly evaluationPlanHash: string;
  readonly rewardDefinitionHash: string;
  readonly invariantSetHash: string;
  readonly budgetHash: string;
  readonly stopConditionsHash: string;
}

export interface TearFoundryJobEventV1 {
  readonly sequence: number;
  readonly from: TearFoundryJobPhase | null;
  readonly to: TearFoundryJobPhase;
  readonly at: string;
  readonly reason: string;
  readonly previousEventHash?: string;
  readonly eventHash: string;
}

export interface TearFoundryJobV1 {
  readonly format: "tear-foundry-job";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly inputs: TearFoundryFrozenInputsV1;
  readonly phase: TearFoundryJobPhase;
  readonly events: readonly TearFoundryJobEventV1[];
  readonly jobHash: string;
}

export interface TearFoundryJobReportV1 {
  readonly format: "tear-foundry-job-report";
  readonly schemaVersion: 1;
  readonly jobId: string;
  readonly jobHash: string;
  readonly phase: TearFoundryJobPhase;
  readonly nextPhase: TearFoundryJobPhase | null;
  readonly resumable: boolean;
  readonly reportHash: string;
}

function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function timestamp(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function terminal(phase: TearFoundryJobPhase): boolean { return ["rejected", "rolled-back", "completed", "cancelled", "failed"].includes(phase); }

const NEXT: Readonly<Record<TearFoundryJobPhase, readonly TearFoundryJobPhase[]>> = Object.freeze({
  created: ["collecting", "cancelled", "failed"],
  collecting: ["curating", "cancelled", "failed"],
  curating: ["training", "rejected", "cancelled", "failed"],
  training: ["training", "evaluating", "rejected", "cancelled", "failed"],
  evaluating: ["evaluating", "deciding", "rejected", "cancelled", "failed"],
  deciding: ["monitoring", "rejected", "cancelled", "failed"],
  monitoring: ["completed", "rolled-back", "cancelled", "failed"],
  rejected: [], "rolled-back": [], completed: [], cancelled: [], failed: [],
});

function copyInputs(value: TearFoundryFrozenInputsV1): TearFoundryFrozenInputsV1 {
  if (!text(value.champion.id) || !hash(value.champion.artifactHash) || !Array.isArray(value.corpusRecordHashes)
    || value.corpusRecordHashes.length < 1 || value.corpusRecordHashes.length > 2_000 || !value.corpusRecordHashes.every(hash)
    || new Set(value.corpusRecordHashes).size !== value.corpusRecordHashes.length
    || ![value.evaluationPlanHash, value.rewardDefinitionHash, value.invariantSetHash, value.budgetHash, value.stopConditionsHash].every(hash)) {
    throw new TypeError("invalid frozen Foundry job inputs");
  }
  return Object.freeze({ champion: Object.freeze({ id: value.champion.id, artifactHash: value.champion.artifactHash }),
    corpusRecordHashes: Object.freeze([...value.corpusRecordHashes].sort()), evaluationPlanHash: value.evaluationPlanHash,
    rewardDefinitionHash: value.rewardDefinitionHash, invariantSetHash: value.invariantSetHash,
    budgetHash: value.budgetHash, stopConditionsHash: value.stopConditionsHash });
}
function eventHash(value: Omit<TearFoundryJobEventV1, "eventHash">): string { return stableVerificationHash(value); }
function append(events: readonly TearFoundryJobEventV1[], from: TearFoundryJobPhase | null, to: TearFoundryJobPhase, at: string, reason: string): TearFoundryJobEventV1 {
  if (!timestamp(at) || !text(reason)) throw new TypeError("Foundry job transition requires timestamp and reason");
  const prior = events.at(-1), draft = { sequence: events.length + 1, from, to, at, reason,
    ...(prior === undefined ? {} : { previousEventHash: prior.eventHash }) };
  return Object.freeze({ ...draft, eventHash: eventHash(draft) });
}
function copyEvents(value: readonly TearFoundryJobEventV1[], phase: TearFoundryJobPhase): readonly TearFoundryJobEventV1[] {
  if (value.length < 1) throw new TypeError("Foundry job needs an event history");
  let previous: string | undefined;
  const events = value.map((event, index) => {
    if (!Number.isSafeInteger(event.sequence) || event.sequence !== index + 1 || !timestamp(event.at) || !text(event.reason)
      || event.previousEventHash !== previous || !hash(event.eventHash) || (index === 0 ? event.from !== null || event.to !== "created" : event.from === null)
      || (index > 0 && (event.from === null || !NEXT[event.from].includes(event.to))) || event.eventHash !== eventHash({ sequence: event.sequence, from: event.from, to: event.to, at: event.at, reason: event.reason, ...(previous === undefined ? {} : { previousEventHash: previous }) })) {
      throw new TypeError("invalid Foundry job event history");
    }
    previous = event.eventHash;
    return Object.freeze({ ...event });
  });
  if (events.at(-1)?.to !== phase) throw new TypeError("Foundry job phase disagrees with event history");
  return Object.freeze(events);
}
function freeze(draft: Omit<TearFoundryJobV1, "jobHash">): TearFoundryJobV1 {
  if (!text(draft.id) || !Object.hasOwn(NEXT, draft.phase)) throw new TypeError("invalid Foundry job");
  const value = Object.freeze({ format: "tear-foundry-job" as const, schemaVersion: 1 as const, id: draft.id,
    inputs: copyInputs(draft.inputs), phase: draft.phase, events: copyEvents(draft.events, draft.phase) });
  return Object.freeze({ ...value, jobHash: stableVerificationHash(value) });
}

/** Creates an immutable C36 work request. Callers cannot embed a challenger, score dictionary, or decision. */
export function createTearFoundryJob(input: Omit<TearFoundryJobV1, "format" | "schemaVersion" | "phase" | "events" | "jobHash"> & Readonly<{ createdAt: string; reason: string }>): TearFoundryJobV1 {
  return freeze({ format: "tear-foundry-job", schemaVersion: 1, id: input.id, inputs: input.inputs, phase: "created",
    events: Object.freeze([append([], null, "created", input.createdAt, input.reason)]) });
}
export function parseTearFoundryJob(value: unknown): TearFoundryJobV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid Foundry job");
  const source = value as Record<string, unknown>;
  if (source.format !== "tear-foundry-job" || source.schemaVersion !== 1 || !hash(source.jobHash)) throw new TypeError("invalid Foundry job");
  const typed = source as unknown as TearFoundryJobV1;
  const { jobHash, ...draft } = typed, parsed = freeze(draft);
  if (jobHash !== parsed.jobHash) throw new TypeError("Foundry job integrity mismatch");
  return parsed;
}
/** Advances only the fixed C36 workflow. This does not invoke a trainer, evaluator, registry, or policy activation. */
export function transitionTearFoundryJob(job: TearFoundryJobV1, to: TearFoundryJobPhase, at: string, reason: string): TearFoundryJobV1 {
  const current = parseTearFoundryJob(job);
  if (terminal(current.phase) || !NEXT[current.phase].includes(to)) throw new RangeError(`illegal Foundry job transition: ${current.phase} -> ${to}`);
  return freeze({ ...current, events: Object.freeze([...current.events, append(current.events, current.phase, to, at, reason)]), phase: to });
}
/** A restart may resume the current nonterminal phase, never infer a completed action or decision. */
export function reportTearFoundryJob(job: TearFoundryJobV1): TearFoundryJobReportV1 {
  const current = parseTearFoundryJob(job), resumable = !terminal(current.phase);
  const draft = { format: "tear-foundry-job-report" as const, schemaVersion: 1 as const, jobId: current.id, jobHash: current.jobHash,
    phase: current.phase, nextPhase: resumable ? current.phase : null, resumable };
  return Object.freeze({ ...draft, reportHash: stableVerificationHash(draft) });
}

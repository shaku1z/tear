import { stableVerificationHash } from "../replay/hash";

export const C30_TRAINING_CAPACITY_WORKLOAD_KINDS = Object.freeze([
  "bc", "dagger", "rl",
] as const);

export type C30TrainingCapacityWorkloadKind = (typeof C30_TRAINING_CAPACITY_WORKLOAD_KINDS)[number];

export interface ProductionHeadlessHardwareProfile {
  /** Caller-declared identity; portable code cannot attest the physical host. */
  readonly id: string;
  readonly classification: "developer" | "target";
  readonly declaredBy: string;
  readonly operatingSystem: string;
  readonly processor: string;
  readonly physicalMemoryBytes: number;
}

export interface C30TrainingCapacityBudget {
  readonly minimumEpisodesPerMinute: number;
  readonly maximumP95EpisodeMilliseconds: number;
  readonly maximumRetainedHeapBytes: number;
}

/** A declared episode-fabric workload, not a claim that a trainer itself ran. */
export interface C30TrainingCapacityWorkload {
  readonly kind: C30TrainingCapacityWorkloadKind;
  readonly episodes: number;
  readonly maxTicks: number;
  readonly poolSize: number;
  readonly batchSize: number;
  readonly artifactSampleLimit: number;
  readonly budget: C30TrainingCapacityBudget;
}

export interface C30TrainingCapacityDeclarationV1 {
  readonly format: "tearbench-production-training-capacity-declaration";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly declaredAt: string;
  readonly hardware: ProductionHeadlessHardwareProfile;
  readonly workloads: readonly C30TrainingCapacityWorkload[];
  readonly declarationHash: string;
}

type C30TrainingCapacityDeclarationDraft = Omit<C30TrainingCapacityDeclarationV1, "declarationHash">;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= maximum;
}

function nonNegativeInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function validTimestamp(value: unknown): value is string {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function freezeHardware(value: unknown, targetRequired: boolean): ProductionHeadlessHardwareProfile {
  const entry = record(value);
  const classifications: ReadonlySet<string> = new Set(["developer", "target"]);
  if (entry === undefined || !nonEmpty(entry.id) || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(entry.id)
    || !nonEmpty(entry.declaredBy) || !nonEmpty(entry.operatingSystem) || !nonEmpty(entry.processor)
    || !classifications.has(String(entry.classification))
    || !positiveInteger(entry.physicalMemoryBytes, Number.MAX_SAFE_INTEGER)
    || (targetRequired && entry.classification !== "target")) {
    throw new TypeError("C30 capacity declaration hardware profile is invalid");
  }
  return Object.freeze({
    id: entry.id, classification: entry.classification as "developer" | "target",
    declaredBy: entry.declaredBy, operatingSystem: entry.operatingSystem,
    processor: entry.processor, physicalMemoryBytes: entry.physicalMemoryBytes,
  });
}

function freezeBudget(value: unknown): C30TrainingCapacityBudget {
  const entry = record(value);
  if (entry === undefined || !positiveInteger(entry.minimumEpisodesPerMinute, 10_000_000)
    || !positiveInteger(entry.maximumP95EpisodeMilliseconds, 3_600_000)
    || !nonNegativeInteger(entry.maximumRetainedHeapBytes, Number.MAX_SAFE_INTEGER)) {
    throw new TypeError("C30 capacity declaration budget is invalid");
  }
  return Object.freeze({
    minimumEpisodesPerMinute: entry.minimumEpisodesPerMinute,
    maximumP95EpisodeMilliseconds: entry.maximumP95EpisodeMilliseconds,
    maximumRetainedHeapBytes: entry.maximumRetainedHeapBytes,
  });
}

function freezeWorkload(value: unknown): C30TrainingCapacityWorkload {
  const entry = record(value);
  if (entry === undefined || !C30_TRAINING_CAPACITY_WORKLOAD_KINDS.includes(entry.kind as C30TrainingCapacityWorkloadKind)
    || !positiveInteger(entry.episodes, 100_000) || !positiveInteger(entry.maxTicks, 1_000_000)
    || !positiveInteger(entry.poolSize, 256) || !positiveInteger(entry.batchSize, 1_024)
    || !positiveInteger(entry.artifactSampleLimit, 1_024)) {
    throw new TypeError("C30 capacity declaration workload is invalid");
  }
  return Object.freeze({
    kind: entry.kind as C30TrainingCapacityWorkloadKind,
    episodes: entry.episodes, maxTicks: entry.maxTicks, poolSize: entry.poolSize,
    batchSize: entry.batchSize, artifactSampleLimit: entry.artifactSampleLimit,
    budget: freezeBudget(entry.budget),
  });
}

function freezeDraft(value: unknown): C30TrainingCapacityDeclarationDraft {
  const entry = record(value);
  if (entry?.format !== "tearbench-production-training-capacity-declaration"
    || entry.schemaVersion !== 1 || !nonEmpty(entry.id)
    || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(entry.id) || !validTimestamp(entry.declaredAt)
    || !Array.isArray(entry.workloads)) {
    throw new TypeError("C30 training capacity declaration is invalid");
  }
  const workloads = entry.workloads.map(freezeWorkload);
  const kinds = new Set(workloads.map((workload) => workload.kind));
  if (workloads.length !== C30_TRAINING_CAPACITY_WORKLOAD_KINDS.length
    || kinds.size !== C30_TRAINING_CAPACITY_WORKLOAD_KINDS.length
    || C30_TRAINING_CAPACITY_WORKLOAD_KINDS.some((kind) => !kinds.has(kind))) {
    throw new TypeError("C30 capacity declaration must declare exactly BC, DAgger, and RL workloads");
  }
  return Object.freeze({
    format: "tearbench-production-training-capacity-declaration", schemaVersion: 1,
    id: entry.id, declaredAt: entry.declaredAt, hardware: freezeHardware(entry.hardware, true),
    workloads: Object.freeze(workloads),
  });
}

/** Creates a self-hashed, caller-supplied target-capacity declaration. */
export function createC30TrainingCapacityDeclaration(
  value: C30TrainingCapacityDeclarationDraft,
): C30TrainingCapacityDeclarationV1 {
  const draft = freezeDraft(value);
  return Object.freeze({ ...draft, declarationHash: stableVerificationHash(draft) });
}

/** Parses untrusted JSON and rejects an altered declaration or a non-target host. */
export function parseC30TrainingCapacityDeclaration(value: unknown): C30TrainingCapacityDeclarationV1 {
  const entry = record(value);
  if (entry === undefined || !nonEmpty(entry.declarationHash)) {
    throw new TypeError("C30 capacity declaration hash is missing");
  }
  const { declarationHash, ...draft } = entry;
  const declaration = createC30TrainingCapacityDeclaration(draft as C30TrainingCapacityDeclarationDraft);
  if (declarationHash !== declaration.declarationHash) {
    throw new TypeError("C30 capacity declaration integrity mismatch");
  }
  return declaration;
}

import { stableVerificationHash } from "../replay/hash";
import type { GhostChunkEncoding } from "./capsule-codec";
import { GHOST_RECORDING_PROFILES, type GhostRecordingProfileId } from "./recording-profiles";
import type { GhostChunkKind, TearGhostChunkIndexEntry } from "./capsule-vault";

export const GHOST_CAPSULE_FORMAT = "tearghost-capsule" as const;
export const GHOST_CAPSULE_SCHEMA_VERSION = 2 as const;
export const GHOST_CAPSULE_CONTRACT_FORMAT = "tearghost-capsule-contract" as const;
export const GHOST_CAPSULE_CONTRACT_SCHEMA_VERSION = 1 as const;
export const GHOST_CAPSULE_INTEGRITY_FORMAT = "tearghost-capsule-integrity" as const;
export const GHOST_CAPSULE_INTEGRITY_SCHEMA_VERSION = 1 as const;

export type GhostCapsuleStatus = "recording" | "complete" | "recovered" | "repaired" | "quarantined";

export interface GhostCapsuleFidelity {
  readonly presentation: "full" | "reduced" | "dropped";
  readonly downgrades: readonly string[];
}

/**
 * Declares the durable V3 track grammar without promoting an individual entry
 * to verified simulation truth. Readers validate command, causal-event, and
 * State Forge payloads at their own boundary.
 */
export interface GhostCapsuleContractV1 {
  readonly format: typeof GHOST_CAPSULE_CONTRACT_FORMAT;
  readonly schemaVersion: typeof GHOST_CAPSULE_CONTRACT_SCHEMA_VERSION;
  readonly provenance: "declared-json-v1" | "absent-legacy";
  readonly compatibility: Readonly<{
    readonly capsuleReader: "tearghost-capsule-v2";
    readonly replayContext: "declared-v1-or-unavailable";
    readonly chunkEncodings: readonly GhostChunkEncoding[];
  }>;
  readonly tracks: Readonly<{
    readonly commands: "canonical-action-envelope-v1";
    readonly rng: "named-rng-snapshot-v1";
    readonly events: "tear-causal-event-v1";
    readonly results: "ghost-result-record-v1";
    readonly keyframes: "tear-snapshot-v1";
    readonly presentation: "presentation-sample-v1";
  }>;
  readonly quality: Readonly<{
    readonly recordingProfile: GhostRecordingProfileId | "legacy-unknown";
    readonly presentation: GhostCapsuleFidelity["presentation"];
    readonly downgrades: readonly string[];
  }>;
}

/** Binds schema-v2 capsule identity and declarations to the chunk-root hash. */
export interface GhostCapsuleIntegrityV1 {
  readonly format: typeof GHOST_CAPSULE_INTEGRITY_FORMAT;
  readonly schemaVersion: typeof GHOST_CAPSULE_INTEGRITY_SCHEMA_VERSION;
  readonly rootIntegrity: string;
  readonly manifestHash: string;
}

interface TearGhostManifestBase {
  readonly format: typeof GHOST_CAPSULE_FORMAT;
  readonly id: string;
  readonly status: GhostCapsuleStatus;
  readonly createdAt: string;
  readonly recordingProfile: GhostRecordingProfileId | "legacy-unknown";
  readonly provenance?: Readonly<Record<string, unknown>>;
  readonly completedAt?: string;
  readonly chunks: readonly TearGhostChunkIndexEntry[];
  readonly rootIntegrity: string;
  readonly fidelity: GhostCapsuleFidelity;
  readonly lineage?: Readonly<{ parentId: string; relation: "repaired-from" }>;
}

/** Original durable shape. It remains readable, but is never newly written. */
export interface TearGhostManifestV1 extends TearGhostManifestBase {
  readonly schemaVersion: 1;
}

/** Current durable shape with a hash-bound contract and extension namespace. */
export interface TearGhostManifestV2 extends TearGhostManifestBase {
  readonly schemaVersion: typeof GHOST_CAPSULE_SCHEMA_VERSION;
  readonly contract: GhostCapsuleContractV1;
  readonly integrity: GhostCapsuleIntegrityV1;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export type TearGhostManifest = TearGhostManifestV1 | TearGhostManifestV2;

function dataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clonePlainCapsuleData(value: unknown, depth = 0): unknown {
  if (depth > 32) throw new RangeError("capsule plain data exceeds nesting limit");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "number") throw new TypeError("capsule plain data contains a non-finite number");
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => clonePlainCapsuleData(entry, depth + 1)));
  if (!dataRecord(value)) throw new TypeError("capsule plain data must be JSON-compatible");
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") throw new TypeError(`capsule plain data contains reserved key: ${key}`);
    copy[key] = clonePlainCapsuleData(entry, depth + 1);
  }
  return Object.freeze(copy);
}

function parsePlainRecord(value: unknown, label: string): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (!dataRecord(value)) throw new TypeError(`${label} must be a plain object`);
  return clonePlainCapsuleData(value) as Readonly<Record<string, unknown>>;
}

function isGhostChunkEncoding(value: unknown): value is GhostChunkEncoding {
  return value === "utf8-base64" || value === "utf8-base64-v1" || value === "gzip-base64-v1";
}

const GHOST_CAPSULE_CONTRACT_ENCODINGS = Object.freeze([
  "utf8-base64", "utf8-base64-v1", "gzip-base64-v1",
] as const satisfies readonly GhostChunkEncoding[]);

const GHOST_CAPSULE_TRACK_CODECS = Object.freeze({
  commands: "canonical-action-envelope-v1",
  rng: "named-rng-snapshot-v1",
  events: "tear-causal-event-v1",
  results: "ghost-result-record-v1",
  keyframes: "tear-snapshot-v1",
  presentation: "presentation-sample-v1",
} as const);

export interface GhostCapsuleContractInput {
  readonly provenance?: Readonly<Record<string, unknown>>;
  readonly recordingProfile: GhostRecordingProfileId | "legacy-unknown";
  readonly fidelity: GhostCapsuleFidelity;
}

export function createGhostCapsuleContract(input: GhostCapsuleContractInput): GhostCapsuleContractV1 {
  return Object.freeze({
    format: GHOST_CAPSULE_CONTRACT_FORMAT,
    schemaVersion: GHOST_CAPSULE_CONTRACT_SCHEMA_VERSION,
    provenance: input.provenance === undefined ? "absent-legacy" : "declared-json-v1",
    compatibility: Object.freeze({
      capsuleReader: "tearghost-capsule-v2",
      replayContext: "declared-v1-or-unavailable",
      chunkEncodings: Object.freeze([...GHOST_CAPSULE_CONTRACT_ENCODINGS]),
    }),
    tracks: GHOST_CAPSULE_TRACK_CODECS,
    quality: Object.freeze({
      recordingProfile: input.recordingProfile,
      presentation: input.fidelity.presentation,
      downgrades: Object.freeze([...input.fidelity.downgrades]),
    }),
  });
}

function parseCapsuleContract(value: unknown): GhostCapsuleContractV1 {
  if (!dataRecord(value) || value.format !== GHOST_CAPSULE_CONTRACT_FORMAT
    || value.schemaVersion !== GHOST_CAPSULE_CONTRACT_SCHEMA_VERSION
    || !["declared-json-v1", "absent-legacy"].includes(String(value.provenance))
    || !dataRecord(value.compatibility) || !dataRecord(value.tracks) || !dataRecord(value.quality)) {
    throw new TypeError("unsupported capsule contract");
  }
  const compatibility = value.compatibility;
  const tracks = value.tracks;
  const quality = value.quality;
  if (compatibility.capsuleReader !== "tearghost-capsule-v2"
    || compatibility.replayContext !== "declared-v1-or-unavailable"
    || !Array.isArray(compatibility.chunkEncodings)
    || compatibility.chunkEncodings.length !== GHOST_CAPSULE_CONTRACT_ENCODINGS.length
    || compatibility.chunkEncodings.some((encoding, index) => encoding !== GHOST_CAPSULE_CONTRACT_ENCODINGS[index])
    || tracks.commands !== GHOST_CAPSULE_TRACK_CODECS.commands
    || tracks.rng !== GHOST_CAPSULE_TRACK_CODECS.rng
    || tracks.events !== GHOST_CAPSULE_TRACK_CODECS.events
    || tracks.results !== GHOST_CAPSULE_TRACK_CODECS.results
    || tracks.keyframes !== GHOST_CAPSULE_TRACK_CODECS.keyframes
    || tracks.presentation !== GHOST_CAPSULE_TRACK_CODECS.presentation
    || (typeof quality.recordingProfile !== "string"
      || (quality.recordingProfile !== "legacy-unknown" && !(quality.recordingProfile in GHOST_RECORDING_PROFILES)))
    || !["full", "reduced", "dropped"].includes(String(quality.presentation))
    || !Array.isArray(quality.downgrades) || !quality.downgrades.every((entry) => typeof entry === "string")) {
    throw new TypeError("invalid capsule contract");
  }
  return Object.freeze({
    format: GHOST_CAPSULE_CONTRACT_FORMAT,
    schemaVersion: GHOST_CAPSULE_CONTRACT_SCHEMA_VERSION,
    provenance: value.provenance as GhostCapsuleContractV1["provenance"],
    compatibility: Object.freeze({
      capsuleReader: "tearghost-capsule-v2",
      replayContext: "declared-v1-or-unavailable",
      chunkEncodings: Object.freeze([...GHOST_CAPSULE_CONTRACT_ENCODINGS]),
    }),
    tracks: GHOST_CAPSULE_TRACK_CODECS,
    quality: Object.freeze({
      recordingProfile: quality.recordingProfile as GhostCapsuleContractV1["quality"]["recordingProfile"],
      presentation: quality.presentation as GhostCapsuleFidelity["presentation"],
      downgrades: Object.freeze([...quality.downgrades]),
    }),
  });
}

function parseChunkIndex(value: unknown): TearGhostChunkIndexEntry {
  if (!dataRecord(value)
    || typeof value.id !== "string"
    || !["commands", "rng", "events", "results", "keyframes", "presentation"].includes(String(value.kind))
    || !Number.isSafeInteger(value.sequence)
    || !Number.isSafeInteger(value.fromTick)
    || !Number.isSafeInteger(value.toTick)
    || !isGhostChunkEncoding(value.encoding)
    || !Number.isSafeInteger(value.compressedBytes)
    || !Number.isSafeInteger(value.uncompressedBytes)
    || typeof value.checksum !== "string") {
    throw new TypeError("capsule contains an invalid chunk index");
  }
  return Object.freeze({
    id: value.id, kind: value.kind as GhostChunkKind, sequence: value.sequence as number,
    fromTick: value.fromTick as number, toTick: value.toTick as number, encoding: value.encoding,
    compressedBytes: value.compressedBytes as number, uncompressedBytes: value.uncompressedBytes as number, checksum: value.checksum,
  });
}

type GhostCapsuleManifestV2Data = Omit<TearGhostManifestV2, "integrity">;

function manifestIntegrityPayload(manifest: GhostCapsuleManifestV2Data): Readonly<Record<string, unknown>> {
  return Object.freeze({
    format: manifest.format, schemaVersion: manifest.schemaVersion, id: manifest.id, status: manifest.status,
    createdAt: manifest.createdAt, recordingProfile: manifest.recordingProfile,
    ...(manifest.provenance === undefined ? {} : { provenance: manifest.provenance }),
    ...(manifest.completedAt === undefined ? {} : { completedAt: manifest.completedAt }),
    chunks: manifest.chunks, rootIntegrity: manifest.rootIntegrity, fidelity: manifest.fidelity,
    ...(manifest.lineage === undefined ? {} : { lineage: manifest.lineage }), contract: manifest.contract,
    ...(manifest.extensions === undefined ? {} : { extensions: manifest.extensions }),
  });
}

function createManifestIntegrity(manifest: GhostCapsuleManifestV2Data): GhostCapsuleIntegrityV1 {
  return Object.freeze({
    format: GHOST_CAPSULE_INTEGRITY_FORMAT, schemaVersion: GHOST_CAPSULE_INTEGRITY_SCHEMA_VERSION,
    rootIntegrity: manifest.rootIntegrity, manifestHash: stableVerificationHash(manifestIntegrityPayload(manifest)),
  });
}

export interface CreateGhostCapsuleManifestV2Input {
  readonly id: string;
  readonly status: GhostCapsuleStatus;
  readonly createdAt: string;
  readonly recordingProfile: GhostRecordingProfileId | "legacy-unknown";
  readonly provenance?: Readonly<Record<string, unknown>>;
  readonly completedAt?: string;
  readonly chunks: readonly TearGhostChunkIndexEntry[];
  readonly rootIntegrity: string;
  readonly fidelity: GhostCapsuleFidelity;
  readonly lineage?: Readonly<{ parentId: string; relation: "repaired-from" }>;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

/** Creates a current envelope; the Vault supplies the independently computed chunk root. */
export function createGhostCapsuleManifestV2(input: CreateGhostCapsuleManifestV2Input): TearGhostManifestV2 {
  const chunks = Object.freeze([...input.chunks]);
  const fidelity = Object.freeze({ presentation: input.fidelity.presentation, downgrades: Object.freeze([...input.fidelity.downgrades]) });
  const provenance = input.provenance === undefined ? undefined : parsePlainRecord(input.provenance, "capsule provenance");
  const extensions = input.extensions === undefined ? undefined : parsePlainRecord(input.extensions, "capsule extensions");
  const data: GhostCapsuleManifestV2Data = Object.freeze({
    format: GHOST_CAPSULE_FORMAT, schemaVersion: GHOST_CAPSULE_SCHEMA_VERSION, id: input.id, status: input.status,
    createdAt: input.createdAt, recordingProfile: input.recordingProfile,
    ...(provenance === undefined ? {} : { provenance }), ...(input.completedAt === undefined ? {} : { completedAt: input.completedAt }),
    chunks, rootIntegrity: input.rootIntegrity, fidelity,
    ...(input.lineage === undefined ? {} : { lineage: Object.freeze({ ...input.lineage }) }),
    contract: createGhostCapsuleContract({ ...(provenance === undefined ? {} : { provenance }), recordingProfile: input.recordingProfile, fidelity }),
    ...(extensions === undefined ? {} : { extensions }),
  });
  return Object.freeze({ ...data, integrity: createManifestIntegrity(data) });
}

/** A pure compatibility bridge; callers choose whether and when to persist it. */
export function migrateGhostCapsuleManifestV1(manifest: TearGhostManifestV1): TearGhostManifestV2 {
  return createGhostCapsuleManifestV2(manifest);
}

export interface GhostCapsuleManifestRevision {
  readonly id?: string;
  readonly status?: GhostCapsuleStatus;
  readonly createdAt?: string;
  readonly completedAt?: string;
  readonly chunks?: readonly TearGhostChunkIndexEntry[];
  readonly rootIntegrity?: string;
  readonly fidelity?: GhostCapsuleFidelity;
  readonly lineage?: Readonly<{ parentId: string; relation: "repaired-from" }>;
}

/** Reissues schema-v2 integrity after a legitimate lifecycle or repair update. */
export function reviseGhostCapsuleManifest(manifest: TearGhostManifest, revision: GhostCapsuleManifestRevision): TearGhostManifest {
  if (manifest.schemaVersion === 1) return Object.freeze({ ...manifest, ...revision });
  const completedAt = revision.completedAt ?? manifest.completedAt;
  const lineage = revision.lineage ?? manifest.lineage;
  return createGhostCapsuleManifestV2({
    id: revision.id ?? manifest.id, status: revision.status ?? manifest.status, createdAt: revision.createdAt ?? manifest.createdAt,
    recordingProfile: manifest.recordingProfile, ...(manifest.provenance === undefined ? {} : { provenance: manifest.provenance }),
    ...(completedAt === undefined ? {} : { completedAt }), chunks: revision.chunks ?? manifest.chunks,
    rootIntegrity: revision.rootIntegrity ?? manifest.rootIntegrity, fidelity: revision.fidelity ?? manifest.fidelity,
    ...(lineage === undefined ? {} : { lineage }), ...(manifest.extensions === undefined ? {} : { extensions: manifest.extensions }),
  });
}

function parseCapsuleManifestV1(value: Record<string, unknown>): TearGhostManifestV1 {
  if (value.format !== GHOST_CAPSULE_FORMAT || value.schemaVersion !== 1 || typeof value.id !== "string"
    || !["recording", "complete", "recovered", "repaired", "quarantined"].includes(String(value.status))
    || typeof value.createdAt !== "string" || !Array.isArray(value.chunks) || typeof value.rootIntegrity !== "string"
    || !dataRecord(value.fidelity) || !["full", "reduced", "dropped"].includes(String(value.fidelity.presentation))
    || !Array.isArray(value.fidelity.downgrades) || !value.fidelity.downgrades.every((entry) => typeof entry === "string")) {
    throw new TypeError("unsupported capsule manifest");
  }
  const provenance = parsePlainRecord(value.provenance, "capsule provenance");
  const chunks = Object.freeze(value.chunks.map(parseChunkIndex));
  return Object.freeze({
    format: GHOST_CAPSULE_FORMAT, schemaVersion: 1, id: value.id, status: value.status as GhostCapsuleStatus, createdAt: value.createdAt,
    recordingProfile: typeof value.recordingProfile === "string" && value.recordingProfile in GHOST_RECORDING_PROFILES
      ? value.recordingProfile as GhostRecordingProfileId : "legacy-unknown",
    ...(provenance === undefined ? {} : { provenance }), ...(typeof value.completedAt === "string" ? { completedAt: value.completedAt } : {}),
    chunks, rootIntegrity: value.rootIntegrity,
    fidelity: Object.freeze({ presentation: value.fidelity.presentation as GhostCapsuleFidelity["presentation"], downgrades: Object.freeze([...value.fidelity.downgrades]) }),
    ...(dataRecord(value.lineage) && typeof value.lineage.parentId === "string" && value.lineage.relation === "repaired-from"
      ? { lineage: Object.freeze({ parentId: value.lineage.parentId, relation: "repaired-from" as const }) } : {}),
  });
}

function parseCapsuleManifestV2(value: Record<string, unknown>): TearGhostManifestV2 {
  if (value.format !== GHOST_CAPSULE_FORMAT || value.schemaVersion !== GHOST_CAPSULE_SCHEMA_VERSION || typeof value.id !== "string"
    || !["recording", "complete", "recovered", "repaired", "quarantined"].includes(String(value.status))
    || typeof value.createdAt !== "string" || !Array.isArray(value.chunks) || typeof value.rootIntegrity !== "string"
    || !dataRecord(value.fidelity) || !["full", "reduced", "dropped"].includes(String(value.fidelity.presentation))
    || !Array.isArray(value.fidelity.downgrades) || !value.fidelity.downgrades.every((entry) => typeof entry === "string")) {
    throw new TypeError("unsupported capsule manifest");
  }
  const provenance = parsePlainRecord(value.provenance, "capsule provenance");
  const chunks = Object.freeze(value.chunks.map(parseChunkIndex));
  const fidelity = Object.freeze({ presentation: value.fidelity.presentation as GhostCapsuleFidelity["presentation"], downgrades: Object.freeze([...value.fidelity.downgrades]) });
  const contract = parseCapsuleContract(value.contract);
  const recordingProfile = typeof value.recordingProfile === "string" && value.recordingProfile in GHOST_RECORDING_PROFILES
    ? value.recordingProfile as GhostRecordingProfileId : "legacy-unknown";
  if (contract.provenance !== (provenance === undefined ? "absent-legacy" : "declared-json-v1")
    || contract.quality.recordingProfile !== recordingProfile || contract.quality.presentation !== fidelity.presentation
    || stableVerificationHash(contract.quality.downgrades) !== stableVerificationHash(fidelity.downgrades)) {
    throw new TypeError("capsule contract does not match durable declarations");
  }
  const extensions = value.extensions === undefined ? undefined : parsePlainRecord(value.extensions, "capsule extensions");
  const data: GhostCapsuleManifestV2Data = Object.freeze({
    format: GHOST_CAPSULE_FORMAT, schemaVersion: GHOST_CAPSULE_SCHEMA_VERSION, id: value.id, status: value.status as GhostCapsuleStatus,
    createdAt: value.createdAt, recordingProfile, ...(provenance === undefined ? {} : { provenance }),
    ...(typeof value.completedAt === "string" ? { completedAt: value.completedAt } : {}), chunks, rootIntegrity: value.rootIntegrity, fidelity,
    ...(dataRecord(value.lineage) && typeof value.lineage.parentId === "string" && value.lineage.relation === "repaired-from"
      ? { lineage: Object.freeze({ parentId: value.lineage.parentId, relation: "repaired-from" as const }) } : {}),
    contract, ...(extensions === undefined ? {} : { extensions }),
  });
  if (!dataRecord(value.integrity) || value.integrity.format !== GHOST_CAPSULE_INTEGRITY_FORMAT
    || value.integrity.schemaVersion !== GHOST_CAPSULE_INTEGRITY_SCHEMA_VERSION || value.integrity.rootIntegrity !== data.rootIntegrity
    || typeof value.integrity.manifestHash !== "string"
    || stableVerificationHash(manifestIntegrityPayload(data)) !== value.integrity.manifestHash) {
    throw new TypeError("capsule manifest integrity mismatch");
  }
  return Object.freeze({ ...data, integrity: Object.freeze({
    format: GHOST_CAPSULE_INTEGRITY_FORMAT, schemaVersion: GHOST_CAPSULE_INTEGRITY_SCHEMA_VERSION,
    rootIntegrity: data.rootIntegrity, manifestHash: value.integrity.manifestHash,
  }) });
}

export function parseGhostCapsuleManifest(value: unknown): TearGhostManifest {
  if (!dataRecord(value) || value.format !== GHOST_CAPSULE_FORMAT) throw new TypeError("unsupported capsule manifest");
  if (value.schemaVersion === 1) return parseCapsuleManifestV1(value);
  if (value.schemaVersion === GHOST_CAPSULE_SCHEMA_VERSION) return parseCapsuleManifestV2(value);
  throw new TypeError("unsupported capsule manifest schema version");
}

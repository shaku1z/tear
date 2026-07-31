import { ghostRootIntegrity, type TearGhostManifest } from "./capsule-vault";
import type { GhostReadCapsule } from "./capsule-reader";
import { ghostLiveBootstrapEventId } from "./live-causal-events";
import { stableVerificationHash } from "../replay/hash";
import type { TearCausalEventV1, TearSnapshotV1 } from "../tearbench/contracts";
import { validateTearContract } from "../tearbench/validation";

export const GHOST_REPLAY_CONTEXT_FORMAT = "tear-ghost-replay-context" as const;
export const GHOST_REPLAY_CONTEXT_SCHEMA_VERSION = 1 as const;
export const GHOST_REPLAY_CONTEXT_PROVENANCE_KEY = "replayContext" as const;

export interface GhostReplayBuildFingerprint {
  readonly version: string;
  readonly revision: string;
  readonly target: string;
  readonly rulesetVersion: string;
  readonly contentHash: string;
  readonly configHash: string;
}

export interface GhostReplayRngState {
  readonly algorithm: string;
  readonly seed?: string;
  readonly state: string;
  readonly cursor?: number;
}

export interface GhostReplayRunContextV1 {
  readonly format: typeof GHOST_REPLAY_CONTEXT_FORMAT;
  readonly schemaVersion: typeof GHOST_REPLAY_CONTEXT_SCHEMA_VERSION;
  readonly run: Readonly<{
    id: string;
    seed: string;
    mode: string;
    difficulty: string;
    weaponId: string;
  }>;
  readonly simulation: Readonly<{
    ticksPerSecond: 120;
    initialState: "seeded-run-start";
  }>;
  readonly build: GhostReplayBuildFingerprint;
  /** Named stream states at tick zero, before gameplay consumes any random values. */
  readonly rng: Readonly<Record<string, GhostReplayRngState>>;
}

export interface GhostReplayRunContextInput {
  readonly runId: string;
  readonly seed: string | number;
  readonly mode: string;
  readonly difficulty: string;
  readonly weaponId: string;
  readonly ticksPerSecond: number;
  readonly build: GhostReplayBuildFingerprint;
  readonly rng: Readonly<Record<string, Readonly<{
    algorithm?: string;
    seed?: string | number;
    state: string | number;
    cursor?: number;
  }>>>;
}

export interface GhostReplayRuntimeDescriptor {
  readonly id: string;
  readonly build: GhostReplayBuildFingerprint;
  readonly ticksPerSecond: number;
}

export type GhostReplayAdmission =
  | Readonly<{ status: "rejected"; reason: string }>
  | Readonly<{ status: "unavailable"; reason: string; context: GhostReplayRunContextV1 }>
  | Readonly<{ status: "compatible"; reason: string; context: GhostReplayRunContextV1; runtimeId: string }>;

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function finiteString(value: string | number, label: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new TypeError(`${label} must be a finite number or non-empty string`);
}

function fingerprint(value: unknown, label: string): GhostReplayBuildFingerprint {
  const candidate = record(value);
  if (candidate === undefined) throw new TypeError(`${label} must be an object`);
  return Object.freeze({
    version: nonEmptyString(candidate.version, `${label}.version`),
    revision: nonEmptyString(candidate.revision, `${label}.revision`),
    target: nonEmptyString(candidate.target, `${label}.target`),
    rulesetVersion: nonEmptyString(candidate.rulesetVersion, `${label}.rulesetVersion`),
    contentHash: nonEmptyString(candidate.contentHash, `${label}.contentHash`),
    configHash: nonEmptyString(candidate.configHash, `${label}.configHash`),
  });
}

function normalizeRng(value: unknown, label: string): Readonly<Record<string, GhostReplayRngState>> {
  const candidate = record(value);
  if (candidate === undefined || Object.keys(candidate).length === 0) throw new TypeError(`${label} must contain named streams`);
  const streams = Object.entries(candidate).map(([name, state]) => {
    const snapshot = record(state);
    if (snapshot === undefined) throw new TypeError(`${label}.${name} must be an object`);
    const cursor = snapshot.cursor;
    if (cursor !== undefined && (typeof cursor !== "number" || !Number.isSafeInteger(cursor) || cursor < 0)) {
      throw new TypeError(`${label}.${name}.cursor must be a non-negative integer`);
    }
    const normalizedCursor = typeof cursor === "number" ? cursor : undefined;
    const seed = snapshot.seed;
    return [name, Object.freeze({
      algorithm: nonEmptyString(snapshot.algorithm ?? "mulberry32", `${label}.${name}.algorithm`),
      ...(seed === undefined ? {} : { seed: finiteString(seed as string | number, `${label}.${name}.seed`) }),
      state: finiteString(snapshot.state as string | number, `${label}.${name}.state`),
      ...(normalizedCursor === undefined ? {} : { cursor: normalizedCursor }),
    })] as const;
  });
  return Object.freeze(Object.fromEntries(streams.sort(([left], [right]) => left.localeCompare(right))));
}

function normalizeContext(value: unknown, label: string): GhostReplayRunContextV1 {
  const candidate = record(value);
  if (candidate === undefined) throw new TypeError(`${label} must be an object`);
  if (candidate.format !== GHOST_REPLAY_CONTEXT_FORMAT) throw new TypeError(`${label}.format is unsupported`);
  if (candidate.schemaVersion !== GHOST_REPLAY_CONTEXT_SCHEMA_VERSION) throw new TypeError(`${label}.schemaVersion is unsupported`);
  const run = record(candidate.run);
  const simulation = record(candidate.simulation);
  if (run === undefined || simulation === undefined) throw new TypeError(`${label} requires run and simulation metadata`);
  if (simulation.ticksPerSecond !== 120) throw new TypeError(`${label}.simulation.ticksPerSecond must be 120`);
  if (simulation.initialState !== "seeded-run-start") throw new TypeError(`${label}.simulation.initialState is unsupported`);
  return Object.freeze({
    format: GHOST_REPLAY_CONTEXT_FORMAT,
    schemaVersion: GHOST_REPLAY_CONTEXT_SCHEMA_VERSION,
    run: Object.freeze({
      id: nonEmptyString(run.id, `${label}.run.id`),
      seed: finiteString(run.seed as string | number, `${label}.run.seed`),
      mode: nonEmptyString(run.mode, `${label}.run.mode`),
      difficulty: nonEmptyString(run.difficulty, `${label}.run.difficulty`),
      weaponId: nonEmptyString(run.weaponId, `${label}.run.weaponId`),
    }),
    simulation: Object.freeze({ ticksPerSecond: 120, initialState: "seeded-run-start" }),
    build: fingerprint(candidate.build, `${label}.build`),
    rng: normalizeRng(candidate.rng, `${label}.rng`),
  });
}

/** Creates the immutable bootstrap contract required before a V3 capsule may enter replay admission. */
export function createGhostReplayRunContext(input: GhostReplayRunContextInput): GhostReplayRunContextV1 {
  return normalizeContext({
    format: GHOST_REPLAY_CONTEXT_FORMAT,
    schemaVersion: GHOST_REPLAY_CONTEXT_SCHEMA_VERSION,
    run: { id: input.runId, seed: input.seed, mode: input.mode, difficulty: input.difficulty, weaponId: input.weaponId },
    simulation: { ticksPerSecond: input.ticksPerSecond, initialState: "seeded-run-start" },
    build: input.build,
    rng: input.rng,
  }, "replay context");
}

/** Returns no context for legacy/malformed provenance; callers must fail closed instead of guessing. */
export function readGhostReplayRunContext(provenance: unknown): GhostReplayRunContextV1 | undefined {
  const source = record(provenance);
  if (source === undefined) return undefined;
  try { return normalizeContext(source[GHOST_REPLAY_CONTEXT_PROVENANCE_KEY], "provenance.replayContext"); }
  catch { return undefined; }
}

/** Stable comparison key for context copies held in the manifest and sealed bootstrap event. */
export function ghostReplayContextFingerprint(context: GhostReplayRunContextV1): string {
  return stableVerificationHash(normalizeContext(context, "ghost replay context fingerprint"));
}

function fingerprintsMatch(left: GhostReplayBuildFingerprint, right: GhostReplayBuildFingerprint): boolean {
  return left.version === right.version && left.revision === right.revision && left.target === right.target
    && left.rulesetVersion === right.rulesetVersion && left.contentHash === right.contentHash
    && left.configHash === right.configHash;
}

/** Registry is intentionally metadata-only until C27A supplies a detached real-world factory. */
export class GhostReplayRuntimeRegistry {
  readonly #descriptors = new Map<string, GhostReplayRuntimeDescriptor>();

  register(descriptor: GhostReplayRuntimeDescriptor): void {
    if (this.#descriptors.has(descriptor.id)) throw new RangeError(`duplicate Ghost replay runtime: ${descriptor.id}`);
    if (descriptor.ticksPerSecond !== 120) throw new TypeError("Ghost replay runtime must use the 120 Hz Tear simulation clock");
    this.#descriptors.set(descriptor.id, Object.freeze({ ...descriptor, build: fingerprint(descriptor.build, "runtime.build") }));
  }

  resolve(context: GhostReplayRunContextV1): GhostReplayRuntimeDescriptor | undefined {
    return [...this.#descriptors.values()].find((descriptor) => descriptor.ticksPerSecond === context.simulation.ticksPerSecond
      && fingerprintsMatch(descriptor.build, context.build));
  }
}

function replayableManifest(manifest: TearGhostManifest): string | undefined {
  if (manifest.status !== "complete") return `capsule status ${manifest.status} is not eligible for deterministic replay`;
  if (ghostRootIntegrity(manifest.chunks) !== manifest.rootIntegrity) return "capsule manifest root integrity does not match its chunk index";
  return undefined;
}

function causalEvent(value: unknown): TearCausalEventV1 | undefined {
  const contract = validateTearContract(value);
  return contract.ok && contract.value.kind === "event" ? contract.value : undefined;
}

function recordedSnapshot(value: unknown): TearSnapshotV1 | undefined {
  const contract = validateTearContract(value);
  return contract.ok && contract.value.kind === "snapshot" && contract.value.stateClass === "recorded-canonical"
    ? contract.value
    : undefined;
}

function staticBuildMatches(left: GhostReplayBuildFingerprint, right: GhostReplayBuildFingerprint): boolean {
  return left.version === right.version && left.revision === right.revision && left.target === right.target
    && left.rulesetVersion === right.rulesetVersion && left.contentHash === right.contentHash;
}

/**
 * Validates the integrity chain specific to native V3 live captures. The
 * manifest copy is convenient metadata; the cited tick-zero bootstrap event
 * and state anchor are chunk-integrity covered. This establishes linkage only,
 * never replay truth or authenticity.
 */
export function assessGhostReplayBootstrap(capsule: GhostReadCapsule, context: GhostReplayRunContextV1): string | undefined {
  const expectedId = ghostLiveBootstrapEventId(capsule.manifest.id);
  const bootstrapEntries = capsule.tracks.events.filter((entry) => {
    const raw = record(entry.value);
    return raw?.id === expectedId;
  });
  if (bootstrapEntries.length !== 1) {
    return `capsule requires exactly one integrity-protected bootstrap event ${expectedId}`;
  }
  const bootstrapEntry = bootstrapEntries[0];
  if (bootstrapEntry === undefined) return "capsule bootstrap event is missing";
  const bootstrap = causalEvent(bootstrapEntry.value);
  const payload = bootstrap === undefined ? undefined : record(bootstrap.payload);
  if (bootstrap === undefined || bootstrapEntry.tick !== 0 || bootstrap.tick !== 0
    || bootstrap.type !== "system.checkpoint" || bootstrap.phase !== "pre-simulation"
    || bootstrap.source !== "engine" || payload?.boundary !== "v3-sidecar-opened") {
    return "capsule bootstrap event is malformed or not a tick-zero V3 opening boundary";
  }
  const eventContext = readGhostReplayRunContext(payload.provenance);
  if (eventContext === undefined || ghostReplayContextFingerprint(eventContext) !== ghostReplayContextFingerprint(context)) {
    return "capsule bootstrap event context does not match manifest replay context";
  }

  const snapshots = capsule.tracks.keyframes.flatMap((entry) => {
    const snapshot = recordedSnapshot(entry.value);
    return snapshot?.tick !== entry.tick ? [] : [snapshot];
  });
  const bootstrapSnapshots = snapshots.filter((snapshot) => snapshot.tick === 0);
  if (bootstrapSnapshots.length !== 1) {
    return "capsule requires exactly one recorded-canonical tick-zero State Forge snapshot";
  }
  for (const snapshot of snapshots) {
    if (snapshot.provenance.sourceId !== expectedId) {
      return `recorded State Forge snapshot ${snapshot.id} does not cite the V3 bootstrap event`;
    }
    if (!staticBuildMatches(snapshot.provenance.build, context.build)) {
      return `recorded State Forge snapshot ${snapshot.id} has a different static build identity`;
    }
    if (snapshot.provenance.build.configHash !== stableVerificationHash(snapshot.state["tear.configuration.v1"])) {
      return `recorded State Forge snapshot ${snapshot.id} configuration hash does not match its payload`;
    }
  }
  const bootstrapSnapshot = bootstrapSnapshots[0];
  if (bootstrapSnapshot === undefined) return "capsule bootstrap snapshot is missing";
  if (!fingerprintsMatch(bootstrapSnapshot.provenance.build, context.build)
    || bootstrapSnapshot.seed !== context.run.seed) {
    return "tick-zero State Forge snapshot does not match replay bootstrap build or seed";
  }
  try {
    const snapshotRng = normalizeRng(bootstrapSnapshot.state["tear.rng.v1"], "tick-zero snapshot RNG");
    if (stableVerificationHash(snapshotRng) !== stableVerificationHash(context.rng)) {
      return "tick-zero State Forge snapshot RNG does not match replay bootstrap context";
    }
  } catch {
    return "tick-zero State Forge snapshot RNG is invalid";
  }
  return undefined;
}

/**
 * Admission only proves that a durable capsule describes a compatible runtime.
 * It never marks truth tracks verified; execution and hash comparison remain
 * C27A/C29 work performed by the future detached replay-world factory.
 */
export function assessGhostReplayAdmission(
  capsule: GhostReadCapsule,
  registry = new GhostReplayRuntimeRegistry(),
): GhostReplayAdmission {
  const manifestIssue = replayableManifest(capsule.manifest);
  if (manifestIssue !== undefined) return Object.freeze({ status: "rejected", reason: manifestIssue });
  const context = readGhostReplayRunContext(capsule.manifest.provenance);
  if (context === undefined) return Object.freeze({ status: "rejected", reason: "capsule lacks a valid immutable replay bootstrap context" });
  const bootstrapIssue = assessGhostReplayBootstrap(capsule, context);
  if (bootstrapIssue !== undefined) return Object.freeze({ status: "rejected", reason: bootstrapIssue });
  const runtime = registry.resolve(context);
  if (runtime === undefined) {
    return Object.freeze({ status: "unavailable", context,
      reason: "no compatible detached replay runtime is registered for this capsule fingerprint" });
  }
  return Object.freeze({ status: "compatible", context, runtimeId: runtime.id,
    reason: "a compatible runtime is registered; replay execution and truth verification are still required" });
}

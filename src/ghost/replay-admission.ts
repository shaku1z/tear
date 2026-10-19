import { ghostRootIntegrity, type TearGhostManifest } from "./capsule-vault";
import type { GhostReadCapsule } from "./capsule-reader";
import { ghostLiveBootstrapEventId } from "./live-causal-events";
import { stableVerificationHash } from "../replay/hash";
import type { TearCausalEventV1, TearSnapshotV1 } from "../tearbench/contracts";
import { validateTearContract } from "../tearbench/validation";
import { mapGhostCapsuleToReplayEnvelope, preflightGhostRecordedCanonicalSnapshot } from "./capsule-replay-envelope";
import { readGhostAuthoritativeReceipt } from "./authoritative-receipt";
import type { AuthoritativeInputSnapshot } from "../gameplay/runtime/authoritative-input";
import { LEGACY_APP_SCREENS, LEGAL_LEGACY_TRANSITIONS, type LegacyAppScreen } from "../app/legacy-state-controller";

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

export interface GhostRecordedOpeningV1 {
  readonly version: 1;
  readonly phase: "opening-initialized-before-run-start";
  readonly previousScreen: string;
  readonly destination: "playing";
  readonly runId: string;
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
    initialState: "seeded-run-start" | "opening-initialized";
    readonly opening?: GhostRecordedOpeningV1;
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
  /** Defaults to the current live durable-capture boundary. */
  readonly initialState?: GhostReplayRunContextV1["simulation"]["initialState"];
  readonly opening?: GhostRecordedOpeningV1;
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
  if (simulation.initialState !== "seeded-run-start" && simulation.initialState !== "opening-initialized") {
    throw new TypeError(`${label}.simulation.initialState is unsupported`);
  }
  const openingDescriptor = Object.getOwnPropertyDescriptor(simulation, "opening");
  if (openingDescriptor !== undefined && !("value" in openingDescriptor)) throw new TypeError("recorded opening must be data");
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
    simulation: Object.freeze({ ticksPerSecond: 120, initialState: simulation.initialState,
      ...(openingDescriptor?.value === undefined ? {} : { opening: normalizeOpening(openingDescriptor.value, run.id) }) }),
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
    simulation: { ticksPerSecond: input.ticksPerSecond, initialState: input.initialState ?? "opening-initialized",
      ...(input.opening === undefined ? {} : { opening: input.opening }) },
    build: input.build,
    rng: input.rng,
  }, "replay context");
}

function openingPredecessor(value: unknown): LegacyAppScreen {
  const screen = LEGACY_APP_SCREENS.find((candidate) => candidate === value);
  // APP.transition returns early for self-playing; other predecessors require
  // its canonical playing edge. Completion evidence still attests actual exposure.
  if (screen === undefined || (screen !== "playing" && !LEGAL_LEGACY_TRANSITIONS[screen].includes("playing"))) {
    throw new TypeError("recorded opening predecessor is unknown or has no legal playing transition");
  }
  return screen;
}

function normalizeOpening(value: unknown, runId: unknown): GhostRecordedOpeningV1 {
  const candidate = record(value);
  if (candidate === undefined || Object.getPrototypeOf(candidate) !== Object.prototype
    || Reflect.ownKeys(candidate).length !== 5
    || Reflect.ownKeys(candidate).some((key) => typeof key !== "string" || !["version", "phase", "previousScreen", "destination", "runId"].includes(key)
      || !("value" in (Object.getOwnPropertyDescriptor(candidate, key) ?? {})))) {
    throw new TypeError("recorded opening must be a plain data descriptor");
  }
  if (candidate.version !== 1 || candidate.phase !== "opening-initialized-before-run-start"
    || candidate.destination !== "playing" || candidate.runId !== runId
    || typeof candidate.previousScreen !== "string" || candidate.previousScreen.length === 0 || candidate.previousScreen.length > 64) {
    throw new TypeError("recorded opening descriptor is invalid or unsupported");
  }
  return Object.freeze({ version: 1, phase: candidate.phase, previousScreen: openingPredecessor(candidate.previousScreen),
    destination: "playing", runId: nonEmptyString(runId, "opening.runId") });
}

declare const openingPermitBrand: unique symbol;
/** Opaque linkage capability; it establishes neither authenticity nor replay truth. */
export interface GhostRecordedOpeningPermit { readonly [openingPermitBrand]: true }
export interface GhostRecordedOpeningEvidence {
  readonly kind: "explicit" | "legacy-inferred";
  readonly previousScreen: string;
  readonly started: TearCausalEventV1;
  readonly input: AuthoritativeInputSnapshot;
}
const openingPermits = new WeakMap<GhostRecordedOpeningPermit, Readonly<{ snapshotHash: string; rootIntegrity: string; contextFingerprint: string; evidence: GhostRecordedOpeningEvidence }>>();

/** Requires complete, reader-verified capsule linkage before allowing the exceptional opening UI. */
export function issueGhostRecordedOpeningPermit(capsule: GhostReadCapsule): GhostRecordedOpeningPermit | undefined {
  const mapping = mapGhostCapsuleToReplayEnvelope(capsule);
  if (mapping.issues.length > 0) throw new TypeError(`capsule replay mapping is invalid: ${mapping.issues.map((issue) => `${issue.track}@${String(issue.tick)}: ${issue.reason}`).join("; ")}`);
  const anchors = capsule.tracks.keyframes.flatMap((entry) => {
    const snapshot = recordedSnapshot(entry.value); return snapshot?.tick === 0 && entry.tick === 0 ? [snapshot] : [];
  });
  const anchor = anchors[0], ui = record(anchor?.state["tear.ui.v1"]);
  const context = readGhostReplayRunContext(capsule.manifest.provenance);
  const rawSimulation = record(record(record(capsule.manifest.provenance)?.[GHOST_REPLAY_CONTEXT_PROVENANCE_KEY])?.simulation);
  if (context === undefined && rawSimulation !== undefined && Object.hasOwn(rawSimulation, "opening")) throw new TypeError("supplied recorded opening descriptor is malformed or unsupported");
  if (context?.simulation.opening === undefined && (ui === undefined || ["playing", "paused", "draft", "reserve", "tierup"].includes(String(ui.screen)))) return undefined;
  const issue = replayableManifest(capsule.manifest) ?? (context === undefined ? "opening lacks replay context" : assessGhostReplayBootstrap(capsule, context));
  if (issue !== undefined || context === undefined || anchor === undefined || anchors.length !== 1) throw new TypeError(issue ?? "opening anchor is not unique");
  const preflight = preflightGhostRecordedCanonicalSnapshot(anchor);
  if (!preflight.ok) throw new TypeError(`opening anchor ${preflight.reason}`);
  const receipts = capsule.tracks.results.flatMap((entry) => { const receipt = readGhostAuthoritativeReceipt(entry.value); return entry.tick === 0 && receipt?.tick === 0 ? [receipt] : []; });
  if (receipts.length !== 1 || receipts[0] === undefined) throw new TypeError("opening requires one original tick-zero held-input receipt");
  const run = record(anchor.state["tear.run.v1"]), world = record(anchor.state["tear.world.v1"]), runtime = record(world?.runtime), lifecycle = record(runtime?.lifecycle);
  const opening = context.simulation.opening;
  if (context.simulation.initialState !== "opening-initialized" || run?.tick !== 0 || run.runTime !== 0
    || String(run.runSeed) !== context.run.seed || run.mode !== context.run.mode || run.diff !== context.run.difficulty || run.weaponId !== context.run.weaponId
    || lifecycle?.sessionId !== context.run.id || lifecycle.outcome !== null
    || (world?.simulationSeconds !== undefined && world.simulationSeconds !== 0)
    || typeof ui?.screen !== "string" || (opening !== undefined && opening.previousScreen !== ui.screen)
    || !["endless", "campaign"].includes(context.run.mode)) throw new TypeError("opening run/UI/session facts do not match capsule context");
  openingPredecessor(ui.screen);
  const starts = capsule.tracks.events.flatMap((entry) => { const event = causalEvent(entry.value); return event?.type === "run.started" ? [{ entry, event }] : []; });
  const bootstrapId = ghostLiveBootstrapEventId(capsule.manifest.id);
  const bootstrap = capsule.tracks.events.map((entry) => causalEvent(entry.value)).find((event) => event?.id === bootstrapId);
  const start = starts[0], payload = record(start?.event.payload);
  if (starts.length !== 1 || start?.entry.tick !== 0 || start.event.tick !== 0 || start.event.source !== "engine"
    || start.event.phase !== "pre-simulation" || bootstrap?.sequence !== 0 || start.event.sequence <= bootstrap.sequence || payload?.runId !== context.run.id
    || payload.mode !== run.mode || payload.difficulty !== run.diff || payload.weapon !== run.weaponId
    // The current native publisher receives the original new RunSession (wave0);
    // installed opening content has advanced its separate live run to wave1.
    || payload.wave !== 0 || run.wave !== 1 || payload.score !== run.score || payload.runTimeSeconds !== 0) {
    throw new TypeError("opening requires one matching native tick-zero run.started fact");
  }
  const completions = capsule.tracks.events.flatMap((entry) => {
    const event = causalEvent(entry.value);
    return record(event?.payload)?.boundary === "recorded-opening-playing-exposed" ? [{ entry, event }] : [];
  });
  const completion = completions[0];
  if (opening !== undefined || completions.length > 0) {
    if (completions.length !== 1 || completion?.entry.tick !== 0 || completion.event?.tick !== 0
      || completion.event.type !== "system.checkpoint" || completion.event.source !== "engine" || completion.event.phase !== "pre-simulation"
      || completion.event.sequence <= start.event.sequence || completion.event.payload.runId !== context.run.id || completion.event.payload.screen !== "playing") {
      throw new TypeError("opening lacks its matching post-transition playing completion fact");
    }
  } else {
    // Old producers did not seal completion. A later canonical playing anchor and
    // its aligned held-input receipt are necessary inference, never an invented fact.
    const laterPlaying = capsule.tracks.keyframes.some((entry) => {
      const later = recordedSnapshot(entry.value), laterRun = record(later?.state["tear.run.v1"]), laterWorld = record(later?.state["tear.world.v1"]);
      const laterLifecycle = record(record(laterWorld?.runtime)?.lifecycle);
      if (later === undefined) return false;
      return entry.tick === later.tick && later.tick > 0 && record(later.state["tear.ui.v1"])?.screen === "playing"
        && laterRun?.mode === context.run.mode && String(laterRun.runSeed) === context.run.seed && Number(laterRun.runTime) > 0
        && laterLifecycle?.sessionId === context.run.id && preflightGhostRecordedCanonicalSnapshot(later).ok
        && capsule.tracks.results.some((result) => { const receipt = readGhostAuthoritativeReceipt(result.value); return receipt?.tick === later.tick && result.tick === later.tick; });
    });
    if (!laterPlaying) throw new TypeError("legacy opening completion is unavailable without a later canonical playing receipt");
  }
  // A later terminal fact at the same scheduler tick does not erase the earlier
  // anchor. It must follow a sealed playing completion, not legacy inference.
  const terminals = capsule.tracks.events.flatMap((entry) => {
    const event = causalEvent(entry.value);
    return event?.tick === 0 && ["run.completed", "run.defeated", "run.abandoned"].includes(event.type) ? [{ entry, event }] : [];
  });
  const terminal = terminals[0], terminalPayload = record(terminal?.event.payload);
  if (terminals.length > 0 && (terminals.length !== 1 || completion?.event === undefined
    || terminal?.entry.tick !== 0 || terminal.event.source !== "engine" || terminal.event.phase !== "post-simulation-commit"
    || terminal.event.sequence <= completion.event.sequence || terminalPayload?.runId !== context.run.id
    || terminalPayload.mode !== run.mode || terminalPayload.difficulty !== run.diff || terminalPayload.weapon !== run.weaponId)) {
    throw new TypeError("tick-zero terminal must match the run and follow its sealed playing completion");
  }
  const permit = Object.freeze({}) as GhostRecordedOpeningPermit;
  openingPermits.set(permit, Object.freeze({ snapshotHash: stableVerificationHash(anchor), rootIntegrity: capsule.manifest.rootIntegrity,
    contextFingerprint: ghostReplayContextFingerprint(context), evidence: Object.freeze({
    kind: opening === undefined ? "legacy-inferred" : "explicit", previousScreen: ui.screen, started: structuredClone(start.event), input: receipts[0].input,
  }) }));
  return permit;
}

/** Revalidate the exact anchor at the destination boundary; structural/copy tokens do not authorize anything. */
export function readGhostRecordedOpeningPermit(permit: GhostRecordedOpeningPermit, snapshot: TearSnapshotV1): GhostRecordedOpeningEvidence {
  const entry = openingPermits.get(permit);
  if (entry?.snapshotHash !== stableVerificationHash(snapshot)) throw new TypeError("recorded opening permit is invalid or belongs to another anchor");
  return structuredClone(entry.evidence);
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
    || bootstrap.type !== "system.checkpoint" || bootstrap.phase !== "pre-simulation" || bootstrap.sequence !== 0
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

import { stableVerificationHash } from "../replay/hash";
import type { TearFailureArtifactV1 } from "./contracts";
import type { TearBenchReplayContextV1, TearBenchRunArtifactV1 } from "./artifact";
import { investigateRegressionRuns, type TearOwnershipRoute } from "./regression-intelligence";
import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";

export const TEAR_GRAVEYARD_FORMAT = "tearbench-graveyard-registry" as const;
export const TEAR_GRAVEYARD_SCHEMA_VERSION = 1 as const;

export type TearGraveyardArtifactRole = "original" | "minimal-child" | "minimal-replay" | "fix-base" | "fix-candidate";
export type TearGraveyardArtifactStatus = "failed" | "passed" | "truncated";

/** A content-addressed pointer to evidence retained outside the registry JSON. */
export interface TearGraveyardArtifactReferenceV1 {
  readonly path: string;
  readonly id: string;
  readonly contentHash: string;
  readonly kind: "tearbench-run" | "tear-failure";
  readonly status: TearGraveyardArtifactStatus;
  readonly scenarioId: string;
  readonly scenarioVersion: number;
  readonly seed: string;
  readonly invariantId?: string;
}

export interface TearGraveyardFixedPairV1 {
  readonly base: TearGraveyardArtifactReferenceV1;
  readonly candidate: TearGraveyardArtifactReferenceV1;
}

export interface TearGraveyardFixV1 {
  readonly commit: string;
  /** Equivalent base/fixed pair; neither legitimate replay has to terminate. */
  readonly verification: TearGraveyardFixedPairV1;
  readonly recordedAt: string;
}

/**
 * The branch-side materialized run which produced the compact minimal failure.
 * It remains a normal run (often truncated) because a branch divergence need
 * not manifest as the candidate runtime's own invariant failure.
 */
export interface TearGraveyardReplayV1 {
  readonly side: "base" | "candidate";
  readonly artifact: TearGraveyardArtifactReferenceV1;
}

export interface TearGraveyardReopenV1 {
  readonly at: string;
  readonly reason: string;
}

/**
 * A closed regression's durable identity. Entries are replaced, never edited:
 * reopening creates a new registry value carrying the old history forward.
 */
export interface TearGraveyardEntryV1 {
  readonly id: string;
  readonly signature: string;
  readonly original: TearGraveyardArtifactReferenceV1;
  readonly minimalChild: TearGraveyardArtifactReferenceV1;
  readonly minimalReplay: TearGraveyardReplayV1;
  readonly invariantId: string;
  /**
   * Diff-routing selectors from evidence-routes.json.  They are intentionally
   * persisted with the case instead of inferred from a mutable ownership hint:
   * a future CI selection must be able to find the exact historical replay.
   */
  readonly selectors: readonly string[];
  readonly ownership: TearOwnershipRoute;
  readonly fix: TearGraveyardFixV1;
  readonly reopenHistory: readonly TearGraveyardReopenV1[];
  readonly status: "closed" | "reopened";
  readonly evidenceHash: string;
}

export interface TearGraveyardRegistryV1 {
  readonly format: typeof TEAR_GRAVEYARD_FORMAT;
  readonly schemaVersion: typeof TEAR_GRAVEYARD_SCHEMA_VERSION;
  readonly entries: readonly TearGraveyardEntryV1[];
  readonly registryHash: string;
}

export type TearGraveyardEvidenceArtifact = TearBenchRunArtifactV1 | TearFailureArtifactV1;
export type TearGraveyardArtifactStore = Readonly<Record<string, TearGraveyardEvidenceArtifact>>;
type TearGraveyardEntryFields = Omit<TearGraveyardEntryV1, "evidenceHash">;

export interface TearGraveyardReplayRequestV1 {
  readonly entryId: string;
  readonly scenarioId: string;
  readonly scenarioVersion: number;
  readonly seed: string;
  readonly maxTicks: number;
  readonly actions: readonly CommandEnvelope<GameAction>[];
  readonly invariantId: string;
  readonly replayContext?: TearBenchReplayContextV1;
}

function nonBlank(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`graveyard ${label} must be a non-empty string`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new TypeError(`graveyard ${label} must be a positive integer`);
  return value as number;
}

function timestamp(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) throw new TypeError(`graveyard ${label} must be an ISO timestamp`);
}

function freezeReference(value: TearGraveyardArtifactReferenceV1): TearGraveyardArtifactReferenceV1 {
  return Object.freeze({ ...value });
}

function freezeEntry(entry: TearGraveyardEntryFields): TearGraveyardEntryV1 {
  const data = {
    ...entry,
    original: freezeReference(entry.original),
    minimalChild: freezeReference(entry.minimalChild),
    minimalReplay: Object.freeze({ side: entry.minimalReplay.side, artifact: freezeReference(entry.minimalReplay.artifact) }),
    selectors: Object.freeze([...entry.selectors]),
    ownership: Object.freeze({ owner: entry.ownership.owner, hints: Object.freeze([...entry.ownership.hints]) }),
    fix: Object.freeze({ ...entry.fix, verification: Object.freeze({
      base: freezeReference(entry.fix.verification.base),
      candidate: freezeReference(entry.fix.verification.candidate),
    }) }),
    reopenHistory: Object.freeze(entry.reopenHistory.map((item) => Object.freeze({ ...item }))),
  };
  return Object.freeze({ ...data, evidenceHash: stableVerificationHash(data) });
}

function evidenceFields(artifact: TearGraveyardEvidenceArtifact): Omit<TearGraveyardArtifactReferenceV1, "path" | "contentHash"> {
  if (artifact.format === "tearbench-run") {
    const firstFailure = artifact.failures[0];
    return {
      id: artifact.id,
      kind: "tearbench-run",
      status: artifact.status,
      scenarioId: artifact.resolvedScenario.id,
      scenarioVersion: artifact.resolvedScenario.version,
      seed: artifact.seed,
      ...(firstFailure === undefined ? {} : { invariantId: firstFailure.id }),
    };
  }
  return {
    id: artifact.id,
    kind: "tear-failure",
    status: "failed",
    scenarioId: artifact.scenarioId,
    scenarioVersion: artifact.scenarioVersion,
    seed: artifact.seed,
    invariantId: artifact.invariantId,
  };
}

/** Create a content-addressed reference from a fully parsed persistent artifact. */
export function createGraveyardArtifactReference(
  artifact: TearGraveyardEvidenceArtifact,
  path: string,
): TearGraveyardArtifactReferenceV1 {
  return Object.freeze({
    path: nonBlank(path, "artifact reference path"),
    ...evidenceFields(artifact),
    contentHash: stableVerificationHash(artifact),
  });
}

function validateReference(reference: TearGraveyardArtifactReferenceV1, role: TearGraveyardArtifactRole): void {
  const unchecked = reference as Readonly<{ kind: unknown; status: unknown }>;
  nonBlank(reference.path, `${role} path`);
  nonBlank(reference.id, `${role} id`);
  nonBlank(reference.contentHash, `${role} content hash`);
  if (unchecked.kind !== "tearbench-run" && unchecked.kind !== "tear-failure") throw new TypeError(`graveyard ${role} has an unsupported artifact kind`);
  if (unchecked.status !== "failed" && unchecked.status !== "passed" && unchecked.status !== "truncated") throw new TypeError(`graveyard ${role} has an unsupported artifact status`);
  nonBlank(reference.scenarioId, `${role} scenario id`);
  positiveInteger(reference.scenarioVersion, `${role} scenario version`);
  nonBlank(reference.seed, `${role} seed`);
  if (reference.invariantId !== undefined) nonBlank(reference.invariantId, `${role} invariant id`);
}

function validateEntryShape(entry: TearGraveyardEntryV1): void {
  if (!/^[a-z0-9][a-z0-9-]{1,95}$/u.test(entry.id)) throw new TypeError("graveyard entry id must be a lowercase stable slug");
  nonBlank(entry.signature, "entry signature");
  nonBlank(entry.invariantId, "entry invariant id");
  if (entry.selectors.length === 0 || entry.selectors.some((selector) => selector.trim() === "")) {
    throw new TypeError("graveyard entry requires at least one stable evidence selector");
  }
  validateReference(entry.original, "original");
  validateReference(entry.minimalChild, "minimal-child");
  validateReference(entry.minimalReplay.artifact, "minimal-replay");
  validateReference(entry.fix.verification.base, "fix-base");
  validateReference(entry.fix.verification.candidate, "fix-candidate");
  if (entry.original.status !== "failed" || entry.minimalChild.status !== "failed") throw new TypeError("graveyard original and minimal child must retain failed evidence");
  if (entry.fix.verification.base.kind !== "tearbench-run" || entry.fix.verification.candidate.kind !== "tearbench-run"
    || entry.fix.verification.base.status === "failed" || entry.fix.verification.candidate.status === "failed") {
    throw new TypeError("graveyard fix verification must retain an equivalent non-failed materialized run pair");
  }
  if (entry.original.path === entry.minimalChild.path || entry.original.contentHash === entry.minimalChild.contentHash) throw new TypeError("graveyard minimal child must be distinct from the original evidence");
  for (const reference of [entry.minimalChild, entry.fix.verification.base, entry.fix.verification.candidate]) {
    if (reference.scenarioId !== entry.original.scenarioId || reference.scenarioVersion !== entry.original.scenarioVersion || reference.seed !== entry.original.seed) {
      throw new TypeError("graveyard evidence references must share scenario coordinates and seed");
    }
  }
  if (entry.minimalReplay.artifact.kind !== "tearbench-run") throw new TypeError("graveyard minimal replay must retain a materialized tearbench-run");
  if (entry.minimalReplay.artifact.scenarioId !== entry.minimalChild.scenarioId
    || entry.minimalReplay.artifact.scenarioVersion !== entry.minimalChild.scenarioVersion
    || entry.minimalReplay.artifact.seed !== entry.minimalChild.seed) {
    throw new TypeError("graveyard minimal replay must share minimized failure coordinates");
  }
  if (entry.original.invariantId !== entry.invariantId || entry.minimalChild.invariantId !== entry.invariantId) {
    throw new TypeError("graveyard original and minimal child must retain the recorded invariant");
  }
  if (!/^[0-9a-f]{7,64}$/iu.test(entry.fix.commit)) throw new TypeError("graveyard fix commit must be a Git revision");
  timestamp(entry.fix.recordedAt, "fix recordedAt");
  nonBlank(entry.ownership.owner, "ownership owner");
  if (entry.ownership.hints.length === 0 || entry.ownership.hints.some((hint) => hint.trim() === "")) throw new TypeError("graveyard ownership requires at least one hint");
  for (const item of entry.reopenHistory) {
    timestamp(item.at, "reopen timestamp");
    nonBlank(item.reason, "reopen reason");
  }
  const expectedStatus = entry.reopenHistory.length === 0 ? "closed" : "reopened";
  if (entry.status !== expectedStatus) throw new TypeError("graveyard status must match reopen history");
  const { evidenceHash: _evidenceHash, ...data } = entry;
  void _evidenceHash;
  if (entry.evidenceHash !== stableVerificationHash(data)) throw new TypeError("graveyard entry evidence hash does not match retained fields");
}

function rerunnableMinimalArtifact(
  entry: TearGraveyardEntryV1,
  artifact: TearGraveyardEvidenceArtifact | undefined,
): TearBenchRunArtifactV1 {
  if (artifact === undefined) throw new TypeError(`graveyard artifact is missing: ${entry.minimalReplay.artifact.path}`);
  if (artifact.format !== "tearbench-run") {
    throw new TypeError("graveyard minimal replay must be a materialized tearbench-run so a clean process can replay it");
  }
  if (artifact.resolvedScenario.id !== entry.minimalChild.scenarioId
    || artifact.resolvedScenario.version !== entry.minimalChild.scenarioVersion
    || artifact.resolvedScenario.seed !== entry.minimalChild.seed
    || artifact.seed !== entry.minimalChild.seed) {
    throw new TypeError("graveyard minimal child replay coordinates do not match retained evidence");
  }
  if (artifact.actions.some((action) => action.tick > artifact.resolvedScenario.maxTicks)) {
    throw new TypeError("graveyard minimal child contains an action beyond its fixed replay horizon");
  }
  return artifact;
}

/** Validate structural integrity and, when supplied, the pinned artifact bytes. */
export function validateGraveyardRegistry(
  registry: TearGraveyardRegistryV1,
  artifacts?: TearGraveyardArtifactStore,
): TearGraveyardRegistryV1 {
  const unchecked = registry as Readonly<{ format: unknown; schemaVersion: unknown }>;
  if (unchecked.format !== TEAR_GRAVEYARD_FORMAT || unchecked.schemaVersion !== TEAR_GRAVEYARD_SCHEMA_VERSION) throw new TypeError("unsupported graveyard registry format");
  const ids = new Set<string>();
  for (const entry of registry.entries) {
    validateEntryShape(entry);
    if (ids.has(entry.id)) throw new TypeError(`graveyard registry has duplicate entry: ${entry.id}`);
    ids.add(entry.id);
    if (artifacts !== undefined) {
      for (const reference of [entry.original, entry.minimalChild, entry.fix.verification.base, entry.fix.verification.candidate]) {
        const artifact = artifacts[reference.path];
        if (artifact === undefined) throw new TypeError(`graveyard artifact is missing: ${reference.path}`);
        const actual = createGraveyardArtifactReference(artifact, reference.path);
        if (stableVerificationHash(actual) !== stableVerificationHash(reference)) throw new TypeError(`graveyard artifact reference does not match: ${reference.path}`);
      }
      // A registry is only CI-runnable if the minimized evidence contains its
      // complete semantic replay.  Original failure evidence may remain a
      // compact failure contract, but the minimized child cannot.
      const replayArtifact = artifacts[entry.minimalReplay.artifact.path];
      if (replayArtifact === undefined) throw new TypeError(`graveyard artifact is missing: ${entry.minimalReplay.artifact.path}`);
      const actualReplay = createGraveyardArtifactReference(replayArtifact, entry.minimalReplay.artifact.path);
      if (stableVerificationHash(actualReplay) !== stableVerificationHash(entry.minimalReplay.artifact)) {
        throw new TypeError(`graveyard artifact reference does not match: ${entry.minimalReplay.artifact.path}`);
      }
      const minimalFailure = artifacts[entry.minimalChild.path];
      if (minimalFailure?.format !== "tear-contract") {
        throw new TypeError("graveyard minimal child must retain a typed tear-failure artifact");
      }
      const replay = rerunnableMinimalArtifact(entry, replayArtifact);
      if (stableVerificationHash(replay.actions) !== stableVerificationHash(minimalFailure.actions)
        || replay.resolvedScenario.maxTicks < minimalFailure.firstFailureTick) {
        throw new TypeError("graveyard minimal replay does not retain the minimized failure action trace and horizon");
      }
      const fixedBase = artifacts[entry.fix.verification.base.path];
      const fixedCandidate = artifacts[entry.fix.verification.candidate.path];
      if (fixedBase?.format !== "tearbench-run" || fixedCandidate?.format !== "tearbench-run") {
        throw new TypeError("graveyard fix verification must retain materialized runs");
      }
      if (fixedBase.status === "failed" || fixedCandidate.status === "failed"
        || stableVerificationHash(fixedBase.actions) !== stableVerificationHash(fixedCandidate.actions)
        || investigateRegressionRuns({ base: fixedBase, candidate: fixedCandidate, createdAt: entry.fix.recordedAt }).status !== "equivalent") {
        throw new TypeError("graveyard fix verification must retain an equivalent non-failed run pair");
      }
    }
  }
  const data = { format: registry.format, schemaVersion: registry.schemaVersion, entries: registry.entries };
  if (registry.registryHash !== stableVerificationHash(data)) throw new TypeError("graveyard registry hash does not match entries");
  return registry;
}

/**
 * Resolve the exact replay retained by a closed case.  This pure function is
 * used by the CLI after reading the registry and artifact bytes in a fresh
 * Node process, so CI never relies on an in-memory Ghost Graveyard object.
 */
export function createGraveyardReplayRequest(
  entry: TearGraveyardEntryV1,
  artifacts: TearGraveyardArtifactStore,
): TearGraveyardReplayRequestV1 {
  validateEntryShape(entry);
  const minimal = rerunnableMinimalArtifact(entry, artifacts[entry.minimalReplay.artifact.path]);
  return Object.freeze({
    entryId: entry.id,
    scenarioId: minimal.resolvedScenario.id,
    scenarioVersion: minimal.resolvedScenario.version,
    seed: minimal.seed,
    maxTicks: minimal.resolvedScenario.maxTicks,
    actions: Object.freeze([...minimal.actions]),
    invariantId: entry.invariantId,
    ...(minimal.replayContext === undefined ? {} : { replayContext: structuredClone(minimal.replayContext) }),
  });
}

/** Select closed entries by explicit evidence selectors; shared-runtime selects every closed retained case. */
export function selectGraveyardEntries(
  registry: TearGraveyardRegistryV1,
  selectors: readonly string[],
): readonly TearGraveyardEntryV1[] {
  validateGraveyardRegistry(registry);
  const requested = new Set(selectors);
  const allShared = requested.has("all-shared-runtime-history");
  return Object.freeze(registry.entries.filter((entry) => entry.status === "closed"
    && (allShared || requested.has(entry.id) || entry.selectors.some((selector) => requested.has(selector)))));
}

export function createGraveyardEntry(input: Omit<TearGraveyardEntryV1, "evidenceHash" | "status"> & { readonly status?: never }): TearGraveyardEntryV1 {
  const entry = freezeEntry({ ...input, status: input.reopenHistory.length === 0 ? "closed" : "reopened" });
  validateEntryShape(entry);
  return entry;
}

export function createGraveyardRegistry(entries: readonly TearGraveyardEntryV1[] = []): TearGraveyardRegistryV1 {
  const frozenEntries = Object.freeze(entries.map((entry) => {
    const { evidenceHash: _evidenceHash, ...fields } = entry;
    void _evidenceHash;
    return freezeEntry(fields);
  }));
  const data = { format: TEAR_GRAVEYARD_FORMAT, schemaVersion: TEAR_GRAVEYARD_SCHEMA_VERSION, entries: frozenEntries };
  const registry = Object.freeze({ ...data, registryHash: stableVerificationHash(data) });
  return validateGraveyardRegistry(registry);
}

export function buryGraveyardEntry(registry: TearGraveyardRegistryV1, entry: TearGraveyardEntryV1): TearGraveyardRegistryV1 {
  validateGraveyardRegistry(registry);
  if (registry.entries.some((item) => item.id === entry.id)) throw new TypeError(`graveyard entry already exists: ${entry.id}`);
  return createGraveyardRegistry([...registry.entries, entry]);
}

export function reopenGraveyardEntry(
  registry: TearGraveyardRegistryV1,
  id: string,
  reopen: TearGraveyardReopenV1,
): TearGraveyardRegistryV1 {
  validateGraveyardRegistry(registry);
  const found = registry.entries.find((entry) => entry.id === id);
  if (found === undefined) throw new RangeError(`graveyard entry does not exist: ${id}`);
  const next = createGraveyardEntry({
    id: found.id,
    signature: found.signature,
    original: found.original,
    minimalChild: found.minimalChild,
    minimalReplay: found.minimalReplay,
    invariantId: found.invariantId,
    selectors: found.selectors,
    ownership: found.ownership,
    fix: found.fix,
    reopenHistory: [...found.reopenHistory, reopen],
  });
  return createGraveyardRegistry(registry.entries.map((entry) => entry.id === id ? next : entry));
}

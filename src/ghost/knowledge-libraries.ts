import { stableVerificationHash } from "../replay/hash";
import type { GhostRangeV1, TearCausalEventV1, TearSnapshotV1, TearStateClass } from "../tearbench/contracts";
import type { TearSdlDocumentV1 } from "../tearbench/tearsdl";
import type { GhostEnvelopeV3 } from "./truth-kernel";
import { createGhostV3 } from "./truth-kernel";

export type GhostLibraryKind = "canon" | "graveyard" | "frontier" | "corpus";

export interface GhostLibraryEntry {
  readonly id: string;
  readonly library: GhostLibraryKind;
  readonly ghostId: string;
  readonly rootHash: string;
  readonly createdAt: string;
  readonly provenance: Readonly<Record<string, string>>;
}

export class GovernedGhostLibrary {
  readonly #kind: GhostLibraryKind;
  readonly #entries = new Map<string, GhostLibraryEntry>();

  constructor(kind: GhostLibraryKind) { this.#kind = kind; }
  get kind(): GhostLibraryKind { return this.#kind; }

  add(entry: GhostLibraryEntry): void {
    if (entry.library !== this.#kind) throw new TypeError(`cannot add ${entry.library} entry to ${this.#kind}`);
    if (this.#entries.has(entry.id)) throw new TypeError(`${this.#kind} entry already exists: ${entry.id}`);
    this.#entries.set(entry.id, Object.freeze(structuredClone(entry)));
  }

  get(id: string): GhostLibraryEntry {
    const entry = this.#entries.get(id);
    if (entry === undefined) throw new RangeError(`${this.#kind} entry does not exist: ${id}`);
    return entry;
  }

  list(): readonly GhostLibraryEntry[] {
    return Object.freeze([...this.#entries.values()].sort((left, right) => left.id.localeCompare(right.id)));
  }
}

export type GhostLineageRelation =
  | "migration" | "repair" | "clip" | "fork" | "challenge" | "correction"
  | "scenario" | "minimization" | "training" | "promotion";

export interface GhostLineageNode {
  readonly id: string;
  readonly rootHash: string;
  readonly kind: "ghost" | "scenario" | "capsule" | "model";
}

export interface GhostLineageEdge {
  readonly id: string;
  readonly parentId: string;
  readonly childId: string;
  readonly relation: GhostLineageRelation;
  readonly tick?: number;
  readonly createdAt: string;
}

export class GhostLineageGraph {
  readonly #nodes = new Map<string, GhostLineageNode>();
  readonly #edges = new Map<string, GhostLineageEdge>();

  addNode(node: GhostLineageNode): void {
    if (this.#nodes.has(node.id)) throw new TypeError(`lineage node already exists: ${node.id}`);
    this.#nodes.set(node.id, Object.freeze({ ...node }));
  }

  connect(edge: GhostLineageEdge): void {
    if (!this.#nodes.has(edge.parentId) || !this.#nodes.has(edge.childId)) {
      throw new RangeError("lineage edge endpoints must exist");
    }
    if (this.#edges.has(edge.id)) throw new TypeError(`lineage edge already exists: ${edge.id}`);
    this.#edges.set(edge.id, Object.freeze({ ...edge }));
  }

  parentsOf(id: string): readonly GhostLineageEdge[] {
    return Object.freeze([...this.#edges.values()].filter((edge) => edge.childId === id));
  }

  childrenOf(id: string): readonly GhostLineageEdge[] {
    return Object.freeze([...this.#edges.values()].filter((edge) => edge.parentId === id));
  }
}

const privateKeys = new Set([
  "playerName", "displayName", "email", "accountId", "userId", "ip", "deviceId", "authToken",
]);

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {};
}

function stringField(record: Readonly<Record<string, unknown>>, key: string, fallback: string): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function sanitizePrivateData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePrivateData);
  if (typeof value !== "object" || value === null) return value;
  return Object.freeze(Object.fromEntries(Object.entries(value)
    .filter(([key]) => !privateKeys.has(key))
    .map(([key, entry]) => [key, sanitizePrivateData(entry)])));
}

function ancestorsForRange(
  events: readonly TearCausalEventV1[],
  selected: readonly TearCausalEventV1[],
): readonly TearCausalEventV1[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  const included = new Map(selected.map((event) => [event.id, event]));
  const visit = (event: TearCausalEventV1): void => {
    for (const parentId of event.parentIds ?? []) {
      if (included.has(parentId)) continue;
      const parent = byId.get(parentId);
      if (parent === undefined) throw new TypeError(`causal history is missing parent ${parentId}`);
      included.set(parent.id, parent);
      visit(parent);
    }
  };
  for (const event of selected) visit(event);
  return Object.freeze([...included.values()].sort((left, right) => left.tick - right.tick || left.sequence - right.sequence));
}

export interface GhostScenarioBridgeResult {
  readonly document: TearSdlDocumentV1;
  readonly sourceGhostId: string;
  readonly sourceRootHash: string;
  readonly selectedEventIds: readonly string[];
  readonly requiredHistoryIds: readonly string[];
}

export function compileGhostRangeToTearSdl(
  ghost: GhostEnvelopeV3,
  range: GhostRangeV1,
  snapshot: TearSnapshotV1,
  stateClass: TearStateClass = "recorded-canonical",
): GhostScenarioBridgeResult {
  if (range.ghostId !== ghost.id) throw new TypeError("Ghost range does not belong to source Ghost");
  if (snapshot.tick > range.fromTick) throw new TypeError("scenario snapshot must not occur after range start");
  const selected = ghost.events.filter((event) => event.tick >= range.fromTick && event.tick <= range.toTick);
  const history = ancestorsForRange(ghost.events, selected);
  const runState = recordValue(snapshot.state["tear.run.v1"]);
  const waveValue = runState.wave;
  const document: TearSdlDocumentV1 = Object.freeze({
    format: "tearsdl",
    schemaVersion: 1,
    id: `${ghost.id}-range-${String(range.fromTick)}-${String(range.toTick)}`,
    stateClass,
    seed: snapshot.seed,
    start: Object.freeze({
      mode: stringField(runState, "mode", "campaign"),
      difficulty: stringField(runState, "difficulty", "normal"),
      weapon: stringField(runState, "weapon", "sword"),
      wave: typeof waveValue === "number" && Number.isSafeInteger(waveValue) ? waveValue : 1,
    }),
    state: Object.freeze({
      snapshotId: snapshot.id,
      snapshotTick: snapshot.tick,
      sanitizedState: sanitizePrivateData(snapshot.state),
      causalHistory: history.map((event) => sanitizePrivateData(event)),
    }),
    constraints: Object.freeze({
      sourceRootHash: ghost.rootHash,
      fromTick: range.fromTick,
      toTick: range.toTick,
      requiredCheckpointId: range.requiredCheckpointId ?? snapshot.id,
    }),
    tags: Object.freeze(["ghost-derived", "private-data-sanitized"]),
    maxTicks: range.toTick - range.fromTick + range.preRollTicks + range.postRollTicks,
  });
  const selectedIds = new Set(selected.map((event) => event.id));
  return Object.freeze({
    document,
    sourceGhostId: ghost.id,
    sourceRootHash: ghost.rootHash,
    selectedEventIds: Object.freeze(selected.map((event) => event.id)),
    requiredHistoryIds: Object.freeze(history.filter((event) => !selectedIds.has(event.id)).map((event) => event.id)),
  });
}

export interface GhostScenarioExecutionCapsule {
  readonly id: string;
  readonly ghost: GhostEnvelopeV3;
  readonly stateClass: TearStateClass;
  readonly branchProvenance: Readonly<{
    sourceScenarioId: string;
    sourceGhostId: string;
    sourceRootHash: string;
    relation: "scenario";
  }>;
}

export function recordScenarioExecutionAsGhost(
  bridge: GhostScenarioBridgeResult,
  executed: Readonly<{
    id: string;
    stateClass: TearStateClass;
    actions: GhostEnvelopeV3["actions"];
    snapshots: GhostEnvelopeV3["snapshots"];
    events: GhostEnvelopeV3["events"];
    trident: GhostEnvelopeV3["trident"];
  }>,
): GhostScenarioExecutionCapsule {
  const ghost = createGhostV3({
    id: executed.id,
    rulesetVersion: "scenario-execution-v1",
    sourceClassification: "native-v3",
    trident: executed.trident,
    actions: executed.actions,
    snapshots: executed.snapshots,
    events: executed.events,
  });
  return Object.freeze({
    id: `${executed.id}.tearghost`,
    ghost,
    stateClass: executed.stateClass,
    branchProvenance: Object.freeze({
      sourceScenarioId: bridge.document.id,
      sourceGhostId: bridge.sourceGhostId,
      sourceRootHash: bridge.sourceRootHash,
      relation: "scenario",
    }),
  });
}

export function promoteReviewedGhostToCanon(
  canon: GovernedGhostLibrary,
  ghost: GhostEnvelopeV3,
  review: Readonly<{ approved: boolean; reviewer: string; at: string }>,
): GhostLibraryEntry {
  if (canon.kind !== "canon") throw new TypeError("promotion target must be Ghost Canon");
  if (!review.approved || review.reviewer.trim().length === 0) throw new TypeError("Canon promotion requires an identified approval");
  const entry: GhostLibraryEntry = Object.freeze({
    id: `canon:${ghost.id}`,
    library: "canon",
    ghostId: ghost.id,
    rootHash: ghost.rootHash,
    createdAt: review.at,
    provenance: Object.freeze({ reviewer: review.reviewer, source: "reviewed-promotion" }),
  });
  canon.add(entry);
  return entry;
}

export function triageRareGhostToFrontier(
  frontier: GovernedGhostLibrary,
  ghost: GhostEnvelopeV3,
  noveltyScore: number,
  at: string,
): GhostLibraryEntry | undefined {
  if (frontier.kind !== "frontier") throw new TypeError("triage target must be Ghost Frontier");
  if (!Number.isFinite(noveltyScore) || noveltyScore < 0.8) return undefined;
  const entry: GhostLibraryEntry = Object.freeze({
    id: `frontier:${ghost.id}`,
    library: "frontier",
    ghostId: ghost.id,
    rootHash: ghost.rootHash,
    createdAt: at,
    provenance: Object.freeze({ noveltyScore: String(noveltyScore) }),
  });
  frontier.add(entry);
  return entry;
}

export type GhostCorpusSplit = "train" | "validation" | "test" | "hidden-holdout";

export interface GhostCorpusEntry extends GhostLibraryEntry {
  readonly library: "corpus";
  readonly consent: "private-personalization-only" | "anonymous-improvement" | "public-training";
  readonly split: GhostCorpusSplit;
  readonly deduplicationHash: string;
}

export class GhostCorpus {
  readonly #entries = new Map<string, GhostCorpusEntry>();
  readonly #hashes = new Set<string>();

  ingest(input: Readonly<{
    ghost: GhostEnvelopeV3;
    consent: GhostCorpusEntry["consent"];
    split: GhostCorpusSplit;
    createdAt: string;
    producer: string;
  }>): GhostCorpusEntry {
    if (!["private-personalization-only", "anonymous-improvement", "public-training"].includes(input.consent)) {
      throw new TypeError("Corpus ingestion requires explicit training consent");
    }
    if (!["train", "validation", "test", "hidden-holdout"].includes(input.split)) {
      throw new TypeError("Corpus split assignment is invalid");
    }
    if (input.producer.trim().length === 0) throw new TypeError("Corpus provenance producer is required");
    const deduplicationHash = stableVerificationHash({
      actions: input.ghost.actions,
      events: input.ghost.events,
      snapshots: input.ghost.snapshots.map((snapshot) => snapshot.hashes.semantic),
    });
    if (this.#hashes.has(deduplicationHash)) throw new TypeError("Corpus duplicate is already assigned");
    const entry: GhostCorpusEntry = Object.freeze({
      id: `corpus:${input.ghost.id}`,
      library: "corpus",
      ghostId: input.ghost.id,
      rootHash: input.ghost.rootHash,
      createdAt: input.createdAt,
      provenance: Object.freeze({ producer: input.producer }),
      consent: input.consent,
      split: input.split,
      deduplicationHash,
    });
    this.#entries.set(entry.id, entry);
    this.#hashes.add(deduplicationHash);
    return entry;
  }

  list(includeHiddenHoldout = false): readonly GhostCorpusEntry[] {
    return Object.freeze([...this.#entries.values()]
      .filter((entry) => includeHiddenHoldout || entry.split !== "hidden-holdout")
      .sort((left, right) => left.id.localeCompare(right.id)));
  }
}

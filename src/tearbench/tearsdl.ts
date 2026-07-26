import { stableVerificationHash } from "../replay/hash";
import {
  DIFFICULTY_REGISTRY,
  RUN_MODE_REGISTRY,
  WEAPON_REGISTRY,
} from "./registries";
import type { TearScenarioV1, TearSnapshotV1, TearStateClass } from "./contracts";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION } from "./contracts";
import { synthesizeProgression } from "./progression-ledger";
import { evaluateTearStateValidity } from "./state-validity";

export interface TearSdlDocumentV1 {
  readonly format: "tearsdl";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly extends?: string;
  readonly stateClass: TearStateClass;
  readonly seed: string;
  readonly start: Readonly<{
    mode: string; difficulty: string; weapon: string; stage?: string; wave?: number;
    boss?: string; bossPhase?: string;
  }>;
  readonly state?: Readonly<Record<string, unknown>>;
  readonly constraints?: Readonly<Record<string, unknown>>;
  readonly tags?: readonly string[];
  readonly maxTicks?: number;
}

export interface TearSdlIssue {
  readonly path: string;
  readonly severity: "warning" | "error";
  readonly message: string;
}

export interface TearSdlResolved {
  readonly document: TearSdlDocumentV1;
  readonly scenario: TearScenarioV1;
  readonly structural: Readonly<{ valid: boolean; issues: readonly TearSdlIssue[] }>;
  readonly reachability: Readonly<{ reachable: boolean; reasons: readonly string[] }>;
  readonly plausibility: Readonly<{ plausible: boolean; provisional: boolean; reasons: readonly string[] }>;
  readonly resolvedHash: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertDeclarative(value: unknown, path = "$", depth = 0): void {
  if (depth > 32) throw new RangeError(`TearSDL nesting exceeds 32 levels at ${path}`);
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) assertDeclarative(entry, `${path}[${String(index)}]`, depth + 1);
    return;
  }
  if (!isRecord(value)) {
    if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
      throw new TypeError(`TearSDL contains non-declarative value at ${path}`);
    }
    if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError(`TearSDL number must be finite at ${path}`);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new TypeError(`TearSDL forbids property ${key}`);
    }
    assertDeclarative(entry, `${path}.${key}`, depth + 1);
  }
}

function mergeRecords(
  parent: Readonly<Record<string, unknown>>,
  child: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const merged: Record<string, unknown> = { ...parent };
  for (const [key, value] of Object.entries(child)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new TypeError(`TearSDL forbids property ${key}`);
    }
    const existing = merged[key];
    merged[key] = isRecord(existing) && isRecord(value) ? mergeRecords(existing, value) : structuredClone(value);
  }
  return Object.freeze(merged);
}

export function parseTearSdl(source: string): TearSdlDocumentV1 {
  if (source.length > 1_000_000) throw new RangeError("TearSDL source exceeds 1 MB");
  const parsed: unknown = JSON.parse(source);
  if (!isRecord(parsed)) throw new TypeError("TearSDL root must be an object");
  assertDeclarative(parsed);
  if (parsed.format !== "tearsdl" || parsed.schemaVersion !== 1) {
    throw new TypeError("unsupported TearSDL format or schema version");
  }
  if (typeof parsed.id !== "string" || typeof parsed.seed !== "string" || !isRecord(parsed.start)) {
    throw new TypeError("TearSDL requires id, seed, and start");
  }
  return structuredClone(parsed) as unknown as TearSdlDocumentV1;
}

export function flattenTearSdl(
  document: TearSdlDocumentV1,
  library: ReadonlyMap<string, TearSdlDocumentV1>,
  chain: readonly string[] = [],
): TearSdlDocumentV1 {
  if (chain.includes(document.id)) throw new TypeError(`TearSDL inheritance cycle: ${[...chain, document.id].join(" -> ")}`);
  if (document.extends === undefined) return Object.freeze(structuredClone(document));
  const parent = library.get(document.extends);
  if (parent === undefined) throw new RangeError(`TearSDL parent does not exist: ${document.extends}`);
  const flattenedParent = flattenTearSdl(parent, library, [...chain, document.id]);
  const merged = mergeRecords(
    flattenedParent as unknown as Readonly<Record<string, unknown>>,
    document as unknown as Readonly<Record<string, unknown>>,
  );
  const { extends: ignored, ...withoutExtends } = merged;
  void ignored;
  return Object.freeze(withoutExtends) as unknown as TearSdlDocumentV1;
}

export function resolveTearSdl(
  document: TearSdlDocumentV1,
  library: ReadonlyMap<string, TearSdlDocumentV1> = new Map(),
): TearSdlResolved {
  const flattened = flattenTearSdl(document, library);
  const issues: TearSdlIssue[] = [];
  if (!RUN_MODE_REGISTRY.has(flattened.start.mode)) issues.push({ path: "start.mode", severity: "error", message: "unknown run mode" });
  if (!DIFFICULTY_REGISTRY.has(flattened.start.difficulty)) issues.push({ path: "start.difficulty", severity: "error", message: "unknown difficulty" });
  if (!WEAPON_REGISTRY.has(flattened.start.weapon)) issues.push({ path: "start.weapon", severity: "error", message: "unknown weapon" });
  if (flattened.start.wave !== undefined && (!Number.isSafeInteger(flattened.start.wave) || flattened.start.wave < 1)) {
    issues.push({ path: "start.wave", severity: "error", message: "wave must be a positive integer" });
  }
  const structuralValid = issues.every((issue) => issue.severity !== "error");
  if (!structuralValid) {
    throw new TypeError(`invalid TearSDL: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  }
  const mode = RUN_MODE_REGISTRY.assert(flattened.start.mode);
  const difficulty = DIFFICULTY_REGISTRY.assert(flattened.start.difficulty);
  const weapon = WEAPON_REGISTRY.assert(flattened.start.weapon);
  const wave = flattened.start.wave ?? 1;
  const validity = evaluateTearStateValidity({
    stateClass: flattened.stateClass,
    start: flattened.start,
    ...(flattened.state === undefined ? {} : { state: flattened.state }),
    ...(flattened.constraints === undefined ? {} : { constraints: flattened.constraints }),
  });
  const scenario: TearScenarioV1 = Object.freeze({
    format: TEAR_CONTRACT_FORMAT,
    kind: "scenario",
    schemaVersion: TEAR_CONTRACT_VERSION,
    id: flattened.id,
    version: 1,
    description: `Resolved TearSDL scenario ${flattened.id}`,
    stateClass: flattened.stateClass,
    executionClass: "engineering",
    seed: flattened.seed,
    start: Object.freeze({
      mode, difficulty, weapon,
      ...(flattened.start.stage === undefined ? {} : { stage: flattened.start.stage }),
      wave,
      ...(flattened.start.boss === undefined ? {} : { boss: flattened.start.boss }),
      ...(flattened.start.bossPhase === undefined ? {} : { bossPhase: flattened.start.bossPhase }),
    }),
    maxTicks: flattened.maxTicks ?? 1_440,
    assertions: Object.freeze([
      "runtime.finite-state", "entity.unique-id", "entity.valid-owner",
      "player.valid-health", "world.legal-bounds", "boss.valid-phase", "runtime.no-softlock",
    ] as const),
    tags: Object.freeze([...(flattened.tags ?? [])]),
  });
  return Object.freeze({
    document: flattened,
    scenario,
    structural: Object.freeze({
      valid: validity.structural.valid,
      issues: Object.freeze([
        ...issues,
        ...validity.structural.issues.map((issue) => ({
          path: issue.path, severity: "error" as const, message: issue.message,
        })),
      ]),
    }),
    reachability: validity.reachability,
    plausibility: validity.plausibility,
    resolvedHash: stableVerificationHash(flattened),
  });
}

export function createBoundaryTearSdl(
  base: TearSdlDocumentV1,
  field: string,
  threshold: number,
  epsilon = 1,
): readonly TearSdlDocumentV1[] {
  return Object.freeze([
    Object.freeze({ ...base, id: `${base.id}-${field}-minus`, state: Object.freeze({ ...base.state, [field]: threshold - epsilon }) }),
    Object.freeze({ ...base, id: `${base.id}-${field}-at`, state: Object.freeze({ ...base.state, [field]: threshold }) }),
    Object.freeze({ ...base, id: `${base.id}-${field}-plus`, state: Object.freeze({ ...base.state, [field]: threshold + epsilon }) }),
  ]);
}

export interface TearCheckpointDelta {
  readonly id: string;
  readonly parentId: string;
  readonly tick: number;
  readonly statePatch: Readonly<Record<string, unknown>>;
}

export interface TearCheckpointArchiveV1 {
  readonly format: "tear-checkpoint-bank";
  readonly schemaVersion: 1;
  readonly snapshots: readonly TearSnapshotV1[];
  readonly deltas: readonly TearCheckpointDelta[];
}

export interface TearCheckpointEntry {
  readonly id: string;
  readonly kind: "snapshot" | "delta";
  readonly tick: number;
  readonly parentId?: string;
}

export class TearCheckpointBank {
  readonly #snapshots = new Map<string, TearSnapshotV1>();
  readonly #deltas = new Map<string, TearCheckpointDelta>();

  addSnapshot(snapshot: TearSnapshotV1): void {
    if (this.#snapshots.has(snapshot.id) || this.#deltas.has(snapshot.id)) throw new TypeError(`checkpoint already exists: ${snapshot.id}`);
    this.#snapshots.set(snapshot.id, structuredClone(snapshot));
  }

  fork(parentId: string, id: string, tick: number, statePatch: Readonly<Record<string, unknown>>): TearCheckpointDelta {
    if (!this.#snapshots.has(parentId) && !this.#deltas.has(parentId)) throw new RangeError(`checkpoint parent does not exist: ${parentId}`);
    if (this.#snapshots.has(id) || this.#deltas.has(id)) throw new TypeError(`checkpoint already exists: ${id}`);
    const delta = Object.freeze({ id, parentId, tick, statePatch: Object.freeze(structuredClone(statePatch)) });
    this.#deltas.set(id, delta);
    return delta;
  }

  materialize(id: string): Readonly<Record<string, unknown>> {
    const snapshot = this.#snapshots.get(id);
    if (snapshot !== undefined) return Object.freeze(structuredClone(snapshot.state));
    const delta = this.#deltas.get(id);
    if (delta === undefined) throw new RangeError(`checkpoint does not exist: ${id}`);
    return mergeRecords(this.materialize(delta.parentId), delta.statePatch);
  }

  list(): readonly TearCheckpointEntry[] {
    return Object.freeze([
      ...[...this.#snapshots.values()].map((snapshot) => Object.freeze({
        id: snapshot.id, kind: "snapshot" as const, tick: snapshot.tick,
      })),
      ...[...this.#deltas.values()].map((delta) => Object.freeze({
        id: delta.id, kind: "delta" as const, tick: delta.tick, parentId: delta.parentId,
      })),
    ].sort((left, right) => left.tick - right.tick || left.id.localeCompare(right.id)));
  }

  diff(leftId: string, rightId: string): readonly string[] {
    const left = this.materialize(leftId);
    const right = this.materialize(rightId);
    const paths = new Set<string>();
    const visit = (leftValue: unknown, rightValue: unknown, path: string): void => {
      if (Object.is(leftValue, rightValue)) return;
      if (leftValue !== undefined && rightValue !== undefined
        && stableVerificationHash(leftValue) === stableVerificationHash(rightValue)) return;
      if (isRecord(leftValue) && isRecord(rightValue)) {
        const keys = new Set([...Object.keys(leftValue), ...Object.keys(rightValue)]);
        for (const key of [...keys].sort()) visit(leftValue[key], rightValue[key], `${path}.${key}`);
        return;
      }
      paths.add(path);
    };
    visit(left, right, "$");
    return Object.freeze([...paths].sort());
  }

  export(): TearCheckpointArchiveV1 {
    return Object.freeze({
      format: "tear-checkpoint-bank",
      schemaVersion: 1,
      snapshots: Object.freeze([...this.#snapshots.values()].map((snapshot) => structuredClone(snapshot))),
      deltas: Object.freeze([...this.#deltas.values()].map((delta) => structuredClone(delta))),
    });
  }

  import(archive: TearCheckpointArchiveV1): void {
    const candidate = new TearCheckpointBank();
    for (const snapshot of archive.snapshots) candidate.addSnapshot(snapshot);
    const pending = [...archive.deltas];
    while (pending.length > 0) {
      const index = pending.findIndex((delta) =>
        candidate.#snapshots.has(delta.parentId) || candidate.#deltas.has(delta.parentId));
      if (index < 0) throw new TypeError("checkpoint archive contains a cycle or missing parent");
      const [delta] = pending.splice(index, 1);
      if (delta === undefined) throw new Error("checkpoint archive import lost a delta");
      candidate.fork(delta.parentId, delta.id, delta.tick, delta.statePatch);
    }
    this.#snapshots.clear();
    this.#deltas.clear();
    for (const snapshot of candidate.#snapshots.values()) this.#snapshots.set(snapshot.id, snapshot);
    for (const delta of candidate.#deltas.values()) this.#deltas.set(delta.id, delta);
  }
}

export function createExactBossBoundary(
  base: TearSdlDocumentV1,
  boss: string,
  phase: string,
  attackFrame: number,
): TearSdlDocumentV1 {
  return Object.freeze({
    ...base,
    id: `${base.id}-${boss}-${phase}-${String(attackFrame)}`,
    start: Object.freeze({ ...base.start, boss, bossPhase: phase }),
    state: Object.freeze({ ...base.state, bossAttackFrame: attackFrame }),
  });
}

export function createWave99HammerPackage(): Readonly<Record<string, unknown>> {
  const document: TearSdlDocumentV1 = Object.freeze({
    format: "tearsdl",
    schemaVersion: 1,
    id: "hard-endless-wave-99-hammer",
    stateClass: "reconstructed-reachable",
    seed: "990099",
    start: Object.freeze({ mode: "endless", difficulty: "hard", weapon: "hammer", wave: 99 }),
    state: Object.freeze({ playerHpRatio: 0.72, bladeState: "held", abilityCooldownTicks: 0 }),
    constraints: Object.freeze({ legalProgression: true }),
    tags: Object.freeze(["canonical", "wave-99", "hammer"]),
    maxTicks: 3_600,
  });
  const resolved = resolveTearSdl(document);
  const progression = synthesizeProgression({
    mode: "endless", difficulty: "hard", weapon: "hammer", targetWave: 99,
    policy: "archetype",
    selections: [{ id: "keen_edge", tier: 5 }, { id: "bloodrite", tier: 3 }, { id: "air_dash", tier: 1 }],
  });
  const snapshot = Object.freeze({
    id: "wave99-start",
    tick: 0,
    stateClass: document.stateClass,
    seed: document.seed,
    state: document.state,
  });
  return Object.freeze({
    format: "tearbench-forge-package",
    schemaVersion: 1,
    document,
    resolved,
    progression,
    configurationTrace: progression.ledger.events.filter((event) =>
      event.type === "run.setup" || event.type === "weapon.selected" || event.type === "meta.applied"),
    validation: Object.freeze({
      structural: resolved.structural,
      reachability: resolved.reachability,
      plausibility: resolved.plausibility,
    }),
    visibleEpisode: Object.freeze({ scenarioId: resolved.scenario.id, maxTicks: resolved.scenario.maxTicks }),
    snapshot,
    replay: Object.freeze({ seed: document.seed, actions: [] }),
    metrics: progression.statistics,
  });
}

import { stableVerificationHash } from "../replay/hash";
import {
  DIFFICULTY_REGISTRY,
  RUN_MODE_REGISTRY,
  WEAPON_REGISTRY,
} from "./registries";
import type { TearScenarioV1, TearSnapshotV1, TearStateClass } from "./contracts";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION } from "./contracts";
import { synthesizeProgression } from "./progression-ledger";

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
  const reachabilityReasons: string[] = [];
  if (flattened.stateClass === "adversarial-impossible") reachabilityReasons.push("state is intentionally classified as adversarial-impossible");
  if (flattened.start.bossPhase !== undefined && flattened.start.boss === undefined) {
    reachabilityReasons.push("a boss phase requires a declared boss");
  }
  const plausibleReasons: string[] = [];
  const provisional = flattened.stateClass === "plausible-population";
  if (provisional) plausibleReasons.push("population plausibility is provisional until consented samples exist");
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
    structural: Object.freeze({ valid: true, issues: Object.freeze(issues) }),
    reachability: Object.freeze({ reachable: reachabilityReasons.length === 0, reasons: Object.freeze(reachabilityReasons) }),
    plausibility: Object.freeze({ plausible: !provisional, provisional, reasons: Object.freeze(plausibleReasons) }),
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
    selections: [{ id: "impact", tier: 5 }, { id: "recall", tier: 4 }, { id: "guard", tier: 3 }],
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

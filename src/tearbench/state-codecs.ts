import { stableVerificationHash } from "../replay/hash";
import type { TearSnapshotV1 } from "./contracts";
import { CODEC_REGISTRY, type TearCodecId } from "./registries";

export type TearCodecValue =
  | null | boolean | number | string
  | readonly TearCodecValue[]
  | Readonly<{ [key: string]: TearCodecValue }>;

export interface TearCodecIssue {
  readonly codecId: TearCodecId;
  readonly path: string;
  readonly message: string;
}

export interface TearCodecWorld {
  readonly components: Map<TearCodecId, TearCodecValue>;
  readonly references: Map<string, string>;
  readonly entityIds: Set<string>;
}

export interface TearStateCodec {
  readonly id: TearCodecId;
  readonly version: number;
  capture(world: TearCodecWorld): TearCodecValue;
  validate(payload: unknown): readonly TearCodecIssue[];
  migrate(payload: unknown, fromVersion: number): unknown;
  restore(world: TearCodecWorld, payload: TearCodecValue): void;
  resolveReferences(world: TearCodecWorld): readonly TearCodecIssue[];
  hashProjection(world: TearCodecWorld): TearCodecValue;
  presentationFallback(payload: unknown): TearCodecValue;
}

const dangerousKeys = new Set(["__proto__", "constructor", "prototype"]);

function validateDataOnly(
  codecId: TearCodecId,
  value: unknown,
  path = "$",
  depth = 0,
): TearCodecIssue[] {
  if (depth > 32) return [{ codecId, path, message: "payload nesting exceeds 32 levels" }];
  if (value === null || typeof value === "boolean" || typeof value === "string") return [];
  if (typeof value === "number") {
    return Number.isFinite(value) ? [] : [{ codecId, path, message: "number must be finite" }];
  }
  if (Array.isArray(value)) {
    if (value.length > 100_000) return [{ codecId, path, message: "array exceeds item limit" }];
    return value.flatMap((entry, index) => validateDataOnly(codecId, entry, `${path}[${String(index)}]`, depth + 1));
  }
  if (typeof value !== "object") {
    return [{ codecId, path, message: `unsupported payload value ${typeof value}` }];
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return [{ codecId, path, message: "payload must contain plain data objects only" }];
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 100_000) return [{ codecId, path, message: "object exceeds property limit" }];
  return entries.flatMap(([key, entry]) =>
    dangerousKeys.has(key)
      ? [{ codecId, path: `${path}.${key}`, message: "dangerous property name is forbidden" }]
      : validateDataOnly(codecId, entry, `${path}.${key}`, depth + 1));
}

function cloneData<T extends TearCodecValue>(value: T): T {
  return structuredClone(value);
}

const referenceKeys = new Set([
  "ownerId", "targetId", "summonerId", "platformId", "projectileId", "stolenBladeId",
]);

function indexIdentitiesAndReferences(
  world: TearCodecWorld,
  codecId: TearCodecId,
  value: TearCodecValue,
  path = "$",
): void {
  if (Array.isArray(value)) {
    const entries = value as readonly TearCodecValue[];
    entries.forEach((entry, index) => {
      indexIdentitiesAndReferences(world, codecId, entry, `${path}[${String(index)}]`);
    });
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "id" && typeof entry === "string") world.entityIds.add(entry);
    if (referenceKeys.has(key) && typeof entry === "string") {
      world.references.set(`${codecId}:${path}.${key}`, entry);
    }
    indexIdentitiesAndReferences(world, codecId, entry, `${path}.${key}`);
  }
}

export function createDataOnlyCodec(id: TearCodecId): TearStateCodec {
  CODEC_REGISTRY.assert(id);
  const codec: TearStateCodec = {
    id,
    version: 1,
    capture(world) {
      return cloneData(world.components.get(id) ?? {});
    },
    validate(payload) {
      return Object.freeze(validateDataOnly(id, payload));
    },
    migrate(payload, fromVersion) {
      if (fromVersion !== 1) throw new RangeError(`${id} cannot migrate schema version ${String(fromVersion)}`);
      return payload;
    },
    restore(world, payload) {
      const cloned = cloneData(payload);
      world.components.set(id, cloned);
      indexIdentitiesAndReferences(world, id, cloned);
    },
    resolveReferences(world) {
      const issues: TearCodecIssue[] = [];
      for (const [source, target] of world.references) {
        if (source.startsWith(`${id}:`) && !world.entityIds.has(target) && target !== "player" && target !== "blade") {
          issues.push({ codecId: id, path: `references.${source}`, message: `reference target ${target} does not exist` });
        }
      }
      return Object.freeze(issues);
    },
    hashProjection(world) {
      return cloneData(world.components.get(id) ?? {});
    },
    presentationFallback() {
      return Object.freeze({ unavailable: true, codecId: id });
    },
  };
  return Object.freeze(codec);
}

export class TearStateCodecRegistry {
  readonly #codecs = new Map<TearCodecId, TearStateCodec>();

  register(codec: TearStateCodec): void {
    CODEC_REGISTRY.assert(codec.id);
    if (this.#codecs.has(codec.id)) throw new TypeError(`codec already registered: ${codec.id}`);
    this.#codecs.set(codec.id, codec);
  }

  get(id: TearCodecId): TearStateCodec {
    const codec = this.#codecs.get(id);
    if (codec === undefined) throw new RangeError(`codec is not registered: ${id}`);
    return codec;
  }

  list(): readonly TearStateCodec[] {
    return Object.freeze([...this.#codecs.values()].sort((left, right) => left.id.localeCompare(right.id)));
  }
}

export function createDefaultStateCodecRegistry(): TearStateCodecRegistry {
  const registry = new TearStateCodecRegistry();
  for (const id of CODEC_REGISTRY.ids) registry.register(createDataOnlyCodec(id));
  return registry;
}

export interface TearWorldFactory {
  createEmpty(): TearCodecWorld;
  validate(world: TearCodecWorld): readonly string[];
}

export interface TearWorldCommitTarget {
  replace(world: TearCodecWorld): void;
}

export type TearRestoreResult =
  | Readonly<{ ok: true; exactHash: string; semanticHash: string }>
  | Readonly<{ ok: false; issues: readonly TearCodecIssue[] }>;

function payloadFor(snapshot: TearSnapshotV1, id: TearCodecId): unknown {
  return snapshot.state[id];
}

export function restoreSnapshotTransactionally(
  snapshot: TearSnapshotV1,
  registry: TearStateCodecRegistry,
  factory: TearWorldFactory,
  target: TearWorldCommitTarget,
): TearRestoreResult {
  const temporary = factory.createEmpty();
  const issues: TearCodecIssue[] = [];
  for (const codec of registry.list()) {
    const encodedVersion = snapshot.codecs[codec.id];
    const raw = payloadFor(snapshot, codec.id);
    if (encodedVersion === undefined || raw === undefined) {
      issues.push({ codecId: codec.id, path: `state.${codec.id}`, message: "required codec payload is missing" });
      continue;
    }
    let migrated: unknown;
    try {
      migrated = codec.migrate(raw, encodedVersion);
    } catch (error) {
      issues.push({
        codecId: codec.id,
        path: `state.${codec.id}`,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const validation = codec.validate(migrated);
    issues.push(...validation);
    if (validation.length === 0) codec.restore(temporary, migrated as TearCodecValue);
  }
  if (issues.length === 0) {
    for (const codec of registry.list()) issues.push(...codec.resolveReferences(temporary));
    issues.push(...factory.validate(temporary).map((message) => ({
      codecId: "tear.world.v1" as const,
      path: "$",
      message,
    })));
  }
  if (issues.length > 0) return Object.freeze({ ok: false, issues: Object.freeze(issues) });

  const exactHash = stableVerificationHash(Object.fromEntries(
    registry.list().map((codec) => [codec.id, temporary.components.get(codec.id)]),
  ));
  const semanticHash = stableVerificationHash(Object.fromEntries(
    registry.list().map((codec) => [codec.id, codec.hashProjection(temporary)]),
  ));
  target.replace(temporary);
  return Object.freeze({ ok: true, exactHash, semanticHash });
}

export function captureCodecState(
  world: TearCodecWorld,
  registry: TearStateCodecRegistry,
): Readonly<{ codecs: Readonly<Record<string, number>>; state: Readonly<Record<string, TearCodecValue>> }> {
  return Object.freeze({
    codecs: Object.freeze(Object.fromEntries(registry.list().map((codec) => [codec.id, codec.version]))),
    state: Object.freeze(Object.fromEntries(registry.list().map((codec) => [codec.id, codec.capture(world)]))),
  });
}

export interface TearStateDiffEntry {
  readonly codecId: TearCodecId;
  readonly exactEqual: boolean;
  readonly semanticEqual: boolean;
}

export function diffCodecWorlds(
  left: TearCodecWorld,
  right: TearCodecWorld,
  registry: TearStateCodecRegistry,
): readonly TearStateDiffEntry[] {
  return Object.freeze(registry.list().map((codec) => ({
    codecId: codec.id,
    exactEqual: stableVerificationHash(left.components.get(codec.id)) === stableVerificationHash(right.components.get(codec.id)),
    semanticEqual: stableVerificationHash(codec.hashProjection(left)) === stableVerificationHash(codec.hashProjection(right)),
  })));
}

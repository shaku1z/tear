/**
 * One isolated mutable tuning record for a gameplay world.
 *
 * The caller supplies data-only base tuning. This module deliberately does
 * not import the process-wide game configuration: live and detached worlds
 * must each choose and own their own starting data. The exposed root object is
 * never replaced, so existing simulation constructors may safely retain it.
 */
export interface TearWorldConfiguration<Configuration extends object> {
  /** The stable, mutable configuration reference consumed by one world. */
  readonly value: Configuration;
  /** Returns a deep copy that can be held as a rollback point. */
  snapshot(): Configuration;
  /** Reconciles a prior snapshot into the stable world-owned configuration. */
  restore(snapshot: Configuration): void;
  /** Restores the world-owned configuration to its initial data-only base. */
  resetToBase(): void;
}

type DataRecord = Record<string, unknown>;

function clone<Configuration>(value: Configuration): Configuration {
  return structuredClone(value);
}

function isDataRecord(value: unknown): value is DataRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.prototype.toString.call(value) === "[object Object]";
}

/** Reject a cloneable but structurally invalid restore before it can erase or
 * replace a branch a live constructor already depends on. */
function hasCompatibleDataShape(baseline: unknown, candidate: unknown): boolean {
  if (Array.isArray(baseline)) {
    return Array.isArray(candidate)
      && baseline.length === candidate.length
      && baseline.every((value, index) => hasCompatibleDataShape(value, candidate[index]));
  }
  if (isDataRecord(baseline)) {
    if (!isDataRecord(candidate)) return false;
    const baselineKeys = Object.keys(baseline), candidateKeys = Object.keys(candidate);
    return baselineKeys.length === candidateKeys.length
      && baselineKeys.every((key) => Object.hasOwn(candidate, key)
        && hasCompatibleDataShape(baseline[key], candidate[key]));
  }
  return typeof baseline === typeof candidate;
}

/**
 * Reconciles recursively rather than replacing records or arrays. Besides the
 * root guarantee, this preserves references held by constructors to unchanged
 * configuration branches while ensuring no object from a snapshot is adopted.
 */
function reconcile(target: unknown, source: unknown): unknown {
  if (Array.isArray(target) && Array.isArray(source)) {
    const targetArray = target as unknown[];
    const sourceArray = source as readonly unknown[];
    const commonLength = Math.min(targetArray.length, sourceArray.length);
    for (let index = 0; index < commonLength; index++) targetArray[index] = reconcile(targetArray[index], sourceArray[index]);
    for (let index = commonLength; index < sourceArray.length; index++) targetArray[index] = clone(sourceArray[index]);
    targetArray.length = sourceArray.length;
    return targetArray;
  }
  if (isDataRecord(target) && isDataRecord(source)) {
    for (const key of Object.keys(target)) if (!Object.hasOwn(source, key)) Reflect.deleteProperty(target, key);
    for (const key of Object.keys(source)) target[key] = reconcile(target[key], source[key]);
    return target;
  }
  return clone(source);
}

/**
 * Creates an isolated mutable copy of base tuning. The base object is never
 * retained or modified; it is only a source for future deterministic resets.
 */
export function createTearWorldConfiguration<Configuration extends object>(
  base: Configuration,
): TearWorldConfiguration<Configuration> {
  const baseline = clone(base);
  const value = clone(base);
  if (!isDataRecord(baseline) || !isDataRecord(value)) {
    throw new TypeError("Tear world configuration must be a data record");
  }
  const restore = (snapshot: Configuration): void => {
    // Clone and validate before touching `value`: malformed or unclonable
    // caller input must leave the current world at its prior coherent state.
    const prepared = clone(snapshot);
    if (!isDataRecord(prepared) || !hasCompatibleDataShape(baseline, prepared)) {
      throw new TypeError("Tear world configuration snapshot is incompatible with its base data shape");
    }
    reconcile(value, prepared);
  };
  return Object.freeze({
    value,
    snapshot: () => clone(value),
    restore,
    resetToBase: () => { reconcile(value, baseline); },
  } satisfies TearWorldConfiguration<Configuration>);
}

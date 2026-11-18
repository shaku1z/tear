/**
 * The one rule for plain objects that hold untrusted data, and for maps keyed by a saved or authored id.
 *
 * Keys such as `constructor`, `toString` and `__proto__` name members every plain object inherits, so
 * `map[key]` and `key in map` find them in an empty map, and writing `__proto__` replaces the prototype.
 * Such maps are read with `ownValue` (or `hasOwnKey`), and keys from data are admitted with `isSafeKey`.
 */

/** The one guard for "a plain JSON object" (not null, not an array). Everything that reads untrusted data uses it. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every name a plain object inherits, taken from `Object.prototype` itself rather than a hand-written list. */
const INHERITED_NAMES: ReadonlySet<string> = new Set(Object.getOwnPropertyNames(Object.prototype));

/** Whether a key from saved or authored data can be stored in, and looked up from, a plain object. */
export function isSafeKey(key: string): boolean {
  return !INHERITED_NAMES.has(key);
}

/** Whether the map itself holds `key`; an inherited member never counts. */
export function hasOwnKey(map: object, key: string): boolean {
  return Object.hasOwn(map, key);
}

/** The map's own value at `key`, or undefined; never an inherited member. */
export function ownValue<T>(map: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

/** The map's own entries whose keys are safe to store again (see `isSafeKey`). */
export function safeEntries<T>(map: Readonly<Record<string, T>>): [string, T][] {
  return Object.entries(map).filter(([key]) => isSafeKey(key));
}

/** A saved number as a usable one: anything missing, non-numeric or not finite reads as 0. */
export function finiteOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

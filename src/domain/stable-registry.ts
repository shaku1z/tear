/** A frozen list of stable ids (lowercase, dot/dash/underscore separated) with membership checks. */
const STABLE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export interface StableRegistry<TId extends string> {
  readonly ids: readonly TId[];
  has(value: string): value is TId;
  assert(value: string): TId;
}

export function createStableRegistry<const TIds extends readonly string[]>(
  label: string,
  ids: TIds,
): StableRegistry<TIds[number]> {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!STABLE_ID_PATTERN.test(id)) throw new TypeError(`${label} contains invalid stable id: ${id}`);
    if (seen.has(id)) throw new TypeError(`${label} contains duplicate stable id: ${id}`);
    seen.add(id);
  }
  const frozen = Object.freeze([...ids]);
  return Object.freeze({
    ids: frozen,
    has(value: string): value is TIds[number] {
      return seen.has(value);
    },
    assert(value: string): TIds[number] {
      if (!seen.has(value)) throw new RangeError(`unknown ${label} id: ${value}`);
      return value;
    },
  });
}

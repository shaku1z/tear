type Falsy = false | 0 | "" | null | undefined;

/** Preserve the legacy renderer's lazy, truthiness-based fallback semantics. */
export function truthyOr<Value>(value: Value | Falsy, fallback: () => Value): Value {
  if (value) return value;
  return fallback();
}

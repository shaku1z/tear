export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject { readonly [key: string]: JsonValue }
export type MutableJsonValue = JsonPrimitive | MutableJsonObject | MutableJsonValue[];
export interface MutableJsonObject { [key: string]: MutableJsonValue }

export type ValidationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: string }>;

const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** Clones untrusted input into a bounded, immutable, prototype-safe JSON value. */
export function validateJson(value: unknown, maxNodes = 20_000): ValidationResult<JsonValue> {
  let nodes = 0;
  const ancestors = new Set<object>();
  const visit = (input: unknown, depth: number): ValidationResult<JsonValue> => {
    nodes += 1;
    if (nodes > maxNodes) return { ok: false, error: "JSON value exceeds the node limit." };
    if (depth > 40) return { ok: false, error: "JSON value exceeds the nesting limit." };
    if (input === null || typeof input === "string" || typeof input === "boolean") return { ok: true, value: input };
    if (typeof input === "number") {
      return Number.isFinite(input) ? { ok: true, value: input } : { ok: false, error: "JSON numbers must be finite." };
    }
    if (typeof input !== "object") return { ok: false, error: "Value is not JSON serializable." };
    if (ancestors.has(input)) return { ok: false, error: "Cyclic values are not accepted." };
    ancestors.add(input);
    if (Array.isArray(input)) {
      const output: JsonValue[] = [];
      for (const entry of input) {
        const validated = visit(entry, depth + 1);
        if (!validated.ok) { ancestors.delete(input); return validated; }
        output.push(validated.value);
      }
      ancestors.delete(input);
      return { ok: true, value: Object.freeze(output) };
    }
    const output: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
    for (const [key, entry] of Object.entries(input)) {
      if (UNSAFE_KEYS.has(key)) continue;
      const validated = visit(entry, depth + 1);
      if (!validated.ok) { ancestors.delete(input); return validated; }
      output[key] = validated.value;
    }
    ancestors.delete(input);
    return { ok: true, value: Object.freeze(output) };
  };
  return visit(value, 0);
}

export function validateJsonObject(value: unknown): ValidationResult<JsonObject> {
  const result = validateJson(value);
  if (!result.ok) return result;
  if (Array.isArray(result.value) || result.value === null || typeof result.value !== "object") {
    return { ok: false, error: "Expected a JSON object." };
  }
  return { ok: true, value: result.value as JsonObject };
}

/** Explicit migration boundary for legacy systems that still mutate loaded save objects. */
function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

export function mutableJsonClone(value: JsonValue): MutableJsonValue {
  if (isJsonArray(value)) return value.map((entry) => mutableJsonClone(entry));
  if (value !== null && typeof value === "object") {
    const output: MutableJsonObject = {};
    for (const [key, entry] of Object.entries(value)) output[key] = mutableJsonClone(entry);
    return output;
  }
  return value;
}

export function parseStoredJson(text: string, maxCharacters = 5_000_000): ValidationResult<JsonValue> {
  if (text.length > maxCharacters) return { ok: false, error: "Stored value exceeds the size limit." };
  try { return validateJson(JSON.parse(text) as unknown); } catch { return { ok: false, error: "Stored value is not valid JSON." }; }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function safeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function extensionFields(source: Record<string, unknown>, known: ReadonlySet<string>): ValidationResult<JsonObject> {
  const existing = source.extensions === undefined ? {} : asRecord(source.extensions);
  if (!existing) return { ok: false, error: "Envelope extensions must be an object." };
  return validateJsonObject({
    ...existing,
    ...Object.fromEntries(Object.entries(source).filter(([key]) => !known.has(key))),
  });
}

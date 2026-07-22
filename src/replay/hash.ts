function canonicalize(value: unknown, path: string): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry, index) => canonicalize(entry, `${path}[${String(index)}]`)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const entries = keys.map((key) => {
      const entry = record[key];
      if (entry === undefined) throw new TypeError(`${path}.${key} is undefined`);
      return `${JSON.stringify(key)}:${canonicalize(entry, `${path}.${key}`)}`;
    });
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`${path} is not canonical JSON data`);
}

/** Stable JSON encoding used by verification. Object insertion order is ignored. */
export function canonicalStringify(value: unknown): string {
  return canonicalize(value, "$");
}

/**
 * Portable FNV-1a 64-bit hash over canonical UTF-16 code units.
 * This is a deterministic verification checksum, not a cryptographic signature.
 */
export function stableVerificationHash(value: unknown): string {
  const canonical = canonicalStringify(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < canonical.length; index += 1) {
    const codeUnit = canonical.charCodeAt(index);
    hash ^= BigInt(codeUnit & 0xff);
    hash = (hash * prime) & mask;
    hash ^= BigInt(codeUnit >>> 8);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

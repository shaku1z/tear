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

const FNV_PRIME_LOW = 0x1b3;

interface CanonicalHashState { high: number; low: number; }

function hashByte(state: CanonicalHashState, byte: number): void {
  const low = (state.low ^ byte) >>> 0;
  const product = low * FNV_PRIME_LOW;
  state.high = (Math.imul(state.high, FNV_PRIME_LOW)
    + Math.floor(product / 0x1_0000_0000) + ((low << 8) >>> 0)) >>> 0;
  state.low = product >>> 0;
}

function hashCodeUnit(state: CanonicalHashState, codeUnit: number): void {
  hashByte(state, codeUnit & 0xff);
  hashByte(state, codeUnit >>> 8);
}

function hashText(state: CanonicalHashState, text: string): void {
  for (let index = 0; index < text.length; index += 1) hashCodeUnit(state, text.charCodeAt(index));
}

function hashJsonString(state: CanonicalHashState, value: string): void {
  hashCodeUnit(state, 0x22);
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit === 0x22 || codeUnit === 0x5c) {
      hashCodeUnit(state, 0x5c); hashCodeUnit(state, codeUnit);
    } else if (codeUnit === 0x08) hashText(state, "\\b");
    else if (codeUnit === 0x09) hashText(state, "\\t");
    else if (codeUnit === 0x0a) hashText(state, "\\n");
    else if (codeUnit === 0x0c) hashText(state, "\\f");
    else if (codeUnit === 0x0d) hashText(state, "\\r");
    else if (codeUnit < 0x20 || (codeUnit >= 0xd800 && codeUnit <= 0xdfff
      && !(codeUnit <= 0xdbff && index + 1 < value.length
        && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff)
      && !(codeUnit >= 0xdc00 && index > 0
        && value.charCodeAt(index - 1) >= 0xd800 && value.charCodeAt(index - 1) <= 0xdbff))) {
      hashText(state, `\\u${codeUnit.toString(16).padStart(4, "0")}`);
    } else hashCodeUnit(state, codeUnit);
  }
  hashCodeUnit(state, 0x22);
}

type CanonicalPathSegment = string | number;

function formatCanonicalPath(path: readonly CanonicalPathSegment[]): string {
  let formatted = "$";
  for (const segment of path) formatted += typeof segment === "number" ? `[${String(segment)}]` : `.${segment}`;
  return formatted;
}

function hashCanonicalValue(state: CanonicalHashState, value: unknown, path: CanonicalPathSegment[]): void {
  if (value === null) { hashText(state, "null"); return; }
  if (typeof value === "boolean") { hashText(state, value ? "true" : "false"); return; }
  if (typeof value === "string") { hashJsonString(state, value); return; }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${formatCanonicalPath(path)} contains a non-finite number`);
    hashText(state, Object.is(value, -0) ? "0" : JSON.stringify(value));
    return;
  }
  if (Array.isArray(value)) {
    hashCodeUnit(state, 0x5b);
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) hashCodeUnit(state, 0x2c);
      if (index in value) {
        path.push(index);
        hashCanonicalValue(state, value[index], path);
        path.pop();
      }
    }
    hashCodeUnit(state, 0x5d);
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    hashCodeUnit(state, 0x7b);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index] ?? "";
      const entry = record[key];
      path.push(key);
      if (entry === undefined) throw new TypeError(`${formatCanonicalPath(path)} is undefined`);
      if (index > 0) hashCodeUnit(state, 0x2c);
      hashJsonString(state, key); hashCodeUnit(state, 0x3a);
      hashCanonicalValue(state, entry, path);
      path.pop();
    }
    hashCodeUnit(state, 0x7d);
    return;
  }
  throw new TypeError(`${formatCanonicalPath(path)} is not canonical JSON data`);
}

/**
 * Portable FNV-1a 64-bit hash over canonical UTF-16 code units.
 * This is a deterministic verification checksum, not a cryptographic signature.
 */
export function stableVerificationHash(value: unknown): string {
  const state: CanonicalHashState = { high: 0xcbf29ce4, low: 0x84222325 };
  hashCanonicalValue(state, value, []);
  return `${state.high.toString(16).padStart(8, "0")}${state.low.toString(16).padStart(8, "0")}`;
}

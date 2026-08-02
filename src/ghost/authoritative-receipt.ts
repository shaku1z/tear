/** A sealed live authoritative-state hash recorded beside a V3 keyframe. */
export interface GhostAuthoritativeReceiptV1 {
  readonly format: "tearghost-authoritative-receipt";
  readonly schemaVersion: 1;
  readonly kind: "authoritative-hash";
  readonly tick: number;
  readonly stateHash: string;
}

export function createGhostAuthoritativeReceipt(
  tick: number,
  stateHash: string,
): GhostAuthoritativeReceiptV1 {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("authoritative receipt tick must be non-negative");
  if (!/^[a-f0-9]{16}$/iu.test(stateHash)) {
    throw new TypeError("authoritative receipt requires a canonical 64-bit verification hash");
  }
  return Object.freeze({ format: "tearghost-authoritative-receipt", schemaVersion: 1, kind: "authoritative-hash", tick, stateHash });
}

/** Returns undefined for generic terminal results and untrusted/malformed bytes. */
export function readGhostAuthoritativeReceipt(value: unknown): GhostAuthoritativeReceiptV1 | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const candidate = value as Readonly<Record<string, unknown>>;
  if (candidate.format !== "tearghost-authoritative-receipt" || candidate.schemaVersion !== 1
    || candidate.kind !== "authoritative-hash" || typeof candidate.tick !== "number"
    || typeof candidate.stateHash !== "string") return undefined;
  try { return createGhostAuthoritativeReceipt(candidate.tick, candidate.stateHash); }
  catch { return undefined; }
}

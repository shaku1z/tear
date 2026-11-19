import { isRecord } from "./records";
import { SeededRandom } from "./random";

export type CosmeticEmissionRandomSnapshot = Readonly<{
  version: 1;
  algorithm: "mulberry32";
  seed: number;
  state: number;
  cursor: number;
  provenance: "run-start" | "legacy-derived";
}>;
export interface CosmeticEmissionRandom {
  readonly next: () => number;
  resetRun(seed: number | string): void;
  snapshot(): CosmeticEmissionRandomSnapshot;
  restore(value: CosmeticEmissionRandomSnapshot): void;
}

/** Strict data protocol; SeededRandom's permissive legacy restore is not the boundary. */
export function parseCosmeticEmissionRandomSnapshot(value: unknown): CosmeticEmissionRandomSnapshot {
  if (!isRecord(value)) throw new TypeError("cosmetic emission entropy must be data");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("cosmetic emission entropy must be plain data");
  const fields: Record<string, unknown> = {},
    keys = ["version", "algorithm", "seed", "state", "cursor", "provenance"];
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !keys.includes(key) || descriptor === undefined || !("value" in descriptor))
      throw new TypeError("cosmetic emission entropy contains unsupported fields or accessors");
    fields[key] = descriptor.value as unknown;
  }
  if (fields.version !== 1 || fields.algorithm !== "mulberry32")
    throw new RangeError("unsupported cosmetic emission entropy protocol");
  const integer = (key: string, maximum: number): number => {
    const entry = fields[key];
    if (typeof entry !== "number" || !Number.isSafeInteger(entry) || entry < 0 || entry > maximum)
      throw new RangeError(`invalid cosmetic emission entropy ${key}`);
    return entry;
  };
  if (fields.provenance !== "run-start" && fields.provenance !== "legacy-derived")
    throw new RangeError("invalid cosmetic emission entropy provenance");
  return Object.freeze({
    version: 1,
    algorithm: "mulberry32",
    seed: integer("seed", 0xffffffff),
    state: integer("state", 0xffffffff),
    cursor: integer("cursor", Number.MAX_SAFE_INTEGER),
    provenance: fields.provenance,
  });
}

function snapshot(
  random: SeededRandom,
  provenance: CosmeticEmissionRandomSnapshot["provenance"],
): CosmeticEmissionRandomSnapshot {
  const value = random.snapshot();
  return Object.freeze({
    version: 1,
    algorithm: "mulberry32",
    seed: random.initialSeed,
    state: value.state,
    cursor: value.cursor ?? 0,
    provenance,
  });
}

/** Independent presentation stream: never shares state with gameplay or ambient rendering. */
export function createCosmeticEmissionRandom(): CosmeticEmissionRandom {
  const random = new SeededRandom("tear.cosmetic-emission.v1:run:1");
  let provenance: CosmeticEmissionRandomSnapshot["provenance"] = "run-start";
  let cursor = 0;
  return Object.freeze({
    next: () => {
      if (cursor === Number.MAX_SAFE_INTEGER) throw new RangeError("cosmetic emission cursor exhausted");
      const value = random.next();
      cursor++;
      return value;
    },
    resetRun: (seed: number | string) => {
      if (typeof seed === "number" && (!Number.isSafeInteger(seed) || seed < 0))
        throw new RangeError("invalid cosmetic emission run seed");
      random.reseed(`tear.cosmetic-emission.v1:run:${String(seed)}`);
      provenance = "run-start";
      cursor = 0;
    },
    snapshot: () => snapshot(random, provenance),
    restore: (value: CosmeticEmissionRandomSnapshot) => {
      const prepared = parseCosmeticEmissionRandomSnapshot(value);
      random.restore(prepared);
      provenance = prepared.provenance;
      cursor = prepared.cursor;
    },
  });
}

/** No historical cursor can be recovered. This explicit new sequence uses only staged facts. */
export function legacyCosmeticEmissionSnapshot(runSeed: number, tick: number): CosmeticEmissionRandomSnapshot {
  if (!Number.isSafeInteger(runSeed) || runSeed < 0 || !Number.isSafeInteger(tick) || tick < 0)
    throw new RangeError("legacy cosmetic emission fallback requires staged run seed and tick");
  return snapshot(
    new SeededRandom(`tear.cosmetic-emission.v1:legacy:${String(runSeed)}:${String(tick)}`),
    "legacy-derived",
  );
}

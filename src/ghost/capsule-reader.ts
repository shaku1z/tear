import type { GhostLocalVault, GhostChunkKind, TearGhostManifest } from "./capsule-vault";
import { replayEngine } from "./replay-engine";

export interface GhostCapsuleEntry {
  readonly kind: GhostChunkKind;
  readonly tick: number;
  readonly value: unknown;
}

export interface GhostCapsuleTracks {
  readonly commands: readonly GhostCapsuleEntry[];
  readonly rng: readonly GhostCapsuleEntry[];
  readonly events: readonly GhostCapsuleEntry[];
  readonly results: readonly GhostCapsuleEntry[];
  readonly keyframes: readonly GhostCapsuleEntry[];
  readonly presentation: readonly GhostCapsuleEntry[];
}

/**
 * Not exported: only `GhostCapsuleReader.read` can name it, so only the reader can make a capsule the
 * replay code accepts. That is how the compiler proves every replay starts from a read, and a read
 * waits for the replay engine.
 */
const readByReader: unique symbol = Symbol("capsule read by GhostCapsuleReader");

/** What a capsule holds. Code that only reads its contents (a mapper, a check) can take this. */
export interface GhostCapsuleContents {
  readonly manifest: TearGhostManifest;
  readonly tracks: GhostCapsuleTracks;
  readonly maxTick: number;
}

/** A capsule `GhostCapsuleReader.read` returned; replay code that needs the engine takes only this. */
export interface GhostReadCapsule extends GhostCapsuleContents {
  readonly [readByReader]: true;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("capsule entry must be an object");
  return value as Readonly<Record<string, unknown>>;
}

/** Shared pure readability check; normal import discards decoded values after this check. */
export function validateGhostCapsuleEntries(
  chunk: unknown,
  kind: GhostChunkKind,
  fromTick: number,
  toTick: number,
  maxEntries = Number.MAX_SAFE_INTEGER,
): asserts chunk is readonly GhostCapsuleEntry[] {
  if (!Array.isArray(chunk)) throw new TypeError(`capsule ${kind} chunk must contain an entry array`);
  if (chunk.length > maxEntries) throw new RangeError("capsule exceeds decoded entry limit");
  for (const value of chunk) {
    const candidate = record(value);
    if (
      candidate.kind !== kind ||
      !Number.isSafeInteger(candidate.tick) ||
      (candidate.tick as number) < fromTick ||
      (candidate.tick as number) > toTick ||
      !("value" in candidate)
    ) {
      throw new TypeError(`capsule ${kind} chunk contains an invalid entry`);
    }
  }
}

function parseEntries(
  chunk: unknown,
  kind: GhostChunkKind,
  fromTick: number,
  toTick: number,
): readonly GhostCapsuleEntry[] {
  validateGhostCapsuleEntries(chunk, kind, fromTick, toTick);
  return Object.freeze(
    chunk.map((entry) => Object.freeze({ kind, tick: entry.tick, value: structuredClone(entry.value) })),
  );
}

/** Reads a capsule only through manifest indexes and verified Vault chunks. */
export class GhostCapsuleReader {
  readonly #vault: Pick<GhostLocalVault, "getManifest" | "readChunk">;

  constructor(vault: Pick<GhostLocalVault, "getManifest" | "readChunk">) {
    this.#vault = vault;
  }

  async read(id: string): Promise<GhostReadCapsule> {
    // Every replay, verification and import starts from a capsule read here, so this is the one
    // place that makes sure the replay engine is there; no replay code depends on timing.
    await replayEngine.ensure();
    const manifest = await this.#vault.getManifest(id);
    if (manifest === undefined) throw new RangeError(`capsule does not exist: ${id}`);
    const mutable: Record<GhostChunkKind, GhostCapsuleEntry[]> = {
      commands: [],
      rng: [],
      events: [],
      results: [],
      keyframes: [],
      presentation: [],
    };
    for (const index of [...manifest.chunks].sort((left, right) => left.sequence - right.sequence)) {
      const entries = parseEntries(await this.#vault.readChunk(index), index.kind, index.fromTick, index.toTick);
      mutable[index.kind].push(...entries);
    }
    const ordered = (kind: GhostChunkKind): readonly GhostCapsuleEntry[] =>
      Object.freeze([...mutable[kind]].sort((left, right) => left.tick - right.tick));
    const tracks: GhostCapsuleTracks = Object.freeze({
      commands: ordered("commands"),
      rng: ordered("rng"),
      events: ordered("events"),
      results: ordered("results"),
      keyframes: ordered("keyframes"),
      presentation: ordered("presentation"),
    });
    const maxTick = Math.max(0, ...manifest.chunks.map((chunk) => chunk.toTick));
    return Object.freeze({ [readByReader]: true as const, manifest, tracks, maxTick });
  }
}

import { stableVerificationHash } from "../replay/hash";
import { decodeGhostChunkPayload, encodeGhostChunkPayload, type GhostChunkEncoding } from "./capsule-codec";
import { GHOST_RECORDING_PROFILES, type GhostRecordingProfileId } from "./recording-profiles";

export const GHOST_VAULT_STORES = Object.freeze([
  "manifests", "chunks", "assets", "indexes", "uploadJobs", "analysis", "lineage", "settings", "journals", "quarantine", "libraries",
] as const);
export type GhostVaultStore = typeof GHOST_VAULT_STORES[number];
export const GHOST_VAULT_DATABASE_VERSION = 2;

export type GhostChunkKind = "commands" | "rng" | "events" | "results" | "keyframes" | "presentation";

export interface TearGhostChunkIndexEntry {
  readonly id: string;
  readonly kind: GhostChunkKind;
  readonly sequence: number;
  readonly fromTick: number;
  readonly toTick: number;
  readonly encoding: GhostChunkEncoding;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
  readonly checksum: string;
}

export interface TearGhostManifest {
  readonly format: "tearghost-capsule";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly status: "recording" | "complete" | "recovered" | "repaired" | "quarantined";
  readonly createdAt: string;
  /** Older schema-v1 capsules predate declared profile negotiation. */
  readonly recordingProfile: GhostRecordingProfileId | "legacy-unknown";
  /** Immutable run/build/configuration origin; absent only on older schema-v1 capsules. */
  readonly provenance?: Readonly<Record<string, unknown>>;
  readonly completedAt?: string;
  readonly chunks: readonly TearGhostChunkIndexEntry[];
  readonly rootIntegrity: string;
  readonly fidelity: Readonly<{
    presentation: "full" | "reduced" | "dropped";
    downgrades: readonly string[];
  }>;
  readonly lineage?: Readonly<{ parentId: string; relation: "repaired-from" }>;
}

export interface GhostEncodedChunk {
  readonly encoding: GhostChunkEncoding;
  readonly encoded: string;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
  readonly checksum: string;
  readonly thumbnail?: string;
}

export interface GhostEncoderWorkerPort {
  encode(payload: unknown, prepareThumbnail: boolean): Promise<GhostEncodedChunk>;
}

function isGhostChunkEncoding(value: unknown): value is GhostChunkEncoding {
  return value === "utf8-base64" || value === "utf8-base64-v1" || value === "gzip-base64-v1";
}

export function createInlineGhostEncoderWorker(): GhostEncoderWorkerPort {
  return {
    encode(payload: unknown, prepareThumbnail: boolean): Promise<GhostEncodedChunk> {
      const encoded = encodeGhostChunkPayload(payload);
      return Promise.resolve({
        encoding: encoded.encoding,
        encoded: encoded.encoded,
        compressedBytes: encoded.compressedBytes,
        uncompressedBytes: encoded.uncompressedBytes,
        checksum: stableVerificationHash(encoded.encoded),
        ...(prepareThumbnail ? { thumbnail: `data:application/x-tearghost-thumb,${stableVerificationHash(payload)}` } : {}),
      });
    },
  };
}

interface GhostEncoderWorkerResponse extends Partial<GhostEncodedChunk> {
  readonly id: number;
  readonly error?: string;
}

/**
 * Creates the production browser encoder transport. Vite emits the worker as
 * a separate module; callers keep the inline encoder only for non-browser
 * runtimes and focused deterministic tests.
 */
export function createBrowserGhostEncoderWorker(): GhostEncoderWorkerPort | undefined {
  if (typeof Worker === "undefined") return undefined;
  const worker = new Worker(new URL("./capsule-encoder-worker.ts", import.meta.url), { type: "module" });
  let nextId = 0;
  const pending = new Map<number, Readonly<{ resolve(value: GhostEncodedChunk): void; reject(reason: unknown): void }>>();
  const rejectPending = (reason: unknown): void => {
    for (const entry of pending.values()) entry.reject(reason);
    pending.clear();
  };
  worker.addEventListener("error", (event) => { rejectPending(event.error ?? new Error(event.message)); });
  worker.addEventListener("message", (event: MessageEvent<GhostEncoderWorkerResponse>) => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (entry === undefined) return;
    pending.delete(response.id);
    if (response.error !== undefined) { entry.reject(new Error(response.error)); return; }
    if (!isGhostChunkEncoding(response.encoding)
      || typeof response.encoded !== "string" || typeof response.compressedBytes !== "number"
      || typeof response.uncompressedBytes !== "number" || typeof response.checksum !== "string") {
      entry.reject(new TypeError("Ghost encoder worker returned an invalid response"));
      return;
    }
    entry.resolve(Object.freeze({
      encoding: response.encoding,
      encoded: response.encoded,
      compressedBytes: response.compressedBytes,
      uncompressedBytes: response.uncompressedBytes,
      checksum: response.checksum,
      ...(typeof response.thumbnail === "string" ? { thumbnail: response.thumbnail } : {}),
    }));
  });
  return Object.freeze({
    encode(payload: unknown, prepareThumbnail: boolean): Promise<GhostEncodedChunk> {
      return new Promise<GhostEncodedChunk>((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, Object.freeze({ resolve, reject }));
        try {
          worker.postMessage(Object.freeze({ id, payload, prepareThumbnail }));
        } catch (error) {
          pending.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
  });
}

export interface GhostVaultBackend {
  get(store: GhostVaultStore, key: string): Promise<string | undefined>;
  put(store: GhostVaultStore, key: string, value: string): Promise<void>;
  remove(store: GhostVaultStore, key: string): Promise<void>;
  keys(store: GhostVaultStore): Promise<readonly string[]>;
  commit(operations: readonly GhostVaultWrite[]): Promise<void>;
}

/** A single durable write used for journals, chunks, manifests, and indexes. */
export interface GhostVaultWrite {
  readonly store: GhostVaultStore;
  readonly key: string;
  readonly value?: string;
}

export function createMemoryGhostVaultBackend(
  stores = new Map<GhostVaultStore, Map<string, string>>(),
): GhostVaultBackend {
  const store = (name: GhostVaultStore): Map<string, string> => {
    let values = stores.get(name);
    if (values === undefined) {
      values = new Map();
      stores.set(name, values);
    }
    return values;
  };
  return {
    get(name, key) { return Promise.resolve(store(name).get(key)); },
    put(name, key, value) { store(name).set(key, value); return Promise.resolve(); },
    remove(name, key) { store(name).delete(key); return Promise.resolve(); },
    keys(name) { return Promise.resolve(Object.freeze([...store(name).keys()].sort())); },
    commit(operations) {
      const copies = new Map<GhostVaultStore, Map<string, string>>();
      const target = (name: GhostVaultStore): Map<string, string> => {
        let values = copies.get(name);
        if (values === undefined) { values = new Map(store(name)); copies.set(name, values); }
        return values;
      };
      for (const operation of operations) {
        if (operation.value === undefined) target(operation.store).delete(operation.key);
        else target(operation.store).set(operation.key, operation.value);
      }
      for (const [name, values] of copies) stores.set(name, values);
      return Promise.resolve();
    },
  };
}

export async function createIndexedDbGhostVaultBackend(
  factory: IDBFactory,
  databaseName = "tear-ghost-v3",
): Promise<GhostVaultBackend> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(databaseName, GHOST_VAULT_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      for (const store of GHOST_VAULT_STORES) {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
      }
    };
    request.onsuccess = () => { resolve(request.result); };
    request.onerror = () => { reject(request.error ?? new Error("IndexedDB open failed")); };
  });
  const transaction = <T>(
    store: GhostVaultStore,
    mode: IDBTransactionMode,
    execute: (objectStore: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => new Promise((resolve, reject) => {
    const tx = database.transaction(store, mode);
    const request = execute(tx.objectStore(store));
    request.onsuccess = () => { resolve(request.result); };
    request.onerror = () => { reject(request.error ?? new Error(`IndexedDB ${mode} failed`)); };
  });
  const backend: GhostVaultBackend = {
    async get(store, key) {
      const value = await transaction<unknown>(store, "readonly", (objectStore) => objectStore.get(key));
      return typeof value === "string" ? value : undefined;
    },
    async put(store, key, value) {
      await transaction<IDBValidKey>(store, "readwrite", (objectStore) => objectStore.put(value, key));
    },
    async remove(store, key) {
      await transaction<undefined>(store, "readwrite", (objectStore) => objectStore.delete(key));
    },
    async keys(store) {
      const keys = await transaction<IDBValidKey[]>(store, "readonly", (objectStore) => objectStore.getAllKeys());
      return Object.freeze(keys.map(String).sort());
    },
    commit(operations) {
      return new Promise<void>((resolve, reject) => {
        const stores = [...new Set(operations.map((operation) => operation.store))];
        if (stores.length === 0) { resolve(); return; }
        const tx = database.transaction(stores, "readwrite");
        for (const operation of operations) {
          const objectStore = tx.objectStore(operation.store);
          if (operation.value === undefined) objectStore.delete(operation.key);
          else objectStore.put(operation.value, operation.key);
        }
        tx.oncomplete = () => { resolve(); };
        tx.onerror = () => { reject(tx.error ?? new Error("IndexedDB recording commit failed")); };
        tx.onabort = () => { reject(tx.error ?? new Error("IndexedDB recording commit aborted")); };
      });
    },
  };
  return Object.freeze(backend);
}

export interface GhostVaultImportLimits {
  readonly maxEncodedBytes: number;
  readonly maxChunks: number;
  readonly maxChunkBytes: number;
  readonly maxExpansionRatio: number;
}

const DEFAULT_IMPORT_LIMITS: GhostVaultImportLimits = Object.freeze({
  maxEncodedBytes: 64 * 1024 * 1024,
  maxChunks: 20_000,
  maxChunkBytes: 8 * 1024 * 1024,
  maxExpansionRatio: 100,
});

export function ghostRootIntegrity(chunks: readonly TearGhostChunkIndexEntry[]): string {
  return stableVerificationHash(chunks.map((chunk) => ({
    id: chunk.id, checksum: chunk.checksum, kind: chunk.kind,
    sequence: chunk.sequence, fromTick: chunk.fromTick, toTick: chunk.toTick,
  })));
}

function dataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Imported provenance must remain recursive plain JSON data across app boundaries. */
function clonePlainCapsuleData(value: unknown, depth = 0): unknown {
  if (depth > 32) throw new RangeError("capsule plain data exceeds nesting limit");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "number") throw new TypeError("capsule plain data contains a non-finite number");
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => clonePlainCapsuleData(entry, depth + 1)));
  if (!dataRecord(value)) throw new TypeError("capsule plain data must be JSON-compatible");
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") throw new TypeError(`capsule plain data contains reserved key: ${key}`);
    copy[key] = clonePlainCapsuleData(entry, depth + 1);
  }
  return Object.freeze(copy);
}

function parseProvenance(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (!dataRecord(value)) throw new TypeError("capsule provenance must be a plain object");
  return clonePlainCapsuleData(value) as Readonly<Record<string, unknown>>;
}

function parseChunkIndex(value: unknown): TearGhostChunkIndexEntry {
  if (!dataRecord(value)
    || typeof value.id !== "string"
    || !["commands", "rng", "events", "results", "keyframes", "presentation"].includes(String(value.kind))
    || !Number.isSafeInteger(value.sequence)
    || !Number.isSafeInteger(value.fromTick)
    || !Number.isSafeInteger(value.toTick)
    || !isGhostChunkEncoding(value.encoding)
    || !Number.isSafeInteger(value.compressedBytes)
    || !Number.isSafeInteger(value.uncompressedBytes)
    || typeof value.checksum !== "string") {
    throw new TypeError("capsule contains an invalid chunk index");
  }
  return Object.freeze({
    id: value.id,
    kind: value.kind as GhostChunkKind,
    sequence: value.sequence as number,
    fromTick: value.fromTick as number,
    toTick: value.toTick as number,
    encoding: value.encoding,
    compressedBytes: value.compressedBytes as number,
    uncompressedBytes: value.uncompressedBytes as number,
    checksum: value.checksum,
  });
}

function parseCapsuleManifest(value: unknown): TearGhostManifest {
  if (!dataRecord(value)
    || value.format !== "tearghost-capsule"
    || value.schemaVersion !== 1
    || typeof value.id !== "string"
    || !["recording", "complete", "recovered", "repaired", "quarantined"].includes(String(value.status))
    || typeof value.createdAt !== "string"
    || !Array.isArray(value.chunks)
    || typeof value.rootIntegrity !== "string"
    || !dataRecord(value.fidelity)
    || !["full", "reduced", "dropped"].includes(String(value.fidelity.presentation))
    || !Array.isArray(value.fidelity.downgrades)
    || !value.fidelity.downgrades.every((entry) => typeof entry === "string")) {
    throw new TypeError("unsupported capsule manifest");
  }
  const provenance = parseProvenance(value.provenance);
  const chunks = Object.freeze(value.chunks.map(parseChunkIndex));
  return Object.freeze({
    format: "tearghost-capsule",
    schemaVersion: 1,
    id: value.id,
    status: value.status as TearGhostManifest["status"],
    createdAt: value.createdAt,
    recordingProfile: typeof value.recordingProfile === "string" && value.recordingProfile in GHOST_RECORDING_PROFILES
      ? value.recordingProfile as GhostRecordingProfileId
      : "legacy-unknown",
    ...(provenance === undefined ? {} : { provenance }),
    ...(typeof value.completedAt === "string" ? { completedAt: value.completedAt } : {}),
    chunks,
    rootIntegrity: value.rootIntegrity,
    fidelity: Object.freeze({
      presentation: value.fidelity.presentation as TearGhostManifest["fidelity"]["presentation"],
      downgrades: Object.freeze(value.fidelity.downgrades),
    }),
    ...(dataRecord(value.lineage) && typeof value.lineage.parentId === "string"
      && value.lineage.relation === "repaired-from"
      ? { lineage: Object.freeze({ parentId: value.lineage.parentId, relation: "repaired-from" as const }) }
      : {}),
  });
}

export class GhostLocalVault {
  readonly #backend: GhostVaultBackend;

  constructor(backend: GhostVaultBackend) {
    this.#backend = backend;
  }

  backend(): GhostVaultBackend { return this.#backend; }

  #manifestWrites(manifest: TearGhostManifest): readonly GhostVaultWrite[] {
    return Object.freeze([
      { store: "manifests", key: manifest.id, value: JSON.stringify(manifest) },
      { store: "indexes", key: `manifest:${manifest.id}`, value: JSON.stringify({
        status: manifest.status, createdAt: manifest.createdAt, chunks: manifest.chunks.length,
      }) },
    ]);
  }

  async putManifest(manifest: TearGhostManifest): Promise<void> {
    await this.#backend.commit(this.#manifestWrites(manifest));
  }

  /**
   * Atomically records a repair child, its immutable parent link, and forensic
   * copies of the bad source bytes.  The parent manifest and source chunks are
   * deliberately not changed: a repair is a new custody record, never a
   * destructive "fix" of the original evidence.
   */
  async createRepairChild(
    parentId: string,
    child: TearGhostManifest,
    corruptChunkIds: readonly string[],
    repairedAt: string,
  ): Promise<void> {
    if (await this.getManifest(parentId) === undefined) throw new RangeError(`manifest does not exist: ${parentId}`);
    if (await this.getManifest(child.id) !== undefined) throw new RangeError(`repair child already exists: ${child.id}`);
    if (child.lineage?.parentId !== parentId) {
      throw new TypeError("repair child must declare its repaired-from parent");
    }
    const quarantined = await Promise.all(corruptChunkIds.map(async (chunkId) => Object.freeze({
      chunkId,
      encoded: await this.#backend.get("chunks", chunkId),
    })));
    await this.#backend.commit([
      ...this.#manifestWrites(child),
      { store: "lineage", key: `repair:${child.id}`, value: JSON.stringify({
        format: "tearghost-lineage", schemaVersion: 1, id: `repair:${child.id}`,
        parentId, childId: child.id, relation: "repair", createdAt: repairedAt,
      }) },
      ...quarantined.flatMap(({ chunkId, encoded }) => encoded === undefined ? [] : [{
        store: "quarantine" as const, key: `repair:${child.id}:${chunkId}`, value: JSON.stringify({
          parentId, childId: child.id, chunkId, encoded, quarantinedAt: repairedAt,
        }),
      }]),
    ]);
  }

  async getManifest(id: string): Promise<TearGhostManifest | undefined> {
    const value = await this.#backend.get("manifests", id);
    return value === undefined ? undefined : parseCapsuleManifest(JSON.parse(value) as unknown);
  }

  async putChunk(sessionId: string, entry: TearGhostChunkIndexEntry, encoded: string): Promise<void> {
    if (stableVerificationHash(encoded) !== entry.checksum) throw new TypeError(`chunk checksum mismatch before commit: ${entry.id}`);
    await this.#backend.commit([
      { store: "chunks", key: entry.id, value: encoded },
      { store: "journals", key: sessionId, value: JSON.stringify({ sessionId, lastChunkId: entry.id, committedSequence: entry.sequence }) },
    ]);
  }

  /** Atomically exposes one newly encoded recording chunk and its recovery state. */
  async commitRecordingChunk(manifest: TearGhostManifest, entry: TearGhostChunkIndexEntry, encoded: string): Promise<void> {
    if (stableVerificationHash(encoded) !== entry.checksum) throw new TypeError(`chunk checksum mismatch before commit: ${entry.id}`);
    if (!manifest.chunks.some((chunk) => chunk.id === entry.id && chunk.checksum === entry.checksum)) {
      throw new TypeError(`recording manifest does not include committed chunk: ${entry.id}`);
    }
    await this.#backend.commit([
      { store: "chunks", key: entry.id, value: encoded },
      { store: "journals", key: manifest.id, value: JSON.stringify({
        sessionId: manifest.id, lastChunkId: entry.id, committedSequence: entry.sequence,
      }) },
      ...this.#manifestWrites(manifest),
    ]);
  }

  /** Starts a recoverable session without exposing a manifest with no journal. */
  async beginSession(manifest: TearGhostManifest): Promise<void> {
    if (manifest.status !== "recording") throw new TypeError("only a recording manifest can begin a session");
    await this.#backend.commit([
      ...this.#manifestWrites(manifest),
      { store: "journals", key: manifest.id, value: JSON.stringify({ sessionId: manifest.id, committedSequence: -1 }) },
    ]);
  }

  async readChunk(entry: TearGhostChunkIndexEntry): Promise<unknown> {
    const encoded = await this.#backend.get("chunks", entry.id);
    if (encoded === undefined) throw new RangeError(`chunk is missing: ${entry.id}`);
    if (stableVerificationHash(encoded) !== entry.checksum) throw new TypeError(`chunk checksum mismatch: ${entry.id}`);
    return decodeGhostChunkPayload(entry.encoding, encoded, entry.uncompressedBytes);
  }

  async completeSession(manifest: TearGhostManifest): Promise<void> {
    await this.#backend.commit([
      ...this.#manifestWrites(manifest),
      { store: "journals", key: manifest.id },
    ]);
  }

  async recoverIncompleteSessions(): Promise<readonly TearGhostManifest[]> {
    const recovered: TearGhostManifest[] = [];
    for (const id of await this.#backend.keys("journals")) {
      const manifest = await this.getManifest(id);
      if (manifest === undefined) continue;
      let status: "recovered" | "quarantined" = "recovered";
      let reason: string | undefined;
      try {
        if (ghostRootIntegrity(manifest.chunks) !== manifest.rootIntegrity) {
          throw new TypeError("recording manifest root integrity mismatch");
        }
        for (const entry of manifest.chunks) await this.readChunk(entry);
      } catch (error) {
        status = "quarantined";
        reason = error instanceof Error ? error.message : String(error);
      }
      const next = Object.freeze({ ...manifest, status });
      await this.putManifest(next);
      if (reason !== undefined) {
        await this.#backend.put("quarantine", `recovery:${id}`, JSON.stringify({
          capsuleId: id,
          reason,
          recoveredAt: new Date().toISOString(),
        }));
      }
      // A recovery attempt has reached a terminal durable state. Keeping the
      // journal would repeatedly mutate the same manifest on every startup.
      await this.#backend.remove("journals", id);
      recovered.push(next);
    }
    return Object.freeze(recovered);
  }

  async exportCapsule(id: string): Promise<string> {
    const manifest = await this.getManifest(id);
    if (manifest === undefined) throw new RangeError(`manifest does not exist: ${id}`);
    const chunks: Record<string, string> = {};
    for (const entry of manifest.chunks) {
      const encoded = await this.#backend.get("chunks", entry.id);
      if (encoded !== undefined) chunks[entry.id] = encoded;
    }
    return JSON.stringify({ manifest, chunks });
  }

  async importCapsule(
    encodedCapsule: string,
    limits: GhostVaultImportLimits = DEFAULT_IMPORT_LIMITS,
  ): Promise<TearGhostManifest> {
    const bytes = new TextEncoder().encode(encodedCapsule).byteLength;
    if (bytes > limits.maxEncodedBytes) throw new RangeError("capsule exceeds encoded byte limit");
    const parsed: unknown = JSON.parse(encodedCapsule);
    if (typeof parsed !== "object" || parsed === null || !("manifest" in parsed) || !("chunks" in parsed)) {
      throw new TypeError("capsule must contain manifest and chunks");
    }
    const root = parsed as Record<string, unknown>;
    const manifest = parseCapsuleManifest(root.manifest);
    if (!dataRecord(root.chunks)) throw new TypeError("capsule chunks must be an object");
    const chunks = root.chunks;
    if (manifest.chunks.length > limits.maxChunks) throw new RangeError("capsule exceeds chunk-count limit");
    if (ghostRootIntegrity(manifest.chunks) !== manifest.rootIntegrity) throw new TypeError("capsule root integrity mismatch");
    if (await this.getManifest(manifest.id) !== undefined) throw new RangeError(`capsule already exists: ${manifest.id}`);
    const writes: GhostVaultWrite[] = [];
    for (const entry of manifest.chunks) {
      const encoded = chunks[entry.id];
      if (typeof encoded !== "string") throw new TypeError(`capsule chunk is missing: ${entry.id}`);
      if (entry.compressedBytes > limits.maxChunkBytes || entry.uncompressedBytes > limits.maxChunkBytes * limits.maxExpansionRatio) {
        throw new RangeError(`capsule chunk exceeds expansion limits: ${entry.id}`);
      }
      const ratio = entry.uncompressedBytes / Math.max(1, entry.compressedBytes);
      if (ratio > limits.maxExpansionRatio) throw new RangeError(`capsule chunk expansion ratio is unsafe: ${entry.id}`);
      if (stableVerificationHash(encoded) !== entry.checksum) throw new TypeError(`capsule chunk checksum mismatch: ${entry.id}`);
      // Decode before committing untrusted bytes. The declared uncompressed
      // size is also the hard streaming ceiling, so dishonest metadata cannot
      // turn a small compressed import into an unbounded allocation.
      await decodeGhostChunkPayload(entry.encoding, encoded, entry.uncompressedBytes);
      const existing = await this.#backend.get("chunks", entry.id);
      if (existing !== undefined && existing !== encoded) {
        throw new RangeError(`capsule chunk id conflicts with stored evidence: ${entry.id}`);
      }
      if (existing === undefined) writes.push({ store: "chunks", key: entry.id, value: encoded });
    }
    await this.#backend.commit([...writes, ...this.#manifestWrites(manifest)]);
    return manifest;
  }

  async enforceQuota(maxBytes: number, retention: Readonly<Record<string, "pinned" | "standard" | "temporary">>): Promise<readonly string[]> {
    const manifests = await this.#backend.keys("manifests");
    const candidates: Readonly<{ id: string; bytes: number; tier: string; createdAt: string }>[] = [];
    let total = 0;
    for (const id of manifests) {
      const manifest = await this.getManifest(id);
      if (manifest === undefined) continue;
      const bytes = manifest.chunks.reduce((sum, chunk) => sum + chunk.compressedBytes, 0);
      total += bytes;
      candidates.push({ id, bytes, tier: retention[id] ?? "standard", createdAt: manifest.createdAt });
    }
    const removed: string[] = [];
    for (const candidate of [...candidates].sort((left, right) =>
      (left.tier === "temporary" ? 0 : left.tier === "standard" ? 1 : 2)
      - (right.tier === "temporary" ? 0 : right.tier === "standard" ? 1 : 2)
      || left.createdAt.localeCompare(right.createdAt))) {
      if (total <= maxBytes) break;
      if (candidate.tier === "pinned") continue;
      const manifest = await this.getManifest(candidate.id);
      for (const chunk of manifest?.chunks ?? []) await this.#backend.remove("chunks", chunk.id);
      await this.#backend.remove("manifests", candidate.id);
      await this.#backend.remove("indexes", `manifest:${candidate.id}`);
      total -= candidate.bytes;
      removed.push(candidate.id);
    }
    return Object.freeze(removed);
  }
}

export interface GhostRecorderEntry {
  readonly kind: GhostChunkKind;
  readonly tick: number;
  readonly value: unknown;
}

export interface GhostRecorderOptions {
  readonly sessionId: string;
  readonly createdAt: string;
  readonly chunkEntries: number;
  readonly maxPendingWrites: number;
  readonly vault: GhostLocalVault;
  readonly worker?: GhostEncoderWorkerPort;
  readonly recordingProfile?: GhostRecordingProfileId;
  readonly provenance?: Readonly<Record<string, unknown>>;
}

export class GhostStreamingRecorder {
  readonly #options: GhostRecorderOptions;
  readonly #worker: GhostEncoderWorkerPort;
  readonly #buffer: GhostRecorderEntry[] = [];
  readonly #chunks: TearGhostChunkIndexEntry[] = [];
  readonly #downgrades: string[] = [];
  #pendingWrites = 0;
  #maxBufferedEntries = 0;
  #presentation: "full" | "reduced" | "dropped" = "full";

  constructor(options: GhostRecorderOptions) {
    if (!Number.isSafeInteger(options.chunkEntries) || options.chunkEntries < 1) throw new RangeError("chunkEntries must be positive");
    this.#options = options;
    this.#worker = options.worker ?? createInlineGhostEncoderWorker();
  }

  get maxBufferedEntries(): number { return this.#maxBufferedEntries; }
  get pendingWrites(): number { return this.#pendingWrites; }

  async start(): Promise<void> {
    const manifest = this.#manifest("recording");
    await this.#options.vault.beginSession(manifest);
  }

  async append(entry: GhostRecorderEntry): Promise<void> {
    if (this.#pendingWrites >= this.#options.maxPendingWrites && entry.kind === "presentation") {
      this.#presentation = "dropped";
      if (!this.#downgrades.includes("presentation dropped under encoder backpressure")) {
        this.#downgrades.push("presentation dropped under encoder backpressure");
      }
      return;
    }
    // Each chunk is one named replay track. Besides making random access
    // explicit, this prevents a terminal result or keyframe from being hidden
    // inside an undifferentiated events chunk.
    if (this.#buffer.length > 0 && this.#buffer[0]?.kind !== entry.kind) await this.flush();
    this.#buffer.push(Object.freeze(structuredClone(entry)));
    this.#maxBufferedEntries = Math.max(this.#maxBufferedEntries, this.#buffer.length);
    if (this.#buffer.length >= this.#options.chunkEntries) await this.flush();
  }

  async flush(): Promise<void> {
    if (this.#buffer.length === 0) return;
    const entries = this.#buffer.splice(0, this.#options.chunkEntries);
    const sequence = this.#chunks.length;
    this.#pendingWrites += 1;
    try {
      const encoded = await this.#worker.encode(entries, entries.some((entry) => entry.kind === "presentation"));
      const kinds = new Set(entries.map((entry) => entry.kind));
      const kind = kinds.size === 1 ? entries[0]?.kind ?? "events" : "events";
      const index: TearGhostChunkIndexEntry = Object.freeze({
        id: `${this.#options.sessionId}:chunk:${String(sequence)}`,
        kind,
        sequence,
        fromTick: Math.min(...entries.map((entry) => entry.tick)),
        toTick: Math.max(...entries.map((entry) => entry.tick)),
        encoding: encoded.encoding,
        compressedBytes: encoded.compressedBytes,
        uncompressedBytes: encoded.uncompressedBytes,
        checksum: encoded.checksum,
      });
      const nextChunks = Object.freeze([...this.#chunks, index]);
      await this.#options.vault.commitRecordingChunk(this.#manifest("recording", undefined, nextChunks), index, encoded.encoded);
      this.#chunks.push(index);
      if (encoded.thumbnail !== undefined) {
        await this.#options.vault.backend().put("assets", `${this.#options.sessionId}:thumbnail:${String(sequence)}`, encoded.thumbnail);
      }
    } finally {
      this.#pendingWrites -= 1;
    }
    if (this.#buffer.length > 0) await this.flush();
  }

  async finalize(completedAt: string): Promise<TearGhostManifest> {
    await this.flush();
    const manifest = this.#manifest("complete", completedAt);
    await this.#options.vault.completeSession(manifest);
    return manifest;
  }

  #manifest(status: TearGhostManifest["status"], completedAt?: string,
    chunkOverride?: readonly TearGhostChunkIndexEntry[]): TearGhostManifest {
    const chunks = Object.freeze([...(chunkOverride ?? this.#chunks)]);
    return Object.freeze({
      format: "tearghost-capsule",
      schemaVersion: 1,
      id: this.#options.sessionId,
      status,
      createdAt: this.#options.createdAt,
      recordingProfile: this.#options.recordingProfile ?? "forensic-qa",
      ...(this.#options.provenance === undefined
        ? {}
        : { provenance: Object.freeze(structuredClone(this.#options.provenance)) }),
      ...(completedAt === undefined ? {} : { completedAt }),
      chunks,
      rootIntegrity: ghostRootIntegrity(chunks),
      fidelity: Object.freeze({
        presentation: this.#presentation,
        downgrades: Object.freeze([...this.#downgrades]),
      }),
    });
  }
}

export function capsuleDebugJson(manifest: TearGhostManifest): string {
  return JSON.stringify(manifest, null, 2);
}

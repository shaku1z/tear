import { stableVerificationHash } from "../replay/hash";

export const GHOST_VAULT_STORES = Object.freeze([
  "manifests", "chunks", "assets", "indexes", "uploadJobs", "analysis", "lineage", "settings", "journals", "quarantine",
] as const);
export type GhostVaultStore = typeof GHOST_VAULT_STORES[number];

export type GhostChunkKind = "commands" | "rng" | "events" | "results" | "keyframes" | "presentation";

export interface TearGhostChunkIndexEntry {
  readonly id: string;
  readonly kind: GhostChunkKind;
  readonly sequence: number;
  readonly fromTick: number;
  readonly toTick: number;
  readonly encoding: "json";
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
  readonly encoded: string;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
  readonly checksum: string;
  readonly thumbnail?: string;
}

export interface GhostEncoderWorkerPort {
  encode(payload: unknown, prepareThumbnail: boolean): Promise<GhostEncodedChunk>;
}

export function createInlineGhostEncoderWorker(): GhostEncoderWorkerPort {
  return {
    encode(payload, prepareThumbnail) {
      const encoded = JSON.stringify(payload);
      const bytes = new TextEncoder().encode(encoded).byteLength;
      return Promise.resolve({
        encoded,
        compressedBytes: bytes,
        uncompressedBytes: bytes,
        checksum: stableVerificationHash(encoded),
        ...(prepareThumbnail ? { thumbnail: `data:application/x-tearghost-thumb,${stableVerificationHash(payload)}` } : {}),
      });
    },
  };
}

export interface GhostVaultBackend {
  get(store: GhostVaultStore, key: string): Promise<string | undefined>;
  put(store: GhostVaultStore, key: string, value: string): Promise<void>;
  remove(store: GhostVaultStore, key: string): Promise<void>;
  keys(store: GhostVaultStore): Promise<readonly string[]>;
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
  };
}

export async function createIndexedDbGhostVaultBackend(
  factory: IDBFactory,
  databaseName = "tear-ghost-v3",
): Promise<GhostVaultBackend> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(databaseName, 1);
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

function parseChunkIndex(value: unknown): TearGhostChunkIndexEntry {
  if (!dataRecord(value)
    || typeof value.id !== "string"
    || !["commands", "rng", "events", "results", "keyframes", "presentation"].includes(String(value.kind))
    || !Number.isSafeInteger(value.sequence)
    || !Number.isSafeInteger(value.fromTick)
    || !Number.isSafeInteger(value.toTick)
    || value.encoding !== "json"
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
    encoding: "json",
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
  const chunks = Object.freeze(value.chunks.map(parseChunkIndex));
  return Object.freeze({
    format: "tearghost-capsule",
    schemaVersion: 1,
    id: value.id,
    status: value.status as TearGhostManifest["status"],
    createdAt: value.createdAt,
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

  async putManifest(manifest: TearGhostManifest): Promise<void> {
    await this.#backend.put("manifests", manifest.id, JSON.stringify(manifest));
    await this.#backend.put("indexes", `manifest:${manifest.id}`, JSON.stringify({
      status: manifest.status, createdAt: manifest.createdAt, chunks: manifest.chunks.length,
    }));
  }

  async getManifest(id: string): Promise<TearGhostManifest | undefined> {
    const value = await this.#backend.get("manifests", id);
    return value === undefined ? undefined : JSON.parse(value) as TearGhostManifest;
  }

  async putChunk(sessionId: string, entry: TearGhostChunkIndexEntry, encoded: string): Promise<void> {
    if (stableVerificationHash(encoded) !== entry.checksum) throw new TypeError(`chunk checksum mismatch before commit: ${entry.id}`);
    await this.#backend.put("chunks", entry.id, encoded);
    await this.#backend.put("journals", sessionId, JSON.stringify({ sessionId, lastChunkId: entry.id, committedSequence: entry.sequence }));
  }

  async readChunk(entry: TearGhostChunkIndexEntry): Promise<unknown> {
    const encoded = await this.#backend.get("chunks", entry.id);
    if (encoded === undefined) throw new RangeError(`chunk is missing: ${entry.id}`);
    if (stableVerificationHash(encoded) !== entry.checksum) throw new TypeError(`chunk checksum mismatch: ${entry.id}`);
    return JSON.parse(encoded) as unknown;
  }

  async completeSession(manifest: TearGhostManifest): Promise<void> {
    await this.putManifest(manifest);
    await this.#backend.remove("journals", manifest.id);
  }

  async recoverIncompleteSessions(): Promise<readonly TearGhostManifest[]> {
    const recovered: TearGhostManifest[] = [];
    for (const id of await this.#backend.keys("journals")) {
      const manifest = await this.getManifest(id);
      if (manifest === undefined) continue;
      const next = Object.freeze({ ...manifest, status: "recovered" as const });
      await this.putManifest(next);
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
    for (const entry of manifest.chunks) {
      const encoded = chunks[entry.id];
      if (typeof encoded !== "string") throw new TypeError(`capsule chunk is missing: ${entry.id}`);
      if (entry.compressedBytes > limits.maxChunkBytes || entry.uncompressedBytes > limits.maxChunkBytes * limits.maxExpansionRatio) {
        throw new RangeError(`capsule chunk exceeds expansion limits: ${entry.id}`);
      }
      const ratio = entry.uncompressedBytes / Math.max(1, entry.compressedBytes);
      if (ratio > limits.maxExpansionRatio) throw new RangeError(`capsule chunk expansion ratio is unsafe: ${entry.id}`);
      if (stableVerificationHash(encoded) !== entry.checksum) throw new TypeError(`capsule chunk checksum mismatch: ${entry.id}`);
    }
    for (const entry of manifest.chunks) {
      const encoded = chunks[entry.id];
      if (typeof encoded !== "string") throw new TypeError(`capsule chunk is missing: ${entry.id}`);
      await this.#backend.put("chunks", entry.id, encoded);
    }
    await this.putManifest(manifest);
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
    await this.#options.vault.putManifest(manifest);
    await this.#options.vault.backend().put("journals", this.#options.sessionId, JSON.stringify({
      sessionId: this.#options.sessionId, committedSequence: -1,
    }));
  }

  async append(entry: GhostRecorderEntry): Promise<void> {
    if (this.#pendingWrites >= this.#options.maxPendingWrites && entry.kind === "presentation") {
      this.#presentation = "dropped";
      if (!this.#downgrades.includes("presentation dropped under encoder backpressure")) {
        this.#downgrades.push("presentation dropped under encoder backpressure");
      }
      return;
    }
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
        encoding: "json",
        compressedBytes: encoded.compressedBytes,
        uncompressedBytes: encoded.uncompressedBytes,
        checksum: encoded.checksum,
      });
      await this.#options.vault.putChunk(this.#options.sessionId, index, encoded.encoded);
      this.#chunks.push(index);
      if (encoded.thumbnail !== undefined) {
        await this.#options.vault.backend().put("assets", `${this.#options.sessionId}:thumbnail:${String(sequence)}`, encoded.thumbnail);
      }
      await this.#options.vault.putManifest(this.#manifest("recording"));
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

  #manifest(status: TearGhostManifest["status"], completedAt?: string): TearGhostManifest {
    const chunks = Object.freeze([...this.#chunks]);
    return Object.freeze({
      format: "tearghost-capsule",
      schemaVersion: 1,
      id: this.#options.sessionId,
      status,
      createdAt: this.#options.createdAt,
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

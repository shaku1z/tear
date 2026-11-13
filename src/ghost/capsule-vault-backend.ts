import { stableVerificationHash } from "../replay/hash";
import { encodeGhostChunkPayload, type GhostChunkEncoding } from "./capsule-codec";

export type GhostVaultGuard = Readonly<{ store: GhostVaultWrite["store"]; key: string; expected?: string }>;

export const GHOST_VAULT_STORES = Object.freeze([
  "manifests",
  "chunks",
  "assets",
  "indexes",
  "uploadJobs",
  "analysis",
  "lineage",
  "settings",
  "journals",
  "quarantine",
  "libraries",
] as const);
export type GhostVaultStore = (typeof GHOST_VAULT_STORES)[number];
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
        ...(prepareThumbnail
          ? { thumbnail: `data:application/x-tearghost-thumb,${stableVerificationHash(payload)}` }
          : {}),
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
  const pending = new Map<
    number,
    Readonly<{ resolve(value: GhostEncodedChunk): void; reject(reason: unknown): void }>
  >();
  const rejectPending = (reason: unknown): void => {
    for (const entry of pending.values()) entry.reject(reason);
    pending.clear();
  };
  worker.addEventListener("error", (event) => {
    rejectPending(event.error ?? new Error(event.message));
  });
  worker.addEventListener("message", (event: MessageEvent<GhostEncoderWorkerResponse>) => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (entry === undefined) return;
    pending.delete(response.id);
    if (response.error !== undefined) {
      entry.reject(new Error(response.error));
      return;
    }
    if (
      !isGhostChunkEncoding(response.encoding) ||
      typeof response.encoded !== "string" ||
      typeof response.compressedBytes !== "number" ||
      typeof response.uncompressedBytes !== "number" ||
      typeof response.checksum !== "string"
    ) {
      entry.reject(new TypeError("Ghost encoder worker returned an invalid response"));
      return;
    }
    entry.resolve(
      Object.freeze({
        encoding: response.encoding,
        encoded: response.encoded,
        compressedBytes: response.compressedBytes,
        uncompressedBytes: response.uncompressedBytes,
        checksum: response.checksum,
        ...(typeof response.thumbnail === "string" ? { thumbnail: response.thumbnail } : {}),
      }),
    );
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
  /** Generic optimistic concurrency guard for non-recording durable workflows. */
  commitIfMatches(guards: readonly GhostVaultGuard[], operations: readonly GhostVaultWrite[]): Promise<void>;
  /**
   * Commits a recording mutation while the journal and optional additional
   * optimistic guards still match.  The optional guards let manifest
   * creation/update participate in the same transaction as chunk writes.
   */
  commitWhileJournalMatches(
    sessionId: string,
    leaseId: string,
    operations: readonly GhostVaultWrite[],
    guards?: readonly GhostVaultGuard[],
  ): Promise<void>;
}

/** A single durable write used for journals, chunks, manifests, and indexes. */
export interface GhostVaultWrite {
  readonly store: GhostVaultStore;
  readonly key: string;
  readonly value?: string;
}

function dataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function ghostVaultJournalLease(value: string | undefined): string | undefined {
  try {
    const parsed: unknown = value === undefined ? undefined : JSON.parse(value);
    return dataRecord(parsed) && typeof parsed.leaseId === "string" ? parsed.leaseId : undefined;
  } catch {
    return undefined;
  }
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
  const commit = (operations: readonly GhostVaultWrite[]): Promise<void> => {
    const copies = new Map<GhostVaultStore, Map<string, string>>();
    const target = (name: GhostVaultStore): Map<string, string> => {
      let values = copies.get(name);
      if (values === undefined) {
        values = new Map(store(name));
        copies.set(name, values);
      }
      return values;
    };
    for (const operation of operations) {
      if (operation.value === undefined) target(operation.store).delete(operation.key);
      else target(operation.store).set(operation.key, operation.value);
    }
    for (const [name, values] of copies) stores.set(name, values);
    return Promise.resolve();
  };
  return Object.freeze({
    get(name, key) {
      return Promise.resolve(store(name).get(key));
    },
    put(name, key, value) {
      store(name).set(key, value);
      return Promise.resolve();
    },
    remove(name, key) {
      store(name).delete(key);
      return Promise.resolve();
    },
    keys(name) {
      return Promise.resolve(Object.freeze([...store(name).keys()].sort()));
    },
    commit,
    commitIfMatches(guards, operations) {
      if (guards.some((guard) => store(guard.store).get(guard.key) !== guard.expected))
        return Promise.reject(new Error("Vault conditional write no longer matches"));
      return commit(operations);
    },
    commitWhileJournalMatches(sessionId, leaseId, operations, guards = []) {
      if (ghostVaultJournalLease(store("journals").get(sessionId)) !== leaseId) {
        return Promise.reject(new Error(`recording journal is no longer active: ${sessionId}`));
      }
      if (guards.some((guard) => store(guard.store).get(guard.key) !== guard.expected)) {
        return Promise.reject(new Error("Vault conditional write no longer matches"));
      }
      return commit(operations);
    },
  } satisfies GhostVaultBackend);
}

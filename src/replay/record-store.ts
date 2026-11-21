/**
 * The saved replay records on this device: the `tear-replays` IndexedDB database (version 1, one
 * `records` store), opened through an injected `IDBFactory`. Replay PR 6 changes the encoding inside
 * this database; it needs neither a second database nor a migration out.
 *
 * - **Caps:** the newest `REPLAY_RECORD_LIMITS.count` records, up to `REPLAY_RECORD_LIMITS.bytes` in all.
 *   A write drops the oldest records until the new one fits; a record bigger than the byte cap on its
 *   own is not stored.
 * - **Never fails a run:** every operation resolves to a plain result. A quota error, a blocked open or
 *   any IndexedDB error is a `failed` result with its reason, never a throw.
 * - **Upgrades:** an open blocked by another tab resolves as `failed` ("blocked"), and an open database
 *   closes on `versionchange`, so a later build's upgrade is never blocked by this one.
 *
 * What clears it: the browser's site data clearing. Nothing in the game deletes it before replay PR 8.
 */
import { isObject, isRecord } from "../domain/records";
import { readReplayRecord, type ReplayReadResult, type ReplayRecord } from "./record";

export const REPLAY_RECORD_DATABASE = "tear-replays";
export const REPLAY_RECORD_DATABASE_VERSION = 1;
const STORE = "records";
const INDEX_KEY = "index";

/**
 * 20 records and 25 MB. A live minute records about 356 KB as JSON (the 5b-3b browser legs), so the
 * byte cap holds about 70 minutes of play: twenty runs of three or four minutes, or a few long ones.
 * 25 MB is a small share of the origin quota browsers grant (Chrome gives an origin a share of free
 * disk measured in GB; Safari asks past 1 GB), and leaves room for the player's save and the V3 vault
 * until PR 8 removes it.
 */
export const REPLAY_RECORD_LIMITS = Object.freeze({ count: 20, bytes: 25 * 1024 * 1024 });

/** One stored record, as the store's index lists it. */
export interface ReplayRecordEntry {
  readonly key: string;
  readonly bytes: number;
  readonly recordedAt: string;
}

export type ReplayRecordFailure = "blocked" | "quota" | "unavailable" | "error";

export type ReplayRecordPut =
  | Readonly<{ status: "stored"; key: string; evicted: readonly string[] }>
  | Readonly<{ status: "oversized"; bytes: number }>
  | Readonly<{ status: "failed"; reason: ReplayRecordFailure }>;

export interface ReplayRecordStore {
  readonly put: (record: ReplayRecord) => Promise<ReplayRecordPut>;
  readonly entries: () => Promise<readonly ReplayRecordEntry[] | Readonly<{ failed: ReplayRecordFailure }>>;
  /** One stored record, read as untrusted data; null when the key holds none. */
  readonly read: (key: string) => Promise<ReplayReadResult | null | Readonly<{ failed: ReplayRecordFailure }>>;
  readonly close: () => void;
}

export type ReplayRecordWritePlan =
  Readonly<{ store: true; evict: readonly string[]; index: readonly ReplayRecordEntry[] }> | Readonly<{ store: false }>;

/** Which records a write keeps: the index is oldest first; the new entry goes last. */
export function planReplayRecordWrite(
  index: readonly ReplayRecordEntry[],
  entry: ReplayRecordEntry,
  limits: Readonly<{ count: number; bytes: number }> = REPLAY_RECORD_LIMITS,
): ReplayRecordWritePlan {
  if (entry.bytes > limits.bytes) return { store: false };
  const kept = [...index.filter((existing) => existing.key !== entry.key), entry];
  const evict: string[] = [];
  let total = kept.reduce((sum, existing) => sum + existing.bytes, 0);
  while (kept.length > limits.count || total > limits.bytes) {
    const oldest = kept.shift();
    if (oldest === undefined) break;
    evict.push(oldest.key);
    total -= oldest.bytes;
  }
  return { store: true, evict, index: kept };
}

/** The key a record is stored under: its recording time and seed, so keys sort oldest first. */
export function replayRecordKey(record: ReplayRecord): string {
  return `record:${record.look.recordedAt}:${String(record.run.seed)}`;
}

function failureOf(error: unknown): ReplayRecordFailure {
  return isObject(error) && (error as { name?: unknown }).name === "QuotaExceededError" ? "quota" : "error";
}

function readIndex(value: unknown): readonly ReplayRecordEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ReplayRecordEntry =>
      isRecord(entry) &&
      typeof entry.key === "string" &&
      Number.isSafeInteger(entry.bytes) &&
      typeof entry.recordedAt === "string",
  );
}

/** Opens the store; `failed` when IndexedDB is missing, the open is blocked or it errors. */
export function openReplayRecordStore(
  factory: IDBFactory | null,
  limits: Readonly<{ count: number; bytes: number }> = REPLAY_RECORD_LIMITS,
): Promise<ReplayRecordStore | Readonly<{ failed: ReplayRecordFailure }>> {
  if (factory === null) return Promise.resolve({ failed: "unavailable" });
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(REPLAY_RECORD_DATABASE, REPLAY_RECORD_DATABASE_VERSION);
    } catch (error) {
      resolve({ failed: failureOf(error) });
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onblocked = () => {
      resolve({ failed: "blocked" });
    };
    request.onerror = () => {
      resolve({ failed: failureOf(request.error) });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
      };
      resolve(storeOver(database, limits));
    };
  });
}

function storeOver(database: IDBDatabase, limits: Readonly<{ count: number; bytes: number }>): ReplayRecordStore {
  const readEntries = (): Promise<readonly ReplayRecordEntry[] | Readonly<{ failed: ReplayRecordFailure }>> =>
    new Promise((resolve) => {
      try {
        const request = database.transaction(STORE, "readonly").objectStore(STORE).get(INDEX_KEY);
        request.onsuccess = () => {
          resolve(readIndex(request.result));
        };
        request.onerror = () => {
          resolve({ failed: failureOf(request.error) });
        };
      } catch (error) {
        resolve({ failed: failureOf(error) });
      }
    });
  const parse = (value: unknown): ReplayReadResult | null => {
    if (typeof value !== "string") return null;
    try {
      return readReplayRecord(JSON.parse(value));
    } catch {
      return readReplayRecord(null);
    }
  };
  return Object.freeze({
    entries: readEntries,
    read: (key: string) =>
      new Promise<ReplayReadResult | null | Readonly<{ failed: ReplayRecordFailure }>>((resolve) => {
        try {
          const request = database.transaction(STORE, "readonly").objectStore(STORE).get(key);
          request.onsuccess = () => {
            resolve(key === INDEX_KEY ? null : parse(request.result));
          };
          request.onerror = () => {
            resolve({ failed: failureOf(request.error) });
          };
        } catch (error) {
          resolve({ failed: failureOf(error) });
        }
      }),
    close: () => {
      database.close();
    },
    put: async (record: ReplayRecord): Promise<ReplayRecordPut> => {
      const json = JSON.stringify(record);
      // The JSON is ASCII apart from names, so its length stands for its bytes.
      const entry = { key: replayRecordKey(record), bytes: json.length, recordedAt: record.look.recordedAt };
      const index = await readEntries();
      if ("failed" in index) return { status: "failed", reason: index.failed };
      const plan = planReplayRecordWrite(index, entry, limits);
      if (!plan.store) return { status: "oversized", bytes: entry.bytes };
      return new Promise((resolve) => {
        try {
          const transaction = database.transaction(STORE, "readwrite");
          const store = transaction.objectStore(STORE);
          for (const key of plan.evict) store.delete(key);
          store.put(json, entry.key);
          store.put(plan.index, INDEX_KEY);
          transaction.oncomplete = () => {
            resolve({ status: "stored", key: entry.key, evicted: plan.evict });
          };
          transaction.onerror = () => {
            resolve({ status: "failed", reason: failureOf(transaction.error) });
          };
          transaction.onabort = () => {
            resolve({ status: "failed", reason: failureOf(transaction.error) });
          };
        } catch (error) {
          resolve({ status: "failed", reason: failureOf(error) });
        }
      });
    },
  });
}

/**
 * The saved replay records on this device: the `tear-replays` IndexedDB database (version 1, one
 * `records` store), opened through an injected `IDBFactory`. Each record is held as `encoding.ts` writes
 * it (gzip bytes of its JSON); a record kept as JSON text before replay PR 6 reads back the same way.
 *
 * - **Caps:** `REPLAY_RECORD_LIMITS.count` records, up to `REPLAY_RECORD_LIMITS.bytes` in all, of which
 *   at most `REPLAY_RECORD_LIMITS.pinned` are pinned. A write drops the oldest unpinned records until the
 *   new one fits, then the oldest pinned ones; a record bigger than the byte cap on its own is not stored.
 *   The write says what it dropped and adds it to a count kept beside the index, which the list takes
 *   (and so clears) when it opens, to tell the player.
 * - **The index is the list:** each entry carries the run's list row (`ReplayRecordRow`) and its pin, so
 *   listing never reads a record. An entry written before rows existed gets its row from its record the
 *   first time the index is listed, and the index is saved with it.
 * - **Never fails a run:** every operation resolves to a plain result. A quota error, a blocked open or
 *   any IndexedDB error is a `failed` result with its reason, never a throw.
 * - **Upgrades:** an open blocked by another tab resolves as `failed` ("blocked"), and an open database
 *   closes on `versionchange`, so a later build's upgrade is never blocked by this one.
 *
 * What clears it: the browser's site data clearing. Nothing in the game deletes it before replay PR 8.
 */
import { isObject, isRecord } from "../domain/records";
import { decodeReplayRecord, encodedReplayRecordBytes, encodeReplayRecord } from "./encoding";
import {
  readReplayRecord,
  type ReplayOutcome,
  type ReplayReadResult,
  type ReplayRecord,
  type ReplayStart,
} from "./record";

export const REPLAY_RECORD_DATABASE = "tear-replays";
export const REPLAY_RECORD_DATABASE_VERSION = 1;
const STORE = "records";
const INDEX_KEY = "index";
/** How many records the caps dropped since the list last said so. */
const DROPPED_KEY = "dropped";

/**
 * 300 records and 25 MB. A live minute is about 700 KB as JSON and about 60 KB as stored (gzip, measured
 * in replay PR 6 on real records: 54 to 73 KB a minute), so the byte cap holds about seven hours of play.
 * Runs averaging under about 85 seconds reach the count cap first; longer ones reach the byte cap. The
 * list is the index alone, a few hundred bytes a record, so 300 records list without reading one. 25 MB is a small share of the origin quota browsers grant
 * (Chrome gives an origin a share of free disk measured in GB; Safari asks past 1 GB), and leaves room for
 * the player's save and the V3 vault until PR 8 removes it.
 */
export const REPLAY_RECORD_LIMITS = Object.freeze({ count: 300, bytes: 25 * 1024 * 1024, pinned: 10 });

export type ReplayRecordLimits = Readonly<{ count: number; bytes: number; pinned: number }>;

/** What a list row shows for one record, read once from the record when it is stored. */
export interface ReplayRecordRow {
  readonly seed: number;
  readonly ruleset: string;
  readonly mode: ReplayStart["mode"];
  readonly difficulty: ReplayStart["difficulty"];
  readonly weapon: ReplayStart["weapon"];
  /** The highest stage index the run entered; 0 for a run with no stage marks. */
  readonly stage: number;
  readonly score: number;
  readonly wave: number;
  /** Run time in seconds. */
  readonly time: number;
  readonly outcome: ReplayOutcome;
}

/** One stored record, as the store's index lists it. */
export interface ReplayRecordEntry {
  readonly key: string;
  readonly bytes: number;
  readonly recordedAt: string;
  readonly pinned: boolean;
  /** Absent only when the record could not be read; the list offers to delete it. */
  readonly row?: ReplayRecordRow;
}

/** The list row of a record. */
export function replayRecordRow(record: ReplayRecord): ReplayRecordRow {
  const stage = record.summary.marks.reduce(
    (highest, mark) => (mark.kind === "stage" ? Math.max(highest, mark.value) : highest),
    0,
  );
  return Object.freeze({
    seed: record.run.seed,
    ruleset: record.run.ruleset,
    mode: record.run.start.mode,
    difficulty: record.run.start.difficulty,
    weapon: record.run.start.weapon,
    stage,
    score: record.summary.score,
    wave: record.summary.wave,
    time: record.summary.time,
    outcome: record.run.result.outcome,
  });
}

export type ReplayRecordFailure = "blocked" | "quota" | "unavailable" | "error";

export type ReplayRecordPut =
  | Readonly<{ status: "stored"; key: string; evicted: readonly string[] }>
  | Readonly<{ status: "present"; key: string }>
  | Readonly<{ status: "oversized"; bytes: number }>
  | Readonly<{ status: "failed"; reason: ReplayRecordFailure }>;

/** A change to one entry: done, refused (the pin limit), absent or failed. */
export type ReplayRecordChange = "done" | "missing" | "pin-limit" | Readonly<{ failed: ReplayRecordFailure }>;

export interface ReplayRecordStore {
  /** Stores a record; a record already stored under its key is left as it is ("present"). */
  readonly put: (record: ReplayRecord) => Promise<ReplayRecordPut>;
  /** The index, oldest first, every readable entry with its row. */
  readonly entries: () => Promise<readonly ReplayRecordEntry[] | Readonly<{ failed: ReplayRecordFailure }>>;
  readonly pin: (key: string, pinned: boolean) => Promise<ReplayRecordChange>;
  readonly remove: (key: string) => Promise<ReplayRecordChange>;
  /** One stored record, read as untrusted data; null when the key holds none. */
  readonly read: (key: string) => Promise<ReplayReadResult | null | Readonly<{ failed: ReplayRecordFailure }>>;
  /** How many records the caps dropped since the last call; the count starts again at 0. */
  readonly takeDropped: () => Promise<number | Readonly<{ failed: ReplayRecordFailure }>>;
  readonly close: () => void;
}

export type ReplayRecordWritePlan =
  Readonly<{ store: true; evict: readonly string[]; index: readonly ReplayRecordEntry[] }> | Readonly<{ store: false }>;

/**
 * Which records a write keeps. The index is oldest first and the new entry goes last; the oldest unpinned
 * entries go first, then the oldest pinned ones, until the count and byte caps hold.
 */
export function planReplayRecordWrite(
  index: readonly ReplayRecordEntry[],
  entry: ReplayRecordEntry,
  limits: Pick<ReplayRecordLimits, "count" | "bytes"> = REPLAY_RECORD_LIMITS,
): ReplayRecordWritePlan {
  if (entry.bytes > limits.bytes) return { store: false };
  const older = index.filter((existing) => existing.key !== entry.key);
  const evict = new Set<string>();
  let count = older.length + 1;
  let total = older.reduce((sum, existing) => sum + existing.bytes, entry.bytes);
  for (const pinned of [false, true])
    for (const candidate of older) {
      if (count <= limits.count && total <= limits.bytes) break;
      if (candidate.pinned !== pinned) continue;
      evict.add(candidate.key);
      count -= 1;
      total -= candidate.bytes;
    }
  return {
    store: true,
    evict: older.filter((existing) => evict.has(existing.key)).map((existing) => existing.key),
    index: [...older.filter((existing) => !evict.has(existing.key)), entry],
  };
}

/** The key a record is stored under: its recording time and seed, so keys sort oldest first. */
export function replayRecordKey(record: ReplayRecord): string {
  return `record:${record.look.recordedAt}:${String(record.run.seed)}`;
}

function failureOf(error: unknown): ReplayRecordFailure {
  return isObject(error) && (error as { name?: unknown }).name === "QuotaExceededError" ? "quota" : "error";
}

/** An index entry as stored; `row` is checked as a whole and re-derived when it is not an object. */
type StoredEntry = Omit<ReplayRecordEntry, "row" | "pinned"> & Readonly<{ pinned?: unknown; row?: unknown }>;

function readIndex(value: unknown): readonly StoredEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is StoredEntry =>
      isRecord(entry) &&
      typeof entry.key === "string" &&
      Number.isSafeInteger(entry.bytes) &&
      typeof entry.recordedAt === "string",
  );
}

const storedRow = (row: unknown): ReplayRecordRow | undefined =>
  isRecord(row) && typeof row.seed === "number" && typeof row.mode === "string"
    ? (row as unknown as ReplayRecordRow)
    : undefined;

/** Opens the store; `failed` when IndexedDB is missing, the open is blocked or it errors. */
export function openReplayRecordStore(
  factory: IDBFactory | null,
  limits: ReplayRecordLimits = REPLAY_RECORD_LIMITS,
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

type Failed = Readonly<{ failed: ReplayRecordFailure }>;

function storeOver(database: IDBDatabase, limits: ReplayRecordLimits): ReplayRecordStore {
  /** One request against the records store, resolved with its result or its failure. */
  const get = (key: string): Promise<unknown> =>
    new Promise((resolve) => {
      try {
        const request = database.transaction(STORE, "readonly").objectStore(STORE).get(key);
        request.onsuccess = () => {
          resolve({ value: request.result as unknown });
        };
        request.onerror = () => {
          resolve({ failed: failureOf(request.error) });
        };
      } catch (error) {
        resolve({ failed: failureOf(error) });
      }
    });
  /** Applies writes in one transaction. */
  const write = (apply: (store: IDBObjectStore) => void): Promise<"done" | Failed> =>
    new Promise((resolve) => {
      try {
        const transaction = database.transaction(STORE, "readwrite");
        apply(transaction.objectStore(STORE));
        transaction.oncomplete = () => {
          resolve("done");
        };
        transaction.onerror = () => {
          resolve({ failed: failureOf(transaction.error) });
        };
        transaction.onabort = () => {
          resolve({ failed: failureOf(transaction.error) });
        };
      } catch (error) {
        resolve({ failed: failureOf(error) });
      }
    });
  const parse = async (value: unknown): Promise<ReplayReadResult | null> => {
    if (value === undefined) return null;
    const json = await decodeReplayRecord(value);
    if (json === null) return readReplayRecord(null);
    try {
      return readReplayRecord(JSON.parse(json));
    } catch {
      return readReplayRecord(null);
    }
  };
  const read = async (key: string): Promise<ReplayReadResult | null | Failed> => {
    const result = (await get(key)) as { value?: unknown } | Failed;
    if ("failed" in result) return result;
    return key === INDEX_KEY || key === DROPPED_KEY ? null : parse(result.value);
  };
  /** The dropped count as stored; anything but a positive whole number counts as none. */
  const dropped = async (): Promise<number | Failed> => {
    const result = (await get(DROPPED_KEY)) as { value?: unknown } | Failed;
    if ("failed" in result) return result;
    const count = result.value;
    return typeof count === "number" && Number.isSafeInteger(count) && count > 0 ? count : 0;
  };
  /** The index with every readable entry's row; rows missing from an older index are read once and saved. */
  const entries = async (): Promise<readonly ReplayRecordEntry[] | Failed> => {
    const result = (await get(INDEX_KEY)) as { value?: unknown } | Failed;
    if ("failed" in result) return result;
    let filled = false;
    const index: ReplayRecordEntry[] = [];
    for (const stored of readIndex(result.value)) {
      const { row: rawRow, pinned, ...rest } = stored;
      let row = storedRow(rawRow);
      if (row === undefined) {
        const record = await read(stored.key);
        if (record !== null && !("failed" in record) && record.ok) {
          row = replayRecordRow(record.record);
          filled = true;
        }
      }
      index.push(Object.freeze({ ...rest, pinned: pinned === true, ...(row === undefined ? {} : { row }) }));
    }
    if (filled) await write((store) => store.put(index, INDEX_KEY));
    return index;
  };
  const change = async (
    key: string,
    edit: (index: readonly ReplayRecordEntry[], at: number) => ReplayRecordEntry[] | "pin-limit",
    apply: (store: IDBObjectStore) => void = () => undefined,
  ): Promise<ReplayRecordChange> => {
    const index = await entries();
    if ("failed" in index) return index;
    const at = index.findIndex((entry) => entry.key === key);
    if (at < 0) return "missing";
    const next = edit(index, at);
    if (next === "pin-limit") return next;
    return write((store) => {
      apply(store);
      store.put(next, INDEX_KEY);
    });
  };
  return Object.freeze({
    entries,
    read,
    close: () => {
      database.close();
    },
    pin: (key: string, pinned: boolean) =>
      change(key, (index, at) => {
        if (pinned && index.filter((entry) => entry.pinned && entry.key !== key).length >= limits.pinned)
          return "pin-limit";
        return index.map((entry, position) => (position === at ? Object.freeze({ ...entry, pinned }) : entry));
      }),
    remove: (key: string) =>
      change(
        key,
        (index, at) => index.filter((_, position) => position !== at),
        (store) => store.delete(key),
      ),
    takeDropped: async (): Promise<number | Failed> => {
      const count = await dropped();
      if (typeof count !== "number" || count === 0) return count;
      const cleared = await write((store) => store.delete(DROPPED_KEY));
      return cleared === "done" ? count : cleared;
    },
    put: async (record: ReplayRecord): Promise<ReplayRecordPut> => {
      const key = replayRecordKey(record);
      const index = await entries();
      if ("failed" in index) return { status: "failed", reason: index.failed };
      if (index.some((entry) => entry.key === key)) return { status: "present", key };
      const stored = await encodeReplayRecord(JSON.stringify(record));
      const entry: ReplayRecordEntry = Object.freeze({
        key,
        bytes: encodedReplayRecordBytes(stored),
        recordedAt: record.look.recordedAt,
        pinned: false,
        row: replayRecordRow(record),
      });
      const plan = planReplayRecordWrite(index, entry, limits);
      if (!plan.store) return { status: "oversized", bytes: entry.bytes };
      const before = plan.evict.length === 0 ? 0 : await dropped();
      if (typeof before !== "number") return { status: "failed", reason: before.failed };
      const written = await write((store) => {
        for (const evicted of plan.evict) store.delete(evicted);
        store.put(stored, key);
        store.put(plan.index, INDEX_KEY);
        if (plan.evict.length > 0) store.put(before + plan.evict.length, DROPPED_KEY);
      });
      return written === "done"
        ? { status: "stored", key, evicted: plan.evict }
        : { status: "failed", reason: written.failed };
    },
  });
}

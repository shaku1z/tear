import type { ReplayRecord } from "../../replay/record";
import type { ReplayRecordEntry, ReplayRecordStore } from "../../replay/record-store";

/** A kept record and its key in the `tear-replays` store. */
export interface KeptRecord {
  readonly key: string;
  readonly record: ReplayRecord;
}

/** The key of the newest kept record of the run with this seed; record keys end in the run seed. */
export function keptRecordKeyFor(entries: readonly ReplayRecordEntry[], seed: string): string | undefined {
  return entries
    .filter((entry) => entry.key.endsWith(`:${seed}`))
    .reduce<ReplayRecordEntry | undefined>(
      (newest, entry) => (newest === undefined || entry.recordedAt > newest.recordedAt ? entry : newest),
      undefined,
    )?.key;
}

type OpenStore = () => Promise<ReplayRecordStore | Readonly<{ failed: unknown }>>;

/** Reads a kept record through an opened store; undefined when it cannot. */
async function readKept(open: OpenStore, key: (store: ReplayRecordStore) => Promise<string | undefined>) {
  const store = await open().catch(() => undefined);
  if (store === undefined || "failed" in store) return undefined;
  try {
    const found = await key(store);
    if (found === undefined) return undefined;
    const read = await store.read(found);
    return read !== null && "ok" in read && read.ok ? Object.freeze({ key: found, record: read.record }) : undefined;
  } catch {
    return undefined;
  } finally {
    store.close();
  }
}

/**
 * The kept record of the run with this seed, read from the store, or undefined when there is none or the
 * store cannot be read.
 */
export function findKeptRecord(open: OpenStore, seed: string): Promise<KeptRecord | undefined> {
  return readKept(open, async (store) => {
    const entries = await store.entries();
    return "failed" in entries ? undefined : keptRecordKeyFor(entries, seed);
  });
}

/** The kept record stored under this key (a REPLAYS list row), or undefined. */
export function readKeptRecord(open: OpenStore, key: string): Promise<KeptRecord | undefined> {
  return readKept(open, () => Promise.resolve(key));
}

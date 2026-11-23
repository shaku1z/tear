import type { ReplayRecord } from "../../replay/record";
import type { ReplayRecordEntry, ReplayRecordStore } from "../../replay/record-store";
import type { VisualReplayPacket } from "../../replay/visual-replay";

/** A kept record and its key in the `tear-replays` store. */
export interface KeptRecord {
  readonly key: string;
  readonly record: ReplayRecord;
}

/**
 * The run seed an older (Ghost 2) replay packet names, which finds the run's kept record. Saved replays and
 * the results screen's last run are both packets, and a packet carries its seed in `run.seed`.
 */
export function keptRecordSeed(packet: unknown): string | undefined {
  const seed = (packet as Partial<Pick<VisualReplayPacket, "run">> | null)?.run?.seed;
  return typeof seed === "string" && /^\d+$/u.test(seed) ? seed : undefined;
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

/**
 * The kept record of the run with this seed, read from the store, or undefined when there is none or the
 * store cannot be read. The caller falls back to the older replay it was given.
 */
export async function findKeptRecord(
  open: () => Promise<ReplayRecordStore | Readonly<{ failed: unknown }>>,
  seed: string,
): Promise<KeptRecord | undefined> {
  const store = await open().catch(() => undefined);
  if (store === undefined || "failed" in store) return undefined;
  try {
    const entries = await store.entries();
    if ("failed" in entries) return undefined;
    const key = keptRecordKeyFor(entries, seed);
    if (key === undefined) return undefined;
    const read = await store.read(key);
    return read !== null && "ok" in read && read.ok ? Object.freeze({ key, record: read.record }) : undefined;
  } catch {
    return undefined;
  } finally {
    store.close();
  }
}

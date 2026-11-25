/**
 * Replays recorded before this update: the recordings earlier versions kept in the save, which this version
 * cannot play (src/replay/record.ts reads one as from an earlier version).
 *
 * - **Where they are:** the old REPLAYS index (`EARLIER_INDEX_KEY`), one key per listed recording (the
 *   recording prefix and its id), and one best per mode and difficulty (`EARLIER_BEST_PREFIX`, written by the
 *   game before the redesign, including the Waves and Boss modes since removed).
 * - **What the player is offered:** the REPLAYS list says how many there are and offers DOWNLOAD ALL (one
 *   JSON file of them as kept) and CONTINUE (removes them). Nothing else in the save is read or written.
 */
import { isRecord } from "../../domain/records";
import { DIFFICULTY_IDS } from "../../gameplay/run/difficulty-catalog";
import { MODE_IDS } from "../../gameplay/run/mode-catalog";

/** The save's string storage (the platform store), as much of it as this module uses. */
export interface EarlierReplayStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** The prefix of the old REPLAYS keys, as the player's save names them. */
export const EARLIER_RECORDING_PREFIX = "tear_vault_";
export const EARLIER_INDEX_KEY = `${EARLIER_RECORDING_PREFIX}index`;
export const EARLIER_BEST_PREFIX = "tear_ghost_";
/** Modes earlier versions kept a best recording for: today's, and the two since removed. */
const BEST_MODES: readonly string[] = Object.freeze([...MODE_IDS, "waves", "boss"]);
/** The downloaded file's format name. */
export const EARLIER_REPLAYS_FORMAT = "tear-earlier-replays";

function read(store: EarlierReplayStore, key: string): string | null {
  try {
    const value = store.get(key);
    return value === null || value === "" ? null : value;
  } catch {
    return null;
  }
}

function indexIds(store: EarlierReplayStore): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(read(store, EARLIER_INDEX_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry: unknown) => (isRecord(entry) && typeof entry.id === "string" ? [entry.id] : []));
  } catch {
    return [];
  }
}

/** The keys of every earlier recording this save still holds, the index's first. */
export function earlierReplayKeys(store: EarlierReplayStore): readonly string[] {
  const keys = indexIds(store).map((id) => EARLIER_RECORDING_PREFIX + id);
  for (const mode of BEST_MODES)
    for (const difficulty of DIFFICULTY_IDS) keys.push(`${EARLIER_BEST_PREFIX}${mode}_${difficulty}`);
  return Object.freeze([...new Set(keys)].filter((key) => read(store, key) !== null));
}

/** One file of the recordings under `keys`, each as the save kept it (parsed when it is JSON). */
export function earlierReplaysFile(store: EarlierReplayStore, keys: readonly string[]): Uint8Array {
  const recordings: Record<string, unknown> = {};
  for (const key of keys) {
    const value = read(store, key);
    if (value === null) continue;
    try {
      recordings[key] = JSON.parse(value) as unknown;
    } catch {
      recordings[key] = value;
    }
  }
  return new TextEncoder().encode(JSON.stringify({ format: EARLIER_REPLAYS_FORMAT, recordings }));
}

/** Removes the recordings under `keys` and the old index. False when the store refused a write. */
export function clearEarlierReplays(store: EarlierReplayStore, keys: readonly string[]): boolean {
  try {
    for (const key of keys) store.set(key, "");
    if (read(store, EARLIER_INDEX_KEY) !== null) store.set(EARLIER_INDEX_KEY, "");
    return true;
  } catch {
    return false;
  }
}

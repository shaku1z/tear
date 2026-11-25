/**
 * The one REPLAYS list: every kept run on this device, one row per run, newest first.
 *
 * - **Rows** come from the `tear-replays` index, never from a record's actions.
 * - **Filters:** ALL; BESTS, the highest-scoring row of each mode and difficulty; PINNED.
 */
import type { ReplayRecordEntry } from "../../replay/record-store";

export const REPLAY_LIST_FILTERS = Object.freeze(["all", "bests", "pinned"] as const);
export type ReplayListFilter = (typeof REPLAY_LIST_FILTERS)[number];

export interface ReplayListItem {
  /** The record key. */
  readonly id: string;
  /** Wall-clock milliseconds. */
  readonly recordedAt: number;
  readonly mode?: string;
  readonly difficulty?: string;
  readonly weapon?: string;
  /** The highest stage index the run entered. */
  readonly stage?: number;
  readonly score?: number;
  readonly wave?: number;
  /** Run time in seconds. */
  readonly time?: number;
  readonly victory: boolean;
  readonly pinned: boolean;
  /** Published to the feed (the index keeps the share id). */
  readonly shared: boolean;
  readonly best: boolean;
  /** False for a record that could not be read or whose ruleset is retired; only DELETE is offered. */
  readonly playable: boolean;
}

/** The list rows, newest first, for one filter. `playableRuleset` says whether a record's ruleset plays today. */
export function replayList(
  records: readonly ReplayRecordEntry[],
  filter: ReplayListFilter,
  playableRuleset: (ruleset: string) => boolean,
): readonly ReplayListItem[] {
  const items: ReplayListItem[] = records.map((entry) => {
    const row = entry.row;
    return Object.freeze({
      id: entry.key,
      recordedAt: Date.parse(entry.recordedAt) || 0,
      ...(row === undefined
        ? {}
        : {
            mode: row.mode,
            difficulty: row.difficulty,
            weapon: row.weapon,
            stage: row.stage,
            score: row.score,
            wave: row.wave,
            time: row.time,
          }),
      victory: row?.outcome === "victory",
      pinned: entry.pinned,
      shared: entry.shareId !== undefined,
      best: false,
      playable: row !== undefined && playableRuleset(row.ruleset),
    });
  });
  const bests = new Map<string, ReplayListItem>();
  for (const item of items) {
    if (!item.playable || item.mode === undefined || item.score === undefined) continue;
    const group = `${item.mode}:${item.difficulty ?? ""}`;
    const best = bests.get(group);
    if (best === undefined || item.score > (best.score ?? 0)) bests.set(group, item);
  }
  const bestIds = new Set([...bests.values()].map((item) => item.id));
  return Object.freeze(
    items
      .map((item) => (bestIds.has(item.id) ? Object.freeze({ ...item, best: true }) : item))
      .filter((item) => filter === "all" || (filter === "bests" ? item.best : item.pinned))
      .sort((left, right) => right.recordedAt - left.recordedAt),
  );
}

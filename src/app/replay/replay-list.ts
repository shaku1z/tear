/**
 * The one REPLAYS list: every kept run on this device, one row per run, newest first.
 *
 * - **Kept records** (the `tear-replays` index) are the list. Their rows come from the index, never from
 *   a record's actions.
 * - **Older recordings** (Ghost 2, in local storage) appear only when no kept record has their run seed:
 *   a run recorded before the record existed, or one whose record was dropped. They play through the old
 *   path until replay PR 8 removes them. A kept record with a Ghost 2 copy keeps that copy's id, because
 *   the feed still plays Ghost 2 recordings until PR 8 (SHARE publishes the copy) and pin and delete act
 *   on both.
 * - **Filters:** ALL; BESTS, the highest-scoring row of each mode and difficulty; PINNED.
 */
import type { ReplayRecordEntry } from "../../replay/record-store";

export const REPLAY_LIST_FILTERS = Object.freeze(["all", "bests", "pinned"] as const);
export type ReplayListFilter = (typeof REPLAY_LIST_FILTERS)[number];

/** An older recording as its index lists it, with the run seed read from the recording. */
export interface OlderRecording {
  readonly id: string;
  /** Wall-clock milliseconds. */
  readonly recordedAt: number;
  readonly pinned: boolean;
  readonly shared: boolean;
  readonly seed?: number;
  readonly mode?: string;
  readonly difficulty?: string;
  readonly score?: number;
  readonly wave?: number;
  readonly victory?: boolean;
  /** The recording's thumbnail id. */
  readonly thumb?: string;
}

export interface ReplayListItem {
  /** The record key for a kept run, the older recording's id otherwise. */
  readonly id: string;
  readonly kind: "record" | "older";
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
  readonly shared: boolean;
  readonly best: boolean;
  /** False for a record that could not be read or whose ruleset is retired; only DELETE is offered. */
  readonly playable: boolean;
  /** The Ghost 2 copy of this run, when one is kept. */
  readonly olderId?: string;
  /** A thumbnail id, from the run's Ghost 2 copy. */
  readonly thumb?: string;
}

/** The list rows, newest first, for one filter. `playableRuleset` says whether a record's ruleset plays today. */
export function replayList(
  records: readonly ReplayRecordEntry[],
  older: readonly OlderRecording[],
  filter: ReplayListFilter,
  playableRuleset: (ruleset: string) => boolean,
): readonly ReplayListItem[] {
  const olderBySeed = new Map<number, OlderRecording>();
  for (const recording of older)
    if (recording.seed !== undefined && !olderBySeed.has(recording.seed)) olderBySeed.set(recording.seed, recording);
  const recordSeeds = new Set<number>();
  const items: ReplayListItem[] = records.map((entry) => {
    const row = entry.row;
    const copy = row === undefined ? undefined : olderBySeed.get(row.seed);
    if (row !== undefined) recordSeeds.add(row.seed);
    return Object.freeze({
      id: entry.key,
      kind: "record" as const,
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
      shared: copy?.shared === true,
      best: false,
      playable: row !== undefined && playableRuleset(row.ruleset),
      ...(copy === undefined ? {} : { olderId: copy.id }),
      ...(copy?.thumb === undefined ? {} : { thumb: copy.thumb }),
    });
  });
  for (const recording of older) {
    if (recording.seed !== undefined && recordSeeds.has(recording.seed)) continue;
    items.push(
      Object.freeze({
        id: recording.id,
        kind: "older" as const,
        recordedAt: recording.recordedAt,
        ...(recording.mode === undefined ? {} : { mode: recording.mode }),
        ...(recording.difficulty === undefined ? {} : { difficulty: recording.difficulty }),
        ...(recording.score === undefined ? {} : { score: recording.score }),
        ...(recording.wave === undefined ? {} : { wave: recording.wave }),
        victory: recording.victory === true,
        pinned: recording.pinned,
        shared: recording.shared,
        best: false,
        playable: true,
        ...(recording.thumb === undefined ? {} : { thumb: recording.thumb }),
      }),
    );
  }
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

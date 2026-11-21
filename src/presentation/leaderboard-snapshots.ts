import { rankedScore, scoreSeconds, type LeaderboardKind } from "../domain/leaderboards";
import type { LeaderboardsScreenView, ReplayView } from "./screens/contracts";
import type { DifficultyViewSource, LeaderboardRowSource } from "./profile-snapshots";

export interface LeaderboardSnapshotResult {
  readonly view: LeaderboardsScreenView;
  readonly maximumScroll: number;
}

interface CommonInput {
  readonly tabs: readonly (readonly [string, string])[];
  readonly tab: string;
  readonly cloudAvailable: boolean;
  readonly message: string;
  readonly loading: boolean;
  /** The last request failed (offline or the service is unreachable). */
  readonly failed?: boolean;
  readonly height: number;
  readonly scroll: number;
}

function tabViews(input: CommonInput) {
  return input.tabs.map(([id, label]) => ({ id, label, selected: id === input.tab }));
}

type LeaderboardStatus = NonNullable<LeaderboardsScreenView["status"]>;
function leaderboardStatus(input: CommonInput, count: number): LeaderboardStatus {
  if (!input.cloudAvailable) return "signin";
  if (input.loading) return "loading";
  if (input.failed === true) return "offline";
  return count === 0 ? "empty" : "ready";
}

function scrollState(maximum: number, scroll: number) {
  const clamped = Math.max(0, Math.min(maximum, scroll));
  return { clamped, canScrollUp: clamped > 0, canScrollDown: clamped < maximum };
}

export function buildFeedLeaderboardSnapshot(
  input: CommonInput & {
    readonly rows: readonly ReplayView[];
  },
): LeaderboardSnapshotResult {
  const maximumScroll = Math.max(0, input.rows.length * 96 - (input.height - 320));
  const state = scrollState(maximumScroll, input.scroll);
  return Object.freeze({
    maximumScroll,
    view: Object.freeze({
      id: "leaderboards",
      tab: input.tab,
      tabs: tabViews(input),
      rows: input.rows,
      signInRequired: !input.cloudAvailable,
      status: leaderboardStatus(input, input.rows.length),
      message:
        input.message ||
        (!input.cloudAvailable
          ? "The replay feed needs an account."
          : input.loading
            ? "Loading the feed…"
            : input.rows.length === 0
              ? "Nothing published yet — be the first."
              : ""),
      canScrollUp: state.canScrollUp,
      canScrollDown: state.canScrollDown,
    }),
  });
}

export interface RankedLeaderboardRow extends LeaderboardRowSource {
  readonly name?: string;
}

/** A board in the picker. */
export interface BoardViewSource {
  readonly id: string;
  readonly label: string;
}

/** The player's own best on the board, kept on this device; `count` is absent when the record has none. */
export interface LocalBoardBest {
  readonly count?: number;
  readonly score: number;
}

/**
 * How an entry reads on a board: "wave 12 · 3,400 pts" on a score board, "trials 6 · 14:02" on a
 * clear-time board. The kind decides; no board is named here.
 */
function entryText(
  kind: LeaderboardKind,
  formatTime: (seconds: number) => string,
  count: number | undefined,
  score: number,
): string {
  const ranked = kind.unit === "ticks" ? formatTime(scoreSeconds(kind, score)) : `${score.toLocaleString("en-US")} pts`;
  return count === undefined ? ranked : `${kind.countLabel.toLowerCase()} ${String(count)} · ${ranked}`;
}

export function buildRankedLeaderboardSnapshot(
  input: CommonInput & {
    readonly data: readonly RankedLeaderboardRow[];
    readonly boards: readonly BoardViewSource[];
    readonly difficulties: readonly DifficultyViewSource[];
    readonly board: string;
    readonly kind: LeaderboardKind;
    /** The legacy ghost a score board without linked replays falls back to; none on other boards. */
    readonly legacyGhost?: string;
    readonly difficulty: string;
    readonly currentUserId?: string;
    readonly localBest: LocalBoardBest | null;
    readonly formatTime: (seconds: number) => string;
    readonly rowView: (row: RankedLeaderboardRow) => ReplayView;
  },
): LeaderboardSnapshotResult {
  const { kind } = input;
  // A row the board cannot rank (a 0-tick or broken time, a non-numeric score) is not listed.
  const data = input.data.filter((row) => rankedScore(kind, row.score) !== null);
  const text = (count: number | undefined, score: number) => entryText(kind, input.formatTime, count, score);
  const linked = data.some((row) => row.replayId !== undefined);
  const ghostId = !linked && data.length > 0 ? input.legacyGhost : undefined;
  const medals = ["#e0a326", "#c9ccd6", "#cd7f32"] as const;
  const podium = data.slice(0, 3).map((row, index) => ({
    rank: index + 1,
    name: (row.name ?? "Player").slice(0, 14),
    detail: text(row.wave ?? 0, row.score ?? 0),
    color: medals[index] ?? medals[2],
    mine: input.currentUserId !== undefined && row.uid === input.currentUserId,
    ...(row.replayId !== undefined ? { replayId: row.replayId } : {}),
  }));
  // A clear-time board ranks the time itself: it goes in the last (ranked) column, the run time column stays empty.
  const rows = data.slice(3).map((row, index) => ({
    ...input.rowView(row),
    ...(kind.unit === "ticks" ? { time: "", score: input.formatTime(scoreSeconds(kind, row.score ?? 0)) } : {}),
    rank: index + 4,
  }));
  const maximumScroll = Math.max(0, rows.length * 34 - (input.height - 634));
  const state = scrollState(maximumScroll, input.scroll);
  const myIndex = input.currentUserId === undefined ? -1 : data.findIndex((row) => row.uid === input.currentUserId);
  const mine = data[myIndex];
  const ownRank =
    input.currentUserId !== undefined && myIndex >= 10
      ? `#${String(myIndex + 1)} YOU · ${text(mine?.wave ?? 0, mine?.score ?? 0)}`
      : input.currentUserId !== undefined && myIndex === -1
        ? input.localBest !== null && (input.localBest.count || input.localBest.score)
          ? `unranked · local best ${text(input.localBest.count, input.localBest.score)}`
          : "unranked · no local record yet"
        : undefined;
  return Object.freeze({
    maximumScroll,
    view: Object.freeze({
      id: "leaderboards",
      tab: input.tab,
      tabs: tabViews(input),
      rows,
      podium,
      ...(ownRank === undefined ? {} : { ownRank }),
      ...(ghostId === undefined ? {} : { legacyGhostId: ghostId }),
      signInRequired: !input.cloudAvailable,
      status: leaderboardStatus(input, data.length),
      boards: input.boards.map((board) => ({
        id: board.id,
        label: board.label,
        selected: board.id === input.board,
      })),
      ...(kind.unit === "ticks" ? { headings: { count: kind.countLabel, time: "", score: "CLEAR" } } : {}),
      difficulties: input.difficulties.map((difficulty) => ({
        id: difficulty.id,
        label: difficulty.label.toUpperCase(),
        selected: difficulty.id === input.difficulty,
      })),
      message:
        input.message ||
        (!input.cloudAvailable
          ? "Global leaderboards need an account — your runs are waiting to count."
          : input.loading
            ? "Loading the ranks…"
            : data.length === 0
              ? "No runs recorded on this board yet — set the first."
              : ""),
      canScrollUp: state.canScrollUp,
      canScrollDown: state.canScrollDown,
    }),
  });
}

import type { LeaderboardsScreenView, ReplayView } from "./screens/contracts";
import type { BestScoreViewSource, DifficultyViewSource, LeaderboardRowSource, ModeViewSource } from "./profile-snapshots";

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
  readonly height: number;
  readonly scroll: number;
}

function tabViews(input: CommonInput) {
  return input.tabs.map(([id, label]) => ({ id, label, selected: id === input.tab }));
}

function scrollState(maximum: number, scroll: number) {
  const clamped = Math.max(0, Math.min(maximum, scroll));
  return { clamped, canScrollUp: clamped > 0, canScrollDown: clamped < maximum };
}

export function buildFeedLeaderboardSnapshot(input: CommonInput & {
  readonly rows: readonly ReplayView[];
}): LeaderboardSnapshotResult {
  const maximumScroll = Math.max(0, input.rows.length * 66 - (input.height - 346));
  const state = scrollState(maximumScroll, input.scroll);
  return Object.freeze({ maximumScroll, view: Object.freeze({
    id: "leaderboards", tab: input.tab, tabs: tabViews(input), rows: input.rows,
    signInRequired: !input.cloudAvailable,
    message: input.message || (!input.cloudAvailable ? "The global feed needs an account."
      : input.loading ? "Loading the feedâ€¦"
        : input.rows.length === 0 ? "Nothing published yet â€” be the first."
          : "published runs from every blade â€” yours share from PROFILE â–¸ REPLAYS"),
    canScrollUp: state.canScrollUp, canScrollDown: state.canScrollDown,
  }) });
}

export interface RankedLeaderboardRow extends LeaderboardRowSource {
  readonly name?: string;
}

export function buildRankedLeaderboardSnapshot(input: CommonInput & {
  readonly data: readonly RankedLeaderboardRow[];
  readonly modes: readonly ModeViewSource[];
  readonly difficulties: readonly DifficultyViewSource[];
  readonly mode: string;
  readonly difficulty: string;
  readonly currentUserId?: string;
  readonly localBest: BestScoreViewSource;
  readonly rowView: (row: RankedLeaderboardRow) => ReplayView;
}): LeaderboardSnapshotResult {
  const linked = input.data.some((row) => row.replayId !== undefined);
  const ghostId = !linked && input.data.length > 0 ? `ghost:${input.mode}:${input.difficulty}` : undefined;
  const medals = ["#e0a326", "#c9ccd6", "#cd7f32"] as const;
  const podium = input.data.slice(0, 3).map((row, index) => ({
    rank: index + 1, name: (row.name ?? "Player").slice(0, 14),
    detail: `wave ${String(row.wave ?? 0)} Â· ${(row.score ?? 0).toLocaleString()} pts`,
    color: medals[index] ?? medals[2], mine: input.currentUserId !== undefined && row.uid === input.currentUserId,
    ...(row.replayId !== undefined ? { replayId: row.replayId }
      : index === 0 && ghostId !== undefined ? { replayId: ghostId } : {}),
  }));
  const rows = input.data.slice(3).map((row, index) => ({ ...input.rowView(row), rank: index + 4 }));
  const maximumScroll = Math.max(0, rows.length * 66 - (input.height - 602));
  const state = scrollState(maximumScroll, input.scroll);
  const myIndex = input.currentUserId === undefined ? -1 : input.data.findIndex((row) => row.uid === input.currentUserId);
  const ownRank = input.currentUserId !== undefined && myIndex >= 10
    ? `#${String(myIndex + 1)} YOU Â· wave ${String(input.data[myIndex]?.wave ?? 0)} Â· ${String(input.data[myIndex]?.score ?? 0)} pts`
    : input.currentUserId !== undefined && myIndex === -1
      ? input.localBest.wave || input.localBest.score
        ? `unranked Â· local best wave ${String(input.localBest.wave)} Â· ${String(input.localBest.score)} pts`
        : "unranked Â· no local record yet"
      : undefined;
  return Object.freeze({ maximumScroll, view: Object.freeze({
    id: "leaderboards", tab: input.tab, tabs: tabViews(input), rows, podium,
    ...(ownRank === undefined ? {} : { ownRank }), signInRequired: !input.cloudAvailable,
    modes: input.modes.map((mode) => ({ id: mode.id, label: mode.label.toUpperCase(), selected: mode.id === input.mode })),
    difficulties: input.difficulties.map((difficulty) => ({ id: difficulty.id, label: difficulty.label.toUpperCase(), selected: difficulty.id === input.difficulty })),
    message: input.message || (!input.cloudAvailable ? "Global leaderboards need an account â€” your runs are waiting to count."
      : input.loading ? "Loading the ranksâ€¦"
        : input.data.length === 0 ? "No runs recorded on this board yet â€” set the first."
          : "the world's finest runs"),
    canScrollUp: state.canScrollUp, canScrollDown: state.canScrollDown,
  }) });
}

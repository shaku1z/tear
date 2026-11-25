import { describe, expect, it } from "vitest";
import { LEADERBOARD_KINDS } from "../../src/domain/leaderboards";
import {
  buildFeedLeaderboardSnapshot,
  buildRankedLeaderboardSnapshot,
} from "../../src/presentation/leaderboard-snapshots";

const tabs = [
  ["global", "GLOBAL"],
  ["feed", "FEED"],
] as const;

describe("leaderboard snapshots", () => {
  it("projects feed messaging and bounded scrolling", () => {
    const result = buildFeedLeaderboardSnapshot({
      tabs,
      tab: "feed",
      cloudAvailable: true,
      message: "",
      loading: false,
      height: 300,
      scroll: 999,
      rows: [{ id: "r", title: "A", detail: "run" }],
    });
    expect(result.view.message).toBe("");
    expect(result.view.canScrollDown).toBe(false);
  });

  it("projects the podium and local rank", () => {
    const result = buildRankedLeaderboardSnapshot({
      tabs,
      tab: "global",
      cloudAvailable: true,
      message: "",
      loading: false,
      height: 900,
      scroll: 0,
      data: [{ uid: "other", name: "Rival", wave: 4, score: 120 }],
      boards: [{ id: "endless", label: "ENDLESS" }],
      board: "endless",
      kind: LEADERBOARD_KINDS.score,
      formatTime: (seconds) =>
        `${String(Math.floor(seconds / 60))}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`,
      difficulties: [{ id: "normal", label: "Normal" }],
      difficulty: "normal",
      currentUserId: "me",
      localBest: { count: 2, score: 20 },
      rowView: () => ({ id: "row", title: "Rival", detail: "run" }),
    });
    expect(result.view.podium?.[0]?.replayId).toBeUndefined();
    expect(result.view.ownRank).toContain("local best wave 2");
  });

  it("keeps linked replay IDs attached to the exact ranked run", () => {
    const result = buildRankedLeaderboardSnapshot({
      tabs,
      tab: "global",
      cloudAvailable: true,
      message: "",
      loading: false,
      height: 900,
      scroll: 0,
      data: [{ name: "Rival", wave: 8, score: 800, replayId: "linked-8" }],
      boards: [{ id: "endless", label: "ENDLESS" }],
      board: "endless",
      kind: LEADERBOARD_KINDS.score,
      formatTime: (seconds) =>
        `${String(Math.floor(seconds / 60))}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`,
      difficulties: [{ id: "normal", label: "Normal" }],
      difficulty: "normal",
      localBest: { count: 0, score: 0 },
      rowView: () => ({ id: "linked-8", title: "Rival", detail: "run", available: true }),
    });
    expect(result.view.podium?.[0]?.replayId).toBe("linked-8");
    expect(result.view.message).toBe("");
  });

  it("reads a clear-time board as times, ranked in the last column, with the player's local best", () => {
    const formatTime = (seconds: number) =>
      `${String(Math.floor(seconds / 60))}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
    const rows = [
      { uid: "a", name: "Ash", wave: 6, score: 72_000 },
      { uid: "b", name: "Bea", wave: 6, score: 84_000 },
      { uid: "c", name: "Cid", wave: 6, score: 90_000 },
      { uid: "d", name: "Dee", wave: 6, score: 96_000 },
    ];
    const result = buildRankedLeaderboardSnapshot({
      tabs,
      tab: "global",
      cloudAvailable: true,
      message: "",
      loading: false,
      height: 900,
      scroll: 0,
      data: rows,
      boards: [
        { id: "gauntlet", label: "GAUNTLET" },
        { id: "gauntlet-clear", label: "GAUNTLET · FASTEST" },
      ],
      board: "gauntlet-clear",
      kind: LEADERBOARD_KINDS["gauntlet-clear"],
      difficulties: [{ id: "normal", label: "Normal" }],
      difficulty: "normal",
      currentUserId: "me",
      localBest: { score: 108_000 },
      formatTime,
      rowView: (row) => ({ id: "row", title: row.name ?? "", detail: "run", time: "1:00", score: "999" }),
    });
    // 72,000 ticks at 120 per second is ten minutes.
    expect(result.view.podium?.[0]?.detail).toBe("trials 6 · 10:00");
    expect(result.view.rows[0]).toMatchObject({ time: "", score: "13:20", rank: 4 });
    expect(result.view.headings).toEqual({ count: "TRIALS", time: "", score: "CLEAR" });
    expect(result.view.boards?.find((board) => board.selected)?.id).toBe("gauntlet-clear");
    expect(result.view.ownRank).toBe("unranked · local best 15:00");
  });

  it("leaves out a row the clear board cannot rank, so a 0-tick or broken time never takes first place", () => {
    const result = buildRankedLeaderboardSnapshot({
      tabs,
      tab: "global",
      cloudAvailable: true,
      message: "",
      loading: false,
      height: 900,
      scroll: 0,
      data: [
        { uid: "z", name: "Zero", wave: 6, score: 0 },
        { uid: "n", name: "Broken", wave: 6, score: Number.NaN },
        { uid: "a", name: "Ash", wave: 6, score: 72_000 },
      ],
      boards: [{ id: "gauntlet-clear", label: "GAUNTLET · FASTEST" }],
      board: "gauntlet-clear",
      kind: LEADERBOARD_KINDS["gauntlet-clear"],
      difficulties: [{ id: "normal", label: "Normal" }],
      difficulty: "normal",
      localBest: null,
      formatTime: (seconds) => `${String(seconds)}s`,
      rowView: (row) => ({ id: "row", title: row.name ?? "", detail: "run", time: "", score: "" }),
    });
    expect(result.view.podium?.map((entry) => entry.name)).toEqual(["Ash"]);
    expect(result.view.rows).toEqual([]);
  });
});

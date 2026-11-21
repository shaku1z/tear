import { describe, expect, it } from "vitest";
import {
  LEADERBOARD_KINDS,
  leaderboardChoices,
  leaderboardId,
  leaderboardKind,
  rankEntries,
  scoreBeats,
  scoreSeconds,
} from "../../src/domain/leaderboards";
import { createProfileStore } from "../../src/persistence/profile-store";
import { PROFILE_MIRROR_KEY } from "../../src/persistence/saved-profile";
import { buildRankedLeaderboardSnapshot } from "../../src/presentation/leaderboard-snapshots";

const MODES = [
  { id: "endless", label: "Endless" },
  { id: "gauntlet", label: "Gauntlet" },
];

describe("leaderboard definitions", () => {
  it("keeps every score board's stored id and names the fastest-clear board by its kind", () => {
    expect(leaderboardId({ kind: "score", mode: "endless", difficulty: "normal" })).toBe("endless_normal");
    expect(leaderboardId({ kind: "score", mode: "gauntlet", difficulty: "onehit" })).toBe("gauntlet_onehit");
    expect(leaderboardId({ kind: "gauntlet-clear", mode: "gauntlet", difficulty: "hard" })).toBe("gauntletclear_hard");
  });

  it("gives each kind one direction that comparison and ranking both read", () => {
    expect(leaderboardKind({ kind: "score" }).direction).toBe("higher");
    expect(leaderboardKind({ kind: "gauntlet-clear" }).direction).toBe("lower");
    expect(scoreBeats("higher", 10, 9)).toBe(true);
    expect(scoreBeats("higher", 9, 9)).toBe(false);
    expect(scoreBeats("lower", 8, 9)).toBe(true);
    expect(scoreBeats("lower", 9, 9)).toBe(false);
    expect(scoreBeats("lower", 99, null)).toBe(true);
    expect(scoreBeats("higher", 0, undefined)).toBe(true);
    const entries = [
      { id: "a", score: 5 },
      { id: "b", score: 3 },
      { id: "c", score: 5 },
      { id: "d", score: 1 },
    ];
    expect(rankEntries("higher", entries).map((entry) => entry.id)).toEqual(["a", "c", "b", "d"]);
    expect(rankEntries("lower", entries).map((entry) => entry.id)).toEqual(["d", "b", "a", "c"]);
  });

  it("reads a clear in ticks as seconds at the simulation rate, and points as they are", () => {
    expect(scoreSeconds(LEADERBOARD_KINDS["gauntlet-clear"], 72_000)).toBe(600);
    expect(scoreSeconds(LEADERBOARD_KINDS.score, 72_000)).toBe(72_000);
  });

  it("offers the fastest-clear board after its mode only where the provider ranks lowest first", () => {
    expect(leaderboardChoices(MODES, () => true).map((choice) => choice.id)).toEqual([
      "endless",
      "gauntlet",
      "gauntlet-clear",
    ]);
    // CrazyGames ranks only highest first: the board is left out, not shown in the wrong order.
    expect(leaderboardChoices(MODES, (direction) => direction === "higher").map((choice) => choice.id)).toEqual([
      "endless",
      "gauntlet",
    ]);
  });

  it("loads a save from before clear times: its profile loads and the fastest-clear board shows no local best", () => {
    // A profile mirror as earlier builds wrote it, with no envelope and no gauntletBest.
    const values = new Map<string, string>([
      [PROFILE_MIRROR_KEY, JSON.stringify({ shards: 7, modes: { gauntlet: true } })],
    ]);
    const profile = createProfileStore({
      store: {
        get: (key: string) => values.get(key) ?? null,
        set: (key: string, value: string) => void values.set(key, value),
      },
      now: () => 1,
      writerId: () => "unit",
      getAchievements: () => undefined,
      getMeta: () => undefined,
    });
    profile.load();
    expect(profile.data.shards).toBe(7);
    expect(profile.gauntletBest("hard")).toBeNull();
    const result = buildRankedLeaderboardSnapshot({
      tabs: [["global", "GLOBAL"]],
      tab: "global",
      cloudAvailable: true,
      message: "",
      loading: false,
      height: 900,
      scroll: 0,
      data: [],
      boards: leaderboardChoices(MODES, () => true),
      board: "gauntlet-clear",
      kind: LEADERBOARD_KINDS["gauntlet-clear"],
      difficulties: [{ id: "hard", label: "Hard" }],
      difficulty: "hard",
      currentUserId: "me",
      localBest: null,
      formatTime: (seconds) => `${String(seconds)}s`,
      rowView: () => ({ id: "row", title: "", detail: "", time: "", score: "" }),
    });
    expect(result.view.ownRank).toBe("unranked · no local record yet");
  });
});

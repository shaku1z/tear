import { describe, expect, it } from "vitest";
import {
  LEADERBOARD_KINDS,
  leaderboardChoices,
  leaderboardId,
  leaderboardKind,
  rankedScore,
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
const SCORE = LEADERBOARD_KINDS.score;
const CLEAR = LEADERBOARD_KINDS["gauntlet-clear"];

describe("leaderboard definitions", () => {
  it("keeps every score board's stored id and names the fastest-clear board by its kind", () => {
    expect(leaderboardId({ kind: "score", mode: "endless", difficulty: "normal" })).toBe("endless_normal");
    expect(leaderboardId({ kind: "score", mode: "gauntlet", difficulty: "onehit" })).toBe("gauntlet_onehit");
    expect(leaderboardId({ kind: "gauntlet-clear", mode: "gauntlet", difficulty: "hard" })).toBe("gauntletclear_hard");
  });

  it("gives each kind one direction that comparison and ranking both read", () => {
    expect(leaderboardKind({ kind: "score" }).direction).toBe("higher");
    expect(leaderboardKind({ kind: "gauntlet-clear" }).direction).toBe("lower");
    expect(scoreBeats(SCORE, 10, 9)).toBe(true);
    expect(scoreBeats(SCORE, 9, 9)).toBe(false);
    expect(scoreBeats(CLEAR, 8, 9)).toBe(true);
    expect(scoreBeats(CLEAR, 9, 9)).toBe(false);
    expect(scoreBeats(CLEAR, 99, null)).toBe(true);
    const entries = [
      { id: "a", score: 5 },
      { id: "b", score: 3 },
      { id: "c", score: 5 },
      { id: "d", score: 1 },
    ];
    expect(rankEntries("higher", entries).map((entry) => entry.id)).toEqual(["a", "c", "b", "d"]);
    expect(rankEntries("lower", entries).map((entry) => entry.id)).toEqual(["d", "b", "a", "c"]);
  });

  it("keeps a score board's first entry above 0, as before boards had a direction", () => {
    expect(scoreBeats(SCORE, 0, undefined)).toBe(false);
    expect(scoreBeats(SCORE, 0, null)).toBe(false);
    expect(scoreBeats(SCORE, 1, undefined)).toBe(true);
    // A stored score below 0 is still a real score, as it was.
    expect(scoreBeats(SCORE, 0, -5)).toBe(true);
  });

  it("ranks only plausible scores: a broken stored best counts as none, a broken candidate never enters", () => {
    // A stored 0, negative or non-finite time would lock the player out of a lowest-first board.
    for (const stored of [0, -40, Number.NaN, Number.POSITIVE_INFINITY, 12.5, "9000"])
      expect(scoreBeats(CLEAR, 90_000, stored), String(stored)).toBe(true);
    // NaN on a highest-first board blocked every later score.
    expect(scoreBeats(SCORE, 50, Number.NaN)).toBe(true);
    expect(scoreBeats(SCORE, 50, Number.POSITIVE_INFINITY)).toBe(true);
    // A 0-tick clear with nothing stored would rank first; it is no clear.
    for (const candidate of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(scoreBeats(CLEAR, candidate, null), String(candidate)).toBe(false);
    expect(scoreBeats(SCORE, Number.NaN, null)).toBe(false);
    expect(rankedScore(CLEAR, 7200)).toBe(7200);
    expect(rankedScore(CLEAR, 0)).toBeNull();
    expect(rankedScore(SCORE, 0)).toBe(0);
    expect(rankedScore(SCORE, "12")).toBeNull();
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

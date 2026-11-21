import { describe, expect, it, vi } from "vitest";
import type { LeaderboardRef, ScoreDirection } from "../../src/domain/leaderboards";
import { available, unavailable, type LeaderboardEntry, type PlatformServices } from "../../src/platform/contracts";
import { createPlatformSharedCloud } from "../../src/platform/platform-shared-cloud";

const ENDLESS: LeaderboardRef = { kind: "score", mode: "endless", difficulty: "normal" };
const GAUNTLET_CLEAR: LeaderboardRef = { kind: "gauntlet-clear", mode: "gauntlet", difficulty: "normal" };
const EXISTING: readonly LeaderboardEntry[] = [
  { playerId: "p", displayName: "Player", score: 40, rank: 1, replayId: "replay-existing" },
];

function platform(
  submit: (board: string, score: number, replayId?: string) => Promise<void>,
  ranks: readonly ScoreDirection[] = ["higher"],
  entries: readonly LeaderboardEntry[] = EXISTING,
): PlatformServices {
  const lifecycle = {
    focused: true,
    visible: true,
    subscribe: () => () => undefined,
    loadingStarted: () => undefined,
    loadingFinished: () => undefined,
    gameplayStarted: () => undefined,
    gameplayFinished: () => undefined,
    happyMoment: () => undefined,
  };
  const storage = { get: () => Promise.resolve(null), set: () => Promise.resolve(), remove: () => Promise.resolve() };
  return {
    id: "test",
    lifecycle,
    settingsStorage: storage,
    profileStorage: storage,
    identity: unavailable("test"),
    cloudSave: unavailable("test"),
    ads: unavailable("test"),
    achievements: unavailable("test"),
    analytics: unavailable("test"),
    fullscreen: unavailable("test"),
    overlay: unavailable("test"),
    leaderboards: available({
      ranks,
      submit,
      entries: () => Promise.resolve(entries),
      publishReplay: () => Promise.resolve("replay-new"),
      loadReplay: () => Promise.resolve("{}"),
    }),
  };
}

describe("platform shared cloud", () => {
  it("resubmits the latest board score when a replay is linked", async () => {
    const submit = vi.fn(() => Promise.resolve());
    const shared = createPlatformSharedCloud(() => platform(submit));
    await expect(shared.submitScore(ENDLESS, { score: 50 })).resolves.toBe(true);
    await expect(shared.linkReplay(ENDLESS, "replay-new")).resolves.toBe(true);
    expect(submit).toHaveBeenNthCalledWith(1, "endless_normal", 50);
    expect(submit).toHaveBeenNthCalledWith(2, "endless_normal", 50, "replay-new");
  });

  it("preserves platform replay ids in leaderboard rows", async () => {
    const shared = createPlatformSharedCloud(() => platform(() => Promise.resolve()));
    await expect(shared.topScores(ENDLESS, 25)).resolves.toEqual([
      { name: "Player", score: 40, wave: 0, time: 0, rank: 1, replayId: "replay-existing" },
    ]);
  });

  it("sends a score only when it beats this session's last one on the board, in the board's direction", async () => {
    const submit = vi.fn(() => Promise.resolve());
    const shared = createPlatformSharedCloud(() => platform(submit, ["higher", "lower"]));
    await expect(shared.submitScore(ENDLESS, { score: 50 })).resolves.toBe(true);
    await expect(shared.submitScore(ENDLESS, { score: 50 })).resolves.toBe(false);
    await expect(shared.submitScore(ENDLESS, { score: 40 })).resolves.toBe(false);
    await expect(shared.submitScore(GAUNTLET_CLEAR, { score: 90_000 })).resolves.toBe(true);
    await expect(shared.submitScore(GAUNTLET_CLEAR, { score: 95_000 })).resolves.toBe(false);
    await expect(shared.submitScore(GAUNTLET_CLEAR, { score: 80_000 })).resolves.toBe(true);
    expect(submit.mock.calls).toEqual([
      ["endless_normal", 50],
      ["gauntletclear_normal", 90_000],
      ["gauntletclear_normal", 80_000],
    ]);
  });

  it("orders entries best first for the board's direction", async () => {
    const entries: LeaderboardEntry[] = [
      { playerId: "a", displayName: "A", score: 90 },
      { playerId: "b", displayName: "B", score: 70 },
      { playerId: "c", displayName: "C", score: 80 },
    ];
    const shared = createPlatformSharedCloud(() => platform(() => Promise.resolve(), ["higher", "lower"], entries));
    const names = async (board: LeaderboardRef) => ((await shared.topScores(board, 25)) ?? []).map((row) => row.name);
    await expect(names(ENDLESS)).resolves.toEqual(["A", "C", "B"]);
    await expect(names(GAUNTLET_CLEAR)).resolves.toEqual(["B", "C", "A"]);
  });

  it("refuses a board whose direction the provider cannot rank, and says so", async () => {
    const submit = vi.fn(() => Promise.resolve());
    const shared = createPlatformSharedCloud(() => platform(submit));
    expect(shared.ranks("higher")).toBe(true);
    expect(shared.ranks("lower")).toBe(false);
    await expect(shared.submitScore(GAUNTLET_CLEAR, { score: 90_000 })).resolves.toBe(false);
    await expect(shared.topScores(GAUNTLET_CLEAR, 25)).resolves.toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });
});

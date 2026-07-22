import { describe, expect, it, vi } from "vitest";
import { available, unavailable, type PlatformServices } from "../../src/platform/contracts";
import { createPlatformSharedCloud } from "../../src/platform/platform-shared-cloud";

function platform(submit: (board: string, score: number, replayId?: string) => Promise<void>): PlatformServices {
  const lifecycle = { focused: true, visible: true, subscribe: () => () => undefined,
    loadingStarted: () => undefined, loadingFinished: () => undefined, gameplayStarted: () => undefined,
    gameplayFinished: () => undefined, happyMoment: () => undefined };
  const storage = { get: () => Promise.resolve(null), set: () => Promise.resolve(), remove: () => Promise.resolve() };
  return {
    id: "test", lifecycle, settingsStorage: storage, profileStorage: storage,
    identity: unavailable("test"), cloudSave: unavailable("test"), ads: unavailable("test"),
    achievements: unavailable("test"), analytics: unavailable("test"), fullscreen: unavailable("test"), overlay: unavailable("test"),
    leaderboards: available({ submit, entries: () => Promise.resolve([
      { playerId: "p", displayName: "Player", score: 40, rank: 1, replayId: "replay-existing" },
    ]), publishReplay: () => Promise.resolve("replay-new"), loadReplay: () => Promise.resolve("{}") }),
  };
}

describe("platform shared cloud", () => {
  it("resubmits the latest board score when a replay is linked", async () => {
    const submit = vi.fn(() => Promise.resolve());
    const shared = createPlatformSharedCloud(() => platform(submit));
    await expect(shared.submitScore("endless", "normal", { score: 50 })).resolves.toBe(true);
    await expect(shared.linkReplay("endless", "normal", "replay-new")).resolves.toBe(true);
    expect(submit).toHaveBeenNthCalledWith(1, "endless_normal", 50);
    expect(submit).toHaveBeenNthCalledWith(2, "endless_normal", 50, "replay-new");
  });

  it("preserves platform replay ids in leaderboard rows", async () => {
    const shared = createPlatformSharedCloud(() => platform(() => Promise.resolve()));
    await expect(shared.topScores("endless", "normal", 25)).resolves.toEqual([
      { name: "Player", score: 40, wave: 0, time: 0, rank: 1, replayId: "replay-existing" },
    ]);
  });
});

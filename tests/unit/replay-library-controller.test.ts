import { describe, expect, it, vi } from "vitest";
import { ReplayLibraryController } from "../../src/app/replay-library-controller";

describe("replay library controller", () => {
  it("plays local recordings without cloud work", () => {
    const enterReplay = vi.fn(() => true), profileMessage = vi.fn(), loadReplay = vi.fn();
    const controller = new ReplayLibraryController({ vault: { index: () => [], get: () => ({}), setShareId: vi.fn() },
      cloud: { hasLeaderboards: () => true, loadGhost: vi.fn(), loadReplay, publishReplay: vi.fn() }, enterReplay,
      setProfileMessage: profileMessage, setLeaderboardMessage: vi.fn() });
    controller.watch("local");
    expect(enterReplay).toHaveBeenCalledWith({}, "profile");
    expect(loadReplay).not.toHaveBeenCalled();
  });

  it("rejects publishing an already shared recording", () => {
    const message = vi.fn();
    const controller = new ReplayLibraryController({ vault: { index: () => [{ id: "a", shareId: "s" }], get: () => ({}), setShareId: vi.fn() },
      cloud: { hasLeaderboards: () => true, loadGhost: vi.fn(), loadReplay: vi.fn(), publishReplay: vi.fn() },
      enterReplay: vi.fn(() => true), setProfileMessage: message, setLeaderboardMessage: vi.fn() });
    controller.publish("a");
    expect(message).toHaveBeenCalledWith("already on the global feed");
  });

  it("loads a linked leaderboard replay through the leaderboard status channel", async () => {
    const record = { v: 2 }, enterReplay = vi.fn(() => true), profileMessage = vi.fn(), leaderboardMessage = vi.fn();
    const controller = new ReplayLibraryController({ vault: { index: () => [], get: () => null, setShareId: vi.fn() },
      cloud: { hasLeaderboards: () => true, loadGhost: vi.fn(), loadReplay: vi.fn(() => Promise.resolve(record)), publishReplay: vi.fn() },
      enterReplay, setProfileMessage: profileMessage, setLeaderboardMessage: leaderboardMessage });
    controller.watch("published-1", "leaderboards");
    expect(leaderboardMessage).toHaveBeenCalledWith("loading replay…");
    await vi.waitFor(() => { expect(enterReplay).toHaveBeenCalledWith(record, "leaderboards"); });
    expect(leaderboardMessage).toHaveBeenLastCalledWith("");
    expect(profileMessage).not.toHaveBeenCalled();
  });

  it("keeps linked replay failures visible on the surface that launched them", async () => {
    const leaderboardMessage = vi.fn();
    const controller = new ReplayLibraryController({ vault: { index: () => [], get: () => null, setShareId: vi.fn() },
      cloud: { hasLeaderboards: () => true, loadGhost: vi.fn(), loadReplay: vi.fn(() => Promise.resolve(null)), publishReplay: vi.fn() },
      enterReplay: vi.fn(() => false), setProfileMessage: vi.fn(), setLeaderboardMessage: leaderboardMessage });
    controller.watch("missing", "leaderboards");
    await vi.waitFor(() => { expect(leaderboardMessage).toHaveBeenLastCalledWith("couldn't load that replay"); });
  });
});

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
});

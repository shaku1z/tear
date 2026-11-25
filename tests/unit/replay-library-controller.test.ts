/**
 * Watching a published replay (src/app/library/replay-library-controller.ts): a leaderboard or feed row
 * loads the shared record and opens it on the one replay screen; a missing or earlier-version replay says
 * why on the surface that launched it, and a newer press wins over a slower older load.
 */
import { describe, expect, it, vi } from "vitest";
import { ReplayLibraryController, sharedReplayKey } from "../../src/app/library/replay-library-controller";
import type { ReplayReadResult, ReplayRecord } from "../../src/replay/record";

const record = { v: 3 } as unknown as ReplayRecord;

function setup(load: (shareId: string) => Promise<ReplayReadResult | null>, opened = true) {
  const ports = {
    loadShared: vi.fn(load),
    watch: vi.fn(() => Promise.resolve(opened)),
    setProfileMessage: vi.fn(),
    setLeaderboardMessage: vi.fn(),
  };
  return { ports, controller: new ReplayLibraryController(ports) };
}

describe("replay library controller", () => {
  it("opens a published replay on the replay screen under its shared key, saying so on the launching surface", async () => {
    const { ports, controller } = setup(() => Promise.resolve({ ok: true, record }));
    controller.watch("published-1", "leaderboards");
    expect(ports.setLeaderboardMessage).toHaveBeenCalledWith("loading replay…");
    await vi.waitFor(() => {
      expect(ports.watch).toHaveBeenCalledWith(record, sharedReplayKey("published-1"), "leaderboards");
    });
    expect(ports.setLeaderboardMessage).toHaveBeenLastCalledWith("");
    expect(ports.setProfileMessage).not.toHaveBeenCalled();
    expect(sharedReplayKey("published-1")).toBe("shared:published-1");
  });

  it("says why a published replay did not open: missing, made by an earlier version, or not playable", async () => {
    const missing = setup(() => Promise.resolve(null));
    missing.controller.watch("gone", "leaderboards");
    await vi.waitFor(() => {
      expect(missing.ports.setLeaderboardMessage).toHaveBeenLastCalledWith("couldn't load that replay");
    });
    const earlier = setup(() =>
      Promise.resolve({
        ok: false,
        reason: "earlier-version",
        message: "Made by an earlier version.",
        detail: "old ruleset",
      }),
    );
    earlier.controller.watch("old");
    await vi.waitFor(() => {
      expect(earlier.ports.setProfileMessage).toHaveBeenLastCalledWith("Made by an earlier version.");
    });
    expect(earlier.ports.watch).not.toHaveBeenCalled();
    const unplayable = setup(() => Promise.resolve({ ok: true, record }), false);
    unplayable.controller.watch("odd");
    await vi.waitFor(() => {
      expect(unplayable.ports.setProfileMessage).toHaveBeenLastCalledWith("this replay can't be played");
    });
  });

  it("drops a slower earlier load when a newer replay was asked for", async () => {
    let finishFirst: (read: ReplayReadResult) => void = () => undefined;
    const first = new Promise<ReplayReadResult>((resolve) => {
      finishFirst = resolve;
    });
    const { ports, controller } = setup((shareId) =>
      shareId === "slow" ? first : Promise.resolve({ ok: true, record }),
    );
    controller.watch("slow", "leaderboards");
    controller.watch("fast", "leaderboards");
    await vi.waitFor(() => {
      expect(ports.watch).toHaveBeenCalledOnce();
    });
    finishFirst({ ok: true, record });
    await first;
    await Promise.resolve();
    expect(ports.watch).toHaveBeenCalledExactlyOnceWith(record, "shared:fast", "leaderboards");
  });
});

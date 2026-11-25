import { describe, expect, it } from "vitest";
import { buildReplayRows, type ReplayRowSource } from "../../src/presentation/profile-snapshots";

const modes = [{ id: "endless", label: "Endless" }];
const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
const row = (overrides: Partial<ReplayRowSource>): ReplayRowSource => ({
  id: "kept",
  recordedAt: Date.UTC(2026, 10, 23),
  mode: "endless",
  difficulty: "normal",
  score: 900,
  wave: 8,
  time: 125,
  victory: false,
  pinned: false,
  shared: false,
  best: false,
  playable: true,
  ...overrides,
});

describe("REPLAYS rows", () => {
  it("names what ran and how it went, and keeps the run's identity", () => {
    const [view] = buildReplayRows([row({ victory: true, pinned: true, best: true })], modes, formatTime);
    expect(view).toMatchObject({
      id: "kept",
      title: "ENDLESS · NORMAL",
      detail: "wave 8 · 900 pts · 2:05 · ★ victory",
      available: true,
      pinned: true,
      canShare: true,
      canDownload: true,
    });
    expect(view?.timestamp).toContain("★ BEST");
  });

  it("says when a run is shared or cannot be played by this version", () => {
    const [shared, retired] = buildReplayRows(
      [row({ id: "shared", shared: true }), row({ id: "retired", playable: false })],
      modes,
      formatTime,
    );
    expect(shared).toMatchObject({ canShare: false, canDownload: true, shared: true });
    expect(shared?.timestamp).toContain("SHARED");
    expect(retired).toMatchObject({ available: false, canShare: false, canDownload: false });
    expect(retired?.timestamp).toContain("Made by an earlier version of the game");
  });

  it("describes a record whose row could not be read instead of drawing an empty line", () => {
    const [unread] = buildReplayRows(
      [
        {
          id: "unread",
          recordedAt: 0,
          victory: false,
          pinned: false,
          shared: false,
          best: false,
          playable: false,
        },
      ],
      modes,
      formatTime,
    );
    expect(unread).toMatchObject({ title: "RUN", detail: "This replay couldn't be read", available: false });
  });
});

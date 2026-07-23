import { describe, expect, it } from "vitest";
import { buildFeedLeaderboardSnapshot, buildRankedLeaderboardSnapshot } from "../../src/presentation/leaderboard-snapshots";

const tabs = [["global", "GLOBAL"], ["feed", "FEED"]] as const;

describe("leaderboard snapshots", () => {
  it("projects feed messaging and bounded scrolling", () => {
    const result = buildFeedLeaderboardSnapshot({ tabs, tab: "feed", cloudAvailable: true, message: "", loading: false,
      height: 300, scroll: 999, rows: [{ id: "r", title: "A", detail: "run" }] });
    expect(result.view.message).toBe("");
    expect(result.view.canScrollDown).toBe(false);
  });

  it("projects podium, ghost fallback, and local rank", () => {
    const result = buildRankedLeaderboardSnapshot({ tabs, tab: "global", cloudAvailable: true, message: "", loading: false,
      height: 900, scroll: 0, data: [{ uid: "other", name: "Rival", wave: 4, score: 120 }],
      modes: [{ id: "endless", label: "Endless" }], difficulties: [{ id: "normal", label: "Normal" }],
      mode: "endless", difficulty: "normal", currentUserId: "me", localBest: { wave: 2, score: 20 },
      rowView: () => ({ id: "row", title: "Rival", detail: "run" }) });
    expect(result.view.podium?.[0]?.replayId).toBeUndefined();
    expect(result.view.legacyGhostId).toBe("ghost:endless:normal");
    expect(result.view.ownRank).toContain("local best wave 2");
  });

  it("keeps linked replay IDs attached to the exact ranked run", () => {
    const result = buildRankedLeaderboardSnapshot({ tabs, tab: "global", cloudAvailable: true, message: "", loading: false,
      height: 900, scroll: 0, data: [{ name: "Rival", wave: 8, score: 800, replayId: "linked-8" }],
      modes: [{ id: "endless", label: "Endless" }], difficulties: [{ id: "normal", label: "Normal" }],
      mode: "endless", difficulty: "normal", localBest: { wave: 0, score: 0 },
      rowView: () => ({ id: "linked-8", title: "Rival", detail: "run", available: true }) });
    expect(result.view.podium?.[0]?.replayId).toBe("linked-8");
    expect(result.view.legacyGhostId).toBeUndefined();
    expect(result.view.message).toBe("");
  });
});

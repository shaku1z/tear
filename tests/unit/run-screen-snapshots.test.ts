import { describe, expect, it } from "vitest";
import { buildAbilityCards, buildDraftCard, buildResultLog, buildRunProgressSnapshot, fortuneDraftDescription } from "../../src/presentation/run-screen-snapshots";

const categories = { utility: { name: "UTILITY", color: "#123" } };

describe("run screen snapshots", () => {
  it("describes every Fortune threshold", () => {
    expect(fortuneDraftDescription(0)).toContain("PROSPERITY unlocks");
    expect(fortuneDraftDescription(2)).toContain("×1.61");
    expect(fortuneDraftDescription(4)).toContain("×2.20");
  });
  it("projects immutable draft and evolved ability cards", () => {
    const upgrade = { id: "star", name: "STAR", desc: "base", cat: "utility", unique: true, tiers: [{ desc: "evolved" }] };
    const state = { owned: { star: 1 }, tier: { star: 2 } };
    expect(buildDraftCard(upgrade, state, categories, categories.utility, "SPECIAL", "#f0f")).toMatchObject({ label: "STAR", owned: 1, accent: "#f0f" });
    expect(buildAbilityCards([upgrade], state, categories, categories.utility, ["utility"], "#f0f")[0]).toMatchObject({ description: "evolved", tier: 2, footer: "TIER 2 / 2" });
  });
  it("normalizes result rows", () => {
    expect(buildResultLog([{ wave: 4 }])).toEqual([{ wave: "4", time: "0.0s", kills: 0, peak: "×1", died: false }]);
  });
  it("combines daily, newly earned, and locked progress", () => {
    const achievements = [{ id: "earned", name: "Earned" }, { id: "locked", name: "Locked" }];
    const rows = buildRunProgressSnapshot({ dailies: [{ label: "Daily", current: 1, goal: 2, done: false }],
      achievementIds: ["earned"], runAchievementIds: [], achievements, byId: (id) => achievements.find((item) => item.id === id),
      unlocked: (id) => id === "earned", progress: (item) => item.id === "locked" ? 0.75 : 1,
      progressText: () => "3 / 4", shardsFor: () => 2, coinsFor: () => 4 });
    expect(rows.map((row) => row.label)).toEqual(["Daily", "✓ Earned", "Locked"]);
    expect(rows[1]?.detail).toBe("◆ +2  +4c");
  });
});

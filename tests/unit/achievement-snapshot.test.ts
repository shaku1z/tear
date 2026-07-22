import { describe, expect, it } from "vitest";
import { buildAchievementSnapshot } from "../../src/presentation/achievement-snapshot";

describe("achievement snapshot", () => {
  it("projects category totals, rewards and nearest locked achievement", () => {
    const achievement = { id: "a", name: "FIRST", desc: "do it", cat: "combat", rarity: "common" };
    const result = buildAchievementSnapshot({ achievements: [achievement], filter: "all", categories: { combat: { name: "Combat" } },
      rarities: { common: { name: "COMMON", color: "#fff" } }, commonRarity: { name: "COMMON", color: "#fff" },
      unlocked: () => false, progress: () => 0.5, progressText: () => "1/2", shardsFor: () => 2, coinsFor: () => 3,
      unlockedCount: 0, shards: 0, resetsIn: "1h", dailies: [], height: 900, scroll: 0, time: 0, mutedColor: "#777" });
    expect(result.view.categories[0]?.label).toBe("ALL  0/1");
    expect(result.view.cards[0]?.rewardPrimary).toBe("◆ 2 SHARDS");
  });
});

import { describe, expect, it } from "vitest";
import { buildShopSnapshot } from "../../src/presentation/shop-snapshot";

describe("shop snapshot", () => {
  it("explains optional permanent coin purchases only before any purchase evidence", () => {
    const input = {
      items: [{ id: "hp", cat: "vit", name: "HP", maxLevel: 2, desc: "health" }],
      realCoins: 75,
      displayedCoins: null,
      lifetimeEarned: 75,
      height: 900,
      scroll: 0,
      now: 0,
      level: () => 0,
      cost: () => 325,
      canBuy: () => false,
      shopBuys: 0,
      lifetimeSpent: 0,
      tab: "upgrades" as const,
    };
    const fresh = buildShopSnapshot(input).view;
    expect(fresh.onboarding).toContain("permanent upgrades");
    expect(fresh.onboarding).toContain("Buying is optional");
    expect(fresh.sections[0]?.items[0]).toMatchObject({ cost: "325c", enabled: false });
    expect(buildShopSnapshot({ ...input, level: () => 1 }).view.onboarding).toBeUndefined();
    expect(buildShopSnapshot({ ...input, shopBuys: 1 }).view.onboarding).toBeUndefined();
    expect(buildShopSnapshot({ ...input, lifetimeSpent: 325 }).view.onboarding).toBeUndefined();
  });
  it("eases the visible ledger and projects affordability", () => {
    const item = { id: "hp", cat: "vit", name: "HP", maxLevel: 2, desc: "health" };
    const result = buildShopSnapshot({
      tab: "upgrades",
      items: [item],
      realCoins: 100,
      displayedCoins: 0,
      lifetimeEarned: 200,
      height: 900,
      scroll: 0,
      now: 1,
      level: () => 1,
      cost: () => 10,
      canBuy: () => true,
    });
    expect(result.displayedCoins).toBe(18);
    expect(result.view.sections[0]?.items[0]).toMatchObject({ id: "hp", enabled: true, cost: "10c" });
  });
});

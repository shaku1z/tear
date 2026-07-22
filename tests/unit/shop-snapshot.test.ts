import { describe, expect, it } from "vitest";
import { buildShopSnapshot } from "../../src/presentation/shop-snapshot";

describe("shop snapshot", () => {
  it("eases the visible ledger and projects affordability", () => {
    const item = { id: "hp", cat: "vit", name: "HP", maxLevel: 2, desc: "health" };
    const result = buildShopSnapshot({ items: [item], realCoins: 100, displayedCoins: 0, lifetimeEarned: 200,
      height: 900, scroll: 0, now: 1, level: () => 1, cost: () => 10, canBuy: () => true });
    expect(result.displayedCoins).toBe(18);
    expect(result.view.sections[0]?.items[0]).toMatchObject({ id: "hp", enabled: true, cost: "10c" });
  });
});

import { describe, expect, it, vi } from "vitest";

import { createLiveSetupShopRenderers } from "../../src/app/live-setup-shop-renderers";

describe("live setup shop renderers", () => {
  it("keeps purchase feedback and achievement checking around the progress adapter", () => {
    const flow: string[] = [];
    const setShop = vi.fn(() => { flow.push("flash"); });
    const checkAchievements = vi.fn(() => { flow.push("achievements"); });
    const recordPurchase = vi.fn(() => { flow.push("progress"); });
    const item = { id: "maxed", maxLevel: 2 };
    const renderers = createLiveSetupShopRenderers({
      selection: () => ({ mode: "endless", difficulty: "normal", weapon: "sword", boss: "" }),
      scroll: () => 0, setScroll: vi.fn(), time: () => 5, shop: () => ({ displayedCoins: 20, flash: null }), setShop,
    }, {
      dependencies: {
        SHOP: [item], META: { buy: () => { flow.push("buy"); return true; } },
        SFX: { ui: () => { flow.push("sound"); } }, shopPurchaseProgressPersistence: { recordPurchase },
      }, renderers: {}, height: 720, getBest: () => ({ wave: 0, score: 0 }), formatTime: () => "0:00",
      clamp: (value: number) => value, checkAchievements,
    } as never);

    renderers.buyShopItem("maxed");

    expect(flow).toEqual(["buy", "sound", "flash", "progress", "achievements"]);
    expect(recordPurchase).toHaveBeenCalledOnce();
    expect(setShop).toHaveBeenCalledWith({ displayedCoins: 20, flash: { id: "maxed", time: 5 } });
  });
});

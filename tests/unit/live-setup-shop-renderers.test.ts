import { describe, expect, it, vi } from "vitest";

import { AppStateController } from "../../src/app/interface/app-state-controller";
import { ARMED_CONFIRM_DELAY_MS } from "../../src/app/interface/armed-confirm";
import { createLiveScreenNavigation } from "../../src/app/interface/live-screen-navigation";
import { createLiveSetupShopRenderers } from "../../src/app/run/setup-shop-renderers";
import type { LiveShopFeedbackSnapshot } from "../../src/app/run/shop-feedback-state";
import { createSurfaceAvailability } from "../../src/domain/surface-availability";

describe("live setup shop renderers", () => {
  it("keeps purchase feedback and achievement checking around the progress adapter", () => {
    const flow: string[] = [];
    const setShop = vi.fn(() => {
      flow.push("flash");
    });
    const checkAchievements = vi.fn(() => {
      flow.push("achievements");
    });
    const recordPurchase = vi.fn(() => {
      flow.push("progress");
    });
    const item = { id: "maxed", maxLevel: 2 };
    const renderers = createLiveSetupShopRenderers(
      {
        selection: () => ({ mode: "endless", difficulty: "normal", weapon: "sword", boss: "" }),
        scroll: () => 0,
        setScroll: vi.fn(),
        time: () => 5,
        shop: () => ({ tab: "upgrades", displayedCoins: 20, flash: null }),
        setShop,
      },
      {
        dependencies: {
          SHOP: [item],
          META: {
            buy: () => {
              flow.push("buy");
              return true;
            },
          },
          SFX: {
            ui: () => {
              flow.push("sound");
            },
          },
          shopPurchaseProgressPersistence: { recordPurchase },
        },
        renderers: {},
        height: 720,
        getBest: () => ({ wave: 0, score: 0 }),
        formatTime: () => "0:00",
        clamp: (value: number) => value,
        checkAchievements,
      } as never,
    );

    renderers.buyShopItem("maxed");

    expect(flow).toEqual(["buy", "sound", "flash", "progress", "achievements"]);
    expect(recordPurchase).toHaveBeenCalledOnce();
    expect(setShop).toHaveBeenCalledWith({ tab: "upgrades", displayedCoins: 20, flash: { id: "maxed", time: 5 } });
  });

  it("withdraws a loadout DELETE question on another change, a tab change, leaving the Shop or a move", () => {
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    let shop: LiveShopFeedbackSnapshot = { tab: "shards", displayedCoins: 0, flash: null };
    const loadout = (createdAt: number) => ({ name: "X", nameAt: 0, createdAt, slots: {} });
    let loadouts = { loadout_2: loadout(1) };
    const changeCosmetics = vi.fn(() => Promise.resolve("refused"));
    const renderers = createLiveSetupShopRenderers(
      {
        selection: () => ({ mode: "endless", difficulty: "normal", weapon: "sword", boss: "" }),
        scroll: () => 0,
        setScroll: vi.fn(),
        time: () => 0,
        shop: () => shop,
        setShop: (next: LiveShopFeedbackSnapshot) => {
          shop = next;
        },
      },
      {
        dependencies: {
          PROFILE: {
            changeCosmetics,
            claimCosmeticGrants: () => Promise.resolve(),
            cosmetics: () => ({ owned: {}, seen: {}, loadouts }),
            markCosmeticsSeen: () => Promise.resolve(),
          },
          SFX: { ui: vi.fn() },
        },
        renderers: {},
      } as never,
    );
    /** Asks, waits past the confirm delay, presses again: true when that press deleted. */
    const askThen = (withdraw: () => void): boolean => {
      renderers.pressDeleteLoadout("loadout_2");
      withdraw();
      clock += ARMED_CONFIRM_DELAY_MS;
      const before = changeCosmetics.mock.calls.length;
      renderers.pressDeleteLoadout("loadout_2");
      const deleted = changeCosmetics.mock.calls.length > before;
      renderers.leaveShop();
      return deleted;
    };

    expect(askThen(() => undefined)).toBe(true);
    expect(
      askThen(() => {
        renderers.leaveShop();
      }),
    ).toBe(false);
    expect(
      askThen(() => {
        renderers.selectShopTab("upgrades");
      }),
    ).toBe(false);
    expect(
      askThen(() => {
        renderers.changeCosmetics(() => null);
      }),
    ).toBe(false);
    // A merge put another loadout in that place while DELETE was asking.
    expect(
      askThen(() => {
        loadouts = { loadout_2: loadout(2) };
      }),
    ).toBe(false);
    vi.restoreAllMocks();
  });
});

describe("leaving the Shop", () => {
  it("tells the Shop once the player is on another screen, a rename over it included", () => {
    const leaveShop = vi.fn();
    const navigation = createLiveScreenNavigation({
      app: new AppStateController(createSurfaceAvailability("release")),
      input: { allowLock: false, discardSemanticInput: () => undefined, returnControl: () => undefined },
      runScreenFact: () => undefined,
      place: () => ({ focus: -1, scroll: 0 }),
    });
    navigation.bind({ leaveShop });
    navigation.setScreen("shop");
    expect(leaveShop).not.toHaveBeenCalled();
    navigation.setScreen("rename");
    expect(leaveShop).toHaveBeenCalledOnce();
  });
});

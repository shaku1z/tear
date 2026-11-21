import { describe, expect, it, vi } from "vitest";

import { AppStateController } from "../../src/app/interface/app-state-controller";
import { ARMED_CONFIRM_DELAY_MS } from "../../src/app/interface/armed-confirm";
import { createLiveScreenNavigation } from "../../src/app/interface/live-screen-navigation";
import { createLiveSetupShopRenderers } from "../../src/app/run/setup-shop-renderers";
import type { LiveShopFeedbackSnapshot } from "../../src/app/run/shop-feedback-state";
import { createLoadout, deleteLoadout, loadoutSummaries, renameLoadout } from "../../src/domain/cosmetic-loadouts";
import type { CosmeticChange, CosmeticState } from "../../src/domain/cosmetic-types";
import { emptyCosmeticState, mergeCosmeticStates } from "../../src/domain/cosmetics";
import { createSurfaceAvailability } from "../../src/domain/surface-availability";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";

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

  it("renames the loadout the name screen was opened for, wherever a merge moved it meanwhile", () => {
    const must = (state: CosmeticState | null): CosmeticState => {
      if (state === null) throw new Error("the operation was refused");
      return state;
    };
    // Two devices each made a loadout before they met: Boss keeps loadout_2, Daily moved to loadout_3.
    const boss = must(renameLoadout(must(createLoadout(emptyCosmeticState(), 100)), "loadout_2", "Boss", 101));
    const daily = must(renameLoadout(must(createLoadout(emptyCosmeticState(), 105)), "loadout_2", "Daily", 106));
    let cosmetics = mergeCosmeticStates(boss, daily, COSMETIC_CATALOG);
    const renderers = createLiveSetupShopRenderers(
      {
        selection: () => ({ mode: "endless", difficulty: "normal", weapon: "sword", boss: "" }),
        scroll: () => 0,
        setScroll: vi.fn(),
        time: () => 0,
        shop: () => ({ tab: "shards", displayedCoins: 0, flash: null }),
        setShop: vi.fn(),
      },
      {
        dependencies: {
          PROFILE: {
            cosmetics: () => cosmetics,
            changeCosmetics: (change: CosmeticChange) => {
              cosmetics = change(COSMETIC_CATALOG, cosmetics, 500) ?? cosmetics;
              return Promise.resolve("committed");
            },
          },
          SFX: { ui: vi.fn() },
        },
        renderers: {},
      } as never,
    );
    const names = () => loadoutSummaries(cosmetics).map((entry) => entry.name);
    const renameBoss = renderers.loadoutNameTarget("loadout_2");
    const renameDaily = renderers.loadoutNameTarget("loadout_3");
    // While both name screens are open, the other device's delete of Boss arrives and Daily moves to loadout_2.
    cosmetics = mergeCosmeticStates(cosmetics, must(deleteLoadout(boss, "loadout_2", 300)), COSMETIC_CATALOG);
    expect(names()).toEqual(["MAIN", "Daily"]);
    renameBoss?.commit("Weekly");
    expect(names()).toEqual(["MAIN", "Daily"]);
    renameDaily?.commit("Weekly");
    expect(names()).toEqual(["MAIN", "Weekly"]);
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

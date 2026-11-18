import { BOSS_ROSTER } from "../../gameplay/run/content-director";
import { buildSetupSnapshot } from "../../presentation/menu-setup-snapshots";
import { firstRunProfileFacts, isFirstRunProfile } from "../../gameplay/progression/first-run-guidance";
import { hasOwnKey } from "../../domain/records";
import { CONDITION_NAMES } from "../../gameplay/progression/condition-names";
import { COSMETIC_CATALOG } from "../../gameplay/progression/cosmetic-catalog";
import { buildShardShelves } from "../../presentation/shard-shelves-snapshot";
import { buildShopSnapshot, SHOP_TABS } from "../../presentation/shop-snapshot";
import type { MenuScreenServices, MenuScreenState } from "../screens/menu-screen-adapters";

const collectionName = (id: string): string =>
  COSMETIC_CATALOG.collections.find((entry) => entry.id === id)?.name ?? id;

export function createLiveSetupShopRenderers(state: MenuScreenState, services: MenuScreenServices) {
  const { dependencies: d, renderers } = services;
  /** Items that were new when the SHARDS tab opened: they keep their NEW badge for this visit only. */
  let freshItems: ReadonlySet<string> = new Set();
  const shards = () =>
    buildShardShelves({
      catalog: COSMETIC_CATALOG,
      state: d.PROFILE.cosmetics(),
      earned: d.PROFILE.shards(),
      facts: d.PROFILE.facts(),
      names: CONDITION_NAMES,
      collectionName,
      newItems: freshItems,
    });
  /** Grants anything already earned, then badges and marks as seen what the player holds but has not seen. */
  const openShards = async (): Promise<void> => {
    await d.PROFILE.claimCosmeticGrants();
    const cosmetics = d.PROFILE.cosmetics();
    const unseen = Object.keys(cosmetics.owned).filter((id) => !hasOwnKey(cosmetics.seen, id));
    freshItems = new Set(unseen);
    if (unseen.length > 0) await d.PROFILE.markCosmeticsSeen(unseen);
  };
  return Object.freeze({
    renderSetup(): void {
      const selected = state.selection();
      const bounties =
        selected.mode === "bossonly"
          ? undefined
          : d.DAILY.today().map((challenge) => {
              const done = d.DAILY.isDone(challenge),
                progress = d.DAILY.progress(challenge);
              return {
                label: challenge.txt(challenge.goal),
                detail: done
                  ? "✓ DONE"
                  : `${String(progress)}/${String(challenge.goal)} · +${String(challenge.shards)}⬡`,
                done,
              };
            });
      renderers.setup(
        buildSetupSnapshot({
          selectedMode: selected.mode,
          selectedDifficulty: selected.difficulty,
          tutorialDone: d.PROFILE.stat("tutorialDone"),
          firstRun: isFirstRunProfile(firstRunProfileFacts(d.PROFILE)),
          // The Square/X shortcut glyph only means something while a controller owns input.
          selectedWeapon: selected.weapon,
          selectedBoss: selected.boss,
          startGlyph: d.Input.mode === "gamepad" ? d.PAD.glyph(2) : "",
          modes: d.CONFIG.modes,
          difficulties: d.CONFIG.difficulties,
          weapons: d.WEAPONS,
          bosses: BOSS_ROSTER,
          ...(bounties === undefined ? {} : { bounties }),
          surfaces: d.surfaces,
          best: services.getBest(selected.mode, selected.difficulty),
          formatTime: services.formatTime,
        }),
      );
    },
    renderShop(): void {
      const current = state.shop(),
        realCoins = d.META.coins();
      const result = buildShopSnapshot({
        tab: current.tab,
        ...(current.tab === "shards" ? { shards: shards() } : {}),
        items: d.SHOP,
        realCoins,
        displayedCoins: current.displayedCoins,
        shopBuys: d.PROFILE.stat("shopBuys"),
        lifetimeSpent: d.META.data.lifetimeSpent,
        lifetimeEarned: d.META.data.lifetimeEarned || 0,
        height: services.height,
        scroll: state.scroll(),
        now: state.time(),
        ...(current.flash ? { flash: current.flash } : {}),
        level: (id) => d.META.level(id),
        cost: (item) => {
          const source = d.SHOP.find((entry) => entry.id === item.id);
          return source ? d.META.cost(source) : 0;
        },
        canBuy: (item) => {
          const source = d.SHOP.find((entry) => entry.id === item.id);
          return !!source && d.META.canBuy(source);
        },
      });
      state.setShop({ ...current, displayedCoins: result.displayedCoins });
      // A phone composition (compact density) measures and clamps its own scroll extent.
      if (!d.UI.density.compact) state.setScroll(services.clamp(state.scroll(), 0, result.maximumScroll));
      renderers.shop(result.view);
    },
    buyShopItem(id: string): void {
      const item = d.SHOP.find((entry) => entry.id === id);
      if (!item || !d.META.buy(item)) return;
      d.SFX.ui();
      state.setShop({ ...state.shop(), flash: { id: item.id, time: state.time() } });
      d.shopPurchaseProgressPersistence.recordPurchase();
      services.checkAchievements();
    },
    selectShopTab(id: string): void {
      const tab = SHOP_TABS.find(([entry]) => entry === id)?.[0];
      if (tab === undefined || tab === state.shop().tab) return;
      d.SFX.ui();
      state.setShop({ ...state.shop(), tab });
      state.setScroll(0);
      if (tab === "shards") void openShards();
    },
    buyCosmetic(id: string): void {
      void d.PROFILE.buyCosmetic(id).then(async (result) => {
        if (result !== "committed") return;
        d.SFX.ui();
        await d.PROFILE.markCosmeticsSeen([id]);
      });
    },
    equipCosmetic(slot: string, id: string | null): void {
      void d.PROFILE.equipCosmetic(slot, id).then((result) => {
        if (result === "committed") d.SFX.ui();
      });
    },
  });
}

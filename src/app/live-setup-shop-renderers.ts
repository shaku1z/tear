import { BOSS_ROSTER } from "../gameplay/run/content-director";
import { buildSetupSnapshot } from "../presentation/menu-setup-snapshots";
import { buildShopSnapshot } from "../presentation/shop-snapshot";
import type { MenuScreenServices, MenuScreenState } from "./live-menu-screen-adapters";

export function createLiveSetupShopRenderers(state: MenuScreenState, services: MenuScreenServices) {
  const { dependencies: d, renderers } = services;
  return Object.freeze({
    renderSetup(): void {
      const selected = state.selection();
      const bounties = selected.mode === "bossonly" ? undefined : d.DAILY.today().map((challenge) => {
        const done = d.DAILY.isDone(challenge), progress = d.DAILY.progress(challenge);
        return { label: challenge.txt(challenge.goal), detail: done ? "✓ DONE" :
          `${String(progress)}/${String(challenge.goal)} · +${String(challenge.shards)}⬡`, done };
      });
      renderers.setup(buildSetupSnapshot({ selectedMode: selected.mode, selectedDifficulty: selected.difficulty,
        selectedWeapon: selected.weapon, selectedBoss: selected.boss, modes: d.CONFIG.modes,
        difficulties: d.CONFIG.difficulties, weapons: d.WEAPONS, bosses: BOSS_ROSTER,
        ...(bounties === undefined ? {} : { bounties }), livePlatform: d.CG.live,
        best: services.getBest(selected.mode, selected.difficulty), formatTime: services.formatTime }));
    },
    renderShop(): void {
      const current = state.shop(), realCoins = d.META.coins();
      const result = buildShopSnapshot({ items: d.SHOP, realCoins, displayedCoins: current.displayedCoins,
        lifetimeEarned: d.META.data.lifetimeEarned || 0, height: services.height, scroll: state.scroll(), now: state.time(),
        ...(current.flash ? { flash: current.flash } : {}), level: (id) => d.META.level(id),
        cost: (item) => { const source = d.SHOP.find((entry) => entry.id === item.id); return source ? d.META.cost(source) : 0; },
        canBuy: (item) => { const source = d.SHOP.find((entry) => entry.id === item.id); return !!source && d.META.canBuy(source); } });
      state.setShop({ displayedCoins: result.displayedCoins, flash: current.flash });
      state.setScroll(services.clamp(state.scroll(), 0, result.maximumScroll));
      renderers.shop(result.view);
    },
    buyShopItem(id: string): void {
      const item = d.SHOP.find((entry) => entry.id === id);
      if (!item || !d.META.buy(item)) return;
      d.SFX.ui();
      state.setShop({ displayedCoins: state.shop().displayedCoins, flash: { id: item.id, time: state.time() } });
      d.PROFILE.addStat("shopBuys", 1);
      d.PROFILE.maxStat("shopMaxed", d.SHOP.filter((entry) => d.META.level(entry.id) >= entry.maxLevel).length);
      services.checkAchievements();
    },
  });
}

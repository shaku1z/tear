import { buildMenuSnapshot } from "../../presentation/menu-setup-snapshots";
import { firstRunProfileFacts, isFirstRunProfile } from "../../gameplay/progression/first-run-guidance";
import type { createLiveSetupShopRenderers } from "../run/setup-shop-renderers";
import type { LiveMenuScreenAdapters, MenuScreenServices, MenuScreenState } from "./menu-screen-adapters";

export function createLiveMenuScreenAdaptersRuntime(
  state: MenuScreenState,
  services: MenuScreenServices,
): LiveMenuScreenAdapters {
  const { dependencies: d, renderers } = services;
  let cold: ReturnType<typeof createLiveSetupShopRenderers> | undefined;
  let loading: Promise<void> | undefined;
  const ensureCold = (): void => {
    loading ??= import("../run/setup-shop-renderers").then((module) => {
      cold = module.createLiveSetupShopRenderers(state, services);
    });
  };
  return Object.freeze({
    renderMenu(): void {
      const selected = state.selection();
      d.UI.ink = "#f1eff9";
      renderers.menu(
        buildMenuSnapshot({
          username: d.PROFILE.username(),
          tutorialDone: d.PROFILE.stat("tutorialDone"),
          firstRun: isFirstRunProfile(firstRunProfileFacts(d.PROFILE)),
          campaignEmblem: d.PROFILE.data.rewards?.campaignEmblem === true,
          signedIn: d.Cloud.loggedIn(),
          coins: d.META.coins(),
          shards: d.PROFILE.shards(),
          unlocked: d.PROFILE.unlockedCount(),
          selectedMode: selected.mode,
          selectedDifficulty: selected.difficulty,
          modes: d.CONFIG.modes,
          difficulties: d.CONFIG.difficulties,
          biome: d.Attract.stage().name,
          pendingFinale: !!d.PROFILE.pendingFinale(),
          surfaces: d.surfaces,
        }),
      );
      d.UI.ink = "#000";
    },
    renderSetup(): void {
      if (cold) cold.renderSetup();
      else ensureCold();
    },
    renderShop(): void {
      if (cold) cold.renderShop();
      else ensureCold();
    },
    buyShopItem(id: string): void {
      if (cold) cold.buyShopItem(id);
      else ensureCold();
    },
    selectShopTab(id: string): void {
      if (cold) cold.selectShopTab(id);
      else ensureCold();
    },
    buyCosmetic(id: string): void {
      if (cold) cold.buyCosmetic(id);
      else ensureCold();
    },
    equipCosmetic(slot: string, id: string | null): void {
      if (cold) cold.equipCosmetic(slot, id);
      else ensureCold();
    },
  });
}

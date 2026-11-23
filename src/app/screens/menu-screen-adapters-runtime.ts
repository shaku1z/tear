import { buildMenuSnapshot } from "../../presentation/menu-setup-snapshots";
import { firstRunProfileFacts, isTutorialFirst } from "../../gameplay/progression/first-run-guidance";
import { nextTutorialLesson } from "../../gameplay/training/tutorial-lesson-ids";
import type { createLiveSetupShopRenderers } from "../run/setup-shop-renderers";
import type { LiveMenuScreenAdapters, MenuScreenServices, MenuScreenState } from "./menu-screen-adapters";
import type { CosmeticChange } from "../../domain/cosmetic-types";
import type { NameTarget } from "../../domain/display-names";

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
          ...(isTutorialFirst(firstRunProfileFacts(d.PROFILE))
            ? { tutorialFirst: nextTutorialLesson(d.PROFILE.tutorialProgress().lessons) }
            : {}),
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
    changeCosmetics(change: CosmeticChange): void {
      if (cold) cold.changeCosmetics(change);
      else ensureCold();
    },
    leaveShop(): void {
      cold?.leaveShop();
    },
    pressDeleteLoadout(id: string): void {
      if (cold) cold.pressDeleteLoadout(id);
      else ensureCold();
    },
    loadoutNameTarget(id: string): NameTarget | null {
      if (cold) return cold.loadoutNameTarget(id);
      ensureCold();
      return null;
    },
  });
}

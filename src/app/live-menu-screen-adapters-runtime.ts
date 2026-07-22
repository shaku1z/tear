import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../presentation/screens/live-screen-renderers";
import { buildMenuSnapshot } from "../presentation/menu-setup-snapshots";
import type { createLiveSetupShopRenderers } from "./live-setup-shop-renderers";

type Dependencies = Pick<GameRuntimeDependencies, "Attract" | "CG" | "Cloud" | "CONFIG" | "DAILY" | "META" |
  "PROFILE" | "SFX" | "SHOP" | "UI" | "WEAPONS">;
type ScreenRenderers = ReturnType<typeof createLiveScreenRenderers>;
type BestScore = Readonly<{ wave: number; score: number; time?: number }>;

export interface MenuScreenState {
  readonly selection: () => Readonly<{ mode: string; difficulty: string; weapon: string; boss: string }>;
  readonly scroll: () => number; readonly setScroll: (value: number) => void; readonly time: () => number;
  readonly shop: () => Readonly<{ displayedCoins: number | null; flash: Readonly<{ id: string; time: number }> | null }>;
  readonly setShop: (value: Readonly<{ displayedCoins: number | null; flash: Readonly<{ id: string; time: number }> | null }>) => void;
}

export interface MenuScreenServices {
  readonly dependencies: Dependencies; readonly renderers: ScreenRenderers; readonly height: number;
  readonly getBest: (mode: string, difficulty: string) => BestScore; readonly formatTime: (seconds: number) => string;
  readonly clamp: (value: number, minimum: number, maximum: number) => number; readonly checkAchievements: () => void;
}

export interface LiveMenuScreenAdapters {
  readonly renderMenu: () => void; readonly renderSetup: () => void; readonly renderShop: () => void;
  readonly buyShopItem: (id: string) => void;
}

export function createLiveMenuScreenAdaptersRuntime(state: MenuScreenState, services: MenuScreenServices): LiveMenuScreenAdapters {
  const { dependencies: d, renderers } = services;
  let cold: ReturnType<typeof createLiveSetupShopRenderers> | undefined;
  let loading: Promise<void> | undefined;
  const ensureCold = (): void => { loading ??= import("./live-setup-shop-renderers").then((module) => {
    cold = module.createLiveSetupShopRenderers(state, services);
  }); };
  return Object.freeze({
    renderMenu(): void {
      const selected = state.selection();
      d.UI.ink = "#f1eff9";
      renderers.menu(buildMenuSnapshot({ username: d.PROFILE.username(),
        campaignEmblem: d.PROFILE.data.rewards?.campaignEmblem === true, signedIn: d.Cloud.loggedIn(),
        coins: d.META.coins(), shards: d.PROFILE.shards(), unlocked: d.PROFILE.unlockedCount(),
        selectedMode: selected.mode, selectedDifficulty: selected.difficulty,
        modes: d.CONFIG.modes, difficulties: d.CONFIG.difficulties,
        biome: d.Attract.stage().name, pendingFinale: !!d.PROFILE.pendingFinale() }));
      d.UI.ink = "#000";
    },
    renderSetup(): void { if (cold) cold.renderSetup(); else ensureCold(); },
    renderShop(): void { if (cold) cold.renderShop(); else ensureCold(); },
    buyShopItem(id: string): void {
      if (cold) cold.buyShopItem(id); else ensureCold();
    },
  });
}

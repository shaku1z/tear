import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../presentation/screens/live-screen-renderers";
import { createLiveMenuScreenAdaptersRuntime } from "./live-menu-screen-adapters-runtime";

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

export function createLiveMenuScreenAdapters(state: MenuScreenState, services: MenuScreenServices): LiveMenuScreenAdapters {
  return createLiveMenuScreenAdaptersRuntime(state, services);
}

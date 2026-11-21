import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../../presentation/screens/live-screen-renderers";
import type { BrowserGamepad } from "../../input/browser-input-contracts";
import type { LiveShopFeedbackSnapshot } from "../run/shop-feedback-state";
import type { CosmeticChange } from "../../domain/cosmetic-types";
import type { NameTarget } from "../../domain/display-names";
import { createLiveMenuScreenAdaptersRuntime } from "./menu-screen-adapters-runtime";

type Dependencies = Pick<
  GameRuntimeDependencies,
  | "Attract"
  | "CG"
  | "Cloud"
  | "CONFIG"
  | "DAILY"
  | "Input"
  | "META"
  | "PROFILE"
  | "SFX"
  | "SHOP"
  | "shopPurchaseProgressPersistence"
  | "surfaces"
  | "UI"
  | "WEAPONS"
> &
  Readonly<{ PAD: BrowserGamepad }>;
type ScreenRenderers = ReturnType<typeof createLiveScreenRenderers>;
type BestScore = Readonly<{ wave: number; score: number; time?: number }>;

export interface MenuScreenState {
  readonly selection: () => Readonly<{ mode: string; difficulty: string; weapon: string; boss: string }>;
  readonly scroll: () => number;
  readonly setScroll: (value: number) => void;
  readonly time: () => number;
  readonly shop: () => LiveShopFeedbackSnapshot;
  readonly setShop: (value: LiveShopFeedbackSnapshot) => void;
}

export interface MenuScreenServices {
  readonly dependencies: Dependencies;
  readonly renderers: ScreenRenderers;
  readonly height: number;
  readonly getBest: (mode: string, difficulty: string) => BestScore;
  readonly formatTime: (seconds: number) => string;
  readonly clamp: (value: number, minimum: number, maximum: number) => number;
  readonly checkAchievements: () => void;
}

/** What the Shop's SHARDS tab and its tab row can ask for. */
export interface ShopShardsPort {
  readonly selectShopTab: (id: string) => void;
  readonly buyCosmetic: (id: string) => void;
  /** Commits a pure change to the cosmetic record: equip, or a loadout operation. */
  readonly changeCosmetics: (change: CosmeticChange) => void;
  /** The loadout DELETE button: the first press asks, a later deliberate press deletes. */
  readonly pressDeleteLoadout: (id: string) => void;
  /** What the name-entry screen needs to rename a loadout; null when there is no such loadout. */
  readonly loadoutNameTarget: (id: string) => NameTarget | null;
}

export interface LiveMenuScreenAdapters extends ShopShardsPort {
  readonly renderMenu: () => void;
  readonly renderSetup: () => void;
  readonly renderShop: () => void;
  readonly buyShopItem: (id: string) => void;
  /** The player left the Shop: a question it was asking is withdrawn. */
  readonly leaveShop: () => void;
}

export function createLiveMenuScreenAdapters(
  state: MenuScreenState,
  services: MenuScreenServices,
): LiveMenuScreenAdapters {
  return createLiveMenuScreenAdaptersRuntime(state, services);
}

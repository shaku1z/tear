import { createLiveScreenRenderers, type LiveScreenRendererOptions } from "../presentation/screens/live-screen-renderers";
import { createLiveLibraryScreenAdapters, type LibraryScreenAdapters,
  type LibraryScreenServices } from "./live-library-screen-adapters";
import { createLiveMenuScreenAdapters, type MenuScreenServices, type MenuScreenState } from "./live-menu-screen-adapters";
import { createLiveReplayScreenAdapter, type ReplayScreenAdapter,
  type ReplayScreenServices } from "./live-replay-screen-adapter";
import { createLiveRunScreenAdapters, type RunScreenServices, type RunScreenState } from "./live-run-screen-adapters";
import { createLiveScreenActionBindings, type ScreenActionBindingPorts } from "./live-screen-action-bindings";
import { createLiveSettingsRenameAdapters, type SettingsRenameAdapters,
  type SettingsRenameServices } from "./live-settings-rename-adapters";
import type { LegacyAppScreen } from "./legacy-state-controller";

type RendererBase = Omit<LiveScreenRendererOptions, "dispatch" | "renderPreview">;
type ReplayBase = Omit<ReplayScreenServices, "renderers" | "categories" | "fallbackCategory" | "specialColor">;
type LibraryBase = Omit<LibraryScreenServices, "renderers" | "enterReplay">;
type SettingsBase = Omit<SettingsRenameServices, "renderers" | "setCodexGuide">;
type RunServicesBase = Omit<RunScreenServices, "renderers" | "categories" | "fallbackCategory" |
  "categoryOrder" | "specialColor" | "abilityBadge">;
type MenuServicesBase = Omit<MenuScreenServices, "renderers">;
type ActionBase = Omit<ScreenActionBindingPorts, "chooseDraft" | "rerollDraft" | "chooseReserve" |
  "chooseTier" | "quitRun" | "revive" | "buyShopItem" | "library" | "replay" | "settings">;

export interface LiveScreenPresentationOptions {
  readonly renderer: RendererBase;
  readonly replay: ReplayBase;
  readonly library: LibraryBase;
  readonly settings: SettingsBase;
  readonly actions: ActionBase;
  readonly runState: RunScreenState;
  readonly runServices: RunServicesBase;
  readonly menuState: MenuScreenState;
  readonly menuServices: MenuServicesBase;
  readonly playground: Readonly<{ renderMenu: () => void; renderLab: () => void }>;
}

export interface LiveScreenPresentationComposition {
  readonly library: LibraryScreenAdapters;
  readonly replay: ReplayScreenAdapter;
  readonly settings: SettingsRenameAdapters;
  readonly renderers: Readonly<Record<LegacyAppScreen, () => void>>;
  readonly modelRenderers: ReturnType<typeof createLiveScreenRenderers>;
  readonly chooseUpgrade: (index: number) => void;
  readonly chooseReserve: (index: number) => void;
  readonly rerollDraft: () => void;
}

function isLegacyScreen(value: string): value is LegacyAppScreen {
  return ["menu", "setup", "playing", "paused", "draft", "reserve", "tierup", "settings",
    "continue", "gameover", "win", "replay", "confirmquit", "shop", "codex", "profile",
    "achievements", "leaderboards", "rename", "pgmenu", "pglab"].includes(value);
}

/** Resolves the deliberately lazy screen-adapter cycle behind one strict composition boundary. */
export function createLiveScreenPresentationComposition(
  options: LiveScreenPresentationOptions,
): LiveScreenPresentationComposition {
  const renderer = createLiveScreenRenderers({
    ...options.renderer,
    dispatch: (action) => { dispatch(action); },
    renderPreview: (id, bounds) => { library.drawReplayPreview(id, bounds); },
  });
  const replay: ReplayScreenAdapter = createLiveReplayScreenAdapter({
    ...options.replay, renderers: renderer,
    categories: () => library.categories,
    fallbackCategory: () => library.fallbackCategory,
    specialColor: () => library.specialColor,
  });
  const library: LibraryScreenAdapters = createLiveLibraryScreenAdapters({
    ...options.library, renderers: renderer,
    enterReplay: (record, from) => replay.enter(record, isLegacyScreen(from) ? from : "profile"),
  });
  const settings: SettingsRenameAdapters = createLiveSettingsRenameAdapters({
    ...options.settings, renderers: renderer,
    setCodexGuide: () => { options.actions.setScreen("codex"); library.selectCodexTab("guide"); },
  });
  const run = createLiveRunScreenAdapters(options.runState, {
    ...options.runServices, renderers: renderer,
    categories: () => library.categories, fallbackCategory: () => library.fallbackCategory,
    categoryOrder: library.categoryOrder, specialColor: library.specialColor, abilityBadge: library.abilityBadge,
  });
  const menu = createLiveMenuScreenAdapters(options.menuState, { ...options.menuServices, renderers: renderer });
  const dispatch = createLiveScreenActionBindings({
    ...options.actions,
    chooseDraft: run.chooseUpgrade, rerollDraft: run.rerollDraft,
    chooseReserve: run.chooseReserve, chooseTier: run.chooseTierUp,
    quitRun: run.quitRun, revive: run.reviveByAd, buyShopItem: menu.buyShopItem,
    library, replay, settings,
  });

  return Object.freeze({
    library, replay, settings, modelRenderers: renderer,
    renderers: Object.freeze({
      menu: menu.renderMenu, setup: menu.renderSetup, playing: () => undefined, paused: run.renderPaused,
      draft: run.renderDraft, reserve: run.renderReserve, tierup: run.renderTierUp,
      settings: settings.renderSettings, continue: run.renderContinue, gameover: run.renderGameover,
      win: run.renderWin, replay: replay.render, confirmquit: run.renderConfirmQuit, shop: menu.renderShop,
      codex: library.renderCodex, profile: library.renderProfile, achievements: library.renderAchievements,
      leaderboards: library.renderLeaderboards, rename: settings.renderRename,
      pgmenu: options.playground.renderMenu, pglab: options.playground.renderLab,
    }),
    chooseUpgrade: run.chooseUpgrade, chooseReserve: run.chooseReserve, rerollDraft: run.rerollDraft,
  });
}

import { createLiveScreenRenderers, type LiveScreenRendererOptions } from "../../presentation/screens/live-screen-renderers";
import { createLiveLibraryScreenAdapters, type LibraryScreenAdapters,
  type LibraryScreenServices } from "../library/library-screen-adapters";
import { createLiveMenuScreenAdapters, type MenuScreenServices, type MenuScreenState } from "../screens/menu-screen-adapters";
import { createLiveReplayEditor, type ReplayEditorAdapter as ReplayScreenAdapter,
  type ReplayEditorServices as ReplayScreenServices } from "../engineering/replay-editor";
import { createLiveRunScreenAdapters, type RunScreenServices, type RunScreenState } from "../run/run-screen-adapters";
import { createLiveScreenActionBindings, gateScreenActions, type ScreenActionBindingPorts } from "./screen-action-bindings";
import { screenActionAvailable, type SurfaceAvailability } from "../../domain/surface-availability";
import { createLiveSettingsRenameAdapters, type SettingsRenameAdapters,
  type SettingsRenameServices } from "../screens/settings-rename-adapters";
import type { AppScreen } from "./app-state-controller";
import type { AcademyScreenView } from "../../presentation/screens/contracts";
import type { FoundryScreenView } from "../../presentation/screens/contracts";
import type { GhostLabScreenView } from "../../presentation/screens/contracts";
import type { BotEvidenceScreenView, GhostPublicationScreenView, GhostSupportScreenView } from "../../presentation/screens/contracts";

type RendererBase = Omit<LiveScreenRendererOptions, "dispatch" | "renderPreview">;
type ReplayBase = Omit<ReplayScreenServices, "renderers" | "categories" | "fallbackCategory" | "specialColor">;
type LibraryBase = Omit<LibraryScreenServices, "renderers" | "enterReplay" | "enterGhostTheater" | "enterGhostComparison">;
type SettingsBase = Omit<SettingsRenameServices, "renderers" | "setCodexGuide">;
type RunServicesBase = Omit<RunScreenServices, "renderers" | "categories" | "fallbackCategory" |
  "categoryOrder" | "specialColor" | "abilityBadge">;
type MenuServicesBase = Omit<MenuScreenServices, "renderers">;
type ActionBase = Omit<ScreenActionBindingPorts, "chooseDraft" | "rerollDraft" | "chooseReserve" |
  "chooseTier" | "quitRun" | "revive" | "buyShopItem" | "library" | "replay" | "settings">;

export interface LiveScreenPresentationOptions {
  /** Release builds neither draw, focus nor dispatch controls for unavailable surfaces. */
  readonly surfaces: SurfaceAvailability;
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
  readonly academy: () => AcademyScreenView;
  readonly foundry: () => FoundryScreenView;
  readonly ghostLab: () => GhostLabScreenView;
  readonly botEvidence: () => BotEvidenceScreenView;
  readonly ghostPublication: () => GhostPublicationScreenView;
  readonly ghostSupport: () => GhostSupportScreenView;
}

export interface LiveScreenPresentationComposition {
  readonly library: LibraryScreenAdapters;
  readonly replay: ReplayScreenAdapter;
  readonly settings: SettingsRenameAdapters;
  readonly renderers: Readonly<Record<AppScreen, () => void>>;
  readonly modelRenderers: ReturnType<typeof createLiveScreenRenderers>;
  readonly chooseUpgrade: (index: number) => void;
  readonly chooseReserve: (index: number) => void;
  readonly chooseTier: (index: number) => void;
  readonly rerollDraft: () => void;
  readonly dispatch: ReturnType<typeof createLiveScreenActionBindings>;
}

function isAppScreen(value: string): value is AppScreen {
  return ["menu", "setup", "playing", "paused", "draft", "reserve", "tierup", "settings",
    "continue", "gameover", "win", "replay", "confirmquit", "shop", "codex", "profile",
    "achievements", "leaderboards", "rename", "pgmenu", "pglab", "academy", "foundry", "ghostlab", "botevidence", "ghostpublication", "ghostsupport"].includes(value);
}

/** Resolves the deliberately lazy screen-adapter cycle behind one strict composition boundary. */
export function createLiveScreenPresentationComposition(
  options: LiveScreenPresentationOptions,
): LiveScreenPresentationComposition {
  const renderer = createLiveScreenRenderers({
    ...options.renderer,
    // The shared UI scroll; a phone composition writes back the scroll it clamped to its own extent.
    setScroll: options.library.setScroll,
    // Controls for unavailable surfaces are never enqueued, so they are not drawn and never take focus.
    enqueue: (button) => { if (screenActionAvailable(options.surfaces, button.semanticAction)) options.renderer.enqueue(button); },
    available: (action) => screenActionAvailable(options.surfaces, action),
    dispatch: (action) => { dispatch(action); },
    renderPreview: (id, bounds) => {
      if (id.startsWith("creature:")) library.drawCreaturePreview(id.slice("creature:".length), bounds);
      else library.drawReplayPreview(id, bounds);
    },
  });
  const replay: ReplayScreenAdapter = createLiveReplayEditor({
    ...options.replay, renderers: renderer,
    categories: () => library.categories,
    fallbackCategory: () => library.fallbackCategory,
    specialColor: () => library.specialColor,
  });
  const library: LibraryScreenAdapters = createLiveLibraryScreenAdapters({
    ...options.library, renderers: renderer,
    enterReplay: (record, from) => replay.enter(record, isAppScreen(from) ? from : "profile"),
    enterGhostTheater: (id) => replay.enterGhostCapsule(id, "profile"),
    enterCareerSource: async (id, command, expectedManifestHash) => {
      if (command === "race") { await options.library.chase?.chooseRace?.(id, expectedManifestHash); return; }
      if (command === "chase") { await options.library.chase?.choose(id, expectedManifestHash); return; }
      if (command === "download") { options.actions.ghostFiles.downloadArchive(id); return; }
      if (command === "publish") { options.actions.openGhostPublication(id); return; }
      const result = await replay.enterGhostCapsule(id, "profile");
      if (result.kind === "refused") throw new Error(result.detail);
      if (command === "coach") replay.openCoach(); else if (command === "challenge") replay.openChallenges();
    },
    enterGhostComparison: (ids) => replay.enterGhostComparison(ids, "profile"),
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
  const dispatch = gateScreenActions(options.surfaces, createLiveScreenActionBindings({
    ...options.actions,
    chooseDraft: run.chooseUpgrade, rerollDraft: run.rerollDraft,
    chooseReserve: run.chooseReserve, chooseTier: run.chooseTierUp,
    quitRun: run.quitRun, revive: run.reviveByAd, buyShopItem: menu.buyShopItem,
    library, replay, settings,
  }));

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
      academy: () => { renderer.academy(options.academy()); },
      foundry: () => { renderer.foundry(options.foundry()); },
      ghostlab: () => { renderer.ghostlab(options.ghostLab()); },
      botevidence: () => { renderer.botevidence(options.botEvidence()); },
      ghostpublication: () => { renderer.ghostpublication(options.ghostPublication()); },
      ghostsupport: () => { renderer.ghostsupport(options.ghostSupport()); },
    }),
    chooseUpgrade: run.chooseUpgrade, chooseReserve: run.chooseReserve, chooseTier: run.chooseTierUp,
    rerollDraft: run.rerollDraft, dispatch,
  });
}

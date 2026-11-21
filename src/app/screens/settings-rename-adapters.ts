import type { SettingsRenameServices as RuntimeServices } from "./settings-rename-adapters-runtime";
import type { createLiveScreenRenderers } from "../../presentation/screens/live-screen-renderers";
import type { AppScreen } from "../../domain/screen-catalog";
import type { RenameSnapshot } from "./rename-controller";
import { MAX_PLAYER_NAME, MIN_PLAYER_NAME, type NameTarget } from "../../domain/display-names";
import type { SettingsController, GameSettings } from "./settings-controller";

type Renderers = ReturnType<typeof createLiveScreenRenderers>;

export interface SettingsRenameServices {
  readonly dependencies: RuntimeServices["dependencies"];
  readonly document: Document;
  readonly window: Window;
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly overscan: () => Readonly<{ x: number; y: number }>;
  readonly screen: () => AppScreen;
  readonly setScreen: (screen: AppScreen, context?: Readonly<{ returnTo: AppScreen }>) => void;
  readonly settingsController: SettingsController;
  readonly settings: GameSettings;
  readonly renderers: Renderers;
  readonly scroll: () => number;
  readonly setScroll: (value: number) => void;
  readonly stepTab: (tabs: readonly (readonly [string, string])[], current: string, changed: () => void) => string;
  readonly clamp: (value: number, minimum: number, maximum: number) => number;
  readonly installPrompt: Readonly<{ available: boolean; prompt(): void }>;
  readonly setCodexGuide: () => void;
}

export interface SettingsRenameAdapters {
  readonly renderSettings: () => void;
  readonly renderRename: () => void;
  readonly renderMusic: () => void;
  readonly selectSettingsTab: (id: string) => void;
  /** MUSIC page: "home", "radio", "songs", "settings" or "collection:<id>". */
  readonly selectMusicPage: (page: string) => void;
  /** Make a music pick the player can make now (the Radio page's PLAY), saved like the Settings row. */
  readonly pickMusic: (value: string) => void;
  readonly stepSetting: (key: string, direction: number) => void;
  readonly toggleSetting: (key: string) => void;
  readonly activateSetting: (key: string) => void;
  readonly beginRename: (firstRun: boolean, debugBypass?: boolean) => void;
  /** Opens the name-entry screen on another name than the player's (a loadout's). */
  readonly beginNaming: (target: NameTarget) => void;
  readonly submitRename: () => void;
  readonly cancelRename: () => void;
  readonly renameSnapshot: () => RenameSnapshot;
  readonly renameActive: () => boolean;
  readonly renamePrompted: () => boolean;
  readonly markRenamePrompted: () => void;
}

type DeferredAction = (runtime: SettingsRenameAdapters) => void;
/** A name entry asked for before the runtime loaded: the player name, or another target. */
type PendingBegin = Readonly<{ firstRun: boolean; bypass: boolean }> | Readonly<{ target: NameTarget }>;
const beginPending = (runtime: SettingsRenameAdapters, pending: PendingBegin): void => {
  if ("target" in pending) runtime.beginNaming(pending.target);
  else runtime.beginRename(pending.firstRun, pending.bypass);
};

/** Route-lazy settings and rename controller facade. */
export function createLiveSettingsRenameAdapters(services: SettingsRenameServices): SettingsRenameAdapters {
  let runtime: SettingsRenameAdapters | undefined;
  let loading: Promise<void> | undefined;
  let prompted = false;
  let pendingBegin: PendingBegin | undefined;
  const deferred: DeferredAction[] = [];
  function ensureLoaded(): void {
    loading ??= import("./settings-rename-adapters-runtime").then((module) => {
      runtime = module.createLiveSettingsRenameAdaptersRuntime(services);
      if (prompted) runtime.markRenamePrompted();
      if (pendingBegin !== undefined) beginPending(runtime, pendingBegin);
      pendingBegin = undefined;
      for (const action of deferred.splice(0)) action(runtime);
    });
  }
  function invoke(action: DeferredAction): void {
    if (runtime) action(runtime);
    else {
      if (deferred.length >= 24) deferred.shift();
      deferred.push(action);
      ensureLoaded();
    }
  }
  function render(action: DeferredAction): void {
    if (runtime) action(runtime);
    else ensureLoaded();
  }
  const adapters: SettingsRenameAdapters = {
    renderSettings: () => {
      render((value) => {
        value.renderSettings();
      });
    },
    renderRename: () => {
      render((value) => {
        value.renderRename();
      });
    },
    renderMusic: () => {
      render((value) => {
        value.renderMusic();
      });
    },
    selectSettingsTab: (id) => {
      invoke((value) => {
        value.selectSettingsTab(id);
      });
    },
    selectMusicPage: (page) => {
      invoke((value) => {
        value.selectMusicPage(page);
      });
    },
    stepSetting: (key, direction) => {
      invoke((value) => {
        value.stepSetting(key, direction);
      });
    },
    toggleSetting: (key) => {
      invoke((value) => {
        value.toggleSetting(key);
      });
    },
    activateSetting: (key) => {
      invoke((value) => {
        value.activateSetting(key);
      });
    },
    pickMusic: (pick) => {
      invoke((value) => {
        value.pickMusic(pick);
      });
    },
    beginRename: (firstRun, bypass = false) => {
      if (runtime) runtime.beginRename(firstRun, bypass);
      else {
        pendingBegin = { firstRun, bypass };
        ensureLoaded();
      }
    },
    beginNaming: (target) => {
      if (runtime) runtime.beginNaming(target);
      else {
        pendingBegin = { target };
        ensureLoaded();
      }
    },
    submitRename: () => {
      invoke((value) => {
        value.submitRename();
      });
    },
    cancelRename: () => {
      invoke((value) => {
        value.cancelRename();
      });
    },
    renameSnapshot: () => {
      if (runtime) return runtime.renameSnapshot();
      const target = pendingBegin && "target" in pendingBegin ? pendingBegin.target : undefined;
      return {
        active: pendingBegin !== undefined,
        error: "",
        firstRun: pendingBegin && "firstRun" in pendingBegin ? pendingBegin.firstRun : false,
        previous: services.screen(),
        value: target?.initial ?? services.dependencies.PROFILE.username(),
        subject: target?.subject ?? "player",
        minLength: target?.minLength ?? MIN_PLAYER_NAME,
        maxLength: target?.maxLength ?? MAX_PLAYER_NAME,
      };
    },
    renameActive: () => runtime?.renameActive() ?? pendingBegin !== undefined,
    renamePrompted: () => runtime?.renamePrompted() ?? prompted,
    markRenamePrompted: () => {
      prompted = true;
      if (runtime) runtime.markRenamePrompted();
    },
  };
  return Object.freeze(adapters);
}

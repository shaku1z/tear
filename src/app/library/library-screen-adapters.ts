import { lazyModuleReady } from "../../domain/lazy-module";
import { replayEngine } from "../../ghost/replay-engine";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../../presentation/screens/live-screen-renderers";
import type { BrowserGamepad } from "../../input/browser-input-contracts";
import { ABILITY_CATEGORY_ORDER, SPECIAL_ABILITY_COLOR, abilityBadge } from "../../presentation/codex-snapshots";
import type { ReplayFilePort } from "../replay/browser-replay-files";

type Dependencies = Pick<
  GameRuntimeDependencies,
  | "ACH"
  | "AFFIXES"
  | "Aldric"
  | "Armored"
  | "Bomber"
  | "Charger"
  | "Chimera"
  | "Colossus"
  | "Echo"
  | "Flyer"
  | "Ranged"
  | "Rootbinder"
  | "Rootbound"
  | "Source"
  | "Support"
  | "VARIANTS"
  | "Warden"
  | "Wraith"
  | "applyVariant"
  | "Cloud"
  | "CONFIG"
  | "DAILY"
  | "FirebaseProvider"
  | "fullscreen"
  | "META"
  | "PROFILE"
  | "STAGES"
  | "UI"
  | "UPGRADES"
  | "VAULT"
> &
  Readonly<{ PAD: BrowserGamepad }>;
type Renderers = ReturnType<typeof createLiveScreenRenderers>;
type Category = Readonly<{ name: string; color: string }>;

export interface LibraryScreenServices {
  readonly dependencies: Dependencies;
  readonly renderers: Renderers;
  readonly canvas: CanvasRenderingContext2D;
  readonly height: number;
  readonly time: () => number;
  readonly enterSeconds: () => number;
  readonly scroll: () => number;
  readonly setScroll: (value: number) => void;
  readonly stepTab: (tabs: readonly (readonly [string, string])[], current: string, changed: () => void) => string;
  readonly clamp: (value: number, minimum: number, maximum: number) => number;
  readonly ease: (value: number) => number;
  readonly formatTime: (seconds: number) => string;
  readonly getBest: (mode: string, difficulty: string) => Readonly<{ wave: number; score: number; time?: number }>;
  /** Where kept replay records are stored (the `tear-replays` IndexedDB database). */
  readonly browserIndexedDb: IDBFactory | undefined;
  /** The browser file picker and download; undefined where the browser has none. */
  readonly replayFiles: ReplayFilePort | undefined;
  readonly enterReplay: (record: unknown, from: string) => boolean;
  /** Opens a kept record on the replay screen; false when it cannot be played. */
  readonly watchRecord: (key: string) => Promise<boolean>;
}

/** The REPLAYS list's row and list actions (src/app/replay/replay-list-controller.ts). */
export interface ReplayListActions {
  readonly filter: (id: string) => void;
  readonly watch: (id: string) => void;
  readonly share: (id: string) => void;
  readonly download: (id: string) => void;
  readonly pin: (id: string, pinned: boolean) => void;
  readonly remove: (id: string) => void;
  readonly importFile: () => void;
}

export interface LibraryScreenAdapters {
  readonly categories: Readonly<Record<string, Category>>;
  readonly fallbackCategory: Category;
  readonly categoryOrder: readonly string[];
  readonly specialColor: string;
  readonly abilityBadge: (
    upgrade: GameRuntimeDependencies["UPGRADES"][number],
  ) => Readonly<{ label: string; color: string }>;
  readonly renderCodex: () => void;
  readonly renderProfile: () => void;
  readonly renderAchievements: () => void;
  readonly renderLeaderboards: () => void;
  readonly drawReplayPreview: (
    source: string,
    bounds: Readonly<{ x: number; y: number; w: number; h: number }>,
  ) => void;
  readonly drawCreaturePreview: (
    name: string,
    bounds: Readonly<{ x: number; y: number; w: number; h: number }>,
  ) => void;
  readonly selectCodexTab: (id: string) => void;
  readonly selectCodexFilter: (id: string) => void;
  readonly cycleCodexSort: () => void;
  readonly inspectCodexAbility: (id: string) => void;
  readonly selectProfileTab: (id: string) => void;
  readonly setProfileMessage: (message: string) => void;
  readonly selectAchievementCategory: (id: string) => void;
  readonly selectLeaderboardTab: (id: string) => void;
  readonly selectLeaderboardBoard: (id: string) => void;
  /** Watches a leaderboard or feed replay. */
  readonly watchReplay: (id: string, from?: "profile" | "leaderboards") => void;
  readonly replays: ReplayListActions;
}

type DeferredAction = (adapters: LibraryScreenAdapters) => void;

/** Lazy facade for archive/profile views that are not needed during game startup. */
export function createLiveLibraryScreenAdapters(services: LibraryScreenServices): LibraryScreenAdapters {
  const colors = services.dependencies.CONFIG.colors;
  const categories: Readonly<Record<string, Category>> = Object.freeze({
    offense: { name: "OFFENSE", color: colors.charger },
    throw: { name: "THROW", color: colors.bomber },
    parry: { name: "PARRY", color: colors.perfect },
    mobility: { name: "MOBILITY", color: colors.ranged },
    resilience: { name: "RESILIENCE", color: colors.deflected },
    utility: { name: "UTILITY", color: colors.armored },
  });
  const fallbackCategory = categories.utility ?? { name: "UTILITY", color: colors.armored };
  let runtime: LibraryScreenAdapters | undefined;
  let loading: Promise<void> | undefined;
  const deferred: DeferredAction[] = [];

  function ensureLoaded(): void {
    loading ??= import("./library-screen-adapters-runtime").then((module) => {
      runtime = module.createLiveLibraryScreenAdaptersRuntime(services);
      for (const action of deferred.splice(0)) action(runtime);
    });
  }
  function invoke(action: DeferredAction): void {
    if (runtime) action(runtime);
    else {
      deferred.push(action);
      ensureLoaded();
    }
  }
  /** Replaying, verifying or opening a ghost needs the replay engine: wait line, then run (or one retryable message). */
  function invokeReplay(action: DeferredAction): void {
    const announce = (message: string): void => {
      invoke((value) => {
        value.setProfileMessage(message);
      });
    };
    void lazyModuleReady(replayEngine, announce, "Loading replay code…").then((ready) => {
      if (ready) invoke(action);
    });
  }
  function render(renderNow: DeferredAction): void {
    if (runtime) renderNow(runtime);
    else ensureLoaded();
  }

  const replays: ReplayListActions = Object.freeze({
    filter: (id: string) => {
      invoke((value) => {
        value.replays.filter(id);
      });
    },
    watch: (id: string) => {
      invokeReplay((value) => {
        value.replays.watch(id);
      });
    },
    share: (id: string) => {
      invoke((value) => {
        value.replays.share(id);
      });
    },
    download: (id: string) => {
      invoke((value) => {
        value.replays.download(id);
      });
    },
    pin: (id: string, pinned: boolean) => {
      invoke((value) => {
        value.replays.pin(id, pinned);
      });
    },
    remove: (id: string) => {
      invoke((value) => {
        value.replays.remove(id);
      });
    },
    // The file picker needs the click that asked for it; the list is drawn, so its code is loaded.
    importFile: () => {
      invoke((value) => {
        value.replays.importFile();
      });
    },
  });
  const adapters: LibraryScreenAdapters = {
    replays,
    categories,
    fallbackCategory,
    categoryOrder: ABILITY_CATEGORY_ORDER,
    specialColor: SPECIAL_ABILITY_COLOR,
    abilityBadge: (upgrade) =>
      abilityBadge(upgrade, services.dependencies.UI.t.color.unique, services.dependencies.UI.t.color.muted),
    renderCodex: () => {
      render((value) => {
        value.renderCodex();
      });
    },
    renderProfile: () => {
      render((value) => {
        value.renderProfile();
      });
    },
    renderAchievements: () => {
      render((value) => {
        value.renderAchievements();
      });
    },
    renderLeaderboards: () => {
      render((value) => {
        value.renderLeaderboards();
      });
    },
    drawReplayPreview: (source, bounds) => {
      render((value) => {
        value.drawReplayPreview(source, bounds);
      });
    },
    drawCreaturePreview: (name, bounds) => {
      render((value) => {
        value.drawCreaturePreview(name, bounds);
      });
    },
    selectCodexTab: (id) => {
      invoke((value) => {
        value.selectCodexTab(id);
      });
    },
    selectCodexFilter: (id) => {
      invoke((value) => {
        value.selectCodexFilter(id);
      });
    },
    cycleCodexSort: () => {
      invoke((value) => {
        value.cycleCodexSort();
      });
    },
    inspectCodexAbility: (id) => {
      invoke((value) => {
        value.inspectCodexAbility(id);
      });
    },
    selectProfileTab: (id) => {
      invoke((value) => {
        value.selectProfileTab(id);
      });
    },
    setProfileMessage: (message) => {
      invoke((value) => {
        value.setProfileMessage(message);
      });
    },
    selectAchievementCategory: (id) => {
      invoke((value) => {
        value.selectAchievementCategory(id);
      });
    },
    selectLeaderboardTab: (id) => {
      invoke((value) => {
        value.selectLeaderboardTab(id);
      });
    },
    selectLeaderboardBoard: (id) => {
      invoke((value) => {
        value.selectLeaderboardBoard(id);
      });
    },
    watchReplay: (id, from) => {
      invokeReplay((value) => {
        value.watchReplay(id, from);
      });
    },
  };
  return Object.freeze(adapters);
}

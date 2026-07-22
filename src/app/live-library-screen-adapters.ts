import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../presentation/screens/live-screen-renderers";
import { ABILITY_CATEGORY_ORDER, SPECIAL_ABILITY_COLOR, abilityBadge } from "../presentation/codex-snapshots";

type Dependencies = Pick<GameRuntimeDependencies, "ACH" | "AFFIXES" | "Aldric" | "Armored" | "Bomber" | "Charger" |
  "Chimera" | "Colossus" | "Echo" | "Flyer" | "Ranged" | "Support" | "VARIANTS" | "Warden" | "Wraith" | "applyVariant" |
  "Cloud" | "CONFIG" | "DAILY" | "FirebaseProvider" |
  "META" | "PROFILE" | "STAGES" | "UI" | "UPGRADES" | "VAULT">;
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
  readonly enterReplay: (record: unknown, from: string) => boolean;
}

export interface LibraryScreenAdapters {
  readonly categories: Readonly<Record<string, Category>>;
  readonly fallbackCategory: Category;
  readonly categoryOrder: readonly string[];
  readonly specialColor: string;
  readonly abilityBadge: (upgrade: GameRuntimeDependencies["UPGRADES"][number]) => Readonly<{ label: string; color: string }>;
  readonly renderCodex: () => void;
  readonly renderProfile: () => void;
  readonly renderAchievements: () => void;
  readonly renderLeaderboards: () => void;
  readonly drawReplayPreview: (source: string, bounds: Readonly<{ x: number; y: number; w: number; h: number }>) => void;
  readonly drawCreaturePreview: (name: string, bounds: Readonly<{ x: number; y: number; w: number; h: number }>) => void;
  readonly selectCodexTab: (id: string) => void;
  readonly selectCodexFilter: (id: string) => void;
  readonly cycleCodexSort: () => void;
  readonly inspectCodexAbility: (id: string) => void;
  readonly selectProfileTab: (id: string) => void;
  readonly setProfileMessage: (message: string) => void;
  readonly selectAchievementCategory: (id: string) => void;
  readonly selectLeaderboardTab: (id: string) => void;
  readonly selectLeaderboardBoard: (id: string) => void;
  readonly watchReplay: (id: string) => void;
  readonly publishReplay: (id: string) => void;
}

type DeferredAction = (adapters: LibraryScreenAdapters) => void;

/** Lazy facade for archive/profile views that are not needed during game startup. */
export function createLiveLibraryScreenAdapters(services: LibraryScreenServices): LibraryScreenAdapters {
  const colors = services.dependencies.CONFIG.colors;
  const categories: Readonly<Record<string, Category>> = Object.freeze({
    offense: { name: "OFFENSE", color: colors.charger }, throw: { name: "THROW", color: colors.bomber },
    parry: { name: "PARRY", color: colors.perfect }, mobility: { name: "MOBILITY", color: colors.ranged },
    resilience: { name: "RESILIENCE", color: colors.deflected }, utility: { name: "UTILITY", color: colors.armored },
  });
  const fallbackCategory = categories.utility ?? { name: "UTILITY", color: colors.armored };
  let runtime: LibraryScreenAdapters | undefined;
  let loading: Promise<void> | undefined;
  const deferred: DeferredAction[] = [];

  function ensureLoaded(): void {
    loading ??= import("./live-library-screen-adapters-runtime").then((module) => {
      runtime = module.createLiveLibraryScreenAdaptersRuntime(services);
      for (const action of deferred.splice(0)) action(runtime);
    });
  }
  function invoke(action: DeferredAction): void {
    if (runtime) action(runtime);
    else { deferred.push(action); ensureLoaded(); }
  }
  function render(renderNow: DeferredAction): void {
    if (runtime) renderNow(runtime);
    else ensureLoaded();
  }

  const adapters: LibraryScreenAdapters = {
    categories, fallbackCategory, categoryOrder: ABILITY_CATEGORY_ORDER, specialColor: SPECIAL_ABILITY_COLOR,
    abilityBadge: (upgrade) => abilityBadge(upgrade, services.dependencies.UI.t.color.unique, services.dependencies.UI.t.color.muted),
    renderCodex: () => { render((value) => { value.renderCodex(); }); },
    renderProfile: () => { render((value) => { value.renderProfile(); }); },
    renderAchievements: () => { render((value) => { value.renderAchievements(); }); },
    renderLeaderboards: () => { render((value) => { value.renderLeaderboards(); }); },
    drawReplayPreview: (source, bounds) => { render((value) => { value.drawReplayPreview(source, bounds); }); },
    drawCreaturePreview: (name, bounds) => { render((value) => { value.drawCreaturePreview(name, bounds); }); },
    selectCodexTab: (id) => { invoke((value) => { value.selectCodexTab(id); }); },
    selectCodexFilter: (id) => { invoke((value) => { value.selectCodexFilter(id); }); },
    cycleCodexSort: () => { invoke((value) => { value.cycleCodexSort(); }); },
    inspectCodexAbility: (id) => { invoke((value) => { value.inspectCodexAbility(id); }); },
    selectProfileTab: (id) => { invoke((value) => { value.selectProfileTab(id); }); },
    setProfileMessage: (message) => { invoke((value) => { value.setProfileMessage(message); }); },
    selectAchievementCategory: (id) => { invoke((value) => { value.selectAchievementCategory(id); }); },
    selectLeaderboardTab: (id) => { invoke((value) => { value.selectLeaderboardTab(id); }); },
    selectLeaderboardBoard: (id) => { invoke((value) => { value.selectLeaderboardBoard(id); }); },
    watchReplay: (id) => { invoke((value) => { value.watchReplay(id); }); },
    publishReplay: (id) => { invoke((value) => { value.publishReplay(id); }); },
  };
  return Object.freeze(adapters);
}

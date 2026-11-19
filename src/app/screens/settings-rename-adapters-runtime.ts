import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../../presentation/screens/live-screen-renderers";
import type { AppScreen } from "../../domain/screen-catalog";
import { RenameController, type RenameSnapshot } from "./rename-controller";
import type { SettingsController, GameSettings } from "./settings-controller";
import { buildSettingsSections } from "../../presentation/settings-snapshots";
import { formatBuildLabel } from "../../platform/build-identity";
import { musicPickChoices } from "../../audio/music/music-source";
import { normalizeMusicSettingsTab } from "../../audio/music/settings";
import { getMusicLibrary } from "../../audio/music/library";
import { getNowPlaying } from "../../audio/music/now-playing";
import { getMusicPreview, getMusicQueue } from "../../audio/music/preview";
import { buildMusicScreenView } from "../../presentation/music-snapshots";

type Dependencies = Pick<
  GameRuntimeDependencies,
  "APP" | "GFX" | "Input" | "PAD" | "PROFILE" | "Cloud" | "PwaUpdate" | "UI" | "build"
>;
type Renderers = ReturnType<typeof createLiveScreenRenderers>;

export interface SettingsRenameServices {
  readonly dependencies: Dependencies;
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
  readonly selectMusicPage: (page: string) => void;
  readonly pickMusic: (value: string) => void;
  readonly stepSetting: (key: string, direction: number) => void;
  readonly toggleSetting: (key: string) => void;
  readonly activateSetting: (key: string) => void;
  readonly beginRename: (firstRun: boolean, debugBypass?: boolean) => void;
  readonly submitRename: () => void;
  readonly cancelRename: () => void;
  readonly renameSnapshot: () => RenameSnapshot;
  readonly renameActive: () => boolean;
  readonly renamePrompted: () => boolean;
  readonly markRenamePrompted: () => void;
}

const presetOrder = ["default", "standard", "tear", "classic", "split"] as const;
const settingsTabs = [
  ["general", "GENERAL"],
  ["controls", "CONTROLS"],
  ["audio", "AUDIO"],
  ["video", "VIDEO"],
  ["accessibility", "ACCESS"],
] as const;

export function createLiveSettingsRenameAdaptersRuntime(services: SettingsRenameServices): SettingsRenameAdapters {
  const d = services.dependencies;
  let settingsTab = "general",
    maximumScroll = 0,
    musicPage = "home",
    musicOpenedFrom = "home";
  const rename = new RenameController({
    document: services.document,
    canvas: services.canvas,
    logicalWidth: services.width,
    overscan: services.overscan,
    screen: services.screen,
    replayReturn: () => d.APP.replayReturn,
    setScreen: services.setScreen,
    input: d.Input,
    profile: d.PROFILE,
    cloud: d.Cloud,
  });
  const cycle = (key: string, values: readonly string[]): void => {
    services.settingsController.cycle(key, values);
  };
  const activate = (key: string): void => {
    if (key === "gfx") cycle(key, ["auto", "high", "low"]);
    else if (key === "padPreset") cycle(key, presetOrder);
    else if (key === "tetherMode") cycle(key, ["hold", "toggle"]);
    else if (key === "vibration") {
      cycle(key, ["off", "low", "medium", "high"]);
      d.PAD.rumble(0.8, 160);
    } else if (key === "glyphStyle") cycle(key, ["auto", "playstation", "xbox", "generic"]);
    else if (key === "controls") cycle(key, ["auto", "touch", "desktop"]);
    else if (key === "touchAim") cycle(key, ["stick", "drag"]);
    else if (key === "cinematics") cycle(key, ["full", "brief", "off"]);
    else if (key === "musicMode") cycle(key, ["adaptive", "full", "calm", "dynamic"]);
    else if (key === "menuMusic") cycle(key, musicPickChoices(getMusicLibrary()));
    else if (key === "guide") services.setCodexGuide();
    else if (key === "install" && services.installPrompt.available) services.installPrompt.prompt();
    else if (key === "update") void d.PwaUpdate.apply();
    else if (key === "terms")
      services.window.open("https://www.crazygames.com/terms-and-conditions", "_blank", "noopener");
    else if (key === "privacy") services.window.open("https://www.crazygames.com/privacy", "_blank", "noopener");
  };
  const renderSettings = (): void => {
    settingsTab = services.stepTab(settingsTabs, settingsTab, () => {
      services.setScroll(0);
      maximumScroll = 0;
    });
    const g = (index: number): string => d.PAD.glyph(index);
    const presetMeta = Object.freeze({
      default: {
        name: "DEFAULT",
        tag: "CURRENT",
        line: "Familiar, flexible, unchanged.",
        map: `${g(4)} Tether · ${g(5)}/${g(6)} Throw · ${g(7)} Dash`,
      },
      standard: {
        name: "STANDARD",
        tag: "RECOMMENDED",
        line: "Balanced shoulders, familiar backups.",
        map: `${g(4)} Jump · ${g(6)} Dash · ${g(5)} Throw · ${g(7)} Tether`,
      },
      tear: {
        name: "TEAR",
        tag: "EXPERT",
        line: "Pure twin-stick. No face-button actions.",
        map: `${g(4)} Jump · ${g(6)} Dash · ${g(5)} Throw · ${g(7)} Tether`,
      },
      classic: {
        name: "CLASSIC",
        tag: "FAMILIAR",
        line: "Traditional action-platformer feel.",
        map: `${g(0)} Jump · ${g(1)} Dash · ${g(6)} Tether`,
      },
      split: {
        name: "SPLIT",
        tag: "ERGONOMIC",
        line: "Blade utility moves to the left hand.",
        map: `${g(4)} Throw · ${g(6)} Tether · ${g(5)} Jump · ${g(7)} Dash`,
      },
    });
    const sections = buildSettingsSections(settingsTab, services.settings, {
      lowGraphics: d.GFX.low,
      touch: d.Input.touchActive(),
      installAvailable: services.installPrompt.available,
      update: d.PwaUpdate.snapshot(),
      buildLabel: formatBuildLabel(d.build),
      presets: presetMeta,
      controllerGlyphs: [g(0), g(1), g(2), g(3)],
    });
    const rowCount = sections.reduce((count, section) => count + section.rows.length, 0);
    // Matches the settings renderer: settingsRowH per row, 48 per section head, list from y=214 to the page footer (900 - 110 - 214 = 576 visible).
    maximumScroll = Math.max(0, rowCount * d.UI.t.metric.settingsRowH + sections.length * 48 - 576);
    services.setScroll(services.clamp(services.scroll(), 0, maximumScroll));
    services.renderers.settings({
      id: "settings",
      tab: settingsTab,
      tabs: settingsTabs.map(([id, label]) => ({ id, label, selected: id === settingsTab })),
      sections,
      returnTo: d.APP.settingsReturn,
      canScrollUp: services.scroll() > 0,
      canScrollDown: services.scroll() < maximumScroll,
    });
  };
  const renderRename = (): void => {
    rename.position();
    const snapshot = rename.snapshot();
    d.UI.ink = "#f1eff9";
    services.renderers.rename({
      id: "rename",
      value: snapshot.value,
      length: snapshot.value.length,
      maxLength: 16,
      minLength: 3,
      firstRun: snapshot.firstRun,
      ...(snapshot.error ? { message: snapshot.error } : {}),
    });
  };
  // The MUSIC screen measures and clamps its own scroll, at every density.
  const renderMusic = (): void => {
    services.renderers.music(
      buildMusicScreenView({
        settings: services.settings,
        library: getMusicLibrary(),
        nowPlaying: getNowPlaying(),
        preview: getMusicPreview(),
        page: musicPage,
        openedFrom: musicOpenedFrom,
        queue: getMusicQueue(),
        now: performance.now(),
      }),
    );
  };
  const adapters: SettingsRenameAdapters = {
    renderSettings,
    renderRename,
    renderMusic,
    selectSettingsTab: (id) => {
      settingsTab = normalizeMusicSettingsTab(id);
      services.setScroll(0);
    },
    selectMusicPage: (page) => {
      // A collection remembers the page it was opened from, so BACK goes up one level.
      if (page.startsWith("collection:") && !musicPage.startsWith("collection:")) musicOpenedFrom = musicPage;
      if (page !== musicPage) services.setScroll(0);
      musicPage = page;
    },
    pickMusic: (value) => {
      services.settingsController.choose("menuMusic", value, musicPickChoices(getMusicLibrary()));
    },
    stepSetting: (key, direction) => {
      services.settingsController.step(key, direction);
    },
    toggleSetting: (key) => {
      services.settingsController.toggle(key);
    },
    activateSetting: activate,
    beginRename: (firstRun, bypass) => {
      rename.begin(firstRun, bypass ?? false);
    },
    submitRename: () => {
      rename.submit();
    },
    cancelRename: () => {
      rename.cancel();
    },
    renameSnapshot: () => rename.snapshot(),
    renameActive: () => rename.active,
    renamePrompted: () => rename.prompted,
    markRenamePrompted: () => {
      rename.markPrompted();
    },
  };
  return Object.freeze(adapters);
}

import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../presentation/screens/live-screen-renderers";
import type { LegacyAppScreen } from "./legacy-state-controller";

type Dependencies = Pick<GameRuntimeDependencies, "APP" | "Armored" | "Backdrop" | "Bomber" | "Charger" | "Chimera" |
  "CONFIG" | "FX" | "Flyer" | "GFX" | "GHOST" | "Input" | "Ranged" | "SAFE" | "STAGES" | "Support" | "THEME" |
  "UI" | "UPGRADES" | "VARIANTS" | "Wraith" | "applyVariant" | "stageAt" | "stagePlatforms">;
type Renderers = ReturnType<typeof createLiveScreenRenderers>;

export interface ReplayStatus { readonly paused: boolean; readonly speed: number; readonly infoVisible: boolean;
  readonly progress: number; readonly from: LegacyAppScreen }
export interface ReplayScreenServices {
  readonly dependencies: Dependencies; readonly renderers: Renderers; readonly canvas: CanvasRenderingContext2D;
  readonly width: number; readonly height: number; readonly screenRectangle: () => Readonly<{ x: number; y: number; w: number; h: number }>;
  readonly time: () => number; readonly deltaSeconds: () => number; readonly fallbackPlayer: () => unknown;
  readonly bossById: (id: string) => unknown; readonly setScreen: (screen: LegacyAppScreen, context?: Readonly<{ returnTo: LegacyAppScreen }>) => void;
  readonly categories: () => Readonly<Record<string, Readonly<{ name: string; color: string }>>>;
  readonly fallbackCategory: () => Readonly<{ name: string; color: string }>;
  readonly specialColor: () => string; readonly formatTime: (seconds: number) => string; readonly document: Document;
}
export interface ReplayScreenAdapter {
  readonly enter: (data: unknown, from?: LegacyAppScreen) => boolean; readonly exit: () => void; readonly render: () => void;
  readonly togglePause: () => void; readonly seekBy: (delta: number) => void; readonly seekToFraction: (fraction: number) => void;
  readonly jumpChapter: (direction: number) => void; readonly restart: () => void; readonly toggleInfo: () => void;
  readonly setSpeed: (value: number) => void; readonly status: () => ReplayStatus | null;
}

type DeferredAction = (adapter: ReplayScreenAdapter) => void;

/** Route-triggered replay facade; heavyweight world playback loads only when a replay is opened. */
export function createLiveReplayScreenAdapter(services: ReplayScreenServices): ReplayScreenAdapter {
  const d = services.dependencies;
  let runtime: ReplayScreenAdapter | undefined;
  let loading: Promise<void> | undefined;
  let pending: Readonly<{ data: unknown; from: LegacyAppScreen }> | undefined;
  const deferred: DeferredAction[] = [];

  function ensureLoaded(): void {
    loading ??= import("./live-replay-screen-adapter-runtime").then((module) => {
      runtime = module.createLiveReplayScreenAdapterRuntime(services);
      const request = pending;
      pending = undefined;
      if (request !== undefined) runtime.enter(request.data, request.from);
      for (const action of deferred.splice(0)) action(runtime);
    });
  }
  function invoke(action: DeferredAction): void {
    if (runtime) action(runtime);
    else { deferred.push(action); ensureLoaded(); }
  }
  function enter(data: unknown, from: LegacyAppScreen = "menu"): boolean {
    if (runtime) return runtime.enter(data, from);
    const playback = d.GHOST.begin(data);
    if (playback === null) return false;
    d.GHOST.end();
    pending = { data, from };
    ensureLoaded();
    return true;
  }
  function renderLoading(): void {
    ensureLoaded();
    const ui = d.UI;
    ui.header(services.canvas, "LOADING REPLAY", "preparing the recorded run", 1, ui.t.color.accent);
    ui.text(services.canvas, "◇", services.width / 2, services.height / 2, 36, "center", 0.5);
  }
  function exit(): void {
    if (runtime) { runtime.exit(); return; }
    const destination = pending?.from ?? d.APP.replayReturn;
    pending = undefined;
    deferred.splice(0);
    d.GHOST.end();
    services.setScreen(destination);
  }

  const adapter: ReplayScreenAdapter = {
    enter, exit, render: () => { if (runtime) runtime.render(); else renderLoading(); },
    togglePause: () => { invoke((value) => { value.togglePause(); }); },
    seekBy: (delta) => { invoke((value) => { value.seekBy(delta); }); },
    seekToFraction: (fraction) => { invoke((value) => { value.seekToFraction(fraction); }); },
    jumpChapter: (direction) => { invoke((value) => { value.jumpChapter(direction); }); },
    restart: () => { invoke((value) => { value.restart(); }); },
    toggleInfo: () => { invoke((value) => { value.toggleInfo(); }); },
    setSpeed: (speed) => { invoke((value) => { value.setSpeed(speed); }); },
    status: () => runtime?.status() ?? (pending === undefined ? null : {
      paused: true, speed: 1, infoVisible: false, progress: 0, from: pending.from,
    }),
  };
  return Object.freeze(adapter);
}

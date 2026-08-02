import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../presentation/screens/live-screen-renderers";
import type { LegacyAppScreen } from "./legacy-state-controller";
import { readBrowserGhostCapsule } from "../ghost/browser-capsule-vault";
import { createGhostTheaterScreenAdapter } from "./ghost-theater-screen-adapter";

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
  readonly browserIndexedDb: IDBFactory | undefined;
}
export interface ReplayScreenAdapter {
  readonly enter: (data: unknown, from?: LegacyAppScreen) => boolean; readonly exit: () => void; readonly render: () => void;
  readonly enterGhostCapsule: (id: string, from?: LegacyAppScreen) => Promise<boolean>;
  readonly togglePause: () => void; readonly seekBy: (delta: number) => void; readonly seekToFraction: (fraction: number) => void;
  readonly jumpChapter: (direction: number) => void; readonly restart: () => void; readonly toggleInfo: () => void;
  readonly setSpeed: (value: number) => void; readonly status: () => ReplayStatus | null;
}

type LegacyReplayScreenAdapter = Omit<ReplayScreenAdapter, "enterGhostCapsule">;
type DeferredAction = (adapter: LegacyReplayScreenAdapter) => void;

/** Route-triggered replay facade; heavyweight world playback loads only when a replay is opened. */
export function createLiveReplayScreenAdapter(services: ReplayScreenServices): ReplayScreenAdapter {
  const d = services.dependencies;
  let runtime: LegacyReplayScreenAdapter | undefined;
  const theater = createGhostTheaterScreenAdapter({ render: services.renderers.replay, width: () => services.width,
    deltaSeconds: services.deltaSeconds });
  let active: "legacy" | "theater" | undefined;
  let loading: Promise<void> | undefined;
  let pending: Readonly<{ data: unknown; from: LegacyAppScreen }> | undefined;
  const deferred: DeferredAction[] = [];

  function ensureLoaded(): void {
    loading ??= import("./live-replay-screen-adapter-runtime").then((module) => {
      runtime = module.createLiveReplayScreenAdapterRuntime(services);
      const request = pending;
      pending = undefined;
      const loaded = runtime;
      if (request !== undefined) loaded.enter(request.data, request.from);
      for (const action of deferred.splice(0)) action(loaded);
    });
  }
  function invoke(action: DeferredAction): void {
    if (runtime) action(runtime);
    else { deferred.push(action); ensureLoaded(); }
  }
  function enter(data: unknown, from: LegacyAppScreen = "menu"): boolean {
    if (active === "theater") { theater.exit(); active = undefined; }
    if (runtime) { active = "legacy"; return runtime.enter(data, from); }
    const playback = d.GHOST.begin(data);
    if (playback === null) return false;
    d.GHOST.end();
    pending = { data, from }; active = "legacy";
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
    if (active === "theater") {
      const destination = theater.exit() ?? d.APP.replayReturn;
      active = undefined;
      services.setScreen(destination);
      return;
    }
    if (active === "legacy" && runtime) { runtime.exit(); active = undefined; return; }
    const destination = pending?.from ?? d.APP.replayReturn;
    pending = undefined;
    deferred.splice(0);
    active = undefined;
    d.GHOST.end();
    services.setScreen(destination);
  }

  async function enterGhostCapsule(id: string, from: LegacyAppScreen = "profile"): Promise<boolean> {
    const capsule = await readBrowserGhostCapsule(services.browserIndexedDb, id).catch(() => undefined);
    if (capsule === undefined || !theater.open(capsule, from)) return false;
    if (active === "legacy" && runtime !== undefined) runtime.exit();
    pending = undefined;
    active = "theater";
    services.setScreen("replay", { returnTo: from });
    return true;
  }

  const adapter: ReplayScreenAdapter = {
    enter, enterGhostCapsule, exit, render: () => {
      if (active === "theater") theater.render();
      else if (runtime) runtime.render(); else renderLoading();
    },
    togglePause: () => { if (active === "theater") theater.togglePause(); else invoke((value) => { value.togglePause(); }); },
    seekBy: (delta) => { if (active === "theater") theater.seekBy(delta); else invoke((value) => { value.seekBy(delta); }); },
    seekToFraction: (fraction) => { if (active === "theater") theater.seekToFraction(fraction); else invoke((value) => { value.seekToFraction(fraction); }); },
    jumpChapter: (direction) => { if (active === "theater") theater.jumpCheckpoint(direction); else invoke((value) => { value.jumpChapter(direction); }); },
    restart: () => { if (active === "theater") theater.restart(); else invoke((value) => { value.restart(); }); },
    toggleInfo: () => { if (active === "theater") theater.toggleInfo(); else invoke((value) => { value.toggleInfo(); }); },
    setSpeed: (speed) => { if (active === "theater") theater.setSpeed(speed); else invoke((value) => { value.setSpeed(speed); }); },
    status: () => theater.status() ?? runtime?.status() ?? (pending === undefined ? null : {
      paused: true, speed: 1, infoVisible: false, progress: 0, from: pending.from,
    }),
  };
  return Object.freeze(adapter);
}

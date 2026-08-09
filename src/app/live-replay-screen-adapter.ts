import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../presentation/screens/live-screen-renderers";
import type { LegacyAppScreen } from "./legacy-state-controller";
import { listBrowserGhostCapsuleManifests, readBrowserGhostCapsule } from "../ghost/browser-capsule-vault";
import { createGhostComparisonScreenAdapter } from "./ghost-comparison-screen-adapter";
import { createGhostTheaterScreenAdapter } from "./ghost-theater-screen-adapter";
import type { GhostPracticeChild } from "../ghost/replay-world";
import type { GhostPracticeLaunchResult } from "./ghost-practice-launch";
import { refuseGhostTheater, type GhostTheaterOpenResult } from "../ghost/theater-open-result";

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
  readonly launchGhostPractice: (child: GhostPracticeChild) => GhostPracticeLaunchResult;
}
export interface ReplayScreenAdapter {
  readonly enter: (data: unknown, from?: LegacyAppScreen) => boolean; readonly exit: () => void; readonly render: () => void;
  readonly enterGhostCapsule: (id: string, from?: LegacyAppScreen) => Promise<GhostTheaterOpenResult>;
  readonly enterGhostComparison: (ids: readonly string[], from?: LegacyAppScreen) => Promise<boolean>;
  readonly togglePause: () => void; readonly seekBy: (delta: number) => void; readonly seekToFraction: (fraction: number) => void;
  readonly jumpChapter: (direction: number) => void; readonly restart: () => void; readonly toggleInfo: () => void;
  readonly practice: () => void;
  readonly openCoach: () => void; readonly selectCoachBaseline: (id: string) => void;
  readonly practiceCoachFinding: (findingId: string) => void;
  readonly toggleRunDna: () => void;
  readonly toggleStudio: () => void; readonly createStudioCutList: () => void;
  readonly setSpeed: (value: number) => void; readonly status: () => ReplayStatus | null;
}

type LegacyReplayScreenAdapter = Omit<ReplayScreenAdapter, "enterGhostCapsule" | "enterGhostComparison" | "practice" | "openCoach" | "selectCoachBaseline" | "practiceCoachFinding" | "toggleRunDna" | "toggleStudio" | "createStudioCutList">;
type DeferredAction = (adapter: LegacyReplayScreenAdapter) => void;

/** Route-triggered replay facade; heavyweight world playback loads only when a replay is opened. */
export function createLiveReplayScreenAdapter(services: ReplayScreenServices): ReplayScreenAdapter {
  const d = services.dependencies;
  let runtime: LegacyReplayScreenAdapter | undefined;
  const theater = createGhostTheaterScreenAdapter({ render: services.renderers.replay, width: () => services.width,
    deltaSeconds: services.deltaSeconds, launchPractice: services.launchGhostPractice,
    loadCoachCandidates: async () => {
      const manifests = await listBrowserGhostCapsuleManifests(services.browserIndexedDb);
      const ids = manifests.filter((manifest) => manifest.status === "complete").map((manifest) => manifest.id);
      const values = await Promise.all(ids.map((id) => readBrowserGhostCapsule(services.browserIndexedDb, id).catch(() => undefined)));
      return Object.freeze(values.filter((value): value is NonNullable<typeof value> => value !== undefined));
    } });
  const comparison = createGhostComparisonScreenAdapter({ render: services.renderers.replay });
  let active: "legacy" | "theater" | "comparison" | undefined;
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
    if (active === "theater") theater.exit();
    if (active === "comparison") comparison.exit();
    if (active === "theater" || active === "comparison") active = undefined;
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
    if (active === "comparison") {
      const destination = comparison.exit() ?? d.APP.replayReturn;
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

  async function enterGhostCapsule(id: string, from: LegacyAppScreen = "profile"): Promise<GhostTheaterOpenResult> {
    const capsule = await readBrowserGhostCapsule(services.browserIndexedDb, id).catch(() => undefined);
    if (capsule === undefined) return refuseGhostTheater("capsule-unavailable");
    const opened = theater.open(capsule, from);
    if (opened.kind === "refused") return opened;
    if (active === "legacy" && runtime !== undefined) runtime.exit();
    if (active === "comparison") comparison.exit();
    pending = undefined;
    active = "theater";
    services.setScreen("replay", { returnTo: from });
    return opened;
  }

  async function enterGhostComparison(ids: readonly string[], from: LegacyAppScreen = "profile"): Promise<boolean> {
    if (ids.length < 2 || new Set(ids).size !== ids.length) return false;
    const capsules = await Promise.all(ids.map((id) => readBrowserGhostCapsule(services.browserIndexedDb, id).catch(() => undefined)));
    if (capsules.some((capsule) => capsule === undefined) || !comparison.open(capsules.filter((capsule): capsule is NonNullable<typeof capsule> => capsule !== undefined), from)) {
      return false;
    }
    if (active === "legacy" && runtime !== undefined) runtime.exit();
    if (active === "theater") theater.exit();
    pending = undefined;
    active = "comparison";
    services.setScreen("replay", { returnTo: from });
    return true;
  }

  const adapter: ReplayScreenAdapter = {
    enter, enterGhostCapsule, enterGhostComparison, exit, render: () => {
      if (active === "theater") theater.render();
      else if (active === "comparison") comparison.render();
      else if (runtime) runtime.render(); else renderLoading();
    },
    togglePause: () => { if (active === "theater") theater.togglePause(); else if (active !== "comparison") invoke((value) => { value.togglePause(); }); },
    seekBy: (delta) => { if (active === "theater") theater.seekBy(delta); else if (active !== "comparison") invoke((value) => { value.seekBy(delta); }); },
    seekToFraction: (fraction) => { if (active === "theater") theater.seekToFraction(fraction); else if (active !== "comparison") invoke((value) => { value.seekToFraction(fraction); }); },
    jumpChapter: (direction) => { if (active === "theater") theater.jumpCheckpoint(direction); else if (active === "comparison") comparison.stepOccurrence(direction < 0 ? -1 : 1); else invoke((value) => { value.jumpChapter(direction); }); },
    restart: () => { if (active === "theater") theater.restart(); else if (active === "comparison") comparison.restart(); else invoke((value) => { value.restart(); }); },
    practice: () => { if (active === "theater") theater.practice(); },
    openCoach: () => { if (active === "theater") theater.openCoach(); },
    selectCoachBaseline: (id) => { if (active === "theater") theater.selectCoachBaseline(id); },
    practiceCoachFinding: (findingId) => { if (active === "theater") theater.practiceCoachFinding(findingId); },
    toggleRunDna: () => { if (active === "theater") theater.toggleRunDna(); },
    toggleStudio: () => { if (active === "theater") theater.toggleStudio(); },
    createStudioCutList: () => { if (active === "theater") theater.createStudioCutList(); },
    toggleInfo: () => { if (active === "theater") theater.toggleInfo(); else if (active !== "comparison") invoke((value) => { value.toggleInfo(); }); },
    setSpeed: (speed) => { if (active === "theater") theater.setSpeed(speed); else if (active !== "comparison") invoke((value) => { value.setSpeed(speed); }); },
    status: () => theater.status() ?? comparison.status() ?? runtime?.status() ?? (pending === undefined ? null : {
      paused: true, speed: 1, infoVisible: false, progress: 0, from: pending.from,
    }),
  };
  return Object.freeze(adapter);
}

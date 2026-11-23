import { replayTransportScrub } from "../library/replay-transport-controller";
import { replayEngine } from "../../ghost/replay-engine";
import { findKeptRecord, keptRecordSeed, readKeptRecord, type KeptRecord } from "./kept-record-lookup";
import type { RecordWorldEngine } from "./record-world";
import type { ReplayRecordStore } from "../../replay/record-store";
import { liveReplayRecorder } from "./live-replay-recorder-slot";
import { createBrowserGhostReplayPresentation } from "./browser-ghost-replay-presentation";
import { createBrowserReplayClipExport } from "./browser-replay-clip-export";
import { stableVerificationHash } from "../../domain/hash";
import { replayLoadoutCards } from "../../presentation/replay-snapshots";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../../presentation/screens/live-screen-renderers";
import type { AppScreen } from "../../domain/screen-catalog";
import { readBrowserGhostCapsule } from "../../ghost/browser-capsule-vault";
import { createGhostTheaterScreenAdapter } from "../library/ghost-theater-screen-adapter";
import type { GhostPracticeChild } from "../../ghost/replay-world";
import type { GhostPracticeLaunchResult } from "./ghost-practice-launch";

type Dependencies = Pick<
  GameRuntimeDependencies,
  | "A11Y"
  | "APP"
  | "Armored"
  | "Backdrop"
  | "Bomber"
  | "Charger"
  | "Chimera"
  | "CONFIG"
  | "FX"
  | "Flyer"
  | "GFX"
  | "GHOST"
  | "Input"
  | "Ranged"
  | "Rootbinder"
  | "SAFE"
  | "STAGES"
  | "Support"
  | "THEME"
  | "UI"
  | "UPGRADES"
  | "VARIANTS"
  | "Wraith"
  | "applyVariant"
  | "stageAt"
  | "stagePlatforms"
>;
type Renderers = ReturnType<typeof createLiveScreenRenderers>;

export interface ReplayStatus {
  readonly paused: boolean;
  readonly speed: number;
  readonly infoVisible: boolean;
  readonly progress: number;
  readonly from: AppScreen;
}
export interface ReplayScreenServices {
  readonly dependencies: Dependencies;
  readonly renderers: Renderers;
  readonly canvas: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly screenRectangle: () => Readonly<{ x: number; y: number; w: number; h: number }>;
  readonly time: () => number;
  readonly deltaSeconds: () => number;
  readonly fallbackPlayer: () => unknown;
  readonly bossById: (id: string) => unknown;
  readonly setScreen: (screen: AppScreen, context?: Readonly<{ returnTo: AppScreen }>) => void;
  readonly categories: () => Readonly<Record<string, Readonly<{ name: string; color: string }>>>;
  readonly fallbackCategory: () => Readonly<{ name: string; color: string }>;
  readonly specialColor: () => string;
  readonly formatTime: (seconds: number) => string;
  readonly document: Document;
  readonly browserIndexedDb: IDBFactory | undefined;
  readonly launchGhostPractice: (child: GhostPracticeChild) => GhostPracticeLaunchResult;
}
export interface ReplayScreenAdapter {
  readonly cancelPendingOpen: () => void;
  readonly enter: (data: unknown, from?: AppScreen) => boolean;
  readonly exit: () => void;
  readonly render: () => void;
  /** Opens the kept record of the run with this seed on the replay screen; false when there is none. */
  readonly watchKeptRun: (seed: string, from?: AppScreen) => Promise<boolean>;
  /** Opens the kept record stored under this key (a REPLAYS list row); false when it cannot be played. */
  readonly watchRecord: (key: string, from?: AppScreen) => Promise<boolean>;
  /** The tick and stage the replay screen shows, while it shows a kept record. */
  readonly shownReplay: () => Readonly<{ tick: number; stage: number }> | undefined;
  readonly togglePause: () => void;
  readonly seekBy: (delta: number) => void;
  readonly seekToFraction: (fraction: number) => void;
  readonly jumpChapter: (direction: number) => void;
  readonly restart: () => void;
  readonly toggleInfo: () => void;
  readonly practice: () => void;
  readonly toggleReplayEditor: () => void;
  readonly appendClip: () => void;
  readonly markClipIn: () => void;
  readonly clearClips: () => void;
  readonly exportClips: () => void;
  readonly cancelClipExport: () => void;
  readonly downloadClip: () => void;
  readonly setSpeed: (value: number) => void;
  readonly status: () => ReplayStatus | null;
}

type LegacyReplayScreenAdapter = Omit<
  ReplayScreenAdapter,
  | "cancelPendingOpen"
  | "watchKeptRun"
  | "watchRecord"
  | "shownReplay"
  | "practice"
  | "toggleReplayEditor"
  | "appendClip"
  | "markClipIn"
  | "clearClips"
  | "exportClips"
  | "cancelClipExport"
  | "downloadClip"
>;
type DeferredAction = (adapter: LegacyReplayScreenAdapter) => void;

/** Route-triggered replay facade; heavyweight world playback loads only when a replay is opened. */
export function createLiveReplayScreenAdapter(services: ReplayScreenServices): ReplayScreenAdapter {
  const d = services.dependencies;
  let runtime: LegacyReplayScreenAdapter | undefined;
  const clipExport = createBrowserReplayClipExport(services.document, async (id, hash) => {
    const source = await readBrowserGhostCapsule(services.browserIndexedDb, id);
    return source !== undefined && stableVerificationHash(source.manifest) === hash;
  });
  const theater = createGhostTheaterScreenAdapter({
    presentation: createBrowserGhostReplayPresentation(services.document, d.UI),
    clipExport,
    // The whole arena between the top bar and the transport bar, framed as play frames it.
    drawWorld: (frame) => {
      const screen = services.screenRectangle();
      frame.draw(services.canvas, { x: screen.x, y: 56, w: screen.w, h: services.height - 172 });
    },
    loadoutCards: (items) =>
      replayLoadoutCards(items, {
        upgrades: d.UPGRADES,
        categories: services.categories(),
        fallbackCategory: services.fallbackCategory(),
        specialColor: services.specialColor(),
      }),
    render: (view) => {
      services.renderers.replay(view);
      if (view.clipExport?.thumbnail !== undefined)
        clipExport.drawThumbnail?.(services.canvas, { x: services.width / 2 + 260, y: 220, w: 160, h: 90 });
    },
    deltaSeconds: services.deltaSeconds,
    nativeTransport: () => ({
      controls: d.Input,
      scrub: replayTransportScrub(services.width, services.height, d.SAFE),
      consumeKey: (key) => {
        d.Input.pressed.delete(key);
      },
    }),
    launchPractice: services.launchGhostPractice,
  });
  let active: "legacy" | "theater" | undefined;
  let sourceRequest = 0;
  let loading: Promise<void> | undefined;
  let pending: Readonly<{ data: unknown; from: AppScreen }> | undefined;
  const deferred: DeferredAction[] = [];

  function ensureLoaded(): void {
    loading ??= import("./replay-screen-adapter-runtime").then((module) => {
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
    else {
      deferred.push(action);
      ensureLoaded();
    }
  }
  async function keptRecordFor(
    find: (open: () => Promise<ReplayRecordStore | Readonly<{ failed: unknown }>>) => Promise<KeptRecord | undefined>,
  ): Promise<Readonly<{ kept: KeptRecord; engine: RecordWorldEngine }> | undefined> {
    try {
      const module = await liveReplayRecorder.ensure();
      const kept = await find(() => module.openReplayRecordStore(services.browserIndexedDb ?? null));
      return kept === undefined ? undefined : Object.freeze({ kept, engine: await replayEngine.ensure() });
    } catch {
      return undefined;
    }
  }
  function openKeptRecord(found: Readonly<{ kept: KeptRecord; engine: RecordWorldEngine }>, from: AppScreen): boolean {
    const opened = theater.openRecord(found.kept.record, found.kept.key, from, found.engine);
    if (opened.kind === "refused") return false;
    if (active === "legacy" && runtime !== undefined) runtime.exit();
    pending = undefined;
    active = "theater";
    services.setScreen("replay", { returnTo: from });
    return true;
  }
  /**
   * Watches a run. A run kept in the replay store is re-simulated on the replay screen, so the stage, weapon,
   * projectiles and bosses are the run's own at each moment; any other recording plays as before.
   */
  function enter(data: unknown, from: AppScreen = "menu"): boolean {
    const request = ++sourceRequest;
    if (active === "theater") {
      theater.exit();
      active = undefined;
    }
    const seed = keptRecordSeed(data);
    if (seed === undefined) return enterRecording(data, from);
    if (d.GHOST.begin(data) === null) return false;
    d.GHOST.end();
    if (active === "legacy" && runtime) runtime.exit();
    active = undefined;
    void openKeptRun(seed, from, request).then((opened) => {
      if (!opened && request === sourceRequest) enterRecording(data, from);
    });
    return true;
  }
  async function openKeptRun(seed: string, from: AppScreen, request: number): Promise<boolean> {
    const kept = await keptRecordFor((open) => findKeptRecord(open, seed));
    return request === sourceRequest && kept !== undefined && openKeptRecord(kept, from);
  }
  async function watchRecord(key: string, from: AppScreen, request: number): Promise<boolean> {
    const kept = await keptRecordFor((open) => readKeptRecord(open, key));
    return request === sourceRequest && kept !== undefined && openKeptRecord(kept, from);
  }
  function enterRecording(data: unknown, from: AppScreen): boolean {
    if (runtime) {
      active = "legacy";
      return runtime.enter(data, from);
    }
    const playback = d.GHOST.begin(data);
    if (playback === null) return false;
    d.GHOST.end();
    pending = { data, from };
    active = "legacy";
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
    sourceRequest++;
    if (active === "theater") {
      const destination = theater.exit() ?? d.APP.replayReturn;
      active = undefined;
      services.setScreen(destination);
      return;
    }
    if (active === "legacy" && runtime) {
      runtime.exit();
      active = undefined;
      return;
    }
    const destination = pending?.from ?? d.APP.replayReturn;
    pending = undefined;
    deferred.splice(0);
    active = undefined;
    d.GHOST.end();
    services.setScreen(destination);
  }

  const adapter: ReplayScreenAdapter = {
    cancelPendingOpen: () => {
      sourceRequest++;
      pending = undefined;
      deferred.splice(0);
    },
    enter,
    watchKeptRun: (seed, from = "profile") => openKeptRun(seed, from, ++sourceRequest),
    watchRecord: (key, from = "profile") => watchRecord(key, from, ++sourceRequest),
    shownReplay: () => {
      const tick = active === "theater" ? theater.shownTick() : undefined;
      const stage = active === "theater" ? theater.shownStage() : undefined;
      return tick === undefined || stage === undefined ? undefined : Object.freeze({ tick, stage });
    },
    exit,
    render: () => {
      if (active === "theater") theater.render();
      else if (runtime) runtime.render();
      else renderLoading();
    },
    togglePause: () => {
      if (active === "theater") theater.togglePause();
      else
        invoke((value) => {
          value.togglePause();
        });
    },
    seekBy: (delta) => {
      if (active === "theater") theater.seekBy(delta);
      else
        invoke((value) => {
          value.seekBy(delta);
        });
    },
    seekToFraction: (fraction) => {
      if (active === "theater") theater.seekToFraction(fraction);
      else
        invoke((value) => {
          value.seekToFraction(fraction);
        });
    },
    jumpChapter: (direction) => {
      if (active === "theater") theater.jumpCheckpoint(direction);
      else
        invoke((value) => {
          value.jumpChapter(direction);
        });
    },
    restart: () => {
      if (active === "theater") theater.restart();
      else
        invoke((value) => {
          value.restart();
        });
    },
    practice: () => {
      if (active === "theater") theater.practice();
    },
    toggleReplayEditor: () => {
      if (active === "theater") theater.toggleReplayEditor();
    },
    appendClip: () => {
      if (active === "theater") theater.appendClip();
    },
    markClipIn: () => {
      if (active === "theater") theater.markClipIn();
    },
    clearClips: () => {
      if (active === "theater") theater.clearClips();
    },
    exportClips: () => {
      if (active === "theater") theater.exportClips();
    },
    cancelClipExport: () => {
      if (active === "theater") theater.cancelClipExport();
    },
    downloadClip: () => {
      if (active === "theater") theater.downloadClip();
    },
    toggleInfo: () => {
      if (active === "theater") theater.toggleInfo();
      else
        invoke((value) => {
          value.toggleInfo();
        });
    },
    setSpeed: (speed) => {
      if (active === "theater") theater.setSpeed(speed);
      else
        invoke((value) => {
          value.setSpeed(speed);
        });
    },
    status: () =>
      theater.status() ??
      runtime?.status() ??
      (pending === undefined
        ? null
        : {
            paused: true,
            speed: 1,
            infoVisible: false,
            progress: 0,
            from: pending.from,
          }),
  };
  return Object.freeze(adapter);
}

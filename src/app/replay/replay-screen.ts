import {
  handleReplayTransport,
  replayTransportScrub,
  type ReplayNativeTransport,
} from "../library/replay-transport-controller";
import { replayEngine } from "../../ghost/replay-engine";
import { findKeptRecord, keptRecordSeed, readKeptRecord, type KeptRecord } from "./kept-record-lookup";
import {
  watchRecord,
  type RecordCheckpoint,
  type RecordWatchWorld,
  type RecordWorldEngine,
  type RecordWorldPresentation,
} from "./record-world";
import type { ReplayRecordStore } from "../../replay/record-store";
import { replayPlaybackRefusal, type ReplayRecord } from "../../replay/record";
import { REPLAY_TICKS_PER_SECOND } from "../../replay/record";
import type { Watch } from "../../replay/watch";
import { liveReplayRecorder } from "./live-replay-recorder-slot";
import { createReplayFrames } from "./replay-frame";
import { createBrowserReplayClipExport, type ReplayClipExportPort } from "./browser-replay-clip-export";
import { createReplayClipEditor, type ReplayClipEditor } from "./replay-clip-editor";
import { replayClock, replayLoadoutCards } from "../../presentation/replay-snapshots";
import { formatRunClock } from "../../gameplay/scoring/style-runtime";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../../presentation/screens/live-screen-renderers";
import type { CardView, ReplayScreenView } from "../../presentation/screens/contracts";
import type { AppScreen } from "../../domain/screen-catalog";
import type { GhostPracticeChild, GhostReplayRenderView } from "../../ghost/replay-world";
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
  | "COSMETICS"
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
  /**
   * Pauses a kept record on `tick` and draws the world there into `target`, laid out as play lays out the game's
   * canvas (no replay bars); false when no kept record is shown. For test builds' live-against-replay checks.
   */
  readonly drawShownAsPlayed: (tick: number, target: CanvasRenderingContext2D) => boolean;
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

/** The replay screen's controls over a Ghost 2 recording, which plays through the older path until PR 8. */
type RecordingScreen = Pick<
  ReplayScreenAdapter,
  | "enter"
  | "exit"
  | "render"
  | "togglePause"
  | "seekBy"
  | "seekToFraction"
  | "jumpChapter"
  | "restart"
  | "toggleInfo"
  | "setSpeed"
  | "status"
>;
type DeferredAction = (screen: RecordingScreen) => void;

/** How the replay screen shows a kept record: the world, the INFO panel's cards and where they are drawn. */
export interface KeptRunScreenServices {
  readonly render: (view: ReplayScreenView) => void;
  readonly drawWorld?: (frame: GhostReplayRenderView) => void;
  readonly deltaSeconds: () => number;
  readonly nativeTransport?: () => ReplayNativeTransport;
  readonly launchPractice: (child: GhostPracticeChild) => GhostPracticeLaunchResult;
  /** The INFO panel's cards for a run's upgrades. */
  readonly loadoutCards?: (items: ReturnType<RecordWatchWorld["loadout"]>) => readonly CardView[];
  readonly clipExport?: ReplayClipExportPort;
}

interface Watching {
  readonly key: string;
  readonly record: ReplayRecord;
  readonly from: AppScreen;
  readonly watch: Watch<RecordCheckpoint, RecordWatchWorld>;
  readonly editor: ReplayClipEditor | undefined;
  infoVisible: boolean;
  message?: string;
  frame: Readonly<{ world: RecordWatchWorld; tick: number; view: GhostReplayRenderView | undefined }> | undefined;
}

const RESULT_WORDS = Object.freeze({ victory: "VICTORY", defeat: "FELL ON WAVE", quit: "LEFT ON WAVE" });

/** INFO for a kept run: who played what and how it ended, and the upgrades held at the shown moment. */
function keptInfo(
  watching: Watching,
  cards: KeptRunScreenServices["loadoutCards"],
): Pick<ReplayScreenView, "infoRows" | "loadout" | "loadoutHeading"> {
  const { run, summary, look } = watching.record,
    outcome = run.result.outcome;
  return Object.freeze({
    infoRows: Object.freeze([
      { label: "PLAYER", value: look.playerName || "Player" },
      { label: "RUN", value: `${run.start.mode} · ${run.start.difficulty} · ${run.start.weapon}`.toUpperCase() },
      {
        label: "RESULT",
        value: outcome === "victory" ? RESULT_WORDS.victory : `${RESULT_WORDS[outcome]} ${String(summary.wave)}`,
      },
      { label: "SCORE", value: summary.score.toLocaleString("en-US") },
      { label: "KILLS", value: summary.kills.toLocaleString("en-US") },
      { label: "TIME", value: formatRunClock(summary.time) },
    ]),
    loadout: cards?.(watching.watch.world().loadout()) ?? [],
    loadoutHeading: Object.freeze({ title: "LOADOUT AT THIS MOMENT", empty: "No upgrades taken yet." }),
  });
}

/**
 * An unranked practice run from the watched world at the shown tick. It keeps the record it came from, so
 * the run-end rules keep it off the leaderboards, the profile and the replay store.
 */
export function keptRunPracticeChild(key: string, record: ReplayRecord, at: RecordCheckpoint): GhostPracticeChild {
  return Object.freeze({
    id: `${key}:practice:${String(at.tick)}`,
    sourceGhostId: key,
    sourceRootHash: record.run.result.hash,
    forkTick: at.tick,
    mode: "exact-practice",
    snapshot: Object.freeze(structuredClone(at.snapshot)),
    inputLatchPolicy: "release-all",
    rankedEligible: false,
    leaderboardEligible: false,
    lineage: Object.freeze({
      relation: "forked-at",
      parentId: key,
      parentRootHash: record.run.result.hash,
      forkTick: at.tick,
    }),
  });
}

/**
 * The replay screen over a kept record: one watch (src/replay/watch.ts) plays the run, and this draws it,
 * reads the replay bar and keyboard, lists INFO, launches practice from the shown moment and holds the
 * replay editor.
 */
export function createKeptRunScreen(services: KeptRunScreenServices) {
  let watching: Watching | undefined;
  const halted = (current: Watching, error: unknown): void => {
    current.message = `Replay halted: ${error instanceof Error ? error.message : String(error)}`;
  };
  /**
   * Runs a playback command; a world that fails to step pauses the replay and says so. A message on the
   * replay bar stays until the shown moment moves.
   */
  const command = (act: (current: Watching) => void): void => {
    const current = watching;
    if (current === undefined) return;
    const before = current.watch.state().tick;
    try {
      act(current);
      if (current.watch.state().tick !== before) delete current.message;
    } catch (error) {
      halted(current, error);
    }
  };
  /** The world drawn at the shown tick, built again only when the tick or the world changes. */
  const shownFrame = (current: Watching): GhostReplayRenderView | undefined => {
    const world = current.watch.world(),
      tick = current.watch.state().tick;
    if (current.frame?.world !== world || current.frame.tick !== tick)
      current.frame = { world, tick, view: world.frame() };
    return current.frame.view;
  };
  const view = (current: Watching): ReplayScreenView => {
    const { watch, record } = current,
      state = watch.state(),
      frame = shownFrame(current),
      span = Math.max(1, watch.lastTick);
    return Object.freeze({
      id: "replay",
      title: record.look.playerName || "Player",
      detail:
        `${record.run.start.mode} · reached wave ${String(record.summary.wave)} · ${record.summary.score.toLocaleString("en-US")} pts`.toUpperCase(),
      paused: !state.playing,
      speed: state.speed,
      // Players read time, not simulation ticks (120 per second).
      elapsed: replayClock(state.tick),
      duration: replayClock(watch.lastTick),
      progress: watch.progress(),
      score: "",
      chapters: watch.chapters.map((tick) => Object.freeze({ fraction: tick / span, boss: false })),
      infoVisible: current.infoVisible,
      ...keptInfo(current, services.loadoutCards),
      ...(current.message === undefined ? {} : { notice: current.message }),
      keptRun: true,
      worldVisible: frame !== undefined,
      practiceAvailable: frame === undefined || (frame.screen === "playing" && !frame.clockBlocked),
      ...current.editor?.view(),
    });
  };
  const close = (): AppScreen | undefined => {
    const from = watching?.from;
    watching?.editor?.dispose();
    watching?.watch.dispose();
    watching = undefined;
    return from;
  };
  return Object.freeze({
    /** The tick the replay screen shows now. */
    shownTick: () => watching?.watch.state().tick,
    /** The stage the shown world is in. */
    shownStage: () => watching?.watch.world().stage(),
    /**
     * Pauses on `tick` and draws the world shown there into `target` as play lays out the game's canvas: the
     * whole `screen` rectangle, no replay bars. Test builds compare it with the live frame at the same tick.
     */
    drawAsPlayed(
      tick: number,
      target: CanvasRenderingContext2D,
      screen: Readonly<{ x: number; y: number; w: number; h: number }>,
    ): boolean {
      const current = watching;
      if (current === undefined) return false;
      current.watch.pause();
      command(({ watch }) => watch.seek(tick));
      const frame = shownFrame(current);
      if (frame === undefined || current.watch.state().tick !== tick) return false;
      const scale = target.canvas.width / screen.w;
      target.save();
      target.setTransform(scale, 0, 0, scale, -screen.x * scale, -screen.y * scale);
      frame.draw(target, screen);
      target.restore();
      return true;
    },
    /** Opens a kept record and plays it at once, as a video player does. Returns why it cannot, or undefined. */
    open(
      record: ReplayRecord,
      key: string,
      from: AppScreen,
      engine: RecordWorldEngine,
      presentation: RecordWorldPresentation = {},
    ): string | undefined {
      close();
      const refusal = replayPlaybackRefusal(record.run);
      if (refusal !== null) return refusal;
      try {
        const watch = watchRecord(record, engine, presentation);
        const editor =
          services.clipExport === undefined
            ? undefined
            : createReplayClipEditor({
                id: key,
                port: services.clipExport,
                source: () => {
                  const own = watchRecord(record, engine, presentation);
                  return Object.freeze({
                    id: key,
                    lastTick: own.lastTick,
                    frameAt: own.frameAt,
                    dispose: own.dispose,
                  });
                },
                say: (message) => {
                  if (watching !== undefined) watching.message = message;
                },
              });
        watching = { key, record, from, watch, editor, infoVisible: false, frame: undefined };
        watch.play();
        return undefined;
      } catch (error) {
        close();
        return `This replay could not be played: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    render(): void {
      const current = watching;
      if (current === undefined) return;
      command(({ watch }) => watch.advance(services.deltaSeconds()));
      const native = services.nativeTransport?.();
      if (native !== undefined && current.editor?.isOpen() !== true)
        handleReplayTransport({
          ...native,
          currentTime: current.watch.state().tick / REPLAY_TICKS_PER_SECOND,
          duration: current.watch.lastTick / REPLAY_TICKS_PER_SECOND,
          seek: (seconds) => {
            command(({ watch }) => watch.seek(Math.round(seconds * REPLAY_TICKS_PER_SECOND)));
          },
          toggle: () => {
            command(({ watch }) => {
              watch.toggle();
            });
          },
        });
      let snapshot: ReplayScreenView;
      try {
        snapshot = view(current);
      } catch (error) {
        halted(current, error);
        current.frame = undefined;
        snapshot = view(current);
      }
      if (current.frame?.view !== undefined) services.drawWorld?.(current.frame.view);
      services.render(snapshot);
    },
    exit: close,
    togglePause: () => {
      command(({ watch }) => {
        watch.toggle();
      });
    },
    seekBy: (seconds: number) => {
      command(({ watch }) => watch.seekBy(seconds));
    },
    seekToFraction: (fraction: number) => {
      command(({ watch }) => watch.seekToFraction(fraction));
    },
    jumpChapter: (direction: number) => {
      command(({ watch }) => watch.jumpChapter(direction));
    },
    restart: () => {
      command(({ watch }) => watch.seek(0));
    },
    practice(): void {
      const current = watching;
      if (current === undefined) return;
      try {
        current.watch.pause();
        current.editor?.dispose();
        const child = keptRunPracticeChild(current.key, current.record, current.watch.world().checkpoint());
        const launched = services.launchPractice(child);
        current.message = launched.ok ? "Practice launched. This run is unranked and is not kept." : launched.message;
      } catch (error) {
        current.message = `Practice unavailable: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    toggleInfo: () => {
      if (watching !== undefined) watching.infoVisible = !watching.infoVisible;
    },
    setSpeed: (value: number) => {
      watching?.watch.setSpeed(value);
    },
    editor: () => watching?.editor,
    appendClip: () => {
      if (watching === undefined) return;
      const state = watching.watch.state();
      watching.editor?.append(state.tick, state.speed);
    },
    markClipIn: () => {
      if (watching !== undefined) watching.editor?.markIn(watching.watch.state().tick);
    },
    status(): ReplayStatus | null {
      if (watching === undefined) return null;
      const state = watching.watch.state();
      return Object.freeze({
        paused: !state.playing,
        speed: state.speed,
        infoVisible: watching.infoVisible,
        progress: watching.watch.progress(),
        from: watching.from,
      });
    },
  });
}

/**
 * The replay screen. A run kept in the replay store is re-simulated (`createKeptRunScreen`), so the stage,
 * weapon, projectiles and bosses are the run's own at each moment; an older Ghost 2 recording plays through
 * its own path, loaded on first use, until PR 8 retires it.
 */
export function createLiveReplayScreenAdapter(services: ReplayScreenServices): ReplayScreenAdapter {
  const d = services.dependencies;
  let recordings: RecordingScreen | undefined;
  const clipExport = createBrowserReplayClipExport(services.document);
  const presentation = createReplayFrames(services.document, d.UI, { wardrobe: d.COSMETICS });
  const kept = createKeptRunScreen({
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
      consumeKey: (key: string) => {
        d.Input.pressed.delete(key);
      },
    }),
    launchPractice: services.launchGhostPractice,
  });
  let active: "recording" | "kept" | undefined;
  let sourceRequest = 0;
  let loading: Promise<void> | undefined;
  let pending: Readonly<{ data: unknown; from: AppScreen }> | undefined;
  const deferred: DeferredAction[] = [];

  function ensureLoaded(): void {
    loading ??= import("./replay-screen-adapter-runtime").then((module) => {
      recordings = module.createLiveReplayScreenAdapterRuntime(services);
      const request = pending;
      pending = undefined;
      const loaded = recordings;
      if (request !== undefined) loaded.enter(request.data, request.from);
      for (const action of deferred.splice(0)) action(loaded);
    });
  }
  function invoke(action: DeferredAction): void {
    if (recordings) action(recordings);
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
      const found = await find(() => module.openReplayRecordStore(services.browserIndexedDb ?? null));
      return found === undefined ? undefined : Object.freeze({ kept: found, engine: await replayEngine.ensure() });
    } catch {
      return undefined;
    }
  }
  function openKeptRecord(found: Readonly<{ kept: KeptRecord; engine: RecordWorldEngine }>, from: AppScreen): boolean {
    if (kept.open(found.kept.record, found.kept.key, from, found.engine, presentation) !== undefined) return false;
    if (active === "recording" && recordings !== undefined) recordings.exit();
    pending = undefined;
    active = "kept";
    services.setScreen("replay", { returnTo: from });
    return true;
  }
  /** Watches a run: its kept record when the store has one, otherwise its Ghost 2 recording. */
  function enter(data: unknown, from: AppScreen = "menu"): boolean {
    const request = ++sourceRequest;
    if (active === "kept") {
      kept.exit();
      active = undefined;
    }
    const seed = keptRecordSeed(data);
    if (seed === undefined) return enterRecording(data, from);
    if (d.GHOST.begin(data) === null) return false;
    d.GHOST.end();
    if (active === "recording" && recordings) recordings.exit();
    active = undefined;
    void openKeptRun(seed, from, request).then((opened) => {
      if (!opened && request === sourceRequest) enterRecording(data, from);
    });
    return true;
  }
  async function openKeptRun(seed: string, from: AppScreen, request: number): Promise<boolean> {
    const found = await keptRecordFor((open) => findKeptRecord(open, seed));
    return request === sourceRequest && found !== undefined && openKeptRecord(found, from);
  }
  async function watchStoredRecord(key: string, from: AppScreen, request: number): Promise<boolean> {
    const found = await keptRecordFor((open) => readKeptRecord(open, key));
    return request === sourceRequest && found !== undefined && openKeptRecord(found, from);
  }
  function enterRecording(data: unknown, from: AppScreen): boolean {
    if (recordings) {
      active = "recording";
      return recordings.enter(data, from);
    }
    const playback = d.GHOST.begin(data);
    if (playback === null) return false;
    d.GHOST.end();
    pending = { data, from };
    active = "recording";
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
    if (active === "kept") {
      const destination = kept.exit() ?? d.APP.replayReturn;
      active = undefined;
      services.setScreen(destination);
      return;
    }
    if (active === "recording" && recordings) {
      recordings.exit();
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
  /** A control that both paths have: the kept run's, or the recording's once its path has loaded. */
  const either = (onKept: () => void, onRecording: DeferredAction) => (): void => {
    if (active === "kept") onKept();
    else invoke(onRecording);
  };
  /** A control only a kept run has. */
  const keptOnly = (act: () => void) => (): void => {
    if (active === "kept") act();
  };
  const editor = (act: (value: ReplayClipEditor) => void) =>
    keptOnly(() => {
      const value = kept.editor();
      if (value !== undefined) act(value);
    });

  return Object.freeze<ReplayScreenAdapter>({
    cancelPendingOpen: () => {
      sourceRequest++;
      pending = undefined;
      deferred.splice(0);
    },
    enter,
    watchKeptRun: (seed, from = "profile") => openKeptRun(seed, from, ++sourceRequest),
    watchRecord: (key, from = "profile") => watchStoredRecord(key, from, ++sourceRequest),
    shownReplay: () => {
      const tick = active === "kept" ? kept.shownTick() : undefined;
      const stage = active === "kept" ? kept.shownStage() : undefined;
      return tick === undefined || stage === undefined ? undefined : Object.freeze({ tick, stage });
    },
    drawShownAsPlayed: (tick, target) =>
      active === "kept" && kept.drawAsPlayed(tick, target, services.screenRectangle()),
    exit,
    render: () => {
      if (active === "kept") kept.render();
      else if (recordings) recordings.render();
      else renderLoading();
    },
    togglePause: either(kept.togglePause, (value) => {
      value.togglePause();
    }),
    seekBy: (delta) => {
      either(
        () => {
          kept.seekBy(delta);
        },
        (value) => {
          value.seekBy(delta);
        },
      )();
    },
    seekToFraction: (fraction) => {
      either(
        () => {
          kept.seekToFraction(fraction);
        },
        (value) => {
          value.seekToFraction(fraction);
        },
      )();
    },
    jumpChapter: (direction) => {
      either(
        () => {
          kept.jumpChapter(direction);
        },
        (value) => {
          value.jumpChapter(direction);
        },
      )();
    },
    restart: either(kept.restart, (value) => {
      value.restart();
    }),
    toggleInfo: either(kept.toggleInfo, (value) => {
      value.toggleInfo();
    }),
    setSpeed: (speed) => {
      either(
        () => {
          kept.setSpeed(speed);
        },
        (value) => {
          value.setSpeed(speed);
        },
      )();
    },
    practice: keptOnly(kept.practice),
    toggleReplayEditor: editor((value) => {
      value.toggle();
    }),
    appendClip: keptOnly(kept.appendClip),
    markClipIn: keptOnly(kept.markClipIn),
    clearClips: editor((value) => {
      value.clear();
    }),
    exportClips: editor((value) => {
      value.encode();
    }),
    cancelClipExport: editor((value) => {
      value.cancel();
    }),
    downloadClip: editor((value) => {
      value.download();
    }),
    status: () =>
      kept.status() ??
      recordings?.status() ??
      (pending === undefined
        ? null
        : {
            paused: true,
            speed: 1,
            infoVisible: false,
            progress: 0,
            from: pending.from,
          }),
  });
}

import {
  handleReplayTransport,
  replayTransportScrub,
  type ReplayNativeTransport,
} from "../library/replay-transport-controller";
import { replayEngine } from "../../ghost/replay-engine";
import { findKeptRecord, readKeptRecord, type KeptRecord } from "./kept-record-lookup";
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

type Dependencies = Pick<GameRuntimeDependencies, "APP" | "Input" | "SAFE" | "UI" | "UPGRADES" | "COSMETICS">;
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
  readonly deltaSeconds: () => number;
  readonly setScreen: (screen: AppScreen, context?: Readonly<{ returnTo: AppScreen }>) => void;
  readonly categories: () => Readonly<Record<string, Readonly<{ name: string; color: string }>>>;
  readonly fallbackCategory: () => Readonly<{ name: string; color: string }>;
  readonly specialColor: () => string;
  readonly document: Document;
  readonly browserIndexedDb: IDBFactory | undefined;
  readonly launchGhostPractice: (child: GhostPracticeChild) => GhostPracticeLaunchResult;
}
export interface ReplayScreenAdapter {
  readonly cancelPendingOpen: () => void;
  /** Opens a record already read (a shared replay or a file) under `key`; false when it cannot be played. */
  readonly watch: (record: ReplayRecord, key: string, from?: AppScreen) => Promise<boolean>;
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
 * The replay screen. Every replay is a record re-simulated by `createKeptRunScreen`, so the stage, weapon,
 * projectiles and bosses are the run's own at each moment: a run kept on this device (a REPLAYS row or the
 * results screen's WATCH), a shared one (a leaderboard or the feed) or one read from a file.
 */
export function createLiveReplayScreenAdapter(services: ReplayScreenServices): ReplayScreenAdapter {
  const d = services.dependencies;
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
  let showing = false;
  /** Counts open requests, so a record that finishes loading after a later request or an exit is not shown. */
  let request = 0;

  async function keptRecordFor(
    find: (open: () => Promise<ReplayRecordStore | Readonly<{ failed: unknown }>>) => Promise<KeptRecord | undefined>,
  ): Promise<KeptRecord | undefined> {
    try {
      const module = await liveReplayRecorder.ensure();
      return await find(() => module.openReplayRecordStore(services.browserIndexedDb ?? null));
    } catch {
      return undefined;
    }
  }
  /** Opens a record once the replay engine has loaded; false when a later request came first or it cannot play. */
  async function open(found: KeptRecord | undefined, from: AppScreen, asked: number): Promise<boolean> {
    if (found === undefined || asked !== request) return false;
    let engine: RecordWorldEngine;
    try {
      engine = await replayEngine.ensure();
    } catch {
      return false;
    }
    if (asked !== request || kept.open(found.record, found.key, from, engine, presentation) !== undefined) return false;
    showing = true;
    services.setScreen("replay", { returnTo: from });
    return true;
  }
  function exit(): void {
    request++;
    const destination = kept.exit() ?? d.APP.replayReturn;
    showing = false;
    services.setScreen(destination);
  }
  /** A control that acts only while a replay is shown. */
  const shown = (act: () => void) => (): void => {
    if (showing) act();
  };
  const editor = (act: (value: ReplayClipEditor) => void) =>
    shown(() => {
      const value = kept.editor();
      if (value !== undefined) act(value);
    });

  return Object.freeze<ReplayScreenAdapter>({
    cancelPendingOpen: () => {
      request++;
    },
    watch: (record, key, from = "profile") => open(Object.freeze({ key, record }), from, ++request),
    watchKeptRun: async (seed, from = "profile") => {
      const asked = ++request;
      return open(await keptRecordFor((store) => findKeptRecord(store, seed)), from, asked);
    },
    watchRecord: async (key, from = "profile") => {
      const asked = ++request;
      return open(await keptRecordFor((store) => readKeptRecord(store, key)), from, asked);
    },
    shownReplay: () => {
      const tick = showing ? kept.shownTick() : undefined;
      const stage = showing ? kept.shownStage() : undefined;
      return tick === undefined || stage === undefined ? undefined : Object.freeze({ tick, stage });
    },
    drawShownAsPlayed: (tick, target) => showing && kept.drawAsPlayed(tick, target, services.screenRectangle()),
    exit,
    render: () => {
      if (showing) kept.render();
    },
    togglePause: shown(kept.togglePause),
    seekBy: (delta) => {
      if (showing) kept.seekBy(delta);
    },
    seekToFraction: (fraction) => {
      if (showing) kept.seekToFraction(fraction);
    },
    jumpChapter: (direction) => {
      if (showing) kept.jumpChapter(direction);
    },
    restart: shown(kept.restart),
    toggleInfo: shown(kept.toggleInfo),
    setSpeed: (speed) => {
      if (showing) kept.setSpeed(speed);
    },
    practice: shown(kept.practice),
    toggleReplayEditor: editor((value) => {
      value.toggle();
    }),
    appendClip: shown(kept.appendClip),
    markClipIn: shown(kept.markClipIn),
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
    status: () => kept.status(),
  });
}

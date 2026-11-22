import type { CampaignStage, ChapterPage } from "./chapter-controller";
import type { PreparedVictory } from "../run/outcome-planner";
import type { CampaignCinematicChannel } from "./campaign-sequences";
import { beginRunChapter, runChapterGatesWave, type RunChapterPort } from "./run-chapter";
import { createChapterLaunchMemory, type CinematicPreference } from "./cinematic-preference";
import { dispatchChapterIntents, type ChapterIntentPorts } from "./campaign-intent-coordinator";
import { createFinaleRuntime, type FinaleBladeSegment, type FinaleIntentPorts } from "./finale-runtime";
import type { FinaleIntent } from "./finale-controller";
import type { CampaignRuntimeState } from "./campaign-runtime-state";
import {
  parseCampaignChapterBindingSpec,
  stageCampaignChapterBinding,
  type CampaignChapterBindingPort,
  type CampaignChapterBindingSpecV1,
} from "./chapter-cinematic-binding";
import type { CinematicDirectorBinding } from "../runtime/cinematic-director";

export interface LiveCampaignRun {
  readonly mode: string;
  chapterState: string;
  _prologueShown?: boolean;
  _victoryPrepared?: PreparedVictory;
  readonly finalBossDeath?: Readonly<{ x: number; y: number }>;
  readonly score: number;
  readonly runTime: number;
}

export interface LiveCampaignActor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export interface LiveCampaignBlade {
  readonly tipVX?: number;
  readonly tipVY?: number;
}

export type LiveFinaleBladeSegment = FinaleBladeSegment;

export interface LiveCampaignRuntimePort {
  readonly runtime: CampaignRuntimeState;
  readonly cinema: CampaignCinematicChannel;
  readonly run: () => LiveCampaignRun | null;
  readonly player: () => LiveCampaignActor;
  readonly blade: () => LiveCampaignBlade;
  readonly stageAt: (index: number) => CampaignStage | null;
  readonly preference: () => CinematicPreference;
  readonly preparedWave: () => boolean;
  readonly activationDeferred: () => boolean;
  readonly chapterIntents: ChapterIntentPorts;
  readonly finaleIntents: FinaleIntentPorts;
  readonly observeFinaleIntents?: (intents: readonly FinaleIntent[]) => void;
  readonly clearStageBeat: () => void;
  readonly prepareVictory: (campaign: boolean, persistFinale: boolean) => PreparedVictory;
  readonly win: (campaign: boolean) => void;
  readonly formatTime: (seconds: number) => string;
  readonly viewport: Readonly<{ width: number; height: number }>;
  readonly perfectColor: () => string;
  readonly reducedMotion: () => boolean;
  readonly lowGraphics: () => boolean;
}

export interface LiveCampaignRuntimeApi {
  readonly clearFinaleBinding: ReturnType<typeof createFinaleRuntime>["clearBinding"];
  readonly captureFinaleBinding: ReturnType<typeof createFinaleRuntime>["captureBinding"];
  readonly stageFinaleBinding: ReturnType<typeof createFinaleRuntime>["stageBinding"];
  readonly loreBusy: () => boolean;
  readonly beginChapter: (index: number, priorOutro?: ChapterPage | null) => void;
  /**
   * Whether `beginChapter(index)` will play a cinematic. Only such a chapter may hold its
   * first wave prepared-but-inactive: a skipped chapter completes before that wave is
   * prepared, so nothing would ever release a deferred wave.
   */
  readonly chapterGatesWave: (index: number) => boolean;
  /** Chapters played this session, by stage index; a run start records them. */
  readonly playedChapters: () => readonly number[];
  readonly severFinaleAnchor: (assisted: boolean) => boolean;
  readonly beginFinaleRestoration: () => void;
  readonly tryFinaleBladeCut: (segment: LiveFinaleBladeSegment) => void;
  readonly startAdventureFinale: (death?: Readonly<{ x: number; y: number }>, recovered?: boolean) => void;
  readonly stageChapterBinding: (value: unknown) => StagedLiveChapterBinding | null;
  readonly installChapterBinding: (value: unknown) => CinematicDirectorBinding | undefined;
}

export interface StagedLiveChapterBinding {
  readonly binding: CinematicDirectorBinding;
  readonly spec: CampaignChapterBindingSpecV1;
  install(): void;
}

/** Bound campaign API that owns all spanning chapter/finale orchestration and intent dispatch. */
export function createLiveCampaignRuntime(port: LiveCampaignRuntimePort): LiveCampaignRuntimeApi {
  // Chapters played in this session; a retry of one of them skips its cinematic.
  const chapters = createChapterLaunchMemory(port.preference);
  const dispatchChapter = (intents: Parameters<typeof dispatchChapterIntents>[0]): void => {
    dispatchChapterIntents(intents, port.chapterIntents);
  };
  const chapterPort: RunChapterPort = {
    run: port.run,
    stageAt: port.stageAt,
    chapters,
    launch: {
      runtime: port.runtime,
      cinema: port.cinema,
      preparedWave: port.preparedWave,
      activationDeferred: port.activationDeferred,
      dispatch: dispatchChapter,
      clearStageBeat: port.clearStageBeat,
    },
  };
  const finale = createFinaleRuntime({
    runtime: port.runtime,
    cinema: port.cinema,
    run: port.run,
    player: port.player,
    blade: port.blade,
    intents: port.finaleIntents,
    prepareVictory: port.prepareVictory,
    win: port.win,
    formatTime: port.formatTime,
    viewport: port.viewport,
    perfectColor: port.perfectColor,
    reducedMotion: port.reducedMotion,
    lowGraphics: port.lowGraphics,
    ...(port.observeFinaleIntents === undefined ? {} : { observeIntents: port.observeFinaleIntents }),
  });
  const chapterBindingPort = (): CampaignChapterBindingPort => ({
    dispatch: dispatchChapter,
    preparedWave: port.preparedWave,
    activationDeferred: port.activationDeferred,
    clear: () => {
      port.runtime.clearChapterBinding();
    },
  });
  const stageChapterBinding = (value: unknown): StagedLiveChapterBinding | null => {
    if (value === null || value === undefined) return null;
    const spec = parseCampaignChapterBindingSpec(value);
    const stage = port.stageAt(spec.stageIndex);
    if (stage?.chapter === undefined)
      throw new RangeError(`campaign chapter stage ${String(spec.stageIndex)} is unavailable`);
    const staged = stageCampaignChapterBinding(spec, stage, chapterBindingPort());
    return Object.freeze({
      binding: staged.binding,
      spec: staged.spec,
      install() {
        port.runtime.installChapterBinding(staged);
      },
    });
  };
  const api: LiveCampaignRuntimeApi = {
    clearFinaleBinding: finale.clearBinding,
    captureFinaleBinding: finale.captureBinding,
    stageFinaleBinding: finale.stageBinding,
    loreBusy: () => {
      const run = port.run();
      return run?.mode === "campaign" && run.chapterState !== "WAVE_LIVE";
    },
    beginChapter: (index, priorOutro = null) => {
      beginRunChapter(chapterPort, index, priorOutro);
    },
    playedChapters: chapters.played,
    chapterGatesWave: (index) => runChapterGatesWave(chapterPort, index),
    severFinaleAnchor: finale.severAnchor,
    beginFinaleRestoration: finale.beginRestoration,
    tryFinaleBladeCut: finale.tryBladeCut,
    startAdventureFinale: finale.start,
    stageChapterBinding,
    installChapterBinding: (value) => {
      const staged = stageChapterBinding(value);
      if (staged === null) {
        port.runtime.resetChapter();
        return undefined;
      }
      staged.install();
      return staged.binding;
    },
  };
  return Object.freeze(api);
}

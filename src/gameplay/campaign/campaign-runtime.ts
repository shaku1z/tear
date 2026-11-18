import type { CampaignStage, ChapterPage } from "./chapter-controller";
import type { PreparedVictory } from "../run/outcome-planner";
import type { CampaignCinematicChannel } from "./campaign-sequences";
import { launchCampaignChapter } from "./campaign-sequences";
import { chapterLaunchPolicy, type CinematicLaunchPolicy, type CinematicPreference } from "./cinematic-preference";
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
  readonly clearBossBeat: () => void;
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
  const playedChapters = new Set<number>();
  const chapterPolicy = (index: number): CinematicLaunchPolicy =>
    chapterLaunchPolicy(port.preference(), playedChapters.has(index));
  const dispatchChapter = (intents: Parameters<typeof dispatchChapterIntents>[0]): void => {
    dispatchChapterIntents(intents, port.chapterIntents);
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
      const run = port.run();
      const stage = port.stageAt(index);
      if (run === null) return;
      if (run.mode !== "campaign" || stage?.chapter === undefined) {
        run.chapterState = "WAVE_LIVE";
        return;
      }
      const policy = chapterPolicy(index);
      if (policy.play) playedChapters.add(index);
      launchCampaignChapter({
        runtime: port.runtime,
        cinema: port.cinema,
        stageIndex: index,
        stage,
        priorOutro,
        brief: policy.brief,
        play: policy.play,
        prologueShown: run._prologueShown === true,
        preparedWave: port.preparedWave,
        activationDeferred: port.activationDeferred,
        dispatch: dispatchChapter,
        rememberPrologue: (shown) => {
          run._prologueShown = shown;
        },
        clearBossBeat: port.clearBossBeat,
      });
    },
    chapterGatesWave: (index) =>
      port.run()?.mode === "campaign" && port.stageAt(index)?.chapter !== undefined && chapterPolicy(index).play,
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

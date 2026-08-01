import type { CampaignStage, ChapterPage } from "../gameplay/campaign/chapter-controller";
import type { PreparedVictory } from "../gameplay/run/outcome-planner";
import type { CampaignCinematicChannel } from "./live-campaign-sequences";
import { launchCampaignChapter } from "./live-campaign-sequences";
import { cinematicLaunchPolicy, type CinematicPreference } from "./cinematic-preference";
import {
  dispatchChapterIntents,
  type ChapterIntentPorts,
} from "./campaign-intent-coordinator";
import {
  createFinaleRuntime,
  type FinaleBladeSegment,
  type FinaleIntentPorts,
} from "../gameplay/campaign/finale-runtime";
import type { FinaleIntent } from "../gameplay/campaign/finale-controller";
import type { CampaignRuntimeState } from "./campaign-runtime-state";
import { parseCampaignChapterBindingSpec, stageCampaignChapterBinding,
  type CampaignChapterBindingPort, type CampaignChapterBindingSpecV1 } from
  "../gameplay/campaign/chapter-cinematic-binding";
import type { CinematicDirectorBinding } from "../gameplay/runtime/cinematic-director";

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
  readonly loreBusy: () => boolean;
  readonly beginChapter: (index: number, priorOutro?: ChapterPage | null) => void;
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
  const dispatchChapter = (intents: Parameters<typeof dispatchChapterIntents>[0]): void => {
    dispatchChapterIntents(intents, port.chapterIntents);
  };
  const finale = createFinaleRuntime({
    runtime: port.runtime, cinema: port.cinema, run: port.run, player: port.player, blade: port.blade,
    intents: port.finaleIntents, prepareVictory: port.prepareVictory, win: port.win,
    formatTime: port.formatTime, viewport: port.viewport, perfectColor: port.perfectColor,
    reducedMotion: port.reducedMotion, lowGraphics: port.lowGraphics,
    ...(port.observeFinaleIntents === undefined ? {} : { observeIntents: port.observeFinaleIntents }),
  });
  const chapterBindingPort = (): CampaignChapterBindingPort => ({
    dispatch: dispatchChapter,
    preparedWave: port.preparedWave,
    activationDeferred: port.activationDeferred,
    clear: () => { port.runtime.clearChapterBinding(); },
  });
  const stageChapterBinding = (value: unknown): StagedLiveChapterBinding | null => {
    if (value === null || value === undefined) return null;
    const spec = parseCampaignChapterBindingSpec(value);
    const stage = port.stageAt(spec.stageIndex);
    if (stage?.chapter === undefined) throw new RangeError(`campaign chapter stage ${String(spec.stageIndex)} is unavailable`);
    const staged = stageCampaignChapterBinding(spec, stage, chapterBindingPort());
    return Object.freeze({
      binding: staged.binding,
      spec: staged.spec,
      install() { port.runtime.installChapterBinding(staged); },
    });
  };
  const api: LiveCampaignRuntimeApi = {
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
      const policy = cinematicLaunchPolicy(port.preference());
      launchCampaignChapter({
        runtime: port.runtime, cinema: port.cinema, stageIndex: index, stage,
        priorOutro, brief: policy.brief, play: policy.play, prologueShown: run._prologueShown === true,
        preparedWave: port.preparedWave, activationDeferred: port.activationDeferred,
        dispatch: dispatchChapter,
        rememberPrologue: (shown) => { run._prologueShown = shown; },
        clearBossBeat: port.clearBossBeat,
      });
    },
    severFinaleAnchor: finale.severAnchor,
    beginFinaleRestoration: finale.beginRestoration,
    tryFinaleBladeCut: finale.tryBladeCut,
    startAdventureFinale: finale.start,
    stageChapterBinding,
    installChapterBinding: (value) => {
      const staged = stageChapterBinding(value);
      if (staged === null) { port.runtime.resetChapter(); return undefined; }
      staged.install();
      return staged.binding;
    },
  };
  return Object.freeze(api);
}

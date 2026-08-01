import type {
  CampaignStage,
  ChapterIntent,
  ChapterPage,
} from "../gameplay/campaign/chapter-controller";
import type { CampaignRuntimeState } from "./campaign-runtime-state";
import { createCampaignChapterBindingSpec, stageCampaignChapterBinding,
  type CampaignChapterBindingPort } from "../gameplay/campaign/chapter-cinematic-binding";
import type { CinematicDirectorBinding } from "../gameplay/runtime/cinematic-director";
import type {
  FinaleCinematicBeat,
  FinaleCinematicChannel,
  FinaleCinematicDirector,
  FinaleCinematicScript,
} from "../gameplay/campaign/finale-runtime";

export {
  beginFinaleRestoration,
  launchAdventureFinale,
  severNextFinaleAnchor,
  type FinaleCutOptions,
  type FinaleSequenceLaunchOptions,
} from "../gameplay/campaign/finale-runtime";

export type CampaignCinematicDirector = FinaleCinematicDirector;
export type CampaignCinematicBeat<Context> = FinaleCinematicBeat<Context>;
export type CampaignCinematicScript<Context> = FinaleCinematicScript<Context>;

export interface CampaignCinematicChannel extends FinaleCinematicChannel {
  startBinding(binding: CinematicDirectorBinding): void;
}

export interface ChapterSequenceLaunchOptions {
  readonly runtime: CampaignRuntimeState;
  readonly cinema: CampaignCinematicChannel;
  readonly stageIndex: number;
  readonly stage: CampaignStage;
  readonly priorOutro: ChapterPage | null;
  readonly brief: boolean;
  readonly play: boolean;
  readonly prologueShown: boolean;
  readonly preparedWave: () => boolean;
  readonly activationDeferred: () => boolean;
  readonly dispatch: (intents: readonly ChapterIntent[]) => void;
  readonly rememberPrologue: (shown: boolean) => void;
  readonly clearBossBeat: () => void;
}

/** Launches or deterministically skips one chapter without leaking sequence policy into the game loop. */
export function launchCampaignChapter(options: ChapterSequenceLaunchOptions): void {
  const port: CampaignChapterBindingPort = {
    dispatch: options.dispatch,
    preparedWave: options.preparedWave,
    activationDeferred: options.activationDeferred,
    clear: () => { options.runtime.clearChapterBinding(); },
  };
  const staged = stageCampaignChapterBinding(createCampaignChapterBindingSpec({
    stageIndex: options.stageIndex,
    priorOutro: options.priorOutro,
    brief: options.brief,
    prologueShownBefore: options.prologueShown,
    timing: options.runtime.chapterController.timing,
  }), options.stage, port);
  options.runtime.installChapterBinding(staged);
  options.rememberPrologue(staged.prologueShownAfter);
  options.clearBossBeat();
  options.dispatch(staged.initialIntents);

  const complete = (): void => {
    options.dispatch(staged.controller.complete(options.preparedWave(), options.activationDeferred()));
    options.runtime.clearChapterBinding();
  };
  if (!options.play) {
    options.dispatch(staged.controller.onStart());
    complete();
    return;
  }
  options.cinema.startBinding(staged.binding);
}

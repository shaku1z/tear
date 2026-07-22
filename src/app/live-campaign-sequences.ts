import type {
  CampaignChapterSequence,
  CampaignStage,
  ChapterBeat,
  ChapterIntent,
  ChapterPage,
} from "../gameplay/campaign/chapter-controller";
import type {
  FinaleIntent,
  FinaleBeat,
  FinaleSequence,
  FinaleStartInput,
  FinaleState,
} from "../gameplay/campaign/finale-controller";
import type { CampaignRuntimeState } from "./campaign-runtime-state";

export interface CampaignCinematicDirector {
  readonly elapsed: number;
  readonly progress: number;
  skipTo(id: string): boolean;
}

export interface CampaignCinematicBeat<Context> {
  readonly id: string;
  readonly [key: string]: unknown;
  readonly onEnter?: (context: Context, detail: CampaignCinematicDirector) => void;
  readonly onUpdate?: (context: Context, detail: CampaignCinematicDirector) => void;
  readonly waitUntil?: (context: Context, detail: CampaignCinematicDirector) => boolean;
}

export interface CampaignCinematicScript<Context> {
  readonly id: string;
  readonly beats: readonly CampaignCinematicBeat<Context>[];
  readonly [key: string]: unknown;
  readonly onStart?: (context: Context, director: CampaignCinematicDirector) => void;
  readonly onSkip?: (context: Context, director: CampaignCinematicDirector) => void;
  readonly onComplete?: (context: Context, director: CampaignCinematicDirector) => void;
  readonly onCancel?: (context: Context) => void;
}

export interface CampaignCinematicChannel {
  start<Context>(script: CampaignCinematicScript<Context>, context: Context): void;
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
  const controller = options.runtime.chapterController;
  controller.prologueShown = options.prologueShown;
  const result = controller.begin(options.stageIndex, options.stage, options.priorOutro, options.brief);
  options.rememberPrologue(controller.prologueShown);
  options.runtime.chapterFlow = result.flow;
  options.clearBossBeat();
  options.dispatch(result.intents);

  const complete = (): void => {
    options.dispatch(controller.complete(options.preparedWave(), options.activationDeferred()));
    options.runtime.chapterFlow = null;
  };
  if (!options.play) {
    options.dispatch(controller.onStart());
    complete();
    return;
  }

  const beats: readonly (CampaignCinematicBeat<typeof result.flow> & ChapterBeat)[] = result.sequence.beats.map((beat) => ({
    ...beat,
    onEnter() { options.dispatch(controller.enterBeat(beat.id)); },
  }));
  const script: CampaignCinematicScript<typeof result.flow> & CampaignChapterSequence = {
    ...result.sequence,
    beats,
    onStart() { options.dispatch(controller.onStart()); },
    onSkip(_context, director) { director.skipTo("reveal"); },
    onComplete() { complete(); },
    onCancel() {
      options.dispatch(controller.cancel(options.preparedWave()));
      options.runtime.chapterFlow = null;
    },
  };
  options.cinema.start(script, result.flow);
}

export interface FinaleSequenceLaunchOptions {
  readonly runtime: CampaignRuntimeState;
  readonly cinema: CampaignCinematicChannel;
  readonly input: FinaleStartInput;
  readonly viewportWidth: number;
  readonly dispatch: (intents: readonly FinaleIntent[]) => void;
  readonly stopPlayer: () => void;
  readonly assistVelocity: () => Readonly<{ x: number; y: number }>;
}

/** Owns the complete finale cinematic lifecycle, including assisted cuts and restoration. */
export function launchAdventureFinale(options: FinaleSequenceLaunchOptions): boolean {
  const controller = options.runtime.finaleController;
  const result = controller.start(options.input);
  options.runtime.finale = result.state;
  options.stopPlayer();
  options.dispatch(result.intents);
  if (result.sequence === null || result.state === null) return false;

  const beats: readonly (CampaignCinematicBeat<FinaleState> & FinaleBeat)[] = result.sequence.beats.map((beat) => ({
    ...beat,
    onEnter() {
      options.dispatch(controller.enterBeat(beat.id, options.viewportWidth));
      options.runtime.syncFinale();
    },
    onUpdate(_context, detail) {
      options.dispatch(controller.updateBeat(detail.elapsed, detail.progress));
      options.runtime.syncFinale();
    },
    waitUntil(_context, detail) { return controller.waitComplete(detail.elapsed); },
  }));
  const script: CampaignCinematicScript<FinaleState> & FinaleSequence = {
    ...result.sequence,
    beats,
    onStart() { options.dispatch(controller.onStart()); },
    onSkip(_context, director) {
      while (controller.state && controller.state.severed < controller.state.anchors.length) {
        options.dispatch(controller.sever(true, options.assistVelocity(), options.input.perfectColor,
          options.input.reducedMotion === true, options.input.lowGraphics === true));
      }
      director.skipTo("restoration");
    },
    onComplete() {
      options.dispatch(controller.complete());
      options.runtime.finale = null;
    },
    onCancel() { options.dispatch(controller.cancel()); },
  };
  options.cinema.start(script, result.state);
  return true;
}

export interface FinaleCutOptions {
  readonly runtime: CampaignRuntimeState;
  readonly velocity: Readonly<{ x: number; y: number }>;
  readonly perfectColor: string;
  readonly reducedMotion: boolean;
  readonly lowGraphics: boolean;
  readonly dispatch: (intents: readonly FinaleIntent[]) => void;
}

export function severNextFinaleAnchor(options: FinaleCutOptions, assisted: boolean): boolean {
  const before = options.runtime.finale?.severed ?? 0;
  options.dispatch(options.runtime.finaleController.sever(
    assisted, options.velocity, options.perfectColor, options.reducedMotion, options.lowGraphics,
  ));
  options.runtime.syncFinale();
  return (options.runtime.finale?.severed ?? 0) > before;
}

export function beginFinaleRestoration(
  runtime: CampaignRuntimeState,
  viewportWidth: number,
  dispatch: (intents: readonly FinaleIntent[]) => void,
): void {
  dispatch(runtime.finaleController.enterBeat("restoration", viewportWidth));
  runtime.syncFinale();
}

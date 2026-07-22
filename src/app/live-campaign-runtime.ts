import type { CampaignStage, ChapterPage } from "../gameplay/campaign/chapter-controller";
import type { PreparedVictory } from "../gameplay/run/outcome-planner";
import type { CampaignCinematicChannel } from "./live-campaign-sequences";
import {
  beginFinaleRestoration,
  launchAdventureFinale,
  launchCampaignChapter,
  severNextFinaleAnchor,
} from "./live-campaign-sequences";
import { cinematicLaunchPolicy, type CinematicPreference } from "./cinematic-preference";
import {
  dispatchChapterIntents,
  dispatchFinaleIntents,
  type ChapterIntentPorts,
  type FinaleIntentPorts,
} from "./campaign-intent-coordinator";
import type { CampaignRuntimeState } from "./campaign-runtime-state";

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

export interface LiveFinaleBladeSegment {
  readonly previousX: number;
  readonly previousY: number;
  readonly x: number;
  readonly y: number;
  readonly speed: number;
}

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
}

/** Bound campaign API that owns all spanning chapter/finale orchestration and intent dispatch. */
export function createLiveCampaignRuntime(port: LiveCampaignRuntimePort): LiveCampaignRuntimeApi {
  const velocityComponent = (value: number | null | undefined, fallback: number): number =>
    value == null || value === 0 || Number.isNaN(value) ? fallback : value;
  const dispatchChapter = (intents: Parameters<typeof dispatchChapterIntents>[0]): void => {
    dispatchChapterIntents(intents, port.chapterIntents);
  };
  const dispatchFinale = (intents: Parameters<typeof dispatchFinaleIntents>[0]): void => {
    dispatchFinaleIntents(intents, port.finaleIntents);
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
    severFinaleAnchor: (assisted) => {
      const blade = port.blade();
      return severNextFinaleAnchor({
        runtime: port.runtime,
        velocity: { x: velocityComponent(blade.tipVX, 0), y: velocityComponent(blade.tipVY, -1) },
        perfectColor: port.perfectColor(), reducedMotion: port.reducedMotion(), lowGraphics: port.lowGraphics(),
        dispatch: dispatchFinale,
      }, assisted);
    },
    beginFinaleRestoration: () => {
      beginFinaleRestoration(port.runtime, port.viewport.width, dispatchFinale);
    },
    tryFinaleBladeCut: (segment) => {
      dispatchFinale(port.runtime.finaleController.tryBladeCut(
        segment, port.perfectColor(), port.reducedMotion(), port.lowGraphics(),
      ));
      port.runtime.syncFinale();
    },
    startAdventureFinale: (death, recovered = false) => {
      const run = port.run();
      if (run === null) return;
      if (run.mode !== "campaign") { port.win(false); return; }
      port.runtime.resetFinale();
      const prepared = recovered && run._victoryPrepared !== undefined
        ? run._victoryPrepared
        : port.prepareVictory(true, true);
      const player = port.player();
      launchAdventureFinale({
        runtime: port.runtime, cinema: port.cinema, viewportWidth: port.viewport.width, dispatch: dispatchFinale,
        input: {
          campaign: true, recovered, ...(death === undefined ? {} : { death }),
          ...(run.finalBossDeath === undefined ? {} : { rememberedDeath: run.finalBossDeath }),
          prepared, player: { x: player.x, y: player.y }, viewport: port.viewport,
          score: run.score, formattedTime: port.formatTime(run.runTime), perfectColor: port.perfectColor(),
          reducedMotion: port.reducedMotion(), lowGraphics: port.lowGraphics(),
        },
        stopPlayer: () => { player.vx = 0; player.vy = 0; player.onGround = false; },
        assistVelocity: () => {
          const blade = port.blade();
          return { x: velocityComponent(blade.tipVX, 0), y: velocityComponent(blade.tipVY, -1) };
        },
      });
    },
  };
  return Object.freeze(api);
}

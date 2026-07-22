import { CampaignChapterController } from "../gameplay/campaign/chapter-controller";
import { FinaleController } from "../gameplay/campaign/finale-controller";

export interface ChapterMotionTokens {
  readonly loreReveal: number;
  readonly chapterIn: number;
  readonly loreExit: number;
  readonly biomeRevealBrief: number;
  readonly biomeRevealFull: number;
  readonly readyBrief: number;
  readonly readyFull: number;
}

export interface CampaignControllerConfig {
  readonly presentation: { readonly dialogueDuck: number; readonly biomeRevealDuck: number };
  readonly finale: {
    readonly anchorRadius: number; readonly worldZoom: number;
    readonly silence: number; readonly wound: number; readonly relics: number;
    readonly cutAutoAt: number; readonly cutAutoStep: number; readonly cutSpeed: number;
    readonly restorationMin: number; readonly epilogueReveal: number; readonly rewardHold: number;
  };
}

export function createCampaignChapterController(
  motion: ChapterMotionTokens,
  config: CampaignControllerConfig,
): CampaignChapterController {
  return new CampaignChapterController({
    ...motion,
    dialogueDuck: config.presentation.dialogueDuck,
    biomeRevealDuck: config.presentation.biomeRevealDuck,
  });
}

export function createFinaleController(config: CampaignControllerConfig): FinaleController {
  return new FinaleController(config.finale);
}

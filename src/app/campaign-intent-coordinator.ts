import type { ChapterIntent, CampaignChapterState } from "../gameplay/campaign/chapter-controller";
export {
  dispatchFinaleIntents,
  type FinaleIntentPorts,
} from "../gameplay/campaign/finale-runtime";

export interface ChapterIntentPorts {
  activatePreparedWave(): void;
  setChapterState(state: CampaignChapterState, page?: number): void;
  clearProjectiles(): void;
  musicDuck(amount: number, duration: number): void;
  resetStageBanner(): void;
  sound(): void;
}

export function dispatchChapterIntents(intents: readonly ChapterIntent[], ports: ChapterIntentPorts): void {
  for (const intent of intents) {
    switch (intent.type) {
      case "activate-prepared-wave": ports.activatePreparedWave(); break;
      case "chapter-state": ports.setChapterState(intent.state, intent.page); break;
      case "clear-projectiles": ports.clearProjectiles(); break;
      case "music-duck": ports.musicDuck(intent.amount, intent.duration); break;
      case "reset-stage-banner": ports.resetStageBanner(); break;
      case "sound": ports.sound(); break;
    }
  }
}

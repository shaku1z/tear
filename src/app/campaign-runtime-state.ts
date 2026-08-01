import type { CampaignChapterController, CampaignChapterFlow } from "../gameplay/campaign/chapter-controller";
import type { FinaleController, FinaleState } from "../gameplay/campaign/finale-controller";
import { captureCampaignChapterBindingSpec, type CampaignChapterBindingSpecV1,
  type StagedCampaignChapterBinding } from "../gameplay/campaign/chapter-cinematic-binding";

export interface CinematicProtectionState {
  active: boolean;
  lastMode: string | null;
}

/** Mutable ownership boundary for campaign sequences that span multiple legacy frames. */
export class CampaignRuntimeState {
  chapterFlow: CampaignChapterFlow | null = null;
  chapterBindingSpec: CampaignChapterBindingSpecV1 | null = null;
  finale: FinaleState | null = null;
  cinemaProtectionActive = false;
  lastCinemaPlayerMode: string | null = null;
  chapterController: CampaignChapterController;
  finaleController: FinaleController;

  readonly #createChapter: () => CampaignChapterController;
  readonly #createFinale: () => FinaleController;

  constructor(createChapter: () => CampaignChapterController, createFinale: () => FinaleController) {
    this.#createChapter = createChapter;
    this.#createFinale = createFinale;
    this.chapterController = createChapter();
    this.finaleController = createFinale();
  }

  reset(): void {
    this.chapterFlow = null;
    this.chapterBindingSpec = null;
    this.finale = null;
    this.cinemaProtectionActive = false;
    this.lastCinemaPlayerMode = null;
    this.chapterController = this.#createChapter();
    this.finaleController = this.#createFinale();
  }

  resetChapter(): void {
    this.chapterFlow = null;
    this.chapterBindingSpec = null;
    this.chapterController = this.#createChapter();
  }

  resetFinale(): void {
    this.finale = null;
    this.finaleController = this.#createFinale();
  }

  installChapterBinding(staged: StagedCampaignChapterBinding): void {
    this.chapterController = staged.controller;
    this.chapterFlow = staged.flow;
    this.chapterBindingSpec = staged.spec;
  }

  clearChapterBinding(): void {
    this.chapterFlow = null;
    this.chapterBindingSpec = null;
  }

  captureChapterBinding(): CampaignChapterBindingSpecV1 | null {
    return this.chapterBindingSpec && this.chapterFlow
      ? captureCampaignChapterBindingSpec(this.chapterBindingSpec, this.chapterFlow)
      : null;
  }

  syncFinale(): FinaleState | null {
    this.finale = this.finaleController.state;
    return this.finale;
  }

  protection(): CinematicProtectionState {
    return { active: this.cinemaProtectionActive, lastMode: this.lastCinemaPlayerMode };
  }

  applyProtection(next: CinematicProtectionState): void {
    this.cinemaProtectionActive = next.active;
    this.lastCinemaPlayerMode = next.lastMode;
  }
}

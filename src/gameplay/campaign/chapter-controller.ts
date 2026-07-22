export const CAMPAIGN_INTRO = Object.freeze([
  { label: "BEFORE THE DESCENT", text: "The sky was torn, and through the wound poured everything that should not be. They named it the Tear." },
  { label: "BEFORE THE DESCENT", text: "Each soul the Council sent to close it was worn, in time, into the shape of the thing they failed to stop." },
  { label: "BEFORE THE DESCENT", text: "You are the next to descend. Cut clean. Keep moving. Reach the Source before it wears your shape too." },
] as const);

export interface ChapterPage { readonly label: string; readonly text: string }
export interface CampaignChapter {
  readonly number: string | number; readonly symbol: string; readonly title: string; readonly intro: string;
  readonly transition?: string; readonly pages: readonly ChapterPage[];
}
export interface CampaignStage {
  readonly name: string; readonly blurb: string; readonly accent: string; readonly dark?: boolean;
  readonly chapter: CampaignChapter;
  readonly chapterArt?: Readonly<{ composition: string; wash: string }>;
}

export type CampaignChapterState = "LORE_ENTER" | "LORE_READ" | "LORE_EXIT" | "BIOME_REVEAL" | "READY" | "WAVE_LIVE";

export interface CampaignChapterFlow {
  readonly stageIndex: number;
  readonly stage: CampaignStage;
  readonly chapter: CampaignChapter;
  readonly pages: readonly ChapterPage[];
  readonly brief: boolean;
  state: CampaignChapterState;
  page: number;
}

export interface ChapterBeat {
  readonly id: string;
  readonly view?: "page" | "ready" | "reveal";
  readonly duration?: number;
  readonly completion?: "confirm" | "confirm-or-timeout";
  readonly reveal?: Readonly<{ mode: "phrase"; duration: number }>;
  readonly playerMode: "locked";
  readonly exit?: boolean;
  readonly pageIndex?: number;
  readonly pageCount?: number;
  readonly number?: string | number;
  readonly symbol?: string;
  readonly label?: string;
  readonly title?: string;
  readonly text?: string;
  readonly name?: string;
  readonly line?: string;
  readonly color?: string;
  readonly transition?: string | undefined;
  readonly composition?: string;
  readonly wash?: string;
}

export interface CampaignChapterSequence {
  readonly id: string;
  readonly kind: "chapter";
  readonly color: string;
  readonly blocksCombat: true;
  readonly hideHud: true;
  readonly brief: boolean;
  readonly hint: string;
  readonly skipHint: string;
  readonly beats: readonly ChapterBeat[];
}

export type ChapterIntent =
  | Readonly<{ type: "activate-prepared-wave" }>
  | Readonly<{ type: "chapter-state"; state: CampaignChapterState; page?: number }>
  | Readonly<{ type: "clear-projectiles" }>
  | Readonly<{ type: "music-duck"; amount: number; duration: number }>
  | Readonly<{ type: "reset-stage-banner" }>
  | Readonly<{ type: "sound"; cue: "chapter-dialogue" }>;

export interface CampaignChapterTiming {
  readonly loreReveal: number;
  readonly chapterIn: number;
  readonly loreExit: number;
  readonly biomeRevealBrief: number;
  readonly biomeRevealFull: number;
  readonly readyBrief: number;
  readonly readyFull: number;
  readonly dialogueDuck: number;
  readonly biomeRevealDuck: number;
}

export class CampaignChapterController {
  flow: CampaignChapterFlow | null = null;
  prologueShown = false;

  constructor(private readonly timing: CampaignChapterTiming) {}

  begin(stageIndex: number, stage: CampaignStage, priorOutro: ChapterPage | null, brief: boolean): Readonly<{ flow: CampaignChapterFlow; sequence: CampaignChapterSequence; intents: readonly ChapterIntent[] }> {
    const pages: ChapterPage[] = [];
    if (stageIndex === 0 && !this.prologueShown) { this.prologueShown = true; pages.push(...CAMPAIGN_INTRO); }
    if (priorOutro) pages.push(priorOutro);
    pages.push(...stage.chapter.pages);
    const art = stage.chapterArt ?? { composition: "left", wash: stage.dark ? "dark" : "light" };
    const flow: CampaignChapterFlow = { stageIndex, stage, chapter: stage.chapter, pages, brief, state: "LORE_ENTER", page: 0 };
    this.flow = flow;
    const pageBeats: ChapterBeat[] = pages.map((page, pageIndex) => ({
      id: `page-${String(pageIndex)}`, view: "page", completion: brief ? "confirm-or-timeout" : "confirm",
      duration: brief ? 1.35 : 2.35, reveal: { mode: "phrase", duration: this.timing.loreReveal }, playerMode: "locked",
      number: stage.chapter.number, symbol: stage.chapter.symbol, label: page.label, title: stage.chapter.title,
      text: page.text, color: stage.accent, pageIndex, pageCount: pages.length, transition: stage.chapter.transition,
      composition: art.composition, wash: art.wash,
    }));
    const lastPage = pages.at(-1) ?? { label: "", text: "" };
    const beats: ChapterBeat[] = [
      { id: "enter", duration: this.timing.chapterIn, playerMode: "locked" },
      ...pageBeats,
      { id: "exit", view: "page", exit: true, duration: this.timing.loreExit, playerMode: "locked",
        number: stage.chapter.number, symbol: stage.chapter.symbol, label: lastPage.label, title: stage.chapter.title,
        text: lastPage.text, color: stage.accent, pageIndex: pages.length - 1, pageCount: pages.length,
        transition: stage.chapter.transition, composition: art.composition, wash: art.wash },
      { id: "reveal", view: "reveal", duration: brief ? this.timing.biomeRevealBrief : this.timing.biomeRevealFull,
        playerMode: "locked", number: stage.chapter.number, name: stage.name, line: stage.chapter.intro, color: stage.accent,
        composition: art.composition, wash: art.wash },
      { id: "ready", view: "ready", duration: brief ? this.timing.readyBrief : this.timing.readyFull,
        playerMode: "locked", number: stage.chapter.number, name: stage.name, line: stage.blurb, color: stage.accent,
        composition: art.composition, wash: art.wash },
    ];
    const sequence: CampaignChapterSequence = { id: `chapter-${String(stageIndex)}`, kind: "chapter", color: stage.accent,
      blocksCombat: true, hideHud: true, brief, hint: "TAP TO REVEAL  ·  HOLD TO SKIP CHAPTER",
      skipHint: "SKIPPING — BIOME REVEAL PRESERVED", beats };
    return { flow, sequence, intents: [{ type: "chapter-state", state: "LORE_ENTER" }, { type: "reset-stage-banner" }] };
  }

  onStart(): readonly ChapterIntent[] { return [{ type: "clear-projectiles" }, { type: "music-duck", amount: this.timing.dialogueDuck, duration: 0.18 }]; }

  enterBeat(beatId: string): readonly ChapterIntent[] {
    const flow = this.flow; if (!flow) return [];
    if (beatId.startsWith("page-")) {
      const page = Number.parseInt(beatId.slice(5), 10); flow.state = "LORE_READ"; flow.page = page;
      return [{ type: "chapter-state", state: "LORE_READ", page }, { type: "sound", cue: "chapter-dialogue" }];
    }
    const stateByBeat: Readonly<Record<string, CampaignChapterState>> = { enter: "LORE_ENTER", exit: "LORE_EXIT", reveal: "BIOME_REVEAL", ready: "READY" };
    const state = stateByBeat[beatId]; if (!state) return [];
    flow.state = state;
    const intents: ChapterIntent[] = [{ type: "chapter-state", state }];
    if (state === "BIOME_REVEAL") intents.push({ type: "music-duck", amount: this.timing.biomeRevealDuck, duration: 0.32 });
    return intents;
  }

  complete(preparedWave: boolean, activationDeferred: boolean): readonly ChapterIntent[] {
    if (this.flow) this.flow.state = "WAVE_LIVE"; this.flow = null;
    const intents: ChapterIntent[] = [{ type: "chapter-state", state: "WAVE_LIVE" }, { type: "reset-stage-banner" }];
    if (preparedWave && activationDeferred) intents.push({ type: "activate-prepared-wave" });
    intents.push({ type: "music-duck", amount: 1, duration: 0.7 });
    return intents;
  }

  cancel(preparedWave: boolean): readonly ChapterIntent[] {
    if (this.flow) this.flow.state = "WAVE_LIVE"; this.flow = null;
    const intents: ChapterIntent[] = [{ type: "chapter-state", state: "WAVE_LIVE" }];
    if (preparedWave) intents.push({ type: "activate-prepared-wave" });
    intents.push({ type: "music-duck", amount: 1, duration: 0.25 });
    return intents;
  }
}

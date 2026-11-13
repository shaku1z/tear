export const CAMPAIGN_INTRO = Object.freeze([
  { label: "BEFORE THE DESCENT", text: "The sky was torn, and through the wound poured everything that should not be. They named it the Tear." },
  { label: "BEFORE THE DESCENT", text: "Each soul the Council sent to close it was worn, in time, into the shape of the thing they failed to stop." },
  { label: "BEFORE THE DESCENT", text: "You are the next to descend. Cut clean. Keep moving. Reach the Source before it wears your shape too." },
] as const);

export interface ChapterPage { readonly label: string; readonly text: string }

/**
 * Reading contract: a lore page may play on by itself only after a reader at
 * 220 words per minute has had time to finish it (plus a moment to find the
 * line); a confirm advances it sooner once it is fully shown.
 */
export const CHAPTER_READING = Object.freeze({ wordsPerMinute: 220, settleSeconds: 1.2, minimumSeconds: 3.2 });

/** Seconds a fully revealed page holds before it may auto-advance. */
export function chapterPageDwell(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const reading = (words * 60) / CHAPTER_READING.wordsPerMinute + CHAPTER_READING.settleSeconds;
  return Math.max(CHAPTER_READING.minimumSeconds, Math.round(reading * 100) / 100);
}
export const CHAPTER_TRANSITION_IDS = Object.freeze(["ash", "steel", "ember", "bloom", "aurora", "mirror", "void"] as const);
export type ChapterTransitionId = typeof CHAPTER_TRANSITION_IDS[number];
export interface CampaignChapter {
  readonly number: string | number; readonly symbol: string; readonly title: string; readonly intro: string;
  readonly transition?: ChapterTransitionId; readonly pages: readonly ChapterPage[];
}
export interface CampaignStage {
  readonly name: string; readonly blurb: string; readonly accent: string; readonly dark?: boolean; readonly plat?: string; readonly bg?: string;
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
  readonly view?: "enter" | "page" | "ready" | "reveal";
  readonly duration?: number;
  /** Reading dwell: how long a fully shown page holds before it plays on. */
  readonly dwell?: number;
  /** Fast-forward factor while skipping; the biome reveal keeps its own pace. */
  readonly skipScale?: number;
  /** The run HUD returns during this beat, before control does. */
  readonly hud?: boolean;
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
  readonly transition?: ChapterTransitionId | undefined;
  readonly composition?: string;
  readonly wash?: string;
  /** The stage's floor colour; the prompt sits in the floor band and inks against it. */
  readonly ground?: string;
  /** The stage's sky colour: the chapter haze tone and the ink that reads on it. */
  readonly sky?: string;
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
  readonly timing: CampaignChapterTiming;

  constructor(timing: CampaignChapterTiming) { this.timing = Object.freeze({ ...timing }); }

  begin(stageIndex: number, stage: CampaignStage, priorOutro: ChapterPage | null, brief: boolean): Readonly<{ flow: CampaignChapterFlow; sequence: CampaignChapterSequence; intents: readonly ChapterIntent[] }> {
    if (stage.chapter.transition !== undefined && !CHAPTER_TRANSITION_IDS.includes(stage.chapter.transition)) {
      throw new TypeError(`unsupported chapter transition: ${stage.chapter.transition as string}`);
    }
    const story: ChapterPage[] = [];
    if (stageIndex === 0 && !this.prologueShown) { this.prologueShown = true; story.push(...CAMPAIGN_INTRO); }
    if (priorOutro) story.push(priorOutro);
    story.push(...stage.chapter.pages);
    // Brief keeps one page (the prologue's hook, or the fallen boss's relic, or the
    // stage's first page); Full keeps them all. Both hold each page for its reading dwell.
    const pages = brief ? story.slice(0, 1) : story;
    const art = stage.chapterArt ?? { composition: "left", wash: stage.dark ? "dark" : "light" };
    const flow: CampaignChapterFlow = { stageIndex, stage, chapter: stage.chapter, pages, brief, state: "LORE_ENTER", page: 0 };
    this.flow = flow;
    const scene = { playerMode: "locked" as const, number: stage.chapter.number, symbol: stage.chapter.symbol,
      title: stage.chapter.title, color: stage.accent, transition: stage.chapter.transition,
      composition: art.composition, wash: art.wash, ...(stage.plat === undefined ? {} : { ground: stage.plat }),
      ...(stage.bg === undefined ? {} : { sky: stage.bg }) };
    const pageBeats: ChapterBeat[] = pages.map((page, pageIndex) => ({ ...scene,
      id: `page-${String(pageIndex)}`, view: "page", completion: "confirm-or-timeout",
      dwell: this.timing.loreReveal + chapterPageDwell(page.text), reveal: { mode: "phrase", duration: this.timing.loreReveal },
      label: page.label, text: page.text, pageIndex, pageCount: pages.length,
    }));
    const lastPage = pages.at(-1) ?? { label: "", text: "" };
    const beats: ChapterBeat[] = [
      { ...scene, id: "enter", view: "enter", duration: this.timing.chapterIn, pageCount: pages.length },
      ...pageBeats,
      { ...scene, id: "exit", view: "page", exit: true, duration: this.timing.loreExit,
        label: lastPage.label, text: lastPage.text, pageIndex: pages.length - 1, pageCount: pages.length },
      { ...scene, id: "reveal", view: "reveal", skipScale: 1, duration: brief ? this.timing.biomeRevealBrief : this.timing.biomeRevealFull,
        name: stage.name, line: stage.chapter.intro },
      { ...scene, id: "ready", view: "ready", skipScale: 1, hud: true, duration: brief ? this.timing.readyBrief : this.timing.readyFull,
        name: stage.name, line: stage.chapter.intro },
    ];
    const sequence: CampaignChapterSequence = { id: `chapter-${String(stageIndex)}`, kind: "chapter", color: stage.accent,
      blocksCombat: true, hideHud: true, brief, hint: "TAP TO CONTINUE  ·  HOLD TO SKIP",
      skipHint: "SKIPPING TO THE BIOME", beats };
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

import type { CampaignStage, ChapterPage } from "./chapter-controller";
import { launchCampaignChapter, type ChapterSequenceLaunchOptions } from "./campaign-sequences";
import type { ChapterLaunchMemory } from "./cinematic-preference";

/** What a run's Adventure chapter launch reaches, in live play or in a detached world. */
export interface RunChapterPort {
  readonly run: () => { readonly mode: string; chapterState: string; _prologueShown?: boolean } | null;
  readonly stageAt: (index: number) => CampaignStage | null | undefined;
  readonly chapters: ChapterLaunchMemory;
  readonly launch: Omit<
    ChapterSequenceLaunchOptions,
    "stageIndex" | "stage" | "priorOutro" | "brief" | "play" | "prologueShown" | "rememberPrologue"
  >;
}

/**
 * The one chapter launch of a run: outside Adventure, or on a stage with no chapter, the wave goes live at
 * once; otherwise the chapter plays, plays brief or is skipped as the run's cinematics setting and the
 * chapters already played say.
 */
export function beginRunChapter(port: RunChapterPort, index: number, priorOutro: ChapterPage | null = null): void {
  const run = port.run();
  const stage = port.stageAt(index);
  if (run === null) return;
  if (run.mode !== "campaign" || stage?.chapter === undefined) {
    run.chapterState = "WAVE_LIVE";
    return;
  }
  const policy = port.chapters.policy(index);
  port.chapters.launched(index, policy);
  launchCampaignChapter({
    ...port.launch,
    stageIndex: index,
    stage,
    priorOutro,
    brief: policy.brief,
    play: policy.play,
    prologueShown: run._prologueShown === true,
    rememberPrologue: (shown) => {
      run._prologueShown = shown;
    },
  });
}

/**
 * Whether `beginRunChapter(index)` plays a cinematic. Only such a chapter may hold its first wave
 * prepared-but-inactive: a skipped chapter completes before that wave is prepared, so nothing would ever
 * release a deferred wave.
 */
export function runChapterGatesWave(port: RunChapterPort, index: number): boolean {
  return (
    port.run()?.mode === "campaign" && port.stageAt(index)?.chapter !== undefined && port.chapters.policy(index).play
  );
}

import { describe, expect, it, vi } from "vitest";

import { AchievementToastController } from "../../src/app/interface/achievement-toast-controller";
import { CONFIG } from "../../src/config/game-config";
import {
  createCampaignChapterBindingSpec,
  stageCampaignChapterBinding,
} from "../../src/gameplay/campaign/chapter-cinematic-binding";
import {
  CAMPAIGN_INTRO,
  CHAPTER_READING,
  chapterPageDwell,
  type CampaignChapterTiming,
  type ChapterPage,
} from "../../src/gameplay/campaign/chapter-controller";
import { CinematicTimeline } from "../../src/gameplay/runtime/cinematic-director";
import { STAGES } from "../../src/gameplay/stages";
import { layoutChapterPage, type ChapterMeasure, type ChapterTextRole } from "../../src/presentation/chapter-layout";
import { cinematicPromptForDevice } from "../../src/presentation/cinematic-prompts";
import { createUiState } from "../../src/presentation/ui-tokens";
import { promptLabel } from "../../src/domain/prompt-vocabulary";

/** The keyboard confirm keys as the prompt vocabulary words them (from the binding table). */
const CONFIRM = promptLabel("confirm", "keyboard") ?? "";

const tokens = createUiState({ bomber: "#f80", charger: "#e33", perfect: "#1cc" }).t;
const timing: CampaignChapterTiming = Object.freeze({ ...tokens.motion, dialogueDuck: 0.45, biomeRevealDuck: 0.72 });

// Fixed advances of the bundled faces: IBM Plex Mono is 600/1000; Barlow Condensed
// SemiBold capitals average under 0.46 em, so 0.46 over-estimates titles.
const TRACK: Readonly<Record<ChapterTextRole, number>> = {
  label: 3.2,
  title: 0,
  caption: 2.4,
  body: 0.2,
  line: 1.2,
  prompt: 1.6,
};
const measure: ChapterMeasure = (text, role, size) =>
  text.length * size * (role === "title" ? 0.46 : 0.6) + TRACK[role] * Math.max(0, text.length - 1);

function pagesShownAt(index: number): readonly ChapterPage[] {
  const stage = STAGES[index];
  const prior = STAGES[index - 1];
  if (stage === undefined) throw new Error(`missing stage ${String(index)}`);
  return [...(index === 0 ? CAMPAIGN_INTRO : []), ...(prior ? [prior.chapter.bossOutro] : []), ...stage.chapter.pages];
}

describe("chapter presentation contract", () => {
  it("keeps every chapter's text in a clear field above its stage's platforms", () => {
    for (const [index, stage] of STAGES.entries()) {
      const views = [
        ...pagesShownAt(index).map((page) => ({ caption: page.label, text: page.text })),
        { line: stage.chapter.intro },
      ];
      for (const view of views) {
        const layout = layoutChapterPage(
          {
            vw: 1600,
            side: stage.chapterArt.composition,
            sizes: tokens.chapterType,
            title: "line" in view ? stage.name : stage.chapter.title,
            ...view,
          },
          tokens.chapter,
          measure,
        );
        expect(layout.bodyLines.length, `${stage.id}: ${"text" in view ? view.text : ""}`).toBeLessThanOrEqual(
          tokens.chapter.bodyMaxLines,
        );
        expect(layout.bodySize).toBeGreaterThanOrEqual(16);
        for (const platform of stage.layout) {
          const clear =
            layout.bounds.bottom + 4 < platform.y ||
            layout.bounds.right < platform.x ||
            layout.bounds.left > platform.x + platform.w;
          expect(
            clear,
            `${stage.id} text field ${JSON.stringify(layout.bounds)} overlaps platform ${JSON.stringify(platform)}`,
          ).toBe(true);
        }
      }
    }
  });

  it("holds the floor band for the prompt and stops the fade at the arena floor", () => {
    expect(tokens.chapter.floorY).toBe(CONFIG.world.groundY);
    expect(tokens.chapter.promptY).toBeGreaterThan(CONFIG.world.groundY + tokens.chapterType.prompt);
    expect(tokens.chapterType.prompt).toBeGreaterThanOrEqual(14);
  });

  it("never lets a page play on before a 220 wpm reader has finished it", () => {
    for (const page of STAGES.flatMap((_stage, index) => pagesShownAt(index))) {
      const words = page.text.split(/\s+/).length;
      expect(chapterPageDwell(page.text)).toBeGreaterThanOrEqual((words * 60) / CHAPTER_READING.wordsPerMinute);
    }
    const grounds = STAGES[0];
    if (grounds === undefined) throw new Error("missing Grounds");
    const staged = stageCampaignChapterBinding(
      createCampaignChapterBindingSpec({
        stageIndex: 0,
        priorOutro: null,
        brief: false,
        prologueShownBefore: false,
        timing,
      }),
      grounds,
      { dispatch: vi.fn(), preparedWave: () => true, activationDeferred: () => true, clear: vi.fn() },
    );
    const director = new CinematicTimeline.Director(CONFIG);
    director.start(staged.binding.script, staged.binding.context);
    const step = (seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 60) director.update(1 / 60, {});
    };
    step(tokens.motion.chapterIn + 0.05);
    expect(director.beatId).toBe("page-0");
    const page = director.beat;
    if (page?.dwell === undefined) throw new Error("page beats carry a reading dwell");
    step(page.dwell - 0.3);
    expect(director.beatId, "page must hold for its reading dwell").toBe("page-0");
    step(0.5);
    expect(director.beatId, "page plays on by itself at reading pace").toBe("page-1");
  });

  it("skips to a biome reveal that keeps its own pace, and Brief keeps one page", () => {
    const pale = STAGES[4];
    if (pale === undefined) throw new Error("missing Pale");
    const port = { dispatch: vi.fn(), preparedWave: () => true, activationDeferred: () => true, clear: vi.fn() };
    const full = stageCampaignChapterBinding(
      createCampaignChapterBindingSpec({
        stageIndex: 4,
        priorOutro: STAGES[3]?.chapter.bossOutro ?? null,
        brief: false,
        prologueShownBefore: true,
        timing,
      }),
      pale,
      port,
    );
    const reveal = full.binding.script.beats.find((beat) => beat.id === "reveal");
    const ready = full.binding.script.beats.find((beat) => beat.id === "ready");
    expect(reveal?.skipScale).toBe(1);
    expect(ready).toMatchObject({ skipScale: 1, hud: true });
    const director = new CinematicTimeline.Director(CONFIG);
    director.start(full.binding.script, full.binding.context);
    director.requestSkip();
    expect(director.beatId).toBe("reveal");
    for (let t = 0; t < tokens.motion.biomeRevealFull - 0.1; t += 1 / 60) director.update(1 / 60, {});
    expect(director.beatId, "the reveal is preserved at full pace on skip").toBe("reveal");
    const brief = stageCampaignChapterBinding(
      createCampaignChapterBindingSpec({
        stageIndex: 4,
        priorOutro: STAGES[3]?.chapter.bossOutro ?? null,
        brief: true,
        prologueShownBefore: true,
        timing,
      }),
      pale,
      port,
    );
    expect(brief.flow.pages).toEqual([STAGES[3]?.chapter.bossOutro]);
  });

  it("words the chapter prompt for the device that owns input", () => {
    const hint = "TAP TO CONTINUE  ·  HOLD TO SKIP";
    expect(cinematicPromptForDevice(hint, "mouse")).toBe(`CLICK TO CONTINUE  ·  HOLD ${CONFIRM} TO SKIP`);
    expect(cinematicPromptForDevice(hint, "keyboard")).toBe(`${CONFIRM} TO CONTINUE  ·  HOLD ${CONFIRM} TO SKIP`);
    expect(cinematicPromptForDevice(hint, "gamepad", "A")).toBe("A TO CONTINUE  ·  HOLD A TO SKIP");
    expect(cinematicPromptForDevice(hint, "touch")).toBe("TAP TO CONTINUE");
  });

  it("queues achievement toasts while a cinematic owns the screen", () => {
    const toasts = new AchievementToastController((value) => value);
    const pending = [{ id: "a", name: "Threshold", desc: "Clear a stage.", rarity: "common", cat: "run" }];
    const seen: string[] = [];
    const input = {
      pending,
      rarities: {},
      commonRarity: { name: "COMMON", color: "#888" },
      categories: {},
      markSeen: (id: string) => {
        seen.push(id);
      },
      save: () => undefined,
      shardsFor: () => 0,
      coinsFor: () => 0,
    };
    expect(toasts.step(0.5, { ...input, held: true })).toBeNull();
    expect(pending).toHaveLength(1);
    expect(seen).toEqual([]);
    expect(toasts.step(0.5, input)?.name).toBe("Threshold");
    expect(seen).toEqual(["a"]);
  });
});

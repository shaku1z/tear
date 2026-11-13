// ------- cinematic renderer -------------------------------------------------
// The timeline itself is simulation and lives in
// `src/gameplay/runtime/cinematic-director.ts`. This module adds the canvas
// drawing on top of it through an explicit per-world presentation policy.
import { CinematicTimeline } from "../gameplay/runtime/cinematic-director";

export type { CinematicBeat, CinematicScript, CinematicDirectorPort }
  from "../gameplay/runtime/cinematic-director";

interface ScreenRect { x?: number; y?: number; width?: number; height?: number; w?: number; h?: number }
export interface CinematicUiPort {
  t: { motion: Record<string, number> & { finalRewardIn: number } };
  chapterHeader(context: CanvasRenderingContext2D, options: Record<string, unknown>): void;
  loreFragment(context: CanvasRenderingContext2D, options: Record<string, unknown>): void;
  chapterPrompt(context: CanvasRenderingContext2D, options: Record<string, unknown>): void;
  biomeReveal(context: CanvasRenderingContext2D, options: Record<string, unknown>): void;
  cinematicFrame(context: CanvasRenderingContext2D, options: Record<string, unknown>): void;
  finaleFracture(context: CanvasRenderingContext2D, options: Record<string, unknown>): void;
  finalReward(context: CanvasRenderingContext2D, options: Record<string, unknown>): void;
  cinematicPrompt(context: CanvasRenderingContext2D, options: Record<string, unknown>): void;
  bossDeclaration(context: CanvasRenderingContext2D, options: Record<string, unknown>): void;
  dialogueCard(context: CanvasRenderingContext2D, options: Record<string, unknown>): void;
}

export interface CinematicPresentationPolicy {
  readonly presentation: Readonly<{ minFullyVisible: number; skipHold: number }>;
}

export type CinematicRendererDirector = InstanceType<typeof CinematicTimeline.Director> & Readonly<{
  draw(context: CanvasRenderingContext2D, ui: CinematicUiPort, screen: ScreenRect, reducedMotion?: boolean,
    prompt?: CinematicPromptTransform): void;
}>;

/** Rewrites an authored prompt for the active input device (see cinematic-prompts). */
export type CinematicPromptTransform = (text: string) => string;
const authoredPrompt: CinematicPromptTransform = (text) => text;

export interface CinematicPresentationRuntime {
  readonly Director: new (
    configuration: ConstructorParameters<typeof CinematicTimeline.Director>[0],
  ) => CinematicRendererDirector;
}

/** Creates the Canvas renderer class for one world's live presentation policy. */
export function createCinematics(policy: CinematicPresentationPolicy): CinematicPresentationRuntime {
  class Director extends CinematicTimeline.Director {
    draw(ctx: CanvasRenderingContext2D, ui: CinematicUiPort, screen: ScreenRect, reducedMotion = false,
      prompt: CinematicPromptTransform = authoredPrompt): void {
      drawCinematicDirector(this, policy, ctx, ui, screen, reducedMotion, prompt);
    }
  }

  return Object.freeze({ Director } satisfies CinematicPresentationRuntime);
}

export function drawCinematicDirector(director: Readonly<Pick<InstanceType<typeof CinematicTimeline.Director>,
  "script" | "beat" | "skipping" | "elapsed" | "progress" | "brief" | "totalElapsed" | "revealProgress" | "fullyVisibleElapsed" | "latchArmed" | "latchHoldSeconds" | "autoImminent">>,
  policy: CinematicPresentationPolicy, ctx: CanvasRenderingContext2D, ui: CinematicUiPort, screen: ScreenRect, reducedMotion = false,
  prompt: CinematicPromptTransform = authoredPrompt): void {
      const script = director.script;
      if (!script) return;
      const b = director.beat;
      if (script.kind === "chapter") {
        drawChapterBeat(director, policy, ctx, ui, reducedMotion, prompt);
        return;
      }
      if (script.kind === "finale") {
        ui.cinematicFrame(ctx, { screen, amount: Math.min(1, director.totalElapsed / 0.45),
          color: script.color, reducedMotion });
        if (b && (b.id === "silence" || b.id === "wound")) ui.finaleFracture(ctx, {
          amount: b.id === "silence" ? director.progress * 0.35 : 0.35 + director.progress * 0.65, color: script.color });
        if (b?.view === "epilogue") {
          const inK = Math.min(1, director.elapsed / (ui.t.motion.chapterPageCross ?? 0.35)), art = { color: b.color ?? script.color, composition: "left" };
          ui.chapterHeader(ctx, Object.assign({ label: b.label, title: b.title, amount: inK }, art));
          ui.loreFragment(ctx, Object.assign({ title: b.title, text: b.text, reveal: reducedMotion ? 1 : director.revealProgress, amount: inK }, art));
          ui.chapterPrompt(ctx, Object.assign({ text: prompt(b.hint ?? script.hint ?? ""),
            amount: director.revealProgress >= 1 ? inK : 0 }, art));
        }
        else if (b?.view === "reward") ui.finalReward(ctx, { label: b.label, title: b.title, sigil: b.sigil,
          reward: b.reward, detail: b.detail, color: b.color ?? script.color,
          amount: Math.min(1, director.elapsed / ui.t.motion.finalRewardIn), hint: prompt(b.hint ?? script.hint ?? "") });
        else if (b?.hint) ui.cinematicPrompt(ctx, { text: prompt(b.hint), amount: Math.min(1, director.elapsed / 0.22),
          color: b.color ?? script.color });
        return;
      }
      ui.cinematicFrame(ctx, { screen, amount: Math.min(1, director.totalElapsed / 0.45),
        color: script.color, reducedMotion });
      if (b?.line) {
        // shared reading affordances (no countdown bar): a continue chevron once
        // readable, a hold ring while a newly armed skip charges, AUTO near a timeout.
        const shared = { speaker: b.speaker, line: b.line, color: b.color ?? script.color,
          amount: Math.min(1, director.elapsed / 0.22), reveal: reducedMotion ? 1 : director.revealProgress,
          canAdvance: director.revealProgress >= 1 && director.fullyVisibleElapsed >= policy.presentation.minFullyVisible * 0.5,
          holdRing: director.latchArmed ? Math.min(1, director.latchHoldSeconds / policy.presentation.skipHold) : 0,
          auto: director.autoImminent };
        // Boss transformation rituals anchor the line to a corner so world
        // choreography owns the center; other scripts keep the dialogue card.
        if (script.kind === "ritual") ui.bossDeclaration(ctx, Object.assign({ anchor: b.anchor, maxWidth: b.maxWidth }, shared));
        else ui.dialogueCard(ctx, Object.assign({ hint: director.skipping ? (script.skipHint ?? "SKIPPING — GAMEPLAY OUTCOME PRESERVED") :
          prompt(script.hint ?? "TAP TO ADVANCE  ·  HOLD TO SKIP") }, shared));
      }
}

type ChapterDirector = Parameters<typeof drawCinematicDirector>[0];

/**
 * Living-biome chapter beats. The header (numeral, title, fade) breathes in on ENTER
 * and then holds still while pages crossfade under it; a page's prompt appears once
 * its words are all shown, so it never promises a press that only finishes a reveal.
 */
function drawChapterBeat(director: ChapterDirector, policy: CinematicPresentationPolicy, ctx: CanvasRenderingContext2D,
  ui: CinematicUiPort, reducedMotion: boolean, prompt: CinematicPromptTransform): void {
  const script = director.script, b = director.beat;
  if (!script || !b) return;
  const mo = ui.t.motion, cross = mo.chapterPageCross ?? 0.35;
  const art = { color: b.color ?? script.color, composition: b.composition, title: b.title, ground: b.ground, sky: b.sky };
  const header = { label: `CHAPTER ${String(b.number ?? "")}`, count: b.pageCount, index: b.pageIndex ?? -1 };
  if (b.view === "enter") {
    const k = reducedMotion ? 1 : Math.min(1, director.progress);
    ui.chapterHeader(ctx, Object.assign({}, header, art, { amount: k }));
    return;
  }
  if (b.view === "page") {
    const inK = reducedMotion ? 1 : Math.min(1, director.elapsed / cross);
    const loreK = b.exit ? Math.max(0, 1 - director.progress) : inK;
    ui.chapterHeader(ctx, Object.assign({}, header, art, { amount: 1 }));
    ui.loreFragment(ctx, Object.assign({}, art, { caption: b.label, text: b.text, amount: loreK,
      reveal: b.exit || reducedMotion ? 1 : director.revealProgress }));
    if (b.exit) return;
    const shown = director.revealProgress >= 1 ? Math.min(1, director.fullyVisibleElapsed / cross) : 0;
    const hold = director.latchArmed ? Math.min(1, director.latchHoldSeconds / policy.presentation.skipHold) : 0;
    const text = director.skipping ? (script.skipHint ?? "") : prompt(script.hint ?? "TAP TO CONTINUE  ·  HOLD TO SKIP");
    ui.chapterPrompt(ctx, Object.assign({}, art, { text, amount: reducedMotion ? 1 : shown, hold }));
    return;
  }
  if (b.view === "reveal" || b.view === "ready") {
    ui.biomeReveal(ctx, Object.assign({}, art, { number: b.number, name: b.name, line: b.line,
      amount: b.view === "ready" ? 1 : Math.min(1, director.progress), ready: b.view === "ready",
      readyK: b.view === "ready" ? director.progress : 0 }));
  }
}

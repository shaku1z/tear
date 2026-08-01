// ------- cinematic renderer -------------------------------------------------
// The timeline itself is simulation and lives in
// `src/gameplay/runtime/cinematic-director.ts`. This module adds the canvas
// drawing on top of it and keeps the historic `Cinematics.Director` surface.
import { CONFIG } from "../config/game-config";
import { CinematicTimeline } from "../gameplay/runtime/cinematic-director";

const P = () => CONFIG.presentation;

export type { CinematicBeat, CinematicScript, CinematicDirectorPort }
  from "../gameplay/runtime/cinematic-director";

interface ScreenRect { x?: number; y?: number; width?: number; height?: number; w?: number; h?: number }
export interface CinematicUiPort {
  t: { motion: Record<string, number> & { finalRewardIn: number } };
  chapterHeader(context: CanvasRenderingContext2D, options: Record<string, unknown>): void;
  chapterProgress(context: CanvasRenderingContext2D, options: Record<string, unknown>): void;
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

class Director extends CinematicTimeline.Director {
    draw(ctx: CanvasRenderingContext2D, ui: CinematicUiPort, screen: ScreenRect, reducedMotion = false): void {
      const script = this.script;
      if (!script) return;
      const b = this.beat;
      if (script.kind === "chapter") {
        const S = script, mo = ui.t.motion;
        const hint = this.skipping ? (S.skipHint ?? "SKIPPING CHAPTER") : (S.hint ?? "TAP TO REVEAL  ·  HOLD TO SKIP");
        if (b?.view === "page") {
          // enter fades the whole composition in; the EXIT beat holds the header
          // and chapter label while only the lore fragment softens away.
          const inK = b.exit ? 1 : Math.min(1, this.elapsed / (mo.chapterPageCross ?? 0.26));
          const loreK = b.exit ? Math.max(0, 1 - this.progress) : inK;
          const art = { color: b.color ?? S.color, composition: b.composition, wash: b.wash };
          ui.chapterHeader(ctx, Object.assign({ label: b.label, title: b.title, amount: inK }, art));
          ui.chapterProgress(ctx, Object.assign({ index: b.pageIndex, count: b.pageCount, amount: inK }, art));
          ui.loreFragment(ctx, Object.assign({ text: b.text, reveal: b.exit ? 1 : this.revealProgress, amount: loreK }, art));
          if (!b.exit) ui.chapterPrompt(ctx, Object.assign({ text: hint, amount: inK }, art));
        } else if (b && (b.view === "reveal" || b.view === "ready")) {
          const revDur = this.brief ? (mo.biomeRevealBrief ?? 1.0) : (mo.biomeRevealFull ?? 1.6);
          ui.biomeReveal(ctx, { number: b.number, name: b.name, line: b.line, color: b.color ?? S.color,
            composition: b.composition, wash: b.wash,
            amount: b.view === "ready" ? 1 : Math.min(1, this.elapsed / revDur), ready: b.view === "ready" });
        }
        return;
      }
      if (script.kind === "finale") {
        ui.cinematicFrame(ctx, { screen, amount: Math.min(1, this.totalElapsed / 0.45),
          color: script.color, reducedMotion });
        if (b && (b.id === "silence" || b.id === "wound")) ui.finaleFracture(ctx, {
          amount: b.id === "silence" ? this.progress * 0.35 : 0.35 + this.progress * 0.65, color: script.color });
        if (b?.view === "epilogue") {
          const inK = Math.min(1, this.elapsed / 0.26), art = { color: b.color ?? script.color, composition: "left", wash: "dark" };
          ui.chapterHeader(ctx, Object.assign({ label: b.label, title: b.title, amount: inK }, art));
          ui.loreFragment(ctx, Object.assign({ text: b.text, reveal: this.revealProgress, amount: inK }, art));
          ui.chapterPrompt(ctx, Object.assign({ text: b.hint ?? script.hint, amount: inK }, art));
        }
        else if (b?.view === "reward") ui.finalReward(ctx, { label: b.label, title: b.title, sigil: b.sigil,
          reward: b.reward, detail: b.detail, color: b.color ?? script.color,
          amount: Math.min(1, this.elapsed / ui.t.motion.finalRewardIn), hint: b.hint ?? script.hint });
        else if (b?.hint) ui.cinematicPrompt(ctx, { text: b.hint, amount: Math.min(1, this.elapsed / 0.22),
          color: b.color ?? script.color });
        return;
      }
      ui.cinematicFrame(ctx, { screen, amount: Math.min(1, this.totalElapsed / 0.45),
        color: script.color, reducedMotion });
      if (b?.line) {
        // shared reading affordances (no countdown bar): a continue chevron once
        // readable, a hold ring while a newly armed skip charges, AUTO near a timeout.
        const shared = { speaker: b.speaker, line: b.line, color: b.color ?? script.color,
          amount: Math.min(1, this.elapsed / 0.22), reveal: reducedMotion ? 1 : this.revealProgress,
          canAdvance: this.revealProgress >= 1 && this.fullyVisibleElapsed >= P().minFullyVisible * 0.5,
          holdRing: this.latchArmed ? Math.min(1, this.latchHoldSeconds / P().skipHold) : 0,
          auto: this.autoImminent };
        // Boss transformation rituals anchor the line to a corner so world
        // choreography owns the center; other scripts keep the dialogue card.
        if (script.kind === "ritual") ui.bossDeclaration(ctx, Object.assign({ anchor: b.anchor, maxWidth: b.maxWidth }, shared));
        else ui.dialogueCard(ctx, Object.assign({ hint: this.skipping ? (script.skipHint ?? "SKIPPING — GAMEPLAY OUTCOME PRESERVED") :
          (script.hint ?? "TAP TO ADVANCE  ·  HOLD TO SKIP") }, shared));
      }
    }
}

const Cinematics = Object.freeze({ Director });

export { Cinematics };

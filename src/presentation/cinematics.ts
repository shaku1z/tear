// ------- serialized cinematic director ------------------------------------
// One exclusive channel owns boss dialogue, camera beats and gameplay re-entry.
// Scripts inject world callbacks; this module owns ordering, skip semantics and UI.
import { CONFIG } from "../config/game-config";

type CompletionPolicy = "condition" | "confirm" | "confirm-or-timeout" | "timed";
type CinematicContext = Record<string, unknown>;

export interface CinematicDirectorPort {
  readonly active: boolean;
  readonly id: string | undefined;
  readonly beatId: string | undefined;
  readonly progress: number;
  readonly revealProgress: number;
  readonly fullyVisible: boolean;
  readonly brief: boolean;
  readonly blocksCombat: boolean;
  readonly hideHud: boolean;
  readonly playerMode: string;
  elapsed: number;
  totalElapsed: number;
  skipping: boolean;
  skipTo(id: string): boolean;
  requestSkip(): void;
  complete(): void;
  cancel(reason: string): void;
}

interface RevealSpec {
  mode?: "none" | "phrase" | "characters";
  duration?: number;
  charsPerSecond?: number;
}

export interface CinematicBeat {
  id: string;
  duration?: number;
  skipScale?: number;
  reveal?: RevealSpec;
  line?: string;
  completion?: CompletionPolicy;
  waitUntil?: (context: CinematicContext, director: CinematicDirectorPort) => boolean;
  onEnter?: (context: CinematicContext, director: CinematicDirectorPort) => void;
  onExit?: (context: CinematicContext, director: CinematicDirectorPort) => void;
  onUpdate?: (context: CinematicContext, director: CinematicDirectorPort, deltaSeconds: number) => void;
  minDuration?: number;
  playerMode?: string;
  speaker?: string;
  view?: string;
  exit?: boolean;
  color?: string;
  composition?: string;
  wash?: string;
  label?: string;
  title?: string;
  text?: string;
  pageIndex?: number;
  pageCount?: number;
  number?: string | number;
  name?: string;
  hint?: string;
  sigil?: string;
  reward?: string;
  detail?: string;
  anchor?: string;
  maxWidth?: number;
}

export interface CinematicScript {
  readonly id: string;
  readonly beats: readonly CinematicBeat[];
  kind?: string;
  brief?: boolean;
  blocksCombat?: boolean;
  hideHud?: boolean;
  color?: string;
  composition?: string;
  wash?: string;
  hint?: string;
  skipHint?: string;
  onStart?: (context: CinematicContext, director: CinematicDirectorPort) => void;
  onSkip?: (context: CinematicContext, director: CinematicDirectorPort) => void;
  onComplete?: (context: CinematicContext, director: CinematicDirectorPort) => void;
  onCancel?: (context: CinematicContext, reason: string, director: CinematicDirectorPort) => void;
}

interface ConfirmSources { key?: boolean; touch?: boolean; pad?: boolean; mouse?: boolean; click?: boolean }
interface LatchResult { reveal: boolean; skip: boolean }
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

const Cinematics = (() => {
  "use strict";

  const P = () => CONFIG.presentation;
  const clamp01 = (value: number) => value < 0 ? 0 : value > 1 ? 1 : value;
  const wordCount = (value?: string) => value ? value.trim().split(/\s+/).filter(Boolean).length : 0;

  // Compute a human reveal duration for a dialogue line: a base character rate
  // plus natural pauses on punctuation. Chapter/lore uses a short phrase stagger.
  function revealDuration(beat: CinematicBeat, brief: boolean): number {
    if (brief) return 0;                                  // Brief shows the line immediately
    const rv = beat.reveal;
    if (rv?.mode === "none") return 0;
    if (rv?.mode === "phrase") return rv.duration ?? 0.32;
    const line = beat.line;
    if (!line) return 0;
    const p = P(), cps = rv?.charsPerSecond ?? p.revealCharsPerSec;
    let d = line.length / cps;
    for (const ch of line) {
      if (ch === ",") d += p.revealCommaPause;
      else if (ch === "." || ch === "!" || ch === "?") d += p.revealStopPause;
      else if (ch === "\n") d += p.revealNewlinePause;
    }
    return d;
  }
  // The auto-advance fallback for a spoken beat, measured from beat start. Full
  // mode is clamped never below 4s; Brief holds a shown line 2.2–3.2s by length.
  function autoAfter(beat: CinematicBeat, brief: boolean): number {
    const p = P(), words = wordCount(beat.line);
    if (brief) return Math.min(p.briefHoldMax, Math.max(p.briefHoldMin, p.briefHoldMin + words * p.briefHoldPerWord));
    return Math.min(p.bossAutoMax, Math.max(p.bossAutoMin, p.bossAutoBase + words / 3.2));
  }

  // INPUT LATCH — a new scene never inherits a gameplay-held control. It arms only
  // after every confirm source has been released continuously, then a NEW press
  // reveals/advances and a NEW sustained hold skips. Mouse (blade) never skips.
  class InputLatch {
    armed = false;
    releasedT = 0;
    holdT = 0;
    prev: ConfirmSources = {};
    constructor() { this.reset(); }
    reset() { this.armed = false; this.releasedT = 0; this.holdT = 0; this.prev = {}; }
    begin() { this.reset(); }   // scene start: nothing counts until release+arm
    // sources: { key, touch, pad, mouse } booleans of "currently held"; click = edge
    update(dt: number, sources: ConfirmSources = {}): LatchResult {
      const s = sources, p = P();
      const confirmDown = [s.key, s.touch, s.pad].some(Boolean);   // mouse excluded from arming + skip
      if (!this.armed) {
        this.releasedT = confirmDown ? 0 : this.releasedT + dt;
        if (this.releasedT >= p.armAfterRelease) this.armed = true;
        this.prev = { key: !!s.key, touch: !!s.touch, pad: !!s.pad };
        return { reveal: false, skip: false };            // pre-arm: inherited holds are ignored
      }
      const rising = (!!s.key && !this.prev.key) || (!!s.touch && !this.prev.touch) ||
        (!!s.pad && !this.prev.pad) || !!s.click;   // blade mouse never drives cinema
      this.holdT = confirmDown ? this.holdT + dt : 0;      // a hold begun after arming
      const skip = this.holdT >= (p.skipHold || 0.80);
      this.prev = { key: !!s.key, touch: !!s.touch, pad: !!s.pad };
      return { reveal: rising, skip };
    }
  }

  class Director {
    private readonly _latch = new InputLatch();
    script: CinematicScript | null = null;
    context: CinematicContext | null = null;
    index = -1;
    elapsed = 0;
    revealElapsed = 0;
    fullyVisibleElapsed = 0;
    totalElapsed = 0;
    skipping = false;
    finished = false;
    forceReveal = false;
    private _revealDur = 0;
    private _autoAfter = 0;
    constructor() { this.reset(); }
    reset() {
      this.script = null; this.context = null; this.index = -1;
      this.elapsed = 0; this.revealElapsed = 0; this.fullyVisibleElapsed = 0;
      this.totalElapsed = 0; this.skipping = false; this.finished = false; this.forceReveal = false;
      this._revealDur = 0; this._autoAfter = 0;
      this._latch.reset();
    }
    get active() { return !!this.script; }
    get id(): string | undefined { return this.script?.id; }
    get beat(): CinematicBeat | undefined { return this.script?.beats[this.index]; }
    get beatId(): string | undefined { return this.beat?.id; }
    get brief() { return !!(this.script?.brief); }
    get blocksCombat() { return !!(this.script?.blocksCombat); }
    get hideHud() { return !!(this.script?.hideHud); }
    get playerMode() { return this.beat?.playerMode ?? "locked"; }
    get progress() {
      const b = this.beat, d = b && Number(b.duration);
      return b && d !== undefined && Number.isFinite(d) && d > 0 ? clamp01(this.elapsed / this._duration(b)) : 0;
    }
    get revealProgress() {
      if (this.forceReveal || !this._revealDur || this._revealDur <= 0) return 1;
      return clamp01(this.revealElapsed / this._revealDur);
    }
    get fullyVisible() { return this.revealProgress >= 1; }
    // which timing/completion contract governs the current beat
    private _policy(beat: CinematicBeat): CompletionPolicy {
      if (beat.completion) return beat.completion;
      if (beat.waitUntil) return "condition";
      if (beat.line) return "confirm-or-timeout";   // spoken lines never expire sub-second
      return "timed";
    }
    // is the AUTO fallback approaching (drives the AUTO glyph)
    get autoImminent() {
      const b = this.beat; if (!b || this._policy(b) !== "confirm-or-timeout") return false;
      return this._autoAfter - this.elapsed <= P().autoGlyphLead;
    }
    start(script: CinematicScript | null | undefined, context: CinematicContext = {}): this {
      if (!script || !Array.isArray(script.beats) || !script.beats.length) throw new Error("Cinematics.start requires beats");
      if (this.active) this.cancel("replaced");
      this.reset();
      this.script = script; this.context = context;
      this._latch.begin();
      if (script.onStart) script.onStart(this.context, this);
      this._advance(); return this;
    }
    private _duration(beat: CinematicBeat): number {
      const d = Math.max(0.001, Number(beat.duration) || 0.001);
      return this.skipping ? d * (beat.skipScale ?? 0.35) : d;
    }
    private _enter(): void {
      this.elapsed = 0; this.revealElapsed = 0; this.fullyVisibleElapsed = 0; this.forceReveal = false;
      const b = this.beat;
      this._revealDur = b ? revealDuration(b, this.brief) : 0;
      this._autoAfter = b ? autoAfter(b, this.brief) : 0;
      if (b?.onEnter) b.onEnter(this.context ?? {}, this);
    }
    private _advance(): void {
      if (this.beat?.onExit) this.beat.onExit(this.context ?? {}, this);
      this.index++;
      if (!this.script || this.index >= this.script.beats.length) { this.complete(); return; }
      this._enter();
    }
    advance(): void { this._advance(); }
    skipTo(id: string): boolean {
      if (!this.script) return false;
      const idx = this.script.beats.findIndex((b) => b.id === id);
      if (idx < 0) return false;
      if (this.beat?.onExit) this.beat.onExit(this.context ?? {}, this);
      this.index = idx; this._enter(); return true;
    }
    requestSkip() {
      const script = this.script;
      if (!script || this.skipping) return;
      this.skipping = true;
      if (script.onSkip) script.onSkip(this.context ?? {}, this);
    }
    // manual confirm may advance a reading beat only once it is fully readable
    private _canConfirmAdvance(beat: CinematicBeat): boolean {
      const policy = this._policy(beat);
      if (policy === "timed") return this.elapsed >= (beat.minDuration ?? 0.18);
      if (policy === "condition") return false;                 // condition beats advance only on their condition
      return this.revealProgress >= 1;                          // confirm / confirm-or-timeout
    }
    update(dt: number, controls: ConfirmSources = {}): void {
      if (!this.active) return;
      this.totalElapsed += dt;
      const latch = this._latch.update(dt, controls);
      if (latch.skip) this.requestSkip();
      const beat = this.beat; if (!beat) return;
      this.elapsed += dt;
      if (this.revealProgress < 1 && !this.forceReveal) this.revealElapsed += dt;
      this.fullyVisibleElapsed = this.revealProgress >= 1 ? this.fullyVisibleElapsed + dt : 0;
      if (beat.onUpdate) beat.onUpdate(this.context ?? {}, this, dt);
      // a fresh (post-arm) press first completes an unfinished reveal, then advances
      if (latch.reveal) {
        if (this.revealProgress < 1 && !this.forceReveal) { this.forceReveal = true; return; }
        if (this._canConfirmAdvance(beat)) { this._advance(); return; }
      }
      // while SKIPPING, reading beats fast-forward but still run their callbacks
      if (this.skipping) {
        this.forceReveal = true;
        const policy = this._policy(beat);
        if (policy === "condition") { if (beat.waitUntil?.(this.context ?? {}, this)) this._advance(); return; }
        if (this.elapsed >= this._duration(beat)) this._advance();
        return;
      }
      // completion policy
      switch (this._policy(beat)) {
        case "condition":
          if (this.elapsed >= (beat.minDuration ?? 0) && beat.waitUntil?.(this.context ?? {}, this)) this._advance();
          return;
        case "confirm":
          return;   // never auto-advances — waits for the player
        case "confirm-or-timeout":
          if (this.revealProgress >= 1 && this.fullyVisibleElapsed >= P().minFullyVisible && this.elapsed >= this._autoAfter) this._advance();
          return;
        default:      // "timed"
          if (this.elapsed >= this._duration(beat)) this._advance();
      }
    }
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
          holdRing: this._latch.armed ? Math.min(1, this._latch.holdT / P().skipHold) : 0,
          auto: this.autoImminent };
        // Boss transformation rituals anchor the line to a corner so world
        // choreography owns the center; other scripts keep the dialogue card.
        if (script.kind === "ritual") ui.bossDeclaration(ctx, Object.assign({ anchor: b.anchor, maxWidth: b.maxWidth }, shared));
        else ui.dialogueCard(ctx, Object.assign({ hint: this.skipping ? (script.skipHint ?? "SKIPPING — GAMEPLAY OUTCOME PRESERVED") :
          (script.hint ?? "TAP TO ADVANCE  ·  HOLD TO SKIP") }, shared));
      }
    }
    complete(): void {
      if (!this.script) return;
      const script = this.script, context = this.context;
      this.finished = true; this.script = null; this.context = null; this.index = -1;
      if (script.onComplete) script.onComplete(context ?? {}, this);
    }
    cancel(reason: string): void {
      if (!this.script) return;
      const script = this.script, context = this.context;
      this.script = null; this.context = null; this.index = -1;
      if (script.onCancel) script.onCancel(context ?? {}, reason, this);
    }
  }

  return Object.freeze({ Director });
})();

export { Cinematics };

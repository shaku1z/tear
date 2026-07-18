// ------- serialized cinematic director ------------------------------------
// One exclusive channel owns boss dialogue, camera beats and gameplay re-entry.
// Scripts inject world callbacks; this module owns ordering, skip semantics and UI.
const Cinematics = (() => {
  "use strict";

  class Director {
    constructor() { this.reset(); }
    reset() {
      this.script = null; this.context = null; this.index = -1; this.elapsed = 0;
      this.holdT = 0; this.totalElapsed = 0; this.skipping = false; this.finished = false; this.forceReveal = false;
    }
    get active() { return !!this.script; }
    get id() { return this.script && this.script.id; }
    get beat() { return this.script && this.script.beats[this.index]; }
    get beatId() { return this.beat && this.beat.id; }
    get blocksCombat() { return !!(this.script && this.script.blocksCombat); }
    get hideHud() { return !!(this.script && this.script.hideHud); }
    get playerMode() { return (this.beat && this.beat.playerMode) || "locked"; }
    get progress() {
      const b = this.beat, d = b && Number(b.duration);
      return b && Number.isFinite(d) && d > 0 ? Math.max(0, Math.min(this.elapsed / this._duration(b), 1)) : 0;
    }
    get revealProgress() {
      const b = this.beat, d = b && Number(b.revealDuration);
      return this.forceReveal || !d ? 1 : Math.max(0, Math.min(this.elapsed / d, 1));
    }
    start(script, context) {
      if (!script || !Array.isArray(script.beats) || !script.beats.length) throw new Error("Cinematics.start requires beats");
      if (this.active) this.cancel("replaced");
      this.script = script; this.context = context || {}; this.index = -1; this.elapsed = 0;
      this.holdT = 0; this.totalElapsed = 0; this.skipping = false; this.finished = false;
      if (script.onStart) script.onStart(this.context, this);
      this._advance(); return this;
    }
    _duration(beat) {
      const d = Math.max(0.001, Number(beat.duration) || 0.001);
      return this.skipping ? d * (beat.skipScale == null ? 0.35 : beat.skipScale) : d;
    }
    _enter() {
      this.elapsed = 0; this.forceReveal = false;
      if (this.beat && this.beat.onEnter) this.beat.onEnter(this.context, this);
    }
    _advance() {
      if (this.beat && this.beat.onExit) this.beat.onExit(this.context, this);
      this.index++;
      if (!this.script || this.index >= this.script.beats.length) { this.complete(); return; }
      this._enter();
    }
    skipTo(id) {
      if (!this.script) return false;
      const idx = this.script.beats.findIndex((b) => b.id === id);
      if (idx < 0) return false;
      if (this.beat && this.beat.onExit) this.beat.onExit(this.context, this);
      this.index = idx; this._enter(); return true;
    }
    requestSkip() {
      if (!this.active || this.skipping) return;
      this.skipping = true;
      if (this.script.onSkip) this.script.onSkip(this.context, this);
    }
    update(dt, controls) {
      if (!this.active) return;
      const c = controls || {}, held = !!c.hold;
      this.totalElapsed += dt;
      this.holdT = held ? this.holdT + dt : 0;
      if (this.holdT >= 0.65) this.requestSkip();
      const beat = this.beat; if (!beat) return;
      this.elapsed += dt;
      if (beat.onUpdate) beat.onUpdate(this.context, this, dt);
      if (c.pressed && beat.advanceable && this.elapsed >= (beat.minDuration || 0.18)) {
        if (beat.revealDuration && !this.forceReveal && this.revealProgress < 1) { this.forceReveal = true; return; }
        this._advance(); return;
      }
      if (beat.waitUntil) {
        if (this.elapsed >= (beat.minDuration || 0) && beat.waitUntil(this.context, this)) this._advance();
        return;
      }
      if (this.elapsed >= this._duration(beat)) this._advance();
    }
    draw(ctx, ui, screen, reducedMotion) {
      if (!this.active || !ui) return;
      const b = this.beat;
      if (this.script.kind === "chapter") {
        const hint = this.skipping ? (this.script.skipHint || "SKIPPING CHAPTER") : (this.script.hint || "TAP TO REVEAL  ·  HOLD TO SKIP");
        if (b && b.view === "page") ui.chapterCard(ctx, { number: b.number, symbol: b.symbol, label: b.label,
          title: b.title, text: b.text, color: b.color || this.script.color,
          amount: b.exit ? 1 - this.progress : Math.min(1, this.elapsed / 0.22),
          reveal: b.exit ? 1 : this.revealProgress, pageIndex: b.pageIndex, pageCount: b.pageCount,
          transition: b.transition, hint });
        else if (b && (b.view === "reveal" || b.view === "ready")) ui.biomeReveal(ctx, { number: b.number, name: b.name,
          line: b.line, color: b.color || this.script.color,
          amount: b.view === "ready" ? 1 : Math.min(1, this.elapsed / (ui.t.motion.biomeRevealIn || 0.42)), ready: b.view === "ready" });
        return;
      }
      ui.cinematicFrame(ctx, { screen, amount: Math.min(1, this.totalElapsed / 0.45),
        color: this.script.color, reducedMotion: !!reducedMotion });
      if (b && b.line) ui.dialogueCard(ctx, { speaker: b.speaker, line: b.line, color: b.color || this.script.color,
        amount: Math.min(1, this.elapsed / 0.22), progress: this.progress,
        hint: this.skipping ? (this.script.skipHint || "SKIPPING — GAMEPLAY OUTCOME PRESERVED") :
          (this.script.hint || "TAP TO ADVANCE  ·  HOLD TO SKIP") });
    }
    complete() {
      if (!this.script) return;
      const script = this.script, context = this.context;
      this.finished = true; this.script = null; this.context = null; this.index = -1;
      if (script.onComplete) script.onComplete(context, this);
    }
    cancel(reason) {
      if (!this.script) return;
      const script = this.script, context = this.context;
      this.script = null; this.context = null; this.index = -1;
      if (script.onCancel) script.onCancel(context, reason, this);
    }
  }

  return Object.freeze({ Director });
})();

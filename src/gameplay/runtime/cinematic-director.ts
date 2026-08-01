// ------- serialized cinematic director ------------------------------------
// One exclusive channel owns boss dialogue, camera beats and gameplay re-entry.
// Scripts inject world callbacks; this module owns ordering and skip semantics.
//
// This is simulation, not presentation: while a script with `blocksCombat`
// runs, the combat phases refuse to advance and the player is held in the
// beat's mode. A world that cannot advance this timeline cannot reproduce a
// run that opens on a brief, so the timeline lives in gameplay and only its
// drawing lives in presentation.
import { CONFIG } from "../../config/game-config";

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
  captureState(): CinematicDirectorStateV1;
  validateState(snapshot: unknown, binding?: CinematicDirectorBinding): CinematicDirectorStateV1;
  restoreState(snapshot: unknown, binding?: CinematicDirectorBinding): void;
}

export interface CinematicDirectorBinding {
  readonly script: CinematicScript;
  readonly context: Readonly<Record<string, unknown>>;
}

/** Data-only position of a bound cinematic script; callbacks are never serialized. */
export interface CinematicDirectorStateV1 {
  readonly format: "tear.cinematic-director";
  readonly schemaVersion: 1;
  readonly active: boolean;
  readonly scriptId: string | null;
  readonly scriptRevision: string | null;
  readonly beatId: string | null;
  readonly beatIndex: number;
  readonly elapsedSeconds: number;
  readonly revealElapsedSeconds: number;
  readonly fullyVisibleElapsedSeconds: number;
  readonly totalElapsedSeconds: number;
  readonly fullyVisible: boolean;
  readonly skipping: boolean;
  readonly finished: boolean;
}

export const INACTIVE_CINEMATIC_DIRECTOR_STATE_V1: CinematicDirectorStateV1 = Object.freeze({
  format: "tear.cinematic-director",
  schemaVersion: 1,
  active: false,
  scriptId: null,
  scriptRevision: null,
  beatId: null,
  beatIndex: -1,
  elapsedSeconds: 0,
  revealElapsedSeconds: 0,
  fullyVisibleElapsedSeconds: 0,
  totalElapsedSeconds: 0,
  fullyVisible: true,
  skipping: false,
  finished: false,
});

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
  readonly revision?: string;
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

const CinematicTimeline = (() => {
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
    captureState(): CinematicDirectorStateV1 {
      // An inactive director has no behavior-bearing position. Canonicalize it
      // so a prior cancelled/completed script cannot leak irrelevant timers
      // into world hashes or make equivalent idle worlds compare differently.
      const script = this.script;
      if (script === null) return INACTIVE_CINEMATIC_DIRECTOR_STATE_V1;
      if (this.index < 0 || this.beat === undefined) {
        throw new Error("cinematic director capture requires a stable beat boundary");
      }
      return Object.freeze({
        format: "tear.cinematic-director",
        schemaVersion: 1,
        active: true,
        scriptId: script.id,
        scriptRevision: scriptRevision(script),
        beatId: this.beat.id,
        beatIndex: this.index,
        elapsedSeconds: this.elapsed,
        revealElapsedSeconds: this.revealElapsed,
        fullyVisibleElapsedSeconds: this.fullyVisibleElapsed,
        totalElapsedSeconds: this.totalElapsed,
        fullyVisible: this.fullyVisible,
        skipping: this.skipping,
        finished: this.finished,
      });
    }
    validateState(snapshot: unknown, binding?: CinematicDirectorBinding): CinematicDirectorStateV1 {
      const state = validateDirectorState(snapshot);
      if (state.active) {
        const script = binding?.script ?? this.script;
        if (script?.id !== state.scriptId || scriptRevision(script) !== state.scriptRevision) {
          throw new RangeError(`bound cinematic script ${String(state.scriptId)} is unavailable`);
        }
        const beat = script.beats[state.beatIndex];
        if (beat?.id !== state.beatId) {
          throw new RangeError(`bound cinematic beat ${String(state.beatId)} is unavailable`);
        }
        const revealSeconds = revealDuration(beat, Boolean(script.brief));
        if ((!state.fullyVisible && (revealSeconds <= 0 || state.revealElapsedSeconds >= revealSeconds)) ||
          (!state.fullyVisible && state.fullyVisibleElapsedSeconds > 0)) {
          throw new TypeError("cinematic director reveal visibility is inconsistent with its bound beat");
        }
      }
      return state;
    }
    restoreState(snapshot: unknown, binding?: CinematicDirectorBinding): void {
      const state = this.validateState(snapshot, binding);
      if (state.active) {
        const script = binding?.script ?? this.script;
        if (script === null) throw new RangeError(`bound cinematic script ${String(state.scriptId)} is unavailable`);
        this.script = script;
        if (binding !== undefined) this.context = binding.context;
      }
      // Restoring state must not replay onStart/onEnter/onExit/onCancel. The
      // current script/context binding is retained only when its stable id and
      // beat identity match the validated snapshot.
      if (!state.active) { this.script = null; this.context = null; }
      this.index = state.beatIndex;
      this.elapsed = state.elapsedSeconds;
      this.revealElapsed = state.revealElapsedSeconds;
      this.fullyVisibleElapsed = state.fullyVisibleElapsedSeconds;
      this.totalElapsed = state.totalElapsedSeconds;
      this.skipping = state.skipping;
      this.finished = state.finished;
      const beat = this.beat;
      this._revealDur = beat ? revealDuration(beat, this.brief) : 0;
      this._autoAfter = beat ? autoAfter(beat, this.brief) : 0;
      this.forceReveal = state.fullyVisible && this._revealDur > 0 && this.revealElapsed < this._revealDur;
      // Held physical input is adapter state, not canonical world state. A
      // restored scene must release and re-arm before accepting a fresh press.
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
    /** Renderer-facing latch readouts; the latch itself stays private. */
    get latchArmed(): boolean { return this._latch.armed; }
    get latchHoldSeconds(): number { return this._latch.holdT; }
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

export { CinematicTimeline };
export type CinematicDirector = InstanceType<typeof CinematicTimeline.Director>;

function validateDirectorState(value: unknown): CinematicDirectorStateV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("cinematic director state must be an object");
  }
  const state = value as Partial<CinematicDirectorStateV1>;
  if (state.format !== "tear.cinematic-director" || state.schemaVersion !== 1) {
    throw new TypeError("unsupported cinematic director state version");
  }
  const active = booleanValue(state.active, "active");
  const scriptId = nullableString(state.scriptId, "scriptId");
  const revision = nullableString(state.scriptRevision, "scriptRevision");
  const beatId = nullableString(state.beatId, "beatId");
  const beatIndex = integerValue(state.beatIndex, "beatIndex");
  const skipping = booleanValue(state.skipping, "skipping");
  const finished = booleanValue(state.finished, "finished");
  if (active && (!scriptId || !revision || !beatId || beatIndex < 0 || finished)) {
    throw new TypeError("active cinematic director state requires script and beat identity");
  }
  if (!active && (scriptId !== null || revision !== null || beatId !== null || beatIndex !== -1 || skipping)) {
    throw new TypeError("inactive cinematic director state cannot retain script or beat identity");
  }
  const elapsedSeconds = secondsValue(state.elapsedSeconds, "elapsedSeconds");
  const totalElapsedSeconds = secondsValue(state.totalElapsedSeconds, "totalElapsedSeconds");
  if (totalElapsedSeconds < elapsedSeconds) {
    throw new TypeError("cinematic director totalElapsedSeconds cannot precede elapsedSeconds");
  }
  const revealElapsedSeconds = secondsValue(state.revealElapsedSeconds, "revealElapsedSeconds");
  const fullyVisibleElapsedSeconds = secondsValue(state.fullyVisibleElapsedSeconds, "fullyVisibleElapsedSeconds");
  const fullyVisible = booleanValue(state.fullyVisible, "fullyVisible");
  if (revealElapsedSeconds > elapsedSeconds || fullyVisibleElapsedSeconds > elapsedSeconds) {
    throw new TypeError("cinematic director reveal timing cannot exceed beat elapsedSeconds");
  }
  if (!active && (elapsedSeconds !== 0 || revealElapsedSeconds !== 0 || fullyVisibleElapsedSeconds !== 0 ||
    totalElapsedSeconds !== 0 || !fullyVisible || finished)) {
    throw new TypeError("inactive cinematic director state must use the canonical idle position");
  }
  return Object.freeze({
    format: "tear.cinematic-director",
    schemaVersion: 1,
    active,
    scriptId,
    scriptRevision: revision,
    beatId,
    beatIndex,
    elapsedSeconds,
    revealElapsedSeconds,
    fullyVisibleElapsedSeconds,
    totalElapsedSeconds,
    fullyVisible,
    skipping,
    finished,
  });
}

function scriptRevision(script: CinematicScript): string {
  return script.revision ?? `${script.id}@1`;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`cinematic director ${label} must be boolean`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value !== null && typeof value !== "string") throw new TypeError(`cinematic director ${label} must be string or null`);
  return value;
}

function integerValue(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new TypeError(`cinematic director ${label} must be a safe integer`);
  return value as number;
}

function secondsValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`cinematic director ${label} must be finite non-negative seconds`);
  }
  return value;
}

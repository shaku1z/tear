export const CAMPAIGN_ENDING = "The Tear closes behind you like a held breath let go. Every guardian, every echo of the ones who came before — all of it was the long way of asking whether you'd still be going somewhere when you arrived. You are. Whatever waits on the other side, you walked the whole length of someone else's ending to reach your own beginning. Go finish it.";

export interface FinaleAnchor { x: number; y: number; r: number; depth: number; cut: boolean; auto?: boolean }
export interface FinaleState {
  readonly origin: Readonly<{ x: number; y: number }>;
  readonly anchors: FinaleAnchor[];
  severed: number;
  phase: "silence" | "wound" | "relics" | "cut" | "restoration" | "epilogue" | "reward";
  relicProgress: number;
  relicSounds: number;
  restore: number;
  landed: boolean;
  cutFlash: number;
  restoring: boolean;
  restoredColor: boolean;
  restoredGravity: boolean;
  tearClosed: boolean;
  readonly prepared: Readonly<{ isNew: boolean }>;
}

export interface FinaleConfig {
  readonly anchorRadius: number; readonly worldZoom: number;
  readonly silence: number; readonly wound: number; readonly relics: number;
  readonly cutAutoAt: number; readonly cutAutoStep: number; readonly cutSpeed: number;
  readonly restorationMin: number; readonly epilogueReveal: number; readonly rewardHold: number;
}

export interface FinaleBeat {
  readonly id: FinaleState["phase"];
  readonly duration?: number;
  readonly minDuration?: number;
  readonly completion?: "confirm";
  readonly playerMode: "locked" | "finalBlade" | "finalLanding";
  readonly hint?: string;
  readonly view?: "epilogue" | "reward";
  readonly reveal?: Readonly<{ mode: "phrase"; duration: number }>;
  readonly label?: string; readonly title?: string; readonly text?: string; readonly sigil?: string;
  readonly reward?: string; readonly detail?: string;
}

export interface FinaleSequence {
  readonly id: "adventure-final-cut"; readonly kind: "finale"; readonly color: string;
  readonly blocksCombat: true; readonly hideHud: true; readonly hint: string; readonly skipHint: string;
  readonly beats: readonly FinaleBeat[];
}

export type FinaleIntent =
  | Readonly<{ type: "begin-finale-lifecycle" }>
  | Readonly<{ type: "burst"; x: number; y: number; dx: number; dy: number; count: number; color: string }>
  | Readonly<{ type: "clear-combat" }>
  | Readonly<{ type: "final-blade"; active: boolean; restoredTrail?: boolean }>
  | Readonly<{ type: "flash"; amount: number }>
  | Readonly<{ type: "freeze-void" }>
  | Readonly<{ type: "music-duck"; amount: number; duration: number }>
  | Readonly<{ type: "restore-stage-zero" }>
  | Readonly<{ type: "ring"; x: number; y: number; radius: number; color: string }>
  | Readonly<{ type: "set-player-restoration"; xMin: number; xMax: number; yMax: number; vy: number }>
  | Readonly<{ type: "sound"; cue: "final-cut" | "final-relic" | "final-restore" | "final-silence"; index?: number }>
  | Readonly<{ type: "shake"; amount: number }>
  | Readonly<{ type: "vibrate"; pattern: readonly number[] }>
  | Readonly<{ type: "void-mix"; amount: number; duration: number }>
  | Readonly<{ type: "world-zoom"; value: number }>
  | Readonly<{ type: "win-run"; campaign: boolean }>;

export interface FinaleStartInput {
  readonly campaign: boolean;
  readonly recovered: boolean;
  readonly death?: Readonly<{ x: number; y: number }>;
  readonly rememberedDeath?: Readonly<{ x: number; y: number }>;
  readonly prepared: Readonly<{ isNew: boolean }>;
  readonly player: Readonly<{ x: number; y: number }>;
  readonly viewport: Readonly<{ width: number; height: number }>;
  readonly score: number;
  readonly formattedTime: string;
  readonly perfectColor: string;
  readonly reducedMotion?: boolean;
  readonly lowGraphics?: boolean;
}

export class FinaleController {
  state: FinaleState | null = null;
  private perfectColor = "#fff";
  private reducedMotion = false;
  private lowGraphics = false;

  constructor(private readonly config: FinaleConfig) {}

  anchors(x: number, y: number, viewport: Readonly<{ width: number; height: number }>): FinaleAnchor[] {
    const centerX = Math.max(270, Math.min(x, viewport.width - 270));
    const centerY = Math.max(280, Math.min(y, viewport.height - 310));
    const radius = this.config.anchorRadius;
    return [
      { x: centerX - 168, y: centerY - 72, r: radius, depth: 0.62, cut: false },
      { x: centerX + 174, y: centerY + 34, r: radius, depth: 0.82, cut: false },
      { x: centerX + 8, y: centerY - 174, r: radius, depth: 1, cut: false },
    ];
  }

  start(input: FinaleStartInput): Readonly<{ state: FinaleState | null; sequence: FinaleSequence | null; intents: readonly FinaleIntent[] }> {
    if (!input.campaign) return { state: null, sequence: null, intents: [{ type: "win-run", campaign: false }] };
    const origin = input.death ?? input.rememberedDeath ?? { x: input.viewport.width / 2, y: input.viewport.height * 0.42 };
    this.perfectColor = input.perfectColor; this.reducedMotion = input.reducedMotion === true; this.lowGraphics = input.lowGraphics === true;
    const state: FinaleState = { origin: { x: origin.x, y: origin.y }, anchors: this.anchors(input.player.x, input.player.y, input.viewport),
      severed: 0, phase: "silence", relicProgress: 0, relicSounds: 0, restore: 0, landed: false, cutFlash: 0,
      restoring: false, restoredColor: false, restoredGravity: false, tearClosed: false, prepared: input.prepared };
    this.state = state;
    const beats: FinaleBeat[] = [
      { id: "silence", duration: this.config.silence, playerMode: "locked", hint: "SILENCE" },
      { id: "wound", duration: this.config.wound, playerMode: "locked", hint: "THE WOUND REMAINS" },
      { id: "relics", duration: this.config.relics, playerMode: "finalBlade", hint: "THE PANTHEON RETURNS TO THE BLADE" },
      { id: "cut", minDuration: 0.45, playerMode: "finalBlade", hint: "SWING THROUGH EACH ANCHOR  ·  HOLD CONFIRM OR WAIT FOR ASSIST" },
      { id: "restoration", minDuration: this.config.restorationMin, playerMode: "finalLanding", hint: "THE WORLD REMEMBERS" },
      { id: "epilogue", view: "epilogue", completion: "confirm", playerMode: "locked", reveal: { mode: "phrase", duration: this.config.epilogueReveal }, label: "AFTER THE DESCENT", title: "THE FIRST MORNING", text: CAMPAIGN_ENDING, hint: "TAP TO REVEAL  ·  TAP AGAIN TO CONTINUE" },
      { id: "reward", view: "reward", completion: "confirm", duration: this.config.rewardHold, minDuration: 0.45, playerMode: "locked", label: "ADVENTURE COMPLETE", title: "THE WORLD REMEMBERS", sigil: "◇", reward: "RESTORED BLADE TRAIL · CAMPAIGN EMBLEM", detail: `${input.prepared.isNew ? "NEW BEST  ·  " : ""}${String(input.score)} PTS  ·  ${input.formattedTime}`, hint: "TAP TO REVEAL RESULTS" },
    ];
    const sequence: FinaleSequence = { id: "adventure-final-cut", kind: "finale", color: input.perfectColor, blocksCombat: true, hideHud: true,
      hint: "MOVE THE BLADE  ·  CUT THE TEAR ANCHORS  ·  HOLD CONFIRM TO ASSIST", skipHint: "RESTORING THE WORLD", beats };
    return { state, sequence, intents: [{ type: "begin-finale-lifecycle" }, { type: "clear-combat" }, { type: "freeze-void" },
      { type: "world-zoom", value: this.config.worldZoom }, { type: "final-blade", active: true, restoredTrail: true }] };
  }

  onStart(): readonly FinaleIntent[] { return [{ type: "sound", cue: "final-silence" }]; }

  sever(auto: boolean, velocity: Readonly<{ x: number; y: number }>, perfectColor: string, reducedMotion: boolean, lowGraphics: boolean): readonly FinaleIntent[] {
    const state = this.state; if (!state || state.severed >= state.anchors.length) return [];
    const anchor = state.anchors[state.severed]; if (!anchor) return [];
    anchor.cut = true; anchor.auto = auto; state.severed++; state.cutFlash = 1;
    state.restoredColor = state.severed >= 1; state.restoredGravity = state.severed >= 2; state.tearClosed = state.severed >= 3;
    return [
      { type: "ring", x: anchor.x, y: anchor.y, radius: 18, color: perfectColor },
      { type: "burst", x: anchor.x, y: anchor.y, dx: velocity.x || 0, dy: velocity.y || -1, count: lowGraphics ? 7 : 14, color: perfectColor },
      { type: "flash", amount: 0.10 + state.severed * 0.035 },
      { type: "shake", amount: (reducedMotion ? 0.2 : 1) * (3 + state.severed * 2) },
      { type: "sound", cue: "final-cut", index: state.severed - 1 },
      { type: "vibrate", pattern: state.severed === 3 ? [24, 34, 62] : [18, 24, 34] },
    ];
  }

  tryBladeCut(blade: Readonly<{ previousX: number; previousY: number; x: number; y: number; speed: number }>, perfectColor: string, reducedMotion: boolean, lowGraphics: boolean): readonly FinaleIntent[] {
    const state = this.state, anchor = state?.anchors[state.severed];
    if (state?.phase !== "cut" || !anchor || blade.speed < this.config.cutSpeed) return [];
    const vx = blade.x - blade.previousX, vy = blade.y - blade.previousY, wx = anchor.x - blade.previousX, wy = anchor.y - blade.previousY;
    const lengthSquared = vx * vx + vy * vy;
    const amount = lengthSquared <= 0 ? 0 : Math.max(0, Math.min((wx * vx + wy * vy) / lengthSquared, 1));
    const dx = anchor.x - (blade.previousX + vx * amount), dy = anchor.y - (blade.previousY + vy * amount);
    return Math.hypot(dx, dy) <= anchor.r ? this.sever(false, { x: vx, y: vy }, perfectColor, reducedMotion, lowGraphics) : [];
  }

  enterBeat(beat: FinaleState["phase"], viewportWidth: number): readonly FinaleIntent[] {
    const state = this.state; if (!state) return [];
    state.phase = beat;
    if (beat !== "restoration" || state.restoring) return [];
    const intents: FinaleIntent[] = [];
    while (state.severed < state.anchors.length) intents.push(...this.sever(true, { x: 0, y: -1 }, this.perfectColor, this.reducedMotion, this.lowGraphics));
    state.restoring = true; state.restore = 0;
    intents.push({ type: "restore-stage-zero" }, { type: "freeze-void" }, { type: "world-zoom", value: 1 },
      { type: "set-player-restoration", xMin: 20, xMax: viewportWidth - 20, yMax: 220, vy: 35 }, { type: "sound", cue: "final-restore" });
    return intents;
  }

  updateBeat(elapsed: number, progress: number, dt = 0): readonly FinaleIntent[] {
    const state = this.state; if (!state) return [];
    const intents: FinaleIntent[] = [];
    if (state.phase === "relics") {
      state.relicProgress = progress; const target = Math.min(4, Math.floor(progress * 4.2));
      while (state.relicSounds < target) intents.push({ type: "sound", cue: "final-relic", index: state.relicSounds++ });
    } else if (state.phase === "cut" && elapsed >= this.config.cutAutoAt + state.severed * this.config.cutAutoStep) {
      intents.push(...this.sever(true, { x: 0, y: -1 }, this.perfectColor, this.reducedMotion, this.lowGraphics));
    } else if (state.phase === "restoration") state.restore = Math.max(0, Math.min(elapsed / this.config.restorationMin, 1));
    state.cutFlash = Math.max(0, state.cutFlash - dt * 2.5);
    return intents;
  }

  markLanded(): void { if (this.state) this.state.landed = true; }
  waitComplete(elapsed: number): boolean {
    const state = this.state; if (!state) return true;
    if (state.phase === "cut") return state.severed >= state.anchors.length;
    if (state.phase === "restoration") return state.landed && elapsed >= this.config.restorationMin;
    return true;
  }

  complete(): readonly FinaleIntent[] { this.state = null; return [{ type: "final-blade", active: false }, { type: "win-run", campaign: true }]; }
  cancel(): readonly FinaleIntent[] { return [{ type: "final-blade", active: false }, { type: "void-mix", amount: 0, duration: 0.2 }, { type: "music-duck", amount: 1, duration: 0.25 }]; }
}

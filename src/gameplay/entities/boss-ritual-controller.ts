export interface BossRitualPlatform {
  readonly x: number; readonly y: number; readonly w: number;
  readonly floor?: boolean; readonly oneway?: boolean; readonly arenaPlatId?: string;
  arenaFractureRequest?: { reason: string; color: string } | null;
}

export interface BossRitualCrown {
  x: number; y: number; rot: number; vx: number; vy: number;
  state: string; restPlatform?: BossRitualPlatform | null;
}

export interface BossRitualActor {
  readonly color: string; readonly bossName: string; readonly bossId?: string; facing: number;
  x: number; y: number; vx: number; vy: number; cinematicT: number;
  cinematicPose?: string | null; cinematicColor?: string | null; cinematicRequest?: unknown;
  crown?: BossRitualCrown | null;
}

export interface BossRitualCue {
  readonly id: string; readonly color?: string; readonly brief?: boolean; readonly crownFall?: boolean;
  readonly pose?: string; readonly sfx?: string; readonly after?: "throwShield";
  readonly firstVertical?: boolean; readonly speaker?: string; readonly line?: string;
  readonly anchor?: string; readonly maxWidth?: number;
}

export interface BossRitualContext {
  readonly owner: BossRitualActor; readonly cue: BossRitualCue;
  crownStart: { x: number; y: number; rot: number } | null;
  crownTarget: { x: number; y: number } | null;
  crownPlatform: BossRitualPlatform | null;
  crownSound: boolean;
  readonly crownFractureColor: string;
}

export interface BossRitualBeat {
  readonly id: "anticipation" | "reveal" | "declaration" | "resolve" | "grace";
  readonly duration?: number; readonly completion: "timed" | "confirm-or-timeout";
  readonly playerMode: "locked"; readonly skipScale?: number;
  readonly speaker?: string; readonly line?: string; readonly anchor?: string; readonly maxWidth?: number;
}

export interface BossRitualSequence {
  readonly id: string; readonly kind: "ritual"; readonly color: string;
  readonly blocksCombat: true; readonly hideHud: true; readonly brief: boolean;
  readonly hint: string; readonly skipHint: string; readonly beats: readonly BossRitualBeat[];
}

export type BossRitualIntent =
  | Readonly<{ type: "clear-boss-projectiles" }>
  | Readonly<{ type: "music-duck"; amount: number; duration: number }>
  | Readonly<{ type: "sound"; cue: string }>
  | Readonly<{ type: "throw-shield" }>
  | Readonly<{ type: "resolve-first-vertical" }>
  | Readonly<{ type: "store-seen"; key: string }>;

export interface BossRitualOptions {
  readonly platforms: readonly BossRitualPlatform[]; readonly groundY: number;
  readonly bomberColor: string; readonly dialogueDuck: number; readonly brief: boolean;
}

const timings: Readonly<Record<string, Readonly<{ anticipation: number; reveal: number; resolve: number }>>> = Object.freeze({
  aldricCrownfall: { anticipation: 0.34, reveal: 0.78, resolve: 0.86 },
  aldricFeral: { anticipation: 0.34, reveal: 0.78, resolve: 0.86 },
  wardenRule: { anticipation: 0.34, reveal: 0.66, resolve: 0.6 },
  wardenBreak: { anticipation: 0.34, reveal: 0.66, resolve: 0.6 },
  colossusContainment: { anticipation: 0.3, reveal: 0.72, resolve: 0.62 },
  colossusCore: { anticipation: 0.3, reveal: 0.72, resolve: 0.62 },
  echoMirror: { anticipation: 0.28, reveal: 0.66, resolve: 0.55 },
  sourceTrue: { anticipation: 0.36, reveal: 0.9, resolve: 0.72 },
});

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function lerp(a: number, b: number, amount: number): number { return a + (b - a) * amount; }

export class BossRitualController {
  begin(owner: BossRitualActor, cue: BossRitualCue, options: BossRitualOptions): Readonly<{ context: BossRitualContext; sequence: BossRitualSequence }> {
    owner.cinematicRequest = null;
    const timing = timings[cue.pose ?? "transform"] ?? { anticipation: 0.3, reveal: 0.62, resolve: 0.52 };
    const context: BossRitualContext = { owner, cue, crownStart: null, crownTarget: null, crownPlatform: null,
      crownSound: false, crownFractureColor: options.bomberColor };
    const sequence: BossRitualSequence = { id: cue.id, kind: "ritual", color: cue.color ?? owner.color,
      blocksCombat: true, hideHud: true, brief: options.brief,
      hint: options.brief ? "BRIEF SCENE  ·  HOLD TO SKIP" : "TAP TO ADVANCE  ·  HOLD TO SKIP",
      skipHint: "SKIPPING — TRANSFORMATION REMAINS SAFE",
      beats: [
        { id: "anticipation", duration: timing.anticipation, completion: "timed", playerMode: "locked" },
        { id: "reveal", duration: timing.reveal, completion: "timed", playerMode: "locked" },
        { id: "declaration", completion: "confirm-or-timeout", playerMode: "locked",
          speaker: cue.speaker ?? owner.bossName,
          ...(cue.line === undefined ? {} : { line: cue.line }),
          ...(cue.anchor === undefined ? {} : { anchor: cue.anchor }),
          ...(cue.maxWidth === undefined ? {} : { maxWidth: cue.maxWidth }) },
        { id: "resolve", duration: timing.resolve, completion: "timed", playerMode: "locked" },
        { id: "grace", duration: 0.45, completion: "timed", skipScale: 1, playerMode: "locked" },
      ] };
    return { context, sequence };
  }

  start(context: BossRitualContext, options: BossRitualOptions): readonly BossRitualIntent[] {
    const { owner, cue } = context;
    owner.cinematicT = 0; owner.vx = 0; owner.vy = 0;
    this.prepareCrown(context, options);
    return [{ type: "clear-boss-projectiles" }, { type: "music-duck", amount: options.dialogueDuck, duration: 0.18 },
      ...(cue.sfx ? [{ type: "sound", cue: cue.sfx } as const] : [])];
  }

  enterBeat(context: BossRitualContext, beat: BossRitualBeat["id"]): readonly BossRitualIntent[] {
    return beat === "declaration" ? [{ type: "sound", cue: context.owner.bossId ?? "chapter" }] : [];
  }

  updateBeat(context: BossRitualContext, beat: BossRitualBeat["id"], elapsed: number, progress: number, time: number, reducedMotion: boolean): readonly BossRitualIntent[] {
    const duration = timings[context.cue.pose ?? "transform"] ?? { anticipation: 0.3, reveal: 0.62, resolve: 0.52 };
    if (beat === "anticipation") context.owner.cinematicT = clamp(elapsed / duration.anticipation) * 0.22;
    else if (beat === "reveal") { const amount = clamp(elapsed / duration.reveal), eased = amount * amount * (3 - 2 * amount); context.owner.cinematicT = 0.22 + eased * 0.6; return this.settleCrown(context, amount, reducedMotion); }
    else if (beat === "declaration") { context.owner.cinematicT = 0.82 + Math.sin(time * 3) * 0.012; return this.settleCrown(context, 1, reducedMotion); }
    else if (beat === "resolve") context.owner.cinematicT = 0.84 + clamp(progress) * 0.16;
    return [];
  }

  complete(context: BossRitualContext, reducedMotion: boolean): readonly BossRitualIntent[] {
    const intents = [...this.settleCrown(context, 1, reducedMotion)];
    context.owner.cinematicPose = null; context.owner.cinematicColor = null; context.owner.cinematicT = 0;
    if (context.cue.after === "throwShield") intents.push({ type: "throw-shield" });
    if (context.cue.firstVertical) intents.push({ type: "resolve-first-vertical" });
    intents.push({ type: "store-seen", key: `tear.cinematic.${context.cue.id}` }, { type: "music-duck", amount: 1, duration: 0.55 });
    return intents;
  }

  cancel(context: BossRitualContext): readonly BossRitualIntent[] {
    context.owner.cinematicPose = null; context.owner.cinematicColor = null; context.owner.cinematicT = 0;
    return [{ type: "music-duck", amount: 1, duration: 0.25 }];
  }

  private prepareCrown(context: BossRitualContext, options: BossRitualOptions): void {
    const crown = context.owner.crown;
    if (context.cue.crownFall !== true || !crown || context.crownStart) return;
    const below = options.platforms.filter((platform) => (platform.oneway === true || platform.floor === true) && crown.x >= platform.x
      && crown.x <= platform.x + platform.w && platform.y >= crown.y).sort((a, b) => a.y - b.y)[0] ?? null;
    context.crownStart = { x: crown.x, y: crown.y, rot: crown.rot }; context.crownPlatform = below;
    context.crownTarget = { x: below ? Math.max(below.x + 18, Math.min(crown.x + context.owner.facing * 42, below.x + below.w - 18)) : crown.x + context.owner.facing * 42,
      y: below ? below.y - 10 : options.groundY - 10 };
    crown.vx = 0; crown.vy = 0; crown.state = "airborne";
  }

  private settleCrown(context: BossRitualContext, amount: number, reducedMotion: boolean): readonly BossRitualIntent[] {
    const crown = context.owner.crown;
    if (!context.crownStart || !context.crownTarget || !crown) return [];
    const smooth = reducedMotion ? (amount >= 0.82 ? 1 : 0) : amount * amount * (3 - 2 * amount);
    crown.x = lerp(context.crownStart.x, context.crownTarget.x, smooth);
    crown.y = lerp(context.crownStart.y, context.crownTarget.y, smooth) - (reducedMotion ? 0 : Math.sin(amount * Math.PI) * 62);
    crown.rot = context.crownStart.rot + context.owner.facing * smooth * 2.25;
    if (amount < 1) return [];
    crown.state = "fallen"; crown.vx = 0; crown.vy = 0; crown.restPlatform = context.crownPlatform;
    if (context.crownPlatform?.arenaPlatId) context.crownPlatform.arenaFractureRequest = { reason: "crownfall", color: context.crownFractureColor };
    if (context.crownSound) return [];
    context.crownSound = true;
    return [{ type: "sound", cue: "aldricCrownFall" }];
  }
}

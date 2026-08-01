import type { PreparedVictory } from "../run/outcome-planner";
import type {
  FinaleBeat,
  FinaleController,
  FinaleIntent,
  FinaleSequence,
  FinaleStartInput,
  FinaleState,
} from "./finale-controller";

export interface FinaleCinematicDirector {
  readonly elapsed: number;
  readonly progress: number;
  skipTo(id: string): boolean;
}

export interface FinaleCinematicBeat<Context> {
  readonly id: string;
  readonly [key: string]: unknown;
  readonly onEnter?: (context: Context, detail: FinaleCinematicDirector) => void;
  readonly onUpdate?: (context: Context, detail: FinaleCinematicDirector) => void;
  readonly waitUntil?: (context: Context, detail: FinaleCinematicDirector) => boolean;
}

export interface FinaleCinematicScript<Context> {
  readonly id: string;
  readonly beats: readonly FinaleCinematicBeat<Context>[];
  readonly [key: string]: unknown;
  readonly onStart?: (context: Context, director: FinaleCinematicDirector) => void;
  readonly onSkip?: (context: Context, director: FinaleCinematicDirector) => void;
  readonly onComplete?: (context: Context, director: FinaleCinematicDirector) => void;
  readonly onCancel?: (context: Context) => void;
}

export interface FinaleCinematicChannel {
  start<Context>(script: FinaleCinematicScript<Context>, context: Context): void;
}

/** Structural state owner shared by the live application and detached runtimes. */
export interface FinaleRuntimeState {
  finale: FinaleState | null;
  finaleController: FinaleController;
  resetFinale(): void;
  syncFinale(): FinaleState | null;
}

export interface FinaleIntentPorts {
  beginLifecycle(): void;
  clearCombat(): void;
  freezeVoid(): void;
  worldZoom(value: number): void;
  finalBlade(active: boolean, restoredTrail: boolean): void;
  ring(x: number, y: number, radius: number, color: string): void;
  burst(x: number, y: number, dx: number, dy: number, count: number, color: string): void;
  flash(amount: number): void;
  shake(amount: number): void;
  vibrate(pattern: readonly number[]): void;
  sound(cue: "final-cut" | "final-relic" | "final-restore" | "final-silence", index: number): void;
  restoreStageZero(): void;
  restorePlayer(xMin: number, xMax: number, yMax: number, vy: number): void;
  voidMix(amount: number, duration: number): void;
  musicDuck(amount: number, duration: number): void;
  win(campaign: boolean): void;
}

export function dispatchFinaleIntents(intents: readonly FinaleIntent[], ports: FinaleIntentPorts): void {
  for (const intent of intents) {
    switch (intent.type) {
      case "begin-finale-lifecycle": ports.beginLifecycle(); break;
      case "clear-combat": ports.clearCombat(); break;
      case "freeze-void": ports.freezeVoid(); break;
      case "world-zoom": ports.worldZoom(intent.value); break;
      case "final-blade": ports.finalBlade(intent.active, intent.restoredTrail === true); break;
      case "ring": ports.ring(intent.x, intent.y, intent.radius, intent.color); break;
      case "burst": ports.burst(intent.x, intent.y, intent.dx, intent.dy, intent.count, intent.color); break;
      case "flash": ports.flash(intent.amount); break;
      case "shake": ports.shake(intent.amount); break;
      case "vibrate": ports.vibrate(intent.pattern); break;
      case "sound": ports.sound(intent.cue, intent.index ?? 0); break;
      case "restore-stage-zero": ports.restoreStageZero(); break;
      case "set-player-restoration": ports.restorePlayer(intent.xMin, intent.xMax, intent.yMax, intent.vy); break;
      case "void-mix": ports.voidMix(intent.amount, intent.duration); break;
      case "music-duck": ports.musicDuck(intent.amount, intent.duration); break;
      case "win-run": ports.win(intent.campaign); break;
    }
  }
}

export interface FinaleSequenceLaunchOptions {
  readonly runtime: FinaleRuntimeState;
  readonly cinema: FinaleCinematicChannel;
  readonly input: FinaleStartInput;
  readonly viewportWidth: number;
  readonly dispatch: (intents: readonly FinaleIntent[]) => void;
  readonly stopPlayer: () => void;
  readonly assistVelocity: () => Readonly<{ x: number; y: number }>;
}

/** Owns the complete portable finale cinematic lifecycle. */
export function launchAdventureFinale(options: FinaleSequenceLaunchOptions): boolean {
  const controller = options.runtime.finaleController;
  const result = controller.start(options.input);
  options.runtime.finale = result.state;
  options.stopPlayer();
  options.dispatch(result.intents);
  if (result.sequence === null || result.state === null) return false;

  const beats: readonly (FinaleCinematicBeat<FinaleState> & FinaleBeat)[] = result.sequence.beats.map((beat) => ({
    ...beat,
    onEnter() {
      options.dispatch(controller.enterBeat(beat.id, options.viewportWidth));
      options.runtime.syncFinale();
    },
    onUpdate(_context, detail) {
      options.dispatch(controller.updateBeat(detail.elapsed, detail.progress));
      options.runtime.syncFinale();
    },
    waitUntil(_context, detail) { return controller.waitComplete(detail.elapsed); },
  }));
  const script: FinaleCinematicScript<FinaleState> & FinaleSequence = {
    ...result.sequence,
    beats,
    onStart() { options.dispatch(controller.onStart()); },
    onSkip(_context, director) {
      while (controller.state && controller.state.severed < controller.state.anchors.length) {
        options.dispatch(controller.sever(true, options.assistVelocity(), options.input.perfectColor,
          options.input.reducedMotion === true, options.input.lowGraphics === true));
      }
      director.skipTo("restoration");
    },
    onComplete() {
      options.dispatch(controller.complete());
      options.runtime.finale = null;
    },
    onCancel() { options.dispatch(controller.cancel()); },
  };
  options.cinema.start(script, result.state);
  return true;
}

export interface FinaleCutOptions {
  readonly runtime: FinaleRuntimeState;
  readonly velocity: Readonly<{ x: number; y: number }>;
  readonly perfectColor: string;
  readonly reducedMotion: boolean;
  readonly lowGraphics: boolean;
  readonly dispatch: (intents: readonly FinaleIntent[]) => void;
}

/** Low-level cut operation retained for sequence-focused callers. */
export function severNextFinaleAnchor(options: FinaleCutOptions, assisted: boolean): boolean {
  const before = options.runtime.finale?.severed ?? 0;
  options.dispatch(options.runtime.finaleController.sever(
    assisted, options.velocity, options.perfectColor, options.reducedMotion, options.lowGraphics,
  ));
  options.runtime.syncFinale();
  return (options.runtime.finale?.severed ?? 0) > before;
}

/** Low-level restoration entry retained for cinematic bindings. */
export function beginFinaleRestoration(
  runtime: FinaleRuntimeState,
  viewportWidth: number,
  dispatch: (intents: readonly FinaleIntent[]) => void,
): void {
  dispatch(runtime.finaleController.enterBeat("restoration", viewportWidth));
  runtime.syncFinale();
}

export interface FinaleRunState {
  readonly mode: string;
  readonly _victoryPrepared?: PreparedVictory;
  readonly finalBossDeath?: Readonly<{ x: number; y: number }>;
  readonly score: number;
  readonly runTime: number;
}

export interface FinaleActorState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export interface FinaleBladeState {
  readonly tipVX?: number;
  readonly tipVY?: number;
}

export interface FinaleBladeSegment {
  readonly previousX: number;
  readonly previousY: number;
  readonly x: number;
  readonly y: number;
  readonly speed: number;
}

export interface FinaleRuntimeOptions {
  readonly runtime: FinaleRuntimeState;
  readonly cinema: FinaleCinematicChannel;
  readonly run: () => FinaleRunState | null;
  readonly player: () => FinaleActorState;
  readonly blade: () => FinaleBladeState;
  readonly intents: FinaleIntentPorts;
  readonly prepareVictory: (campaign: boolean, persistFinale: boolean) => PreparedVictory;
  readonly win: (campaign: boolean) => void;
  readonly formatTime: (seconds: number) => string;
  readonly viewport: Readonly<{ width: number; height: number }>;
  readonly perfectColor: () => string;
  readonly reducedMotion: () => boolean;
  readonly lowGraphics: () => boolean;
  /** Receives each non-empty immutable outward-intent batch before its adapters are invoked. */
  readonly observeIntents?: (intents: readonly FinaleIntent[]) => void;
}

export interface FinaleRuntimeApi {
  readonly severAnchor: (assisted: boolean) => boolean;
  readonly beginRestoration: () => void;
  readonly tryBladeCut: (segment: FinaleBladeSegment) => void;
  readonly start: (death?: Readonly<{ x: number; y: number }>, recovered?: boolean) => void;
}

/** Host-neutral finale composition used by the browser and detached worlds. */
export function createFinaleRuntime(options: FinaleRuntimeOptions): FinaleRuntimeApi {
  const freezeData = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      for (const entry of value) freezeData(entry);
      return Object.freeze(value);
    }
    if (typeof value === "object" && value !== null) {
      for (const entry of Object.values(value)) freezeData(entry);
      return Object.freeze(value);
    }
    return value;
  };
  const snapshotIntents = (intents: readonly FinaleIntent[]): readonly FinaleIntent[] =>
    freezeData(structuredClone(intents)) as readonly FinaleIntent[];
  const dispatch = (intents: readonly FinaleIntent[]): void => {
    if (intents.length > 0) options.observeIntents?.(snapshotIntents(intents));
    dispatchFinaleIntents(intents, options.intents);
  };
  const velocityComponent = (value: number | null | undefined, fallback: number): number =>
    value == null || value === 0 || Number.isNaN(value) ? fallback : value;
  const velocity = (): Readonly<{ x: number; y: number }> => {
    const blade = options.blade();
    return {
      x: velocityComponent(blade.tipVX, 0),
      y: velocityComponent(blade.tipVY, -1),
    };
  };

  const api: FinaleRuntimeApi = {
    severAnchor: (assisted: boolean) => {
      const before = options.runtime.finale?.severed ?? 0;
      dispatch(options.runtime.finaleController.sever(
        assisted, velocity(), options.perfectColor(), options.reducedMotion(), options.lowGraphics(),
      ));
      options.runtime.syncFinale();
      return (options.runtime.finale?.severed ?? 0) > before;
    },
    beginRestoration: () => {
      dispatch(options.runtime.finaleController.enterBeat("restoration", options.viewport.width));
      options.runtime.syncFinale();
    },
    tryBladeCut: (segment: FinaleBladeSegment) => {
      dispatch(options.runtime.finaleController.tryBladeCut(
        segment, options.perfectColor(), options.reducedMotion(), options.lowGraphics(),
      ));
      options.runtime.syncFinale();
    },
    start: (death?: Readonly<{ x: number; y: number }>, recovered = false) => {
      const run = options.run();
      if (run === null) return;
      if (run.mode !== "campaign") { options.win(false); return; }
      options.runtime.resetFinale();
      const prepared = recovered && run._victoryPrepared !== undefined
        ? run._victoryPrepared
        : options.prepareVictory(true, true);
      const player = options.player();
      launchAdventureFinale({
        runtime: options.runtime,
        cinema: options.cinema,
        viewportWidth: options.viewport.width,
        dispatch,
        input: {
          campaign: true,
          recovered,
          ...(death === undefined ? {} : { death }),
          ...(run.finalBossDeath === undefined ? {} : { rememberedDeath: run.finalBossDeath }),
          prepared,
          player: { x: player.x, y: player.y },
          viewport: options.viewport,
          score: run.score,
          formattedTime: options.formatTime(run.runTime),
          perfectColor: options.perfectColor(),
          reducedMotion: options.reducedMotion(),
          lowGraphics: options.lowGraphics(),
        },
        stopPlayer: () => { player.vx = 0; player.vy = 0; player.onGround = false; },
        assistVelocity: velocity,
      });
    },
  };
  return Object.freeze(api);
}

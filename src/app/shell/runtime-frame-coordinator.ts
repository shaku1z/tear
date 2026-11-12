import type { InputMode, Point } from "../../input/legacy-input-contracts";
import { UI_CONFIRM_SETTLE_SECONDS } from "../interface/ui-action-coordinator";

export interface RuntimeFrameInputPort {
  readonly held: Set<string>;
  readonly pressed: Set<string>;
  readonly btnHeld: Record<string, boolean | undefined>;
  tJump: boolean;
  allowLock: boolean;
  mode: InputMode;
  locked: boolean;
  uiMode: boolean;
  updateUI(): void;
  takeClick(): Point | null;
  touchActive(): boolean;
  pausePressed(): boolean;
  escapePressed(): boolean;
  endFrame(preserveSimulationEdges?: boolean): void;
}

export interface RuntimeFramePadPort {
  connected: boolean;
  index: number;
  poll(deltaSeconds: number, uiMode: boolean): void;
}

interface CinemaInputState {
  readonly key: boolean;
  readonly touch: boolean;
  readonly pad: boolean;
  readonly click: boolean;
}

interface CinemaPort {
  readonly active: boolean;
  readonly playerMode: string | undefined;
  update(deltaSeconds: number, input: CinemaInputState): void;
}

interface RuntimeFrameDiagnostics {
  record(name: "simulation" | "render" | "frame" | "frameInterval" | "outsideFrameWork", milliseconds: number): void;
  gauge(name: "enemies" | "projectiles" | "effects", value: number): void;
}

interface RuntimeFrameDocumentPort {
  readonly body: { readonly dataset: Record<string, string | undefined> };
  exitPointerLock(): void;
}

interface RuntimeFrameNavigatorPort {
  getGamepads(): readonly (Gamepad | null)[];
}

export interface RuntimeFrameCoordinatorOptions {
  readonly now: () => number;
  readonly state: () => string;
  readonly setState: (state: string) => void;
  readonly input: RuntimeFrameInputPort;
  readonly pad: RuntimeFramePadPort | null;
  readonly navigator: RuntimeFrameNavigatorPort;
  readonly document: RuntimeFrameDocumentPort;
  readonly canvas: Pick<HTMLCanvasElement, "clientWidth" | "clientHeight">;
  readonly cinema: CinemaPort;
  readonly clipper: Readonly<{ start(): void; stop(): void }> | null;
  readonly autoPauseDisconnect: () => boolean;
  readonly advancePlayingPrelude: (deltaSeconds: number) => void;
  readonly advancePlayingSimulation: (deltaSeconds: number) => number;
  readonly resetSimulation: () => void;
  readonly requestPointerLock: () => void;
  readonly exitReplay: () => void;
  readonly advanceClocks: (deltaSeconds: number, state: string) => void;
  readonly advanceContinue: (deltaSeconds: number) => void;
  readonly updateAttract: (deltaSeconds: number, menu: boolean) => void;
  readonly isMenuScreen: (state: string) => boolean;
  readonly gameplayStart: () => void;
  readonly gameplayStop: () => void;
  readonly cssPerLogicalPixel: () => number;
  /** Re-derives interface tokens when the input owner or the CSS scale changes. */
  readonly setUiDensity: (density: Readonly<{ touch: boolean; cssPerLogicalPixel: number }>) => void;
  readonly syncMusic: () => void;
  readonly render: () => void;
  readonly handleUi: () => void;
  readonly diagnostics: RuntimeFrameDiagnostics;
  readonly entityCounts: () => Readonly<{ enemies: number; projectiles: number; effects: number }>;
  /** Passive recording of the already chosen application-frame inputs. */
  readonly applicationFrameRecording?: Readonly<{
    begin(seconds: number, confirm: CinemaInputState, cinemaActive: boolean): void;
    preludeApplied(): void;
    end(steps: number): void;
  }>;
}

/** Owns the real-time frame ordering while fixed-step gameplay remains behind its host port. */
export class RuntimeFrameCoordinator {
  readonly #options: RuntimeFrameCoordinatorOptions;
  #padWasConnected = false;
  #lastInputMode = "";
  #wasPointerLocked = false;
  #gameplayActive = false;
  #uiDensityKey = "desktop";
  #previousFrameWorkMilliseconds = 0;
  #frameStartedMilliseconds = 0;
  /** When the pause screen was first seen; a resume key needs the shared settle window first. */
  #pausedSinceMilliseconds: number | null = null;

  constructor(options: RuntimeFrameCoordinatorOptions) {
    this.#options = options;
  }

  run(deltaSeconds: number, frameIntervalSeconds = deltaSeconds): void {
    const frameStarted = this.#options.now();
    this.#frameStartedMilliseconds = frameStarted;
    const startedPlaying = this.#options.state() === "playing";
    this.#prepareInput(deltaSeconds);
    let simulationSteps = 0;
    if (this.#options.state() === "playing") simulationSteps = this.#advancePlaying(deltaSeconds);
    else this.#advanceInactive();
    this.#options.applicationFrameRecording?.end(simulationSteps);
    this.#advanceApplication(deltaSeconds);

    const simulationFinished = this.#options.now();
    this.#options.render();
    const renderFinished = this.#options.now();
    this.#options.handleUi();
    // A display frame can be shorter than one fixed step (especially at high
    // refresh rates). Keep gameplay edges alive until at least one simulation
    // tick can observe them; otherwise a valid tap is randomly discarded.
    const preserveSimulationEdges = startedPlaying && this.#options.state() === "playing" && simulationSteps === 0;
    this.#options.input.endFrame(preserveSimulationEdges);
    this.#recordDiagnostics(frameStarted, simulationFinished, renderFinished, frameIntervalSeconds);
  }

  #prepareInput(deltaSeconds: number): void {
    const { cinema, clipper, document, input, navigator, pad } = this.#options;
    if (pad !== null) {
      pad.poll(deltaSeconds, this.#options.state() !== "playing");
      if (this.#padWasConnected && !pad.connected && this.#options.state() === "playing"
        && this.#options.autoPauseDisconnect()) {
        this.#options.setState("paused");
        try { document.exitPointerLock(); } catch { /* Pointer lock may already be gone. */ }
      }
      this.#padWasConnected = pad.connected;
    }
    input.updateUI();
    if (input.mode !== this.#lastInputMode) {
      this.#lastInputMode = input.mode;
      document.body.dataset.imode = input.mode;
    }
    if (clipper !== null) {
      if (input.pressed.has("BracketLeft")) clipper.start();
      if (input.pressed.has("BracketRight")) clipper.stop();
    }
    const confirm = { key: false, touch: false, pad: false, click: false };
    if (this.#options.state() === "playing" && cinema.active) {
      const gamepad = pad?.connected ? navigator.getGamepads()[pad.index] : null;
      Object.assign(confirm, {
        key: input.held.has("Space") || input.held.has("Enter") || input.held.has("NumpadEnter"),
        touch: !!input.btnHeld.jump,
        pad: !!gamepad?.buttons[0]?.pressed,
        click: !!input.takeClick() || input.tJump,
      });
    }
    if (this.#options.state() === "playing") {
      this.#options.applicationFrameRecording?.begin(deltaSeconds, confirm, cinema.active);
      if (cinema.active) cinema.update(deltaSeconds, confirm);
    }
    input.allowLock = this.#options.state() === "playing";
  }

  #advancePlaying(deltaSeconds: number): number {
    const { canvas, document, input } = this.#options;
    this.#pausedSinceMilliseconds = null;
    this.#options.advancePlayingPrelude(deltaSeconds);
    this.#options.applicationFrameRecording?.preludeApplied();
    if (input.locked) this.#wasPointerLocked = true;
    const lostCapture = this.#wasPointerLocked && !input.locked;
    const portraitGate = input.touchActive() && canvas.clientHeight > canvas.clientWidth;
    if (input.pausePressed() || input.escapePressed() || lostCapture || portraitGate) {
      this.#consume("KeyP", "Escape");
      this.#options.setState("paused");
      this.#wasPointerLocked = false;
      try { document.exitPointerLock(); } catch { /* Pointer lock may already be gone. */ }
      return 0;
    }
    return this.#options.advancePlayingSimulation(deltaSeconds);
  }

  #advanceInactive(): void {
    const { input } = this.#options;
    this.#options.resetSimulation();
    this.#wasPointerLocked = false;
    const state = this.#options.state();
    if (state !== "paused") this.#pausedSinceMilliseconds = null;
    else this.#pausedSinceMilliseconds ??= this.#frameStartedMilliseconds;
    const pauseSettled = this.#pausedSinceMilliseconds !== null
      && this.#frameStartedMilliseconds - this.#pausedSinceMilliseconds >= UI_CONFIRM_SETTLE_SECONDS * 1_000;
    if (state === "paused" && (input.pausePressed() || input.escapePressed())) {
      // P, Escape and controller Start toggle pause. The settle window keeps the Escape
      // that released pointer lock (and paused) from also resuming; a resume that cannot
      // recapture the mouse leaves uncaptured play with the click-to-capture hint.
      this.#consume("KeyP", "Escape");
      if (pauseSettled) {
        this.#options.setState("playing");
        this.#options.requestPointerLock();
      }
    } else if (state === "pgmenu" && (input.pressed.has("Tab") || input.escapePressed())) {
      this.#consume("Tab", "Escape");
      this.#options.setState("playing");
      this.#options.requestPointerLock();
    } else if (state === "pglab" && (input.pressed.has("Tab") || input.escapePressed())) {
      this.#consume("Tab", "Escape");
      this.#options.setState("pgmenu");
    } else if (state === "replay" && input.escapePressed()) {
      this.#consume("Escape");
      this.#options.exitReplay();
    }
  }

  /** A key this coordinator acted on must not also drive the next screen's UI frame. */
  #consume(...codes: readonly string[]): void {
    for (const code of codes) this.#options.input.pressed.delete(code);
  }

  #advanceApplication(deltaSeconds: number): void {
    const state = this.#options.state();
    this.#options.advanceClocks(deltaSeconds, state);
    const playing = state === "playing";
    if (playing !== this.#gameplayActive) {
      if (playing) this.#options.gameplayStart(); else this.#options.gameplayStop();
      this.#gameplayActive = playing;
    }
    this.#options.advanceContinue(deltaSeconds);
    this.#options.updateAttract(deltaSeconds, this.#options.isMenuScreen(state));
    this.#options.input.uiMode = !playing
      || (this.#options.cinema.active && this.#options.cinema.playerMode !== "finalBlade");
    const density = { touch: this.#options.input.touchActive(), cssPerLogicalPixel: this.#options.cssPerLogicalPixel() };
    // Desktop tokens do not depend on the scale; touch tokens are derived from it.
    const key = density.touch ? `touch:${density.cssPerLogicalPixel.toFixed(3)}` : "desktop";
    if (key !== this.#uiDensityKey) {
      this.#uiDensityKey = key;
      this.#options.setUiDensity(density);
    }
    this.#options.syncMusic();
  }

  #recordDiagnostics(frameStarted: number, simulationFinished: number, renderFinished: number,
    frameIntervalSeconds: number): void {
    const now = this.#options.now();
    const frameWorkMilliseconds = now - frameStarted;
    const frameIntervalMilliseconds = Math.max(0, frameIntervalSeconds * 1000);
    this.#options.diagnostics.record("simulation", simulationFinished - frameStarted);
    this.#options.diagnostics.record("render", renderFinished - simulationFinished);
    this.#options.diagnostics.record("frame", frameWorkMilliseconds);
    this.#options.diagnostics.record("frameInterval", frameIntervalMilliseconds);
    this.#options.diagnostics.record("outsideFrameWork",
      Math.max(0, frameIntervalMilliseconds - this.#previousFrameWorkMilliseconds));
    this.#previousFrameWorkMilliseconds = frameWorkMilliseconds;
    const counts = this.#options.entityCounts();
    this.#options.diagnostics.gauge("enemies", counts.enemies);
    this.#options.diagnostics.gauge("projectiles", counts.projectiles);
    this.#options.diagnostics.gauge("effects", counts.effects);
  }
}

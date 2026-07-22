import type { InputMode, Point } from "../input/legacy-input-contracts";

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
  endFrame(): void;
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
  record(name: "simulation" | "render" | "frame", milliseconds: number): void;
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
  readonly advancePlayingSimulation: (deltaSeconds: number) => void;
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
  readonly setUiDensity: (density: "desktop" | "touch") => void;
  readonly syncMusic: () => void;
  readonly render: () => void;
  readonly handleUi: () => void;
  readonly diagnostics: RuntimeFrameDiagnostics;
  readonly entityCounts: () => Readonly<{ enemies: number; projectiles: number; effects: number }>;
}

/** Owns the real-time frame ordering while fixed-step gameplay remains behind its host port. */
export class RuntimeFrameCoordinator {
  readonly #options: RuntimeFrameCoordinatorOptions;
  #padWasConnected = false;
  #lastInputMode = "";
  #wasPointerLocked = false;
  #gameplayActive = false;
  #uiDensity: "desktop" | "touch" = "desktop";

  constructor(options: RuntimeFrameCoordinatorOptions) {
    this.#options = options;
  }

  run(deltaSeconds: number): void {
    const frameStarted = this.#options.now();
    this.#prepareInput(deltaSeconds);
    if (this.#options.state() === "playing") this.#advancePlaying(deltaSeconds);
    else this.#advanceInactive();
    this.#advanceApplication(deltaSeconds);

    const simulationFinished = this.#options.now();
    this.#options.render();
    const renderFinished = this.#options.now();
    this.#options.handleUi();
    this.#options.input.endFrame();
    this.#recordDiagnostics(frameStarted, simulationFinished, renderFinished);
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
    if (this.#options.state() === "playing" && cinema.active) {
      const gamepad = pad?.connected ? navigator.getGamepads()[pad.index] : null;
      cinema.update(deltaSeconds, {
        key: input.held.has("Space") || input.held.has("Enter") || input.held.has("NumpadEnter"),
        touch: !!input.btnHeld.jump,
        pad: !!gamepad?.buttons[0]?.pressed,
        click: !!input.takeClick() || input.tJump,
      });
    }
    input.allowLock = this.#options.state() === "playing";
  }

  #advancePlaying(deltaSeconds: number): void {
    const { canvas, document, input } = this.#options;
    this.#options.advancePlayingPrelude(deltaSeconds);
    if (input.locked) this.#wasPointerLocked = true;
    const lostCapture = this.#wasPointerLocked && !input.locked;
    const portraitGate = input.touchActive() && canvas.clientHeight > canvas.clientWidth;
    if (input.pausePressed() || input.escapePressed() || lostCapture || portraitGate) {
      this.#options.setState("paused");
      this.#wasPointerLocked = false;
      try { document.exitPointerLock(); } catch { /* Pointer lock may already be gone. */ }
      return;
    }
    this.#options.advancePlayingSimulation(deltaSeconds);
  }

  #advanceInactive(): void {
    const { input } = this.#options;
    this.#options.resetSimulation();
    this.#wasPointerLocked = false;
    const state = this.#options.state();
    if (state === "pgmenu" && (input.pressed.has("Tab") || input.escapePressed())) {
      this.#options.setState("playing");
      this.#options.requestPointerLock();
    } else if (state === "pglab" && (input.pressed.has("Tab") || input.escapePressed())) {
      this.#options.setState("pgmenu");
    } else if (state === "replay" && input.escapePressed()) {
      this.#options.exitReplay();
    }
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
    const density = this.#options.input.touchActive() && this.#options.cssPerLogicalPixel() < 0.6
      ? "touch" : "desktop";
    if (density !== this.#uiDensity) {
      this.#uiDensity = density;
      this.#options.setUiDensity(density);
    }
    this.#options.syncMusic();
  }

  #recordDiagnostics(frameStarted: number, simulationFinished: number, renderFinished: number): void {
    const now = this.#options.now();
    this.#options.diagnostics.record("simulation", simulationFinished - frameStarted);
    this.#options.diagnostics.record("render", renderFinished - simulationFinished);
    this.#options.diagnostics.record("frame", now - frameStarted);
    const counts = this.#options.entityCounts();
    this.#options.diagnostics.gauge("enemies", counts.enemies);
    this.#options.diagnostics.gauge("projectiles", counts.projectiles);
    this.#options.diagnostics.gauge("effects", counts.effects);
  }
}

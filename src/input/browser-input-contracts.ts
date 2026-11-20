import type { AimDevice } from "../domain/pointer-ownership";
import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "./game-action";
import type { SemanticInputBuffer } from "./semantic-buffer";
import type { TouchControlLayout } from "./touch-control-layout";

export type InputMode = "mouse" | "keyboard" | "gamepad" | "touch";
export type ForcedInputMode = "auto" | "touch" | "desktop";
export type TouchAimMode = "stick" | "drag";

export interface Point {
  x: number;
  y: number;
}

export interface ViewConfig {
  readonly w: number;
  readonly h: number;
}

export interface TouchConfig {
  readonly aimBoost?: number;
  readonly joyFollow?: number;
  readonly stickRadius?: number;
  readonly stickDead?: number;
}

export interface GamepadSettings {
  dead: number;
  menuRepeat: number;
  triggerThreshold: number;
  menuScrollDead: number;
  menuScrollMaxSpeed: number;
  activityBias: number;
  deadL: number;
  deadR: number;
  aimSens: number;
  tetherMode: "hold" | "toggle";
  doubleTapDash: boolean;
  doubleTapWindow: number;
  vibration: "off" | "low" | "medium" | "high";
  glyphStyle: "auto" | "playstation" | "xbox" | "generic";
}

export interface BrowserInputConfig {
  readonly view: ViewConfig;
  readonly touch?: TouchConfig;
  pad?: GamepadSettings;
}

export interface Insets {
  readonly l: number;
  readonly r: number;
  readonly t: number;
  readonly b: number;
}

export interface Overscan {
  readonly x: number;
  readonly y: number;
}

export interface BrowserInputDependencies {
  readonly config: BrowserInputConfig;
  readonly safeArea: Insets;
  readonly overscan: Overscan;
  readonly window: Window;
  readonly document: Document;
  readonly navigator: InputNavigatorPort;
  readonly performance: Performance;
  readonly semantic: SemanticInputBuffer;
}

export interface InputNavigatorPort {
  vibrate(pattern: VibratePattern): boolean;
}

export type TouchZoneName = "jump" | "dash" | "throwB" | "pause";
export type TouchLayout = TouchControlLayout;

export interface TouchJoystick {
  active: boolean;
  id: number;
  ax: number;
  ay: number;
  dx: number;
  dy: number;
}

export interface UiInputSnapshot {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;
  back: boolean;
  tabPrev: boolean;
  tabNext: boolean;
  pageUp: boolean;
  pageDown: boolean;
  scrollX: number;
  scrollY: number;
  context1: boolean;
  context2: boolean;
}

export interface UiScroll {
  readonly x: number;
  readonly y: number;
  readonly source: "mouse" | "touch" | "gamepad" | null;
}

export interface BrowserInput {
  readonly semantic: SemanticInputBuffer;
  readonly held: Set<string>;
  readonly pressed: Set<string>;
  mouseX: number;
  mouseY: number;
  dx: number;
  dy: number;
  locked: boolean;
  allowLock: boolean;
  rmb: boolean;
  lmb: boolean;
  padTether: boolean;
  keyTether: boolean;
  clicked: boolean;
  clickX: number;
  clickY: number;
  wheel: number;
  mode: InputMode;
  modeChangedAt: number;
  lastPointerX: number;
  lastPointerY: number;
  clickSource: "mouse" | "touch";
  padScrollX: number;
  padScrollY: number;
  padBack: boolean;
  /** Controller confirm (south face button) is physically down; written by the gamepad poll. */
  padConfirmHeld: boolean;
  /** Any controller button is down or the left stick or d-pad points; written by the gamepad poll. */
  padMenuHeld: boolean;
  /** The mouse is over the canvas; false while it rests on DOM chrome or outside the page. */
  pointerInside: boolean;
  _uiTabPrev: boolean;
  _uiTabNext: boolean;
  _uiPageUp: boolean;
  _uiPageDown: boolean;
  _uiContext1: boolean;
  _uiContext2: boolean;
  readonly ui: UiInputSnapshot;
  touchOn: boolean;
  forceMode: ForcedInputMode;
  touchAim: boolean;
  /** The device that last gave aim input (domain/pointer-ownership.ts, `aimFollowsDevices`). */
  aimDevice: AimDevice | null;
  touchAimMode: TouchAimMode;
  stickAim: Point | null;
  uiMode: boolean;
  tJump: boolean;
  tDash: boolean;
  tPause: boolean;
  readonly btnHeld: Record<string, boolean | undefined>;
  joy: TouchJoystick;
  _aimId: number;
  _aimLX: number;
  _aimLY: number;
  _aimAX: number;
  _aimAY: number;
  _scrollId: number;
  _scrollLY: number;
  _scrollV: number;
  scrollFlick: number;
  textEntryMode: boolean;
  readonly tetherHeld: boolean;
  setMode(mode: InputMode): void;
  /** A device gave aim input: it owns the aim until another device aims. */
  claimAim(device: AimDevice): void;
  /** A finger or stick starts or keeps steering the aim: it is steering, and it owns the aim. */
  steerAim(device: AimDevice): void;
  /** Whether aim follows the devices this tick, or holds where its owner left it. */
  aimIsLive(): boolean;
  startSemanticRecording(): void;
  stopSemanticRecording(): void;
  discardSemanticInput(): void;
  /** Play resumes: drops unsealed input like discardSemanticInput and seals a resume action, so the held blade re-seats along the aim on the first tick. */
  returnControl(): void;
  /** Drops every press still waiting when a scene hands control back (src/input/scene-release.ts). */
  discardScenePresses(): void;
  drainSemanticActions(tick: number, aimTurn?: number): readonly CommandEnvelope<GameAction>[];
  syncSemanticMovement(): void;
  setPadTether(held: boolean): void;
  setKeyTether(held: boolean): void;
  updateUI(): void;
  takeUIScroll(): UiScroll;
  touchActive(): boolean;
  buzz(pattern: number | number[]): void;
  touchLayout(): TouchLayout;
  init(canvas: HTMLCanvasElement, requestPointerLock?: () => void): void;
  consumeDelta(): Point;
  left(): boolean;
  right(): boolean;
  up(): boolean;
  down(): boolean;
  jumpPressed(): boolean;
  dashPressed(): boolean;
  pausePressed(): boolean;
  escapePressed(): boolean;
  menuUp(): boolean;
  menuDown(): boolean;
  menuLeft(): boolean;
  menuRight(): boolean;
  menuPrev(): boolean;
  menuNext(): boolean;
  confirmPressed(): boolean;
  confirmHeld(): boolean;
  menuInputHeld(): boolean;
  backPressed(): boolean;
  consumeThrow(): boolean;
  takeClick(): Point | null;
  /** The mouse position while the mouse owns the interface, else null (domain/pointer-ownership.ts). */
  pointer(): Point | null;
  takeWheel(): number;
  endFrame(preserveSimulationEdges?: boolean): void;
}

export type PadAction = "jump" | "dash" | "throw" | "tether";
export type PadPresetName = "default" | "standard" | "tear" | "classic" | "split";
export type PadPreset = Readonly<Record<PadAction, readonly number[]>>;
export type PadPresets = Readonly<Record<PadPresetName, PadPreset>>;

export interface BrowserGamepadDependencies {
  readonly config: BrowserInputConfig;
  readonly input: BrowserInput;
  readonly window: Window;
  readonly navigator: GamepadNavigatorPort;
  readonly semantic: SemanticInputBuffer;
}

export interface GamepadNavigatorPort {
  getGamepads(): readonly (Gamepad | null)[];
}

export interface BrowserGamepad {
  connected: boolean;
  index: number;
  toastT: number;
  toastText: string;
  active: boolean;
  preset: PadPresetName;
  init(): void;
  setPreset(name: string): PadPresetName;
  rumble(strength?: number, milliseconds?: number): void;
  glyph(index: number): string;
  bindingLabel(action: PadAction): string;
  poll(dt: number, uiMode: boolean): void;
}

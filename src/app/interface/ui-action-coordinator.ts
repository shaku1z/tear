import {
  enabledButtonIndexes,
  findDirectionalFocus,
  type FocusableRect,
  type NavigationDirection,
} from "./ui-navigation";
import { screenNeedsConfirmArming, screenNeedsPointerSettle } from "../../domain/screen-catalog";

export interface UiActionButton extends FocusableRect {
  readonly label?: string;
  readonly confirm?: boolean;
}

export interface UiPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The one settle window shared by every confirm path (keyboard, controller,
 * number keys, mouse and touch). A screen that interrupts play ignores choices
 * until the player has let go of confirm since it opened and this long has
 * passed, so a jump or retry mash meant for the previous screen never picks.
 * Which screens arm confirm and settle pointers is the screen catalog's
 * (src/domain/screen-catalog.ts).
 */
export const UI_CONFIRM_SETTLE_SECONDS = 0.35;

export interface UiConfirmArmingState {
  readonly screen: string;
  readonly openedAtSeconds: number;
  readonly releasedSinceOpen: boolean;
}

/** Records when the current screen opened and whether confirm has been up since then. */
export function advanceUiConfirmArming(
  previous: UiConfirmArmingState | null,
  screen: string,
  nowSeconds: number,
  confirmHeld: boolean,
): UiConfirmArmingState {
  if (previous?.screen !== screen) {
    return Object.freeze({ screen, openedAtSeconds: nowSeconds, releasedSinceOpen: !confirmHeld });
  }
  if (previous.releasedSinceOpen || confirmHeld) return previous;
  return Object.freeze({ ...previous, releasedSinceOpen: true });
}

export interface UiConfirmGate {
  /** Keyboard confirm, controller confirm and number-key choices may act. */
  readonly confirm: boolean;
  /** Mouse clicks and touch taps may activate a control. */
  readonly pointer: boolean;
}

export function uiConfirmGate(
  screen: string,
  screenAgeSeconds: number,
  confirmReleasedSinceOpen: boolean,
): UiConfirmGate {
  const settled = screenAgeSeconds >= UI_CONFIRM_SETTLE_SECONDS;
  return Object.freeze({
    confirm: !screenNeedsConfirmArming(screen) || (settled && confirmReleasedSinceOpen),
    pointer: !screenNeedsPointerSettle(screen) || settled,
  });
}

export interface UiFrameInput {
  readonly screen: string;
  /** Seconds since `screen` opened (see `advanceUiConfirmArming`). */
  readonly screenAgeSeconds: number;
  /** Every confirm input has been up at least once since `screen` opened. */
  readonly confirmReleasedSinceOpen: boolean;
  readonly buttons: readonly UiActionButton[];
  readonly focus: number;
  readonly scroll: number;
  readonly scrollY: number;
  readonly pageUp: boolean;
  readonly pageDown: boolean;
  /**
   * Where the mouse points, or null while another device owns the interface (input mode
   * other than "mouse"). A touch screen has no hover, and a resting mouse must not take
   * focus from a controller or the keyboard.
   */
  readonly pointer: UiPoint | null;
  readonly touch: boolean;
  readonly directions: Readonly<Record<NavigationDirection, boolean>>;
  readonly previous: boolean;
  readonly next: boolean;
  readonly pressed: ReadonlySet<string>;
  /** Semantic back: controller back, Escape, or Backspace outside text entry. */
  readonly back: boolean;
  readonly confirm: boolean;
  readonly context1: boolean;
}

export type UiSemanticAction =
  | Readonly<{ type: "choose-upgrade"; index: number }>
  | Readonly<{ type: "choose-reserve"; index: number }>
  | Readonly<{ type: "choose-tier"; index: number }>
  | Readonly<{ type: "reroll-draft" }>
  | Readonly<{ type: "activate-button"; index: number; source: "back" | "confirm" }>;

export interface UiFrameDecision {
  readonly focus: number;
  readonly scroll: number;
  readonly action: UiSemanticAction | null;
  /** The back request was handled or has nowhere to go; clear any latched controller back. */
  readonly consumeBack: boolean;
  readonly pointer: "leave" | "consume" | "read";
  readonly playUiSound: boolean;
}

export interface UiPointerDecision {
  readonly focus: number;
  readonly action: Readonly<{ type: "activate-button"; index: number; source: "pointer" }> | null;
  readonly playUiSound: boolean;
}

export function pointInUiRect(rect: FocusableRect, point: UiPoint, padding = 0): boolean {
  return (
    point.x >= rect.x - padding &&
    point.x <= rect.x + rect.w + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.h + padding
  );
}

export function uiScrollDelta(scrollY: number, pageUp: boolean, pageDown: boolean, pageSize = 620): number {
  return scrollY + (pageDown ? pageSize : 0) - (pageUp ? pageSize : 0);
}

export interface UiTabDecision<Key> {
  readonly key: Key;
  readonly changed: boolean;
}

export function stepUiTab<Key>(
  tabs: readonly (readonly [Key, ...(readonly unknown[])])[],
  current: Key,
  tabPrevious: boolean,
  tabNext: boolean,
): UiTabDecision<Key> {
  const step = (tabNext ? 1 : 0) - (tabPrevious ? 1 : 0);
  if (step === 0) return Object.freeze({ key: current, changed: false });
  const currentIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab[0] === current),
  );
  const next = tabs[currentIndex + step];
  return next === undefined
    ? Object.freeze({ key: current, changed: false })
    : Object.freeze({ key: next[0], changed: true });
}

function digitChoice(pressed: ReadonlySet<string>, count: number): number | null {
  for (let index = 0; index < count; index += 1) {
    if (pressed.has(`Digit${String(index + 1)}`)) return index;
  }
  return null;
}

function quickAction(
  screen: string,
  pressed: ReadonlySet<string>,
  buttons: readonly UiActionButton[],
  context1: boolean,
): UiSemanticAction | null {
  if (screen === "setup" && (context1 || pressed.has("Context1"))) {
    const index = buttons.findIndex((button) => button.enabled !== false && button.label === "START");
    if (index >= 0) return Object.freeze({ type: "activate-button", index, source: "confirm" });
  }
  if (screen === "draft") {
    const index = digitChoice(pressed, 4);
    if (index !== null) return Object.freeze({ type: "choose-upgrade", index });
    if (pressed.has("KeyR")) return Object.freeze({ type: "reroll-draft" });
  } else if (screen === "reserve") {
    const index = digitChoice(pressed, 3);
    if (index !== null) return Object.freeze({ type: "choose-reserve", index });
  } else if (screen === "tierup") {
    const index = digitChoice(pressed, 4);
    if (index !== null) return Object.freeze({ type: "choose-tier", index });
  }
  return null;
}

export function coordinateUiFrame(input: UiFrameInput): UiFrameDecision {
  if (input.screen === "playing") {
    return Object.freeze({
      focus: input.focus,
      scroll: input.scroll,
      action: null,
      consumeBack: false,
      pointer: "leave",
      playUiSound: false,
    });
  }

  const scroll = Math.max(
    0,
    Math.min(6_000, input.scroll + uiScrollDelta(input.scrollY, input.pageUp, input.pageDown)),
  );
  const enabled = enabledButtonIndexes(input.buttons);
  if (enabled.length === 0) {
    return Object.freeze({
      focus: input.focus,
      scroll,
      action: null,
      consumeBack: false,
      pointer: "consume",
      playUiSound: false,
    });
  }

  let focus = input.focus;
  // mouse hover moves focus while the mouse owns the interface
  const pointer = input.pointer;
  if (pointer !== null) {
    for (const index of enabled) {
      const button = input.buttons[index];
      if (button !== undefined && pointInUiRect(button, pointer)) focus = index;
    }
  }

  let position = enabled.indexOf(focus);
  if (position < 0) {
    position = 0;
    focus = enabled[0] ?? focus;
  }
  let moved = false;
  for (const direction of ["left", "right", "up", "down"] as const) {
    if (moved || !input.directions[direction]) continue;
    const nextFocus = findDirectionalFocus(input.buttons, enabled, focus, direction);
    if (nextFocus !== null) {
      focus = nextFocus;
      moved = true;
    }
  }
  if (!moved) {
    if (input.previous) focus = enabled[(position - 1 + enabled.length) % enabled.length] ?? focus;
    else if (input.next) focus = enabled[(position + 1) % enabled.length] ?? focus;
  }

  // Navigation above stays live through the settle window; choices wait for the gate.
  const gate = uiConfirmGate(input.screen, input.screenAgeSeconds, input.confirmReleasedSinceOpen);
  const shortcut = gate.confirm ? quickAction(input.screen, input.pressed, input.buttons, input.context1) : null;
  if (shortcut)
    return Object.freeze({ focus, scroll, action: shortcut, consumeBack: false, pointer: "leave", playUiSound: false });

  if (input.back) {
    const index = input.buttons.findIndex((button) => button.enabled !== false && button.label?.includes("BACK"));
    if (index >= 0) {
      return Object.freeze({
        focus,
        scroll,
        action: Object.freeze({ type: "activate-button", index, source: "back" }),
        consumeBack: true,
        pointer: "leave",
        playUiSound: true,
      });
    }
  }

  const focused = input.buttons[focus];
  if (gate.confirm && input.confirm && focused !== undefined && focused.enabled !== false) {
    return Object.freeze({
      focus,
      scroll,
      action: Object.freeze({ type: "activate-button", index: focus, source: "confirm" }),
      consumeBack: input.back,
      pointer: "leave",
      playUiSound: true,
    });
  }
  return Object.freeze({
    focus,
    scroll,
    action: null,
    consumeBack: input.back,
    pointer: gate.pointer ? "read" : "consume",
    playUiSound: false,
  });
}

export function coordinateUiPointer(
  buttons: readonly UiActionButton[],
  focus: number,
  click: UiPoint | null,
  touch: boolean,
): UiPointerDecision {
  if (click === null) return Object.freeze({ focus, action: null, playUiSound: false });
  const padding = touch ? 10 : 0;
  for (let index = 0; index < buttons.length; index += 1) {
    const button = buttons[index];
    if (button === undefined || button.enabled === false || !pointInUiRect(button, click, padding)) continue;
    if (button.confirm && touch && focus !== index) {
      return Object.freeze({ focus: index, action: null, playUiSound: true });
    }
    return Object.freeze({
      focus,
      action: Object.freeze({ type: "activate-button", index, source: "pointer" }),
      playUiSound: true,
    });
  }
  return Object.freeze({ focus, action: null, playUiSound: false });
}

import {
  enabledButtonIndexes,
  findDirectionalFocus,
  type FocusableRect,
  type NavigationDirection,
} from "./ui-navigation";

export interface UiActionButton extends FocusableRect {
  readonly label?: string;
  readonly confirm?: boolean;
}

export interface UiPoint { readonly x: number; readonly y: number }

export interface UiFrameInput {
  readonly screen: string;
  readonly buttons: readonly UiActionButton[];
  readonly focus: number;
  readonly scroll: number;
  readonly scrollY: number;
  readonly pageUp: boolean;
  readonly pageDown: boolean;
  readonly pointer: UiPoint;
  readonly touch: boolean;
  readonly directions: Readonly<Record<NavigationDirection, boolean>>;
  readonly previous: boolean;
  readonly next: boolean;
  readonly pressed: ReadonlySet<string>;
  readonly padBack: boolean;
  readonly confirm: boolean;
}

export type UiSemanticAction =
  | Readonly<{ type: "choose-upgrade"; index: number }>
  | Readonly<{ type: "choose-reserve"; index: number }>
  | Readonly<{ type: "reroll-draft" }>
  | Readonly<{ type: "activate-button"; index: number; source: "back" | "confirm" }>;

export interface UiFrameDecision {
  readonly focus: number;
  readonly scroll: number;
  readonly action: UiSemanticAction | null;
  readonly consumePadBack: boolean;
  readonly pointer: "leave" | "consume" | "read";
  readonly playUiSound: boolean;
}

export interface UiPointerDecision {
  readonly focus: number;
  readonly action: Readonly<{ type: "activate-button"; index: number; source: "pointer" }> | null;
  readonly playUiSound: boolean;
}

export function pointInUiRect(rect: FocusableRect, point: UiPoint, padding = 0): boolean {
  return point.x >= rect.x - padding && point.x <= rect.x + rect.w + padding &&
    point.y >= rect.y - padding && point.y <= rect.y + rect.h + padding;
}

export function uiScrollDelta(scrollY: number, pageUp: boolean, pageDown: boolean, pageSize = 620): number {
  return scrollY + (pageDown ? pageSize : 0) - (pageUp ? pageSize : 0);
}

export interface UiTabDecision<Key> {
  readonly key: Key;
  readonly changed: boolean;
}

export function stepUiTab<Key>(
  tabs: readonly (readonly [Key, ...readonly unknown[]])[],
  current: Key,
  tabPrevious: boolean,
  tabNext: boolean,
): UiTabDecision<Key> {
  const step = (tabNext ? 1 : 0) - (tabPrevious ? 1 : 0);
  if (step === 0) return Object.freeze({ key: current, changed: false });
  const currentIndex = Math.max(0, tabs.findIndex((tab) => tab[0] === current));
  const next = tabs[currentIndex + step];
  return next === undefined
    ? Object.freeze({ key: current, changed: false })
    : Object.freeze({ key: next[0], changed: true });
}

function quickAction(screen: string, pressed: ReadonlySet<string>): UiSemanticAction | null {
  if (screen === "draft") {
    for (let index = 0; index < 4; index += 1) {
      if (pressed.has(`Digit${String(index + 1)}`)) return Object.freeze({ type: "choose-upgrade", index });
    }
    if (pressed.has("KeyR")) return Object.freeze({ type: "reroll-draft" });
  } else if (screen === "reserve") {
    for (let index = 0; index < 3; index += 1) {
      if (pressed.has(`Digit${String(index + 1)}`)) return Object.freeze({ type: "choose-reserve", index });
    }
  }
  return null;
}

export function coordinateUiFrame(input: UiFrameInput): UiFrameDecision {
  if (input.screen === "playing") {
    return Object.freeze({ focus: input.focus, scroll: input.scroll, action: null, consumePadBack: false, pointer: "leave", playUiSound: false });
  }

  const scroll = Math.max(0, Math.min(6_000,
    input.scroll + uiScrollDelta(input.scrollY, input.pageUp, input.pageDown)));
  const enabled = enabledButtonIndexes(input.buttons);
  if (enabled.length === 0) {
    return Object.freeze({ focus: input.focus, scroll, action: null, consumePadBack: false, pointer: "consume", playUiSound: false });
  }

  let focus = input.focus;
  // pointer hover moves focus in every input mode (source handleUI contract)
  for (const index of enabled) {
    const button = input.buttons[index];
    if (button !== undefined && pointInUiRect(button, input.pointer)) focus = index;
  }

  let position = enabled.indexOf(focus);
  if (position < 0) { position = 0; focus = enabled[0] ?? focus; }
  let moved = false;
  for (const direction of ["left", "right", "up", "down"] as const) {
    if (moved || !input.directions[direction]) continue;
    const nextFocus = findDirectionalFocus(input.buttons, enabled, focus, direction);
    if (nextFocus !== null) { focus = nextFocus; moved = true; }
  }
  if (!moved) {
    if (input.previous) focus = enabled[(position - 1 + enabled.length) % enabled.length] ?? focus;
    else if (input.next) focus = enabled[(position + 1) % enabled.length] ?? focus;
  }

  const shortcut = quickAction(input.screen, input.pressed);
  if (shortcut) return Object.freeze({ focus, scroll, action: shortcut, consumePadBack: false, pointer: "leave", playUiSound: false });

  if (input.padBack) {
    const index = input.buttons.findIndex((button) => button.enabled !== false && button.label?.includes("BACK"));
    if (index >= 0) {
      return Object.freeze({
        focus, scroll, action: Object.freeze({ type: "activate-button", index, source: "back" }),
        consumePadBack: true, pointer: "leave", playUiSound: true,
      });
    }
  }

  const focused = input.buttons[focus];
  if (input.confirm && focused !== undefined && focused.enabled !== false) {
    return Object.freeze({
      focus, scroll, action: Object.freeze({ type: "activate-button", index: focus, source: "confirm" }),
      consumePadBack: input.padBack, pointer: "leave", playUiSound: true,
    });
  }
  return Object.freeze({ focus, scroll, action: null, consumePadBack: input.padBack, pointer: "read", playUiSound: false });
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
      focus, action: Object.freeze({ type: "activate-button", index, source: "pointer" }), playUiSound: true,
    });
  }
  return Object.freeze({ focus, action: null, playUiSound: false });
}

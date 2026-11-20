/**
 * The one prompt vocabulary: every control a coach mark, lesson or help line may
 * name, worded for the device that owns input right now. Lessons and screens name
 * semantic prompt actions; only this table turns them into keys, buttons or touch
 * zones, so no caller ever matches on lesson titles or hard-codes a key. Keyboard
 * wording names keyboard actions, and the keys come from the binding table.
 */

import { keyboardLabel, keyboardLabels, type KeyboardAction } from "./keyboard-bindings";

export type PromptDevice = "keyboard" | "touch" | "gamepad";

/** Input modes reported by the input layer, mapped onto the three prompt vocabularies. */
export type PromptInputMode = "mouse" | "keyboard" | "gamepad" | "touch";

export const PROMPT_ACTIONS = [
  "move",
  "move-left",
  "move-right",
  "move-up",
  "move-down",
  "jump",
  "drop",
  "dash",
  "dash-down",
  "swing",
  "aim",
  "swing-up",
  "swing-down",
  "throw",
  "recall",
  "tether",
  "pause",
  "back",
  "confirm",
  "tab-prev",
  "tab-next",
  "close-menu",
  "playground-menu",
  "heal",
  "clear-enemies",
  "spawn-dummy",
  "repeat-spawn",
  "toggle-freeze",
  "toggle-no-damage",
  "fullscreen",
] as const;
export type PromptAction = (typeof PROMPT_ACTIONS)[number];

/**
 * Pad bindings resolved to a glyph at draw time: the preset actions follow the player's
 * controller preset, and the menu buttons follow the glyph style (Xbox, PlayStation, generic).
 */
export type PadBinding =
  | "jump"
  | "dash"
  | "throw"
  | "tether"
  | "confirm"
  | "back"
  | "pause"
  | "tab-prev"
  | "tab-next"
  /** View / Create / Select: the Playground's menu, and held, its shortcut layer. */
  | "view"
  /** Y / △ / North. */
  | "north";
export type PadBindingLabel = (binding: PadBinding) => string;

/** A pad wording: one button's glyph, or a chord of two (`with`), with fixed text around it. */
type Wording = string | Readonly<{ pad: PadBinding; with?: PadBinding; suffix?: string; prefix?: string }>;

/**
 * Keyboard wording: the labels of bound keyboard actions joined in order, or a pointer
 * word ("MOUSE ↑") for what only the mouse does. Never a key letter: keys are named by
 * the binding table so a rebind renames every prompt.
 */
type KeyboardWording =
  `MOUSE${string}` | Readonly<{ keys: readonly KeyboardAction[]; join?: string; prefix?: string; suffix?: string }>;

interface ActionWording {
  readonly keyboard: KeyboardWording;
  readonly touch: Wording | null;
  readonly gamepad: Wording | null;
}

const keys = (...actions: readonly KeyboardAction[]) => Object.freeze({ keys: actions });

/**
 * `null` means the device has no direct control for the action (the prompt is then
 * omitted, and the screen offers a button instead). Gamepad entries that depend on
 * the player's preset name the binding; the glyph is resolved at draw time.
 */
const WORDING: Readonly<Record<PromptAction, ActionWording>> = Object.freeze({
  move: { keyboard: keys("move-left", "move-right"), touch: "LEFT STICK", gamepad: "LS" },
  "move-left": { keyboard: keys("move-left"), touch: "STICK ←", gamepad: "LS ←" },
  "move-right": { keyboard: keys("move-right"), touch: "STICK →", gamepad: "LS →" },
  "move-up": { keyboard: keys("move-up"), touch: "STICK ↑", gamepad: "LS ↑" },
  "move-down": { keyboard: keys("move-down"), touch: "STICK ↓", gamepad: "LS ↓" },
  jump: { keyboard: keys("jump"), touch: "JUMP", gamepad: { pad: "jump" } },
  drop: { keyboard: { keys: ["move-down"], prefix: "HOLD " }, touch: "STICK ↓", gamepad: "LS ↓" },
  dash: { keyboard: keys("dash"), touch: "DASH", gamepad: { pad: "dash" } },
  "dash-down": {
    keyboard: { keys: ["move-down", "dash"], join: " + " },
    touch: "STICK ↓ + DASH",
    gamepad: { pad: "dash", prefix: "LS ↓ + " },
  },
  swing: { keyboard: "MOUSE", touch: "DRAG", gamepad: "RS" },
  aim: { keyboard: "MOUSE", touch: "DRAG", gamepad: "RS" },
  "swing-up": { keyboard: "MOUSE ↑", touch: "DRAG ↑", gamepad: "RS ↑" },
  "swing-down": { keyboard: "MOUSE ↓", touch: "DRAG ↓", gamepad: "RS ↓" },
  throw: { keyboard: { keys: ["throw"], suffix: " / RIGHT CLICK" }, touch: "THROW", gamepad: { pad: "throw" } },
  recall: { keyboard: { keys: ["throw"], suffix: " / RIGHT CLICK" }, touch: "THROW", gamepad: { pad: "throw" } },
  tether: { keyboard: { keys: ["tether"], suffix: " / LEFT CLICK" }, touch: "HOLD", gamepad: { pad: "tether" } },
  pause: { keyboard: keys("pause"), touch: "PAUSE", gamepad: { pad: "pause" } },
  back: { keyboard: keys("back"), touch: "BACK", gamepad: { pad: "back" } },
  confirm: { keyboard: keys("confirm"), touch: "TAP", gamepad: { pad: "confirm" } },
  // Tabbed menus: touch players tap the tab strip and RESUME, so touch has no prompt for these.
  "tab-prev": { keyboard: keys("tab-prev"), touch: null, gamepad: { pad: "tab-prev" } },
  "tab-next": { keyboard: keys("tab-next"), touch: null, gamepad: { pad: "tab-next" } },
  "close-menu": { keyboard: keys("close-menu", "back"), touch: null, gamepad: { pad: "back" } },
  // The Playground: View opens the menu on a pad; held, it makes the D-pad and Y shortcuts
  // (browser-gamepad's Playground layer). No damage has no pad shortcut: it is in the menu.
  "playground-menu": { keyboard: keys("playground-menu"), touch: null, gamepad: { pad: "view" } },
  heal: { keyboard: keys("heal"), touch: null, gamepad: { pad: "view", suffix: " + ↑" } },
  "clear-enemies": { keyboard: keys("clear-enemies"), touch: null, gamepad: { pad: "view", suffix: " + ↓" } },
  "spawn-dummy": { keyboard: keys("spawn-dummy"), touch: null, gamepad: { pad: "view", suffix: " + ←" } },
  "repeat-spawn": { keyboard: keys("repeat-spawn"), touch: null, gamepad: { pad: "view", suffix: " + →" } },
  "toggle-freeze": { keyboard: keys("toggle-freeze"), touch: null, gamepad: { pad: "view", with: "north" } },
  "toggle-no-damage": { keyboard: keys("toggle-no-damage"), touch: null, gamepad: null },
  // Callers name it only where the platform can go fullscreen (not CrazyGames or iPhone Safari).
  fullscreen: { keyboard: keys("fullscreen"), touch: null, gamepad: null },
});

export function promptDevice(mode: PromptInputMode): PromptDevice {
  return mode === "touch" ? "touch" : mode === "gamepad" ? "gamepad" : "keyboard";
}

/** The label for one action on one device, or `null` when that device has no direct control for it. */
export function promptLabel(action: PromptAction, device: PromptDevice, padLabel?: PadBindingLabel): string | null {
  if (device === "keyboard") return keyboardWording(WORDING[action].keyboard);
  const wording = WORDING[action][device];
  if (wording === null) return null;
  if (typeof wording === "string") return wording;
  const glyph = (binding: PadBinding): string => {
    const resolved = padLabel?.(binding);
    return resolved === undefined || resolved === "" ? binding.toUpperCase() : resolved;
  };
  const chord = wording.with === undefined ? glyph(wording.pad) : `${glyph(wording.pad)} + ${glyph(wording.with)}`;
  return `${wording.prefix ?? ""}${chord}${wording.suffix ?? ""}`;
}

function keyboardWording(wording: KeyboardWording): string {
  if (typeof wording === "string") return wording;
  return `${wording.prefix ?? ""}${keySets(wording)}${wording.suffix ?? ""}`;
}

/**
 * The keys of a wording, every alternative named. Alternatives read set by set, so move is
 * "A D / ← →" (the letters, or the arrows); a chord names each part's keys tightly, so dash down
 * is "S/↓ + SHIFT". Both stay keycap-short.
 */
function keySets(wording: Exclude<KeyboardWording, string>): string {
  const labels = wording.keys.map(keyboardLabels);
  if (wording.join !== undefined) return labels.map((names) => names.join("/")).join(wording.join);
  const sets = Math.max(0, ...labels.map((names) => names.length));
  if (labels.length < 2 || sets < 2) return wording.keys.map(keyboardLabel).join(" / ");
  return Array.from({ length: sets }, (_, set) =>
    labels.map((names) => names[Math.min(set, names.length - 1)]).join(" "),
  ).join(" / ");
}

/** Labels for a list of actions; actions with no direct control are dropped and duplicates merge. */
export function promptLabels(
  actions: readonly PromptAction[],
  device: PromptDevice,
  padLabel?: PadBindingLabel,
): readonly string[] {
  const labels: string[] = [];
  for (const action of actions) {
    const label = promptLabel(action, device, padLabel);
    if (label !== null && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

/** True when the device can trigger the action directly (otherwise a screen must offer a control for it). */
export function promptAvailable(action: PromptAction, device: PromptDevice): boolean {
  return device === "keyboard" || WORDING[action][device] !== null;
}

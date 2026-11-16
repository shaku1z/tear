/**
 * The one prompt vocabulary: every control a coach mark, lesson or help line may
 * name, worded for the device that owns input right now. Lessons and screens name
 * semantic prompt actions; only this table turns them into keys, buttons or touch
 * zones, so no caller ever matches on lesson titles or hard-codes a key.
 */

export type PromptDevice = "keyboard" | "touch" | "gamepad";

/** Input modes reported by the input layer, mapped onto the three prompt vocabularies. */
export type PromptInputMode = "mouse" | "keyboard" | "gamepad" | "touch";

export const PROMPT_ACTIONS = [
  "move",
  "move-left",
  "move-right",
  "jump",
  "drop",
  "dash",
  "dash-down",
  "swing",
  "swing-up",
  "swing-down",
  "throw",
  "recall",
  "tether",
  "pause",
  "back",
  "confirm",
  "build-menu",
  "ability-lab",
  "quick-spawn",
  "spawn-dummy",
  "summon-boss",
  "clear-enemies",
  "heal",
] as const;
export type PromptAction = (typeof PROMPT_ACTIONS)[number];

/**
 * Pad bindings resolved to a glyph at draw time: the preset actions follow the player's
 * controller preset, and the menu buttons follow the glyph style (Xbox, PlayStation, generic).
 */
export type PadBinding = "jump" | "dash" | "throw" | "tether" | "confirm" | "back" | "pause";
export type PadBindingLabel = (binding: PadBinding) => string;

type Wording = string | Readonly<{ pad: PadBinding; suffix?: string; prefix?: string }>;

/**
 * `null` means the device has no direct control for the action (the prompt is then
 * omitted, and the screen offers a button instead). Gamepad entries that depend on
 * the player's preset name the binding; the glyph is resolved at draw time.
 */
const WORDING: Readonly<Record<PromptAction, Readonly<Record<PromptDevice, Wording | null>>>> = Object.freeze({
  move: { keyboard: "A / D", touch: "LEFT STICK", gamepad: "LS" },
  "move-left": { keyboard: "A", touch: "STICK ←", gamepad: "LS ←" },
  "move-right": { keyboard: "D", touch: "STICK →", gamepad: "LS →" },
  jump: { keyboard: "W / SPACE", touch: "JUMP", gamepad: { pad: "jump" } },
  drop: { keyboard: "HOLD S", touch: "STICK ↓", gamepad: "LS ↓" },
  dash: { keyboard: "SHIFT", touch: "DASH", gamepad: { pad: "dash" } },
  "dash-down": { keyboard: "S + SHIFT", touch: "STICK ↓ + DASH", gamepad: { pad: "dash", prefix: "LS ↓ + " } },
  swing: { keyboard: "MOUSE", touch: "DRAG", gamepad: "RS" },
  "swing-up": { keyboard: "MOUSE ↑", touch: "DRAG ↑", gamepad: "RS ↑" },
  "swing-down": { keyboard: "MOUSE ↓", touch: "DRAG ↓", gamepad: "RS ↓" },
  throw: { keyboard: "RIGHT CLICK", touch: "THROW", gamepad: { pad: "throw" } },
  recall: { keyboard: "RIGHT CLICK", touch: "THROW", gamepad: { pad: "throw" } },
  tether: { keyboard: "LEFT CLICK", touch: "HOLD", gamepad: { pad: "tether" } },
  pause: { keyboard: "ESC", touch: "PAUSE", gamepad: { pad: "pause" } },
  back: { keyboard: "ESC", touch: "BACK", gamepad: { pad: "back" } },
  confirm: { keyboard: "ENTER", touch: "TAP", gamepad: { pad: "confirm" } },
  "build-menu": { keyboard: "E", touch: null, gamepad: null },
  "ability-lab": { keyboard: "U", touch: null, gamepad: null },
  "quick-spawn": { keyboard: "1–8", touch: null, gamepad: null },
  "spawn-dummy": { keyboard: "T", touch: null, gamepad: null },
  "summon-boss": { keyboard: "B", touch: null, gamepad: null },
  "clear-enemies": { keyboard: "K", touch: null, gamepad: null },
  heal: { keyboard: "H", touch: null, gamepad: null },
});

export function promptDevice(mode: PromptInputMode): PromptDevice {
  return mode === "touch" ? "touch" : mode === "gamepad" ? "gamepad" : "keyboard";
}

/** The label for one action on one device, or `null` when that device has no direct control for it. */
export function promptLabel(action: PromptAction, device: PromptDevice, padLabel?: PadBindingLabel): string | null {
  const wording = WORDING[action][device];
  if (wording === null) return null;
  if (typeof wording === "string") return wording;
  const resolved = padLabel?.(wording.pad);
  const glyph = resolved === undefined || resolved === "" ? wording.pad.toUpperCase() : resolved;
  return `${wording.prefix ?? ""}${glyph}${wording.suffix ?? ""}`;
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
  return WORDING[action][device] !== null;
}

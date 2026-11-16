import type { InputMode, BrowserGamepad } from "../../input/browser-input-contracts";
import { promptDevice, promptLabels, type PadBindingLabel, type PromptAction } from "../../domain/prompt-vocabulary";

export interface TutorialInputPrompt {
  readonly description: string;
  readonly keys: readonly string[];
}
/** Semantic gold edges are labelled by the active device, never baked into the trace. */
export function tutorialGoldGlyphs(
  actions: readonly string[],
  mode: InputMode,
  gamepad: Pick<BrowserGamepad, "bindingLabel">,
): readonly string[] {
  const keyboard: Readonly<Record<string, string>> = {
    left: "A",
    right: "D",
    up: "W",
    down: "S",
    jump: "SPACE",
    dash: "SHIFT",
    throw: "RMB",
    primary: "LMB",
    swing: "MOUSE SWING",
    aim: "MOUSE AIM",
  };
  const touch: Readonly<Record<string, string>> = {
    left: "MOVE ←",
    right: "MOVE →",
    up: "MOVE ↑",
    down: "MOVE ↓",
    jump: "JUMP",
    dash: "DASH",
    throw: "THROW",
    primary: "HOLD",
    swing: "DRAG SWING",
    aim: "AIM",
  };
  const pad: Readonly<Record<string, string>> = {
    left: "LS ←",
    right: "LS →",
    up: "LS ↑",
    down: "LS ↓",
    jump: gamepad.bindingLabel("jump"),
    dash: gamepad.bindingLabel("dash"),
    throw: gamepad.bindingLabel("throw"),
    primary: gamepad.bindingLabel("tether"),
    swing: "RS SWING",
    aim: "RS AIM",
  };
  const labels = mode === "touch" ? touch : mode === "gamepad" ? pad : keyboard;
  return actions.map((action) => labels[action] ?? action);
}

/**
 * Lesson data still names its controls with the historical key words ("SHIFT",
 * "MOUSE UP", "RMB"); each maps to one semantic prompt action, and the shared prompt
 * vocabulary words it for the device that owns input. No lesson title is ever matched.
 */
const LESSON_KEY_ACTIONS: Readonly<Record<string, PromptAction>> = Object.freeze({
  A: "move-left",
  D: "move-right",
  W: "jump",
  SPACE: "jump",
  SHIFT: "dash",
  "S + SHIFT": "dash-down",
  MOUSE: "swing",
  "MOUSE UP": "swing-up",
  "MOUSE ↑": "swing-up",
  "MOUSE DOWN": "swing-down",
  "MOUSE ↓": "swing-down",
  RMB: "throw",
  LMB: "tether",
});

/** The prompt actions a lesson's key words name, in order, without repeats. */
export function lessonPromptActions(keys: readonly string[]): readonly PromptAction[] {
  const actions: PromptAction[] = [];
  for (const key of keys) {
    const action = LESSON_KEY_ACTIONS[key];
    if (action !== undefined && !actions.includes(action)) actions.push(action);
  }
  // Left and right together read as one control ("A / D", "LEFT STICK").
  const left = actions.indexOf("move-left");
  if (left >= 0 && actions.includes("move-right"))
    return [...actions.slice(0, left), "move", ...actions.slice(left + 1).filter((action) => action !== "move-right")];
  return actions;
}

/** Pad glyphs for the vocabulary: preset actions from the live preset, menu buttons from the glyph style. */
export function padPromptLabel(gamepad: Pick<BrowserGamepad, "bindingLabel" | "glyph">): PadBindingLabel {
  return (binding) =>
    binding === "confirm"
      ? gamepad.glyph(0)
      : binding === "back"
        ? gamepad.glyph(1)
        : binding === "pause"
          ? gamepad.glyph(9)
          : gamepad.bindingLabel(binding);
}

/**
 * Projects a lesson's controls onto the device that currently owns input. The lesson
 * copy stays identical across devices: it describes the player goal, while the key
 * caps describe the active control scheme.
 */
export function tutorialInputPrompt(
  description: string,
  keys: readonly string[],
  mode: InputMode,
  gamepad: Pick<BrowserGamepad, "bindingLabel" | "glyph">,
): TutorialInputPrompt {
  return {
    description,
    keys: promptLabels(lessonPromptActions(keys), promptDevice(mode), padPromptLabel(gamepad)),
  };
}

import type { InputMode, BrowserGamepad } from "../../input/browser-input-contracts";
import { promptDevice, promptLabel, type PadBindingLabel, type PromptAction } from "../../domain/prompt-vocabulary";

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

/** The semantic edges a gold demonstration records, as prompt actions. */
const GOLD_EDGE_ACTIONS: Readonly<Record<string, PromptAction>> = Object.freeze({
  left: "move-left",
  right: "move-right",
  up: "move-up",
  down: "move-down",
  jump: "jump",
  dash: "dash",
  throw: "throw",
  primary: "tether",
  swing: "swing",
  aim: "aim",
});

/** Gold demonstration edges are labelled by the active device, never baked into the trace. */
export function tutorialGoldGlyphs(
  edges: readonly string[],
  mode: InputMode,
  gamepad: Pick<BrowserGamepad, "bindingLabel" | "glyph">,
): readonly string[] {
  const device = promptDevice(mode),
    pad = padPromptLabel(gamepad);
  return edges.map((edge) => {
    const action = GOLD_EDGE_ACTIONS[edge];
    return (action === undefined ? null : promptLabel(action, device, pad)) ?? edge;
  });
}

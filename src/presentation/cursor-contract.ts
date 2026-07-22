import type { InputMode } from "../input/legacy-input-contracts";

export type CursorPresentation = "canvas" | "native" | "hidden";

/**
 * Source-of-truth cursor policy.
 *
 * Menus use Tear's original drawn arrow. Uncaptured gameplay exposes the native
 * cursor so the player can find and click the canvas to reacquire pointer lock.
 * Pointer lock and non-mouse modalities own no cursor at all.
 */
export function resolveCursorPresentation(input: Readonly<{
  readonly screen: string;
  readonly mode: InputMode;
  readonly pointerLocked: boolean;
}>): CursorPresentation {
  if (input.pointerLocked || input.mode !== "mouse") return "hidden";
  return input.screen === "playing" ? "native" : "canvas";
}

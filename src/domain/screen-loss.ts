/**
 * The one rule for "the game lost the screen" (docs/CURSOR_INPUT_CONTRACT.md).
 *
 * A run in play pauses, through the same pause the P key opens, when the player can no longer
 * see or steer it:
 * - the page was hidden or is being left (app switch, screen lock, tab switch, a phone call that
 *   takes the screen), on every device;
 * - the mouse capture the run held was lost (Escape, alt-tab, a system dialog), on desktop;
 * - the window lost focus while touch owns the input (a phone's notification shade or call
 *   banner over a page that stays visible).
 *
 * Window focus alone does not count for a mouse, keyboard or controller: on a desktop it moves to
 * developer tools, a second monitor or a storefront's frame around the game while the player is
 * still watching, and a captured mouse is already covered by the capture rule.
 */
export type ScreenLoss = "hidden" | "capture" | "focus";

export interface ScreenSignals {
  /** The page was hidden, or about to be left, since the last frame. */
  readonly hidden: boolean;
  /** The window lost focus since the last frame. */
  readonly blurred: boolean;
  /** The mouse capture the run held is gone. */
  readonly captureLost: boolean;
  /** Touch owns the input. */
  readonly touch: boolean;
}

/** Why the game lost the screen, or null while it still has it. */
export function screenLoss(signals: ScreenSignals): ScreenLoss | null {
  if (signals.hidden) return "hidden";
  if (signals.captureLost) return "capture";
  if (signals.blurred && signals.touch) return "focus";
  return null;
}

/**
 * Physical legibility and reach floors for every interface surface, in CSS pixels.
 * The canvas is drawn in a fixed logical layout scaled to the window, so screens
 * convert these floors into logical pixels with the live CSS-per-logical scale
 * instead of hard-coding sizes per viewport.
 */
export const INTERFACE_ACCESSIBILITY = Object.freeze({
  /** Smallest text a player must read on a touch device. */
  minTouchTextCssPx: 11,
  /** Smallest tappable control (WCAG 2.5.5 / platform guidance). */
  minTouchTargetCssPx: 44,
});

/** Converts a CSS-pixel size into logical layout pixels at the current scale. */
export function cssToLogical(cssPx: number, cssPerLogicalPixel: number): number {
  const scale = Number.isFinite(cssPerLogicalPixel) && cssPerLogicalPixel > 0 ? cssPerLogicalPixel : 1;
  return Math.ceil(cssPx / scale);
}

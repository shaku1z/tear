/**
 * Source-of-truth cursor policy (game.js@ee5e931):
 * - The drawn ink arrow paints on EVERY non-playing screen, whatever device owns
 *   the UI ("mouse cursor in non-playing screens": `if (state !== "playing") UI.cursor(...)`).
 * - The NATIVE cursor is owned purely by input modality, not by screen: CSS shows it
 *   whenever the mouse owns the UI (`body[data-imode="mouse"] canvas { cursor: default }`),
 *   and pointer lock hides it at the platform level during captured play.
 */
export function shouldDrawCanvasCursor(screen: string): boolean {
  return screen !== "playing";
}

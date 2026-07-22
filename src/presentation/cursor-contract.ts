/**
 * Source-of-truth cursor policy (game.js@ee5e931):
 * - The drawn ink arrow paints on EVERY non-playing screen, whatever device owns
 *   the UI ("mouse cursor in non-playing screens": `if (state !== "playing") UI.cursor(...)`).
 * - The user has explicitly superseded the oracle's native-cursor CSS: Tear owns
 *   the only visible cursor surface. The hardware cursor stays hidden over the
 *   complete game shell, avoiding overlap with the ink arrow and blade reticle.
 */
export function shouldDrawCanvasCursor(screen: string): boolean {
  return screen !== "playing";
}

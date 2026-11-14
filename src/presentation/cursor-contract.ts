import { pointerOwnsInterface, type InputDevice } from "../domain/pointer-ownership";

/**
 * Cursor policy (docs/CURSOR_INPUT_CONTRACT.md):
 * - The drawn ink arrow paints on every non-playing screen while the mouse owns the
 *   interface. The keyboard, a controller and touch own no pointer, so an arrow parked at
 *   the last mouse position would be a stale artifact; it returns with the next meaningful
 *   mouse movement.
 * - Tear owns the only visible cursor surface. The hardware cursor stays hidden over the
 *   complete game shell, avoiding overlap with the ink arrow and blade reticle.
 */
export function shouldDrawCanvasCursor(screen: string, inputMode: InputDevice = "mouse"): boolean {
  return screen !== "playing" && pointerOwnsInterface(inputMode);
}

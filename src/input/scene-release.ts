/**
 * The press that ends a scene belongs to the scene.
 *
 * When a scene that holds the player (a chapter, a boss introduction, the finale) hands control
 * back, every press edge still waiting from that frame is dropped, on every device: the key, tap,
 * click or controller button that dismissed the last line must not also jump, dash or throw.
 * Held movement is kept, so a player already holding a direction moves at once.
 *
 * Presses reach the game two ways: as flags the live loop reads, and as commands queued for the
 * next simulation tick (the replayable stream). Both are cleared, before that tick seals them.
 */
export interface ScenePressState {
  /** Keys that went down this frame (keyboard, and controller buttons mapped to keys). */
  readonly pressed: { clear(): void };
  tJump: boolean;
  tDash: boolean;
  /** The throw edge: right mouse button, the throw key, the touch throw button or the controller's throw. */
  rmb: boolean;
  takeClick(): unknown;
  readonly semantic: { discardPresses(): void };
}

export function discardScenePresses(input: ScenePressState): void {
  input.pressed.clear();
  input.tJump = false;
  input.tDash = false;
  input.rmb = false;
  input.takeClick();
  input.semantic.discardPresses();
}

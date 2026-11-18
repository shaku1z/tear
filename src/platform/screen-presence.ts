/**
 * Remembers that the page was hidden or lost focus until the next frame asks.
 *
 * A hidden page draws no frames, so the frame that runs when the player comes back is the first
 * one that can act; without this latch it would see a visible, focused page and carry on. The
 * rule that decides what counts is `screenLoss` (src/domain/screen-loss.ts).
 */
export interface ScreenPresence {
  /** What happened since the previous call, then forgets it. */
  take(): Readonly<{ hidden: boolean; blurred: boolean }>;
}

interface EventSource {
  addEventListener(type: string, listener: () => void): void;
}

export function createScreenPresence(
  window: EventSource,
  document: EventSource & { readonly hidden?: boolean },
): ScreenPresence {
  let hidden = false;
  let blurred = false;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden === true) hidden = true;
  });
  window.addEventListener("pagehide", () => {
    hidden = true;
  });
  window.addEventListener("blur", () => {
    blurred = true;
  });
  return {
    take() {
      const seen = { hidden, blurred };
      hidden = false;
      blurred = false;
      return seen;
    },
  };
}

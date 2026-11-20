import { touchOnlyDevice } from "../domain/pointer-ownership";

/** The class on `#boot` that shows the computer-only line (index.html). */
export const COMPUTER_ONLY_CLASS = "computer";

/**
 * Production builds leave the touch controls out while mobile is paused (owner, 2026-11-19;
 * plans/MOBILE_LATER.md). On a device whose only pointer is a finger, the loading screen shows
 * one plain line in place of the game, and the game starts as soon as a mouse, trackpad or
 * controller appears. Decided by input capability, never by the user agent: a touchscreen laptop
 * has a fine pointer as well and starts at once.
 */
export function waitForComputerInput(window: Window, document: Document): Promise<void> {
  const matchMedia = (query: string) => window.matchMedia(query);
  if (!touchOnlyDevice(matchMedia)) return Promise.resolve();
  const boot = document.getElementById("boot");
  boot?.classList.add(COMPUTER_ONLY_CLASS);
  return new Promise((resolve) => {
    let fine: MediaQueryList | null = null;
    const start = (): void => {
      fine?.removeEventListener("change", onPointer);
      window.removeEventListener("gamepadconnected", start);
      boot?.classList.remove(COMPUTER_ONLY_CLASS);
      resolve();
    };
    const onPointer = (): void => {
      if (!touchOnlyDevice(matchMedia)) start();
    };
    try {
      fine = window.matchMedia("(any-pointer: fine)");
      fine.addEventListener("change", onPointer);
    } catch {
      fine = null;
    }
    window.addEventListener("gamepadconnected", start);
  });
}

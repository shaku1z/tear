import { describe, expect, it, vi } from "vitest";
import { browserFullscreen } from "../../src/platform/browser";
import { bindFullscreenControls, toggleFullscreen } from "../../src/platform/browser-fullscreen";
import { available, unavailable, type FullscreenService } from "../../src/platform/contracts";

function fakeService(
  active = false,
): FullscreenService & { enter: ReturnType<typeof vi.fn>; exit: ReturnType<typeof vi.fn> } {
  return { active, enter: vi.fn(() => Promise.resolve(true)), exit: vi.fn(() => Promise.resolve(true)) };
}

/** A keydown event in the node test environment, which has Event but no KeyboardEvent. */
function keydown(code: string, init: Partial<Pick<KeyboardEvent, "repeat" | "ctrlKey" | "metaKey">> = {}): Event {
  const event = new Event("keydown", { cancelable: true });
  const fields = { code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...init };
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
  return event;
}

function controls(service: FullscreenService | null, textEntry = false) {
  const windowTarget = new EventTarget();
  const button = new EventTarget();
  bindFullscreenControls({
    document: { getElementById: (id: string) => (id === "fs" ? (button as HTMLElement) : null) },
    window: windowTarget as Window,
    fullscreen: () => (service === null ? unavailable("Fullscreen is managed by CrazyGames.") : available(service)),
    textEntry: () => textEntry,
  });
  return { windowTarget, button };
}

describe("fullscreen owner", () => {
  it("enters fullscreen when nothing is fullscreen and leaves it otherwise", async () => {
    const off = fakeService(false);
    await toggleFullscreen(off);
    expect(off.enter).toHaveBeenCalledTimes(1);
    const on = fakeService(true);
    await toggleFullscreen(on);
    expect(on.exit).toHaveBeenCalledTimes(1);
  });

  it("is unavailable on iPhone Safari, where element fullscreen does not exist", () => {
    expect(browserFullscreen({}).available).toBe(false);
    expect(browserFullscreen({ documentElement: {} }).available).toBe(false);
  });

  it("puts the game wrapper fullscreen and absorbs a refused request", async () => {
    const wrapper = { requestFullscreen: vi.fn(() => Promise.reject(new Error("denied"))) };
    const root = { requestFullscreen: vi.fn(() => Promise.resolve()) };
    const capability = browserFullscreen({
      fullscreenEnabled: true,
      fullscreenElement: null,
      documentElement: root,
      getElementById: (id) => (id === "wrap" ? wrapper : null),
      exitFullscreen: () => Promise.resolve(),
    });
    if (!capability.available) throw new Error("expected fullscreen");
    await expect(capability.service.enter()).resolves.toBe(false);
    expect(wrapper.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(root.requestFullscreen).not.toHaveBeenCalled();
  });
});

describe("fullscreen controls", () => {
  it("toggles from the button and from the F key through the same owner", () => {
    const service = fakeService();
    const { windowTarget, button } = controls(service);
    button.dispatchEvent(new Event("click"));
    const press = keydown("KeyF");
    windowTarget.dispatchEvent(press);
    expect(service.enter).toHaveBeenCalledTimes(2);
    expect(press.defaultPrevented).toBe(true);
  });

  it("ignores key repeat, browser shortcuts and text entry", () => {
    const service = fakeService();
    const { windowTarget } = controls(service);
    windowTarget.dispatchEvent(keydown("KeyF", { repeat: true }));
    windowTarget.dispatchEvent(keydown("KeyF", { ctrlKey: true }));
    windowTarget.dispatchEvent(keydown("KeyF", { metaKey: true }));
    windowTarget.dispatchEvent(keydown("KeyE"));
    expect(service.enter).not.toHaveBeenCalled();
    const typing = controls(service, true);
    typing.windowTarget.dispatchEvent(keydown("KeyF"));
    expect(service.enter).not.toHaveBeenCalled();
  });

  it("does nothing, and leaves the key to the page, where the platform owns fullscreen", () => {
    const { windowTarget, button } = controls(null);
    const press = keydown("KeyF");
    windowTarget.dispatchEvent(press);
    button.dispatchEvent(new Event("click"));
    expect(press.defaultPrevented).toBe(false);
  });
});

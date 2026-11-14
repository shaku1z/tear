import { describe, expect, it, vi } from "vitest";
import { toggleFullscreen } from "../../src/platform/browser-fullscreen";

describe("toggleFullscreen", () => {
  it("enters fullscreen when nothing is fullscreen and leaves it otherwise", () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const exitFullscreen = vi.fn(() => Promise.resolve());
    toggleFullscreen({ fullscreenElement: null, exitFullscreen }, { requestFullscreen });
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    toggleFullscreen({ fullscreenElement: {} as Element, exitFullscreen }, { requestFullscreen });
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("does nothing on iPhone Safari, where element fullscreen does not exist", () => {
    expect(() => {
      toggleFullscreen({}, {});
    }).not.toThrow();
  });

  it("absorbs a refused or throwing request", async () => {
    const refused = Promise.reject(new Error("denied"));
    toggleFullscreen({ fullscreenElement: null }, { requestFullscreen: () => refused });
    await expect(refused.catch(() => "handled")).resolves.toBe("handled");
    expect(() => {
      toggleFullscreen(
        { fullscreenElement: null },
        {
          requestFullscreen: () => {
            throw new TypeError("not allowed");
          },
        },
      );
    }).not.toThrow();
  });
});

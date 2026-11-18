import { describe, expect, it } from "vitest";
import { screenLoss } from "../../src/domain/screen-loss";
import { createScreenPresence } from "../../src/platform/screen-presence";

const none = { hidden: false, blurred: false, captureLost: false, touch: false };

describe("screenLoss", () => {
  it("names the first reason the game lost the screen", () => {
    expect(screenLoss(none)).toBeNull();
    expect(screenLoss({ ...none, hidden: true })).toBe("hidden");
    expect(screenLoss({ ...none, hidden: true, touch: true })).toBe("hidden");
    expect(screenLoss({ ...none, captureLost: true })).toBe("capture");
    expect(screenLoss({ ...none, blurred: true })).toBeNull();
    expect(screenLoss({ ...none, blurred: true, touch: true })).toBe("focus");
  });
});

describe("createScreenPresence", () => {
  function source() {
    const listeners = new Map<string, () => void>();
    return {
      hidden: false,
      addEventListener(type: string, listener: () => void) {
        listeners.set(type, listener);
      },
      fire(type: string) {
        listeners.get(type)?.();
      },
    };
  }

  it("remembers a hide, a page exit or a lost focus until the next frame takes it", () => {
    const window = source();
    const document = source();
    const presence = createScreenPresence(window, document);
    expect(presence.take()).toEqual({ hidden: false, blurred: false });
    document.hidden = true;
    document.fire("visibilitychange");
    document.hidden = false;
    document.fire("visibilitychange");
    expect(presence.take(), "a hide the frames never saw still counts").toEqual({ hidden: true, blurred: false });
    expect(presence.take()).toEqual({ hidden: false, blurred: false });
    window.fire("pagehide");
    window.fire("blur");
    window.fire("focus");
    expect(presence.take()).toEqual({ hidden: true, blurred: true });
  });
});

import { describe, expect, it } from "vitest";
import {
  accumulateRelativeTravel,
  MEANINGFUL_POINTER_TRAVEL,
  NO_POINTER,
  ownedPointer,
  pointerOwnsInterface,
  POINTER_GESTURE_GAP_MS,
  startsOnTouch,
  type InputDevice,
} from "../../src/domain/pointer-ownership";
import { shouldDrawCanvasCursor } from "../../src/presentation/cursor-contract";

const DEVICES: readonly InputDevice[] = ["mouse", "keyboard", "gamepad", "touch"];
const SCREENS = ["menu", "setup", "draft", "reserve", "tierup", "paused", "gameover", "win", "settings"];

describe("pointer ownership", () => {
  it("gives the pointer to the mouse alone", () => {
    expect(DEVICES.filter(pointerOwnsInterface)).toEqual(["mouse"]);
  });

  it("reports a position only while the mouse owns the interface and is over the canvas", () => {
    expect(ownedPointer("mouse", true, 120, 80)).toEqual({ x: 120, y: 80 });
    expect(ownedPointer("mouse", false, 120, 80)).toBeNull();
    for (const device of DEVICES.filter((entry) => entry !== "mouse")) {
      expect(ownedPointer(device, true, 120, 80), device).toBeNull();
    }
  });

  it("draws the canvas arrow on every non-playing screen for the mouse and for no other device", () => {
    for (const screen of SCREENS) {
      for (const device of DEVICES) {
        expect(shouldDrawCanvasCursor(screen, device), `${screen} ${device}`).toBe(device === "mouse");
      }
    }
    for (const device of DEVICES) expect(shouldDrawCanvasCursor("playing", device)).toBe(false);
  });

  it("keeps the placeholder point outside every control", () => {
    expect(NO_POINTER.x).toBeLessThan(-10_000);
    expect(NO_POINTER.y).toBeLessThan(-10_000);
  });

  it("starts on touch only where the primary pointer is coarse", () => {
    const media = (coarse: boolean) => (query: string) => ({ matches: query === "(pointer: coarse)" && coarse });
    expect(startsOnTouch(media(true))).toBe(true);
    expect(startsOnTouch(media(false))).toBe(false);
    expect(startsOnTouch(undefined)).toBe(false);
    expect(
      startsOnTouch(() => {
        throw new Error("unsupported");
      }),
    ).toBe(false);
  });
});

describe("relative mouse travel under pointer lock", () => {
  const still = { distance: 0, at: 0 };

  it("ignores sensor noise", () => {
    let travel = still;
    for (let event = 0; event < 20; event += 1) {
      // One pixel of jitter now and then, further apart than one gesture.
      const step = accumulateRelativeTravel(travel, 1, 0, event * (POINTER_GESTURE_GAP_MS + 50));
      expect(step.meaningful).toBe(false);
      travel = step.travel;
    }
  });

  it("counts a slow continuous movement once it passes the threshold", () => {
    let travel = still;
    const results: boolean[] = [];
    for (let event = 1; event <= MEANINGFUL_POINTER_TRAVEL + 1; event += 1) {
      const step = accumulateRelativeTravel(travel, 1, 0, event * 16);
      results.push(step.meaningful);
      travel = step.travel;
    }
    expect(results.slice(0, MEANINGFUL_POINTER_TRAVEL).every((meaningful) => !meaningful)).toBe(true);
    expect(results.at(-1)).toBe(true);
    expect(travel.distance).toBe(0);
  });

  it("counts one fast movement at once", () => {
    expect(accumulateRelativeTravel(still, 4, 4, 1_000).meaningful).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { readTouchAimStick } from "../../src/input/touch-aim-stick";

const shape = { reach: 130, dead: 10 };
const anchor = { x: 600, y: 300 };

describe("touch aim stick", () => {
  it("keeps the aim the blade already had while a new touch rests in the dead zone", () => {
    const landed = readTouchAimStick(shape, anchor, { x: 604, y: 303 }, false);
    expect(landed.aim).toBeNull();
    expect(landed.engaged).toBe(false);
    expect(landed.anchor).toEqual(anchor);
  });

  it("aims the way the thumb moves once it leaves the dead zone, then reads from the same anchor", () => {
    const pushed = readTouchAimStick(shape, anchor, { x: 600 + 70, y: 300 }, false);
    expect(pushed.engaged).toBe(true);
    expect(pushed.aim?.x).toBeCloseTo(0.5, 5);
    expect(pushed.aim?.y).toBeCloseTo(0, 5);
    // back to the anchor in the same touch: the stick is centred, as any stick is
    const back = readTouchAimStick(shape, pushed.anchor, { x: 602, y: 300 }, pushed.engaged);
    expect(back.aim).toEqual({ x: 0, y: 0 });
  });

  it("reaches full deflection at its reach and follows a thumb that goes well past it", () => {
    expect(readTouchAimStick(shape, anchor, { x: 600, y: 300 - 130 }, false).aim?.y).toBeCloseTo(-1, 5);
    const far = readTouchAimStick(shape, anchor, { x: 600 + 300, y: 300 }, true);
    expect(far.anchor.x).toBeCloseTo(900 - 130 * 1.3, 5);
    expect(far.aim?.x).toBeCloseTo(1, 5);
  });
});

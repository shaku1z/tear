import { describe, expect, it } from "vitest";
import { enabledButtonIndexes, findDirectionalFocus } from "../../src/app/ui-navigation";

describe("canvas UI navigation", () => {
  const buttons = [
    { x: 0, y: 0, w: 100, h: 40 },
    { x: 120, y: 0, w: 100, h: 40 },
    { x: 0, y: 60, w: 100, h: 40 },
    { x: 120, y: 60, w: 100, h: 40, enabled: false },
  ] as const;

  it("filters disabled controls without changing declaration order", () => {
    expect(enabledButtonIndexes(buttons)).toEqual([0, 1, 2]);
  });

  it("moves spatially through an irregular grid", () => {
    const enabled = enabledButtonIndexes(buttons);
    expect(findDirectionalFocus(buttons, enabled, 0, "right")).toBe(1);
    expect(findDirectionalFocus(buttons, enabled, 0, "down")).toBe(2);
    expect(findDirectionalFocus(buttons, enabled, 1, "down")).toBe(2);
    expect(findDirectionalFocus(buttons, enabled, 0, "left")).toBeNull();
  });

  it("fails closed for a stale focus index", () => {
    expect(findDirectionalFocus(buttons, [0, 1, 2], 99, "down")).toBeNull();
  });
});

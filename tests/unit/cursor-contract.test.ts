import { describe, expect, it } from "vitest";
import { mapClientPointerToLogical } from "../../src/input/pointer-coordinate";
import { shouldDrawCanvasCursor } from "../../src/presentation/cursor-contract";

describe("cursor source-of-truth contract", () => {
  it("draws the ink arrow on every non-playing screen and never during play", () => {
    for (const screen of ["menu", "setup", "draft", "reserve", "tierup", "paused", "gameover", "win", "settings"]) {
      expect(shouldDrawCanvasCursor(screen)).toBe(true);
    }
    expect(shouldDrawCanvasCursor("playing")).toBe(false);
  });

  it("maps standard and ultrawide browser points into the fixed arena", () => {
    const standard = mapClientPointerToLogical(
      { clientX: 800, clientY: 450 },
      { left: 0, top: 0, width: 1_600, height: 900 },
      { width: 1_600, height: 900, overscanX: 0, overscanY: 0 },
    );
    expect(standard).toEqual({ x: 800, y: 450 });

    const ultrawide = mapClientPointerToLogical(
      { clientX: 480, clientY: 400 },
      { left: 0, top: 0, width: 1_920, height: 800 },
      { width: 1_600, height: 900, overscanX: 280, overscanY: 0 },
    );
    expect(ultrawide.x).toBeCloseTo(260);
    expect(ultrawide.y).toBeCloseTo(450);
  });
});

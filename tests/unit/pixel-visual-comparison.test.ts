import { describe, expect, it } from "vitest";

import { comparePixelVisuals, type TearPixelFrame } from "../../src/agents";

function frame(width: number, height: number, paint: (rgba: Uint8Array) => void): TearPixelFrame {
  const rgba = new Uint8Array(width * height * 4);
  for (let offset = 3; offset < rgba.length; offset += 4) rgba[offset] = 255;
  paint(rgba);
  return { width, height, rgba, capturedAtMs: 0 };
}

function rectangle(rgba: Uint8Array, width: number, x: number, y: number, rectangleWidth: number, rectangleHeight: number, value: number): void {
  for (let row = y; row < y + rectangleHeight; row += 1) for (let column = x; column < x + rectangleWidth; column += 1) {
    const offset = (row * width + column) * 4;
    rgba[offset] = value; rgba[offset + 1] = value; rgba[offset + 2] = value;
  }
}

describe("pixel visual comparison", () => {
  it("uses perceptual normalized samples instead of requiring raw screenshot equality", () => {
    const reference = frame(40, 40, (rgba) => { rectangle(rgba, 40, 10, 10, 20, 20, 180); });
    const exposureShifted = frame(40, 40, (rgba) => { rectangle(rgba, 40, 10, 10, 20, 20, 200); });
    const comparison = comparePixelVisuals(reference, exposureShifted);
    expect(comparison.perceptualSimilarity).toBeGreaterThan(0.98);
    expect(comparison.dimensionsMatch).toBe(true);
  });

  it("reports a localized visual difference independently from whole-frame similarity", () => {
    const reference = frame(80, 80, (rgba) => { rectangle(rgba, 80, 8, 8, 16, 16, 255); });
    const changed = frame(80, 80, (rgba) => { rectangle(rgba, 80, 56, 56, 16, 16, 255); });
    const comparison = comparePixelVisuals(reference, changed, { regions: [{ name: "top-left", x: 0, y: 0, width: 0.5, height: 0.5 }] });
    expect(comparison.perceptualSimilarity).toBeGreaterThan(comparison.regions[0]?.perceptualSimilarity ?? 1);
    expect(comparison.regions[0]?.perceptualSimilarity).toBeLessThan(0.9);
  });

  it("compares scaled captures in normalized image space", () => {
    const small = frame(20, 20, (rgba) => { rectangle(rgba, 20, 5, 5, 10, 10, 255); });
    const large = frame(40, 40, (rgba) => { rectangle(rgba, 40, 10, 10, 20, 20, 255); });
    const comparison = comparePixelVisuals(small, large, { samplesPerAxis: 20 });
    expect(comparison.dimensionsMatch).toBe(false);
    expect(comparison.perceptualSimilarity).toBeGreaterThan(0.99);
  });

  it("rejects regions outside normalized image space", () => {
    const source = frame(10, 10, () => undefined);
    expect(() => comparePixelVisuals(source, source, { regions: [{ name: "bad", x: 0.9, y: 0, width: 0.2, height: 0.1 }] })).toThrow(RangeError);
  });
});

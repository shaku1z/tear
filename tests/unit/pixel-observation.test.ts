import { describe, expect, it } from "vitest";

import { TearPixelTemporalTracker, calibratePixelViewport, detectBrightPixelRegions, detectPixelMotionRegions, observePixels, type TearPixelFrame } from "../../src/agents";

function frame(width: number, height: number, paint: (pixels: Uint8Array) => void, capturedAtMs = 0): TearPixelFrame {
  const rgba = new Uint8Array(width * height * 4);
  paint(rgba);
  return { width, height, rgba, capturedAtMs };
}

function rect(pixels: Uint8Array, width: number, x: number, y: number, w: number, h: number, value = 255): void {
  for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) {
    const offset = (yy * width + xx) * 4;
    pixels[offset] = value; pixels[offset + 1] = value; pixels[offset + 2] = value; pixels[offset + 3] = 255;
  }
}

function outlinedRect(pixels: Uint8Array, width: number, x: number, y: number, w: number, h: number): void {
  rect(pixels, width, x, y, w, 1); rect(pixels, width, x, y + h - 1, w, 1);
  rect(pixels, width, x, y, 1, h); rect(pixels, width, x + w - 1, y, 1, h);
}

function opaque(pixels: Uint8Array): void {
  for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 255;
}

describe("C25 pixel-only observation", () => {
  it("calibrates a visible render surface without DOM geometry", () => {
    const source = frame(20, 10, (pixels) => { rect(pixels, 20, 3, 2, 14, 6); });
    expect(calibratePixelViewport(source, { logicalWidth: 14, logicalHeight: 6 })).toMatchObject({
      bounds: { x: 3, y: 2, width: 14, height: 6 }, scaleX: 1, scaleY: 1, confidence: 0.42,
    });
  });

  it("finds visible affordance regions and derives a labeled visual observation", () => {
    const source = frame(100, 90, (pixels) => {
      rect(pixels, 100, 40, 4, 20, 4); rect(pixels, 100, 25, 36, 50, 8); rect(pixels, 100, 25, 52, 50, 8); rect(pixels, 100, 25, 68, 50, 8);
    });
    const calibration = calibratePixelViewport(source, { logicalWidth: 100, logicalHeight: 90 });
    expect(detectBrightPixelRegions(source, calibration, { minimumRegionPixels: 8 })).toHaveLength(4);
    expect(observePixels(source, { logicalWidth: 100, logicalHeight: 90, minimumRegionPixels: 8 })).toMatchObject({ kind: "menu-like" });
  });

  it("recognises a generic row of visual reward cards without reading choice data", () => {
    const source = frame(100, 90, (pixels) => {
      opaque(pixels);
      rect(pixels, 100, 34, 6, 6, 3);
      for (const x of [5, 28, 51, 74]) rect(pixels, 100, x, 24, 18, 36);
    });
    expect(observePixels(source, { logicalWidth: 100, logicalHeight: 90, minimumRegionPixels: 8 })).toMatchObject({ kind: "draft-like" });
  });

  it("recognises a generic terminal layout from title marks and visual action panels", () => {
    const source = frame(200, 180, (pixels) => {
      opaque(pixels);
      for (const x of [60, 76, 92, 108, 124]) rect(pixels, 200, x, 10, 8, 8);
      outlinedRect(pixels, 200, 76, 78, 44, 5);
      outlinedRect(pixels, 200, 76, 102, 44, 5);
    });
    expect(observePixels(source, { logicalWidth: 200, logicalHeight: 180, minimumRegionPixels: 4 })).toMatchObject({ kind: "terminal-like" });
  });

  it("tracks temporal stability and flags abrupt visual occlusion", () => {
    const stable = frame(32, 32, (pixels) => { rect(pixels, 32, 10, 10, 8, 8); }, 1);
    const changed = frame(32, 32, (pixels) => { rect(pixels, 32, 0, 0, 32, 32); }, 2);
    const tracker = new TearPixelTemporalTracker({ logicalWidth: 32, logicalHeight: 32 });
    expect(tracker.observe(stable)).toMatchObject({ trackedFrames: 1, stable: false, occluded: false });
    expect(tracker.observe(stable)).toMatchObject({ trackedFrames: 2, stable: true, occluded: false });
    expect(tracker.observe(changed)).toMatchObject({ stable: false, occluded: true });
  });

  it("reports moving visual regions without assigning game entities or reading UI state", () => {
    const opaqueBackground = (pixels: Uint8Array): void => {
      for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 255;
    };
    const previous = frame(40, 40, (pixels) => { opaqueBackground(pixels); rect(pixels, 40, 4, 12, 10, 10, 100); }, 1);
    const next = frame(40, 40, (pixels) => { opaqueBackground(pixels); rect(pixels, 40, 20, 12, 10, 10, 220); }, 2);
    const calibration = calibratePixelViewport(next, { logicalWidth: 40, logicalHeight: 40 });
    const world = detectPixelMotionRegions(previous, next, calibration);
    expect(world.motionEnergy).toBeGreaterThan(0.05);
    expect(world.motionRegions).toEqual(expect.arrayContaining([
      expect.objectContaining({ x: 4, y: 12 }),
      expect.objectContaining({ x: 20, y: 12 }),
    ]));
  });
});

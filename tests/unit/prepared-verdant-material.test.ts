import { describe, expect, it, vi } from "vitest";
import {
  createPreparedVerdantMaterial,
  VERDANT_MATERIAL_RECEIPT,
} from "../../src/presentation/platform-materials/prepared-verdant-material";
import type { CalibrationBitmap } from "../../src/presentation/prepared-verdant-calibration";
import overscanPackage from "../../src/presentation/assets/verdant-calibration/overscan-package.json";
import { VERDANT_SCENE_MAX_DECODED_BYTES } from "../../src/presentation/verdant-scene-package";

function image(): CalibrationBitmap {
  return { image: {} as CanvasImageSource, width: 256, height: 85, encodedBytes: 1640176, close: vi.fn() };
}
function canvas() {
  const drawImage = vi.fn();
  return {
    drawImage,
    context: {
      drawImage,
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D,
  };
}

describe("prepared Verdant moss-stone material", () => {
  it("fits the existing combined resident bitmap budget without modifying scenery", () => {
    const sceneBytes = overscanPackage.assets.reduce((sum, asset) => sum + asset.width * asset.height * 4, 0);
    expect(sceneBytes + VERDANT_MATERIAL_RECEIPT.decodedBytes).toBe(8384432);
    expect(sceneBytes + VERDANT_MATERIAL_RECEIPT.decodedBytes).toBeLessThanOrEqual(VERDANT_SCENE_MAX_DECODED_BYTES);
  });

  it("prepares once, samples distinct ledge/ground depths, and tiles without horizontal stretching", async () => {
    const bitmap = image(),
      load = vi.fn().mockResolvedValue(bitmap);
    const owner = createPreparedVerdantMaterial("material", load),
      output = canvas();
    expect(owner.draw(output.context, { x: 20, y: 30, w: 600, h: 24 }, false)).toBe(false);
    await Promise.all([owner.prepare(), owner.prepare()]);
    expect(load).toHaveBeenCalledTimes(1);
    const rectangle = Object.freeze({ x: 20, y: 30, w: 600, h: 24 });
    expect(owner.draw(output.context, rectangle, false)).toBe(true);
    expect(output.drawImage).toHaveBeenCalledTimes(3);
    expect(output.drawImage).toHaveBeenNthCalledWith(1, bitmap.image, 0, 0, 256, 24, 0, 30, 256, 24);
    output.drawImage.mockClear();
    owner.draw(output.context, { x: 0, y: 775, w: 1600, h: 400 }, true);
    expect(output.drawImage.mock.calls[0]?.slice(1)).toEqual([0, 0, 256, 85, 0, 775, (256 * 128) / 85, 128]);
    expect(output.drawImage.mock.calls.length).toBeLessThanOrEqual(6);
    expect(load).toHaveBeenCalledTimes(1);
    owner.dispose();
    owner.dispose();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(owner.status()).toBe("disposed");
    expect(owner.draw(output.context, rectangle, false)).toBe(false);
  });

  it("closes invalid or late bitmaps and leaves failures on the procedural fallback", async () => {
    const invalid = { ...image(), width: 2172 },
      output = canvas();
    const owner = createPreparedVerdantMaterial("material", () => Promise.resolve(invalid));
    await owner.prepare();
    expect(owner.status()).toBe("failed");
    expect(invalid.close).toHaveBeenCalledTimes(1);
    expect(owner.draw(output.context, { x: 0, y: 0, w: 200, h: 24 }, false)).toBe(false);
    let resolve!: (bitmap: CalibrationBitmap) => void;
    const late = image();
    const abandoned = createPreparedVerdantMaterial(
      "material",
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = abandoned.prepare();
    abandoned.dispose();
    resolve(late);
    await pending;
    expect(abandoned.status()).toBe("disposed");
    expect(late.close).toHaveBeenCalledTimes(1);
    const failed = createPreparedVerdantMaterial("material", () => Promise.reject(new Error("decode")));
    await failed.prepare();
    expect(failed.status()).toBe("failed");
  });

  it("rejects invalid rectangles and excessive tiling without drawing or loading", async () => {
    const load = vi.fn().mockResolvedValue(image());
    const owner = createPreparedVerdantMaterial("material", load),
      output = canvas();
    await owner.prepare();
    for (const rectangle of [
      { x: NaN, y: 0, w: 240, h: 24 },
      { x: 0, y: 0, w: Infinity, h: 24 },
      { x: 0, y: 0, w: 240, h: 0 },
      { x: 0, y: 0, w: 100000, h: 1 },
    ]) {
      expect(owner.draw(output.context, rectangle, false)).toBe(false);
    }
    expect(output.drawImage).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

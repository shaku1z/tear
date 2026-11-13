import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreparedVerdantCalibration, loadCalibrationBitmap, verdantTailFrame, verdantFoliageOffset, type CalibrationBitmap, type CalibrationLoader } from "../../src/presentation/prepared-verdant-calibration";
import { createVerdantWaterFlow } from "../../src/presentation/verdant-water-flow";
import { validateVerdantScenePackage } from "../../src/presentation/verdant-scene-package";
import controlPackage from "../../src/presentation/assets/verdant-calibration/control-package.json";
import scenePackage from "../../src/presentation/assets/verdant-calibration/scene-package.json";
import overscanPackage from "../../src/presentation/assets/verdant-calibration/overscan-package.json";
import livingPackage from "../../src/presentation/assets/verdant-calibration/living-stage-package.json";

const controlUrls = { "control-top": "top", "control-bottom": "bottom" } as const;
const layerUrls = { "support-top": "top", "support-bottom": "bottom", tail: "tail" } as const;

function tile(height: number): CalibrationBitmap {
  return { image: {} as CanvasImageSource, width: 1672, height, encodedBytes: 100, close: vi.fn() };
}

describe("prepared Verdant calibration ownership", () => {
  class MockPath2D {
    moveTo = vi.fn(); lineTo = vi.fn(); closePath = vi.fn();
  }
  beforeEach(() => { vi.stubGlobal("Path2D", MockPath2D); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it("refracts the inlet mesh from the existing backing and freezes with accessibility gates", async () => {
    const manifest = validateVerdantScenePackage(livingPackage);
    const urls = Object.fromEntries(manifest.assets.map((asset) => [asset.key, asset.key]));
    const bitmaps = manifest.assets.map((asset) => ({ ...tile(asset.height), width: asset.width }));
    const load = vi.fn();
    for (const bitmap of bitmaps) load.mockResolvedValueOnce(bitmap);
    const owner = createPreparedVerdantCalibration(livingPackage, urls, load);
    await owner.prepare();
    const drawImage = vi.fn(), clip = vi.fn(), stroke = vi.fn();
    const context = { save: vi.fn(), restore: vi.fn(), scale: vi.fn(), transform: vi.fn(), drawImage, clip,
      stroke, beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), ellipse: vi.fn(), quadraticCurveTo: vi.fn() } as unknown as CanvasRenderingContext2D;
    owner.draw(context, 836, 1, true, 1);
    const poolDraws = () => drawImage.mock.calls.filter((call) => call[0] === bitmaps[7]?.image && call.length === 9);
    const triangles = createVerdantWaterFlow().cellCount * 2;
    expect(poolDraws()).toHaveLength(triangles);
    expect(poolDraws().every((call) => call[1] === call[5] && Number(call[2]) + 471 === call[6]
      && call[3] === (Number(call[1]) < 1110 ? 64 : 32) && call[4] === 8
      && call[7] === call[3] && call[8] === 8)).toBe(true);
    expect(poolDraws().some((call) => Number(call[1]) < 500)).toBe(true);
    expect(poolDraws().some((call) => Number(call[1]) > 1300)).toBe(true);
    expect(clip).toHaveBeenCalledTimes(triangles + 2);
    expect(clip.mock.calls[0]?.[1]).toBe("evenodd");
    expect(stroke.mock.calls.length).toBeGreaterThan(24);
    for (const [motion, flash] of [[false, 1], [true, 0]] as const) {
      drawImage.mockClear(); stroke.mockClear();
      owner.draw(context, 1672, 1, motion, flash);
      expect(poolDraws()).toHaveLength(0);
      expect(stroke).not.toHaveBeenCalled();
    }
    expect(load).toHaveBeenCalledTimes(9);
    owner.dispose();
  });
  it.each([3, 8])("releases living-stage resources if asset %s fails to prepare", async (failureIndex) => {
    const manifest = validateVerdantScenePackage(livingPackage);
    const urls = Object.fromEntries(manifest.assets.map((asset) => [asset.key, asset.key]));
    const bitmaps = manifest.assets.slice(0, failureIndex).map((asset) => ({ ...tile(asset.height), width: asset.width }));
    const load = vi.fn();
    for (const bitmap of bitmaps) load.mockResolvedValueOnce(bitmap);
    load.mockRejectedValueOnce(new Error("Injected living-stage decode failure"));
    const owner = createPreparedVerdantCalibration(livingPackage, urls, load);
    await owner.prepare();
    expect(owner.report()).toMatchObject({ status: "failed", fallbackActive: true, decodedResources: 0, decodedBytes: 0 });
    expect(load).toHaveBeenCalledTimes(failureIndex + 1);
    owner.dispose();
    for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])("prepares bounded peripheral leaf shading and closes the decoded input (context=%s)", async (available) => {
    const original = { width: 1672, height: 623, close: vi.fn() };
    const shaded = { width: 1672, height: 623, close: vi.fn() };
    const addColorStop = vi.fn(), drawImage = vi.fn(), fillRect = vi.fn();
    const context = { createLinearGradient: vi.fn(() => ({ addColorStop })), drawImage, fillRect,
      globalCompositeOperation: "source-over", fillStyle: {} };
    const transfer = vi.fn(() => shaded);
    const surfaces: { width: number; height: number }[] = [];
    vi.stubGlobal("OffscreenCanvas", class {
      width = 1672; height = 623;
      constructor() { surfaces.push(this); }
      getContext() { return available ? context : null; }
      transferToImageBitmap = transfer;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["abc"]))));
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(original));
    const foliageAsset = validateVerdantScenePackage(livingPackage).assets[8];
    if (!foliageAsset) throw new Error("Missing foliage test asset");
    const asset = { ...foliageAsset,
      sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" };
    try {
      const pending = loadCalibrationBitmap("foliage", new AbortController().signal, asset);
      if (available) {
        const result = await pending;
        expect(result.image).toBe(shaded);
        expect(context.globalCompositeOperation).toBe("source-atop");
        expect(drawImage).toHaveBeenCalledExactlyOnceWith(original, 0, 0);
        expect(addColorStop).toHaveBeenCalledWith(.5, "rgba(0,0,0,0.06)");
        expect(addColorStop).toHaveBeenCalledWith(0, "rgba(0,0,0,0.28)");
        expect(fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 1672, 623);
        expect(result.encodedBytes).toBe(3);
        result.close(); expect(shaded.close).toHaveBeenCalledTimes(1);
      } else {
        await expect(pending).rejects.toThrow("lighting context");
        expect(transfer).not.toHaveBeenCalled();
      }
      expect(original.close).toHaveBeenCalledTimes(1);
      expect(surfaces[0]).toMatchObject({ width: 1, height: 1 });
    } finally { vi.unstubAllGlobals(); }
  });
  it("draws and isolates full foliage above the structural backing without allocating during draw", async () => {
    const manifest = validateVerdantScenePackage(livingPackage);
    const urls = Object.fromEntries(manifest.assets.map((asset) => [asset.key, asset.key]));
    const bitmaps = manifest.assets.map((asset) => ({ ...tile(asset.height), width: asset.width }));
    const load = vi.fn();
    for (const bitmap of bitmaps) load.mockResolvedValueOnce(bitmap);
    const owner = createPreparedVerdantCalibration(livingPackage, urls, load);
    const drawImage = vi.fn();
    const clip = vi.fn(), scale = vi.fn();
    const context = { save: vi.fn(), restore: vi.fn(), drawImage, clip, scale } as unknown as CanvasRenderingContext2D;
    await owner.prepare();
    owner.draw(context, 1672, 100, false);
    expect(drawImage).toHaveBeenCalledTimes(11);
    expect(drawImage).toHaveBeenNthCalledWith(9, bitmaps[8]?.image, 0, 0, 1672, 623);
    expect(drawImage).toHaveBeenNthCalledWith(10, bitmaps[6]?.image, 0, 0, 1672, 471);
    expect(drawImage).toHaveBeenLastCalledWith(bitmaps[7]?.image, 0, 471, 1672, 470);
    expect(clip).toHaveBeenCalledTimes(1);
    expect(clip.mock.calls[0]?.[0]).toBeInstanceOf(MockPath2D);
    expect(clip.mock.calls[0]?.[1]).toBe("evenodd");
    const preparedPath = clip.mock.calls[0]?.[0] as MockPath2D;
    expect(preparedPath.closePath).toHaveBeenCalledTimes(42);
    drawImage.mockClear(); owner.setDiagnosticView("foliage-only"); owner.draw(context, 836);
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(bitmaps[8]?.image, 0, 0, 836, 311.5);
    drawImage.mockClear(); owner.setDiagnosticView("support-only"); owner.draw(context, 1672);
    expect(drawImage).toHaveBeenCalledTimes(8);
    owner.setDiagnosticView("composite"); owner.draw(context, 836);
    expect(clip).toHaveBeenLastCalledWith(preparedPath, "evenodd");
    expect(scale).toHaveBeenLastCalledWith(.5, .5);
    expect(preparedPath.closePath).toHaveBeenCalledTimes(42);
    expect(load).toHaveBeenCalledTimes(9);
    expect(owner.report()).toMatchObject({ packageId: "verdant-living-stage-prototype", decodedResources: 9, decodedBytes: 12359040, fallbackActive: false });
    owner.dispose();
    for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
  it("anchors foliage and bounds independent sway while reduced motion restores the single neutral draw", async () => {
    for (const group of [0, 1]) {
      expect(verdantFoliageOffset(80, 1, group, "live")).toBe(0);
      expect(verdantFoliageOffset(623, 1, group, "maximum")).toBe(12);
      expect(verdantFoliageOffset(623, 1, group, "minimum")).toBe(-12);
      expect(verdantFoliageOffset(623, 1, group, "neutral")).toBe(0);
    }
    expect(verdantFoliageOffset(480, 0, 0, "live")).not.toBe(verdantFoliageOffset(480, 0, 1, "live"));
    const manifest = validateVerdantScenePackage(livingPackage);
    const urls = Object.fromEntries(manifest.assets.map((asset) => [asset.key, asset.key]));
    const load = vi.fn<CalibrationLoader>((_url, _signal, asset) => Promise.resolve({ ...tile(asset.height), width: asset.width }));
    const owner = createPreparedVerdantCalibration(livingPackage, urls, load);
    await owner.prepare(); owner.setDiagnosticView("foliage-only");
    const drawImage = vi.fn(), transform = vi.fn();
    const context = { save: vi.fn(), restore: vi.fn(), drawImage, transform } as unknown as CanvasRenderingContext2D;
    owner.draw(context, 1672, 1, true);
    expect(drawImage).toHaveBeenCalledTimes(69);
    expect(transform).toHaveBeenCalledTimes(68);
    expect(drawImage.mock.calls[0]?.slice(1)).toEqual([0, 0, 1672, 80, 0, 0, 1672, 80]);
    drawImage.mockClear(); transform.mockClear();
    owner.draw(context, 1672, 1, false);
    expect(drawImage).toHaveBeenCalledTimes(1); expect(transform).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(9);
    owner.dispose();
  });
  it("loads nine IN3 resources once, preserves core placement, and releases every bitmap", async () => {
    const manifest = validateVerdantScenePackage(overscanPackage);
    const urls = Object.fromEntries(manifest.assets.map((asset) => [asset.key, asset.key]));
    const bitmaps = manifest.assets.map((asset) => ({ ...tile(asset.height), width: asset.width }));
    const load = vi.fn();
    for (const bitmap of bitmaps) load.mockResolvedValueOnce(bitmap);
    const owner = createPreparedVerdantCalibration(overscanPackage, urls, load);
    const drawImage = vi.fn();
    const context = { save: vi.fn(), restore: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D;
    await Promise.all([owner.prepare(), owner.prepare()]);
    owner.draw(context, 1672);
    expect(drawImage).toHaveBeenCalledTimes(9);
    expect(drawImage).toHaveBeenNthCalledWith(1, bitmaps[0]?.image, -384, -1408, 1220, 1408);
    expect(drawImage).toHaveBeenNthCalledWith(7, bitmaps[6]?.image, 0, 0, 1672, 471);
    expect(drawImage).toHaveBeenNthCalledWith(8, bitmaps[7]?.image, 0, 471, 1672, 470);
    expect(load).toHaveBeenCalledTimes(9);
    expect(owner.report()).toMatchObject({ decodedResources: 9, decodedBytes: 8297392, fallbackActive: false });
    owner.dispose(); owner.dispose();
    for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(owner.report()).toMatchObject({ decodedResources: 0, decodedBytes: 0 });
  });
  it("samples anchored poses without retained time and clips glints to their water receiver", async () => {
    const manifest = validateVerdantScenePackage(overscanPackage);
    const urls = Object.fromEntries(manifest.assets.map((asset) => [asset.key, asset.key]));
    const load = vi.fn<CalibrationLoader>((_url, _signal, asset) => Promise.resolve({ ...tile(asset.height), width: asset.width }));
    const owner = createPreparedVerdantCalibration(overscanPackage, urls, load);
    await owner.prepare();
    const drawImage = vi.fn(), clip = vi.fn(), stroke = vi.fn();
    const context = new Proxy({ drawImage, clip, stroke }, {
      get: (target, key) => key in target ? target[key as keyof typeof target] : () => undefined,
    }) as unknown as CanvasRenderingContext2D;
    const peak = Math.PI / 2 / 1.1;
    expect(verdantTailFrame(0)).toBe(4);
    expect(verdantTailFrame(peak)).toBe(8);
    expect(verdantTailFrame(peak * 3)).toBe(0);
    owner.draw(context, 1672, peak, true);
    expect(drawImage.mock.calls[8]?.slice(1, 5)).toEqual([434, 2, 50, 50]);
    expect(clip).toHaveBeenCalledOnce(); expect(stroke).toHaveBeenCalledTimes(3);
    drawImage.mockClear(); stroke.mockClear();
    for (const flash of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      drawImage.mockClear(); stroke.mockClear();
      owner.draw(context, 1672, peak, true, flash);
      expect(drawImage.mock.calls[8]?.slice(1, 5)).toEqual([434, 2, 50, 50]);
      expect(stroke).not.toHaveBeenCalled();
    }
    const alphas: number[] = [];
    stroke.mockImplementation(() => { alphas.push(context.globalAlpha); });
    owner.draw(context, 1672, peak, true, 1);
    const fullAlphas = alphas.splice(0);
    expect(fullAlphas).toHaveLength(3);
    owner.draw(context, 1672, peak, true, 0.5);
    expect(alphas.splice(0)).toEqual(fullAlphas.map((alpha) => alpha * 0.5));
    owner.draw(context, 1672, peak, true, 2);
    expect(alphas.splice(0)).toEqual(fullAlphas);
    drawImage.mockClear(); stroke.mockClear();
    owner.setDiagnosticMotion("maximum"); owner.draw(context, 1672, peak, false);
    expect(drawImage.mock.calls[8]?.slice(1, 5)).toEqual([218, 2, 50, 50]);
    expect(stroke).not.toHaveBeenCalled();
    owner.setDiagnosticMotion("live");
    drawImage.mockClear(); owner.draw(context, 1672, 0, true);
    expect(drawImage.mock.calls[8]?.slice(1, 5)).toEqual([218, 2, 50, 50]);
    expect(load).toHaveBeenCalledTimes(9);
    expect(() => { owner.setDiagnosticMotion("unknown"); }).toThrow();
    owner.dispose();
  });
  it("rejects corrupted encoded content before decoding", async () => {
    const decode = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["corrupt"]))));
    vi.stubGlobal("createImageBitmap", decode);
    try {
      const asset = validateVerdantScenePackage(scenePackage).assets[0];
      if (!asset) throw new Error("Missing test asset");
      await expect(loadCalibrationBitmap("top", new AbortController().signal, asset)).rejects.toThrow("digest mismatch");
      expect(decode).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("loads once outside draw, draws at authored world coordinates, and disposes once", async () => {
    const top = tile(471), bottom = tile(470);
    const load = vi.fn().mockResolvedValueOnce(top).mockResolvedValueOnce(bottom);
    const owner = createPreparedVerdantCalibration(controlPackage, controlUrls, load);
    const drawImage = vi.fn();
    const context = { save: vi.fn(), restore: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D;
    expect(owner.draw(context, 1600)).toBe(false);
    await Promise.all([owner.prepare(), owner.prepare()]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(owner.status()).toBe("ready");
    expect(owner.draw(context, 1600)).toBe(true);
    expect(drawImage).toHaveBeenNthCalledWith(2, bottom.image, 0, 471 * 1600 / 1672, 1600, 470 * 1600 / 1672);
    owner.dispose(); owner.dispose();
    expect(top.close).toHaveBeenCalledTimes(1);
    expect(bottom.close).toHaveBeenCalledTimes(1);
    expect(owner.draw(context, 1600)).toBe(false);
  });
  it("closes a late decode after disposal and cannot publish it", async () => {
    const late = tile(471);
    let resolve!: (value: CalibrationBitmap) => void;
    const owner = createPreparedVerdantCalibration(controlPackage, controlUrls, () => new Promise((done) => { resolve = done; }));
    const pending = owner.prepare();
    owner.dispose(); resolve(late); await pending;
    expect(owner.status()).toBe("disposed");
    expect(late.close).toHaveBeenCalledTimes(1);
  });
  it("closes partial preparation on failure and rejects wrong dimensions", async () => {
    const top = tile(471), wrong = tile(1);
    const owner = createPreparedVerdantCalibration(controlPackage, controlUrls, vi.fn().mockResolvedValueOnce(top).mockResolvedValueOnce(wrong));
    await owner.prepare();
    expect(owner.status()).toBe("failed");
    expect(top.close).toHaveBeenCalledTimes(1);
    expect(wrong.close).toHaveBeenCalledTimes(1);
  });
  it("draws and diagnoses the same prepared tail without new fetches", async () => {
    const top = tile(471), bottom = tile(470), tail = { ...tile(50), width: 50 };
    const load = vi.fn().mockResolvedValueOnce(top).mockResolvedValueOnce(bottom).mockResolvedValueOnce(tail);
    const owner = createPreparedVerdantCalibration(scenePackage, layerUrls, load);
    const drawImage = vi.fn();
    const context = { save: vi.fn(), restore: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D;
    await owner.prepare(); owner.draw(context, 1672);
    expect(drawImage).toHaveBeenCalledTimes(3);
    expect(drawImage).toHaveBeenLastCalledWith(tail.image, 1475, 330, 50, 50);
    drawImage.mockClear(); owner.setDiagnosticView("support-only"); owner.draw(context, 1672);
    expect(drawImage).toHaveBeenCalledTimes(2);
    drawImage.mockClear(); owner.setDiagnosticView("tail-only"); owner.draw(context, 1672);
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(tail.image, 1475, 330, 50, 50);
    expect(load).toHaveBeenCalledTimes(3);
    expect(owner.report()).toMatchObject({ decodedResources: 3, decodedBytes: (1672 * 941 + 2500) * 4, encodedBytes: 300, fallbackActive: false });
    expect(() => { owner.setDiagnosticView("invalid"); }).toThrow();
    expect(owner.draw(context, Number.NaN)).toBe(false);
    owner.dispose(); owner.dispose();
    for (const bitmap of [top, bottom, tail]) expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(owner.report().decodedResources).toBe(0);
  });
  it("never publishes a partial layered package after tail failure", async () => {
    const top = tile(471), bottom = tile(470);
    const owner = createPreparedVerdantCalibration(scenePackage, layerUrls,
      vi.fn().mockResolvedValueOnce(top).mockResolvedValueOnce(bottom).mockRejectedValueOnce(new Error("tail unavailable")));
    await owner.prepare();
    expect(owner.report()).toMatchObject({ status: "failed", fallbackActive: true, decodedResources: 0, failure: "tail unavailable" });
    expect(top.close).toHaveBeenCalledTimes(1); expect(bottom.close).toHaveBeenCalledTimes(1);
    expect(() => createPreparedVerdantCalibration(scenePackage, {}, vi.fn())).toThrow("Missing registered");
  });
});

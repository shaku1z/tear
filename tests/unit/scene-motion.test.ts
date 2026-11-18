// The moving parts of a painted scene (src/presentation/scenes/scene-motion.ts): package data in, drawing
// out, with nothing in the renderer that knows which stage it is drawing.
import { describe, expect, it } from "vitest";
import {
  decodedBytes,
  validateScenePackage,
  type SceneBitmap,
  type SceneCanvas,
} from "../../src/presentation/scenes/scene-contract";
import {
  drawLayerMotion,
  prepareMotion,
  SCENE_MOTION_RATE,
  waterRow,
} from "../../src/presentation/scenes/scene-motion";
import { drawSceneBack, type LoadedScene, type SceneFrame } from "../../src/presentation/scenes/scene-renderer";
import { fixturePackage } from "./scene-fixture";

const digest = "a".repeat(64);
const water = {
  id: "pool",
  kind: "water",
  layer: "far",
  mask: "water",
  rect: [200, 540, 1200, 300],
  rows: 12,
  far: 0.25,
  slide: 3,
  swell: 2,
  waves: 5,
  period: 3,
  glints: { count: 20, color: "#f6ffe0", opacity: 0.5, length: 30, drift: 8 },
};

/** The fixture with a water mask image and one stretch of water on its far layer. */
function withWater(part: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  const base = fixturePackage();
  const images = [
    ...(base.images as object[]),
    {
      id: "water",
      file: "water.avif",
      width: 250,
      height: 60,
      alpha: true,
      bytes: 100,
      sha256: digest,
      sources: ["plate"],
    },
  ];
  return fixturePackage({ images, motion: [{ ...water, ...part }], ...overrides });
}

type Call = Readonly<{ name: string; args: readonly unknown[]; blend: unknown }>;

/** A canvas context that records calls, with the blend mode in force at each. */
function recorder() {
  const calls: Call[] = [];
  const values = new Map<PropertyKey, unknown>();
  const context = new Proxy({} as CanvasRenderingContext2D, {
    get(_target, property): unknown {
      if (values.has(property)) return values.get(property);
      if (property === "createLinearGradient" || property === "createRadialGradient")
        return () => ({ addColorStop: () => undefined });
      return (...args: unknown[]): void => {
        calls.push({ name: String(property), args, blend: values.get("globalCompositeOperation") });
      };
    },
    set(_target, property, value): boolean {
      values.set(property, value);
      return true;
    },
  });
  return { context, calls };
}

/** A stand-in for a decoded image or canvas: a size, and a context that records calls. */
function fakeCanvas(width: number, height: number, context: CanvasRenderingContext2D): SceneCanvas & SceneBitmap {
  const canvas: SceneCanvas = { width, height, getContext: () => context };
  return canvas as SceneCanvas & SceneBitmap;
}

function loadedScene(part: Record<string, unknown> = {}) {
  const scene = validateScenePackage(withWater(part));
  const work = recorder();
  const images = new Map<string, SceneBitmap>(
    scene.images.map((image) => [image.id, fakeCanvas(image.width, image.height, work.context)]),
  );
  const created: { width: number; height: number }[] = [];
  const motion = prepareMotion(scene, images, (width, height) => {
    created.push({ width, height });
    return fakeCanvas(width, height, work.context);
  });
  const loaded: LoadedScene = { scene, images, shading: [], motion };
  return { scene, images, motion, loaded, work, created };
}

/** The far layer's decoded paint; every test scene has one. */
function farPaint(images: ReadonlyMap<string, SceneBitmap>): SceneBitmap {
  const paint = images.get("far");
  if (paint === undefined) throw new Error("no far layer");
  return paint;
}

const frame = (overrides: Partial<SceneFrame> = {}): SceneFrame => ({
  camera: { cx: 800, cy: 450, scale: 1, ox: 0, oy: 0, playerX: 0 },
  view: { left: 0, top: 0, right: 1600, bottom: 900 },
  timeSeconds: 1,
  lowGraphics: false,
  reducedMotion: false,
  opacity: 1,
  ...overrides,
});

describe("water in a scene package", () => {
  it("is package data: a layer, a mask and how the surface moves", () => {
    const scene = validateScenePackage(withWater());
    expect(scene.motion).toEqual([water]);
    expect(Object.isFrozen(scene.motion[0])).toBe(true);
    expect(validateScenePackage(fixturePackage()).motion).toEqual([]);
  });

  it.each([
    ["an unknown kind", { kind: "lava" }, /expected "water"/u],
    ["a layer the package does not have", { layer: "mid" }, /unknown layer/u],
    ["a mask with no alpha", { mask: "stone" }, /image with alpha/u],
    ["an area outside its layer", { rect: [-500, 540, 1200, 300] }, /inside layer/u],
    ["more slide than reads as water", { slide: 40 }, /slide/u],
    ["too many rows to draw cheaply", { rows: 400 }, /rows/u],
  ])("rejects %s", (_label, part, message) => {
    expect(() => validateScenePackage(withWater(part))).toThrow(message);
  });

  it("counts the canvas the water is redrawn into as decoded memory", () => {
    const still = validateScenePackage(fixturePackage({ images: withWater().images }));
    const moving = validateScenePackage(withWater());
    // The far image holds 2000/2400 pixels per world unit across and 1200/1500 down.
    const canvas = Math.ceil(1200 * (2000 / 2400)) * Math.ceil(300 * (1200 / 1500)) * 4;
    expect(decodedBytes(moving) - decodedBytes(still)).toBe(canvas);
    expect(() => validateScenePackage(withWater({}, { decodedBudget: decodedBytes(still) }))).toThrow(
      /decoded bytes exceed/u,
    );
  });
});

describe("water rows", () => {
  const far = 0.25;
  it("run from the far edge to the near edge and grow by the same ratio each row", () => {
    expect(waterRow({ far }, 0)).toEqual([0, far]);
    expect(waterRow({ far }, 1)[0]).toBeCloseTo(1, 9);
    expect(waterRow({ far }, 1)[1]).toBeCloseTo(1, 9);
    const sizes = [0, 0.25, 0.5, 0.75, 1].map((u) => waterRow({ far }, u)[1]);
    const ratios = sizes.slice(1).map((size, index) => size / (sizes[index] ?? 1));
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[0] ?? 0, 9);
    const edges = [0, 0.25, 0.5, 0.75, 1].map((u) => waterRow({ far }, u)[0]);
    const heights = edges.slice(1).map((edge, index) => edge - (edges[index] ?? 0));
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
  });

  it("are even where the water has no perspective", () => {
    expect(waterRow({ far: 1 }, 0.5)).toEqual([0.5, 1]);
  });
});

describe("drawing water", () => {
  it("makes one canvas the size of the paint under the water", () => {
    const { created, motion } = loadedScene();
    expect(created).toEqual([{ width: 1000, height: 240 }]);
    expect(motion[0]?.source).toEqual([500, 672, 1000, 240]);
    expect(motion[0]?.area).toEqual([200, 540, 1200, 300]);
  });

  it("redraws the rows, the glints and the mask, then draws the result over its layer", () => {
    const { motion, images, work } = loadedScene();
    const main = recorder();
    const paint = farPaint(images);
    drawLayerMotion(main.context, motion, images, "far", paint, 1);
    const rows = work.calls.filter((call) => call.name === "drawImage" && call.args[0] === paint);
    expect(rows).toHaveLength(water.rows);
    for (const row of rows) {
      const [, , sy, , sh] = row.args as number[];
      expect(sy).toBeGreaterThanOrEqual(0);
      expect((sy ?? 0) + (sh ?? 0)).toBeLessThanOrEqual(paint.height);
      expect(row.blend).toBe("source-over");
    }
    // Rows meet with no gap from the top of the canvas to the bottom.
    const tops = rows.map((row) => (row.args as number[])[6] ?? 0);
    expect(tops[0]).toBe(0);
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    const last = rows.at(-1)?.args as number[];
    expect((last[6] ?? 0) + (last[8] ?? 0)).toBeGreaterThanOrEqual(240);
    const strokes = work.calls.filter((call) => call.name === "stroke");
    expect(strokes.length).toBeGreaterThan(0);
    expect(strokes.every((call) => call.blend === "lighter")).toBe(true);
    // The mask is the last thing drawn, and it keeps only the water.
    const final = work.calls.at(-1);
    expect(final?.name).toBe("drawImage");
    expect(final?.args[0]).toBe(images.get("water"));
    expect(final?.blend).toBe("destination-in");
    expect(main.calls).toEqual([
      { name: "drawImage", args: [motion[0]?.canvas, 200, 540, 1200, 300], blend: undefined },
    ]);
  });

  it("moves: rows read different paint a moment later", () => {
    const reads = (seconds: number) => {
      const { motion, images, work } = loadedScene();
      const paint = farPaint(images);
      drawLayerMotion(recorder().context, motion, images, "far", paint, seconds);
      return work.calls.filter((call) => call.args[0] === paint).map((call) => (call.args as number[])[1]);
    };
    expect(reads(1)).not.toEqual(reads(1.5));
    // No row slides further than the package allows (3 world px, here 2.5 image px).
    for (const x of reads(1.5)) expect(Math.abs((x ?? 0) - 500)).toBeLessThanOrEqual(3 * (2000 / 2400) + 1e-9);
  });

  it("redraws at a fixed rate, and only draws the kept canvas in between", () => {
    const { motion, images, work } = loadedScene();
    const main = recorder();
    const paint = farPaint(images);
    const tick = 1 / SCENE_MOTION_RATE;
    drawLayerMotion(main.context, motion, images, "far", paint, 10 * tick);
    const first = work.calls.length;
    drawLayerMotion(main.context, motion, images, "far", paint, 10.4 * tick);
    drawLayerMotion(main.context, motion, images, "far", paint, 10.9 * tick);
    expect(work.calls.length).toBe(first);
    drawLayerMotion(main.context, motion, images, "far", paint, 11 * tick);
    expect(work.calls.length).toBe(first * 2);
    expect(main.calls).toHaveLength(4);
  });

  it("draws nothing for another layer, or when the mask has been released", () => {
    const { motion, images, work } = loadedScene();
    const main = recorder();
    const paint = farPaint(images);
    drawLayerMotion(main.context, motion, images, "roots", paint, 1);
    images.delete("water");
    drawLayerMotion(main.context, motion, images, "far", paint, 1);
    expect(main.calls).toEqual([]);
    expect(work.calls.filter((call) => call.blend === "destination-in")).toEqual([]);
  });
});

describe("the scene renderer", () => {
  const draws = (overrides: Partial<SceneFrame>) => {
    const { loaded, motion } = loadedScene();
    const main = recorder();
    drawSceneBack(main.context, loaded, frame(overrides));
    return main.calls.filter((call) => call.name === "drawImage" && call.args[0] === motion[0]?.canvas);
  };

  it("draws the water right after its layer", () => {
    expect(draws({})).toHaveLength(1);
  });

  it("shows the still painting with reduced motion and with low graphics", () => {
    expect(draws({ reducedMotion: true })).toEqual([]);
    expect(draws({ lowGraphics: true })).toEqual([]);
  });

  it("draws a package with no motion exactly as before", () => {
    const scene = validateScenePackage(fixturePackage());
    const images = new Map<string, SceneBitmap>(
      scene.images.map((image) => [image.id, fakeCanvas(image.width, image.height, recorder().context)]),
    );
    const plain = recorder();
    drawSceneBack(plain.context, { scene, images, shading: [] }, frame());
    const prepared = recorder();
    drawSceneBack(prepared.context, { scene, images, shading: [], motion: [] }, frame());
    expect(prepared.calls).toEqual(plain.calls);
  });
});

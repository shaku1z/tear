/**
 * What moves in a painted stage: the recipe's `live` list, how it compiles,
 * its limits, and how the renderer draws it with and without motion.
 */
import { describe, expect, it } from "vitest";
import type { SceneLive, SceneLivePart } from "../../src/presentation/scenes/scene-contract";
import type { ScenePaintPorts } from "../../src/presentation/scenes/scene-library";
import { drawLive, type LiveFrame } from "../../src/presentation/scenes/scene-live";
import type { SceneBitmap, SceneCanvas } from "../../src/presentation/scenes/scene-renderer";
import { paintedStage } from "../../src/presentation/stage-art/painted-stage";
import { VERDANT_SANCTUM_ART } from "../../src/presentation/stage-art/recipes/verdant-sanctum";
import {
  STAGE_ART_LIMITS,
  type LiveMotes,
  type LivePart,
  type LiveWater,
  type StageArtLive,
  type StageArtRecipe,
} from "../../src/presentation/stage-art/stage-art-contract";
import { compileMotes, compileWater } from "../../src/presentation/stage-art/stage-art-live";
import { StageArtError, validateStageArt } from "../../src/presentation/stage-art/stage-art-validate";

const LIMITS = STAGE_ART_LIMITS.live;

/** A context that records each call with its arguments and each property it is given. */
function recordingContext() {
  const calls: string[] = [];
  const context = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "createLinearGradient" || key === "createRadialGradient")
          return () => ({ addColorStop: () => undefined });
        if (key === "getTransform") return () => ({ a: 1 });
        return (...args: unknown[]) => {
          const shown = args.map((value) => (typeof value === "number" ? value.toFixed(3) : typeof value));
          calls.push(`${String(key)}(${shown.join(",")})`);
        };
      },
      set(_target, key, value) {
        calls.push(`${String(key)}=${String(value)}`);
        return true;
      },
    },
    // The live drawing only calls canvas methods and sets canvas properties; the proxy records both.
  ) as unknown as CanvasRenderingContext2D;
  const count = (name: string): number => calls.filter((call) => call.startsWith(`${name}(`)).length;
  return { context, calls, count };
}

const bitmap = (width: number, height: number) => ({ width, height }) as unknown as SceneBitmap;
const LAYER = { bitmap: bitmap(1200, 700), rect: [-200, -100, 2000, 1100] as const };
const MOVING: LiveFrame = { timeSeconds: 3.4, still: false, opacity: 1 };
const STILL: LiveFrame = { timeSeconds: 3.4, still: true, opacity: 1 };

function find<Kind extends StageArtLive["kind"]>(kind: Kind): Extract<StageArtLive, { kind: Kind }> {
  const entry = (VERDANT_SANCTUM_ART.live ?? []).find(
    (item): item is Extract<StageArtLive, { kind: Kind }> => item.kind === kind,
  );
  if (entry === undefined) throw new Error(`the Verdant recipe has no live ${kind}`);
  return entry;
}

const WATER: LiveWater = find("water");
const MOTES: LiveMotes = find("motes");
const PART: LivePart = find("part");
/** The part with neither motion, which a recipe may not hold. */
const UNMOVING: LivePart = {
  kind: "part",
  layer: PART.layer,
  id: PART.id,
  area: PART.area,
  scale: PART.scale,
  strokes: PART.strokes,
};
const withLive = (live: readonly StageArtLive[]): StageArtRecipe => ({ ...VERDANT_SANCTUM_ART, live });
const rejects = (live: readonly StageArtLive[], message: RegExp): void => {
  expect(() => {
    validateStageArt(withLive(live));
  }).toThrow(StageArtError);
  expect(() => {
    validateStageArt(withLive(live));
  }).toThrow(message);
};

function draw(live: SceneLive, frame: LiveFrame, images = new Map<string, SceneBitmap>()) {
  const recorder = recordingContext();
  drawLive(recorder.context, live, LAYER, images, frame);
  return recorder;
}

describe("live recipe limits", () => {
  it("accepts a recipe in which nothing moves", () => {
    expect(() => {
      validateStageArt(withLive([]));
    }).not.toThrow();
  });

  it("refuses motion that would compete for attention", () => {
    rejects([{ ...MOTES, alpha: LIMITS.moteAlpha + 0.01 }], /alpha/u);
    rejects([{ ...MOTES, count: LIMITS.motes + 1 }], /count/u);
    rejects([{ ...MOTES, size: [1, LIMITS.moteSize + 0.5] }], /size/u);
    rejects([{ ...MOTES, drift: [LIMITS.moteDrift, LIMITS.moteDrift] }], /drift/u);
    rejects([{ ...MOTES, period: LIMITS.minPeriod - 0.5 }], /period/u);
    rejects([{ ...WATER, reach: [0, LIMITS.waterReach + 1] }], /reach/u);
    rejects([{ ...WATER, glints: { ...WATER.glints, alpha: LIMITS.glintAlpha + 0.05 } }], /glints\.alpha/u);
    rejects([{ ...WATER, period: LIMITS.minPeriod - 1 }], /period/u);
    rejects(
      [{ ...PART, sway: { pivot: "top", slices: 8, reach: LIMITS.swayReach + 1, period: 9, travel: 1 } }],
      /reach/u,
    );
  });

  it("refuses entries the painter could not place", () => {
    rejects([{ ...MOTES, layer: "nowhere" }], /unknown layer "nowhere"/u);
    rejects([PART, PART], /duplicate or reserved id/u);
    rejects([UNMOVING], /needs a sway or a breathe/u);
    rejects([{ ...WATER, bottom: WATER.top }], /bottom must be below top/u);
    rejects(
      Array.from({ length: LIMITS.entries + 1 }, () => MOTES),
      /more than/u,
    );
    rejects([{ ...PART, area: [0, 0, 1600, 900], scale: 1 }], /canvas pixels/u);
  });
});

describe("compiling what moves", () => {
  const bounds = [-120, -80, 1840, 1060] as const;

  it("spends the seed once, so the same recipe always moves the same way", () => {
    expect(compileWater(WATER, bounds, [255, 250, 220])).toEqual(compileWater(WATER, bounds, [255, 250, 220]));
    expect(compileMotes(MOTES)).toEqual(compileMotes(MOTES));
    expect(compileMotes({ ...MOTES, seed: MOTES.seed + 1 })).not.toEqual(compileMotes(MOTES));
  });

  it("covers the water from top to bottom with rows that grow and slide farther toward the viewer", () => {
    const water = compileWater(WATER, bounds, [255, 250, 220]);
    const first = water.rows[0];
    const last = water.rows.at(-1);
    if (first === undefined || last === undefined) throw new Error("no rows");
    expect(first.y).toBe(WATER.top);
    expect(last.y + last.h).toBeCloseTo(WATER.bottom, 6);
    water.rows.slice(1).forEach((row, index) => {
      const above = water.rows[index];
      expect(row.y).toBeCloseTo((above?.y ?? 0) + (above?.h ?? 0), 6);
      expect(row.reach).toBeGreaterThan(above?.reach ?? Infinity);
    });
    expect(water.rows.length).toBeLessThanOrEqual(LIMITS.waterRows);
    expect(water.glints).toHaveLength(WATER.glints.count);
    for (const glint of water.glints) {
      expect(glint.x).toBeGreaterThanOrEqual(bounds[0]);
      expect(glint.x).toBeLessThanOrEqual(bounds[0] + bounds[2]);
      expect(glint.y).toBeGreaterThanOrEqual(WATER.top);
      expect(glint.y).toBeLessThan(WATER.bottom);
    }
  });

  it("scatters motes inside their area at sizes the recipe allows", () => {
    const field = compileMotes(MOTES);
    expect(field.motes).toHaveLength(MOTES.count);
    for (const mote of field.motes) {
      expect(mote.x).toBeLessThanOrEqual(MOTES.area[2]);
      expect(mote.y).toBeLessThanOrEqual(MOTES.area[3]);
      expect(mote.size).toBeGreaterThanOrEqual(MOTES.size[0]);
      expect(mote.size).toBeLessThanOrEqual(MOTES.size[1]);
    }
  });
});

describe("drawing what moves", () => {
  const water = compileWater(WATER, LAYER.rect, [255, 250, 220]);
  const motes = compileMotes(MOTES);
  const images = new Map([["vines", bitmap(840, 230)]]);
  const swaying: SceneLivePart = {
    kind: "part",
    layer: "far",
    image: "vines",
    rect: [-40, 215, 1680, 460],
    blend: "source-over",
    sway: { pivot: "top", slices: 12, reach: 3, period: 9, travel: 1.5 },
  };
  const breathing: SceneLivePart = {
    kind: "part",
    layer: "far",
    image: "vines",
    rect: swaying.rect,
    blend: "lighter",
    breathe: { low: 0, period: 10 },
  };

  it("redraws each water row once and lights only some of the glints", () => {
    const recorder = draw(water, MOVING);
    expect(recorder.count("drawImage")).toBe(water.rows.length);
    expect(recorder.count("fillRect")).toBeGreaterThan(0);
    expect(recorder.count("fillRect")).toBeLessThan(water.glints.length);
  });

  it("draws every mote, and a swaying part in its slices", () => {
    expect(draw(motes, MOVING).count("arc")).toBe(motes.motes.length);
    expect(draw(swaying, MOVING, images).count("drawImage")).toBe(12);
  });

  it("is a closed form of time: the same moment draws the same calls, another moment different ones", () => {
    for (const live of [water, motes, swaying, breathing]) {
      expect(draw(live, MOVING, images).calls).toEqual(draw(live, MOVING, images).calls);
      expect(draw(live, { ...MOVING, timeSeconds: 5.9 }, images).calls).not.toEqual(draw(live, MOVING, images).calls);
    }
  });

  it("draws the stage at rest when still: no water, no motes, parts unmoved, breathing parts at their low", () => {
    expect(draw(water, STILL).count("drawImage")).toBe(0);
    expect(draw(water, STILL).count("fillRect")).toBe(0);
    expect(draw(motes, STILL).count("arc")).toBe(0);
    const part = draw(swaying, STILL, images);
    expect(part.count("drawImage")).toBe(1);
    expect(part.count("transform")).toBe(0);
    expect(draw(breathing, STILL, images).count("drawImage")).toBe(0);
    const dim = draw({ ...breathing, breathe: { low: 0.4, period: 10 } }, STILL, images);
    expect(dim.count("drawImage")).toBe(1);
    expect(dim.calls).toContain("globalAlpha=0.4");
  });

  it("gives the context back as it found it, and fades with the stage", () => {
    for (const live of [water, motes, swaying, breathing]) {
      const recorder = draw(live, MOVING, images);
      expect(recorder.count("save")).toBe(recorder.count("restore"));
      expect(recorder.calls[0]).toBe("save()");
      expect(recorder.calls.at(-1)).toBe("restore()");
    }
    expect(draw(swaying, { ...MOVING, opacity: 0.5 }, images).calls).toContain("globalAlpha=0.5");
    expect(draw(swaying, MOVING, new Map()).count("drawImage")).toBe(0);
  });
});

describe("painting Verdant's live parts", () => {
  it("compiles every live entry and paints each part's image", async () => {
    const context = recordingContext().context;
    const ports: ScenePaintPorts = {
      world: { width: 1600, height: 900, groundY: 800 },
      // The painter only reads size and asks for a 2D context.
      createCanvas: (width, height) =>
        ({ width, height, getContext: () => context }) as unknown as SceneCanvas & SceneBitmap,
      now: () => 0,
      nextSlice: () => Promise.resolve(),
      sliceMs: 4,
      detail: 1,
    };
    const { scene, images } = await paintedStage(VERDANT_SANCTUM_ART).paint(ports);
    const recipe = VERDANT_SANCTUM_ART.live ?? [];
    expect(scene.live.map((entry) => `${entry.kind} ${entry.layer}`)).toEqual(
      recipe.map((entry) => `${entry.kind} ${entry.layer}`),
    );
    for (const entry of scene.live) {
      if (entry.kind !== "part") continue;
      const image = images.get(entry.image);
      const source = recipe.find((item) => item.kind === "part" && item.id === entry.image);
      expect(image, entry.image).toBeDefined();
      if (source?.kind !== "part") throw new Error(`no recipe part ${entry.image}`);
      expect(image?.width).toBe(Math.ceil(source.area[2] * source.scale));
      expect(entry.blend).toBe(source.blend ?? "source-over");
    }
  });
});

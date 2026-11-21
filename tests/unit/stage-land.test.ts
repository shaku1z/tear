/**
 * Land and sky strokes (src/presentation/stage-art/strokes-land.ts): ridgelines and ribbons of light.
 * What a ridge's parameters do to its crest, what each stroke paints, and what the validator refuses.
 */
import { describe, expect, it } from "vitest";
import { parseHex, valueNoise, type PaintKit } from "../../src/presentation/stage-art/paint-kit";
import { PALE_TRAVERSE_ART } from "../../src/presentation/stage-art/recipes/pale-traverse";
import type {
  RibbonStroke,
  RidgeStroke,
  StageArtRecipe,
  StageArtStroke,
} from "../../src/presentation/stage-art/stage-art-contract";
import { StageArtError, validateStageArt } from "../../src/presentation/stage-art/stage-art-validate";
import {
  paintRibbon,
  paintRidge,
  ribbonLength,
  ridgeCrest,
  RIDGE_COLUMN,
} from "../../src/presentation/stage-art/strokes-land";

const WIDTH = 1600;
const RIDGE: RidgeStroke = {
  kind: "ridge",
  seed: 7,
  ramp: "rock",
  haze: 0.3,
  crest: 500,
  base: 640,
  relief: 30,
  span: 400,
  sharp: 0.7,
};
const RIBBON: RibbonStroke = {
  kind: "ribbon",
  seed: 9,
  ramp: "rock",
  alpha: 0.5,
  rays: 60,
  path: [
    [0, 200, 150],
    [800, 200, 150],
  ],
};

/** A paint kit over a context that counts the calls it is given. */
function countingKit(detail = 1) {
  const counts = new Map<string, number>();
  const context = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "createLinearGradient") return () => ({ addColorStop: () => undefined });
        return () => counts.set(String(key), (counts.get(String(key)) ?? 0) + 1);
      },
      set: () => true,
    },
  );
  const kit: PaintKit = {
    // The strokes only call drawing methods; the proxy counts whatever they draw.
    context: context as unknown as PaintKit["context"],
    light: { x: 1200, y: 500, reach: 1200, core: parseHex("#ffffff"), glow: parseHex("#ffccaa") },
    atmosphere: { haze: parseHex("#d9dbf0"), warmth: 0.5 },
    ramps: new Map([["rock", ["#7584b2", "#bcc7e2", "#fcfdff"].map(parseHex)]]),
    noise: valueNoise(11),
    detail,
    behind: () => undefined,
    bounds: [0, 0, WIDTH, 900],
  };
  return { kit, count: (name: string) => counts.get(name) ?? 0 };
}

function paint(strokes: Generator<void>): void {
  let step = strokes.next();
  while (step.done !== true) step = strokes.next();
}

const columns = (stroke: RidgeStroke): number[] => {
  const { kit } = countingKit();
  return Array.from({ length: WIDTH / 8 }, (_, index) => ridgeCrest(kit, stroke, index * 8));
};

describe("ridge", () => {
  it("keeps its crest within the relief of its row, the same every time", () => {
    const crest = columns(RIDGE);
    expect(columns(RIDGE)).toEqual(crest);
    for (const row of crest) {
      expect(row).toBeGreaterThanOrEqual(RIDGE.crest - RIDGE.relief);
      expect(row).toBeLessThanOrEqual(RIDGE.crest + RIDGE.relief);
    }
    expect(Math.max(...crest) - Math.min(...crest)).toBeGreaterThan(RIDGE.relief / 2);
  });

  it("lifts a named summit by about its rise at its centre and not at all outside its width", () => {
    const { kit } = countingKit();
    const peaked: RidgeStroke = { ...RIDGE, peaks: [[800, 200, 180]] };
    const lift = (x: number) => ridgeCrest(kit, RIDGE, x) - ridgeCrest(kit, peaked, x);
    expect(lift(800)).toBeGreaterThan(180 * 0.8);
    expect(lift(800)).toBeLessThan(180 * 1.2);
    expect(lift(590)).toBe(0);
    expect(lift(1010)).toBe(0);
    expect(lift(700)).toBeLessThan(lift(800));
  });

  it("fills one column per step where the crest stands above the base", () => {
    const { kit, count } = countingKit();
    paint(paintRidge(kit, { ...RIDGE, sharp: 0 }));
    expect(count("fillRect")).toBe(WIDTH / RIDGE_COLUMN);
    // Rolling ground has no shadowed faces and no tips.
    expect(count("fill")).toBe(0);
  });

  it("throws a shadowed face from a pointed summit and stands tips along a treeline", () => {
    const pointed = countingKit();
    paint(paintRidge(pointed.kit, { ...RIDGE, peaks: [[800, 300, 200]] }));
    expect(pointed.count("fill")).toBeGreaterThan(0);
    const treeline = countingKit();
    paint(paintRidge(treeline.kit, { ...RIDGE, sharp: 0, teeth: { spacing: 16, height: 30 } }));
    expect(treeline.count("fill")).toBeGreaterThan(WIDTH / 16 / 2);
    expect(treeline.count("fill")).toBeLessThan((WIDTH / 16) * 2);
  });

  it("paints nothing where the crest lies below the base", () => {
    const { kit, count } = countingKit();
    paint(paintRidge(kit, { ...RIDGE, crest: 700, base: 640, relief: 10 }));
    expect(count("fillRect")).toBe(0);
  });
});

describe("ribbon", () => {
  it("measures its path and stands rays in proportion to its length and the graphics tier", () => {
    expect(ribbonLength(RIBBON)).toBe(800);
    const full = countingKit();
    paint(paintRibbon(full.kit, RIBBON));
    expect(full.count("fillRect")).toBe((800 / 100) * RIBBON.rays);
    const low = countingKit(0.5);
    paint(paintRibbon(low.kit, RIBBON));
    expect(low.count("fillRect")).toBe(full.count("fillRect") / 2);
  });
});

describe("validating land strokes", () => {
  const firstLayer = PALE_TRAVERSE_ART.layers[0];
  if (firstLayer === undefined) throw new Error("the Pale recipe has no layers");
  const withStroke = (stroke: StageArtStroke): StageArtRecipe => ({
    ...PALE_TRAVERSE_ART,
    layers: [{ ...firstLayer, strokes: [stroke] }],
    live: [],
  });
  const rejects = (stroke: StageArtStroke, message: RegExp) => {
    expect(() => {
      validateStageArt(withStroke(stroke));
    }, String(message)).toThrow(message);
    expect(() => {
      validateStageArt(withStroke(stroke));
    }).toThrow(StageArtError);
  };

  it("accepts a ridge and a ribbon that use the recipe's ramps", () => {
    expect(() => {
      validateStageArt(withStroke(RIDGE));
      validateStageArt(withStroke({ ...RIBBON, ramp: "aurora" }));
    }).not.toThrow();
  });

  it("refuses a ridge or ribbon the painter could not place", () => {
    rejects({ ...RIDGE, ramp: "granite" }, /unknown ramp "granite"/u);
    rejects({ ...RIDGE, base: RIDGE.crest }, /base must be below crest/u);
    rejects({ ...RIDGE, sharp: 1.5 }, /sharp/u);
    rejects({ ...RIDGE, span: 1 }, /span/u);
    rejects({ ...RIDGE, teeth: { spacing: 1, height: 20 } }, /teeth\.spacing/u);
    rejects({ ...RIBBON, ramp: "aurora", path: [[0, 200, 150]] }, /path needs two points/u);
    rejects({ ...RIBBON, ramp: "aurora", alpha: 2 }, /alpha/u);
    rejects({ ...RIBBON, ramp: "aurora", rays: 500 }, /rays/u);
  });
});

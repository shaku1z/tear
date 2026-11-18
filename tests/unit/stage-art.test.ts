// Drawn stages (src/presentation/stage-art): recipe validation, deterministic
// painting, sliced painting that hands the thread back, and layers that cover
// every viewport the stage must support. A recording 2D context stands in for a
// canvas, so these run without a browser; the pixels are checked in the browser
// evidence instead.
import { describe, expect, it, vi } from "vitest";
import viewports from "../../config/scene-viewports.json";
import { stageDefinition } from "../../src/gameplay/stages";
import { requiredLayerRect, viewportWorldRect, type Rect } from "../../src/presentation/scenes/scene-contract";
import type { ScenePaintPorts } from "../../src/presentation/scenes/scene-library";
import type { SceneBitmap, SceneCanvas } from "../../src/presentation/scenes/scene-renderer";
import { stagePresentationDefinition } from "../../src/presentation/stage-presentation-definitions";
import { paintedStage } from "../../src/presentation/stage-art/painted-stage";
import { VERDANT_SANCTUM_ART } from "../../src/presentation/stage-art/recipes/verdant-sanctum";
import { STAGE_ART_LIMITS, type StageArtRecipe } from "../../src/presentation/stage-art/stage-art-contract";
import { stageArtLayerRect } from "../../src/presentation/stage-art/stage-art-painter";
import { StageArtError, validateStageArt } from "../../src/presentation/stage-art/stage-art-validate";

const WORLD = { width: 1600, height: 900, groundY: 800 };

interface Recorded {
  readonly canvases: { readonly width: number; readonly height: number; readonly calls: string[] }[];
}

/** A canvas whose context records every call with its rounded numeric arguments. */
function recordingCanvas(recorded: Recorded, width: number, height: number): SceneCanvas & SceneBitmap {
  const calls: string[] = [];
  recorded.canvases.push({ width, height, calls });
  const gradient = { addColorStop: (offset: number, color: string) => calls.push(`stop ${String(offset)} ${color}`) };
  const context = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
        if (key === "getTransform") return () => ({ a: 1 });
        return (...args: unknown[]) => {
          const shown = args.map((value) => (typeof value === "number" ? value.toFixed(2) : typeof value));
          calls.push(`${String(key)}(${shown.join(",")})`);
        };
      },
      set(_target, key, value) {
        calls.push(`${String(key)}=${String(value)}`);
        return true;
      },
    },
  );
  // The painter only reads size and asks for a 2D context; the proxy records whatever it draws.
  return { width, height, getContext: () => context } as unknown as SceneCanvas & SceneBitmap;
}

function paintPorts(recorded: Recorded, options: { tick?: number; detail?: number } = {}) {
  let clock = 0;
  let slices = 0;
  const ports: ScenePaintPorts = {
    world: WORLD,
    createCanvas: (width, height) => recordingCanvas(recorded, width, height),
    // Every reading of the clock advances it, so time passes as strokes paint.
    now: () => (clock += options.tick ?? 1),
    nextSlice: () => {
      slices += 1;
      return Promise.resolve();
    },
    sliceMs: 4,
    detail: options.detail ?? 1,
  };
  return { ports, slices: () => slices };
}

const withLayers = (layers: StageArtRecipe["layers"]): StageArtRecipe => ({ ...VERDANT_SANCTUM_ART, layers });
const firstLayer = VERDANT_SANCTUM_ART.layers[0];
if (firstLayer === undefined) throw new Error("the Verdant recipe has no layers");

describe("stage art recipes", () => {
  it("accepts the Verdant Sanctum recipe within the limits", () => {
    expect(() => {
      validateStageArt(VERDANT_SANCTUM_ART);
    }).not.toThrow();
    expect(VERDANT_SANCTUM_ART.layers.length).toBeLessThanOrEqual(STAGE_ART_LIMITS.layers);
  });

  it("names the problem when a stroke uses a ramp the recipe lacks", () => {
    const stroke = { kind: "water", seed: 1, top: 600, ramp: "lava", reflection: 0.5, ripples: 10 } as const;
    const recipe = withLayers([{ ...firstLayer, strokes: [stroke] }]);
    expect(() => {
      validateStageArt(recipe);
    }).toThrow(StageArtError);
    expect(() => {
      validateStageArt(recipe);
    }).toThrow(/unknown ramp "lava"/u);
  });

  it("rejects colours that are not #rrggbb", () => {
    expect(() => {
      validateStageArt({ ...VERDANT_SANCTUM_ART, edge: "green" });
    }).toThrow(/edge: expected #rrggbb/u);
  });

  it("rejects too many layers and layer ids that collide or take the surface's name", () => {
    const many = Array.from({ length: STAGE_ART_LIMITS.layers + 1 }, (_, index) => ({
      ...firstLayer,
      id: `l${String(index)}`,
    }));
    expect(() => {
      validateStageArt(withLayers(many));
    }).toThrow(/layers/u);
    expect(() => {
      validateStageArt(withLayers([firstLayer, firstLayer]));
    }).toThrow(/duplicate or reserved id/u);
    expect(() => {
      validateStageArt(withLayers([{ ...firstLayer, id: "surface" }]));
    }).toThrow(/duplicate or reserved id/u);
  });

  it("refuses a recipe whose brushwork would make a long bake", () => {
    const dense = { kind: "mass", seed: 1, ramp: "leaf", haze: 0, size: 4, density: 4000 } as const;
    const shape = { blobs: [[800, 450, 800, 450]] as const, rough: 0, lobes: 1 };
    expect(() => {
      validateStageArt(withLayers([{ ...firstLayer, strokes: [{ ...dense, shape }] }]));
    }).toThrow(/brush operations, over/u);
  });
});

describe("painting a stage", () => {
  it("paints the same calls every time from the same recipe", async () => {
    const first: Recorded = { canvases: [] };
    const second: Recorded = { canvases: [] };
    await paintedStage(VERDANT_SANCTUM_ART).paint(paintPorts(first).ports);
    await paintedStage(VERDANT_SANCTUM_ART).paint(paintPorts(second).ports);
    expect(first.canvases.length).toBeGreaterThan(0);
    expect(second.canvases).toEqual(first.canvases);
  });

  it("draws its randomness from the recipe seed alone, never a shared source", async () => {
    // Gameplay and replays use the injected random source and simulation ticks. Painting must not
    // touch either, so a stage looks the same on every machine and no replay can depend on it.
    const shared = vi.spyOn(Math, "random");
    const clock = vi.spyOn(Date, "now");
    await paintedStage(VERDANT_SANCTUM_ART).paint(paintPorts({ canvases: [] }).ports);
    expect(shared).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
    shared.mockRestore();
    clock.mockRestore();
  });

  it("hands the thread back whenever a slice has used its time", async () => {
    const fast: Recorded = { canvases: [] };
    const slow: Recorded = { canvases: [] };
    const quick = paintPorts(fast, { tick: 0.001 });
    const busy = paintPorts(slow, { tick: 1 });
    await paintedStage(VERDANT_SANCTUM_ART).paint(quick.ports);
    await paintedStage(VERDANT_SANCTUM_ART).paint(busy.ports);
    // Each clock reading is one painted step; at 1 ms a step, a 4 ms slice yields every few steps.
    expect(busy.slices()).toBeGreaterThan(quick.slices() * 10);
    expect(busy.slices()).toBeGreaterThan(100);
  });

  it("keeps the stage's own paper and platform material, and paints the platform surface", async () => {
    const loaded = await paintedStage(VERDANT_SANCTUM_ART).paint(paintPorts({ canvases: [] }).ports);
    expect(loaded.scene.theme.paper).toBe(stageDefinition("verdant-sanctum").bg);
    expect(loaded.scene.platforms.material).toBe(stagePresentationDefinition("verdant-sanctum")?.platformMaterialId);
    expect(loaded.images.has(loaded.scene.platforms.texture)).toBe(true);
    for (const layer of loaded.scene.layers) expect(loaded.images.has(layer.image)).toBe(true);
  });

  it("bakes smaller canvases on low graphics", async () => {
    const full: Recorded = { canvases: [] };
    const low: Recorded = { canvases: [] };
    await paintedStage(VERDANT_SANCTUM_ART).paint(paintPorts(full).ports);
    await paintedStage(VERDANT_SANCTUM_ART).paint(paintPorts(low, { detail: 0.6 }).ports);
    const pixels = (recorded: Recorded) =>
      recorded.canvases.reduce((total, canvas) => total + canvas.width * canvas.height, 0);
    expect(pixels(low)).toBeLessThan(pixels(full) * 0.5);
  });
});

describe("water and the ruins standing in it", () => {
  const WATER_TOP = 600;
  const ruin = (haze: number) =>
    ({
      kind: "arcade",
      seed: 3,
      x: 700,
      y: WATER_TOP + 10,
      bays: 2,
      bayWidth: 100,
      height: 120,
      levels: 1,
      ramp: "stone",
      mossRamp: "moss",
      thickness: 16,
      haze,
    }) as const;
  const water = { kind: "water", seed: 5, top: WATER_TOP, ramp: "water", reflection: 0.7, ripples: 0 } as const;
  const layerCalls = async (strokes: StageArtRecipe["layers"][number]["strokes"]) => {
    const recorded: Recorded = { canvases: [] };
    const recipe = withLayers([{ ...firstLayer, strokes }]);
    await paintedStage(recipe).paint(paintPorts(recorded).ports);
    const layer = recorded.canvases[0];
    if (layer === undefined) throw new Error("no layer was painted");
    const [layerRect] = recipe.layers.map((entry) => stageArtLayerRect(recipe, entry, WORLD));
    if (layerRect === undefined) throw new Error("no layer rectangle");
    return { calls: layer.calls, top: layerRect[1] };
  };

  it("reflects everything above the waterline in one pass, and nothing else mirrors itself", async () => {
    const { calls, top } = await layerCalls([ruin(0.2), water]);
    // The water stroke copies rows of what is already painted: drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh).
    const rows = calls
      .filter((call) => call.startsWith("drawImage(") && call.split(",").length === 9)
      .map((call) => call.slice("drawImage(".length, -1).split(",").map(Number));
    expect(rows.length).toBeGreaterThan(50);
    for (const row of rows) {
      const sourceY = (row[2] ?? 0) + top;
      expect(sourceY).toBeLessThan(WATER_TOP);
      expect(row[6]).toBeGreaterThanOrEqual(WATER_TOP);
    }
    // No stroke flips the canvas to paint a reflection of its own.
    expect(calls.filter((call) => call.startsWith("scale(") && call.includes("-1.00"))).toEqual([]);
  });

  it("gathers mist at the foot of a hazed ruin and none at a near one", async () => {
    const clips = (calls: readonly string[]) => calls.filter((call) => call.startsWith("clip(")).length;
    const near = await layerCalls([ruin(0)]);
    const far = await layerCalls([ruin(0.6)]);
    expect(clips(far.calls)).toBe(clips(near.calls) + 1);
  });

  it("builds a ruin's structure from recipe parameters: fewer bays standing above, and columns", async () => {
    const count = (calls: readonly string[], name: string) => calls.filter((call) => call.startsWith(name)).length;
    const tall = { ...ruin(0), bays: 4, levels: 2 };
    const whole = await layerCalls([tall]);
    const broken = await layerCalls([{ ...tall, standing: 0.5 }]);
    // Each standing bay draws its arch; an upper storey over half the bays draws fewer.
    expect(count(broken.calls, "arc(")).toBeLessThan(count(whole.calls, "arc("));
    const columned = await layerCalls([{ ...tall, columns: 0.6 }]);
    expect(count(columned.calls, "fillRect(")).toBeGreaterThan(count(whole.calls, "fillRect("));
  });

  it("stands a wading ruin in water painted earlier and reflects it through the same pass", async () => {
    const depth = 12;
    const wading = { ...ruin(0), y: WATER_TOP + 40, wade: { depth, ramp: "water", reflection: 0.5 } } as const;
    const line = wading.y - depth;
    const span = wading.bays * wading.bayWidth + wading.thickness * 2;
    const { calls, top } = await layerCalls([water, wading]);
    const rows = calls
      .filter((call) => call.startsWith("drawImage(") && call.split(",").length === 9)
      .map((call) => call.slice("drawImage(".length, -1).split(",").map(Number));
    // The ruin's own rows are as wide as the ruin, start at its waterline and copy what stands above it.
    const own = rows.filter((row) => row[7] === span);
    expect(own.length).toBeGreaterThan(20);
    for (const row of own) {
      expect((row[2] ?? 0) + top).toBeLessThan(line);
      expect(row[6]).toBeGreaterThanOrEqual(line);
    }
    expect(calls.filter((call) => call.startsWith("scale(") && call.includes("-1.00"))).toEqual([]);
    const dry = await layerCalls([water, { ...ruin(0), y: WATER_TOP + 40 }]);
    expect(dry.calls.filter((call) => call.startsWith("drawImage(")).length).toBe(rows.length - own.length);
  });

  it("names a wading ruin's water ramp when the recipe lacks it", () => {
    const wading = { ...ruin(0), wade: { depth: 12, ramp: "lava", reflection: 0.5 } } as const;
    expect(() => {
      validateStageArt(withLayers([{ ...firstLayer, strokes: [wading] }]));
    }).toThrow(/unknown ramp "lava"/u);
  });

  it("keeps ivy off the arch openings, so wider arches carry less of it", async () => {
    const leaves = (calls: readonly string[]) => calls.filter((call) => call.startsWith("ellipse(")).length;
    const narrow = await layerCalls([{ ...ruin(0), ivy: 1, pier: 0.8 }]);
    const wide = await layerCalls([{ ...ruin(0), ivy: 1, pier: 0.1 }]);
    expect(leaves(wide.calls)).toBeLessThan(leaves(narrow.calls));
  });
});

describe("layer coverage", () => {
  const contains = (outer: Rect, inner: Rect) =>
    outer[0] <= inner[0] &&
    outer[1] <= inner[1] &&
    outer[0] + outer[2] >= inner[0] + inner[2] &&
    outer[1] + outer[3] >= inner[1] + inner[3];

  for (const layer of VERDANT_SANCTUM_ART.layers.filter((entry) => entry.area === undefined)) {
    it(`${layer.id} covers every required viewport at every camera the stage allows`, () => {
      const rect = stageArtLayerRect(VERDANT_SANCTUM_ART, layer, WORLD);
      for (const [name, width, height] of viewports.required) {
        const need = requiredLayerRect(
          { camera: VERDANT_SANCTUM_ART.camera, world: WORLD },
          layer.depth,
          viewportWorldRect(WORLD, Number(width), Number(height)),
          WORLD.groundY,
        );
        expect(contains(rect, need), `${layer.id} at ${String(name)}`).toBe(true);
      }
    });
  }
});

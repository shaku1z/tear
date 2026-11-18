// Drawn stages (src/presentation/stage-art): recipe validation, deterministic
// painting, sliced painting that hands the thread back, and layers that cover
// every viewport the stage must support. A recording 2D context stands in for a
// canvas, so these run without a browser; the pixels are checked in the browser
// evidence instead.
import { describe, expect, it } from "vitest";
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

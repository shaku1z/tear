/**
 * Paints a stage art recipe into layer canvases and the scene layout the scene
 * renderer composes. Painting is sliced: strokes yield often and the painter
 * hands the thread back whenever a slice has used its time, so a bake never
 * becomes a long task. The same recipe and seed always paint the same pixels.
 */
import viewports from "../../../config/scene-viewports.json";
import {
  frontLayerIntrusion,
  requiredLayerRect,
  viewportWorldRect,
  type Rect,
  type SceneLayer,
  type SceneLive,
  type SceneWorld,
} from "../scenes/scene-contract";
import type { ScenePaintPorts } from "../scenes/scene-library";
import type { LoadedScene, SceneBitmap, SceneCanvas } from "../scenes/scene-renderer";
import { parseHex, valueNoise, type Context2D, type PaintKit, type Ramp, type Rgb } from "./paint-kit";
import type { LivePart, StageArtIdentity, StageArtLayer, StageArtRecipe, StageArtStroke } from "./stage-art-contract";
import { compileMotes, compileWater } from "./stage-art-live";
import { StageArtError, validateStageArt } from "./stage-art-validate";
import { paintArcade, paintSurface } from "./strokes-built";
import { paintMass, paintScatter, paintStrands, paintTrunk } from "./strokes-growth";
import { paintFalls, paintGlow, paintHaze, paintShafts, paintSky, paintVignette, paintWater } from "./strokes-light";

const EDGE_FEATHER = 72;

/** Width and height of every viewport a stage must cover (config/scene-viewports.json). */
const REQUIRED_VIEWPORTS: readonly (readonly [number, number])[] = viewports.required.map(([, width, height]) => [
  Number(width),
  Number(height),
]);

/** One routine per stroke kind; a new kind of form is one case here. */
function strokeSteps(kit: PaintKit, stroke: StageArtStroke): Generator<void> {
  switch (stroke.kind) {
    case "sky":
      return paintSky(kit, stroke);
    case "glow":
      return paintGlow(kit, stroke);
    case "haze":
      return paintHaze(kit, stroke);
    case "mass":
      return paintMass(kit, stroke);
    case "strands":
      return paintStrands(kit, stroke);
    case "trunk":
      return paintTrunk(kit, stroke);
    case "arcade":
      return paintArcade(kit, stroke);
    case "water":
      return paintWater(kit, stroke);
    case "falls":
      return paintFalls(kit, stroke);
    case "shafts":
      return paintShafts(kit, stroke);
    case "vignette":
      return paintVignette(kit, stroke);
    case "scatter":
      return paintScatter(kit, stroke);
  }
}

/** World rectangle a layer paints: its own area, or full camera coverage at every supported viewport. */
export function stageArtLayerRect(recipe: StageArtRecipe, layer: StageArtLayer, world: SceneWorld): Rect {
  if (layer.area !== undefined) return layer.area;
  const scene = { camera: recipe.camera, world };
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const [width, height] of REQUIRED_VIEWPORTS) {
    const [x, y, w, h] = requiredLayerRect(scene, layer.depth, viewportWorldRect(world, width, height), world.groundY);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + w);
    bottom = Math.max(bottom, y + h);
  }
  // The floor hides everything below its surface; reach past it by the edge feather so the
  // renderer's fade to the edge colour stays under the floor.
  const x = Math.floor(left),
    y = Math.floor(top);
  return [x, y, Math.ceil(right) - x, Math.ceil(bottom + EDGE_FEATHER) - y];
}

function context2d(canvas: SceneCanvas): Context2D {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("stage art: canvas 2D context is unavailable");
  return context;
}

interface Painted {
  readonly layer: StageArtLayer;
  readonly rect: Rect;
  readonly canvas: SceneCanvas & SceneBitmap;
}

/** What every kit of one bake shares: the light, atmosphere, ramps, noise and detail. */
type SharedKit = Omit<PaintKit, "context" | "behind" | "bounds">;

/** A part is painted like a layer, on a canvas of its own area, so the renderer can move it. */
async function paintPart(
  part: LivePart,
  shared: SharedKit,
  ports: ScenePaintPorts,
  run: (steps: Generator<void>) => Promise<void>,
): Promise<SceneCanvas & SceneBitmap> {
  const scale = part.scale * ports.detail;
  const canvas = ports.createCanvas(Math.ceil(part.area[2] * scale), Math.ceil(part.area[3] * scale));
  const context = context2d(canvas);
  const toPart = () => {
    context.setTransform(scale, 0, 0, scale, -part.area[0] * scale, -part.area[1] * scale);
  };
  toPart();
  const kit: PaintKit = { ...shared, context, behind: () => undefined, bounds: part.area };
  for (const stroke of part.strokes) {
    context.save();
    await run(strokeSteps(kit, stroke));
    context.restore();
    toPart();
  }
  return canvas;
}

/** Compiles what moves into what the renderer draws: water and motes become tables, parts name their image. */
function compileLive(recipe: StageArtRecipe, painted: readonly Painted[], glint: Rgb): SceneLive[] {
  return (recipe.live ?? []).map((entry) => {
    const layerRect = painted.find((item) => item.layer.id === entry.layer)?.rect;
    if (layerRect === undefined) throw new StageArtError(`live ${entry.kind}: unknown layer "${entry.layer}"`);
    if (entry.kind === "water") return compileWater(entry, layerRect, glint);
    if (entry.kind === "motes") return compileMotes(entry);
    return Object.freeze({
      kind: "part",
      layer: entry.layer,
      image: entry.id,
      rect: entry.area,
      blend: entry.blend ?? "source-over",
      ...(entry.sway === undefined ? {} : { sway: entry.sway }),
      ...(entry.breathe === undefined ? {} : { breathe: entry.breathe }),
    });
  });
}

export async function paintStageArt(
  recipe: StageArtRecipe,
  identity: StageArtIdentity,
  ports: ScenePaintPorts,
): Promise<LoadedScene> {
  validateStageArt(recipe);
  const ramps = new Map<string, Ramp>(Object.entries(recipe.ramps).map(([name, stops]) => [name, stops.map(parseHex)]));
  const light = Object.freeze({
    x: recipe.light.x,
    y: recipe.light.y,
    reach: recipe.light.reach,
    core: parseHex(recipe.light.core),
    glow: parseHex(recipe.light.glow),
  });
  const atmosphere = Object.freeze({ haze: parseHex(recipe.atmosphere.haze), warmth: recipe.atmosphere.warmth });
  const noise = valueNoise(recipe.seed);
  let sliceStart = ports.now();
  const run = async (steps: Generator<void>) => {
    for (let step = steps.next(); step.done !== true; step = steps.next()) {
      if (ports.now() - sliceStart < ports.sliceMs) continue;
      await ports.nextSlice();
      sliceStart = ports.now();
    }
  };
  const shared = { light, atmosphere, ramps, noise, detail: ports.detail };
  const painted: Painted[] = [];
  /** Everything behind the layer being painted, in drawing order: back layers and the parts that always show. */
  const backdrop: { readonly rect: Rect; readonly canvas: SceneBitmap }[] = [];
  const parts = new Map<string, SceneBitmap>();
  for (const layer of recipe.layers) {
    const rect = stageArtLayerRect(recipe, layer, ports.world);
    // A front layer draws over platforms and actors, so it may only dress the floor body and below.
    const intrusion =
      layer.plane === "front"
        ? frontLayerIntrusion({ camera: recipe.camera, world: ports.world }, { rect, depth: layer.depth })
        : 0;
    if (intrusion > 0) {
      throw new StageArtError(
        `layer ${layer.id}: front layer reaches ${intrusion.toFixed(1)} px into the gameplay region`,
      );
    }
    const scale = layer.scale * ports.detail;
    const canvas = ports.createCanvas(Math.ceil(rect[2] * scale), Math.ceil(rect[3] * scale));
    const context = context2d(canvas);
    const toLayer = () => {
      context.setTransform(scale, 0, 0, scale, -rect[0] * scale, -rect[1] * scale);
    };
    toLayer();
    const behind = () => {
      // Earlier layers and this one so far, in this layer's frame (water reflects them).
      const composite = ports.createCanvas(canvas.width, canvas.height);
      const target = context2d(composite);
      target.setTransform(scale, 0, 0, scale, -rect[0] * scale, -rect[1] * scale);
      for (const earlier of backdrop) target.drawImage(earlier.canvas, ...earlier.rect);
      target.drawImage(canvas, ...rect);
      return composite;
    };
    const kit: PaintKit = { context, light, atmosphere, ramps, noise, detail: ports.detail, behind, bounds: rect };
    for (const stroke of layer.strokes) {
      context.save();
      await run(strokeSteps(kit, stroke));
      context.restore();
      toLayer();
    }
    painted.push({ layer, rect, canvas });
    if (layer.plane === "back") backdrop.push({ rect, canvas });
    for (const entry of recipe.live ?? []) {
      if (entry.kind !== "part" || entry.layer !== layer.id) continue;
      const part = await paintPart(entry, shared, ports, run);
      parts.set(entry.id, part);
      if (layer.plane === "back" && entry.breathe === undefined) backdrop.push({ rect: entry.area, canvas: part });
    }
  }
  const surface = recipe.surface;
  const strip = ports.createCanvas(Math.ceil(surface.width), Math.ceil(surface.height));
  const stripBounds: Rect = [0, 0, surface.width, surface.height];
  await run(
    paintSurface(
      {
        context: context2d(strip),
        light,
        atmosphere,
        ramps,
        noise,
        detail: ports.detail,
        behind: () => undefined,
        bounds: stripBounds,
      },
      surface,
    ),
  );
  const images = new Map<string, SceneBitmap>(painted.map((entry) => [entry.layer.id, entry.canvas]));
  images.set("surface", strip);
  for (const [id, part] of parts) images.set(id, part);
  const live = compileLive(recipe, painted, light.core);
  const layers: SceneLayer[] = painted.map(({ layer, rect }) =>
    Object.freeze({
      id: layer.id,
      image: layer.id,
      rect,
      depth: layer.depth,
      plane: layer.plane,
      opacity: 1,
      covers: layer.area === undefined,
    }),
  );
  const scene = Object.freeze({
    world: ports.world,
    camera: recipe.camera,
    edge: Object.freeze({ color: recipe.edge, feather: EDGE_FEATHER }),
    theme: Object.freeze({ paper: identity.paper }),
    layers: Object.freeze(layers),
    live: Object.freeze(live),
    platforms: Object.freeze({
      material: identity.platformMaterial,
      texture: "surface",
      scale: surface.scale,
      fill: surface.fill,
      shadow: surface.shadow,
    }),
  });
  return Object.freeze({ scene, images });
}

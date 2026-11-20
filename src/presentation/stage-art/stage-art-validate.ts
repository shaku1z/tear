/**
 * Checks a recipe before it paints: every ramp it names exists, colours parse,
 * numbers sit in range and the whole recipe stays inside STAGE_ART_LIMITS, so
 * no recipe can make a bake slow or a layer huge.
 */
import { shapeBounds } from "./strokes-growth";
import {
  STAGE_ART_LIMITS,
  type LiveMotes,
  type LivePart,
  type LiveWater,
  type StageArtRecipe,
  type StageArtStroke,
} from "./stage-art-contract";

export class StageArtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageArtError";
  }
}

const HEX = /^#[0-9a-f]{6}$/iu;

function fail(path: string, message: string): never {
  throw new StageArtError(`${path}: ${message}`);
}

function colour(value: string, path: string): void {
  if (!HEX.test(value)) fail(path, `expected #rrggbb, got "${value}"`);
}

function within(value: number, min: number, max: number, path: string): void {
  if (!Number.isFinite(value) || value < min || value > max) fail(path, `expected ${String(min)}..${String(max)}`);
}

/** Ramps a stroke reads, so missing names fail before painting. */
function rampsOf(stroke: StageArtStroke): readonly string[] {
  switch (stroke.kind) {
    case "mass":
    case "strands":
    case "water":
    case "falls":
      return [stroke.ramp];
    case "trunk":
      return [stroke.ramp, stroke.mossRamp];
    case "arcade":
      return stroke.wade === undefined
        ? [stroke.ramp, stroke.mossRamp]
        : [stroke.ramp, stroke.mossRamp, stroke.wade.ramp];
    default:
      return [];
  }
}

const UNBOUNDED_LAYER: readonly [number, number, number, number] = [-1e4, -1e4, 2e4, 2e4];
const ARCADE_OPERATIONS_PER_PX = 1.2;
/** Area assumed for a layer that covers the camera range, world px² (wider than any required viewport's reach). */
const COVERING_LAYER_AREA = 2400 * 1200;

/** Brush operations a stroke performs at full detail, for the recipe budget. */
export function strokeOperations(stroke: StageArtStroke, layerArea: number): number {
  switch (stroke.kind) {
    case "mass": {
      const box = shapeBounds(stroke.shape, UNBOUNDED_LAYER);
      const area = stroke.shape.outside === true ? layerArea : box.w * box.h;
      return (area / 10_000) * stroke.density * 1.25;
    }
    case "strands":
      return (stroke.count * stroke.length) / stroke.size;
    case "trunk":
      return stroke.fibers * 180 + stroke.moss;
    case "arcade": {
      const width = stroke.bays * stroke.bayWidth;
      return stroke.levels * width * (ARCADE_OPERATIONS_PER_PX * (stroke.ivy ?? 1) + stroke.height * 0.004);
    }
    case "water":
      return (layerArea / 10_000) * stroke.ripples;
    case "falls":
      return stroke.width * 2.5;
    case "scatter":
      return stroke.spots.length * stroke.count * (stroke.petals + 1);
    default:
      return 1;
  }
}

/** Ramps, ranges and colours of one stroke, wherever it is painted. */
function checkStroke(recipe: StageArtRecipe, stroke: StageArtStroke, path: string): void {
  for (const name of rampsOf(stroke)) {
    if (!Object.hasOwn(recipe.ramps, name)) fail(path, `unknown ramp "${name}"`);
  }
  if ("haze" in stroke) within(stroke.haze, 0, 1, `${path}.haze`);
  if (stroke.kind === "trunk" && stroke.spine.length < 2) fail(path, "spine needs two points");
  if (stroke.kind === "scatter")
    [...stroke.colors, stroke.center].forEach((value) => {
      colour(value, path);
    });
  if (stroke.kind === "sky")
    [stroke.top, stroke.middle, stroke.bottom].forEach((value) => {
      colour(value, path);
    });
  if (stroke.kind === "vignette") colour(stroke.color, path);
}

const LIVE = STAGE_ART_LIMITS.live;

function checkWater(water: LiveWater, path: string): void {
  if (!(water.bottom > water.top)) fail(path, "bottom must be below top");
  within(water.rows[0], 1, water.rows[1], `${path}.rows[0]`);
  if ((water.bottom - water.top) / water.rows[0] > LIVE.waterRows) fail(`${path}.rows`, "too many rows");
  within(water.reach[0], 0, LIVE.waterReach, `${path}.reach[0]`);
  within(water.reach[1], 0, LIVE.waterReach, `${path}.reach[1]`);
  within(water.period, LIVE.minPeriod, 600, `${path}.period`);
  within(water.glints.count, 0, LIVE.glints, `${path}.glints.count`);
  within(water.glints.alpha, 0, LIVE.glintAlpha, `${path}.glints.alpha`);
  within(water.glints.period, LIVE.minPeriod, 600, `${path}.glints.period`);
}

function checkMotes(motes: LiveMotes, path: string): void {
  colour(motes.color, `${path}.color`);
  within(motes.count, 0, LIVE.motes, `${path}.count`);
  within(motes.size[0], 0.1, motes.size[1], `${path}.size[0]`);
  within(motes.size[1], 0.1, LIVE.moteSize, `${path}.size[1]`);
  within(motes.alpha, 0, LIVE.moteAlpha, `${path}.alpha`);
  within(Math.hypot(...motes.drift), 0, LIVE.moteDrift, `${path}.drift`);
  within(motes.period, LIVE.minPeriod, 600, `${path}.period`);
}

/** Checks a part and returns the canvas pixels it holds at full detail. */
function checkPart(recipe: StageArtRecipe, part: LivePart, path: string): number {
  within(part.scale, STAGE_ART_LIMITS.minScale, STAGE_ART_LIMITS.maxScale, `${path}.scale`);
  if (!(part.area[2] > 0 && part.area[3] > 0)) fail(`${path}.area`, "width and height must be positive");
  if (part.sway === undefined && part.breathe === undefined) fail(path, "a part needs a sway or a breathe");
  if (part.sway !== undefined) {
    within(part.sway.reach, 0, LIVE.swayReach, `${path}.sway.reach`);
    within(part.sway.slices, 1, LIVE.swaySlices, `${path}.sway.slices`);
    within(part.sway.period, LIVE.minPeriod, 600, `${path}.sway.period`);
  }
  if (part.breathe !== undefined) {
    within(part.breathe.low, 0, 1, `${path}.breathe.low`);
    within(part.breathe.period, LIVE.minPeriod, 600, `${path}.breathe.period`);
  }
  part.strokes.forEach((stroke, index) => {
    checkStroke(recipe, stroke, `${path}.strokes[${String(index)}] (${stroke.kind})`);
  });
  return part.area[2] * part.area[3] * part.scale * part.scale;
}

/** Checks what moves and returns the brush operations its parts add to the bake. */
function validateLive(recipe: StageArtRecipe, layerIds: ReadonlySet<string>): number {
  const live = recipe.live ?? [];
  if (live.length > LIVE.entries) fail("live", `more than ${String(LIVE.entries)} entries`);
  const partIds = new Set<string>();
  let operations = 0;
  let pixels = 0;
  live.forEach((entry, index) => {
    const path = `live[${String(index)}] (${entry.kind})`;
    if (!layerIds.has(entry.layer)) fail(path, `unknown layer "${entry.layer}"`);
    if (entry.kind === "water") checkWater(entry, path);
    else if (entry.kind === "motes") checkMotes(entry, path);
    else {
      if (layerIds.has(entry.id) || partIds.has(entry.id) || entry.id === "surface")
        fail(path, `duplicate or reserved id "${entry.id}"`);
      partIds.add(entry.id);
      pixels += checkPart(recipe, entry, path);
      for (const stroke of entry.strokes) operations += strokeOperations(stroke, entry.area[2] * entry.area[3]);
    }
  });
  if (pixels > LIVE.partPixels) {
    fail("live", `parts hold ${String(Math.round(pixels))} canvas pixels, over ${String(LIVE.partPixels)}`);
  }
  return operations;
}

export function validateStageArt(recipe: StageArtRecipe): void {
  for (const [name, stops] of Object.entries(recipe.ramps)) {
    if (stops.length < 2) fail(`ramps.${name}`, "needs at least two stops");
    stops.forEach((stop, index) => {
      colour(stop, `ramps.${name}[${String(index)}]`);
    });
  }
  colour(recipe.light.core, "light.core");
  colour(recipe.light.glow, "light.glow");
  colour(recipe.atmosphere.haze, "atmosphere.haze");
  colour(recipe.edge, "edge");
  colour(recipe.surface.fill, "surface.fill");
  within(recipe.atmosphere.warmth, 0, 1, "atmosphere.warmth");
  within(recipe.light.reach, 1, 1e4, "light.reach");
  for (const name of [recipe.surface.ramp, recipe.surface.mossRamp]) {
    if (!Object.hasOwn(recipe.ramps, name)) fail("surface", `unknown ramp "${name}"`);
  }
  if (recipe.layers.length === 0 || recipe.layers.length > STAGE_ART_LIMITS.layers) {
    fail("layers", `expected 1..${String(STAGE_ART_LIMITS.layers)} layers`);
  }
  const ids = new Set<string>();
  let operations = 0;
  recipe.layers.forEach((layer, layerIndex) => {
    const path = `layers[${String(layerIndex)}]`;
    if (ids.has(layer.id) || layer.id === "surface") fail(path, `duplicate or reserved id "${layer.id}"`);
    ids.add(layer.id);
    within(layer.scale, STAGE_ART_LIMITS.minScale, STAGE_ART_LIMITS.maxScale, `${path}.scale`);
    within(layer.depth, 0, 2, `${path}.depth`);
    if (layer.strokes.length > STAGE_ART_LIMITS.strokesPerLayer) fail(path, "too many strokes");
    const area = layer.area === undefined ? COVERING_LAYER_AREA : layer.area[2] * layer.area[3];
    layer.strokes.forEach((stroke, strokeIndex) => {
      checkStroke(recipe, stroke, `${path}.strokes[${String(strokeIndex)}] (${stroke.kind})`);
      operations += strokeOperations(stroke, area);
    });
  });
  operations += validateLive(recipe, ids);
  if (operations > STAGE_ART_LIMITS.operations) {
    fail(
      "layers",
      `about ${String(Math.round(operations))} brush operations, over ${String(STAGE_ART_LIMITS.operations)}`,
    );
  }
}

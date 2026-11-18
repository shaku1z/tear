/**
 * The moving parts of a painted scene, drawn from package data alone. Each part
 * is redrawn into its own small canvas a fixed number of times a second and
 * that canvas is drawn over its layer every frame, so a frame pays for one image
 * draw however much the part itself costs.
 */
import {
  layerImageRect,
  type Rect,
  type SceneBitmap,
  type SceneCanvas,
  type SceneMotion,
  type ScenePackage,
  type SceneWater,
} from "./scene-contract";

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Times a second a moving part is redrawn. Ripples read as smooth well below the frame rate. */
export const SCENE_MOTION_RATE = 30;

/** One moving part ready to draw: its canvas, and which step of time the canvas holds. */
export interface PreparedMotion {
  readonly motion: SceneMotion;
  readonly canvas: SceneCanvas & SceneBitmap;
  /** Pixels of the layer image this part moves: [x, y, w, h]. */
  readonly source: Rect;
  /** The same pixels in layer space, where the canvas is drawn. */
  readonly area: Rect;
  step: number;
}

/**
 * Makes the canvas for every moving part. A part whose layer, mask or canvas is
 * missing is left out, and the scene shows still paint there.
 */
export function prepareMotion(
  scene: ScenePackage,
  images: ReadonlyMap<string, SceneBitmap>,
  createCanvas: (width: number, height: number) => SceneCanvas & SceneBitmap,
): readonly PreparedMotion[] {
  const prepared: PreparedMotion[] = [];
  for (const motion of scene.motion) {
    const layer = scene.layers.find((item) => item.id === motion.layer);
    const image = scene.images.find((item) => item.id === layer?.image);
    if (layer === undefined || image === undefined) continue;
    if (!images.has(layer.image) || !images.has(motion.mask)) continue;
    const source = layerImageRect(image, layer, motion.rect);
    const kx = layer.rect[2] / image.width;
    const ky = layer.rect[3] / image.height;
    const area: Rect = [layer.rect[0] + source[0] * kx, layer.rect[1] + source[1] * ky, source[2] * kx, source[3] * ky];
    prepared.push({ motion, canvas: createCanvas(source[2], source[3]), source, area, step: -1 });
  }
  return prepared;
}

/** A repeatable number in [0, 1) for a glint and one of its traits. */
function scatter(index: number, trait: number): number {
  const value = Math.sin(index * 127.1 + trait * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Where row boundary `u` (0 far to 1 near, evenly spaced in depth) sits down the
 * area, as a share of its height, and how large things are there relative to the
 * near edge. Sizes grow by the same ratio from each row to the next.
 */
export function waterRow(water: Pick<SceneWater, "far">, u: number): readonly [at: number, size: number] {
  const size = water.far ** (1 - u);
  return [water.far >= 1 ? u : (size - water.far) / (1 - water.far), size];
}

function drawRows(context: Context2D, water: SceneWater, paint: SceneBitmap, source: Rect, seconds: number): void {
  const [sx, sy, width, height] = source;
  const perUnit = width / water.rect[2];
  const turn = Math.PI * 2;
  for (let row = 0; row < water.rows; row += 1) {
    const [top] = waterRow(water, row / water.rows);
    const [bottom, size] = waterRow(water, (row + 1) / water.rows);
    const y = Math.floor(top * height);
    const rowHeight = Math.max(1, Math.ceil(bottom * height) - y);
    // Two wave trains: one runs towards the viewer, a slower one runs away, so the surface never slides one way.
    const along = (row + 0.5) / water.rows;
    const near = Math.sin(turn * (water.waves * along - seconds / water.period));
    const away = Math.sin(turn * (water.waves * 0.37 * along + seconds / (water.period * 1.9)) + 1.7);
    const slide = water.slide * size * perUnit * (0.62 * near + 0.38 * away);
    const swell =
      water.swell *
      size *
      perUnit *
      (0.62 * Math.cos(turn * (water.waves * along - seconds / water.period)) + 0.38 * away);
    // Read each row from a little to the side and from a slightly taller or shorter band of paint.
    const fromY = Math.max(0, Math.min(paint.height - 1, sy + y + swell * 0.5));
    const fromHeight = Math.max(1, Math.min(paint.height - fromY, rowHeight + swell));
    context.drawImage(paint, sx + slide, fromY, width, fromHeight, 0, y, width, rowHeight + 0.5);
  }
}

function drawGlints(context: Context2D, water: SceneWater, source: Rect, seconds: number): void {
  const glints = water.glints;
  if (glints === undefined) return;
  const [, , width, height] = source;
  const perUnit = width / water.rect[2];
  context.save();
  context.globalCompositeOperation = "lighter";
  context.strokeStyle = glints.color;
  context.lineCap = "round";
  for (let index = 0; index < glints.count; index += 1) {
    // Each glint brightens and fades on its own clock, and is still for most of it.
    const life = seconds / (2.4 + 3.2 * scatter(index, 1)) + scatter(index, 2);
    const glow = Math.max(0, Math.sin(Math.PI * 2 * life)) ** 3;
    if (glow < 0.04) continue;
    const [at, size] = waterRow(water, scatter(index, 3));
    const length = glints.length * size * perUnit * (0.5 + scatter(index, 4));
    const travel = scatter(index, 5) * width + glints.drift * size * perUnit * seconds;
    const x = ((travel % width) + width) % width;
    const y = at * height;
    // A wide faint stroke under a short bright one, so a glint has a soft end and a hot middle.
    const thickness = Math.max(1, 2 * size * perUnit);
    for (const [share, weight, alpha] of [
      [1, 1.6, 0.35],
      [0.45, 0.8, 1],
    ] as const) {
      context.globalAlpha = glints.opacity * glow * alpha;
      context.lineWidth = thickness * weight;
      context.beginPath();
      context.moveTo(x - (length * share) / 2, y);
      context.lineTo(x + (length * share) / 2, y);
      context.stroke();
    }
  }
  context.restore();
}

/** Redraws one moving part for `seconds`. Returns false when its paint or mask has gone. */
function redraw(
  prepared: PreparedMotion,
  images: ReadonlyMap<string, SceneBitmap>,
  paint: SceneBitmap,
  seconds: number,
): boolean {
  const context = prepared.canvas.getContext("2d");
  const mask = images.get(prepared.motion.mask);
  if (context === null || mask === undefined) return false;
  const [, , width, height] = prepared.source;
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.imageSmoothingEnabled = true;
  drawRows(context, prepared.motion, paint, prepared.source, seconds);
  drawGlints(context, prepared.motion, prepared.source, seconds);
  // Keep the moved paint only where the mask says there is water.
  context.globalCompositeOperation = "destination-in";
  context.globalAlpha = 1;
  context.drawImage(mask, 0, 0, width, height);
  return true;
}

/**
 * Draws the moving parts of one layer over it. The caller has set the layer's
 * transform and alpha, and has just drawn `paint` at the layer's rect.
 */
export function drawLayerMotion(
  context: CanvasRenderingContext2D,
  prepared: readonly PreparedMotion[],
  images: ReadonlyMap<string, SceneBitmap>,
  layerId: string,
  paint: SceneBitmap,
  seconds: number,
): void {
  for (const part of prepared) {
    if (part.motion.layer !== layerId) continue;
    const step = Math.floor(seconds * SCENE_MOTION_RATE);
    if (part.step !== step) {
      if (!redraw(part, images, paint, step / SCENE_MOTION_RATE)) continue;
      part.step = step;
    }
    const [x, y, w, h] = part.area;
    context.drawImage(part.canvas, x, y, w, h);
  }
}

/**
 * The moving parts of a painted scene, drawn from package data alone, over the
 * layer each part names. Water is redrawn into its own small canvas a fixed
 * number of times a second and that canvas is drawn every frame, so a frame pays
 * for one image draw however much the ripples cost. Light shafts and motes are
 * a handful of fills each and are drawn straight onto the frame.
 */
import { layerImageRect, type Rect, type SceneBitmap, type SceneCanvas, type ScenePackage } from "./scene-contract";
import { SCENE_MOTE_SPRITE, type SceneLight, type SceneMotes, type SceneWater } from "./scene-motion-contract";

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Times a second a moving part is redrawn. Ripples read as smooth well below the frame rate. */
export const SCENE_MOTION_RATE = 30;

type MotionCanvas = SceneCanvas & SceneBitmap;
const TURN = Math.PI * 2;

/** Water ready to draw: its canvas, and which step of time the canvas holds. */
interface PreparedWater {
  readonly motion: SceneWater;
  readonly canvas: MotionCanvas;
  /** Pixels of the layer image this part moves: [x, y, w, h]. */
  readonly source: Rect;
  /** The same pixels in layer space, where the canvas is drawn. */
  readonly area: Rect;
  step: number;
}

/** Light shafts, with the fade every beam is filled with once a frame's context has made it. */
interface PreparedLight {
  readonly motion: SceneLight;
  fade: CanvasGradient | undefined;
}

/** Motes, with the one soft speck every mote is drawn from. */
interface PreparedMotes {
  readonly motion: SceneMotes;
  readonly speck: MotionCanvas;
}

/** One moving part ready to draw. */
export type PreparedMotion = PreparedWater | PreparedLight | PreparedMotes;

function prepareWater(
  scene: ScenePackage,
  water: SceneWater,
  images: ReadonlyMap<string, SceneBitmap>,
  createCanvas: (width: number, height: number) => MotionCanvas,
): PreparedWater | undefined {
  const layer = scene.layers.find((item) => item.id === water.layer);
  const image = scene.images.find((item) => item.id === layer?.image);
  if (layer === undefined || image === undefined) return undefined;
  if (!images.has(layer.image) || !images.has(water.mask)) return undefined;
  const source = layerImageRect(image, layer, water.rect);
  const kx = layer.rect[2] / image.width;
  const ky = layer.rect[3] / image.height;
  const area: Rect = [layer.rect[0] + source[0] * kx, layer.rect[1] + source[1] * ky, source[2] * kx, source[3] * ky];
  return { motion: water, canvas: createCanvas(source[2], source[3]), source, area, step: -1 };
}

/** A round speck in `color`: a white-hot middle fading to nothing at the edge. */
function prepareSpeck(color: string, createCanvas: (width: number, height: number) => MotionCanvas): MotionCanvas {
  const speck = createCanvas(SCENE_MOTE_SPRITE, SCENE_MOTE_SPRITE);
  const context = speck.getContext("2d");
  if (context === null) return speck;
  const middle = SCENE_MOTE_SPRITE / 2;
  const glow = context.createRadialGradient(middle, middle, 0, middle, middle, middle);
  glow.addColorStop(0, "#ffffff");
  glow.addColorStop(0.18, color);
  glow.addColorStop(0.45, `${color}55`);
  glow.addColorStop(1, `${color}00`);
  context.fillStyle = glow;
  context.fillRect(0, 0, SCENE_MOTE_SPRITE, SCENE_MOTE_SPRITE);
  return speck;
}

/**
 * Makes what every moving part needs before its first frame. Water whose layer
 * or mask is missing is left out, and the scene shows still paint there.
 */
export function prepareMotion(
  scene: ScenePackage,
  images: ReadonlyMap<string, SceneBitmap>,
  createCanvas: (width: number, height: number) => MotionCanvas,
): readonly PreparedMotion[] {
  const prepared: PreparedMotion[] = [];
  for (const motion of scene.motion) {
    if (motion.kind === "light") prepared.push({ motion, fade: undefined });
    else if (motion.kind === "motes") prepared.push({ motion, speck: prepareSpeck(motion.color, createCanvas) });
    else {
      const water = prepareWater(scene, motion, images, createCanvas);
      if (water !== undefined) prepared.push(water);
    }
  }
  return prepared;
}

/** Every canvas the prepared parts hold, for releasing them with the scene's images. */
export function motionCanvases(prepared: readonly PreparedMotion[]): readonly MotionCanvas[] {
  return prepared.flatMap((part) => ("canvas" in part ? [part.canvas] : "speck" in part ? [part.speck] : []));
}

/** A position that wraps around a span, for things leaving one edge and coming back at the other. */
function wrap(value: number, span: number): number {
  return ((value % span) + span) % span;
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

  for (let row = 0; row < water.rows; row += 1) {
    const [top] = waterRow(water, row / water.rows);
    const [bottom, size] = waterRow(water, (row + 1) / water.rows);
    const y = Math.floor(top * height);
    const rowHeight = Math.max(1, Math.ceil(bottom * height) - y);
    // Two wave trains: one runs towards the viewer, a slower one runs away, so the surface never slides one way.
    const along = (row + 0.5) / water.rows;
    const near = Math.sin(TURN * (water.waves * along - seconds / water.period));
    const away = Math.sin(TURN * (water.waves * 0.37 * along + seconds / (water.period * 1.9)) + 1.7);
    const slide = water.slide * size * perUnit * (0.62 * near + 0.38 * away);
    const swell =
      water.swell *
      size *
      perUnit *
      (0.62 * Math.cos(TURN * (water.waves * along - seconds / water.period)) + 0.38 * away);
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
    const x = wrap(travel, width);
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

/** Redraws water for `seconds`. Returns false when its paint or mask has gone. */
function redraw(
  prepared: PreparedWater,
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

/** Shares of a beam's width filled by the nested passes that give it a soft edge, widest first. */
const BEAM_PASSES = [1, 0.62, 0.3] as const;

/**
 * How bright a beam is along its length (0 at the start, 1 at the far end), as
 * hex alpha: it gathers just after the start instead of at a hot point, then
 * fades to nothing.
 */
const BEAM_FADE = [
  [0, "30"],
  [0.18, "d0"],
  [0.5, "70"],
  [1, "00"],
] as const;

function drawLight(context: CanvasRenderingContext2D, part: PreparedLight, seconds: number): void {
  const light = part.motion;
  if (part.fade === undefined) {
    // One fade in a beam's own unit space, reused by every beam and frame.
    const fade = context.createLinearGradient(0, 0, 0, 1);
    for (const [at, alpha] of BEAM_FADE) fade.addColorStop(at, `${light.color}${alpha}`);
    part.fade = fade;
  }
  const strength = context.globalAlpha * light.opacity;
  context.save();
  context.beginPath();
  context.rect(...light.rect);
  context.clip();
  context.globalCompositeOperation = "lighter";
  context.fillStyle = part.fade;
  light.beams.forEach((beam, index) => {
    // Each beam breathes and leans on its own clock, so the shafts never pulse together.
    const clock = light.period * (0.75 + 0.5 * scatter(index, 6));
    const breath = 0.5 + 0.5 * Math.sin(TURN * (seconds / clock + scatter(index, 7)));
    const lean = beam.angle + light.sway * Math.sin(TURN * (seconds / (clock * 2.3) + scatter(index, 8)));
    context.save();
    context.translate(...light.from);
    context.rotate((-lean * Math.PI) / 180);
    context.scale(beam.width, beam.length);
    context.globalAlpha = (strength * (0.45 + 0.55 * breath)) / BEAM_PASSES.length;
    for (const share of BEAM_PASSES) {
      context.beginPath();
      context.moveTo((-share * light.taper) / 2, 0);
      context.lineTo((share * light.taper) / 2, 0);
      context.lineTo(share / 2, 1);
      context.lineTo(-share / 2, 1);
      context.fill();
    }
    context.restore();
  });
  context.restore();
}

function drawMotes(context: CanvasRenderingContext2D, part: PreparedMotes, seconds: number): void {
  const motes = part.motion;
  const [x, y, width, height] = motes.rect;
  const strength = context.globalAlpha * motes.opacity;
  context.save();
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < motes.count; index += 1) {
    // Nearer specks are larger and move further; each drifts, swings and twinkles on its own clock.
    const near = 0.35 + 0.65 * scatter(index, 1);
    const clock = motes.period * (0.7 + 0.6 * scatter(index, 2));
    const swing = motes.wander * near * Math.sin(TURN * (seconds / clock + scatter(index, 3)));
    const px = x + wrap(scatter(index, 4) * width + swing, width);
    const py = y + wrap(scatter(index, 5) * height - motes.rise * near * seconds, height);
    const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(TURN * (seconds / (clock * 0.45) + scatter(index, 6))));
    // The speck image is mostly soft glow; its bright middle is about a fifth of it.
    const size = motes.size * near * 5;
    context.globalAlpha = strength * twinkle;
    context.drawImage(part.speck, px - size / 2, py - size / 2, size, size);
  }
  context.restore();
}

function drawWater(
  context: CanvasRenderingContext2D,
  part: PreparedWater,
  images: ReadonlyMap<string, SceneBitmap>,
  paint: SceneBitmap,
  seconds: number,
): void {
  const step = Math.floor(seconds * SCENE_MOTION_RATE);
  if (part.step !== step) {
    if (!redraw(part, images, paint, step / SCENE_MOTION_RATE)) return;
    part.step = step;
  }
  const [x, y, w, h] = part.area;
  context.drawImage(part.canvas, x, y, w, h);
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
    if ("canvas" in part) drawWater(context, part, images, paint, seconds);
    else if ("fade" in part) drawLight(context, part, seconds);
    else drawMotes(context, part, seconds);
  }
}

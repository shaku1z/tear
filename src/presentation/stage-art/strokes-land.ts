/** Land and sky forms: ridgelines (mountains, hills, treelines) and ribbons of light hanging in the sky. */
import type { RibbonStroke, RidgeStroke } from "./stage-art-contract";
import {
  BRUSH_OPERATIONS_PER_YIELD,
  clamp01,
  fractalNoise,
  hazed,
  lightAt,
  ramp,
  rgba,
  sampleRamp,
  seededRandom,
  splineAt,
  type PaintKit,
} from "./paint-kit";

/** World px per painted column of a ridge. */
export const RIDGE_COLUMN = 2;
const RIDGE_OCTAVES = 4;
/** World px either side of a column over which its slope is read. */
const SLOPE_REACH = 14;
/** How strongly a face turned to the light brightens, and one turned away darkens. */
const FACE_CONTRAST = 0.1;
/** Value of a face that neither faces the light nor turns from it. */
const FACE_VALUE = 0.55;
/** Share of the key light's reach added to a face's value. */
const FACE_LIGHT = 0.25;
/** Value the ridge settles to at its base, where faces lose their light. */
const FOOT_VALUE = 0.38;
/** How far a column's value wanders from its neighbours, as streaks down the face. */
const STREAK = 0.04;
const STREAK_SCALE = 0.05;
/** Named summits break up along their flanks by this share of their rise. */
const PEAK_ROUGH = 0.16;
const PEAK_ROUGH_SCALE = 0.021;
/** A summit throws a shadowed face when it stands at least this far above the base, world px. */
const SPUR_MIN_HEIGHT = 70;
/** A column is a summit when nothing within this share of the span stands higher. */
const SPUR_WINDOW = 0.22;
const SPUR_STEPS = 7;
/** How far the spur's foot lands from under the summit, and how far its line wanders, as shares of its height. */
const SPUR_RUN = 0.38;
const SPUR_WANDER = 0.07;
/** How far along the crest the shadowed face reaches, as a share of the summit's height. */
const SPUR_FACE = 1.1;
/** How much darker the shadowed face is than a flat one, and how solid it is at the summit. */
const SPUR_SHADE = 0.3;
const SPUR_ALPHA = 0.8;

/** The crest row at a world column: rolling or pointed noise, lifted by the stroke's named peaks. */
export function ridgeCrest(kit: PaintKit, stroke: RidgeStroke, x: number): number {
  const noise = fractalNoise(kit.noise, x / stroke.span + stroke.seed * 17.31, stroke.seed * 3.7, RIDGE_OCTAVES);
  const pointed = 1 - Math.abs(noise * 2 - 1);
  const height = noise + (pointed - noise) * stroke.sharp;
  let lift = 0;
  for (const [cx, width, rise] of stroke.peaks ?? []) {
    const distance = Math.abs(x - cx) / width;
    if (distance >= 1) continue;
    const rough = 1 + (kit.noise(x * PEAK_ROUGH_SCALE, stroke.seed * 5.3 + cx) - 0.5) * 2 * PEAK_ROUGH;
    lift += rise * Math.pow(1 - distance, 2 - stroke.sharp) * rough;
  }
  return stroke.crest - stroke.relief * (height * 2 - 1) - lift;
}

/**
 * Each summit throws one shadowed face on the side away from the light, parted from the lit face by a spur
 * that wanders down to the base. This is what turns a silhouette into a mountain.
 */
function* paintSpurs(kit: PaintKit, stroke: RidgeStroke, random: () => number): Generator<void> {
  // Rolling ground has no faces to part: the sharper the ridge, the harder its shadow.
  if (stroke.sharp <= 0) return;
  const { context, light } = kit;
  const stops = ramp(kit, stroke.ramp);
  const left = kit.bounds[0],
    right = kit.bounds[0] + kit.bounds[2];
  const window = Math.max(RIDGE_COLUMN * 6, stroke.span * SPUR_WINDOW);
  for (let x = left; x < right; x += RIDGE_COLUMN * 2) {
    const top = ridgeCrest(kit, stroke, x);
    const height = stroke.base - top;
    if (height < SPUR_MIN_HEIGHT) continue;
    let summit = true;
    for (let offset = RIDGE_COLUMN * 2; offset <= window && summit; offset += RIDGE_COLUMN * 2) {
      summit = ridgeCrest(kit, stroke, x - offset) > top && ridgeCrest(kit, stroke, x + offset) >= top;
    }
    if (!summit) continue;
    yield;
    const away = x >= light.x ? 1 : -1;
    const reach = height * SPUR_FACE;
    context.beginPath();
    context.moveTo(x, top);
    for (let along = 6; along <= reach; along += 6) {
      context.lineTo(x + away * along, Math.min(stroke.base, ridgeCrest(kit, stroke, x + away * along)));
    }
    const spur: (readonly [number, number])[] = [];
    for (let step = 1; step <= SPUR_STEPS; step += 1) {
      const k = step / SPUR_STEPS;
      spur.push([x + away * height * (SPUR_RUN * k + (random() - 0.5) * 2 * SPUR_WANDER), top + height * k]);
    }
    for (let index = spur.length - 1; index >= 0; index -= 1) {
      const point = spur[index];
      if (point !== undefined) context.lineTo(point[0], point[1]);
    }
    context.closePath();
    const shade = hazed(kit, sampleRamp(stops, FACE_VALUE - SPUR_SHADE), stroke.haze, x, top);
    const face = context.createLinearGradient(0, top, 0, stroke.base);
    face.addColorStop(0, rgba(shade, SPUR_ALPHA * stroke.sharp));
    face.addColorStop(1, rgba(shade, 0));
    context.fillStyle = face;
    context.fill();
  }
}

export function* paintRidge(kit: PaintKit, stroke: RidgeStroke): Generator<void> {
  const { context, light } = kit;
  const stops = ramp(kit, stroke.ramp);
  const random = seededRandom(stroke.seed);
  const left = kit.bounds[0],
    right = kit.bounds[0] + kit.bounds[2];
  let operations = 0;
  for (let x = left; x < right; x += RIDGE_COLUMN) {
    if ((operations += 1) % BRUSH_OPERATIONS_PER_YIELD === 0) yield;
    const top = ridgeCrest(kit, stroke, x);
    if (top >= stroke.base) continue;
    const slope =
      (ridgeCrest(kit, stroke, x + SLOPE_REACH) - ridgeCrest(kit, stroke, x - SLOPE_REACH)) / (SLOPE_REACH * 2);
    // A face that descends toward the light is turned to it.
    const turned = clamp01(0.5 + slope * Math.sign(light.x - x) * FACE_CONTRAST) - 0.5;
    const streak = (kit.noise(x * STREAK_SCALE, stroke.seed * 9.1) - 0.5) * STREAK;
    const value = FACE_VALUE + turned + lightAt(kit, x, top) * FACE_LIGHT + streak;
    const face = context.createLinearGradient(0, top, 0, stroke.base);
    face.addColorStop(0, rgba(hazed(kit, sampleRamp(stops, value), stroke.haze, x, top)));
    face.addColorStop(1, rgba(hazed(kit, sampleRamp(stops, FOOT_VALUE + streak), stroke.haze, x, stroke.base)));
    context.fillStyle = face;
    // A hair wider than the step, so neighbouring columns never leave a seam.
    context.fillRect(x, top, RIDGE_COLUMN + 0.5, stroke.base - top);
  }
  yield* paintSpurs(kit, stroke, random);
  const teeth = stroke.teeth;
  if (teeth === undefined) return;
  for (let x = left; x < right; x += teeth.spacing * (0.6 + random() * 0.8)) {
    if ((operations += 1) % BRUSH_OPERATIONS_PER_YIELD === 0) yield;
    const foot = ridgeCrest(kit, stroke, x) + 2;
    if (foot >= stroke.base) continue;
    const tip = foot - teeth.height * (0.3 + random() * 0.7);
    const half = teeth.spacing * (0.35 + random() * 0.3);
    const value = FOOT_VALUE + (random() - 0.5) * STREAK + lightAt(kit, x, tip) * FACE_LIGHT;
    context.fillStyle = rgba(hazed(kit, sampleRamp(stops, value), stroke.haze, x, tip));
    context.beginPath();
    context.moveTo(x, tip);
    context.lineTo(x + half, foot);
    context.lineTo(x - half, foot);
    context.closePath();
    context.fill();
  }
}

/** A ray's width range, world px. */
const RAY_NARROW = 8;
const RAY_WIDE = 46;
/** A ray's height as a share of the curtain's height at its foot. */
const RAY_SHORT = 0.45;
const RAY_TALL = 1.1;
/** How far a ray's foot strays from the path, as a share of the curtain's height. */
const RAY_STRAY = 0.06;

/** World length of a ribbon's path, for its ray count and its cost. */
export function ribbonLength(stroke: RibbonStroke): number {
  let length = 0;
  for (let index = 1; index < stroke.path.length; index += 1) {
    const a = stroke.path[index - 1],
      b = stroke.path[index];
    if (a !== undefined && b !== undefined) length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

export function* paintRibbon(kit: PaintKit, stroke: RibbonStroke): Generator<void> {
  const { context } = kit;
  const stops = ramp(kit, stroke.ramp);
  const random = seededRandom(stroke.seed);
  const rays = Math.round((ribbonLength(stroke) / 100) * stroke.rays * kit.detail);
  for (let index = 0; index < rays; index += 1) {
    if (index % BRUSH_OPERATIONS_PER_YIELD === 0) yield;
    const [x, y, height] = splineAt(stroke.path, random());
    const foot = y + (random() - 0.5) * height * RAY_STRAY * 2;
    const tall = height * (RAY_SHORT + random() * (RAY_TALL - RAY_SHORT));
    const width = RAY_NARROW + random() * random() * (RAY_WIDE - RAY_NARROW);
    // Wide rays are faint washes and narrow ones the bright threads, so the curtain has body and detail.
    const strength = (stroke.alpha * (0.35 + random() * 0.65) * RAY_NARROW * 2) / (RAY_NARROW + width);
    // Brightest just above its foot, thinning to nothing at the top: the ramp runs foot to top.
    const ray = context.createLinearGradient(0, foot, 0, foot - tall);
    ray.addColorStop(0, rgba(sampleRamp(stops, 0), 0));
    ray.addColorStop(0.12, rgba(sampleRamp(stops, 0.1), strength));
    ray.addColorStop(0.5, rgba(sampleRamp(stops, 0.55), strength * 0.55));
    ray.addColorStop(1, rgba(sampleRamp(stops, 1), 0));
    context.fillStyle = ray;
    context.fillRect(x - width / 2, foot - tall, width, tall);
  }
}

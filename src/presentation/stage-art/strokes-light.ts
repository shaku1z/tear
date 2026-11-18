/** Light and air: sky, bloom, haze bands, light shafts, vignette and water. */
import type {
  FallsStroke,
  GlowStroke,
  HazeStroke,
  ShaftsStroke,
  SkyStroke,
  VignetteStroke,
  WaterStroke,
} from "./stage-art-contract";
import {
  dab,
  BRUSH_OPERATIONS_PER_YIELD,
  hazed,
  lightAt,
  mix,
  parseHex,
  ramp,
  rgba,
  sampleRamp,
  seededRandom,
  type PaintKit,
} from "./paint-kit";

function fillBounds(kit: PaintKit): void {
  const [x, y, w, h] = kit.bounds;
  kit.context.fillRect(x, y, w, h);
}

export function* paintSky(kit: PaintKit, stroke: SkyStroke): Generator<void> {
  const { context, light } = kit;
  const [, y, , h] = kit.bounds;
  const sky = context.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, stroke.top);
  sky.addColorStop(0.55, stroke.middle);
  sky.addColorStop(1, stroke.bottom);
  context.fillStyle = sky;
  fillBounds(kit);
  const glow = context.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.reach);
  glow.addColorStop(0, rgba(light.core));
  glow.addColorStop(0.12, rgba(light.glow, 0.85));
  glow.addColorStop(0.45, rgba(kit.atmosphere.haze, 0.35));
  glow.addColorStop(1, rgba(kit.atmosphere.haze, 0));
  context.fillStyle = glow;
  fillBounds(kit);
  yield;
}

export function* paintGlow(kit: PaintKit, stroke: GlowStroke): Generator<void> {
  const { context, light } = kit;
  context.save();
  context.globalCompositeOperation = "lighter";
  const glow = context.createRadialGradient(light.x, light.y, 0, light.x, light.y, stroke.radius);
  glow.addColorStop(0, rgba(light.core, stroke.alpha));
  glow.addColorStop(0.3, rgba(light.glow, stroke.alpha * 0.5));
  glow.addColorStop(1, rgba(light.glow, 0));
  context.fillStyle = glow;
  fillBounds(kit);
  context.restore();
  yield;
}

export function* paintHaze(kit: PaintKit, stroke: HazeStroke): Generator<void> {
  const { context } = kit;
  const band = context.createLinearGradient(0, stroke.top, 0, stroke.bottom);
  band.addColorStop(0, rgba(kit.atmosphere.haze, 0));
  band.addColorStop(0.5, rgba(kit.atmosphere.haze, stroke.alpha));
  band.addColorStop(1, rgba(kit.atmosphere.haze, stroke.alpha * 0.6));
  context.fillStyle = band;
  context.fillRect(kit.bounds[0], stroke.top, kit.bounds[2], stroke.bottom - stroke.top);
  yield;
}

export function* paintShafts(kit: PaintKit, stroke: ShaftsStroke): Generator<void> {
  const { context, light } = kit;
  const random = seededRandom(stroke.seed);
  const length = kit.bounds[3] * 1.3;
  context.save();
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < stroke.count; index += 1) {
    const angle = stroke.from + (stroke.to - stroke.from) * random();
    const spread = stroke.width * (0.4 + random());
    const beam = context.createLinearGradient(
      light.x,
      light.y,
      light.x + Math.cos(angle) * length,
      light.y + Math.sin(angle) * length,
    );
    beam.addColorStop(0, rgba(light.core, stroke.alpha));
    beam.addColorStop(1, rgba(light.core, 0));
    context.fillStyle = beam;
    context.beginPath();
    context.moveTo(light.x, light.y);
    context.lineTo(light.x + Math.cos(angle - spread) * length, light.y + Math.sin(angle - spread) * length);
    context.lineTo(light.x + Math.cos(angle + spread) * length, light.y + Math.sin(angle + spread) * length);
    context.closePath();
    context.fill();
  }
  context.restore();
  yield;
}

export function* paintVignette(kit: PaintKit, stroke: VignetteStroke): Generator<void> {
  const { context } = kit;
  const color = parseHex(stroke.color);
  const cx = kit.bounds[0] + kit.bounds[2] / 2,
    cy = kit.bounds[1] + kit.bounds[3] * 0.45;
  const vignette = context.createRadialGradient(cx, cy, kit.bounds[3] * 0.3, cx, cy, kit.bounds[2] * 0.5);
  vignette.addColorStop(0, rgba(color, 0));
  vignette.addColorStop(1, rgba(color, stroke.alpha));
  context.fillStyle = vignette;
  fillBounds(kit);
  yield;
}

const REFLECTION_ROW = 2;
const REFLECTION_ROWS_PER_YIELD = 8;
/** World rows above the waterline sampled per row of water: the surface is seen at a shallow angle. */
const REFLECTION_STRETCH = 1.5;
/** Share of the reflection lost by the near edge of the water. */
const REFLECTION_FADE = 0.65;
/** The key light on the water: half-width as a share of the water's depth, and its strength at full light. */
const LIGHT_PATH_WIDTH = 0.9;
const LIGHT_PATH_ALPHA = 0.32;
/** World px over which the far edge of the water fades in, so it meets the scene without a line. */
const SHORE_FEATHER = 26;
/** How far the far water takes the colour of the air. */
const FAR_WATER_HAZE = 0.6;

/** Where and how strongly to reflect: a span of water below a line, world units. */
export interface ReflectionSpan {
  readonly left: number;
  readonly width: number;
  /** The row the surface meets what stands above it. */
  readonly line: number;
  /** Rows of water below the line that carry the reflection. */
  readonly depth: number;
  readonly strength: number;
  /** Rows over which the reflection fades in from the line. */
  readonly feather: number;
}

/**
 * The one reflection pass: rows of everything already painted above the line
 * (earlier layers and this one), flipped below it, fading and rippling with
 * distance from the line. The water stroke uses it for the whole scene; a form
 * standing nearer in the water uses it for its own span.
 */
export function* reflectBelow(kit: PaintKit, random: () => number, span: ReflectionSpan): Generator<void> {
  const { context } = kit;
  const behind = kit.behind();
  yield;
  if (behind === undefined) return;
  const scale = context.getTransform().a;
  context.save();
  context.beginPath();
  context.rect(span.left, span.line, span.width, span.depth);
  context.clip();
  for (let row = 0; row < span.depth; row += REFLECTION_ROW) {
    if (row % (REFLECTION_ROW * REFLECTION_ROWS_PER_YIELD) === 0) yield;
    const k = row / span.depth;
    const sourceY = span.line - (row + REFLECTION_ROW) * REFLECTION_STRETCH;
    if (sourceY < kit.bounds[1]) break;
    const offset = Math.sin(row * 0.35 + random() * 0.6) * (1 + k * 6);
    context.globalAlpha =
      span.strength * (1 - k * REFLECTION_FADE) * Math.min(1, (row + REFLECTION_ROW) / span.feather);
    context.drawImage(
      behind,
      (span.left - kit.bounds[0]) * scale,
      (sourceY - kit.bounds[1]) * scale,
      span.width * scale,
      REFLECTION_ROW * REFLECTION_STRETCH * scale,
      span.left + offset,
      span.line + row,
      span.width,
      REFLECTION_ROW,
    );
  }
  context.restore();
}

export function* paintWater(kit: PaintKit, stroke: WaterStroke): Generator<void> {
  const { context, light } = kit;
  const stops = ramp(kit, stroke.ramp);
  const random = seededRandom(stroke.seed);
  const [left, , width, height] = kit.bounds;
  const bottom = kit.bounds[1] + height,
    depth = bottom - stroke.top;
  // Graded by distance: the far water is pale and takes the air's colour, the near water is deep and saturated.
  const far = hazed(kit, sampleRamp(stops, 0), FAR_WATER_HAZE, light.x, stroke.top);
  const feather = Math.min(0.5, SHORE_FEATHER / depth);
  const body = context.createLinearGradient(0, stroke.top, 0, bottom);
  body.addColorStop(0, rgba(far, 0));
  body.addColorStop(feather, rgba(far));
  body.addColorStop(0.45, rgba(sampleRamp(stops, 0.5)));
  body.addColorStop(1, rgba(sampleRamp(stops, 1)));
  context.fillStyle = body;
  context.fillRect(left, stroke.top, width, depth);
  yield;
  yield* reflectBelow(kit, random, {
    left,
    width,
    line: stroke.top,
    depth,
    strength: stroke.reflection,
    feather: SHORE_FEATHER,
  });
  yield;
  // The key light lies on the water as a bright path toward the viewer.
  const reach = lightAt(kit, light.x, stroke.top);
  context.save();
  context.beginPath();
  context.rect(left, stroke.top, width, depth);
  context.clip();
  context.globalCompositeOperation = "lighter";
  context.translate(light.x, stroke.top);
  context.scale(LIGHT_PATH_WIDTH, 1);
  const path = context.createRadialGradient(0, 0, 0, 0, 0, depth);
  path.addColorStop(0, rgba(light.core, LIGHT_PATH_ALPHA * reach));
  path.addColorStop(0.5, rgba(light.glow, LIGHT_PATH_ALPHA * reach * 0.4));
  path.addColorStop(1, rgba(light.glow, 0));
  context.fillStyle = path;
  context.fillRect(-depth, 0, depth * 2, depth);
  context.restore();
  const shallow = sampleRamp(stops, 0.5),
    deep = sampleRamp(stops, 1);
  const glints = Math.round(((width * depth) / 10_000) * stroke.ripples * kit.detail);
  for (let index = 0; index < glints; index += 1) {
    if (index % BRUSH_OPERATIONS_PER_YIELD === 0) yield;
    const k = Math.pow(random(), 1.2);
    const y = stroke.top + k * depth,
      x = left + random() * width;
    const trough = random() < 0.4;
    const lit = lightAt(kit, x, stroke.top) * (1 - k * 0.5);
    context.strokeStyle = trough ? rgba(deep, 0.25) : rgba(mix(shallow, light.core, 0.5 + lit * 0.5), 0.25 + lit * 0.5);
    context.lineWidth = 1 + k * (trough ? 3 : 2);
    const length = (trough ? 10 : 8) + k * (trough ? 70 : 50) * random();
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y);
    context.stroke();
  }
}

const FALLS_STREAKS_PER_PX = 0.9;
const FALLS_MIST_PER_PX = 1.6;

export function* paintFalls(kit: PaintKit, stroke: FallsStroke): Generator<void> {
  const { context, light } = kit;
  const stops = ramp(kit, stroke.ramp);
  const random = seededRandom(stroke.seed);
  const height = stroke.bottom - stroke.top;
  const pale = mix(sampleRamp(stops, 0), light.core, 0.55);
  const veil = context.createLinearGradient(0, stroke.top, 0, stroke.bottom);
  veil.addColorStop(0, rgba(hazed(kit, pale, stroke.haze, stroke.x, stroke.top), stroke.alpha * 0.55));
  veil.addColorStop(1, rgba(hazed(kit, pale, stroke.haze, stroke.x, stroke.bottom), stroke.alpha * 0.25));
  context.fillStyle = veil;
  context.fillRect(stroke.x - stroke.width / 2, stroke.top, stroke.width, height);
  const streaks = Math.round(stroke.width * FALLS_STREAKS_PER_PX * kit.detail);
  for (let index = 0; index < streaks; index += 1) {
    if (index % BRUSH_OPERATIONS_PER_YIELD === 0) yield;
    const x = stroke.x + (random() - 0.5) * stroke.width;
    const start = stroke.top + random() * height * 0.5;
    const length = height * (0.25 + random() * 0.6);
    const color = hazed(kit, random() < 0.3 ? sampleRamp(stops, 0.5) : pale, stroke.haze, x, start);
    context.fillStyle = rgba(color, stroke.alpha * (0.3 + random() * 0.6));
    context.fillRect(x, start, 0.8 + random() * 1.8, Math.min(length, stroke.bottom - start));
  }
  const mist = Math.round(stroke.width * FALLS_MIST_PER_PX * kit.detail);
  for (let index = 0; index < mist; index += 1) {
    if (index % BRUSH_OPERATIONS_PER_YIELD === 0) yield;
    const x = stroke.x + (random() - 0.5) * stroke.width * 1.8;
    const y = stroke.bottom - Math.pow(random(), 2) * height * 0.16;
    dab(context, x, y, 3 + random() * 9, 0, pale, stroke.alpha * 0.16, 0.7);
  }
}

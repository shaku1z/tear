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

export function* paintWater(kit: PaintKit, stroke: WaterStroke): Generator<void> {
  const { context, light } = kit;
  const stops = ramp(kit, stroke.ramp);
  const random = seededRandom(stroke.seed);
  const [left, , width, height] = kit.bounds;
  const bottom = kit.bounds[1] + height,
    depth = bottom - stroke.top;
  const body = context.createLinearGradient(0, stroke.top, 0, bottom);
  body.addColorStop(0, rgba(sampleRamp(stops, 0)));
  body.addColorStop(0.4, rgba(sampleRamp(stops, 0.5)));
  body.addColorStop(1, rgba(sampleRamp(stops, 1)));
  context.fillStyle = body;
  context.fillRect(left, stroke.top, width, depth);
  yield;
  // Rippled reflection: rows of everything painted above, mirrored about the waterline.
  const behind = kit.behind();
  if (behind !== undefined) {
    const scale = context.getTransform().a;
    for (let row = 0; row < depth; row += REFLECTION_ROW) {
      if (row % (REFLECTION_ROW * 40) === 0) yield;
      const k = row / depth;
      const sourceY = stroke.top - row - REFLECTION_ROW;
      if (sourceY < kit.bounds[1]) break;
      const offset = Math.sin(row * 0.35 + random() * 0.6) * (1 + k * 6);
      context.globalAlpha = stroke.reflection * (1 - k * 0.7);
      context.drawImage(
        behind,
        0,
        (sourceY - kit.bounds[1]) * scale,
        width * scale,
        REFLECTION_ROW * scale,
        left + offset,
        stroke.top + row,
        width,
        REFLECTION_ROW,
      );
    }
    context.globalAlpha = 1;
  }
  const shallow = sampleRamp(stops, 0.5),
    deep = sampleRamp(stops, 1);
  const glints = Math.round(((width * depth) / 10_000) * stroke.ripples * kit.detail);
  for (let index = 0; index < glints; index += 1) {
    if (index % BRUSH_OPERATIONS_PER_YIELD === 0) yield;
    const k = Math.pow(random(), 1.2);
    const y = stroke.top + k * depth,
      x = left + random() * width;
    const trough = random() < 0.4;
    const reach = lightAt(kit, x, stroke.top) * (1 - k * 0.5);
    context.strokeStyle = trough
      ? rgba(deep, 0.25)
      : rgba(mix(shallow, light.core, 0.5 + reach * 0.5), 0.25 + reach * 0.5);
    context.lineWidth = 1 + k * (trough ? 3 : 2);
    const length = (trough ? 10 : 8) + k * (trough ? 70 : 50) * random();
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y);
    context.stroke();
  }
  context.fillStyle = rgba(mix(kit.atmosphere.haze, light.core, 0.4), 0.35);
  context.fillRect(left, stroke.top - 1, width, 2);
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

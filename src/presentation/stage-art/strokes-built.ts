/** Built forms: ruined arcades and their reflections. */
import type { ArcadeStroke, StageArtSurface } from "./stage-art-contract";
import {
  BRUSH_OPERATIONS_PER_YIELD,
  clamp01,
  dab,
  hazed,
  lightAt,
  ramp,
  rgba,
  sampleRamp,
  seededRandom,
  type PaintKit,
  type Ramp,
  type Rgb,
} from "./paint-kit";

/** Opening proportions of one bay: pier share and the arch's rise. */
const PIER_SHARE = 0.22;
const SPRING_DROP = 0.18;
const MAX_ARCH_TO_HEIGHT = 0.38;
const REFLECTION_ALPHA = 0.45;
/** Share of the wall thickness seen as the jamb inside each arch, and how far it drops toward the viewer. */
const JAMB_SHARE = 0.7;
const JAMB_DROP = 0.3;
const RETURN_RISE = 0.35;

/** One storey's measurements and the two paths everything else is drawn from. */
interface Storey {
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  readonly pier: number;
  readonly radius: number;
  readonly spring: number;
  readonly segment: number;
  /** How far each stretch of the top edge has broken away (0 = intact). */
  readonly notches: readonly number[];
  readonly tone: (value: number) => Rgb;
  /** Adds the wall outline (with its broken top) to the current path. */
  readonly wall: () => void;
  /** Adds every arched opening to the current path. */
  readonly openings: () => void;
}

function storeyShape(kit: PaintKit, stroke: ArcadeStroke, level: number, random: () => number): Storey {
  const { context } = kit;
  const stone = ramp(kit, stroke.ramp);
  const top = stroke.y - stroke.height * (level + 1),
    bottom = stroke.y - stroke.height * level;
  const width = stroke.bays * stroke.bayWidth,
    height = bottom - top;
  const pier = stroke.bayWidth * PIER_SHARE;
  const radius = Math.min((stroke.bayWidth - pier) / 2, height * MAX_ARCH_TO_HEIGHT);
  const spring = top + height * SPRING_DROP + radius;
  const tone = (value: number) => hazed(kit, sampleRamp(stone, value), stroke.haze, stroke.x + width / 2, top);
  // A ruined top storey loses chunks of its upper edge.
  const segment = stroke.bayWidth / 3;
  const notches: number[] = [];
  for (let x = 0; x <= width + segment; x += segment) {
    const broken = level === stroke.levels - 1 && random() < (stroke.ruin ?? 0);
    notches.push(broken ? height * 0.12 + random() * random() * height * 0.45 : 0);
  }
  const wall = () => {
    context.moveTo(stroke.x, bottom);
    notches.forEach((drop, index) => {
      context.lineTo(Math.min(stroke.x + width, stroke.x + index * segment), top + drop);
    });
    context.lineTo(stroke.x + width, bottom);
    context.closePath();
  };
  const openings = () => {
    for (let bay = 0; bay < stroke.bays; bay += 1) {
      const left = stroke.x + bay * stroke.bayWidth + (stroke.bayWidth - radius * 2) / 2;
      context.moveTo(left, bottom);
      context.lineTo(left, spring);
      context.arc(left + radius, spring, radius, Math.PI, 0);
      context.lineTo(left + radius * 2, bottom);
      context.closePath();
    }
  };
  return { top, bottom, width, height, pier, radius, spring, segment, notches, tone, wall, openings };
}

/** The return face in shadow, receding away from the light, gives the block depth. */
function paintReturnFace(kit: PaintKit, stroke: ArcadeStroke, storey: Storey): void {
  const thickness = stroke.thickness ?? 0;
  if (thickness <= 0) return;
  const { context } = kit;
  const { top, bottom, width, tone } = storey;
  const away = stroke.x + width / 2 < kit.light.x ? -1 : 1;
  const edgeX = away < 0 ? stroke.x : stroke.x + width;
  const rise = thickness * RETURN_RISE;
  // The side turned from the light: darkest at the base, picking up bounce toward the top.
  const side = context.createLinearGradient(0, top, 0, bottom);
  side.addColorStop(0, rgba(tone(0.4)));
  side.addColorStop(1, rgba(tone(0.16)));
  context.fillStyle = side;
  context.beginPath();
  context.moveTo(edgeX, bottom);
  context.lineTo(edgeX, top);
  context.lineTo(edgeX + away * thickness, top - rise);
  context.lineTo(edgeX + away * thickness, bottom - rise);
  context.closePath();
  context.fill();
  context.fillStyle = rgba(tone(0.85));
  context.beginPath();
  context.moveTo(stroke.x, top);
  context.lineTo(stroke.x + width, top);
  context.lineTo(stroke.x + width + away * thickness, top - rise);
  context.lineTo(stroke.x + away * thickness, top - rise);
  context.closePath();
  context.fill();
}

/**
 * The wall thickness seen through each arch: the far jamb catching the light
 * and the soffit in shadow, so the openings read as holes through a block.
 */
function paintJambs(kit: PaintKit, stroke: ArcadeStroke, storey: Storey): void {
  const jamb = (stroke.thickness ?? 0) * JAMB_SHARE;
  if (jamb <= 0) return;
  const { context } = kit;
  const { top, bottom, width, spring, radius, tone } = storey;
  const away = stroke.x + width / 2 < kit.light.x ? -1 : 1;
  context.save();
  context.beginPath();
  storey.openings();
  context.clip();
  context.beginPath();
  storey.openings();
  context.translate(away * jamb, jamb * JAMB_DROP);
  storey.openings();
  context.translate(-away * jamb, -jamb * JAMB_DROP);
  const depth = context.createLinearGradient(0, spring - radius, 0, bottom);
  depth.addColorStop(0, rgba(tone(0.22)));
  depth.addColorStop(Math.min(0.9, (radius * 1.2) / Math.max(1, bottom - top)), rgba(tone(0.5)));
  depth.addColorStop(1, rgba(tone(0.78)));
  context.fillStyle = depth;
  context.fill("evenodd");
  context.restore();
}

/** Shadowed interior seen through the openings, the lit wall around them, and the arch reveals. */
function paintFace(kit: PaintKit, stroke: ArcadeStroke, storey: Storey): void {
  const { context } = kit;
  const { top, bottom, width, pier, radius, spring, tone } = storey;
  context.fillStyle = rgba(tone(0.08), 0.2);
  context.beginPath();
  storey.openings();
  context.fill();
  context.beginPath();
  storey.wall();
  storey.openings();
  const face = context.createLinearGradient(stroke.x, top, stroke.x + width, top);
  face.addColorStop(0, rgba(tone(0.9)));
  face.addColorStop(1, rgba(tone(0.55)));
  context.fillStyle = face;
  context.fill("evenodd");
  for (let bay = 0; bay < stroke.bays; bay += 1) {
    const left = stroke.x + bay * stroke.bayWidth + (stroke.bayWidth - radius * 2) / 2;
    const reveal = Math.max(2, pier * 0.4);
    context.strokeStyle = rgba(tone(0.2), 0.9);
    context.lineWidth = reveal;
    context.beginPath();
    context.arc(left + radius, spring, radius - reveal / 2, Math.PI * 1.15, Math.PI * 1.95);
    context.lineTo(left + radius * 2 - reveal / 2, bottom);
    context.stroke();
    context.strokeStyle = rgba(tone(1), 0.8);
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(left + radius, spring, radius + 1, Math.PI, Math.PI * 1.5);
    context.stroke();
    context.fillStyle = rgba(tone(1), 0.55);
    context.fillRect(left - pier / 2, spring, pier * 0.3, bottom - spring);
  }
}

/** Weathering inside the wall: courses, mottling and a darkening toward the base. */
function paintWeathering(kit: PaintKit, stroke: ArcadeStroke, storey: Storey, random: () => number): void {
  const { context } = kit;
  const { top, bottom, width, height, tone } = storey;
  context.save();
  context.beginPath();
  storey.wall();
  storey.openings();
  context.clip("evenodd");
  const course = Math.max(4, height * 0.09);
  context.strokeStyle = rgba(tone(0.3), 0.35);
  context.lineWidth = 1;
  for (let row = top + course; row < bottom; row += course) {
    context.beginPath();
    context.moveTo(stroke.x, row);
    context.lineTo(stroke.x + width, row);
    context.stroke();
  }
  const mottles = Math.round(width * height * 0.004 * kit.detail);
  for (let index = 0; index < mottles; index += 1) {
    const color = tone(random() < 0.6 ? 0.25 : 0.95);
    dab(context, stroke.x + random() * width, top + random() * height, 2 + random() * 6, 0, color, 0.18, 1);
  }
  const stain = context.createLinearGradient(0, top, 0, bottom);
  stain.addColorStop(0, rgba(tone(0.2), 0));
  stain.addColorStop(1, rgba(tone(0.1), 0.45));
  context.fillStyle = stain;
  context.fillRect(stroke.x, top, width, height);
  context.restore();
}

/** A wet band and a bright line where the base meets the water. */
function paintWaterline(kit: PaintKit, stroke: ArcadeStroke, storey: Storey, water: Ramp): void {
  const { context } = kit;
  const { bottom, width, height } = storey;
  const wet = context.createLinearGradient(0, bottom - height * 0.25, 0, bottom);
  wet.addColorStop(0, rgba(sampleRamp(water, 0.5), 0));
  wet.addColorStop(1, rgba(sampleRamp(water, 0), 0.55));
  context.fillStyle = wet;
  context.fillRect(stroke.x - 5, bottom - height * 0.25, width + 10, height * 0.25);
  context.fillStyle = rgba(kit.light.core, 0.35);
  context.fillRect(stroke.x - 6, bottom - 1, width + 12, 2);
}

/** Cornice runs along every stretch of the top edge that still stands. */
function paintCornices(kit: PaintKit, stroke: ArcadeStroke, storey: Storey): void {
  const { context } = kit;
  const { top, width, height, segment, notches, tone } = storey;
  const cornice = Math.max(3, height * 0.06);
  notches.forEach((drop, index) => {
    if (drop > 0 || (notches[index + 1] ?? 0) > 0) return;
    const x = stroke.x + index * segment - (index === 0 ? 5 : 0);
    const run = Math.min(segment + (index === 0 ? 5 : 0), stroke.x + width + 5 - x);
    if (run <= 0) return;
    context.fillStyle = rgba(tone(1));
    context.fillRect(x, top, run, cornice);
    context.fillStyle = rgba(tone(0.25), 0.9);
    context.fillRect(x, top + cornice, run, Math.max(2, height * 0.025));
  });
}

/** Ivy hanging in drips from the top and gathered in tufts along it. */
function* paintIvy(kit: PaintKit, stroke: ArcadeStroke, storey: Storey, random: () => number): Generator<void> {
  const { context } = kit;
  const { top, width, height } = storey;
  const moss = ramp(kit, stroke.mossRamp);
  const ivy = (x: number, y: number, size: number, angle: number, jitter: number) => {
    const value = clamp01(lightAt(kit, x, y) * 0.8 + jitter);
    dab(context, x, y, size, angle, hazed(kit, sampleRamp(moss, value), stroke.haze, x, y), 0.9);
  };
  const ivyAmount = stroke.ivy ?? 1;
  for (let drip = 0; drip < stroke.bays * 3 * ivyAmount; drip += 1) {
    const x = stroke.x + random() * width,
      length = height * (0.2 + random() * 0.6);
    for (let travelled = 0; travelled < length; travelled += 3) {
      ivy(x + Math.sin(travelled * 0.2) * 2, top + travelled, 1.5 + random() * 2, 1.5, (random() - 0.5) * 0.4);
    }
  }
  const tufts = Math.round(width * 1.2 * ivyAmount * kit.detail);
  for (let index = 0; index < tufts; index += 1) {
    if (index % BRUSH_OPERATIONS_PER_YIELD === 0) yield;
    const x = stroke.x + random() * width,
      y = top - 3 + Math.pow(random(), 2.6) * height;
    ivy(x, y, 1.5 + random() * 2.5, random() * 3, (random() - 0.3) * 0.6 + lightAt(kit, x, y) * 0.2);
  }
}

function* storey(
  kit: PaintKit,
  stroke: ArcadeStroke,
  level: number,
  random: () => number,
  water: Ramp | undefined,
): Generator<void> {
  const shape = storeyShape(kit, stroke, level, random);
  paintReturnFace(kit, stroke, shape);
  paintFace(kit, stroke, shape);
  paintJambs(kit, stroke, shape);
  yield;
  paintWeathering(kit, stroke, shape, random);
  if (water !== undefined && level === 0) paintWaterline(kit, stroke, shape, water);
  paintCornices(kit, stroke, shape);
  yield;
  yield* paintIvy(kit, stroke, shape, random);
}

function* arcadeBody(kit: PaintKit, stroke: ArcadeStroke, water: Ramp | undefined): Generator<void> {
  const random = seededRandom(stroke.seed);
  for (let level = 0; level < stroke.levels; level += 1) yield* storey(kit, stroke, level, random, water);
}

export function* paintArcade(kit: PaintKit, stroke: ArcadeStroke): Generator<void> {
  const water = stroke.waterRamp === undefined ? undefined : ramp(kit, stroke.waterRamp);
  const { context } = kit;
  if (water !== undefined) {
    // The reflection: the same arcade mirrored about its base, faint and tinted by the water.
    context.save();
    context.translate(0, 2 * stroke.y);
    context.scale(1, -1);
    context.globalAlpha = REFLECTION_ALPHA;
    yield* arcadeBody(kit, stroke, undefined);
    context.restore();
  }
  yield* arcadeBody(kit, stroke, water);
}

/**
 * Platform surface strip, lit top edge at row 0, seamless when repeated across:
 * stone body with coursing, a moss lip and hanging tufts. Painted in strip px.
 */
export function* paintSurface(kit: PaintKit, surface: StageArtSurface): Generator<void> {
  const { context } = kit;
  const random = seededRandom(surface.width * 31 + surface.height);
  const stone = ramp(kit, surface.ramp),
    moss = ramp(kit, surface.mossRamp);
  const { width, height } = surface;
  const body = context.createLinearGradient(0, 0, 0, height);
  body.addColorStop(0, rgba(sampleRamp(stone, 0.55)));
  body.addColorStop(0.3, rgba(sampleRamp(stone, 0.35)));
  body.addColorStop(1, rgba(sampleRamp(stone, 0.1)));
  context.fillStyle = body;
  context.fillRect(0, 0, width, height);
  // Draws at x and its wrapped twin so the strip tiles without a seam.
  const wrapped = (x: number, draw: (at: number) => void) => {
    draw(x);
    if (x < width * 0.1) draw(x + width);
    if (x > width * 0.9) draw(x - width);
  };
  const block = height * 0.32;
  context.strokeStyle = rgba(sampleRamp(stone, 0.05), 0.6);
  context.lineWidth = 1;
  for (let row = 0; row * block < height; row += 1) {
    const y = height * 0.18 + row * block;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
    for (let x = (row % 2) * block; x < width; x += block * 1.6) {
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x, y + block);
      context.stroke();
    }
  }
  yield;
  for (let index = 0; index < width * height * 0.02; index += 1) {
    const x = random() * width,
      y = random() * height;
    wrapped(x, (at) => {
      dab(context, at, y, 1 + random() * 3, 0, sampleRamp(stone, random() * 0.7), 0.25, 1);
    });
  }
  for (let index = 0; index < width * 1.6; index += 1) {
    if (index % BRUSH_OPERATIONS_PER_YIELD === 0) yield;
    const x = random() * width,
      y = Math.pow(random(), 3) * height * 0.55;
    const value = clamp01(0.85 - y / (height * 0.5) + (random() - 0.5) * 0.4);
    wrapped(x, (at) => {
      dab(context, at, y, 1.5 + random() * 2.5, random() * 3, sampleRamp(moss, value), 0.95);
    });
  }
  context.fillStyle = rgba(sampleRamp(moss, 1), 0.5);
  context.fillRect(0, 0, width, 1.5);
}

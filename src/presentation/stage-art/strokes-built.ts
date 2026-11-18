/** Built forms: ruined arcades and the platform surface. */
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
  type Rgb,
} from "./paint-kit";

/** Opening proportions of one bay: pier share and the arch's rise. */
const PIER_SHARE = 0.22;
const SPRING_DROP = 0.18;
const MAX_ARCH_TO_HEIGHT = 0.38;
/** Share of the wall thickness seen as the jamb inside each arch, and how far it drops toward the viewer. */
const JAMB_SHARE = 0.7;
const JAMB_DROP = 0.3;
const RETURN_RISE = 0.35;
/** Stone far from the key light keeps this share of its value; the rest comes with the light. */
const UNLIT_STONE = 0.5;
/** Mist at the foot of a ruin: how far up the bottom storey it climbs, and its strength per unit of haze. */
const BASE_MIST_RISE = 0.7;
const BASE_MIST_PER_HAZE = 1.3;
/** How dark an arch's interior is when the recipe does not say (0 see-through .. 1 solid shadow). */
const DEFAULT_REVEAL = 0.2;
/** Stretches of top edge per bay; each may break away as a block of masonry. */
const EDGE_STEPS_PER_BAY = 4;
/** A column's capital and base: width and height as multiples of the shaft width. */
const CAPITAL_WIDTH = 1.6;
const CAPITAL_HEIGHT = 0.55;

/** One storey's measurements and the two paths everything else is drawn from. */
interface Storey {
  /** Left edge and bay count of this storey: upper storeys may stand over fewer bays. */
  readonly x: number;
  readonly bays: number;
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

/** Bays still standing on a storey, and where they start: upper storeys keep a share, gathered to one side. */
function standingSpan(stroke: ArcadeStroke, level: number): readonly [x: number, bays: number] {
  if (level >= stroke.levels) return [stroke.x, 0];
  const bays = Math.max(1, Math.round(stroke.bays * Math.pow(stroke.standing ?? 1, level)));
  const fromRight = stroke.seed % 2 === 1;
  return [fromRight ? stroke.x + (stroke.bays - bays) * stroke.bayWidth : stroke.x, bays];
}

function storeyShape(kit: PaintKit, stroke: ArcadeStroke, level: number, random: () => number): Storey {
  const { context } = kit;
  const stone = ramp(kit, stroke.ramp);
  const [x, bays] = standingSpan(stroke, level);
  const [aboveX, aboveBays] = standingSpan(stroke, level + 1);
  const top = stroke.y - stroke.height * (level + 1),
    bottom = stroke.y - stroke.height * level;
  const width = bays * stroke.bayWidth,
    height = bottom - top;
  const pier = stroke.bayWidth * PIER_SHARE;
  const radius = Math.min((stroke.bayWidth - pier) / 2, height * MAX_ARCH_TO_HEIGHT);
  const spring = top + height * SPRING_DROP + radius;
  const lit = UNLIT_STONE + (1 - UNLIT_STONE) * lightAt(kit, x + width / 2, top);
  const tone = (value: number) => hazed(kit, sampleRamp(stone, value * lit), stroke.haze, x + width / 2, top);
  // Wherever nothing stands on it, the top edge loses blocks of masonry.
  const segment = stroke.bayWidth / EDGE_STEPS_PER_BAY;
  const notches: number[] = [];
  for (let at = 0; at <= width + segment / 2; at += segment) {
    const covered = x + at >= aboveX && x + at <= aboveX + aboveBays * stroke.bayWidth;
    const broken = !covered && random() < (stroke.ruin ?? 0);
    notches.push(broken ? height * 0.1 + random() * random() * height * 0.5 : 0);
  }
  const wall = () => {
    let edge = top + (notches[0] ?? 0);
    context.moveTo(x, bottom);
    context.lineTo(x, edge);
    notches.forEach((drop, index) => {
      const at = Math.min(x + width, x + index * segment);
      context.lineTo(at, edge);
      edge = top + drop;
      context.lineTo(at, edge);
    });
    context.lineTo(x + width, edge);
    context.lineTo(x + width, bottom);
    context.closePath();
  };
  const openings = () => {
    for (let bay = 0; bay < bays; bay += 1) {
      const left = x + bay * stroke.bayWidth + (stroke.bayWidth - radius * 2) / 2;
      context.moveTo(left, bottom);
      context.lineTo(left, spring);
      context.arc(left + radius, spring, radius, Math.PI, 0);
      context.lineTo(left + radius * 2, bottom);
      context.closePath();
    }
  };
  return { x, bays, top, bottom, width, height, pier, radius, spring, segment, notches, tone, wall, openings };
}

/** The return face in shadow, receding away from the light, gives the block depth. */
function paintReturnFace(kit: PaintKit, stroke: ArcadeStroke, storey: Storey): void {
  const thickness = stroke.thickness ?? 0;
  if (thickness <= 0) return;
  const { context } = kit;
  const { top, bottom, width, tone } = storey;
  const away = storey.x + width / 2 < kit.light.x ? -1 : 1;
  const edgeX = away < 0 ? storey.x : storey.x + width;
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
  context.moveTo(storey.x, top);
  context.lineTo(storey.x + width, top);
  context.lineTo(storey.x + width + away * thickness, top - rise);
  context.lineTo(storey.x + away * thickness, top - rise);
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
  const away = storey.x + width / 2 < kit.light.x ? -1 : 1;
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
  // The interior: deepest shadow under the arch, thinning toward the floor so the far side still shows.
  const reveal = stroke.reveal ?? DEFAULT_REVEAL;
  const interior = context.createLinearGradient(0, spring - radius, 0, bottom);
  interior.addColorStop(0, rgba(tone(0.04), reveal));
  interior.addColorStop(1, rgba(tone(0.1), reveal * 0.45));
  context.fillStyle = interior;
  context.beginPath();
  storey.openings();
  context.fill();
  context.beginPath();
  storey.wall();
  storey.openings();
  const face = context.createLinearGradient(storey.x, top, storey.x + width, top);
  face.addColorStop(0, rgba(tone(0.9)));
  face.addColorStop(1, rgba(tone(0.55)));
  context.fillStyle = face;
  context.fill("evenodd");
  for (let bay = 0; bay < storey.bays; bay += 1) {
    const left = storey.x + bay * stroke.bayWidth + (stroke.bayWidth - radius * 2) / 2;
    const lip = Math.max(2, pier * 0.4);
    context.strokeStyle = rgba(tone(0.2), 0.9);
    context.lineWidth = lip;
    context.beginPath();
    context.arc(left + radius, spring, radius - lip / 2, Math.PI * 1.15, Math.PI * 1.95);
    context.lineTo(left + radius * 2 - lip / 2, bottom);
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

/**
 * A column standing against each pier: a shaft lit on the side facing the key
 * light, a capital, a base and the shadow it casts on the wall behind.
 */
function paintColumns(kit: PaintKit, stroke: ArcadeStroke, storey: Storey): void {
  const shaft = storey.pier * (stroke.columns ?? 0);
  if (shaft <= 0) return;
  const { context } = kit;
  const { top, bottom, width, segment, notches, tone } = storey;
  const towardLight = storey.x + width / 2 < kit.light.x ? 1 : -1;
  const capital = shaft * CAPITAL_HEIGHT;
  for (let pier = 0; pier <= storey.bays; pier += 1) {
    const centre = Math.min(storey.x + width - shaft, Math.max(storey.x + shaft, storey.x + pier * stroke.bayWidth));
    const head = top + (notches[Math.round((centre - storey.x) / segment)] ?? 0);
    if (bottom - head < capital * 4) continue;
    const left = centre - shaft / 2;
    context.fillStyle = rgba(tone(0.12), 0.5);
    context.fillRect(left - towardLight * shaft * 0.45, head + capital, shaft, bottom - head - capital);
    const round = context.createLinearGradient(left, 0, left + shaft, 0);
    round.addColorStop(towardLight > 0 ? 1 : 0, rgba(tone(1)));
    round.addColorStop(0.5, rgba(tone(0.72)));
    round.addColorStop(towardLight > 0 ? 0 : 1, rgba(tone(0.34)));
    context.fillStyle = round;
    context.fillRect(left, head + capital, shaft, bottom - head - capital * 2);
    const block = shaft * CAPITAL_WIDTH;
    context.fillStyle = rgba(tone(0.95));
    context.fillRect(centre - block / 2, head, block, capital);
    context.fillStyle = rgba(tone(0.6));
    context.fillRect(centre - block / 2, bottom - capital, block, capital);
    context.fillStyle = rgba(tone(0.2), 0.8);
    context.fillRect(centre - block / 2, head + capital, block, Math.max(1, capital * 0.25));
  }
}

/** Weathering inside the wall: courses, mottling and a darkening toward the base. */
function paintWeathering(kit: PaintKit, storey: Storey, random: () => number): void {
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
    context.moveTo(storey.x, row);
    context.lineTo(storey.x + width, row);
    context.stroke();
  }
  const mottles = Math.round(width * height * 0.004 * kit.detail);
  for (let index = 0; index < mottles; index += 1) {
    const color = tone(random() < 0.6 ? 0.25 : 0.95);
    dab(context, storey.x + random() * width, top + random() * height, 2 + random() * 6, 0, color, 0.18, 1);
  }
  const stain = context.createLinearGradient(0, top, 0, bottom);
  stain.addColorStop(0, rgba(tone(0.2), 0));
  stain.addColorStop(1, rgba(tone(0.1), 0.45));
  context.fillStyle = stain;
  context.fillRect(storey.x, top, width, height);
  context.restore();
}

/** Cornice runs along every stretch of the top edge that still stands. */
function paintCornices(kit: PaintKit, storey: Storey): void {
  const { context } = kit;
  const { top, width, height, segment, notches, tone } = storey;
  const cornice = Math.max(3, height * 0.06);
  notches.forEach((drop, index) => {
    if (drop > 0 || (notches[index + 1] ?? 0) > 0) return;
    const x = storey.x + index * segment - (index === 0 ? 5 : 0);
    const run = Math.min(segment + (index === 0 ? 5 : 0), storey.x + width + 5 - x);
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
  for (let drip = 0; drip < storey.bays * 3 * ivyAmount; drip += 1) {
    const x = storey.x + random() * width,
      length = height * (0.2 + random() * 0.6);
    for (let travelled = 0; travelled < length; travelled += 3) {
      ivy(x + Math.sin(travelled * 0.2) * 2, top + travelled, 1.5 + random() * 2, 1.5, (random() - 0.5) * 0.4);
    }
  }
  const tufts = Math.round(width * 1.2 * ivyAmount * kit.detail);
  for (let index = 0; index < tufts; index += 1) {
    if (index % BRUSH_OPERATIONS_PER_YIELD === 0) yield;
    const x = storey.x + random() * width,
      y = top - 3 + Math.pow(random(), 2.6) * height;
    ivy(x, y, 1.5 + random() * 2.5, random() * 3, (random() - 0.3) * 0.6 + lightAt(kit, x, y) * 0.2);
  }
}

function* storey(kit: PaintKit, stroke: ArcadeStroke, level: number, random: () => number): Generator<void> {
  const shape = storeyShape(kit, stroke, level, random);
  paintReturnFace(kit, stroke, shape);
  paintFace(kit, stroke, shape);
  paintJambs(kit, stroke, shape);
  yield;
  paintWeathering(kit, shape, random);
  paintColumns(kit, stroke, shape);
  paintCornices(kit, shape);
  yield;
  yield* paintIvy(kit, stroke, shape, random);
}

/**
 * Mist gathers at the foot of a ruin in proportion to its haze, so distant
 * blocks lose their bases into the air and the water instead of standing as boxes.
 */
function paintBaseMist(kit: PaintKit, stroke: ArcadeStroke): void {
  const strength = clamp01(stroke.haze * BASE_MIST_PER_HAZE);
  if (strength <= 0) return;
  const { context } = kit;
  const foot = storeyShape(kit, stroke, 0, seededRandom(stroke.seed));
  const rise = foot.height * BASE_MIST_RISE;
  const air = hazed(kit, kit.atmosphere.haze, 1, stroke.x + foot.width / 2, stroke.y);
  const mist = context.createLinearGradient(0, stroke.y - rise, 0, stroke.y);
  mist.addColorStop(0, rgba(air, 0));
  mist.addColorStop(1, rgba(air, strength));
  context.save();
  context.beginPath();
  foot.wall();
  context.clip();
  context.fillStyle = mist;
  context.fillRect(stroke.x, stroke.y - rise, foot.width, rise);
  context.restore();
}

export function* paintArcade(kit: PaintKit, stroke: ArcadeStroke): Generator<void> {
  const random = seededRandom(stroke.seed);
  for (let level = 0; level < stroke.levels; level += 1) yield* storey(kit, stroke, level, random);
  paintBaseMist(kit, stroke);
}

/** Share of the strip's height under solid moss, and how far the hanging tufts reach. */
const MOSS_BAND = 0.34;
const MOSS_REACH = 0.7;
const MOSS_TUFTS_PER_PX = 2.6;

/**
 * Platform surface strip, lit top edge at row 0, seamless when repeated across:
 * a bright moss band over a dark stone body, so a platform reads as a light
 * edge on a dark bar against any painted scene. Painted in strip px.
 */
export function* paintSurface(kit: PaintKit, surface: StageArtSurface): Generator<void> {
  const { context } = kit;
  const random = seededRandom(surface.width * 31 + surface.height);
  const stone = ramp(kit, surface.ramp),
    moss = ramp(kit, surface.mossRamp);
  const { width, height } = surface;
  const body = context.createLinearGradient(0, 0, 0, height);
  body.addColorStop(0, rgba(sampleRamp(stone, 0.34)));
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
  context.strokeStyle = rgba(sampleRamp(stone, 0), 0.6);
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
      dab(context, at, y, 1 + random() * 3, 0, sampleRamp(stone, random() * 0.4), 0.25, 1);
    });
  }
  const band = context.createLinearGradient(0, 0, 0, height * MOSS_BAND);
  band.addColorStop(0, rgba(sampleRamp(moss, 0.95)));
  band.addColorStop(1, rgba(sampleRamp(moss, 0.5)));
  context.fillStyle = band;
  context.fillRect(0, 0, width, height * MOSS_BAND);
  for (let index = 0; index < width * MOSS_TUFTS_PER_PX; index += 1) {
    if (index % BRUSH_OPERATIONS_PER_YIELD === 0) yield;
    const x = random() * width,
      y = Math.pow(random(), 2) * height * MOSS_REACH;
    const value = clamp01(1 - y / (height * MOSS_REACH) + (random() - 0.5) * 0.4);
    wrapped(x, (at) => {
      dab(context, at, y, 1.5 + random() * 2.5, random() * 3, sampleRamp(moss, value), 0.95);
    });
  }
  context.fillStyle = rgba(sampleRamp(moss, 1), 0.8);
  context.fillRect(0, 0, width, 2);
}

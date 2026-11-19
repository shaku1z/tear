/** Living forms: dappled masses, hanging strands, trunks and roots. */
import type { MassShape, MassStroke, ScatterStroke, StrandsStroke, TrunkStroke } from "./stage-art-contract";
import {
  BRUSH_OPERATIONS_PER_YIELD,
  clamp01,
  dab,
  fractalNoise,
  hazed,
  lightAt,
  parseHex,
  ramp,
  rgba,
  sampleRamp,
  seededRandom,
  splineAt,
  type PaintKit,
} from "./paint-kit";

/** Area of a shape's bounding box clipped to the layer, in square world px. */
export function shapeBounds(shape: MassShape, layer: readonly [number, number, number, number]) {
  if (shape.outside === true) return { x: layer[0], y: layer[1], w: layer[2], h: layer[3] };
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const [cx, cy, rx, ry] of shape.blobs) {
    const pad = 1 + shape.rough;
    left = Math.min(left, cx - rx * pad);
    right = Math.max(right, cx + rx * pad);
    top = Math.min(top, cy - ry * pad);
    bottom = Math.max(bottom, cy + ry * pad);
  }
  const x = Math.max(left, layer[0]),
    y = Math.max(top, layer[1]);
  const w = Math.min(right, layer[0] + layer[2]) - x,
    h = Math.min(bottom, layer[1] + layer[3]) - y;
  return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
}

/** 0 outside the shape, rising to 1 a little inside its rough edge. */
function shapeDensity(kit: PaintKit, shape: MassShape): (x: number, y: number) => number {
  const edge = (blobIndex: number, angle: number) =>
    1 +
    (kit.noise(Math.cos(angle) * shape.lobes + blobIndex * 17, Math.sin(angle) * shape.lobes + 5) - 0.5) *
      2 *
      shape.rough;
  if (shape.outside === true) {
    const [cx, cy, rx, ry] = shape.blobs[0] ?? [0, 0, 1, 1];
    return (x, y) => {
      const dx = (x - cx) / rx,
        dy = (y - cy) / ry;
      const d = Math.hypot(dx, dy) / edge(0, Math.atan2(dy, dx));
      return d > 1 ? Math.min(1, (d - 1) * 6) : 0;
    };
  }
  return (x, y) => {
    let best = 0;
    shape.blobs.forEach(([cx, cy, rx, ry], index) => {
      const dx = (x - cx) / rx,
        dy = (y - cy) / ry;
      const d = Math.hypot(dx, dy) / edge(index, Math.atan2(dy, dx));
      if (d < 1) best = Math.max(best, Math.min(1, (1 - d) * 4));
    });
    return best;
  };
}

const BLOCK_IN_SHARE = 0.25;
const CLUMP_SCALE = 40;

export function* paintMass(kit: PaintKit, stroke: MassStroke): Generator<void> {
  const { context } = kit;
  const random = seededRandom(stroke.seed);
  const stops = ramp(kit, stroke.ramp);
  const inside = shapeDensity(kit, stroke.shape);
  const box = shapeBounds(stroke.shape, kit.bounds);
  const count = Math.round(((box.w * box.h) / 10_000) * stroke.density * kit.detail);
  const bias = stroke.lightBias ?? 0;
  const backlight = stroke.backlight ?? 0;
  // Block-in: big soft dabs lay down the value structure the leaves texture.
  const blocks = Math.round(count * BLOCK_IN_SHARE);
  for (let index = 0; index < blocks; index += 1) {
    if (index % BRUSH_OPERATIONS_PER_YIELD === 0) yield;
    const x = box.x + random() * box.w,
      y = box.y + random() * box.h;
    const density = inside(x, y);
    if (density <= 0 || random() > density) continue;
    const value = lightAt(kit, x, y) + bias + (fractalNoise(kit.noise, x / 90, y / 90, 3) - 0.5) * 0.6;
    const color = hazed(kit, sampleRamp(stops, clamp01(value) * 0.85), stroke.haze, x, y);
    dab(context, x, y, stroke.size * 2.6, random() * Math.PI, color, 0.5);
  }
  for (let index = 0; index < count; index += 1) {
    if (index % BRUSH_OPERATIONS_PER_YIELD === 0) yield;
    const x = box.x + random() * box.w,
      y = box.y + random() * box.h;
    const density = inside(x, y);
    if (density <= 0 || random() > density) continue;
    // Noise clumps give leaf-cluster forms; light comes from the key light.
    const clump = fractalNoise(kit.noise, x / CLUMP_SCALE, y / CLUMP_SCALE, 3);
    const light = lightAt(kit, x, y);
    let value = clamp01(light * 0.9 + bias + (clump - 0.5) * 0.9 + (random() - 0.5) * 0.25);
    // Against the light, leaves go dark with bright translucent flecks.
    const contre = light * light * backlight;
    value = value * (1 - contre) + contre * (random() < 0.3 + clump * 0.2 ? 0.98 : 0.28 + clump * 0.25);
    const color = hazed(kit, sampleRamp(stops, value), stroke.haze, x, y);
    dab(context, x, y, stroke.size * (0.6 + random() * 0.8), 0.6 + (random() - 0.5) * 1.6, color, 0.95);
  }
}

export function* paintStrands(kit: PaintKit, stroke: StrandsStroke): Generator<void> {
  const { context } = kit;
  const random = seededRandom(stroke.seed);
  const stops = ramp(kit, stroke.ramp);
  const [ax, ay, aw, ah] = stroke.area;
  const strands = Math.round(stroke.count * kit.detail);
  const step = stroke.size * (stroke.form === "curtain" ? 1.3 : 0.9);
  let operations = 0;
  for (let index = 0; index < strands; index += 1) {
    const x = ax + random() * aw,
      y = ay + random() * ah * 0.4;
    const length = stroke.length * (0.5 + random() * 0.7);
    const sway = (random() - 0.5) * 30,
      lift = (random() - 0.5) * 0.3;
    for (let travelled = 0; travelled < length; travelled += step) {
      if (++operations % BRUSH_OPERATIONS_PER_YIELD === 0) yield;
      const k = travelled / length;
      const px = x + Math.sin(k * 4 + index) * (stroke.form === "curtain" ? 3 : 6) + sway * k * k,
        py = y + travelled;
      const value = clamp01(lightAt(kit, px, py) * 1.05 + lift + (random() - 0.5) * 0.35 - k * 0.2);
      const color = hazed(kit, sampleRamp(stops, value), stroke.haze, px, py);
      if (stroke.form === "curtain") {
        context.fillStyle = rgba(color, 0.5 * (1 - k * 0.6));
        context.fillRect(px - stroke.size * 0.4, py, stroke.size * 0.8, stroke.size * 1.6);
      } else {
        const size = stroke.size * (1 - k * 0.5);
        dab(context, px + (random() - 0.5) * 6, py, size, Math.PI / 2 + (random() - 0.5) * 1.2, color, 0.95);
      }
    }
  }
}

const TRUNK_SAMPLES = 120;
const MODEL_BANDS = 7;
const MOSS_PER_PATCH = 18;

interface SpineSample {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  /** Unit normal across the trunk. */
  readonly nx: number;
  readonly ny: number;
}

function sampleSpine(stroke: TrunkStroke): readonly SpineSample[] {
  const samples: SpineSample[] = [];
  for (let index = 0; index <= TRUNK_SAMPLES; index += 1) {
    const t = index / TRUNK_SAMPLES;
    const [x, y, w] = splineAt(stroke.spine, t);
    const [ax, ay] = splineAt(stroke.spine, Math.max(0, t - 0.01));
    const [bx, by] = splineAt(stroke.spine, Math.min(1, t + 0.01));
    const length = Math.hypot(bx - ax, by - ay) || 1;
    samples.push({ x, y, w, nx: -(by - ay) / length, ny: (bx - ax) / length });
  }
  return samples;
}

function fillBand(kit: PaintKit, samples: readonly SpineSample[], from: number, to: number, fill: string): void {
  const { context } = kit;
  context.fillStyle = fill;
  context.beginPath();
  samples.forEach((s, index) => {
    const x = s.x + s.nx * s.w * from,
      y = s.y + s.ny * s.w * from;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const s = samples[index];
    if (s !== undefined) context.lineTo(s.x + s.nx * s.w * to, s.y + s.ny * s.w * to);
  }
  context.closePath();
  context.fill();
}

/** Splits a spine into limbs wound around it (a braided trunk or root bundle). */
function braidLimbs(samples: readonly SpineSample[], limbs: number, turns: number, random: () => number) {
  const result: SpineSample[][] = [];
  for (let limb = 0; limb < limbs; limb += 1) {
    const phase = (limb / limbs) * Math.PI * 2 + random() * 0.6;
    const spin = turns * (0.7 + random() * 0.6);
    result.push(
      samples.map((s, index) => {
        const t = index / TRUNK_SAMPLES;
        const across = Math.sin(phase + t * spin) * 0.55;
        return { ...s, x: s.x + s.nx * s.w * across, y: s.y + s.ny * s.w * across, w: s.w * (0.42 + random() * 0.04) };
      }),
    );
  }
  return result;
}

export function* paintTrunk(kit: PaintKit, stroke: TrunkStroke): Generator<void> {
  const random = seededRandom(stroke.seed);
  const samples = sampleSpine(stroke);
  const limbs = stroke.braid ?? 1;
  if (limbs > 1) {
    // Deep shadow between the limbs, then each limb lit on its own.
    const middle = samples[TRUNK_SAMPLES >> 1];
    if (middle === undefined) return;
    fillBand(
      kit,
      samples,
      -0.95,
      0.95,
      rgba(hazed(kit, sampleRamp(ramp(kit, stroke.ramp), 0.02), stroke.haze, middle.x, middle.y)),
    );
    for (const limb of braidLimbs(samples, limbs, stroke.twist * 0.5, random)) {
      yield* paintLimb(kit, { ...stroke, fibers: Math.ceil(stroke.fibers / limbs), moss: 0 }, limb, random);
    }
  } else {
    yield* paintLimb(kit, { ...stroke, moss: 0 }, samples, random);
  }
  yield* paintMoss(kit, stroke, samples, random);
}

/** Which way the spine normals point: -1 or 1 (a flat normal counts as 1). */
function normalSide(samples: readonly SpineSample[]): -1 | 1 {
  return (samples[0]?.nx ?? 1) < 0 ? -1 : 1;
}

function* paintLimb(
  kit: PaintKit,
  stroke: TrunkStroke,
  samples: readonly SpineSample[],
  random: () => number,
): Generator<void> {
  const { context } = kit;
  const stops = ramp(kit, stroke.ramp);
  const middle = samples[TRUNK_SAMPLES >> 1] ?? samples[0];
  if (middle === undefined) return;
  // Normals point to one side of travel; flip so `lit` always means the side facing the light.
  const lit = normalSide(samples) * stroke.litSide;
  const localLight = stroke.light * (0.35 + 0.65 * lightAt(kit, middle.x, middle.y));
  const tone = (value: number, x: number, y: number) =>
    hazed(kit, sampleRamp(stops, clamp01(value)), stroke.haze, x, y);
  // Model the limb round: bands from the shadowed edge to the lit edge.
  for (let index = 0; index < MODEL_BANDS; index += 1) {
    const from = -1 + (index * 2) / MODEL_BANDS,
      to = Math.min(1, from + 2 / MODEL_BANDS + 0.04);
    const across = (from + to) / 2;
    const side = clamp01(0.5 - across * lit * 0.5);
    fillBand(kit, samples, from, to, rgba(tone((0.1 + Math.pow(side, 1.3) * 0.55) * localLight, middle.x, middle.y)));
  }
  yield;
  context.lineCap = "round";
  context.lineJoin = "round";
  const fibre = (dark: boolean) => {
    const phase = random() * Math.PI * 2;
    const turns = stroke.twist * (0.3 + random()) * (random() < 0.5 ? -1 : 1);
    const start = dark ? 0 : random() * 0.3,
      end = dark ? 1 : 0.7 + random() * 0.3;
    const thickness = dark ? 0.045 : 0.04 + random() * 0.06;
    const wobble = random() * 10;
    let run: [number, number][] = [];
    const flush = () => {
      const mid = run[run.length >> 1];
      if (run.length > 2 && mid !== undefined) {
        const [mx, my] = mid;
        const value = dark ? 0.03 : (0.35 + lightAt(kit, mx, my) * 0.45 + (random() - 0.5) * 0.3) * stroke.light;
        context.strokeStyle = rgba(tone(value, mx, my), dark ? 0.75 : 0.6);
        context.beginPath();
        run.forEach(([x, y], index) => {
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
      }
      run = [];
    };
    for (let index = Math.floor(start * TRUNK_SAMPLES); index <= end * TRUNK_SAMPLES; index += 1) {
      const s = samples[index];
      if (s === undefined) break;
      const t = index / TRUNK_SAMPLES;
      const angle = phase + t * turns + Math.sin(t * 7 + wobble) * 0.5;
      const across = Math.sin(angle);
      if (Math.cos(angle) <= (dark ? 0.1 : 0)) {
        flush();
        continue;
      }
      context.lineWidth = Math.max(1, s.w * thickness);
      run.push([s.x + s.nx * s.w * across * 0.92, s.y + s.ny * s.w * across * 0.92]);
    }
    flush();
  };
  for (let index = 0; index < stroke.fibers; index += 1) {
    if (index % 2 === 0) yield;
    fibre(false);
  }
  for (let index = 0; index < stroke.fibers / 2; index += 1) {
    if (index % 2 === 0) yield;
    fibre(true);
  }
  if (stroke.rim) {
    context.strokeStyle = rgba(tone(localLight, middle.x, middle.y), 0.5);
    context.lineWidth = 2;
    context.beginPath();
    samples.forEach((s, index) => {
      const x = s.x - s.nx * s.w * 0.95 * lit,
        y = s.y - s.ny * s.w * 0.95 * lit;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }
}

function* paintMoss(
  kit: PaintKit,
  stroke: TrunkStroke,
  samples: readonly SpineSample[],
  random: () => number,
): Generator<void> {
  const { context } = kit;
  const lit = normalSide(samples) * stroke.litSide;
  const moss = ramp(kit, stroke.mossRamp);
  // Moss grows in patches: cluster centres along the trunk, dabs spread around each.
  const patches = Math.round((stroke.moss / MOSS_PER_PATCH) * kit.detail);
  for (let patch = 0; patch < patches; patch += 1) {
    if (patch % 8 === 0) yield;
    const s = samples[Math.floor(random() * TRUNK_SAMPLES)];
    if (s === undefined) continue;
    const centre = (random() < 0.5 ? -1 : 1) * Math.sqrt(random());
    const spread = s.w * (0.15 + random() * 0.35);
    for (let index = 0; index < MOSS_PER_PATCH; index += 1) {
      const across = centre + ((random() + random() - 1) * spread) / Math.max(1, s.w);
      const along = (random() + random() - 1) * spread;
      const px = s.x + s.nx * s.w * across + s.ny * along,
        py = s.y + s.ny * s.w * across - s.nx * along;
      const side = clamp01(0.5 - across * lit * 0.5);
      const value = (side * 0.6 + lightAt(kit, px, py) * 0.6 + (random() - 0.5) * 0.3) * stroke.light;
      const color = hazed(kit, sampleRamp(moss, clamp01(value)), stroke.haze, px, py);
      dab(context, px, py, 1.5 + random() * stroke.mossSize, random() * 3, color, 0.9);
    }
  }
}

export function* paintScatter(kit: PaintKit, stroke: ScatterStroke): Generator<void> {
  const random = seededRandom(stroke.seed);
  const colors = stroke.colors.map(parseHex);
  const center = parseHex(stroke.center);
  const count = Math.round(stroke.count * kit.detail);
  for (const [cx, cy, rx, ry] of stroke.spots) {
    yield;
    for (let index = 0; index < count; index += 1) {
      const x = cx + (random() - 0.5) * 2 * rx,
        y = cy + (random() - 0.5) * 2 * ry;
      const size = stroke.size * (0.7 + random() * 0.6);
      const color = colors[Math.floor(random() * colors.length)] ?? center;
      for (let petal = 0; petal < stroke.petals; petal += 1) {
        const angle = (petal / stroke.petals) * Math.PI * 2 + random();
        dab(
          kit.context,
          x + Math.cos(angle) * size * 0.7,
          y + Math.sin(angle) * size * 0.7,
          size * 0.7,
          angle,
          color,
          0.95,
        );
      }
      dab(kit.context, x, y, size * 0.25, 0, center, 1, 1);
    }
  }
}

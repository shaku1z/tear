/**
 * The brush kit every stroke routine paints with: seeded randomness, value
 * noise, colour ramps, the stage's key light and depth haze. Nothing here
 * knows a biome; recipes supply every colour and position.
 */

export type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Rgb = readonly [number, number, number];
export type Ramp = readonly Rgb[];

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Deterministic 0..1 generator (mulberry32). Same seed, same painting. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOISE_SIZE = 256;

/** Smooth 2D value noise in 0..1, tiling every 256 units. */
export function valueNoise(seed: number): (x: number, y: number) => number {
  const random = seededRandom(seed);
  const table = new Float32Array(NOISE_SIZE * NOISE_SIZE);
  for (let index = 0; index < table.length; index += 1) table[index] = random();
  const at = (x: number, y: number) => table[((y & 255) << 8) | (x & 255)] ?? 0;
  return (x, y) => {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    const xf = x - xi,
      yf = y - yi;
    const u = xf * xf * (3 - 2 * xf),
      v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi),
      b = at(xi + 1, yi),
      c = at(xi, yi + 1),
      d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Fractal sum of `octaves` noise layers, normalised to 0..1. */
export function fractalNoise(noise: (x: number, y: number) => number, x: number, y: number, octaves: number): number {
  let sum = 0,
    amplitude = 0.5,
    frequency = 1,
    total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * noise(x * frequency, y * frequency);
    total += amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }
  return sum / total;
}

export function parseHex(hex: string): Rgb {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}

export function rgba(color: Rgb, alpha = 1): string {
  return `rgba(${String(color[0] | 0)},${String(color[1] | 0)},${String(color[2] | 0)},${String(alpha)})`;
}

/** Colour at `value` (0 dark .. 1 light) along a ramp of stops. */
export function sampleRamp(ramp: Ramp, value: number): Rgb {
  const scaled = clamp01(value) * (ramp.length - 1);
  const index = Math.min(ramp.length - 2, Math.floor(scaled));
  const low = ramp[index],
    high = ramp[index + 1];
  if (low === undefined || high === undefined) return ramp[0] ?? [0, 0, 0];
  return mix(low, high, scaled - index);
}

/** The stage's key light: one source every stroke reads. */
export interface KeyLight {
  readonly x: number;
  readonly y: number;
  /** World px at which the light has fallen to nothing. */
  readonly reach: number;
  readonly core: Rgb;
  readonly glow: Rgb;
}

export interface Atmosphere {
  /** Colour distant forms fade toward. */
  readonly haze: Rgb;
  /** How far haze warms toward the light's glow near the source (0..1). */
  readonly warmth: number;
}

/**
 * Everything a stroke needs to paint one layer: the context in world units,
 * the stage's light and atmosphere, its ramps, noise and a random source.
 */
export interface PaintKit {
  readonly context: Context2D;
  readonly light: KeyLight;
  readonly atmosphere: Atmosphere;
  readonly ramps: ReadonlyMap<string, Ramp>;
  readonly noise: (x: number, y: number) => number;
  /** Stroke count multiplier for the graphics tier (1 = full detail). */
  readonly detail: number;
  /** Composite of the layers painted so far, for reflections. */
  readonly behind: () => CanvasImageSource | undefined;
  /** Layer bounds in world units. */
  readonly bounds: readonly [x: number, y: number, w: number, h: number];
}

export function ramp(kit: PaintKit, name: string): Ramp {
  const found = kit.ramps.get(name);
  if (found === undefined) throw new Error(`stage art: unknown ramp "${name}"`);
  return found;
}

/** Key light reaching a world point, 1 at the source falling to 0 at `reach`. */
export function lightAt(kit: PaintKit, x: number, y: number): number {
  const distance = Math.hypot(x - kit.light.x, (y - kit.light.y) * 1.1);
  return clamp01(1 - distance / kit.light.reach);
}

/** Pushes a colour into the atmosphere by `amount` (0 near .. 1 fully hazed). */
export function hazed(kit: PaintKit, color: Rgb, amount: number, x: number, y: number): Rgb {
  if (amount <= 0) return color;
  const target = mix(kit.atmosphere.haze, kit.light.glow, lightAt(kit, x, y) * kit.atmosphere.warmth);
  return mix(color, target, clamp01(amount));
}

/** One brush dab: a rotated ellipse, the unit every texture is built from. */
export function dab(
  context: Context2D,
  x: number,
  y: number,
  size: number,
  angle: number,
  color: Rgb,
  alpha: number,
  aspect = 0.45,
): void {
  context.fillStyle = rgba(color, alpha);
  context.beginPath();
  context.ellipse(x, y, size, size * aspect, angle, 0, Math.PI * 2);
  context.fill();
}

export type SplinePoint = readonly [x: number, y: number, width: number];

/** Catmull-Rom point along control points at t in 0..1, width interpolated too. */
export function splineAt(points: readonly SplinePoint[], t: number): SplinePoint {
  const scaled = clamp01(t) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const u = scaled - index;
  const at = (offset: number) => points[Math.max(0, Math.min(points.length - 1, index + offset))] ?? [0, 0, 0];
  const p0 = at(-1),
    p1 = at(0),
    p2 = at(1),
    p3 = at(2);
  const component = (axis: 0 | 1 | 2) => {
    const a = p0[axis],
      b = p1[axis],
      c = p2[axis],
      d = p3[axis];
    return 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
  };
  return [component(0), component(1), component(2)];
}

/** Strokes yield after this many brush operations so a bake can be sliced. */
export const BRUSH_OPERATIONS_PER_YIELD = 160;

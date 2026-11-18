/**
 * What moves in a painted scene: the `motion` list of a scene package. Every
 * part names the layer it is drawn over and the layer-space `rect` it lives in;
 * its kind says how it moves. The shared scene renderer draws each kind from
 * this data alone (scene-motion.ts), so another biome's water, light or motes
 * are a package entry, never code. Reduced motion and low graphics draw none.
 *
 * No runtime imports beyond the field readers, so the `pnpm scene` CLI can load
 * it with Node's type stripping.
 */
import {
  color,
  fail,
  finite,
  id,
  integer,
  list,
  record,
  rect,
  rectInside,
  type Point,
  type Raw,
  type Rect,
} from "./scene-fields";

interface SceneMotionPart {
  readonly id: string;
  /** The layer the part is drawn over, right after its paint. */
  readonly layer: string;
  /** Layer-space area the part lives in, inside the layer's rect. */
  readonly rect: Rect;
}

/**
 * Moving water: the part of a painted layer under `mask` (stretched over
 * `rect`) is redrawn in horizontal rows that slide and stretch a little, so the
 * painted surface and the reflections in it ripple while everything outside
 * the mask stays still. Rows are thin and move little at the far edge (`rect`
 * top) and grow towards the near edge, by `far` (far size as a share of near
 * size), so the motion follows the painted perspective. `glints` are short
 * bright strokes on the surface that fade in and out and drift.
 */
export interface SceneWater extends SceneMotionPart {
  readonly kind: "water";
  /** Image whose alpha says where water is. */
  readonly mask: string;
  readonly rows: number;
  readonly far: number;
  /** World px a near row slides sideways and stretches vertically. */
  readonly slide: number;
  readonly swell: number;
  /** Wave crests between the far and near edge, and seconds for one to pass. */
  readonly waves: number;
  readonly period: number;
  readonly glints?: {
    readonly count: number;
    readonly color: string;
    readonly opacity: number;
    /** World px of a near glint, and world px a second it drifts sideways. */
    readonly length: number;
    readonly drift: number;
  };
}

/** One shaft of light: degrees from straight down (positive leans right), and its size at the far end. */
export interface SceneBeam {
  readonly angle: number;
  readonly width: number;
  readonly length: number;
}

/**
 * Light shafts: soft beams fanning out from `from` (layer space), brightest at
 * the start and fading to nothing, kept inside `rect`. Each beam breathes
 * brighter and dimmer on its own clock of about `period` seconds and leans by up
 * to `sway` degrees, so the light seems to move through leaves above.
 */
export interface SceneLight extends SceneMotionPart {
  readonly kind: "light";
  readonly from: Point;
  readonly beams: readonly SceneBeam[];
  /** Width at the start as a share of the width at the far end. */
  readonly taper: number;
  readonly color: string;
  readonly opacity: number;
  readonly period: number;
  readonly sway: number;
}

/**
 * Motes: small specks of light (pollen, spores, dust) drifting through `rect`.
 * Each rises `rise` world px a second (negative falls), swings up to `wander`
 * px sideways and twinkles, on clocks around `period` seconds; specks leaving
 * one edge come back at the other. `size` is the largest speck in world px.
 */
export interface SceneMotes extends SceneMotionPart {
  readonly kind: "motes";
  readonly count: number;
  readonly color: string;
  readonly opacity: number;
  readonly size: number;
  readonly rise: number;
  readonly wander: number;
  readonly period: number;
}

export type SceneMotion = SceneWater | SceneLight | SceneMotes;

/** Edge in px of the soft speck image a `motes` part draws every speck from. */
export const SCENE_MOTE_SPRITE = 32;

function water(raw: Raw, path: string, images: ReadonlyMap<string, { readonly alpha: boolean }>) {
  const mask = id(raw.mask, `${path}.mask`);
  if (images.get(mask)?.alpha !== true) fail(`${path}.mask`, `"${mask}" must be an image with alpha`);
  const glints = raw.glints === undefined ? undefined : record(raw.glints, `${path}.glints`);
  return {
    kind: "water" as const,
    mask,
    rows: integer(raw.rows, `${path}.rows`, 4, 96),
    far: finite(raw.far, `${path}.far`, 0.05, 1),
    slide: finite(raw.slide, `${path}.slide`, 0, 12),
    swell: finite(raw.swell, `${path}.swell`, 0, 12),
    waves: finite(raw.waves, `${path}.waves`, 0.5, 40),
    period: finite(raw.period, `${path}.period`, 0.5, 60),
    ...(glints === undefined
      ? {}
      : {
          glints: Object.freeze({
            count: integer(glints.count, `${path}.glints.count`, 1, 200),
            color: color(glints.color, `${path}.glints.color`),
            opacity: finite(glints.opacity, `${path}.glints.opacity`, 0, 1),
            length: finite(glints.length, `${path}.glints.length`, 2, 200),
            drift: finite(glints.drift, `${path}.glints.drift`, -200, 200),
          }),
        }),
  };
}

function light(raw: Raw, path: string) {
  const from = list(raw.from, `${path}.from`, 2).map((item, index) => finite(item, `${path}.from[${String(index)}]`));
  const [x, y] = from;
  if (x === undefined || y === undefined) fail(`${path}.from`, "expected [x, y]");
  const beams = list(raw.beams, `${path}.beams`, 12).map((item, index) => {
    const beam = record(item, `${path}.beams[${String(index)}]`);
    return Object.freeze({
      angle: finite(beam.angle, `${path}.beams[${String(index)}].angle`, -80, 80),
      width: finite(beam.width, `${path}.beams[${String(index)}].width`, 1, 2000),
      length: finite(beam.length, `${path}.beams[${String(index)}].length`, 1, 4000),
    });
  });
  if (beams.length === 0) fail(`${path}.beams`, "needs at least one beam");
  return {
    kind: "light" as const,
    from: Object.freeze([x, y] as const),
    beams: Object.freeze(beams),
    taper: finite(raw.taper, `${path}.taper`, 0, 1),
    color: color(raw.color, `${path}.color`),
    opacity: finite(raw.opacity, `${path}.opacity`, 0, 1),
    period: finite(raw.period, `${path}.period`, 0.5, 60),
    sway: finite(raw.sway, `${path}.sway`, 0, 10),
  };
}

function motes(raw: Raw, path: string) {
  return {
    kind: "motes" as const,
    count: integer(raw.count, `${path}.count`, 1, 300),
    color: color(raw.color, `${path}.color`),
    opacity: finite(raw.opacity, `${path}.opacity`, 0, 1),
    size: finite(raw.size, `${path}.size`, 0.5, 20),
    rise: finite(raw.rise, `${path}.rise`, -200, 200),
    wander: finite(raw.wander, `${path}.wander`, 0, 200),
    period: finite(raw.period, `${path}.period`, 0.5, 60),
  };
}

/** Reads one `motion` entry: the fields every part has, then its kind's own. */
export function parseMotion(
  value: unknown,
  path: string,
  images: ReadonlyMap<string, { readonly alpha: boolean }>,
  layers: readonly { readonly id: string; readonly rect: Rect }[],
): SceneMotion {
  const raw = record(value, path);
  const layerId = id(raw.layer, `${path}.layer`);
  const host = layers.find((item) => item.id === layerId);
  if (host === undefined) fail(`${path}.layer`, `unknown layer "${layerId}"`);
  const area = rect(raw.rect, `${path}.rect`);
  if (!rectInside(area, host.rect)) fail(`${path}.rect`, `must lie inside layer "${layerId}"`);
  const part = { id: id(raw.id, `${path}.id`), layer: layerId, rect: area };
  if (raw.kind === "water") return Object.freeze({ ...part, ...water(raw, path, images) });
  if (raw.kind === "light") return Object.freeze({ ...part, ...light(raw, path) });
  if (raw.kind === "motes") return Object.freeze({ ...part, ...motes(raw, path) });
  return fail(`${path}.kind`, 'expected "water", "light" or "motes"');
}

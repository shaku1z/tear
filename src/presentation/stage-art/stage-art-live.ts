/**
 * Turns a recipe's water and motes into the tables the scene renderer draws
 * each frame. All randomness is spent here, from the entry's seed, so drawing
 * a frame is arithmetic on the frame's time and the same recipe always moves
 * the same way.
 */
import type { SceneGlint, SceneLiveMotes, SceneLiveWater, SceneMote, SceneWaterRow } from "../scenes/scene-contract";
import { parseHex, seededRandom, type Rgb } from "./paint-kit";
import type { LiveMotes, LiveWater } from "./stage-art-contract";

const TURN = Math.PI * 2;
/** How far one water row's wave runs ahead of the row above it, in turns. */
const ROW_PHASE_STEP = 0.21;
/** A glint's own period varies around the recipe's by this share either way. */
const GLINT_PERIOD_SPREAD = 0.4;
const GLINT_SHORTEST = 0.35;

const channels = (color: Rgb): string => color.map((value) => String(Math.round(value))).join(",");

/**
 * Rows from the far shore down to the viewer: each a little taller and
 * sliding a little farther than the one above, so ripples follow the water's
 * perspective. Glints sit on row tops and are longer nearer the viewer.
 */
export function compileWater(
  water: LiveWater,
  bounds: readonly [x: number, y: number, w: number, h: number],
  glint: Rgb,
): SceneLiveWater {
  const random = seededRandom(water.seed);
  const depth = water.bottom - water.top;
  const rows: SceneWaterRow[] = [];
  for (let y = water.top; y < water.bottom;) {
    const near = (y - water.top) / depth;
    const h = Math.min(water.bottom - y, water.rows[0] + (water.rows[1] - water.rows[0]) * near);
    rows.push({
      y,
      h,
      reach: water.reach[0] + (water.reach[1] - water.reach[0]) * near,
      phase: rows.length * ROW_PHASE_STEP * TURN + random() * 0.6,
    });
    y += h;
  }
  const glints: SceneGlint[] = [];
  for (let index = 0; index < water.glints.count; index += 1) {
    const row = rows[Math.floor(random() * rows.length)];
    if (row === undefined) break;
    const near = (row.y - water.top) / depth;
    glints.push({
      x: bounds[0] + random() * bounds[2],
      y: row.y,
      w: water.glints.length * (GLINT_SHORTEST + (1 - GLINT_SHORTEST) * near) * (0.6 + random() * 0.4),
      period: water.glints.period * (1 - GLINT_PERIOD_SPREAD + random() * GLINT_PERIOD_SPREAD * 2),
      phase: random() * TURN,
    });
  }
  return Object.freeze({
    kind: "water",
    layer: water.layer,
    rows: Object.freeze(rows),
    period: water.period,
    glints: Object.freeze(glints),
    glintColor: channels(glint),
    glintAlpha: water.glints.alpha,
  });
}

export function compileMotes(field: LiveMotes): SceneLiveMotes {
  const random = seededRandom(field.seed);
  const motes: SceneMote[] = [];
  for (let index = 0; index < field.count; index += 1) {
    motes.push({
      x: random() * field.area[2],
      y: random() * field.area[3],
      size: field.size[0] + (field.size[1] - field.size[0]) * random(),
      phase: random() * TURN,
    });
  }
  return Object.freeze({
    kind: "motes",
    layer: field.layer,
    area: field.area,
    motes: Object.freeze(motes),
    color: channels(parseHex(field.color)),
    alpha: field.alpha,
    drift: field.drift,
    wobble: field.wobble,
    period: field.period,
  });
}

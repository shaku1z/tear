/**
 * A biome's look for boss tells, as data. A stage's row in `stage-presentation-definitions.ts` may carry
 * a `BossTellSkinTable`; this module turns the table into the skin the shared tell renderer calls. The
 * table changes looks only: every shape is drawn inside the tell's own area, at its real size from the
 * first frame of the warning, in the shared warning and strike inks.
 */
import type { BossTell, BossTellMark } from "../../../gameplay/entities/boss-tells";
import type { BossTellSkin } from "./boss-tell-renderer";

/**
 * How one mark is drawn.
 * - "risers": pointed growths standing on the floor edge of the area. They start at `start` (a share of
 *   the area's height) and reach its top as the strike lands; a line along the floor and a stem at each
 *   end show the whole area from the first frame.
 * - "ring": growths around the edge of a round area, pointing outward.
 */
export type BossTellSkinMark =
  | Readonly<{
      shape: "risers";
      /** World pixels between growths, and the width of one at its base. */
      spacing: number;
      width: number;
      /** How far a tip leans sideways, as a share of its height. A lane leans the way the strike travels. */
      lean: number;
      /** Height at the start of the warning, as a share of the area's height (0 to 1). */
      start: number;
      /** Side spurs on growths tall enough to carry them. */
      spurs: boolean;
    }>
  | Readonly<{ shape: "ring"; count: number; length: number }>;

/** One biome's table. A mark with no row keeps the shared default drawing. */
export interface BossTellSkinTable {
  /** The body of a growth: dark on a light scene, so the bright ink on it reads on any painting. */
  readonly body: string;
  readonly marks: Readonly<Partial<Record<BossTellMark, BossTellSkinMark>>>;
}

/** Limits a table must keep so a mark reads at phone size and stays cheap to draw. */
export const BOSS_TELL_SKIN_LIMITS = Object.freeze({
  minSpacing: 24,
  minWidth: 16,
  maxLean: 0.35,
  maxStart: 0.5,
  minRingCount: 8,
  maxRingCount: 32,
  minRingLength: 16,
});

/** The problems in a table, empty when it is sound. */
export function bossTellSkinProblems(table: BossTellSkinTable): readonly string[] {
  const problems: string[] = [];
  const limits = BOSS_TELL_SKIN_LIMITS;
  if (!/^#[0-9a-f]{6}$/iu.test(table.body)) problems.push(`body ${table.body} is not a #rrggbb colour`);
  for (const [mark, row] of Object.entries(table.marks)) {
    if (row.shape === "ring") {
      if (!(row.count >= limits.minRingCount && row.count <= limits.maxRingCount))
        problems.push(`${mark}: count ${String(row.count)} is outside 8 to 32`);
      if (!(row.length >= limits.minRingLength)) problems.push(`${mark}: length ${String(row.length)} is under 16`);
      continue;
    }
    if (!(row.spacing >= limits.minSpacing)) problems.push(`${mark}: spacing ${String(row.spacing)} is under 24`);
    if (!(row.width >= limits.minWidth && row.width <= row.spacing))
      problems.push(`${mark}: width ${String(row.width)} must be 16 to its spacing`);
    if (!(row.lean >= 0 && row.lean <= limits.maxLean)) problems.push(`${mark}: lean ${String(row.lean)} over 0.35`);
    if (!(row.start >= 0 && row.start <= limits.maxStart))
      problems.push(`${mark}: start ${String(row.start)} is outside 0 to 0.5`);
  }
  return problems;
}

type Canvas = CanvasRenderingContext2D;
type Look = Readonly<{ body: string; color: string; active: boolean; progress: number }>;

/** Heights along a row, so it reads as growth and not as a fence. The first is always full height. */
const HEIGHTS = [1, 0.8, 0.92, 0.72] as const;

/** Strokes the current path twice: the dark body wide, the ink narrow on top of it. */
function inked(ctx: Canvas, look: Look, width: number): void {
  ctx.strokeStyle = look.body;
  ctx.lineWidth = width + 5;
  ctx.stroke();
  ctx.strokeStyle = look.color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * The broken line along the floor edge and a bowed stem up each end, curling in at the top: the whole
 * area, from the first frame.
 */
function frame(ctx: Canvas, look: Look, left: number, right: number, floor: number, top: number): void {
  const hook = Math.min(18, (right - left) * 0.2, (floor - top) * 0.3);
  const bow = Math.min(10, (right - left) * 0.08);
  const middle = (top + hook + floor) / 2;
  ctx.beginPath();
  ctx.moveTo(left + hook, top);
  ctx.quadraticCurveTo(left, top, left, top + hook);
  ctx.quadraticCurveTo(left + bow, middle, left, floor);
  let up = true;
  for (let x = left + 16; x < right - 8; x += 16) {
    ctx.lineTo(x, floor + (up ? -4 : 3));
    up = !up;
  }
  ctx.lineTo(right, floor);
  ctx.quadraticCurveTo(right - bow, middle, right, top + hook);
  ctx.quadraticCurveTo(right, top, right - hook, top);
  inked(ctx, look, look.active ? 5 : 4);
}

/** Fills the growths' dark bodies with an ink edge, then their bright tips, as two paths. */
function paint(ctx: Canvas, look: Look, trace: (tips: boolean) => void): void {
  ctx.beginPath();
  trace(false);
  ctx.fillStyle = look.body;
  ctx.fill();
  ctx.strokeStyle = look.color;
  ctx.lineWidth = look.active ? 4.5 : 3.5;
  ctx.stroke();
  ctx.beginPath();
  trace(true);
  ctx.fillStyle = look.color;
  ctx.fill();
}

function risers(ctx: Canvas, look: Look, row: Extract<BossTellSkinMark, { shape: "risers" }>, tell: BossTell): void {
  const left = tell.x - tell.hw;
  const right = tell.x + tell.hw;
  const floor = tell.y + tell.hh;
  const full = tell.hh * 2;
  frame(ctx, look, left, right, floor, floor - full);
  const count = Math.max(2, Math.round((right - left) / row.spacing));
  const half = Math.min(row.width, ((right - left) / count) * 0.9) / 2;
  const grown = look.active ? 1 : row.start + (1 - row.start) * look.progress;
  const side = tell.mark === "lane" ? Math.sign(tell.dir ?? 1) || 1 : 0;
  const within = (x: number): number => Math.min(right, Math.max(left, x));
  paint(ctx, look, (tips) => {
    for (let index = 0; index < count; index += 1) {
      const x = left + ((index + 0.5) / count) * (right - left);
      const height = full * grown * (HEIGHTS[index % HEIGHTS.length] ?? 1);
      const lean = (side === 0 ? (index % 2 === 0 ? 1 : -1) : side) * row.lean * height;
      const tipX = within(x + lean);
      const tipY = floor - height;
      if (!tips) {
        ctx.moveTo(x - half, floor);
        ctx.quadraticCurveTo(within(x - half * 0.3 + lean * 0.35), floor - height * 0.55, tipX, tipY);
        ctx.quadraticCurveTo(within(x + half * 0.3 + lean * 0.35), floor - height * 0.55, x + half, floor);
        ctx.closePath();
        continue;
      }
      // The bright tip: the top half of the growth.
      const neckX = x + (tipX - x) * 0.5;
      const neckY = floor - height * 0.5;
      ctx.moveTo(neckX - half * 0.5, neckY);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(neckX + half * 0.5, neckY);
      ctx.closePath();
      if (!row.spurs || height < 64) continue;
      const out = index % 2 === 0 ? 1 : -1;
      const spurX = x + (tipX - x) * 0.3 + out * half * 0.55;
      const spurY = floor - height * 0.36;
      ctx.moveTo(spurX, spurY + 7);
      ctx.lineTo(within(spurX + out * (half * 0.7 + 7)), spurY - 6);
      ctx.lineTo(spurX, spurY - 7);
      ctx.closePath();
    }
  });
}

function ring(ctx: Canvas, look: Look, row: Extract<BossTellSkinMark, { shape: "ring" }>, tell: BossTell): void {
  const radius = Math.max(tell.hw, tell.hh);
  ctx.beginPath();
  ctx.arc(tell.x, tell.y, radius, 0, Math.PI * 2);
  inked(ctx, look, look.active ? 5 : 4);
  const length = row.length * (look.active ? 1 : 0.4 + 0.6 * look.progress);
  const halfBase = Math.min(0.5 * ((Math.PI * 2) / row.count), 14 / radius);
  paint(ctx, look, (tips) => {
    for (let index = 0; index < row.count; index += 1) {
      const angle = (index / row.count) * Math.PI * 2;
      const reach = radius + length * (HEIGHTS[index % HEIGHTS.length] ?? 1);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      if (!tips) {
        ctx.moveTo(tell.x + Math.cos(angle - halfBase) * radius, tell.y + Math.sin(angle - halfBase) * radius);
        ctx.lineTo(tell.x + cos * reach, tell.y + sin * reach);
        ctx.lineTo(tell.x + Math.cos(angle + halfBase) * radius, tell.y + Math.sin(angle + halfBase) * radius);
        ctx.closePath();
        continue;
      }
      const neck = radius + (reach - radius) * 0.55;
      const across = halfBase * radius * 0.45;
      ctx.moveTo(tell.x + cos * neck - sin * across, tell.y + sin * neck + cos * across);
      ctx.lineTo(tell.x + cos * reach, tell.y + sin * reach);
      ctx.lineTo(tell.x + cos * neck + sin * across, tell.y + sin * neck - cos * across);
      ctx.closePath();
    }
  });
}

/**
 * The skin for a table. It leaves three things to the shared default marks: a mark the table has no row
 * for, the exposed mark (the opening looks the same in every biome), and everything in high contrast,
 * where the default marks are the tested ones.
 */
export function createBossTellSkin(table: BossTellSkinTable): BossTellSkin {
  return (ctx, tell, state) => {
    const row = table.marks[tell.mark];
    if (row === undefined || tell.stage === "exposed" || state.highContrast) return false;
    const active = tell.stage === "active";
    const look: Look = { body: table.body, color: state.color, active, progress: state.progress };
    ctx.save();
    ctx.globalAlpha = active ? 1 : 0.72 + 0.28 * state.progress;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (row.shape === "ring") ring(ctx, look, row, tell);
    else risers(ctx, look, row, tell);
    ctx.restore();
    return true;
  };
}

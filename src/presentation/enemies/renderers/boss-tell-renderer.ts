import { bossTellProgress, type BossTell } from "../../../gameplay/entities/boss-tells";
import type { EnemyRendererRuntime } from "./enemy-renderer-runtime";

/**
 * Colours for boss tells. Warm warning and hot strike inks over a dark backing line, so a tell stays
 * readable on a busy painted scene of any hue.
 */
export const BOSS_TELL_INK = Object.freeze({
  warning: "#ffd24a",
  active: "#ff5a3c",
  movement: "#f3fff0",
  exposed: "#7fe3ff",
  backing: "#0e1a16",
});

function backing(ctx: CanvasRenderingContext2D, tell: BossTell, highContrast: boolean): void {
  if (highContrast) return;
  ctx.save();
  ctx.globalAlpha = 0.62;
  ctx.strokeStyle = BOSS_TELL_INK.backing;
  ctx.lineWidth = 8;
  ctx.strokeRect(tell.x - tell.hw, tell.y - tell.hh, tell.hw * 2, tell.hh * 2);
  ctx.restore();
}

/** The area's own fill and edge. The shared lane mark alone is too faint on a painted scene. */
function area(ctx: CanvasRenderingContext2D, tell: BossTell, color: string, k: number): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.14 + 0.2 * k;
  ctx.fillRect(tell.x - tell.hw, tell.y - tell.hh, tell.hw * 2, tell.hh * 2);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 3;
  ctx.strokeRect(tell.x - tell.hw, tell.y - tell.hh, tell.hw * 2, tell.hh * 2);
  ctx.restore();
}

/** Where the boss will land: a ring on the ground with a dark edge, and an arrow above it. */
function landing(ctx: CanvasRenderingContext2D, tell: BossTell, color: string, k: number): void {
  const footY = tell.y + tell.hh;
  ctx.save();
  for (const [ink, width] of [
    [BOSS_TELL_INK.backing, 9],
    [color, 4],
  ] as const) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.ellipse(tell.x, footY, tell.hw + 22, 16, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tell.x - 16, footY - 62 + 14 * k);
    ctx.lineTo(tell.x, footY - 40 + 14 * k);
    ctx.lineTo(tell.x + 16, footY - 62 + 14 * k);
    ctx.stroke();
  }
  ctx.restore();
}

/** A filled rise inside a band, so a whole-floor strike reads as time running out. */
function bandFill(ctx: CanvasRenderingContext2D, tell: BossTell, color: string, k: number): void {
  const height = tell.hh * 2 * k;
  ctx.save();
  ctx.globalAlpha = 0.16 + 0.2 * k;
  ctx.fillStyle = color;
  ctx.fillRect(tell.x - tell.hw, tell.y + tell.hh - height, tell.hw * 2, height);
  ctx.restore();
}

function selfMark(ctx: CanvasRenderingContext2D, tell: BossTell, color: string, k: number, highContrast: boolean) {
  const size = 12 + 10 * k;
  ctx.save();
  ctx.translate(tell.x, tell.y - tell.hh - 34);
  ctx.rotate(Math.PI / 4);
  ctx.globalAlpha = 0.55 + 0.45 * k;
  ctx.fillStyle = color;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.strokeStyle = highContrast ? "#000" : BOSS_TELL_INK.backing;
  ctx.lineWidth = highContrast ? 4 : 3;
  ctx.strokeRect(-size / 2, -size / 2, size, size);
  ctx.restore();
}

/** The ink for a tell: exposure and movement have their own, a damaging tell warns and then strikes. */
function tellInk(tell: BossTell): string {
  switch (tell.stage) {
    case "exposed":
      return BOSS_TELL_INK.exposed;
    case "active":
      return tell.damaging ? BOSS_TELL_INK.active : BOSS_TELL_INK.movement;
    case "warning":
      return tell.damaging ? BOSS_TELL_INK.warning : BOSS_TELL_INK.movement;
  }
}

/**
 * Where a tell sits against the boss's body. A strike that is landing is drawn in front, so the body
 * never hides the thing that hurts; warnings, landing spots and the exposed mark stay behind it.
 */
export type BossTellLayer = "behind" | "front";

export function bossTellLayer(tell: BossTell): BossTellLayer {
  return tell.stage === "active" && tell.damaging ? "front" : "behind";
}

/**
 * A biome's own drawing for a tell: roots rising from the floor in place of the plain plate, say.
 * It gets the tell (its mark, stage and area), how far the warning has run (0 to 1) and the shared ink,
 * and returns true when it drew the tell; false leaves that tell to the default marks. A skin changes
 * looks only: the area and timing are the tell's.
 */
export type BossTellSkin = (
  ctx: CanvasRenderingContext2D,
  tell: BossTell,
  state: Readonly<{ progress: number; color: string; highContrast: boolean }>,
) => boolean;

const skins = new Map<string, BossTellSkin>();

/** Installs (or with null removes) the skin for a biome, by stage id such as "verdant-sanctum". */
export function setBossTellSkin(stageId: string, skin: BossTellSkin | null): void {
  if (skin === null) skins.delete(stageId);
  else skins.set(stageId, skin);
}

/**
 * Draws the tells a boss reports, in world space. Every boss mark in the game comes through here:
 * `skinId` picks the biome's skin, and `layer` draws only the tells that belong behind or in front of
 * the body (a renderer calls it once before the body and once after).
 */
export function drawBossTells(
  runtime: EnemyRendererRuntime,
  ctx: CanvasRenderingContext2D,
  tells: readonly BossTell[],
  options: Readonly<{ skinId?: string; layer?: BossTellLayer }> = {},
): void {
  const highContrast = runtime.A11Y.highContrast;
  const skin = options.skinId === undefined ? undefined : skins.get(options.skinId);
  for (const tell of tells) {
    if (options.layer !== undefined && bossTellLayer(tell) !== options.layer) continue;
    const k = bossTellProgress(tell);
    const color = tellInk(tell);
    if (skin?.(ctx, tell, { progress: k, color: runtime.telegraphInk(color), highContrast }) === true) continue;
    const left = tell.x - tell.hw,
      top = tell.y - tell.hh;
    if (tell.mark === "self") selfMark(ctx, tell, runtime.telegraphInk(color), k, highContrast);
    else if (tell.mark === "reticle") runtime.dangerReticle(ctx, tell.x, tell.y, Math.max(tell.hw, tell.hh), k, color);
    else if (tell.mark === "destination") landing(ctx, tell, runtime.telegraphInk(color), k);
    else if (tell.mark === "column") {
      backing(ctx, tell, highContrast);
      runtime.dangerColumn(ctx, tell.x, tell.hw * 2, top, tell.y + tell.hh, color, k);
    } else {
      backing(ctx, tell, highContrast);
      area(ctx, tell, runtime.telegraphInk(color), k);
      if (tell.mark === "band") bandFill(ctx, tell, runtime.telegraphInk(color), k);
      const dir = tell.mark === "lane" ? (tell.dir ?? 1) : 1;
      runtime.dangerLane(ctx, dir >= 0 ? left : left + tell.hw * 2, top, tell.hw * 2, tell.hh * 2, dir, color, k);
    }
  }
}

import type { Rect } from "./ui-contracts";

/** What the gate needs from the UI: the accent colour and the font. */
export interface RotateGateUi {
  readonly t: Readonly<{ color: Readonly<{ accent: string }> }>;
  font(size: number, bold?: boolean): string;
}

/**
 * The phone rotate gate: a full-screen block on a touch device held upright. Mobile-only
 * (`release.mobile-only` in config/architecture-roles.json): production builds leave it out,
 * and every caller reaches it behind `__TEAR_MOBILE__`.
 */

/** The gate shows on a touch device whose canvas is taller than wide. The one source for that rule. */
export function rotateGateShown(touchActive: boolean, clientWidth: number, clientHeight: number): boolean {
  return touchActive && clientHeight > clientWidth;
}

/**
 * The arena is wide, so gameplay pauses and this asks for landscape. Drawn in its own upscaled
 * space (sr.w/460) because in portrait the logical view is scaled tiny; without the upscale the
 * gate itself would be microscopic.
 */
export function drawRotateGate(ui: RotateGateUi, ctx: CanvasRenderingContext2D, sr: Rect, t: number): void {
  ctx.save();
  ctx.fillStyle = "#06070c";
  ctx.globalAlpha = 0.97;
  ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
  ctx.globalAlpha = 1;
  const k = sr.w / 460;
  ctx.translate(sr.x + sr.w / 2, sr.y + sr.h / 2);
  ctx.scale(k, k);
  // the phone glyph, easing portrait -> landscape and holding, on a loop
  const ph = (t % 2.6) / 2.6;
  const rot = ph < 0.35 ? 0 : ph < 0.6 ? ((ph - 0.35) / 0.25) * (Math.PI / 2) : Math.PI / 2;
  ctx.save();
  ctx.translate(0, -46);
  ctx.rotate(-rot);
  ctx.strokeStyle = "#f1eff9";
  ctx.lineWidth = 4;
  ctx.strokeRect(-26, -46, 52, 92);
  ctx.fillStyle = ui.t.color.accent;
  ctx.fillRect(-8, 34, 16, 4); // home bar
  ctx.restore();
  ctx.fillStyle = "#f1eff9";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = ui.font(26, true);
  ctx.fillText("ROTATE YOUR DEVICE", 0, 46);
  ctx.globalAlpha = 0.65;
  ctx.font = ui.font(13, false);
  ctx.fillText("the blade needs the wide view — TEAR plays in landscape", 0, 72);
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.textAlign = "left";
}

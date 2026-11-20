import type { CoachMarkSceneSnapshot, WorldRenderContext } from "./contracts";
import { bossHudTop, hudFrame, hudType } from "./hud";
import { cssToLogical, INTERFACE_ACCESSIBILITY } from "../../domain/interface-accessibility";
import { placeCoachMark, type CoachMark, type CoachPlacement, type CoachRect } from "../coach/coach-marks";

/** The widest a mark may grow, in logical pixels, before its line wraps. */
const MAX_MARK_WIDTH = 520;

/**
 * HUD regions every mark avoids: the health/dash group (top-left) and the centred run
 * group with its multiplier lane. Teaching surfaces never cover the HUD they teach.
 */
export function hudAvoidRects(context: WorldRenderContext): readonly CoachRect[] {
  const frame = hudFrame(context),
    t = context.ui.t,
    laneBottom = bossHudTop(context);
  const healthWidth = t.metric.hudBarW + t.metric.hudPad * 2 + hudType(context).body * 6;
  return [
    { x: frame.left, y: frame.top, w: healthWidth, h: laneBottom - frame.top },
    { x: frame.centerX - 170, y: frame.top, w: 340, h: laneBottom - frame.top },
  ];
}

/**
 * Coach marks: plate-less text in the live ink beside a short accent rule (no plates,
 * outlines, halos or shadows), keys as the shared key caps, placed by the pure solver
 * so they never sit on the player, the HUD, the touch controls or each other. As on the
 * HUD, the title is a value drawn in the ink at full opacity and the line under it is
 * secondary at `alpha.soft`; the tone's colour is the rule beside them, never the text,
 * because an accent over the stage's own props can fall below contrast.
 */
/**
 * Mark type sizes: the HUD roles, raised on a touch screen to the touch text floor
 * (`minTouchTextCssPx`) at the live scale so a phone never draws an unreadable mark.
 */
export function coachMarkType(context: WorldRenderContext): Readonly<{ label: number; caption: number }> {
  const type = hudType(context);
  if (!context.ui.density.touch) return { label: type.label, caption: type.caption };
  const floor = cssToLogical(INTERFACE_ACCESSIBILITY.minTouchTextCssPx, context.cssPerLogicalPixel ?? 1);
  return { label: Math.max(type.label, floor), caption: Math.max(type.caption, floor) };
}

export function createCoachMarkRenderer(context: WorldRenderContext) {
  const canvas = context.canvas,
    ui = context.ui;

  function measure(mark: CoachMark, maxWidth: number) {
    const t = ui.t,
      type = coachMarkType(context);
    canvas.font = ui.font(type.label, true);
    const titleWidth = mark.title ? canvas.measureText(mark.title).width : 0;
    // A call-out is a title alone: no body line under it.
    const body = ui.textBox(canvas, mark.text, 0, 0, maxWidth, { size: type.caption, measureOnly: true, maxLines: 3 });
    const bodyHeight = mark.text === "" ? 0 : body.height;
    const bodyWidth = Math.max(
      0,
      ...body.lines.map((line) => {
        canvas.font = ui.font(body.size, false);
        return canvas.measureText(line).width;
      }),
    );
    const caps = mark.keys.map((key) => ui.keycapSize(canvas, key));
    const capsWidth = caps.reduce((sum, cap) => sum + cap.w, 0) + Math.max(0, caps.length - 1) * t.space.sm;
    const capsHeight = Math.max(0, ...caps.map((cap) => cap.h));
    const rule = 4 + t.space.sm;
    const width = rule + Math.min(maxWidth, Math.max(titleWidth, bodyWidth, capsWidth));
    const height =
      (mark.title ? type.label + (bodyHeight > 0 ? t.space.xs : 0) : 0) +
      bodyHeight +
      (caps.length ? t.space.sm + capsHeight : 0);
    return { width, height, rule, body, bodyHeight, capsHeight };
  }

  function draw(mark: CoachMark, rect: CoachPlacement, alpha: number, metrics: ReturnType<typeof measure>): void {
    const t = ui.t,
      type = coachMarkType(context);
    canvas.save();
    canvas.globalAlpha = alpha;
    canvas.fillStyle = mark.tone === "info" ? ui.ink : t.color.accent;
    canvas.fillRect(rect.x, rect.y, 4, rect.h);
    const left = rect.x + metrics.rule;
    let y = rect.y;
    if (mark.title) {
      y += type.label;
      ui.tag(canvas, mark.title, left, y, ui.ink, "left", type.label);
      y += t.space.xs;
    }
    if (metrics.bodyHeight > 0)
      ui.textBox(canvas, mark.text, left, y + metrics.body.lineHeight * 0.8, rect.w - metrics.rule, {
        size: type.caption,
        maxLines: 3,
        alpha: t.alpha.soft * alpha,
      });
    y += metrics.bodyHeight;
    if (mark.keys.length) {
      let x = left;
      const baseline = y + t.space.sm + metrics.capsHeight - 5;
      for (const key of mark.keys) x += ui.keycap(canvas, key, x, baseline) + t.space.sm;
    }
    canvas.restore();
    canvas.globalAlpha = 1;
    canvas.textAlign = "left";
  }

  /** Draws the visible marks and returns where each landed (for tests and the next frame's avoidance). */
  function coachMarks(snapshot: CoachMarkSceneSnapshot): readonly CoachPlacement[] {
    const frame = hudFrame(context),
      t = ui.t;
    const bounds: CoachRect = {
      x: frame.left,
      y: frame.top,
      w: frame.right - frame.left,
      h: context.screen.y + context.screen.h - context.safe.bottom - t.space.lg - frame.top,
    };
    const avoid: CoachRect[] = [...hudAvoidRects(context), ...snapshot.avoid];
    const placed: CoachPlacement[] = [];
    const maxWidth = Math.min(MAX_MARK_WIDTH, bounds.w * 0.5);
    for (const { mark, alpha } of [...snapshot.marks].sort((a, b) => b.mark.priority - a.mark.priority)) {
      if (alpha <= 0) continue;
      const metrics = measure(mark, maxWidth - 4 - t.space.sm);
      const anchor = mark.anchor ?? { x: frame.centerX, y: bossHudTop(context) };
      const rect = placeCoachMark({
        size: { w: metrics.width, h: metrics.height },
        anchor,
        bounds,
        avoid,
        gap: t.space.md,
      });
      draw(mark, rect, alpha, metrics);
      placed.push(rect);
      avoid.push(rect);
    }
    return placed;
  }

  return { coachMarks };
}

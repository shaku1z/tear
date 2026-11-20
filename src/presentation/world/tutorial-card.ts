import type { WorldRect, WorldRenderContext, TutorialCardSnapshot } from "./contracts";
import { clamp } from "./primitives";
import { bossHudTop, hudFrame, hudType } from "./hud";

export interface TutorialCardLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/**
 * Keeps the lesson card out of the centred multiplier lane, anchored to the HUD's
 * screen-edge frame. At narrow widths the card drops below that lane instead of
 * squeezing its copy. The card's height comes from its content.
 */
export function tutorialCardLayout(
  frame: Readonly<{ left: number; right: number; top: number; centerX: number }>,
  laneBottom: number,
  minimumTop = 0,
): TutorialCardLayout {
  const meterRight = frame.centerX + 150,
    gap = 24;
  const besideMeter = frame.right - (meterRight + gap);
  if (besideMeter >= 460) {
    const width = Math.min(560, besideMeter);
    return { x: frame.right - width, y: Math.max(frame.top, minimumTop), width };
  }
  const width = Math.min(560, frame.right - frame.left);
  return { x: frame.centerX - width / 2, y: Math.max(laneBottom, minimumTop), width };
}

export function createTutorialCardRenderer(context: WorldRenderContext) {
  const canvas = context.canvas;
  const ui = context.ui;
  /** This frame's lesson card (drawn with the HUD, before the touch controls), which the touch coaching keeps clear of. */
  let lessonCard: WorldRect | null = null;

  /**
   * The lesson strip: one vertical stack (context, title + count, goal, progress bar,
   * keys) so no row can overlap another. It sits on the scene like the rest of the HUD
   * (no plate), marked by its accent rule, and returns its rectangle so coach marks keep
   * clear of it.
   */
  function tutorialCard(snapshot: TutorialCardSnapshot): WorldRect {
    const t = ui.t,
      type = hudType(context),
      pad = t.space.md,
      frame = hudFrame(context);
    const minimumTop = Math.max(
      snapshot.bossPractice ? bossHudTop(context) + 3 * t.metric.bossHudH + type.label * 2 : 0,
      snapshot.clearTop ?? 0,
    );
    const { x, y, width } = tutorialCardLayout(frame, bossHudTop(context), minimumTop);
    const inner = width - pad * 2,
      left = x + pad;
    const progress = snapshot.final ? undefined : snapshot.progress;
    const countText = progress ? `${String(progress.current)} / ${String(progress.goal)}` : "";
    canvas.font = ui.font(type.title, true);
    const countW = countText ? canvas.measureText(countText).width + t.space.md : 0;
    const contextY = y + pad + type.micro,
      titleY = contextY + t.space.sm + type.title;
    const goalY = titleY + t.space.sm + type.body;
    const goal = ui.textBox(canvas, snapshot.description, left, goalY, inner, {
      size: type.body,
      measureOnly: true,
      maxLines: 3,
    });
    const barY = titleY + t.space.sm + goal.height + t.space.xs;
    const keysY = barY + (progress ? t.space.md : 0) + type.micro + t.space.sm;
    const bottom = snapshot.keys.length > 0 ? keysY + 5 : barY + (progress ? 5 : 0);
    const height = bottom + pad - y;
    const card = { x, y, w: width, h: height };
    lessonCard = card;
    canvas.fillStyle = t.color.accent;
    canvas.fillRect(x, y, 4, height);
    ui.tag(canvas, snapshot.context, left, contextY, ui.readable(t.color.accent), "left", type.micro);
    const title = ui.fitText(canvas, snapshot.title, inner - countW, {
      size: type.title,
      floor: type.label,
      bold: true,
    });
    ui.displayText(canvas, title.lines[0] ?? snapshot.title, left, titleY, title.size);
    if (progress) {
      const done = progress.current >= progress.goal;
      ui.tag(
        canvas,
        countText,
        x + width - pad,
        titleY,
        done ? ui.readable(t.color.accent) : ui.ink,
        "right",
        type.title,
      );
    }
    ui.textBox(canvas, snapshot.description, left, goalY, inner, {
      size: type.body,
      alpha: t.alpha.soft,
      maxLines: 3,
    });
    if (progress) progressBar(left, barY, inner, progress);
    let keyX = left;
    for (const key of snapshot.keys) keyX += ui.keycap(canvas, key, keyX, keysY) + t.space.sm;
    if (snapshot.completedBeat > 0) {
      const scale = 1 + (1 - Math.abs(snapshot.completedBeat - 0.9) / 0.9) * 0.4;
      ui.tag(canvas, "✓", x + width - pad, keysY, ui.readable(t.color.accent), "right", Math.round(type.h2 * scale));
    }
    canvas.textAlign = "left";
    return card;
  }

  function progressBar(x: number, y: number, width: number, meter: Readonly<{ current: number; goal: number }>): void {
    canvas.save();
    canvas.globalAlpha = 0.18;
    canvas.fillStyle = ui.ink;
    canvas.fillRect(x, y, width, 5);
    canvas.globalAlpha = 1;
    canvas.fillStyle = ui.t.color.accent;
    canvas.fillRect(x, y, width * clamp(meter.current / Math.max(1, meter.goal)), 5);
    canvas.restore();
  }

  /** This frame's lesson card for the touch coaching to keep clear of, forgotten once taken. */
  function takeLessonCard(): WorldRect | null {
    const card = lessonCard;
    lessonCard = null;
    return card;
  }

  return { tutorialCard, takeLessonCard };
}

import type { WorldRect, WorldRenderContext, TouchControlsSnapshot } from "./contracts";
import { clamp } from "./primitives";

/**
 * The on-screen touch controls and their first-touch coaching. Mobile-only
 * (`release.mobile-only` in config/architecture-roles.json): the world renderers create it only
 * behind `__TEAR_MOBILE__`, so production builds leave it out.
 *
 * `takeLessonCard` hands over this frame's lesson card (drawn with the HUD, before the touch
 * controls), which the coaching keeps clear of, and forgets it for the next frame.
 */
export function createTouchControlsRenderer(context: WorldRenderContext, takeLessonCard: () => WorldRect | null) {
  const canvas = context.canvas;
  const ui = context.ui;

  /**
   * Touch controls sit on the real screen edges, over sky or a dark floor alike, so
   * they use one theme-independent treatment: a dark disc, a light ring and a light
   * label (the scrim / scrimInk pair), readable on any backdrop.
   */
  function disc(
    x: number,
    y: number,
    radius: number,
    fillAlpha: number,
    ring: string,
    ringAlpha: number,
    lineWidth: number,
  ): void {
    canvas.globalAlpha = fillAlpha;
    canvas.fillStyle = ui.t.color.scrim;
    canvas.beginPath();
    canvas.arc(x, y, radius, 0, Math.PI * 2);
    canvas.fill();
    canvas.globalAlpha = ringAlpha;
    canvas.strokeStyle = ring;
    canvas.lineWidth = lineWidth;
    canvas.beginPath();
    canvas.arc(x, y, radius - lineWidth / 2, 0, Math.PI * 2);
    canvas.stroke();
    canvas.globalAlpha = 1;
  }

  function touchButton(button: TouchControlsSnapshot["buttons"][number]): void {
    const t = ui.t;
    disc(
      button.x,
      button.y,
      button.radius,
      button.held ? 0.62 : 0.4,
      button.held ? t.color.accent : t.color.scrimInk,
      button.held ? 0.95 : 0.7,
      button.held ? 4 : 3,
    );
    const size = button.prominent ? t.type.label : t.type.micro;
    ui.tag(canvas, button.label, button.x, button.y + size * 0.36, t.color.scrimInk, "center", size);
  }

  /** On-screen controls: every circle comes from the input layer's single touch layout. */
  function touchControls(snapshot: TouchControlsSnapshot): void {
    const joystick = snapshot.joystick,
      t = ui.t;
    const lessonCard = takeLessonCard();
    const magnitude = Math.hypot(joystick.dx, joystick.dy) || 1;
    const cap = Math.min(magnitude, 70);
    canvas.save();
    disc(
      joystick.anchorX,
      joystick.anchorY,
      joystick.radius,
      joystick.active ? 0.3 : 0.18,
      t.color.scrimInk,
      joystick.active ? 0.7 : 0.45,
      3,
    );
    disc(
      joystick.anchorX + (joystick.active ? (joystick.dx / magnitude) * cap : 0),
      joystick.anchorY + (joystick.active ? (joystick.dy / magnitude) * cap : 0),
      joystick.radius * 0.46,
      joystick.active ? 0.6 : 0.4,
      t.color.scrimInk,
      0.8,
      2,
    );
    if (snapshot.aim) {
      const pad = snapshot.aimPad;
      disc(pad.x, pad.y, pad.r, 0.22, t.color.scrimInk, 0.5, 3);
      disc(
        pad.x + snapshot.aim.x * pad.r * 0.8,
        pad.y + snapshot.aim.y * pad.r * 0.8,
        pad.r * 0.34,
        0.55,
        t.color.scrimInk,
        0.8,
        2,
      );
    }
    for (const button of snapshot.buttons) touchButton(button);
    if (snapshot.onboardingAlpha > 0) onboarding(snapshot, lessonCard);
    canvas.restore();
    canvas.globalAlpha = 1;
  }

  /** The coaching line's bottom, moved under this frame's lesson card when the two would meet. */
  function clearOfLessonCard(
    line: Readonly<{ title: string; hint: string; x: number; bottom: number; align: CanvasTextAlign }>,
    height: number,
    card: WorldRect | null,
  ): number {
    if (card === null) return line.bottom;
    const t = ui.t;
    canvas.font = ui.font(t.type.lead, true);
    const width = Math.max(canvas.measureText(line.title).width, canvas.measureText(line.hint).width) + t.space.md;
    const left = line.align === "left" ? line.x : line.x - width,
      right = line.align === "left" ? line.x + width : line.x;
    const meets =
      left < card.x + card.w && right > card.x && line.bottom - height < card.y + card.h && line.bottom > card.y;
    return meets ? card.y + card.h + t.space.md + height : line.bottom;
  }

  /**
   * First-touch coaching (plain text in the biome ink, no plates): beside the joystick (clear of THROW above it) and
   * above the aim pad (right-aligned to it), so neither line can leave the screen.
   */
  function onboarding(snapshot: TouchControlsSnapshot, card: WorldRect | null): void {
    const t = ui.t,
      alpha = clamp(snapshot.onboardingAlpha),
      joystick = snapshot.joystick,
      pad = snapshot.aimPad;
    const lines = [
      {
        title: "◉ MOVE",
        hint: "left thumb — anywhere on the left",
        x: joystick.homeX + joystick.radius + t.space.md,
        bottom: joystick.homeY + (t.type.lead + t.type.label + t.space.sm * 3) / 2,
        align: "left" as const,
      },
      {
        title: "DRAG TO AIM & SWING ↷",
        hint: "fast flicks = fast cuts · second finger = throw",
        x: pad.x + pad.r,
        bottom: pad.y - pad.r - t.space.md,
        align: "right" as const,
      },
    ];
    for (const line of lines) {
      const height = t.type.lead + t.type.label + t.space.sm * 3,
        bottom = clearOfLessonCard(line, height, card);
      const textX = line.align === "left" ? line.x + t.space.md : line.x - t.space.md;
      canvas.globalAlpha = alpha;
      ui.tag(canvas, line.title, textX, bottom - height + t.space.sm + t.type.lead, ui.ink, line.align, t.type.lead);
      ui.text(canvas, line.hint, textX, bottom - t.space.sm, t.type.label, line.align, t.alpha.soft * alpha);
    }
    canvas.globalAlpha = 1;
  }

  return { touchControls };
}

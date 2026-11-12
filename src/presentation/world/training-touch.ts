import type {
  WorldRenderContext, PlaygroundHelpSnapshot, TouchControlsSnapshot, TutorialCardSnapshot,
} from "./contracts";
import { clamp } from "./primitives";
import { bossHudTop, hudFrame } from "./hud";

export interface TutorialCardLayout {
  readonly x: number; readonly y: number; readonly width: number;
}

/**
 * Keeps the lesson card out of the centred multiplier lane, anchored to the HUD's
 * screen-edge frame. At narrow widths the card drops below that lane instead of
 * squeezing its copy. The card's height comes from its content.
 */
export function tutorialCardLayout(frame: Readonly<{ left: number; right: number; top: number; centerX: number }>,
  laneBottom: number, minimumTop = 0): TutorialCardLayout {
  const meterRight = frame.centerX + 150, gap = 24;
  const besideMeter = frame.right - (meterRight + gap);
  if (besideMeter >= 460) {
    const width = Math.min(700, besideMeter);
    return { x: frame.right - width, y: Math.max(frame.top, minimumTop), width };
  }
  const width = Math.min(700, frame.right - frame.left);
  return { x: frame.centerX - width / 2, y: Math.max(laneBottom, minimumTop), width };
}

export function createTrainingTouchRenderers(context: WorldRenderContext) {
  const canvas = context.canvas;
  const ui = context.ui;

  function practiceFooter(snapshot: TutorialCardSnapshot): string {
    if (snapshot.bossPractice) return "BOSS PRACTICE · BASELINE · NO REWARDS";
    if (snapshot.enemyPractice) return "ENEMY PRACTICE · BASELINE · NO REWARDS";
    if (snapshot.annex) return "WEAPON ANNEX · BASELINE · NO REWARDS";
    return `BLOCK ${String(snapshot.lessonIndex + 1)} / ${String(snapshot.lessonCount)}`;
  }

  /**
   * The lesson card: one vertical stack (focus tag, title + count, instruction,
   * progress bar, keys, lesson dots + block) so no row can overlap another.
   */
  function tutorialCard(snapshot: TutorialCardSnapshot): void {
    const t = ui.t, pad = t.space.md, frame = hudFrame(context);
    const minimumTop = Math.max(snapshot.bossPractice ? bossHudTop(context) + 3 * t.metric.bossHudH + t.type.label * 2 : 0, snapshot.clearTop ?? 0);
    const { x, y, width } = tutorialCardLayout(frame, bossHudTop(context), minimumTop);
    const inner = width - pad * 2, left = x + pad;
    const progress = snapshot.final ? undefined : snapshot.progress;
    const countText = progress ? `${String(progress.current)} / ${String(progress.goal)}` : "";
    canvas.font = ui.font(t.type.title, true);
    const countW = countText ? canvas.measureText(countText).width + t.space.md : 0;
    const tagY = y + pad + t.type.micro, titleY = tagY + t.space.sm + t.type.title;
    const description = ui.textBox(canvas, snapshot.description, left, titleY + t.space.sm + t.type.body, inner,
      { size: t.type.body, measureOnly: true, maxLines: 4 });
    const barY = titleY + t.space.sm + description.height + t.space.xs;
    const keysY = barY + (progress ? t.space.md : 0) + t.type.micro + t.space.sm;
    const footerY = keysY + (snapshot.keys.length > 0 ? Math.round(t.type.micro * 1.7) + t.space.sm : 0);
    const height = footerY + pad - y;
    ui.hudPlate(canvas, x, y, width, height);
    canvas.fillStyle = t.color.accent;
    canvas.fillRect(x, y, 4, height);
    ui.tag(canvas, `${snapshot.arenaLabel ?? "TRAINING"}  /  ${(snapshot.teachingFocus ?? "movement").toUpperCase()}`,
      left, tagY, ui.readable(t.color.accent), "left", t.type.micro);
    if (snapshot.final) ui.text(canvas, "training summary · practice arena loading…", x + width - pad, tagY, t.type.micro, "right", t.alpha.muted);
    const title = ui.fitText(canvas, snapshot.title, inner - countW, { size: t.type.title, floor: t.type.label, bold: true });
    ui.displayText(canvas, title.lines[0] ?? snapshot.title, left, titleY, title.size);
    if (progress) {
      const done = progress.current >= progress.goal;
      ui.tag(canvas, countText, x + width - pad, titleY, done ? ui.readable(t.color.accent) : ui.ink, "right", t.type.title);
    }
    ui.textBox(canvas, snapshot.description, left, titleY + t.space.sm + t.type.body, inner, { size: t.type.body, alpha: t.alpha.soft, maxLines: 4 });
    if (progress) progressBar(left, barY, inner, progress);
    let keyX = left;
    for (const key of snapshot.keys) keyX += ui.keycap(canvas, key, keyX, keysY) + t.space.sm;
    lessonDots(snapshot, left, footerY - t.type.micro * 0.35);
    ui.text(canvas, practiceFooter(snapshot), x + width - pad, footerY, t.type.micro, "right", t.alpha.muted);
    if (snapshot.completedBeat > 0) {
      const scale = 1 + (1 - Math.abs(snapshot.completedBeat - 0.9) / 0.9) * 0.4;
      ui.tag(canvas, "✓", x + width - pad, keysY, ui.readable(t.color.accent), "right", Math.round(t.type.h2 * scale));
    }
    canvas.textAlign = "left";
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

  function lessonDots(snapshot: TutorialCardSnapshot, x: number, y: number): void {
    if (snapshot.annex || snapshot.enemyPractice || snapshot.bossPractice) return;
    for (let index = 0; index < snapshot.lessonCount; index++) {
      canvas.beginPath();
      canvas.arc(x + 4 + index * 14, y, 3.5, 0, Math.PI * 2);
      if (index <= snapshot.lessonIndex) {
        canvas.fillStyle = index < snapshot.lessonIndex ? ui.t.color.accent : ui.ink;
        canvas.fill();
      } else {
        canvas.globalAlpha = 0.45;
        canvas.strokeStyle = ui.ink;
        canvas.lineWidth = 1.5;
        canvas.stroke();
        canvas.globalAlpha = 1;
      }
    }
  }

  /**
   * Playground help: a quiet plate at the top-right of the HUD frame, below the
   * multiplier lane so it never meets the combo meter.
   */
  function playgroundHelp(snapshot: PlaygroundHelpSnapshot): void {
    const t = ui.t, pad = t.space.md, frame = hudFrame(context);
    // Keyboard shortcuts only help a keyboard; touch keeps the live weapon stats.
    const lines = context.ui.density.touch ? []
      : ["TAB / E — build menu   ·   1–8 quick-spawn   ·   T dummy   ·   B boss", "K clear   ·   H heal   ·   U ability lab   ·   P pause"];
    const stats = `${snapshot.weaponId.toUpperCase()}  ·  held ${String(snapshot.heldHits)}  ·  throws ${String(snapshot.throws)}/${String(snapshot.throwHits)}`
      + `  ·  parries ${String(snapshot.perfectParries)}  ·  breaks ${String(snapshot.breakTriggers)}`;
    const layout = tutorialCardLayout(frame, bossHudTop(context), snapshot.clearTop ?? 0);
    const lineH = t.type.caption + t.space.sm, height = pad * 2 + t.type.micro + t.space.sm + (lines.length + 1) * lineH;
    ui.hudPlate(canvas, layout.x, layout.y, layout.width, height);
    canvas.fillStyle = t.color.accent;
    canvas.fillRect(layout.x, layout.y, 4, height);
    let lineY = layout.y + pad + t.type.micro;
    ui.tag(canvas, "PLAYGROUND", layout.x + pad, lineY, ui.readable(t.color.accent), "left", t.type.micro);
    for (const line of [...lines, stats]) {
      lineY += lineH;
      const fit = ui.fitText(canvas, line, layout.width - pad * 2, { size: t.type.caption, floor: t.type.micro });
      ui.text(canvas, fit.lines[0] ?? line, layout.x + pad, lineY, fit.size, "left", t.alpha.soft);
    }
  }

  /**
   * Touch controls sit on the real screen edges, over sky or a dark floor alike, so
   * they use one theme-independent treatment: a dark disc, a light ring and a light
   * label (the scrim / scrimInk pair), readable on any backdrop.
   */
  function disc(x: number, y: number, radius: number, fillAlpha: number, ring: string, ringAlpha: number, lineWidth: number): void {
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
    disc(button.x, button.y, button.radius, button.held ? 0.62 : 0.4, button.held ? t.color.accent : t.color.scrimInk, button.held ? 0.95 : 0.7, button.held ? 4 : 3);
    const size = button.prominent ? t.type.label : t.type.micro;
    ui.tag(canvas, button.label, button.x, button.y + size * 0.36, t.color.scrimInk, "center", size);
  }

  /** On-screen controls: every circle comes from the input layer's single touch layout. */
  function touchControls(snapshot: TouchControlsSnapshot): void {
    const joystick = snapshot.joystick, t = ui.t;
    const magnitude = Math.hypot(joystick.dx, joystick.dy) || 1;
    const cap = Math.min(magnitude, 70);
    canvas.save();
    disc(joystick.anchorX, joystick.anchorY, joystick.radius, joystick.active ? 0.3 : 0.18, t.color.scrimInk, joystick.active ? 0.7 : 0.45, 3);
    disc(joystick.anchorX + (joystick.active ? joystick.dx / magnitude * cap : 0), joystick.anchorY + (joystick.active ? joystick.dy / magnitude * cap : 0),
      joystick.radius * 0.46, joystick.active ? 0.6 : 0.4, t.color.scrimInk, 0.8, 2);
    if (snapshot.aim) {
      const pad = snapshot.aimPad;
      disc(pad.x, pad.y, pad.r, 0.22, t.color.scrimInk, 0.5, 3);
      disc(pad.x + snapshot.aim.x * pad.r * 0.8, pad.y + snapshot.aim.y * pad.r * 0.8, pad.r * 0.34, 0.55, t.color.scrimInk, 0.8, 2);
    }
    for (const button of snapshot.buttons) touchButton(button);
    if (snapshot.onboardingAlpha > 0) onboarding(snapshot);
    canvas.restore();
    canvas.globalAlpha = 1;
  }

  /**
   * First-touch coaching on plates: beside the joystick (clear of THROW above it) and
   * above the aim pad (right-aligned to it), so neither line can leave the screen.
   */
  function onboarding(snapshot: TouchControlsSnapshot): void {
    const t = ui.t, alpha = clamp(snapshot.onboardingAlpha), joystick = snapshot.joystick, pad = snapshot.aimPad;
    const lines = [
      { title: "◉ MOVE", hint: "left thumb — anywhere on the left", x: joystick.homeX + joystick.radius + t.space.md,
        bottom: joystick.homeY + (t.type.lead + t.type.label + t.space.sm * 3) / 2, align: "left" as const },
      { title: "DRAG TO AIM & SWING ↷", hint: "fast flicks = fast cuts · second finger = throw", x: pad.x + pad.r, bottom: pad.y - pad.r - t.space.md, align: "right" as const },
    ];
    canvas.globalAlpha = alpha;
    for (const line of lines) {
      canvas.font = ui.font(t.type.label, false);
      const width = Math.max(canvas.measureText(line.hint).width, canvas.measureText(line.title).width * 1.2) + t.space.md * 2;
      const height = t.type.lead + t.type.label + t.space.sm * 3, x = line.align === "left" ? line.x : line.x - width;
      ui.hudPlate(canvas, x, line.bottom - height, width, height);
      const textX = line.align === "left" ? x + t.space.md : x + width - t.space.md;
      ui.tag(canvas, line.title, textX, line.bottom - height + t.space.sm + t.type.lead, ui.ink, line.align, t.type.lead);
      ui.text(canvas, line.hint, textX, line.bottom - t.space.sm, t.type.label, line.align, t.alpha.soft);
    }
    canvas.globalAlpha = 1;
  }

  return { tutorialCard, playgroundHelp, touchControls };
}

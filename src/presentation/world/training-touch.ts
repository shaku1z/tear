import type {
  LegacyWorldRenderContext, PlaygroundHelpSnapshot, TouchControlsSnapshot, TutorialCardSnapshot,
} from "./contracts";
import { clamp, wrapLeft } from "./primitives";

export function createTrainingTouchRenderers(context: LegacyWorldRenderContext) {
  const canvas = context.canvas;
  const ui = context.ui;

  function drawKeyCap(x: number, y: number, label: string): number {
    canvas.font = ui.font(11, true);
    const width = Math.max(30, canvas.measureText(label).width + 16);
    canvas.fillStyle = "rgba(0,0,0,0.07)"; canvas.fillRect(x, y, width, 22);
    canvas.strokeStyle = "rgba(0,0,0,0.55)"; canvas.lineWidth = 1.5; canvas.strokeRect(x, y, width, 22);
    canvas.fillStyle = "rgba(0,0,0,0.35)"; canvas.fillRect(x + 2, y + 19, width - 4, 2);
    canvas.fillStyle = "#000"; canvas.textAlign = "center"; canvas.textBaseline = "middle";
    canvas.fillText(label, x + width / 2, y + 11); canvas.textBaseline = "alphabetic";
    return x + width + 8;
  }

  function tutorialCard(snapshot: TutorialCardSnapshot): void {
    const type = ui.t.type, width = 700, x = context.width - width - 28 - context.safe.right;
    const y = 24 + context.safe.top, height = 138;
    canvas.save();
    canvas.globalAlpha = 0.88; canvas.fillStyle = ui.t.color.paper; canvas.fillRect(x, y, width, height);
    canvas.globalAlpha = 0.45; canvas.strokeStyle = "#000"; canvas.lineWidth = 1.5; canvas.strokeRect(x, y, width, height);
    canvas.globalAlpha = 1; canvas.fillStyle = ui.t.color.accent; canvas.fillRect(x, y, 4, height);
    ui.tag(canvas, `LESSON ${String(snapshot.lessonIndex + 1)} / ${String(snapshot.lessonCount)}`, x + 20, y + 24, ui.t.color.accent, "left", type.micro);
    canvas.fillStyle = "#000"; canvas.font = ui.font(type.label + 10, true); canvas.textAlign = "left";
    canvas.fillText(snapshot.title, x + 20, y + 52);
    canvas.font = ui.font(type.caption, false); canvas.fillStyle = "rgba(0,0,0,0.75)";
    wrapLeft(canvas, snapshot.description, x + 20, y + 74, width - 150, 19);
    if (snapshot.progress && !snapshot.final) {
      const progress = snapshot.progress;
      canvas.font = ui.font(26, true); canvas.textAlign = "right";
      canvas.fillStyle = progress.current >= progress.goal ? ui.t.color.accent : "#000";
      canvas.fillText(`${String(progress.current)} / ${String(progress.goal)}`, x + width - 22, y + 52);
      canvas.globalAlpha = 0.15; canvas.fillStyle = "#000"; canvas.fillRect(x + width - 122, y + 62, 100, 5);
      canvas.globalAlpha = 1; canvas.fillStyle = ui.t.color.accent;
      canvas.fillRect(x + width - 122, y + 62, 100 * clamp(progress.current / Math.max(1, progress.goal)), 5);
    }
    if (snapshot.keys.length > 0) {
      let keyX = x + 20;
      canvas.save();
      for (const key of snapshot.keys) keyX = drawKeyCap(keyX, y + 84, key);
      canvas.restore();
    }
    for (let index = 0; index < snapshot.lessonCount; index++) {
      const dotX = x + 20 + index * 18;
      canvas.beginPath(); canvas.arc(dotX, y + height - 13, 4, 0, Math.PI * 2);
      if (index < snapshot.lessonIndex) { canvas.fillStyle = ui.t.color.accent; canvas.fill(); }
      else if (index === snapshot.lessonIndex) { canvas.fillStyle = "#000"; canvas.fill(); }
      else { canvas.strokeStyle = "rgba(0,0,0,0.3)"; canvas.lineWidth = 1.5; canvas.stroke(); }
    }
    if (!snapshot.final) {
      canvas.font = ui.font(type.micro, true); canvas.fillStyle = "rgba(0,0,0,0.4)"; canvas.textAlign = "right";
      canvas.fillText("N — skip lesson", x + width - 18, y + height - 10);
    }
    if (snapshot.completedBeat > 0) {
      const scale = 1 + (1 - Math.abs(snapshot.completedBeat - 0.9) / 0.9) * 0.4;
      canvas.font = ui.font(Math.round(40 * scale), true); canvas.fillStyle = ui.t.color.accent; canvas.textAlign = "right";
      canvas.fillText("✓", x + width - 22, y + 108);
    }
    if (snapshot.final) {
      canvas.font = ui.font(type.micro, true); canvas.fillStyle = "rgba(0,0,0,0.5)"; canvas.textAlign = "right";
      canvas.fillText("returning to the menu…", x + width - 16, y + 24);
    }
    canvas.restore(); canvas.textAlign = "left";
  }

  function playgroundHelp(snapshot: PlaygroundHelpSnapshot): void {
    const type = ui.t.type, width = 700, x = context.width - width - 28 - context.safe.right;
    const y = 24 + context.safe.top, height = 116;
    canvas.save();
    canvas.globalAlpha = 0.84; canvas.fillStyle = ui.t.color.paper; canvas.fillRect(x, y, width, height);
    canvas.globalAlpha = 0.45; canvas.strokeStyle = "#000"; canvas.lineWidth = 1.5; canvas.strokeRect(x, y, width, height);
    canvas.globalAlpha = 1; canvas.fillStyle = ui.t.color.accent; canvas.fillRect(x, y, 4, height);
    ui.tag(canvas, "PLAYGROUND", x + 20, y + 24, ui.t.color.accent, "left", type.micro);
    canvas.fillStyle = "rgba(0,0,0,0.78)"; canvas.font = ui.font(type.caption, false); canvas.textAlign = "left";
    canvas.fillText("TAB / E — build menu   ·   1–8 quick-spawn   ·   T dummy   ·   B boss", x + 20, y + 50);
    canvas.fillText("K clear   ·   H heal   ·   U ability lab   ·   P pause", x + 20, y + 74);
    canvas.fillText(`${snapshot.weaponId.toUpperCase()}  ·  held ${String(snapshot.heldHits)}  ·  throws ${String(snapshot.throws)}/${String(snapshot.throwHits)}  ·  parries ${String(snapshot.perfectParries)}  ·  breaks ${String(snapshot.breakTriggers)}`,
      x + 20, y + 98);
    canvas.restore(); canvas.textAlign = "left";
  }

  function touchControls(snapshot: TouchControlsSnapshot): void {
    const joystick = snapshot.joystick;
    const magnitude = Math.hypot(joystick.dx, joystick.dy) || 1;
    const cap = Math.min(magnitude, 70);
    canvas.save();
    canvas.globalAlpha = joystick.active ? 0.38 : 0.16;
    canvas.strokeStyle = context.ink; canvas.lineWidth = 3;
    canvas.beginPath(); canvas.arc(joystick.anchorX, joystick.anchorY, 92, 0, Math.PI * 2); canvas.stroke();
    if (joystick.active) {
      canvas.globalAlpha = 0.30;
      canvas.beginPath(); canvas.arc(joystick.anchorX, joystick.anchorY, 26, 0, Math.PI * 2); canvas.stroke();
      canvas.fillStyle = context.ink; canvas.beginPath(); canvas.arc(joystick.anchorX, joystick.anchorY, 4, 0, Math.PI * 2); canvas.fill();
    }
    canvas.globalAlpha = joystick.active ? 0.5 : 0.22; canvas.fillStyle = context.ink;
    canvas.beginPath();
    canvas.arc(joystick.anchorX + (joystick.active ? joystick.dx / magnitude * cap : 0),
      joystick.anchorY + (joystick.active ? joystick.dy / magnitude * cap : 0), 42, 0, Math.PI * 2);
    canvas.fill();
    if (snapshot.aim) {
      const aimX = context.width - 300 - context.safe.right, aimY = context.height - 260 - context.safe.bottom;
      canvas.globalAlpha = 0.20; canvas.strokeStyle = context.ink; canvas.lineWidth = 3;
      canvas.beginPath(); canvas.arc(aimX, aimY, 64, 0, Math.PI * 2); canvas.stroke();
      canvas.globalAlpha = 0.5; canvas.fillStyle = context.ink;
      canvas.beginPath(); canvas.arc(aimX + snapshot.aim.x * 52, aimY + snapshot.aim.y * 52, 22, 0, Math.PI * 2); canvas.fill();
    }
    for (const button of snapshot.buttons) {
      canvas.globalAlpha = button.held ? 0.34 : 0.16; canvas.fillStyle = button.held ? ui.t.color.accent : context.ink;
      canvas.beginPath(); canvas.arc(button.x, button.y, button.radius * (button.held ? 0.94 : 1), 0, Math.PI * 2); canvas.fill();
      canvas.globalAlpha = button.held ? 0.8 : 0.4; canvas.strokeStyle = button.held ? ui.t.color.accent : context.ink;
      canvas.lineWidth = button.held ? 4 : 3; canvas.beginPath(); canvas.arc(button.x, button.y, button.radius, 0, Math.PI * 2); canvas.stroke();
      canvas.globalAlpha = 0.62; canvas.fillStyle = context.ink;
      canvas.font = ui.font(button.prominent ? 16 : 13, true); canvas.textAlign = "center"; canvas.textBaseline = "middle";
      canvas.fillText(button.label, button.x, button.y + 1); canvas.textBaseline = "alphabetic";
    }
    if (snapshot.onboardingAlpha > 0) {
      const alpha = clamp(snapshot.onboardingAlpha);
      canvas.globalAlpha = alpha * 0.85; canvas.fillStyle = context.ink; canvas.textAlign = "center"; canvas.textBaseline = "alphabetic";
      canvas.font = ui.font(20, true);
      canvas.fillText("◉ MOVE", context.width * 0.20, context.height - 320 - context.safe.bottom);
      canvas.fillText("DRAG TO AIM & SWING ↷", context.width * 0.68, context.height - 340 - context.safe.bottom);
      canvas.font = ui.font(13, false); canvas.globalAlpha = alpha * 0.6;
      canvas.fillText("left thumb — anywhere on the left", context.width * 0.20, context.height - 294 - context.safe.bottom);
      canvas.fillText("fast flicks = fast cuts · second finger = throw", context.width * 0.68, context.height - 314 - context.safe.bottom);
      canvas.textAlign = "left";
    }
    canvas.restore(); canvas.globalAlpha = 1;
  }

  return { tutorialCard, playgroundHelp, touchControls };
}

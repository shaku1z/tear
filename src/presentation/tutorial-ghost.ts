import type { TutorialGhostSnapshot } from "../gameplay/training/tutorial-controller";

export interface TutorialGhostPalette {
  readonly ink: string;
  readonly accent: string;
  readonly target: string;
  readonly hostileShot: string;
}

export interface TutorialGhostLabelPort {
  draw(context: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void;
}

export function drawTutorialGhost(
  context: CanvasRenderingContext2D,
  snapshot: TutorialGhostSnapshot,
  palette: TutorialGhostPalette,
  label: TutorialGhostLabelPort,
): void {
  if (!snapshot.visible) return;
  const { actor, blade, target, shot } = snapshot;
  context.save();
  if (target.visible) {
    context.globalAlpha = target.hit ? 0.55 : 0.26;
    context.fillStyle = target.hit ? "#fff" : palette.target;
    context.fillRect(target.x - 17, target.y - 22, 34, 44);
    context.strokeStyle = palette.ink; context.lineWidth = 2; context.strokeRect(target.x - 17, target.y - 22, 34, 44);
    if (target.hit) {
      context.strokeStyle = palette.accent; context.beginPath(); context.arc(target.x, target.y, 26, 0, Math.PI * 2); context.stroke();
    }
  }
  context.fillStyle = palette.ink;
  for (const afterimage of actor.dashAfterimages) {
    context.globalAlpha = afterimage.alpha;
    context.fillRect(afterimage.x - 14, afterimage.y - 22, 28, 44);
  }
  context.globalAlpha = 0.34;
  context.fillRect(actor.x - 14, actor.y - 22, 28, 44);
  context.fillStyle = palette.accent;
  context.fillRect(actor.x + actor.facing * 4 - 3, actor.y - 11, 7, 5);
  const handX = actor.x, handY = actor.y - 4;
  if (blade.thrown) {
    context.save(); context.translate(blade.x, blade.y); context.rotate(snapshot.time * 14);
    context.globalAlpha = 0.4; context.strokeStyle = palette.ink; context.lineWidth = 5; context.lineCap = "round";
    context.beginPath(); context.moveTo(-16, 0); context.lineTo(16, 0); context.stroke(); context.restore();
  } else {
    context.globalAlpha = 0.34; context.strokeStyle = palette.ink; context.lineWidth = 5; context.lineCap = "round";
    context.beginPath(); context.moveTo(handX, handY); context.lineTo(blade.x, blade.y); context.stroke();
    if (blade.swinging) {
      context.globalAlpha = 0.3; context.strokeStyle = palette.accent; context.lineWidth = 7;
      context.beginPath(); context.arc(handX, handY, 66, blade.angle - 0.5, blade.angle, false); context.stroke();
      context.globalAlpha = 0.5; context.fillStyle = palette.accent; context.beginPath(); context.arc(blade.x, blade.y, 4, 0, Math.PI * 2); context.fill();
    }
  }
  if (shot.visible) {
    context.globalAlpha = 0.55; context.fillStyle = shot.deflected ? palette.accent : palette.hostileShot;
    context.beginPath(); context.arc(shot.x, shot.y, 7, 0, Math.PI * 2); context.fill();
    context.globalAlpha = 0.25; context.fillRect(shot.x + (shot.deflected ? -26 : 8), shot.y - 2, 20, 4);
  }
  context.globalAlpha = 0.55;
  label.draw(context, "GHOST", actor.x, actor.y - 40, palette.accent);
  context.restore();
}

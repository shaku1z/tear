import type { TutorialGoldDisplay } from "../gameplay/training/tutorial-ghost-coach";
import type { TutorialGhostLabelPort, TutorialGhostPalette } from "./tutorial-ghost";

/** Only recorded poses and actual target response. No eased physics, guessed hits or world writes. */
export function drawTutorialGoldGhost(
  context: CanvasRenderingContext2D,
  gold: TutorialGoldDisplay,
  palette: TutorialGhostPalette,
  label: TutorialGhostLabelPort,
): void {
  const { frame } = gold,
    body = frame.body,
    blade = frame.blade;
  context.save();
  context.strokeStyle = palette.ink;
  context.lineWidth = 1;
  context.globalAlpha = 0.14;
  context.setLineDash([6, 6]);
  for (const platform of gold.platforms) context.strokeRect(platform.x, platform.y, platform.w, platform.h);
  context.setLineDash([]);
  for (const actor of frame.actors) {
    if (actor.dead) continue;
    const contact = gold.contacts.includes(actor.id);
    context.globalAlpha = contact ? 0.75 : 0.3;
    context.fillStyle = palette.target;
    context.fillRect(actor.x - 17, actor.y - 22, 34, 44);
    context.strokeStyle = palette.ink;
    context.strokeRect(actor.x - 17, actor.y - 22, 34, 44);
    if (contact) {
      context.strokeStyle = palette.accent;
      context.beginPath();
      context.arc(actor.x, actor.y, 27, 0, Math.PI * 2);
      context.stroke();
    }
  }
  context.globalAlpha = 0.4;
  context.fillStyle = palette.ink;
  context.beginPath();
  context.arc(body.x, body.y - 17, 7, 0, Math.PI * 2);
  context.fill();
  context.fillRect(body.x - 10, body.y - 11, 20, 23);
  context.fillRect(body.x - 10, body.y + 11, 7, 12);
  context.fillRect(body.x + 3, body.y + 11, 7, 12);
  context.fillStyle = palette.accent;
  context.fillRect(body.x + body.facing * 4 - 2, body.y - 20, 4, 3);
  context.strokeStyle = palette.ink;
  context.lineWidth = 5;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(blade.x, blade.y);
  context.lineTo(blade.tipX, blade.tipY);
  context.stroke();
  if (gold.reducedMotion) {
    context.lineWidth = 2;
    context.strokeStyle = palette.accent;
    context.beginPath();
    context.arc(blade.tipX, blade.tipY, 5, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.globalAlpha = 0.2;
    context.strokeStyle = palette.accent;
    context.lineWidth = 9;
    context.beginPath();
    gold.trail.forEach((pose, index) => {
      if (index === 0) context.moveTo(pose.blade.tipX, pose.blade.tipY);
      else context.lineTo(pose.blade.tipX, pose.blade.tipY);
    });
    context.stroke();
  }
  for (const shot of frame.projectiles)
    if (!shot.dead) {
      context.globalAlpha = 0.5;
      context.fillStyle = shot.deflected ? palette.accent : palette.hostileShot;
      context.beginPath();
      context.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2);
      context.fill();
    }
  const personal = gold.personal;
  if (gold.mode === "comparison" || gold.reducedMotion) {
    if (!gold.reducedMotion) {
      context.globalAlpha = 0.28;
      context.strokeStyle = palette.accent;
      context.lineWidth = 2;
      context.beginPath();
      gold.path.forEach((pose, index) => {
        if (index === 0) context.moveTo(pose.body.x, pose.body.y);
        else context.lineTo(pose.body.x, pose.body.y);
      });
      context.stroke();
    }
    for (const marker of gold.markers) {
      context.globalAlpha = 0.55;
      context.strokeStyle = palette.accent;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(marker.frame.body.x, marker.frame.body.y, 5, 0, Math.PI * 2);
      context.stroke();
      label.draw(context, marker.kind.toUpperCase(), marker.frame.body.x, marker.frame.body.y - 30, palette.accent);
    }
  }
  if (personal.length > 0) {
    const first = personal[0];
    if (first) {
      context.setLineDash([3, 7]);
      context.lineWidth = 3;
      context.strokeStyle = palette.ink;
      context.globalAlpha = 0.65;
      if (!gold.reducedMotion) {
        context.beginPath();
        personal.forEach((pose, index) => {
          if (index === 0) context.moveTo(pose[1], pose[2]);
          else context.lineTo(pose[1], pose[2]);
        });
        context.stroke();
      }
      for (const pose of personal)
        if (pose[5] !== "pose") {
          context.beginPath();
          context.rect(pose[1] - 4, pose[2] - 4, 8, 8);
          context.stroke();
        }
      context.setLineDash([]);
      label.draw(
        context,
        gold.reducedMotion ? "YOUR VALID ATTEMPT · SQUARES" : "YOUR VALID ATTEMPT · DASHED",
        first[1],
        Math.max(190, first[2] - 104),
        palette.ink,
      );
    }
  }
  context.globalAlpha = 0.8;
  label.draw(
    context,
    `${gold.mode === "comparison" ? "GOLD / SHORTEST VALID THIS SESSION" : gold.mode === "diagnostic" ? "CONTACT / TIMING GUIDE" : "GOLD DEMONSTRATION"} · ${String(gold.rate)}× · ${((gold.toTick - gold.fromTick) / 120).toFixed(1)}s RECORDED`,
    body.x,
    body.y - 52,
    palette.accent,
  );
  if (gold.glyphs.length) label.draw(context, gold.glyphs.join("  ·  "), body.x, body.y - 77, palette.ink);
  if (gold.mode === "diagnostic") label.draw(context, gold.diagnosis, body.x, Math.max(190, body.y - 104), palette.ink);
  context.restore();
}

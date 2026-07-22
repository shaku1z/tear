import type { CONFIG as GAME_CONFIG } from "../../config/game-config";
import type { ProjectilePresentationPort, ProjectileRenderSnapshot } from "../../gameplay/entities/projectile";
import { isCanvasSurface } from "./canvas-surface";

type GameConfig = typeof GAME_CONFIG;

export interface ProjectileRendererDependencies {
  readonly clock: { readonly sim: number };
  readonly config: GameConfig;
  readonly graphics: { readonly low: boolean };
  readonly theme: { readonly dark: boolean; readonly ink: string };
  readonly clamp: (value: number, min: number, max: number) => number;
}

function drawTrail(context: CanvasRenderingContext2D, projectile: ProjectileRenderSnapshot, color: string, dark: boolean): void {
  const count = projectile.histCount;
  if (count < 2) return;
  context.save();
  if (dark) context.globalCompositeOperation = "lighter";
  context.strokeStyle = color; context.lineCap = "round";
  for (let index = 1; index < count; index++) {
    const weight = index / count;
    const previous = projectile.trailPoint(index - 1);
    const current = projectile.trailPoint(index);
    if (!previous || !current) continue;
    context.globalAlpha = weight * 0.5;
    context.lineWidth = projectile.r * 1.7 * weight;
    context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(current.x, current.y); context.stroke();
  }
  context.globalAlpha = 1; context.restore();
}

export function createProjectileRenderer({
  clock, config, graphics, theme, clamp,
}: ProjectileRendererDependencies): ProjectilePresentationPort {
  return {
    draw(surface: unknown, projectile: ProjectileRenderSnapshot): void {
      if (!isCanvasSurface(surface)) return;
      const context = surface;
      const colors = config.colors;
      const ink = theme.ink;
      const dark = theme.dark;
      const lowGraphics = graphics.low;
      const time = clock.sim * 1000;

      if (!(projectile.mine && projectile.armed) && !projectile.embedded && !lowGraphics) {
        const trailColor = projectile.deflected
          ? (projectile.perfect ? colors.perfect : colors.deflected)
          : (projectile.tint ?? (projectile.shock ? colors.slam : projectile.mud ? colors.sludge : projectile.bomb ? colors.bomber : colors.enemyShot));
        drawTrail(context, projectile, trailColor, dark);
      }

      if (projectile.sweeper) {
        const radius = 30;
        const state = projectile.sweeperState ?? "hostile";
        const ratio = clamp(projectile.integrity / Math.max(1, projectile.maxIntegrity), 0, 1);
        const returned = state === "returned";
        const batted = state === "batted";
        context.save(); context.translate(projectile.x, projectile.y);
        if (projectile.sweeperStyle === "shard") {
          const shell = "#6ef2ff";
          const palette = ["#6ef2ff", "#d65cff", "#ffffff"];
          context.rotate(projectile.embedded ? 0.18 : time / 250 * projectile.spinDir);
          context.globalAlpha = projectile.embedded ? 0.52 : 1;
          if (!lowGraphics && !projectile.embedded) { context.shadowColor = returned ? "#fff" : shell; context.shadowBlur = 15; }
          const count = Math.max(1, Math.min(6, projectile.integrity + 1));
          for (let index = 0; index < count; index++) {
            const angle = (index * 1.73 + index * index * 0.11) % (Math.PI * 2);
            const orbit = radius * (0.82 + (index % 3) * 0.12);
            const x = Math.cos(angle) * orbit;
            const y = Math.sin(angle) * orbit * 0.82;
            context.save(); context.translate(x, y); context.rotate(angle + Math.PI / 4);
            context.fillStyle = palette[index % palette.length] ?? palette[0] ?? "#fff"; context.beginPath();
            context.moveTo(-8 - (index % 2) * 4, 0); context.lineTo(0, -5 - (index % 3)); context.lineTo(12 + (index % 2) * 3, 0); context.lineTo(0, 5); context.closePath(); context.fill();
            context.shadowBlur = 0; context.strokeStyle = ink; context.lineWidth = 1.5; context.stroke(); context.restore();
          }
          context.shadowBlur = 0; context.strokeStyle = returned ? "#fff" : shell; context.lineWidth = returned ? 4 : 2; context.setLineDash(batted ? [6, 5] : []);
          context.beginPath(); context.ellipse(0, 0, radius + 5 + Math.sin(time / 80) * 3, radius * 0.72, 0, 0, Math.PI * 2); context.stroke(); context.setLineDash([]);
          context.fillStyle = returned ? "#fff" : "#171021"; context.beginPath();
          if (returned) { context.moveTo(0, -9); context.lineTo(9, 0); context.lineTo(0, 9); context.lineTo(-9, 0); context.closePath(); }
          else context.arc(0, 0, 7, 0, Math.PI * 2);
          context.fill();
          if (returned) { context.strokeStyle = "#6ef2ff"; context.lineWidth = 2; context.beginPath(); context.moveTo(-12, 0); context.lineTo(12, 0); context.moveTo(0, -12); context.lineTo(0, 12); context.stroke(); }
          context.restore(); return;
        }

        const steel = "#69717b";
        const furnace = "#ff8a32";
        context.rotate(projectile.embedded ? 0.3 : time / 90 * projectile.spinDir);
        context.globalAlpha = projectile.embedded ? 0.66 : 1;
        if (!lowGraphics && !projectile.embedded) { context.shadowColor = returned ? "#fff" : furnace; context.shadowBlur = 10; }
        const teeth = Math.max(2, Math.round(12 * ratio));
        context.fillStyle = steel; context.strokeStyle = returned ? "#fff" : (batted ? furnace : ink); context.lineWidth = returned ? 4 : 2;
        context.beginPath();
        for (let index = 0; index < teeth; index++) {
          const outerAngle = (index / 12) * Math.PI * 2;
          const innerAngle = ((index + 0.5) / 12) * Math.PI * 2;
          context.lineTo(Math.cos(outerAngle) * radius, Math.sin(outerAngle) * radius);
          context.lineTo(Math.cos(innerAngle) * radius * 0.78, Math.sin(innerAngle) * radius * 0.78);
        }
        context.closePath(); context.fill(); context.shadowBlur = 0; context.stroke();
        context.fillStyle = ink; context.fillRect(-12, -7, 24, 14); context.fillStyle = returned ? "#fff" : furnace; context.fillRect(-6, -5, 12, 10);
        if (returned) { context.strokeStyle = colors.perfect; context.lineWidth = 2; context.beginPath(); context.moveTo(-10, 0); context.lineTo(10, 0); context.moveTo(0, -10); context.lineTo(0, 10); context.stroke(); }
        if (!projectile.embedded) {
          context.globalAlpha = 0.4; context.strokeStyle = returned ? colors.perfect : furnace; context.lineWidth = 2; context.setLineDash(batted ? [7, 5] : []);
          context.beginPath(); context.arc(0, 0, radius - 3, 0, Math.PI * 1.2); context.stroke(); context.setLineDash([]);
          if (!lowGraphics) {
            context.globalAlpha = 0.8; context.fillStyle = "#ffd66e";
            for (let spark = 0; spark < 3; spark++) {
              const angle = time / 40 + spark * 2.1;
              const sparkRadius = radius + 3 + spark * 5;
              context.fillRect(Math.cos(angle) * sparkRadius, Math.sin(angle) * sparkRadius, 3, 3);
            }
          }
        } else {
          context.globalAlpha = 0.7; context.strokeStyle = ink; context.lineWidth = 3; context.setLineDash([5, 4]);
          context.beginPath(); context.arc(0, 0, radius + 4, 0, Math.PI * 2); context.stroke(); context.setLineDash([]);
        }
        context.restore(); return;
      }

      if (projectile.crownfire) {
        const gold = "#f6b817";
        const white = "#fff7d6";
        context.save(); context.translate(projectile.x, projectile.y);
        if (!lowGraphics) { context.shadowColor = gold; context.shadowBlur = projectile.shock ? 18 : 11; }
        if (projectile.shock) {
          const radius = projectile.r * 1.75;
          const flicker = 0.88 + 0.12 * Math.sin(time / 55 + projectile.x * 0.02);
          context.fillStyle = gold; context.globalAlpha = 0.88;
          context.beginPath(); context.moveTo(-radius, projectile.r);
          context.lineTo(-projectile.r * 0.65, -projectile.r * 0.2);
          context.lineTo(-projectile.r * 0.18, -projectile.r * 1.45 * flicker);
          context.lineTo(projectile.r * 0.12, -projectile.r * 0.35);
          context.lineTo(projectile.r * 0.72, -projectile.r * 0.95 * flicker);
          context.lineTo(radius, projectile.r); context.closePath(); context.fill();
          context.shadowBlur = 0; context.fillStyle = white; context.globalAlpha = 0.96;
          context.beginPath(); context.moveTo(-projectile.r * 0.88, projectile.r * 0.7);
          context.lineTo(0, -projectile.r * 0.82); context.lineTo(projectile.r * 0.88, projectile.r * 0.7); context.closePath(); context.fill();
          context.strokeStyle = ink; context.lineWidth = 1.5; context.globalAlpha = 0.8; context.stroke();
        } else {
          context.rotate(time / 260); context.fillStyle = gold; context.globalAlpha = 0.92; context.beginPath();
          for (let index = 0; index < 12; index++) {
            const angle = index / 12 * Math.PI * 2;
            const radius = index % 2 ? projectile.r * 0.92 : projectile.r * 1.45;
            context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
          }
          context.closePath(); context.fill(); context.shadowBlur = 0; context.fillStyle = white;
          context.beginPath(); context.arc(0, 0, projectile.r * 0.58, 0, Math.PI * 2); context.fill();
          context.strokeStyle = ink; context.lineWidth = 1.5; context.stroke();
        }
        context.restore(); return;
      }

      if (projectile.shock) {
        const color = projectile.tint ?? colors.slam;
        if (projectile.quake) {
          const height = projectile.r * 3.0;
          const wobble = Math.sin(time / 38 + projectile.x * 0.03) * 3;
          context.save(); if (!lowGraphics) { context.shadowColor = color; context.shadowBlur = 12; }
          context.fillStyle = color; context.globalAlpha = 0.88; context.beginPath();
          context.moveTo(projectile.x - projectile.r, projectile.y + projectile.r);
          context.lineTo(projectile.x - projectile.r * 0.45 + wobble, projectile.y + projectile.r - height * 0.55);
          context.lineTo(projectile.x + wobble, projectile.y + projectile.r - height);
          context.lineTo(projectile.x + projectile.r * 0.45 + wobble, projectile.y + projectile.r - height * 0.5);
          context.lineTo(projectile.x + projectile.r, projectile.y + projectile.r);
          context.closePath(); context.fill(); context.shadowBlur = 0; context.globalAlpha = 1; context.strokeStyle = ink; context.lineWidth = 2; context.stroke();
          context.fillStyle = ink; context.globalAlpha = 0.7;
          for (let index = 0; index < 3; index++) context.fillRect(projectile.x + wobble + (index - 1) * 9, projectile.y + projectile.r - height - 7 - (index % 2) * 7, 4, 4);
          context.globalAlpha = 1; context.restore(); return;
        }
        context.save(); if (!lowGraphics) { context.shadowColor = color; context.shadowBlur = 10; }
        context.fillStyle = color; context.globalAlpha = 0.92; context.beginPath();
        context.moveTo(projectile.x - projectile.r, projectile.y + projectile.r);
        context.lineTo(projectile.x, projectile.y - projectile.r); context.lineTo(projectile.x + projectile.r, projectile.y + projectile.r);
        context.closePath(); context.fill(); context.shadowBlur = 0; context.globalAlpha = 1; context.strokeStyle = ink; context.lineWidth = 1.5; context.stroke();
        context.restore(); return;
      }

      if (projectile.mud && !projectile.deflected) {
        const wobble = Math.sin(time / 90) * 1.4;
        context.fillStyle = colors.sludge; context.beginPath(); context.ellipse(projectile.x, projectile.y, projectile.r + wobble, projectile.r - wobble, 0, 0, Math.PI * 2); context.fill();
        context.strokeStyle = ink; context.lineWidth = 1.5; context.stroke();
        context.fillStyle = colors.sludge; context.beginPath(); context.arc(projectile.x + projectile.r * 0.5, projectile.y - projectile.r * 0.4, projectile.r * 0.3, 0, Math.PI * 2); context.fill();
        return;
      }

      if (projectile.root && !projectile.deflected) {
        context.save(); context.translate(projectile.x, projectile.y); context.rotate(time / 260);
        context.strokeStyle = projectile.tint ?? colors.enemyShot; context.lineWidth = 3.5;
        for (const offset of [-projectile.r * 0.5, projectile.r * 0.5]) {
          context.beginPath(); context.ellipse(offset, 0, projectile.r * 0.7, projectile.r * 0.45, 0, 0, Math.PI * 2); context.stroke();
        }
        context.restore(); return;
      }

      if (projectile.mine) {
        context.fillStyle = projectile.deflected ? colors.deflected : colors.bomber;
        context.beginPath(); context.arc(projectile.x, projectile.y, projectile.r, Math.PI, 0); context.fill();
        context.strokeStyle = ink; context.lineWidth = 2; context.stroke();
        const blink = projectile.armed && Math.floor(time / 140) % 2 === 0;
        context.fillStyle = projectile.armed ? (blink ? colors.charger : ink) : "#888";
        context.beginPath(); context.arc(projectile.x, projectile.y - 1, 2.5, 0, Math.PI * 2); context.fill();
        return;
      }

      if (projectile.bomb && !projectile.deflected) {
        const groundY = config.world.groundY;
        const fall = clamp(1 - (groundY - projectile.y) / 460, 0.25, 1);
        context.save(); context.globalAlpha = 0.16; context.fillStyle = "#000";
        context.beginPath(); context.ellipse(projectile.x, groundY - 3, 24 * fall, 6 * fall, 0, 0, Math.PI * 2); context.fill(); context.restore();
        const pulse = 0.5 + 0.5 * Math.sin(time / 110);
        context.save(); if (!lowGraphics) { context.shadowColor = colors.bomber; context.shadowBlur = 9; }
        context.strokeStyle = colors.bomber; context.globalAlpha = 0.32 + 0.28 * pulse; context.lineWidth = 2;
        context.beginPath(); context.arc(projectile.x, projectile.y, projectile.r + 6 + 3 * pulse, 0, Math.PI * 2); context.stroke(); context.restore();
        context.save(); if (!lowGraphics) { context.shadowColor = colors.bomber; context.shadowBlur = dark ? 12 : 7; }
        context.fillStyle = colors.bomber; context.beginPath(); context.arc(projectile.x, projectile.y, projectile.r, 0, Math.PI * 2); context.fill();
        context.shadowBlur = 0; context.strokeStyle = ink; context.lineWidth = 2; context.stroke();
        context.globalAlpha = 0.45; context.lineWidth = 1; context.beginPath();
        context.moveTo(projectile.x - projectile.r, projectile.y); context.lineTo(projectile.x + projectile.r, projectile.y);
        context.moveTo(projectile.x, projectile.y - projectile.r); context.lineTo(projectile.x, projectile.y + projectile.r); context.stroke(); context.restore();
        const fuseY = projectile.y - projectile.r - 5;
        const flicker = 0.55 + 0.45 * Math.sin(time / 38);
        context.save(); context.strokeStyle = ink; context.lineWidth = 2;
        context.beginPath(); context.moveTo(projectile.x, projectile.y - projectile.r); context.lineTo(projectile.x, fuseY); context.stroke();
        if (!lowGraphics) { context.shadowColor = "#ffd23e"; context.shadowBlur = 10; }
        context.globalAlpha = flicker; context.fillStyle = Math.floor(time / 60) % 2 ? "#ffd23e" : "#ff8a1e";
        context.beginPath(); context.arc(projectile.x, fuseY, 2.5 + 1.6 * flicker, 0, Math.PI * 2); context.fill(); context.restore();
        return;
      }

      if (projectile.crescent) {
        const color = projectile.deflected ? (projectile.perfect ? colors.perfect : colors.deflected) : (projectile.tint ?? "#b06cff");
        const angle = Math.atan2(projectile.vy, projectile.vx);
        const radius = projectile.r * 1.7;
        context.save(); context.translate(projectile.x, projectile.y); context.rotate(angle);
        if (!lowGraphics) { context.shadowColor = color; context.shadowBlur = 7; }
        context.fillStyle = color; context.beginPath();
        context.arc(-radius * 0.25, 0, radius, -1.25, 1.25, false);
        context.arc(-radius * 0.95, 0, radius * 0.9, 1.08, -1.08, true);
        context.closePath(); context.fill(); context.shadowBlur = 0;
        context.strokeStyle = ink; context.lineWidth = 2; context.stroke();
        context.globalAlpha = 0.7; context.strokeStyle = "#efe3ff"; context.lineWidth = 1.5;
        context.beginPath(); context.arc(-radius * 0.25, 0, radius, -1.12, 1.12); context.stroke(); context.globalAlpha = 1;
        if (projectile.deflected) { context.strokeStyle = color; context.lineWidth = 2; context.beginPath(); context.arc(0, 0, radius * 0.5, 0, Math.PI * 2); context.stroke(); }
        context.restore(); return;
      }

      const color = projectile.deflected ? (projectile.perfect ? colors.perfect : colors.deflected) : (projectile.tint ?? (projectile.bomb ? colors.bomber : colors.enemyShot));
      const angle = Math.atan2(projectile.vy, projectile.vx);
      const radius = projectile.r;
      context.save(); context.translate(projectile.x, projectile.y);
      if (!lowGraphics) { context.shadowColor = color; context.shadowBlur = dark ? 12 : 7; }
      context.rotate(angle); context.fillStyle = color; context.strokeStyle = ink; context.lineWidth = projectile.charged ? 2.5 : 1.5;
      if (projectile.kind === "orb" || projectile.bomb) {
        const pulseRadius = projectile.bomb ? radius : radius * (1 + 0.12 * Math.sin(time / 120));
        context.beginPath(); context.arc(0, 0, pulseRadius, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0; context.stroke();
        if (projectile.kind === "orb") { context.strokeStyle = "#fff"; context.globalAlpha = 0.7; context.lineWidth = 1.5; context.beginPath(); context.arc(0, 0, pulseRadius * 0.5, 0, Math.PI * 2); context.stroke(); context.globalAlpha = 1; }
      } else {
        const radiusX = radius * (projectile.charged ? 1.8 : 1.5);
        const radiusY = radius * 0.92;
        context.beginPath(); context.moveTo(radiusX, 0);
        context.quadraticCurveTo(0, -radiusY, -radiusX * 0.7, -radiusY * 0.55);
        context.quadraticCurveTo(-radiusX * 0.9, 0, -radiusX * 0.7, radiusY * 0.55);
        context.quadraticCurveTo(0, radiusY, radiusX, 0);
        context.closePath(); context.fill(); context.shadowBlur = 0; context.stroke();
      }
      context.fillStyle = "#fff"; context.globalAlpha = 0.9;
      context.beginPath(); context.arc(0, 0, radius * 0.4, 0, Math.PI * 2); context.fill(); context.globalAlpha = 1;
      context.restore();

      if (projectile.sourceStolen && !projectile.deflected) {
        const pulse = 0.5 + 0.5 * Math.sin(time / 70 + projectile.x * 0.03);
        context.save(); context.translate(projectile.x, projectile.y); context.rotate(-angle * 0.35);
        context.strokeStyle = projectile.sourceStolen === "aldric" ? "#ff4d8d" : "#6ef2ff"; context.lineWidth = 2; context.globalAlpha = 0.5 + pulse * 0.3;
        context.setLineDash([5, 4]); context.beginPath(); context.ellipse(0, 0, radius * (1.7 + pulse * 0.25), radius * 1.05, 0.25, 0, Math.PI * 2); context.stroke(); context.setLineDash([]);
        context.fillStyle = "#ffffff"; context.globalAlpha = 0.8; context.fillRect(-radius * 1.5, -2, 4, 4); context.fillStyle = "#d65cff"; context.fillRect(radius * 1.2, -radius * 0.7, 3, 7); context.restore();
      }

      if (projectile.bomb) {
        context.fillStyle = ink;
        context.fillRect(projectile.x - 1.5, projectile.y - radius - 5, 3, 5);
      }
      if (projectile.deflected) {
        context.strokeStyle = color; context.lineWidth = 2;
        context.beginPath(); context.arc(projectile.x, projectile.y, radius + 5, 0, Math.PI * 2); context.stroke();
        if (projectile.perfect) { context.beginPath(); context.arc(projectile.x, projectile.y, radius + 9, 0, Math.PI * 2); context.stroke(); }
      }
    },
  };
}

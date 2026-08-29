import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { EnemyRendererRuntime } from "./enemy-renderer-runtime";
import type { RenderInstance } from "./enemy-renderer-types";

/** Installs the White Hart's non-humanoid, low pursuit silhouette. */
export function installWhiteHartRenderer(types: EnemyTypes, runtime: EnemyRendererRuntime): void {
  const { A11Y, CONFIG, GFX, clamp, lerp } = runtime;
  Object.assign(types.WhiteHart.prototype, {
    draw(this: RenderInstance<"WhiteHart">, ctx: CanvasRenderingContext2D) {
      const intro = this.introT > 0
        ? clamp(1 - this.introT / Math.max(CONFIG.bossTheater.introDur, 0.001), 0, 1)
        : 1;
      const direction = this.facing || -1;
      const shell = this.flash > 0 || A11Y.highContrast ? "#ffffff" : "#dceff1";
      const iceEdge = A11Y.highContrast ? "#000000" : "#4d839c";
      const aurora = A11Y.highContrast ? "#fff36b" : "#72dec1";
      const core = A11Y.highContrast ? "#ff5a3d" : "#ef9d69";
      const phase = Math.max(1, Math.min(3, this.phase || 1));
      const footY = this.y + this.hh;

      ctx.save();
      ctx.translate(this.x, footY);
      ctx.scale(direction * lerp(0.88, 1, intro), lerp(0.72, 1, intro));
      if (this.dying) ctx.rotate(-this.deathP * 0.32);
      ctx.translate(0, -this.hh);

      // Snow wake grounds the body without implying a live attack route.
      ctx.strokeStyle = aurora;
      ctx.globalAlpha = A11Y.highContrast ? 0.9 : 0.45;
      ctx.lineWidth = A11Y.highContrast ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(-this.hw * 0.95, this.hh * 0.78);
      ctx.lineTo(-this.hw * 1.35, this.hh * 0.9);
      ctx.lineTo(-this.hw * 1.62, this.hh * 0.82);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Long low torso and tapered neck/head establish a quadruped silhouette.
      ctx.fillStyle = shell;
      ctx.strokeStyle = iceEdge;
      ctx.lineWidth = A11Y.highContrast ? 5 : 3;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(-this.hw * 0.88, -this.hh * 0.22);
      ctx.lineTo(-this.hw * 0.56, -this.hh * 0.64);
      ctx.lineTo(this.hw * 0.38, -this.hh * 0.58);
      ctx.lineTo(this.hw * 0.7, -this.hh * 0.22);
      ctx.lineTo(this.hw * 0.54, this.hh * 0.34);
      ctx.lineTo(-this.hw * 0.68, this.hh * 0.38);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.hw * 0.34, -this.hh * 0.48);
      ctx.lineTo(this.hw * 0.68, -this.hh * 1.35);
      ctx.lineTo(this.hw * 0.96, -this.hh * 1.52);
      ctx.lineTo(this.hw * 1.18, -this.hh * 1.25);
      ctx.lineTo(this.hw * 0.78, -this.hh * 1.02);
      ctx.lineTo(this.hw * 0.66, -this.hh * 0.15);
      ctx.closePath(); ctx.fill(); ctx.stroke();

      // Four angular legs remain visibly separate from the torso collision body.
      ctx.lineCap = "square";
      ctx.lineWidth = A11Y.highContrast ? 9 : 7;
      for (const legX of [-this.hw * 0.62, -this.hw * 0.24, this.hw * 0.24, this.hw * 0.57]) {
        const knee = legX + (legX < 0 ? -8 : 8);
        ctx.beginPath();
        ctx.moveTo(legX, this.hh * 0.16);
        ctx.lineTo(knee, this.hh * 0.62);
        ctx.lineTo(legX + (legX < 0 ? 8 : 14), this.hh);
        ctx.stroke();
      }

      // Straight-line antlers are the dominant identity landmark.
      ctx.strokeStyle = aurora;
      ctx.lineWidth = A11Y.highContrast ? 6 : 4;
      for (const side of [-1, 1]) {
        const rootX = this.hw * (0.8 + side * 0.05);
        ctx.beginPath();
        ctx.moveTo(rootX, -this.hh * 1.42);
        ctx.lineTo(this.hw * (0.78 + side * 0.18), -this.hh * 2.0);
        ctx.lineTo(this.hw * (0.62 + side * 0.36), -this.hh * 2.34);
        ctx.moveTo(this.hw * (0.78 + side * 0.18), -this.hh * 2.0);
        ctx.lineTo(this.hw * (0.92 + side * 0.28), -this.hh * 2.24);
        ctx.moveTo(this.hw * (0.67 + side * 0.28), -this.hh * 2.2);
        ctx.lineTo(this.hw * (0.6 + side * 0.44), -this.hh * 2.52);
        ctx.stroke();
      }

      // The coral route-light becomes increasingly exposed as the shell cracks.
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(this.hw * 0.48, -this.hh * 0.5, 6 + phase * 2, 0, Math.PI * 2);
      ctx.fill();
      if (phase >= 2) {
        ctx.strokeStyle = core;
        ctx.lineWidth = A11Y.highContrast ? 4 : 2;
        ctx.beginPath();
        ctx.moveTo(this.hw * 0.46, -this.hh * 0.38);
        ctx.lineTo(this.hw * 0.25, -this.hh * 0.08);
        ctx.lineTo(this.hw * 0.4, this.hh * 0.22);
        if (phase === 3) {
          ctx.moveTo(-this.hw * 0.18, -this.hh * 0.56);
          ctx.lineTo(-this.hw * 0.34, -this.hh * 0.16);
          ctx.lineTo(-this.hw * 0.12, this.hh * 0.28);
        }
        ctx.stroke();
      }
      if (!GFX.low && !A11Y.reducedMotion) {
        ctx.strokeStyle = aurora;
        ctx.globalAlpha = 0.38;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.hw * 0.62, -this.hh * 1.65);
        ctx.quadraticCurveTo(0, -this.hh * (2.25 + phase * 0.1), -this.hw * 1.15, -this.hh * 1.25);
        ctx.stroke();
      }
      ctx.restore();
      this.drawHpBar(ctx);
    },
  });
}

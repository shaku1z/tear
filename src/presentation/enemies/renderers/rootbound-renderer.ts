import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { EnemyRendererRuntime } from "./enemy-renderer-runtime";
import type { RenderInstance } from "./enemy-renderer-types";

/** Rootbound's base silhouette. Authored attacks add their own readable geometry later. */
export function installRootboundRenderer(types: EnemyTypes, runtime: EnemyRendererRuntime): void {
  const { A11Y, CONFIG, GFX, THEME, clamp, lerp } = runtime;
  Object.assign(types.Rootbound.prototype, {
    draw(this: RenderInstance<"Rootbound">, ctx: CanvasRenderingContext2D) {
      const intro = this.introT > 0
        ? clamp(1 - this.introT / Math.max(CONFIG.bossTheater.introDur, 0.001), 0, 1)
        : 1;
      const footY = this.y + this.hh;
      const gold = "#d7b84c";
      const root = THEME.dark ? "#253627" : "#304b31";

      ctx.save();
      ctx.translate(this.x, footY);
      if (this.dying) ctx.rotate(this.facing * this.deathP * 0.4);

      // The root arm is present throughout windup; only the filled, thick pass is active.
      if (this.vineSweepStage) {
        const stage = this.vineSweepStage;
        const sweepFacing = this.vineSweepFacing;
        const reach = 360 * sweepFacing;
        const windupK = stage === "windup" ? clamp(1 - this.vineSweepT / 0.65, 0, 1) : 1;
        ctx.save();
        ctx.strokeStyle = A11Y.highContrast ? "#fff36b" : stage === "active" ? gold : "#7bbf72";
        ctx.globalAlpha = stage === "follow-through" ? 0.48 : 0.72 + windupK * 0.28;
        ctx.lineCap = "round";
        ctx.lineWidth = stage === "active" ? 28 : 12 + windupK * 7;
        if (stage === "windup") ctx.setLineDash([18, 10]);
        ctx.beginPath();
        ctx.moveTo(sweepFacing * this.hw * 0.58, -this.hh * 1.08);
        ctx.bezierCurveTo(
          sweepFacing * (this.hw + 72), -this.hh * (1.5 - windupK * 0.45),
          reach * 0.72, -35 - windupK * 30,
          reach, -18,
        );
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(reach, -18);
        ctx.lineTo(reach - sweepFacing * 34, -42);
        ctx.lineTo(reach - sweepFacing * 28, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Intro pose: the keeper rises out of the throne while the mantle opens.
      ctx.scale(lerp(0.9, 1, intro), lerp(0.72, 1, intro));
      ctx.translate(0, -this.hh * 2);

      ctx.strokeStyle = root;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 13;
      for (const side of [-1, 1]) {
        const open = lerp(0.55, 1, intro);
        ctx.beginPath();
        ctx.moveTo(side * 20, this.hh * 1.65);
        ctx.lineTo(side * 56, this.hh * 1.22);
        ctx.lineTo(side * 72, this.hh * 0.55);
        ctx.lineTo(side * (76 + 26 * open), -this.hh * 0.22);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(side * 54, this.hh * 1.3);
        ctx.lineTo(side * 96, this.hh * 1.72);
        ctx.lineTo(side * 132, this.hh * 1.86);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(side * 70, this.hh * 0.64);
        ctx.lineTo(side * (100 + 20 * open), this.hh * 0.18);
        ctx.lineTo(side * (116 + 35 * open), -this.hh * 0.52);
        ctx.stroke();
      }

      // Root-throne and partially absorbed humanoid keeper.
      ctx.fillStyle = root;
      ctx.beginPath();
      ctx.moveTo(-this.hw * 1.15, this.hh * 1.9);
      ctx.lineTo(-this.hw * 0.78, this.hh * 0.45);
      ctx.lineTo(0, this.hh * 0.18);
      ctx.lineTo(this.hw * 0.78, this.hh * 0.45);
      ctx.lineTo(this.hw * 1.15, this.hh * 1.9);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = THEME.ink; ctx.lineWidth = 4; ctx.stroke();

      ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
      ctx.fillRect(-this.hw * 0.48, this.hh * 0.12, this.hw * 0.96, this.hh * 1.24);
      ctx.strokeStyle = THEME.ink; ctx.lineWidth = 4;
      ctx.strokeRect(-this.hw * 0.48, this.hh * 0.12, this.hw * 0.96, this.hh * 1.24);
      ctx.beginPath(); ctx.arc(0, -this.hh * 0.08, this.hw * 0.34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // Long dormant limbs make the authored reach legible without implying an active tell.
      ctx.strokeStyle = this.flash > 0 ? "#fff" : this.color; ctx.lineWidth = 15;
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(side * this.hw * 0.38, this.hh * 0.38);
        ctx.lineTo(side * this.hw * 0.82, this.hh * 0.8);
        ctx.lineTo(side * this.hw * 1.22, this.hh * 1.42); ctx.stroke();
      }

      // A plural mask-ring surrounds the keeper's face; gold nodes expose the graft seams.
      ctx.fillStyle = THEME.ink;
      for (const x of [-32, 0, 32]) {
        ctx.beginPath(); ctx.arc(x, -this.hh * 0.12 - Math.abs(x) * 0.18, 10, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = gold;
      for (const [x, y, radius] of [[-24, 22, 5], [24, 22, 5], [-37, 68, 4], [37, 68, 4], [0, 88, 6]] as const) {
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      }
      if (!GFX.low) {
        ctx.strokeStyle = gold; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 54, 46 + Math.sin(intro * Math.PI) * 4, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      this.drawHpBar(ctx);
    },
  });
}

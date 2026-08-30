import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { EnemyRendererRuntime } from "./enemy-renderer-runtime";
import type { RenderInstance } from "./enemy-renderer-types";

/** Installs the canonical low quadruped silhouette and pounce telegraph. */
export function installRimehoundRenderer(types: EnemyTypes, runtime: EnemyRendererRuntime): void {
  const { A11Y, THEME, clamp } = runtime;
  Object.assign(types.Rimehound.prototype, {
    draw(this: RenderInstance<"Rimehound">, ctx: CanvasRenderingContext2D) {
      const direction = Math.sign(this.vx) || this.atkDir || 1;
      const windup = this.atk === "windup"
        ? 1 - clamp(this.atkT / (this.atkMax || 1), 0, 1) : 0;
      if (this.atk === "windup") {
        const routeY = this.y - 5;
        ctx.strokeStyle = A11Y.highContrast ? "#fff36b" : "#3f718d";
        ctx.fillStyle = ctx.strokeStyle;
        ctx.globalAlpha = A11Y.highContrast ? 0.2 : 0.12 + windup * 0.08;
        ctx.fillRect(Math.min(this.x, this.pounceTargetX), routeY - 6,
          Math.abs(this.pounceTargetX - this.x), 12);
        ctx.globalAlpha = A11Y.highContrast ? 0.95 : 0.65 + windup * 0.3;
        ctx.lineWidth = (A11Y.highContrast ? 4 : 3) + windup * 2;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.moveTo(this.x + direction * this.hw * 0.72, routeY);
        ctx.lineTo(this.pounceTargetX, routeY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(this.pounceTargetX, routeY);
        ctx.lineTo(this.pounceTargetX - direction * 16, routeY - 9);
        ctx.lineTo(this.pounceTargetX - direction * 16, routeY + 9);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(direction, 1);
      const crouch = this.atk === "windup" ? 4 * windup : 0;
      ctx.fillStyle = this.flash > 0 || A11Y.highContrast ? "#fff" : this.color;
      ctx.strokeStyle = A11Y.highContrast ? "#000" : THEME.ink;
      ctx.lineWidth = A11Y.highContrast ? 4 : 2.5;
      ctx.beginPath();
      ctx.ellipse(-4, crouch, this.hw * 0.72, this.hh * 0.62, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.hw * 0.35, -this.hh * 0.25 + crouch);
      ctx.lineTo(this.hw * 0.95, -this.hh * 0.08 + crouch);
      ctx.lineTo(this.hw * 0.72, this.hh * 0.42 + crouch);
      ctx.lineTo(this.hw * 0.25, this.hh * 0.28 + crouch);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = THEME.ink;
      ctx.beginPath();
      ctx.moveTo(this.hw * 0.42, -this.hh * 0.35 + crouch);
      ctx.lineTo(this.hw * 0.62, -this.hh * 0.95 + crouch);
      ctx.lineTo(this.hw * 0.75, -this.hh * 0.25 + crouch);
      ctx.fill();
      for (const legX of [-this.hw * 0.38, this.hw * 0.28]) {
        const stride = this.atk === "pounce" && !A11Y.reducedMotion ? (legX < 0 ? -8 : 10) : 0;
        ctx.fillRect(legX + stride - 3, this.hh * 0.3 + crouch, 7, this.hh * 0.7 - crouch);
      }
      ctx.fillStyle = A11Y.highContrast ? "#000" : "#eefcff";
      ctx.fillRect(this.hw * 0.66, -this.hh * 0.12 + crouch, 5, 4);
      ctx.restore();
      this.drawHpBar(ctx);
    },
  });
}

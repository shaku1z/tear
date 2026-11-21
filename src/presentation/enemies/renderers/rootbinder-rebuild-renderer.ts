import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { EnemyRendererRuntime } from "./enemy-renderer-runtime";
import type { RenderInstance } from "./enemy-renderer-types";

type Binder = RenderInstance<"RootbinderRebuild">;

/** How far it kneels in each state: 0 standing, 1 planted. */
function kneelOf(binder: Binder, k: number): number {
  if (binder.state === "plantwind") return k;
  if (binder.state === "uprootwind") return 1 - k;
  return binder.state === "planted" || binder.state === "rootwind" || binder.state === "rootrecover" ? 1 : 0;
}

/**
 * The new Rootbinder (plans/active/VERDANT_PALE_REBUILD.md, 2.2): a kneeling body with a stem on its back. The
 * body is the tell and it draws no marks: the stem rises as it plants and flicks back in a Root Run's windup, and
 * the bulge at its feet is part of the body.
 */
export function installRootbinderRebuildRenderer(types: EnemyTypes, runtime: EnemyRendererRuntime): void {
  const { A11Y, THEME, clamp } = runtime;
  Object.assign(types.RootbinderRebuild.prototype, {
    draw(this: Binder, ctx: CanvasRenderingContext2D) {
      const k = 1 - clamp(this.stateT / this.stateLen, 0, 1);
      const kneel = kneelOf(this, k);
      const dir = this.atkDir || 1;
      const ink = A11Y.highContrast ? "#000" : THEME.ink;
      const foot = this.y + this.hh;
      const top = this.y - this.hh + kneel * this.hh * 0.35;
      ctx.save();
      ctx.lineWidth = A11Y.highContrast ? 4 : 2.5;
      ctx.strokeStyle = ink;
      // The stem on its back: it rises as it kneels and flicks back through a Root Run's windup.
      const flick = this.state === "rootwind" && !A11Y.reducedMotion ? -dir * 16 * k : 0;
      const stemTop = top - 14 - 26 * kneel;
      ctx.strokeStyle = A11Y.highContrast ? "#000" : this.color;
      ctx.lineWidth = A11Y.highContrast ? 5 : 4;
      ctx.beginPath();
      ctx.moveTo(this.x - dir * this.hw * 0.3, top + 6);
      ctx.quadraticCurveTo(this.x - dir * this.hw * 0.6, stemTop + 12, this.x - dir * this.hw * 0.2 + flick, stemTop);
      ctx.stroke();
      // The bulge at its feet in a Root Run's windup, on the side the root will run.
      if (this.state === "rootwind") {
        ctx.fillStyle = this.color;
        ctx.strokeStyle = ink;
        ctx.lineWidth = A11Y.highContrast ? 4 : 2;
        ctx.beginPath();
        ctx.ellipse(this.x + dir * this.hw * 1.1, foot - 3, 6 + 8 * k, 3 + 5 * k, 0, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
      }
      // The body, lower as it kneels.
      ctx.fillStyle = this.flash > 0 || A11Y.highContrast ? "#fff" : this.color;
      ctx.strokeStyle = ink;
      ctx.lineWidth = A11Y.highContrast ? 4 : 2.5;
      ctx.beginPath();
      ctx.roundRect(this.x - this.hw, top, this.hw * 2, foot - top, 9);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = A11Y.highContrast ? "#000" : THEME.ink;
      ctx.fillRect(this.x + dir * this.hw * 0.35 - 3, top + 10, 6, 5);
      ctx.restore();
      this.drawHpBar(ctx);
    },
  });
}

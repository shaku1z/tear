import type { UiDependencies, UiRuntime } from "./ui-contracts";
import { truthyOr } from "./value-fallback";

export function createUiMenu(dependencies: UiDependencies) {
  const { CONFIG, OVERSCAN } = dependencies;
  return {
wordmark(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, time: number, reducedMotion?: boolean) {
            this.text(ctx, "T E A R", x, y, this.t.type.wordmark, "left");
            if (reducedMotion) return;
            const cycle = (time % 4.2) / 0.5;
            if (cycle >= 1) return;
            const slashX = x + cycle * 380;
            const amount = Math.sin(cycle * Math.PI);
            ctx.save();
            ctx.globalAlpha = 0.85 * amount;
            ctx.strokeStyle = this.t.color.accent;
            ctx.lineWidth = 4;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(slashX - 26, y + 10);
            ctx.lineTo(slashX + 26, y - 52);
            ctx.stroke();
            ctx.restore();
        },
menuBackdrop(this: UiRuntime, ctx: CanvasRenderingContext2D, time: number) {
            ctx.save();
            const vw = CONFIG.view.w, vh = CONFIG.view.h;
            const ox = (typeof OVERSCAN !== "undefined") ? OVERSCAN.x : 0;
            const oy = (typeof OVERSCAN !== "undefined") ? OVERSCAN.y : 0;
            const span = Math.round((vw + ox * 2) * 1.5), n = 6;
            for (let i = 0; i < n; i++) {
                const drift = (i * (span / n) + time * (16 + i * 5)) % span - 400 - ox;
                const accent = i % 3 === 0;
                ctx.globalAlpha = accent ? 0.05 : 0.035;
                ctx.strokeStyle = accent ? this.t.color.accent : this.ink;
                ctx.lineWidth = accent ? 2 : 1;
                ctx.beginPath();
                ctx.moveTo(drift, -oy - 60);
                ctx.lineTo(drift - 620, vh + oy + 80);
                ctx.stroke();
            }
            // soft edge vignette to focus the eye centre
            const g = ctx.createRadialGradient(vw / 2, vh * 0.52, vh * 0.31, vw / 2, vh * 0.52, vw * 0.55);
            g.addColorStop(0, "rgba(0,0,0,0)");
            g.addColorStop(1, "rgba(0,0,0,0.05)");
            ctx.globalAlpha = 1;
            ctx.fillStyle = g;
            ctx.fillRect(-ox, -oy, vw + ox * 2, vh + oy * 2);
            ctx.restore();
        },
        // a standard screen header: centred title + an accent underline that sweeps out
        // on entry + optional muted subtitle. Returns the y to start content below it,
        // so every sub-screen lines up identically. `anim` 0..1 drives the sweep.
        // `hue` = the screen's signature colour (defaults to accent cyan).
        header(this: UiRuntime, ctx: CanvasRenderingContext2D, title: string, subtitle?: string, anim?: number, hue?: string) {
            const cx = CONFIG.view.w / 2;
            const a = anim ?? 1;
            this.title(ctx, title, cx, 92, this.t.type.h1);
            const w = 130 * a;
            ctx.globalAlpha = a;
            ctx.fillStyle = truthyOr(hue, () => this.t.color.accent);
            ctx.fillRect(cx - w / 2, 108, w, 3);
            ctx.globalAlpha = 1;
            if (subtitle)
                this.text(ctx, subtitle, cx, 134, this.t.type.caption, "center", this.t.alpha.muted);
            return subtitle ? 188 : 170;
        },
        // a small accent pointer (focus/hover cue). `a` 0..1 slides + fades it in.
        caret(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, a: number, color?: string) {
            const s = 7, ox = x - (1 - a) * 10;
            ctx.globalAlpha = 0.45 + a * 0.55;
            ctx.fillStyle = truthyOr(color, () => this.t.color.accent);
            ctx.beginPath();
            ctx.moveTo(ox, y - s);
            ctx.lineTo(ox + s, y);
            ctx.lineTo(ox, y + s);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        },
        cursor(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number) {
            ctx.strokeStyle = this.ink;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 14, y + 4);
            ctx.lineTo(x + 5, y + 6);
            ctx.lineTo(x + 8, y + 15);
            ctx.lineTo(x + 4, y + 16);
            ctx.lineTo(x + 1, y + 7);
            ctx.closePath();
            ctx.fillStyle = this.ink;
            ctx.fill();
            ctx.stroke();
        },
  };
}

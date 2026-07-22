import type { ChapterLayout, UiDependencies, UiOptions, UiRuntime } from "./ui-contracts";
import { truthyOr } from "./value-fallback";

export function createUiChapter(dependencies: UiDependencies) {
  const { CONFIG, OVERSCAN, clamp } = dependencies;
  return {
_chapterLayout(this: UiRuntime, o: UiOptions): ChapterLayout {
            const t = this.t, vw = CONFIG.view.w, vh = CONFIG.view.h;
            const scale = clamp(vh / 900, 0.78, 1.4);
            const SM = Math.max(t.chapter.safeMargin, vw * t.chapter.safeVW);
            const colW = Math.min(t.chapter.bodyColW * scale, vw - SM * 2);
            const side = o.composition === "right" ? "right" : "left";
            const x = side === "right" ? vw - SM - colW : SM; // left edge of the text column
            const anchorX = side === "right" ? x + colW : x; // the text's alignment edge
            return { scale, SM, colW, side, x, anchorX, vw, vh,
                align: side === "right" ? "right" : "left",
                labelSize: Math.round(15 * scale), titleSize: Math.round(60 * scale), loreSize: Math.round(19 * scale),
                topY: vh * 0.30, loreY: vh * 0.52 };
        },
        _bladeMark(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string, dir: number) {
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 * scale;
            ctx.lineCap = "round";
            const len = 30 * scale;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + dir * len, y - len * 0.36);
            ctx.stroke(); // the blade
            ctx.beginPath();
            ctx.moveTo(x + dir * 7 * scale, y - 4 * scale);
            ctx.lineTo(x + dir * 7 * scale, y + 6 * scale);
            ctx.stroke(); // guard
            ctx.restore();
        },
        // chapter label + condensed display title over the ink-wash. `morphTo`/`morphK`
        // crossfade the title into the biome name in place (used by biomeReveal).
        chapterHeader(this: UiRuntime, ctx: CanvasRenderingContext2D, o?: UiOptions) {
            o = truthyOr<UiOptions>(o, () => ({}));
            const t = this.t, L = this._chapterLayout(o);
            const k = clamp(o.amount ?? 1, 0, 1), color = truthyOr(o.color, () => t.color.accent);
            const ink = this.chapterWash(ctx, L.side, truthyOr(o.wash, () => "dark"), k);
            ctx.save();
            ctx.globalAlpha = k;
            ctx.textBaseline = "alphabetic";
            ctx.fillStyle = color;
            ctx.font = this.bodyFont(L.labelSize, t.font.bodyMediumWeight);
            this.trackedText(ctx, truthyOr(o.label, () => ""), L.anchorX, L.topY, t.track.label, L.align);
            const titleY = L.topY + t.chapter.titleGap + L.titleSize * 0.5;
            ctx.font = this.displayFont(L.titleSize);
            ctx.textAlign = L.align;
            const mk = clamp(Number(o.morphK) || 0, 0, 1);
            if (o.morphTo && mk > 0) {
                ctx.globalAlpha = k * (1 - mk);
                ctx.fillStyle = ink;
                ctx.fillText(truthyOr(o.title, () => ""), L.anchorX, titleY);
                ctx.globalAlpha = k * mk;
                ctx.fillText(o.morphTo, L.anchorX, titleY);
                ctx.globalAlpha = k;
            }
            else {
                ctx.fillStyle = ink;
                ctx.fillText(truthyOr(o.title, () => ""), L.anchorX, titleY);
            }
            const ruleW = (o.ruleW ?? Math.min(L.colW * 0.42, 240 * L.scale));
            ctx.fillStyle = color;
            ctx.fillRect(L.side === "right" ? L.anchorX - ruleW : L.anchorX, titleY + t.space.sm, ruleW, 2 * L.scale);
            ctx.restore();
        },
        // one lore fragment as a mono column with phrase/line reveal (never per-char).
        loreFragment(this: UiRuntime, ctx: CanvasRenderingContext2D, o?: UiOptions) {
            o = truthyOr<UiOptions>(o, () => ({}));
            const t = this.t, L = this._chapterLayout(o);
            const k = clamp(o.amount ?? 1, 0, 1), reveal = clamp(Number(o.reveal) || 0, 0, 1);
            const ink = (o.wash === "light") ? "#12131a" : "#f1eff9";
            ctx.save();
            ctx.globalAlpha = k;
            ctx.fillStyle = ink;
            ctx.font = this.bodyFont(L.loreSize);
            ctx.textAlign = L.align;
            ctx.textBaseline = "alphabetic";
            const words = truthyOr(o.text, () => "").split(/\s+/).filter(Boolean);
            const shown = words.slice(0, Math.ceil(words.length * reveal));
            const lineH = L.loreSize * t.lineH.body;
            let line = "", yy = L.loreY;
            const advance = (s: string) => ctx.measureText(s).width + t.track.body * s.length;
            for (const w of shown) {
                const next = line ? line + " " + w : w;
                if (line && advance(next) > L.colW) {
                    this.trackedText(ctx, line, L.anchorX, yy, t.track.body, L.align);
                    yy += lineH;
                    line = w;
                }
                else
                    line = next;
            }
            if (line)
                this.trackedText(ctx, line, L.anchorX, yy, t.track.body, L.align);
            ctx.restore();
        },
        // small fracture ticks: a discreet "which page" marker, never an animated bar.
        chapterProgress(this: UiRuntime, ctx: CanvasRenderingContext2D, o?: UiOptions) {
            o = truthyOr<UiOptions>(o, () => ({}));
            const t = this.t, L = this._chapterLayout(o);
            const k = clamp(o.amount ?? 1, 0, 1), color = truthyOr(o.color, () => t.color.accent);
            const count = Math.max(1, truthyOr(o.count, () => 1)), idx = clamp(truthyOr(o.index, () => 0), 0, count - 1);
            const y = L.loreY - t.chapter.progressGap * L.scale, gap = 14 * L.scale, tickH = 2 * L.scale;
            ctx.save();
            ctx.textBaseline = "alphabetic";
            for (let i = 0; i < count; i++) {
                const w = (i === idx ? 16 : 7) * L.scale;
                const cx = L.side === "right" ? L.anchorX - (count - 1 - i) * gap - w : L.anchorX + i * gap;
                ctx.globalAlpha = k * (i === idx ? 1 : t.alpha.faint);
                ctx.fillStyle = color;
                ctx.fillRect(cx, y, w, tickH);
            }
            ctx.restore();
        },
        chapterPrompt(this: UiRuntime, ctx: CanvasRenderingContext2D, o?: UiOptions) {
            o = truthyOr<UiOptions>(o, () => ({}));
            if (!o.text)
                return;
            const t = this.t, L = this._chapterLayout(o);
            const k = clamp(o.amount ?? 1, 0, 1), color = truthyOr(o.color, () => t.color.accent);
            ctx.save();
            ctx.globalAlpha = k * t.alpha.cinemaHint;
            ctx.fillStyle = color;
            ctx.font = this.bodyFont(Math.round(12 * L.scale), t.font.bodyMediumWeight);
            ctx.textBaseline = "alphabetic";
            const y = L.vh - Math.max(t.chapter.safeMargin, L.vh * 0.06);
            this.trackedText(ctx, o.text, L.anchorX, y, t.track.body, L.align);
            ctx.restore();
        },
        // The biome reveal is the same composition breathing open: the wash retreats as
        // the world reaches full color, the title morphs to the biome name, the rule
        // contracts into the name underline, and READY is a small blade mark.
        biomeReveal(this: UiRuntime, ctx: CanvasRenderingContext2D, o?: UiOptions) {
            o = truthyOr<UiOptions>(o, () => ({}));
            const t = this.t, L = this._chapterLayout(o);
            const k = clamp(Number(o.amount) || 0, 0, 1), color = truthyOr(o.color, () => t.color.accent);
            const washK = (1 - k) * 0.9 + (o.ready ? 0 : 0.06); // wash fades out as color returns
            const ink = this.chapterWash(ctx, L.side, truthyOr(o.wash, () => "dark"), washK);
            ctx.save();
            ctx.textBaseline = "alphabetic";
            ctx.globalAlpha = 1;
            ctx.fillStyle = color;
            ctx.font = this.bodyFont(L.labelSize, t.font.bodyMediumWeight);
            this.trackedText(ctx, `CHAPTER ${String(truthyOr(o.number, () => ""))}`, L.anchorX, L.topY, t.track.label, L.align);
            const titleY = L.topY + t.chapter.titleGap + L.titleSize * 0.5;
            ctx.fillStyle = ink;
            ctx.font = this.displayFont(L.titleSize);
            ctx.textAlign = L.align;
            ctx.fillText(truthyOr(o.name, () => ""), L.anchorX, titleY);
            const ruleW = Math.min(L.colW * 0.42, 240 * L.scale) * (1 - 0.42 * k);
            ctx.fillStyle = color;
            ctx.fillRect(L.side === "right" ? L.anchorX - ruleW : L.anchorX, titleY + t.space.sm, ruleW, 2 * L.scale);
            if (o.line) {
                ctx.globalAlpha = 0.82 * (1 - k * 0.4);
                ctx.fillStyle = ink;
                ctx.font = this.bodyFont(Math.round(15 * L.scale));
                this.trackedText(ctx, o.line, L.anchorX, titleY + t.chapter.loreGap, t.track.body, L.align);
                ctx.globalAlpha = 1;
            }
            if (o.ready)
                this._bladeMark(ctx, L.anchorX, titleY + t.chapter.loreGap * 1.9, L.scale, color, L.side === "right" ? -1 : 1);
            ctx.restore();
        },
        cinematicPrompt(this: UiRuntime, ctx: CanvasRenderingContext2D, opts?: UiOptions) {
            const o = truthyOr<UiOptions>(opts, () => ({})), t = this.t, k = o.amount ?? 1;
            if (!o.text)
                return;
            ctx.save();
            ctx.fillStyle = truthyOr(o.color, () => t.color.cinemaMuted);
            ctx.globalAlpha = k * t.alpha.cinemaHint;
            ctx.font = this.font(t.type.micro, true);
            ctx.textBaseline = "middle";
            ctx.textAlign = truthyOr(o.align, () => "center");
            const x = o.x ?? CONFIG.view.w / 2, y = o.y ?? CONFIG.view.h - t.metric.cinematicPromptBottom;
            ctx.fillText(o.text, x, y);
            ctx.restore();
        },
        // The reward is deliberately its own celebration, after the world and lore
        // have resolved. Callers provide copy and values; this component owns all
        // screen-space geometry, type, color and hierarchy.
        finalReward(this: UiRuntime, ctx: CanvasRenderingContext2D, opts?: UiOptions) {
            const o = truthyOr<UiOptions>(opts, () => ({})), t = this.t, m = t.metric, a = t.alpha, vw = CONFIG.view.w, vh = CONFIG.view.h;
            const k0 = Math.max(0, Math.min(Number(o.amount) || 0, 1)), k = 1 - (1 - k0) * (1 - k0);
            const w = Math.min(m.finalRewardW, vw - t.space.xl * 2), h = Math.min(m.finalRewardH, vh - t.space.xl * 2);
            const x = (vw - w) / 2, y = (vh - h) / 2 + (1 - k) * t.space.lg, color = truthyOr(o.color, () => t.color.accent);
            const savedInk = this.ink;
            ctx.save();
            ctx.globalAlpha = k * a.finalRewardDim;
            ctx.fillStyle = t.color.cinema;
            ctx.fillRect(0, 0, vw, vh);
            ctx.globalAlpha = k * a.finalRewardPanel;
            ctx.fillStyle = t.color.cinema;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = k;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
            this.ink = t.color.cinemaInk;
            ctx.globalAlpha = k * a.finalRewardGhost;
            ctx.strokeStyle = color;
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(vw / 2, y + 94, m.finalRewardSigilR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = k;
            this.title(ctx, truthyOr(o.sigil, () => "◇"), vw / 2, y + 108, t.type.display);
            this.tag(ctx, truthyOr(o.label, () => "ADVENTURE COMPLETE"), vw / 2, y + 160, color, "center", t.type.caption);
            this.title(ctx, truthyOr(o.title, () => "THE WORLD REMEMBERS"), vw / 2, y + 210, t.type.h2);
            ctx.fillStyle = color;
            ctx.fillRect(vw / 2 - m.finalRewardRuleW / 2, y + 230, m.finalRewardRuleW, 3);
            this.text(ctx, truthyOr(o.reward, () => "RESTORED BLADE TRAIL"), vw / 2, y + 278, t.type.lead, "center", k * a.soft);
            if (o.detail)
                this.text(ctx, o.detail, vw / 2, y + 312, t.type.caption, "center", k * a.cinemaHint);
            this.cinematicPrompt(ctx, { text: o.hint ?? "", x: vw / 2, y: y + h - m.finalRewardPromptBottom,
                align: "center", amount: k, color });
            this.ink = savedInk;
            ctx.restore();
        },
        finaleFracture(this: UiRuntime, ctx: CanvasRenderingContext2D, opts?: UiOptions) {
            const o = truthyOr<UiOptions>(opts, () => ({})), t = this.t, m = t.metric, vw = CONFIG.view.w;
            const k = Math.max(0, Math.min(Number(o.amount) || 0, 1)), w = Math.min(m.finalFractureW, vw - t.space.xl * 2);
            const x = (vw - w) / 2, y = t.space.lg + 18, color = truthyOr(o.color, () => t.color.accent);
            ctx.save();
            ctx.globalAlpha = (1 - k) * t.alpha.soft;
            ctx.fillStyle = t.color.cinemaMuted;
            ctx.fillRect(x, y, w, m.finalFractureH);
            ctx.globalAlpha = 0.9 * (1 - k * 0.7);
            ctx.fillStyle = color;
            for (let i = 0; i < 9; i++) {
                const sw = w / 9 - t.space.xs, dx = (i - 4) * k * t.space.lg, dy = (i % 2 ? -1 : 1) * k * t.space.md;
                ctx.save();
                ctx.translate(dx, dy);
                ctx.rotate((i - 4) * k * 0.018);
                ctx.fillRect(x + i * w / 9, y, sw, m.finalFractureH);
                ctx.restore();
            }
            ctx.restore();
        },
        // right-anchored row of `n` small squares, `filled` of them coloured (level meters)
        pips(this: UiRuntime, ctx: CanvasRenderingContext2D, xRight: number, y: number, n: number, filled: number, color?: string) {
            const s = 9, g = 5;
            for (let i = 0; i < n; i++) {
                const px = xRight - (n - i) * (s + g) + g;
                if (i < filled) {
                    ctx.fillStyle = truthyOr(color, () => this.t.color.accent);
                    ctx.fillRect(px, y - s / 2, s, s);
                }
                else {
                    ctx.strokeStyle = this.t.color.disabled;
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(px, y - s / 2, s, s);
                }
            }
        },
        // ---- OVERLAY ------------------------------------------------------------
        // dim the frozen world behind an overlay (fades to PAPER, so overlay text is
        // always inked black regardless of the biome underneath)
        dim(this: UiRuntime, ctx: CanvasRenderingContext2D, w: number, h: number, a?: number) {
            const ox = (typeof OVERSCAN !== "undefined") ? OVERSCAN.x : 0;
            const oy = (typeof OVERSCAN !== "undefined") ? OVERSCAN.y : 0;
            ctx.globalAlpha = a ?? 0.78;
            ctx.fillStyle = this.t.color.paper;
            ctx.fillRect(-ox, -oy, w + ox * 2, h + oy * 2); // reach the true screen edges in fullscreen
            ctx.globalAlpha = 1;
        },
        // scroll affordance ("▲ scroll ▼") for long lists
        scrollHint(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, canUp: boolean, canDown: boolean) {
            this.text(ctx, (canUp ? "▲ " : "") + "scroll" + (canDown ? " ▼" : ""), x, y, this.t.type.caption, "center", this.t.alpha.faint);
        },
        // ---- MENU AMBIENCE + STRUCTURE -----------------------------------------
        // a faint, slowly drifting "tear-slash" backdrop drawn behind every menu screen.
        // Monochrome with occasional accent so it reads as motion, never as clutter.
  };
}

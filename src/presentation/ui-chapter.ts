import type { ChapterLayout, UiDependencies, UiOptions, UiRuntime } from "./ui-contracts";
import { truthyOr } from "./value-fallback";
import { darkenToContrast, inkIsLight, lightenToContrast } from "./ui-color";
import { layoutChapterPage, type ChapterMeasure, type ChapterTextRole, type ChapterTypeSizes } from "./chapter-layout";
import { cssToLogical, INTERFACE_ACCESSIBILITY } from "../domain/interface-accessibility";

// Tracking (px) per chapter text role; the title is set solid.
const CHAPTER_TRACK: Readonly<Record<ChapterTextRole, number>> = { label: 3.2, title: 0, caption: 2.4, body: 0.2, line: 1.2, prompt: 1.6 };
const CHAPTER_DARK_INK = "#12131a";

export function createUiChapter(dependencies: UiDependencies) {
  const { clamp, presentation: { overscan, view } } = dependencies;
  const ease = (value: number) => {
    const k = clamp(value, 0, 1);
    return k * k * (3 - 2 * k);
  };
  return {
        // Chapter type roles at the live density: desktop keeps the authored sizes; touch
        // raises every role to the physical touch-text floor so a phone can read the lore.
        _chapterSizes(this: UiRuntime): ChapterTypeSizes {
            const ct = this.t.chapterType;
            const floor = this.density.touch ? cssToLogical(INTERFACE_ACCESSIBILITY.minTouchTextCssPx, this.density.cssPerLogicalPixel) : 0;
            return { ...ct, label: Math.max(ct.label, floor), caption: Math.max(ct.caption, floor),
                body: Math.max(ct.body, floor + 2), bodyFloor: Math.max(ct.bodyFloor, floor + 1), line: Math.max(ct.line, floor + 1),
                prompt: Math.max(ct.prompt, floor), title: Math.max(ct.title, floor * 2), titleFloor: Math.max(ct.titleFloor, floor * 1.6) };
        },
        _chapterFont(this: UiRuntime, role: ChapterTextRole, size: number): string {
            if (role === "title")
                return this.displayFont(size);
            const medium = role === "label" || role === "prompt";
            return this.bodyFont(size, medium ? this.t.font.bodyMediumWeight : undefined);
        },
        _chapterMeasure(this: UiRuntime, ctx: CanvasRenderingContext2D): ChapterMeasure {
            return (text, role, size) => {
                ctx.font = this._chapterFont(role, size);
                return ctx.measureText(text).width + CHAPTER_TRACK[role] * Math.max(0, text.length - 1);
            };
        },
        // The shared composition (chapter-layout.ts) for one page, reveal or epilogue.
        _chapterLayout(this: UiRuntime, o: UiOptions, ctx?: CanvasRenderingContext2D): ChapterLayout {
            const sizes = this._chapterSizes();
            const measure: ChapterMeasure = ctx ? this._chapterMeasure(ctx) : (text, role, size) => text.length * size * (role === "title" ? 0.45 : 0.6);
            const page = layoutChapterPage({ vw: view.w, side: truthyOr(o.composition, () => "left"), sizes,
                title: truthyOr(o.title, () => ""), caption: o.caption, text: o.text, line: o.line }, this.t.chapter, measure);
            return { ...page, vw: view.w, vh: view.h, sizes };
        },
        _chapterText(this: UiRuntime, ctx: CanvasRenderingContext2D, text: string, role: ChapterTextRole, size: number,
            x: number, y: number, align: CanvasTextAlign) {
            ctx.font = this._chapterFont(role, size);
            if (role === "title") {
                ctx.textAlign = align;
                ctx.fillText(text, x, y);
                return;
            }
            this.trackedText(ctx, text, x, y, CHAPTER_TRACK[role], align === "right" ? "right" : "left");
        },
        // Ink and accent for the chapter text: the biome ink on its own sky (dark on the
        // light stages, light on the Tear) and the stage accent lifted to 4.5:1 against it.
        _chapterTone(this: UiRuntime, o: UiOptions): Readonly<{ ink: string; accent: string }> {
            const t = this.t, color = truthyOr(o.color, () => t.color.accent);
            if (o.sky !== undefined && inkIsLight(o.sky))
                return { ink: t.chapter.skyInk, accent: darkenToContrast(color, o.sky, 4.5) };
            return { ink: t.color.cinemaInk, accent: lightenToContrast(color, truthyOr(o.sky, () => t.color.rail), 4.5) };
        },
        // Header: the sky haze (or the epilogue's dark fade), the chapter numeral (with page ticks beside it), the
        // condensed title and its short accent rule. `morphTo`/`morphK` crossfade the
        // title into the biome name in place. Returns the layout it drew.
        chapterHeader(this: UiRuntime, ctx: CanvasRenderingContext2D, o?: UiOptions) {
            o = truthyOr<UiOptions>(o, () => ({}));
            const t = this.t, L = this._chapterLayout(o, ctx);
            const k = clamp(o.amount ?? 1, 0, 1), fadeK = clamp(o.fade ?? k, 0, 1);
            this.chapterWash(ctx, L.side, fadeK, Math.max(L.reach, Number(o.reach) || 0), o.sky);
            const { ink, accent } = this._chapterTone(o);
            ctx.save();
            ctx.textBaseline = "alphabetic";
            ctx.globalAlpha = k;
            ctx.fillStyle = accent;
            const labelW = this._chapterMeasure(ctx)(truthyOr(o.label, () => ""), "label", L.sizes.label);
            this._chapterText(ctx, truthyOr(o.label, () => ""), "label", L.sizes.label, L.anchorX, L.labelY, L.align);
            this._chapterTicks(ctx, L, labelW, accent, Number(o.count) || 0, o.index ?? -1, k);
            const mk = clamp(Number(o.morphK) || 0, 0, 1);
            ctx.fillStyle = ink;
            ctx.globalAlpha = k * (o.morphTo ? 1 - ease(mk * 1.6) : 1);
            L.titleLines.forEach((line, index) => {
                this._chapterText(ctx, line, "title", L.titleSize, L.anchorX, L.titleY[index] ?? L.labelY, L.align);
            });
            if (o.morphTo) {
                ctx.globalAlpha = k * ease((mk - 0.3) / 0.5);
                this._chapterText(ctx, o.morphTo, "title", L.titleSize, L.anchorX, L.titleY[0] ?? L.labelY, L.align);
            }
            ctx.globalAlpha = k;
            ctx.fillStyle = accent;
            const ruleW = t.chapter.ruleW * (o.ruleW ?? 1);
            ctx.fillRect(L.side === "right" ? L.anchorX - ruleW : L.anchorX, L.ruleY, ruleW, 2);
            ctx.restore();
            return L;
        },
        // small fracture ticks beside the numeral: a discreet "which page" marker.
        _chapterTicks(this: UiRuntime, ctx: CanvasRenderingContext2D, L: ChapterLayout, labelW: number, color: string,
            count: number, index: number, k: number) {
            if (count <= 1)
                return;
            const c = this.t.chapter, y = L.labelY - L.sizes.label * 0.34;
            const widths = Array.from({ length: count }, (_value, i) => (i === index ? c.tickActiveW : c.tickW));
            const total = widths.reduce((sum, w) => sum + w, 0) + c.tickGap * (count - 1);
            let x = L.side === "right" ? L.anchorX - labelW - c.tickLead - total : L.anchorX + labelW + c.tickLead;
            widths.forEach((w, i) => {
                ctx.globalAlpha = k * (i === index ? 1 : i < index ? this.t.alpha.muted : this.t.alpha.ghost * 1.6);
                ctx.fillStyle = color;
                ctx.fillRect(x, y, w, 2);
                x += w + c.tickGap;
            });
            ctx.globalAlpha = k;
        },
        // One lore page: an optional tracked caption, then the mono column. The phrase
        // reveal shows whole words in reading order (never per character).
        loreFragment(this: UiRuntime, ctx: CanvasRenderingContext2D, o?: UiOptions) {
            o = truthyOr<UiOptions>(o, () => ({}));
            const t = this.t, L = this._chapterLayout(o, ctx);
            const k = clamp(o.amount ?? 1, 0, 1), reveal = clamp(o.reveal ?? 1, 0, 1);
            const total = L.bodyLines.reduce((sum, line) => sum + line.split(" ").length, 0);
            let budget = Math.ceil(total * reveal);
            ctx.save();
            ctx.textBaseline = "alphabetic";
            ctx.fillStyle = this._chapterTone(o).ink;
            if (o.caption) {
                ctx.globalAlpha = k * t.alpha.chapterCaption;
                this._chapterText(ctx, o.caption, "caption", L.sizes.caption, L.anchorX, L.captionY, L.align);
            }
            ctx.globalAlpha = k;
            L.bodyLines.forEach((line, index) => {
                const words = line.split(" ");
                const shown = words.slice(0, Math.max(0, budget)).join(" ");
                budget -= words.length;
                if (shown)
                    this._chapterText(ctx, shown, "body", L.bodySize, L.anchorX, L.bodyY + index * L.bodyLineHeight, L.align);
            });
            ctx.restore();
        },
        // The prompt sits in the floor band under the arena, inked against the floor.
        // `hold` (0..1) draws the skip charge as a hairline that grows under the prompt.
        chapterPrompt(this: UiRuntime, ctx: CanvasRenderingContext2D, o?: UiOptions) {
            o = truthyOr<UiOptions>(o, () => ({}));
            if (!o.text)
                return;
            const t = this.t, L = this._chapterLayout(o, ctx);
            const k = clamp(o.amount ?? 1, 0, 1), hold = clamp(Number(o.hold) || 0, 0, 1);
            const ink = o.ground && inkIsLight(o.ground) ? CHAPTER_DARK_INK : t.color.cinemaInk;
            const width = this._chapterMeasure(ctx)(o.text, "prompt", L.sizes.prompt);
            ctx.save();
            ctx.textBaseline = "alphabetic";
            ctx.globalAlpha = k * t.alpha.chapterPrompt;
            ctx.fillStyle = ink;
            this._chapterText(ctx, o.text, "prompt", L.sizes.prompt, L.anchorX, L.promptY, L.align);
            if (hold > 0.01) {
                ctx.globalAlpha = k;
                ctx.fillStyle = o.ground && inkIsLight(o.ground) ? darkenToContrast(truthyOr(o.color, () => t.color.accent), o.ground, 3)
                    : lightenToContrast(truthyOr(o.color, () => t.color.accent), truthyOr(o.ground, () => t.color.rail), 3);
                ctx.fillRect(L.side === "right" ? L.anchorX - width * hold : L.anchorX, L.promptY + 8, width * hold, 2);
            }
            ctx.restore();
        },
        // The biome reveal is the same composition breathing open: the fade retreats,
        // the chapter title crossfades into the biome name and the intro line settles
        // under the rule. On the READY beat (`ready`, `readyK` 0..1) the text and the
        // last of the fade dissolve while the HUD returns, so nothing lingers at hand-off.
        biomeReveal(this: UiRuntime, ctx: CanvasRenderingContext2D, o?: UiOptions) {
            o = truthyOr<UiOptions>(o, () => ({}));
            const t = this.t, k = clamp(Number(o.amount) || 0, 0, 1), readyK = o.ready ? clamp(Number(o.readyK) || 0, 0, 1) : 0;
            const rest = t.chapter.revealRest;
            const fade = o.ready ? rest * (1 - ease(readyK)) : 1 - (1 - rest) * ease(k);
            const textK = o.ready ? 1 - ease(readyK / 0.6) : 1;
            const art: UiOptions = { composition: truthyOr(o.composition, () => "left"), color: truthyOr(o.color, () => t.color.accent),
                ...(o.sky === undefined ? {} : { sky: o.sky }) };
            const title = truthyOr(o.title, () => ""), name = truthyOr(o.name, () => "");
            const source = this._chapterLayout({ ...art, title }, ctx);
            const L = this.chapterHeader(ctx, { ...art, label: `CHAPTER ${String(truthyOr(o.number, () => ""))}`,
                title: o.ready ? name : title, ...(o.ready ? {} : { morphTo: name, morphK: k }), amount: textK, fade, reach: source.reach });
            if (!o.line)
                return;
            ctx.save();
            ctx.textBaseline = "alphabetic";
            ctx.fillStyle = this._chapterTone(art).ink;
            ctx.globalAlpha = textK * t.alpha.chapterLine * (o.ready ? 1 : ease((k - 0.45) / 0.4));
            this._chapterText(ctx, o.line, "line", L.sizes.line, L.anchorX, L.lineY, L.align);
            ctx.restore();
        },
        cinematicPrompt(this: UiRuntime, ctx: CanvasRenderingContext2D, opts?: UiOptions) {
            const o = truthyOr<UiOptions>(opts, () => ({})), t = this.t, k = o.amount ?? 1;
            if (!o.text)
                return;
            ctx.save();
            ctx.fillStyle = truthyOr(o.color, () => t.color.cinemaMuted);
            ctx.globalAlpha = k * t.alpha.cinemaHint;
            ctx.font = this.font(t.type.label, true);
            ctx.textBaseline = "middle";
            ctx.textAlign = truthyOr(o.align, () => "center");
            const x = o.x ?? view.w / 2, y = o.y ?? view.h - t.metric.cinematicPromptBottom;
            ctx.fillText(o.text, x, y);
            ctx.restore();
        },
        // The reward is deliberately its own celebration, after the world and lore
        // have resolved. Callers provide copy and values; this component owns all
        // screen-space geometry, type, color and hierarchy.
        // `actions: true` reserves a footer row inside the panel; the returned `actionsY`
        // is where the caller lays its buttons, so they always sit inside the panel.
        finalReward(this: UiRuntime, ctx: CanvasRenderingContext2D, opts?: UiOptions) {
            const o = truthyOr<UiOptions>(opts, () => ({})), t = this.t, m = t.metric, a = t.alpha, vw = view.w, vh = view.h;
            const k0 = Math.max(0, Math.min(Number(o.amount) || 0, 1)), k = 1 - (1 - k0) * (1 - k0);
            const actionsAt = 312 + t.type.caption + t.space.lg, needed = o.actions ? actionsAt + m.btnH + t.space.lg : 0;
            const w = Math.min(m.finalRewardW, vw - t.space.xl * 2), h = Math.min(Math.max(m.finalRewardH, needed), vh - t.space.xl * 2);
            const x = (vw - w) / 2, y = (vh - h) / 2 + (1 - k) * t.space.lg, color = truthyOr(o.color, () => t.color.accent);
            const savedInk = this.ink;
            ctx.save();
            ctx.globalAlpha = k * a.finalRewardDim;
            ctx.fillStyle = t.color.cinema;
            ctx.fillRect(-overscan.x, -overscan.y, vw + overscan.x * 2, vh + overscan.y * 2);
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
            return { x, y, w, h, actionsY: y + actionsAt };
        },
        finaleFracture(this: UiRuntime, ctx: CanvasRenderingContext2D, opts?: UiOptions) {
            const o = truthyOr<UiOptions>(opts, () => ({})), t = this.t, m = t.metric, vw = view.w;
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
        // Theme-safe: the dim and the live ink are always a contrasting pair. Dark ink
        // fades the world toward paper; light ink (dark-biome themes, modals) fades it
        // toward the dark scrim instead, so text on the dim never washes out.
        dim(this: UiRuntime, ctx: CanvasRenderingContext2D, w: number, h: number, a?: number) {
            const ox = overscan.x;
            const oy = overscan.y;
            ctx.globalAlpha = a ?? 0.78;
            ctx.fillStyle = inkIsLight(this.ink) ? this.t.color.scrim : this.t.color.paper;
            ctx.fillRect(-ox, -oy, w + ox * 2, h + oy * 2); // reach the true screen edges in fullscreen
            ctx.globalAlpha = 1;
        },
        // In-run teaching card surface (tutorial lesson, playground help): the contrasting
        // surface for the live ink (paper under dark ink, scrim under light ink) at
        // `alpha.hudPlate`. HUD groups and banners never use it; their text sits on the scene.
        hudPlate(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
            ctx.save();
            ctx.globalAlpha = this.t.alpha.hudPlate;
            ctx.fillStyle = inkIsLight(this.ink) ? this.t.color.scrim : this.t.color.paper;
            ctx.fillRect(x, y, w, h);
            ctx.restore();
        },
        // scroll affordance ("▲ scroll ▼") for long lists
        scrollHint(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, canUp: boolean, canDown: boolean, align: CanvasTextAlign = "center") {
            this.text(ctx, (canUp ? "▲ " : "") + "SCROLL" + (canDown ? " ▼" : ""), x, y, this.t.type.caption, align, this.t.alpha.muted);
        },
        // ---- MENU AMBIENCE + STRUCTURE -----------------------------------------
        // a faint, slowly drifting "tear-slash" backdrop drawn behind every menu screen.
        // Monochrome with occasional accent so it reads as motion, never as clutter.
  };
}

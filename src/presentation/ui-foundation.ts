import type { Align, ButtonSpec, Rect, TokenSnapshot, UiDependencies, UiRuntime } from "./ui-contracts";
import { truthyOr } from "./value-fallback";

export function createUiFoundation(dependencies: UiDependencies) {
  const { Input, presentation: { overscan, view } } = dependencies;
  const controllerGlyph = dependencies.controllerGlyph ??
    ((index: number) => index === 4 ? "L1" : index === 5 ? "R1" : `#${String(index)}`);
  return {
font(this: UiRuntime, size: number, bold?: boolean) {
            return `${bold ? "bold " : ""}${String(size)}px ${this.t.font.brand}`;
        },
        // ---- CHAPTER TYPE ROLES (Pantheon VI) -----------------------------------
        // Never hardcode the family strings at a call site; go through these.
        displayFont(this: UiRuntime, size: number, weight?: number) { return `${String(truthyOr(weight, () => this.t.font.displayWeight))} ${String(size)}px ${this.t.font.display}`; },
        bodyFont(this: UiRuntime, size: number, weight?: number) { return `${String(truthyOr(weight, () => this.t.font.bodyWeight))} ${String(size)}px ${this.t.font.body}`; },
        // draw a single line with manual per-glyph tracking (canvas letter-spacing is
        // not yet universal). Returns the advanced x. Honors the current textAlign for
        // "left"/"right"/"center" by pre-measuring the tracked width.
        trackedText(this: UiRuntime, ctx: CanvasRenderingContext2D, str: string, x: number, y: number, track: number, align?: Align) {
            const s = str;
            if (!s)
                return x;
            let total = 0;
            for (let i = 0; i < s.length; i++)
                total += ctx.measureText(s.charAt(i)).width + (i < s.length - 1 ? track : 0);
            let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
            const savedAlign = ctx.textAlign;
            ctx.textAlign = "left";
            for (const glyph of s.split("")) {
                ctx.fillText(glyph, cx, y);
                cx += ctx.measureText(glyph).width + track;
            }
            ctx.textAlign = savedAlign;
            return cx;
        },
        // A directional ink-wash: an opaque-toward-the-edge → transparent gradient on
        // one side of the screen, replacing the old full-screen dim. `side` is where
        // the text lives (and where the wash is densest).
        chapterWash(this: UiRuntime, ctx: CanvasRenderingContext2D, side: string, washKind: string | undefined, amount: number) {
            const t = this.t, vw = view.w, vh = view.h, k = Math.max(0, Math.min(amount, 1));
            const dense = washKind === "light" ? t.chapter.washLight : t.chapter.washDark;
            const span = vw * t.chapter.washSpan;
            ctx.save();
            // a whole-screen breath of dim first (only ~26%, biome stays legible)
            ctx.globalAlpha = k * t.chapter.washDim;
            ctx.fillStyle = washKind === "light" ? "#f8f7f4" : "#06070c";
            ctx.fillRect(-overscan.x, -overscan.y, vw + overscan.x * 2, vh + overscan.y * 2);
            ctx.globalAlpha = k;
            const g = side === "right"
                ? ctx.createLinearGradient(vw, 0, vw - span, 0)
                : ctx.createLinearGradient(0, 0, span, 0);
            g.addColorStop(0, dense);
            g.addColorStop(1, washKind === "light" ? "rgba(248,247,244,0)" : "rgba(6,7,12,0)");
            ctx.fillStyle = g;
            if (side === "right")
                ctx.fillRect(vw - span, -overscan.y, span + overscan.x, vh + overscan.y * 2);
            else
                ctx.fillRect(-overscan.x, -overscan.y, span + overscan.x, vh + overscan.y * 2);
            ctx.restore();
            return washKind === "light" ? "#12131a" : "#f1eff9"; // the ink color that reads on this wash
        },
        // ---- TEXT ---------------------------------------------------------------
        // body / inline copy. size defaults to the `body` token.
        text(this: UiRuntime, ctx: CanvasRenderingContext2D, str: string, x: number, y: number, size?: number, align?: Align, alpha?: number, protectContrast = false) {
            ctx.globalAlpha = protectContrast ? this.t.alpha.full : alpha ?? this.t.alpha.full;
            ctx.fillStyle = this.ink;
            ctx.font = this.font(truthyOr(size, () => this.t.type.body), false);
            ctx.textAlign = truthyOr(align, () => "left");
            ctx.textBaseline = "alphabetic";
            if (protectContrast) {
                ctx.save();
                ctx.strokeStyle = this.t.color.paper;
                ctx.lineWidth = this.t.metric.hudTextOutline;
                ctx.lineJoin = "round";
                ctx.strokeText(str, x, y);
                ctx.restore();
            }
            ctx.fillText(str, x, y);
            ctx.globalAlpha = 1;
        },
        // Core-interface emphasis with explicit alignment. Cinematic/chapter
        // compositions opt into displayFont directly instead of replacing Tear's
        // established mono identity across ordinary game screens.
        displayText(this: UiRuntime, ctx: CanvasRenderingContext2D, str: string, x: number, y: number, size?: number, align?: Align, alpha?: number) {
            ctx.globalAlpha = alpha ?? this.t.alpha.full;
            ctx.fillStyle = this.ink;
            ctx.font = this.font(truthyOr(size, () => this.t.type.lead), true);
            ctx.textAlign = truthyOr(align, () => "left");
            ctx.textBaseline = "alphabetic";
            ctx.fillText(str, x, y);
            ctx.globalAlpha = 1;
        },
        // bold, centred heading. size defaults to the `h1` token.
        title(this: UiRuntime, ctx: CanvasRenderingContext2D, str: string, x: number, y: number, size?: number) {
            ctx.fillStyle = this.ink;
            ctx.font = this.font(truthyOr(size, () => this.t.type.h1), true);
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            ctx.fillText(str, x, y);
        },
        // centred card title that steps down through the type scale until it fits.
        fitTitle(this: UiRuntime, ctx: CanvasRenderingContext2D, str: string, x: number, y: number, maxW: number, startSize?: number, minSize?: number) {
            let size = truthyOr(startSize, () => this.t.type.title);
            const floor = truthyOr(minSize, () => this.t.type.label);
            ctx.font = this.font(size, true);
            while (ctx.measureText(str).width > maxW && size > floor) {
                size--;
                ctx.font = this.font(size, true);
            }
            this.title(ctx, str, x, y, size);
        },
        wrappedText(this: UiRuntime, ctx: CanvasRenderingContext2D, str: string, x: number, y: number, maxW: number, lineH: number, size?: number, align?: Align, alpha?: number) {
            ctx.save();
            ctx.globalAlpha *= alpha ?? this.t.alpha.full;
            ctx.fillStyle = this.ink;
            ctx.font = this.font(truthyOr(size, () => this.t.type.body), false);
            ctx.textAlign = truthyOr(align, () => "center");
            ctx.textBaseline = "alphabetic";
            const words = (str || "").split(" "), lines = [];
            let line = "";
            for (const word of words) {
                const test = line ? line + " " + word : word;
                if (ctx.measureText(test).width > maxW && line) {
                    lines.push(line);
                    line = word;
                }
                else
                    line = test;
            }
            if (line)
                lines.push(line);
            for (let i = 0; i < lines.length; i++)
                ctx.fillText(lines[i] ?? "", x, y + i * lineH);
            ctx.restore();
            return y + Math.max(0, lines.length - 1) * lineH;
        },
        keyBadge(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, size: number, label: string, color?: string) {
            ctx.fillStyle = truthyOr(color, () => this.t.color.accent);
            ctx.fillRect(x, y, size, size);
            ctx.fillStyle = this.t.color.paper;
            ctx.font = this.font(this.t.type.label, true);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(label, x + size / 2, y + size / 2 + 1);
            ctx.textBaseline = "alphabetic";
        },
        tierPips(this: UiRuntime, ctx: CanvasRenderingContext2D, cx: number, y: number, count: number, next: number, color: string) {
            const gap = 26, start = cx - ((count - 1) * gap) / 2;
            for (let i = 0; i < count; i++) {
                ctx.beginPath();
                ctx.arc(start + i * gap, y, 6, 0, Math.PI * 2);
                if (i < next - 1) {
                    ctx.fillStyle = color;
                    ctx.fill();
                }
                else {
                    ctx.strokeStyle = i === next - 1 ? color : this.t.color.disabled;
                    ctx.lineWidth = i === next - 1 ? 2.5 : 1.5;
                    ctx.stroke();
                }
            }
        },
        // a coloured caption/tag (category labels, status words). align defaults left.
        tag(this: UiRuntime, ctx: CanvasRenderingContext2D, str: string, x: number, y: number, color?: string, align?: Align, size?: number, protectContrast = false) {
            ctx.fillStyle = truthyOr(color, () => this.t.color.muted);
            ctx.font = this.font(truthyOr(size, () => this.t.type.micro), true);
            ctx.textAlign = truthyOr(align, () => "left");
            ctx.textBaseline = "alphabetic";
            if (protectContrast) {
                ctx.save();
                ctx.globalAlpha = this.t.alpha.full;
                ctx.strokeStyle = this.t.color.paper;
                ctx.lineWidth = this.t.metric.hudTextOutline;
                ctx.lineJoin = "round";
                ctx.strokeText(str, x, y);
                ctx.fillText(str, x, y);
                ctx.restore();
            } else ctx.fillText(str, x, y);
        },
        // standard screen header: an h1/h2 title + an optional muted tagline beneath it.
        // Returns the y just below the header so callers can flow content under it.
        screenHeader(this: UiRuntime, ctx: CanvasRenderingContext2D, title: string, subtitle?: string, y?: number, big?: boolean) {
            const ty = y ?? 70;
            const cx = view.w / 2;
            this.title(ctx, title, cx, ty, big ? this.t.type.h1 : this.t.type.h2);
            if (subtitle)
                this.text(ctx, subtitle, cx, ty + 28, this.t.type.caption, "center", this.t.alpha.muted);
            return ty + (subtitle ? 52 : 36);
        },
        pointIn(this: UiRuntime, b: Rect, x: number, y: number, pad?: number) {
            const p = truthyOr(pad, () => 0);
            return x >= b.x - p && x <= b.x + b.w + p && y >= b.y - p && y <= b.y + b.h + p;
        },
        // ---- DENSITY (responsive profile) ----------------------------------------
        // "touch" bumps the type scale + interactive metrics so menus stay readable
        // and tappable on small screens; "desktop" restores the design defaults.
        // Token-driven screens inherit automatically; layouts keep their geometry.
        _baseTokens: null as TokenSnapshot | null,
        setDensity(this: UiRuntime, mode: string) {
            this._baseTokens ??= { type: Object.assign({}, this.t.type), metric: Object.assign({}, this.t.metric) };
            const b = this._baseTokens;
            if (mode === "touch") {
                const bump = { micro: 3, caption: 3, label: 3, body: 3, lead: 3, title: 2, h2: 2, h1: 2 };
                const typeTokens = this.t.type as Record<string, number>;
                for (const key in b.type)
                    typeTokens[key] = (b.type[key] ?? 0) + ((bump as Record<string, number | undefined>)[key] ?? 0);
                Object.assign(this.t.metric, { btnH: 60, btnW: 320, chipH: 38, chipW: 116,
                    settingsRowH: 66, settingsControlW: 272, settingsControlH: 54, settingsStepperW: 60 });
            }
            else {
                Object.assign(this.t.type, b.type);
                Object.assign(this.t.metric, b.metric);
            }
        },
        // ---- BUTTON -------------------------------------------------------------
        // b: {x,y,w,h,label,enabled,size,sel} ; active = hovered | focused | selected
        // Every label goes through the shared fitting rule (ui-text-fit.ts): measure,
        // step down to the micro floor, wrap to two lines when the height allows,
        // and only then ellipsize. Navigation labels (rail, hero) never ellipsize.
        _fitLabel(this: UiRuntime, ctx: CanvasRenderingContext2D, label: string, maxWidth: number, size: number, height: number, nav: boolean) {
            const lineHeight = Math.round(size * 1.12);
            const maxLines = height >= lineHeight * 2 + 10 ? 2 : 1;
            return this.fitText(ctx, label, maxWidth, { size, floor: Math.min(size, this.t.type.micro), maxLines, ellipsis: !nav, bold: true });
        },
        _drawLines(this: UiRuntime, ctx: CanvasRenderingContext2D, lines: readonly string[], x: number, centerY: number, size: number) {
            const lineHeight = Math.round(size * 1.12), first = centerY - ((lines.length - 1) * lineHeight) / 2;
            lines.forEach((line, index) => { ctx.fillText(line, x, first + index * lineHeight); });
        },
        button(this: UiRuntime, ctx: CanvasRenderingContext2D, b: ButtonSpec, active?: boolean) {
            const t = this.t;
            if (b.ghost) {
                // main-menu rail button: drawn over the rail's solid dark backing, a soft light
                // edge, and a hot accent bar + label slide driven by the hover progress (b._a).
                // Optional trimmings: b.glyph (left icon), b.dot (status pip), b.sub (subline),
                // b.hero (accent-filled call-to-action).
                const a = b._a ?? (active ? 1 : 0);
                const on = b.enabled !== false, cy = b.y + b.h / 2;
                if (b.hero) {
                    ctx.fillStyle = t.color.accent;
                    ctx.globalAlpha = on ? 0.9 + 0.1 * a : 0.5;
                    ctx.fillRect(b.x, b.y, b.w, b.h);
                    ctx.globalAlpha = 0.22 + 0.35 * a;
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(b.x, b.y, b.w, 2);
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = "#08131a";
                    ctx.textAlign = "left";
                    ctx.textBaseline = "middle";
                    if (b.glyph) {
                        ctx.font = this.font(30, true);
                        ctx.fillText(b.glyph, b.x + 22, cy + 1);
                    }
                    const hx = b.x + (b.glyph ? 70 : 24) + a * 6, room = b.x + b.w - hx - 18;
                    const fit = this.fitText(ctx, b.label, room, { size: truthyOr(b.size, () => 34), floor: t.type.lead, ellipsis: false, bold: true });
                    ctx.font = this.font(fit.size, true);
                    ctx.fillText(fit.lines[0] ?? b.label, hx, cy - (b.sub ? 12 : 0) + 1);
                    if (b.sub) {
                        const sub = this.fitText(ctx, b.sub, room, { size: t.type.caption, floor: t.type.micro, bold: true });
                        ctx.globalAlpha = 0.82;
                        ctx.font = this.font(sub.size, true);
                        ctx.fillText(sub.lines[0] ?? "", hx, cy + 16);
                        ctx.globalAlpha = 1;
                    }
                    ctx.textBaseline = "alphabetic";
                    return;
                }
                ctx.fillStyle = "rgba(241,239,249," + (0.06 + a * 0.10).toFixed(3) + ")";
                ctx.fillRect(b.x, b.y, b.w, b.h);
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = "rgba(241,239,249," + (on ? 0.32 + a * 0.5 : 0.18).toFixed(3) + ")";
                ctx.strokeRect(b.x + 0.75, b.y + 0.75, b.w - 1.5, b.h - 1.5);
                ctx.globalAlpha = a;
                ctx.fillStyle = t.color.accent;
                ctx.fillRect(b.x, b.y, 4, b.h);
                ctx.globalAlpha = 1;
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                let labelX = b.x + 18 + a * 8;
                if (b.dot) { // status pip (player card sync state)
                    ctx.beginPath();
                    ctx.arc(b.x + 22, cy, 5, 0, 6.2832);
                    ctx.fillStyle = b.dot;
                    ctx.fill();
                    labelX = b.x + 42 + a * 8;
                }
                else if (b.glyph) { // left glyph slot, warms on hover
                    ctx.globalAlpha = on ? 0.6 + 0.4 * a : 0.35;
                    ctx.fillStyle = t.color.accent;
                    ctx.font = this.font(18, true);
                    ctx.fillText(b.glyph, b.x + 16 + a * 8, cy + 1);
                    ctx.globalAlpha = 1;
                    labelX = b.x + 50 + a * 8;
                }
                const room = b.x + b.w - labelX - 16;
                const fit = this._fitLabel(ctx, b.label, room, truthyOr(b.size, () => t.type.lead), b.sub ? 0 : b.h, true);
                ctx.fillStyle = on ? t.color.railInk : "rgba(241,239,249,0.5)";
                ctx.font = this.font(fit.size, true);
                this._drawLines(ctx, fit.lines, labelX, (b.sub ? cy - 10 : cy) + 1, fit.size);
                if (b.sub) {
                    const sub = this.fitText(ctx, b.sub, room, { size: t.type.caption, floor: t.type.micro });
                    ctx.globalAlpha = t.alpha.soft;
                    ctx.font = this.font(sub.size, false);
                    ctx.fillText(sub.lines[0] ?? "", labelX, cy + 13);
                    ctx.globalAlpha = 1;
                }
                ctx.textBaseline = "alphabetic";
                return;
            }
            // default buttons share the menu's ghost language, adapted to light content zones:
            // a near-solid paper body + ink hairline; hover/focus warms the wash and slides in a
            // cyan accent bar (b._a = smooth hover progress); a SELECTED button is solid ink.
            // Strokes are inset so no state ever draws outside the control's box.
            const on = b.enabled !== false;
            const a = on ? (b._a ?? (active ? 1 : 0)) : 0;
            const selected = on && !!b.sel;
            if (selected) {
                ctx.fillStyle = this.ink;
                ctx.fillRect(b.x, b.y, b.w, b.h);
                ctx.fillStyle = t.color.paper;
            }
            else {
                ctx.globalAlpha = on ? 0.92 : 0.6;
                ctx.fillStyle = t.color.paper;
                ctx.fillRect(b.x, b.y, b.w, b.h);
                if (a > 0.01) {
                    ctx.globalAlpha = 0.08 * a;
                    ctx.fillStyle = this.ink;
                    ctx.fillRect(b.x, b.y, b.w, b.h);
                }
                const stroke = 1.5 + a * 0.5;
                ctx.globalAlpha = on ? 0.6 + 0.4 * a : 1;
                ctx.lineWidth = stroke;
                ctx.strokeStyle = on ? this.ink : t.color.disabled;
                ctx.strokeRect(b.x + stroke / 2, b.y + stroke / 2, b.w - stroke, b.h - stroke);
                ctx.globalAlpha = 1;
                if (b.accent) {
                    ctx.fillStyle = b.accent;
                    ctx.fillRect(b.x, b.y, 4, b.h);
                } // identity bar (e.g. enemy kind colour)
                if (a > 0.01) {
                    ctx.globalAlpha = a;
                    ctx.fillStyle = t.color.accent;
                    ctx.fillRect(b.x, b.y, b.accent ? 4 : 3, b.h);
                    ctx.globalAlpha = 1;
                }
                ctx.fillStyle = on ? this.ink : "#8b8d98";
            }
            // optional trimmings (parity with the ghost style): b.glyph = left icon
            // slot, b.sub = caption subline, b.pips = {n, filled, color} right-aligned
            // level/heat meter; otherwise, text lays out centred.
            const cy2 = b.y + b.h / 2;
            ctx.textBaseline = "middle";
            if (b.pips)
                this.pips(ctx, b.x + b.w - 14, cy2, b.pips.n, b.pips.filled, selected ? t.color.paper : b.pips.color);
            const size = truthyOr(b.size, () => t.type.lead);
            if (b.glyph || b.sub) {
                let lx2 = b.x + 16;
                if (b.glyph) {
                    ctx.globalAlpha = selected ? 1 : 0.6 + 0.4 * a;
                    ctx.fillStyle = selected ? t.color.paper : (truthyOr(b.accent, () => t.color.accent));
                    ctx.font = this.font(17, true);
                    ctx.textAlign = "left";
                    ctx.fillText(b.glyph, lx2, cy2 + 1);
                    ctx.globalAlpha = 1;
                    lx2 += 30;
                }
                const rightReserve = b.pips ? b.pips.n * 14 + 24 : 14;
                const room = b.x + b.w - lx2 - rightReserve;
                const fit = this._fitLabel(ctx, b.label, room, size, b.sub ? 0 : b.h, false);
                ctx.fillStyle = selected ? t.color.paper : (on ? this.ink : "#8b8d98");
                ctx.font = this.font(fit.size, true);
                ctx.textAlign = "left";
                this._drawLines(ctx, fit.lines, lx2, (b.sub ? cy2 - 10 : cy2) + 1, fit.size);
                if (b.sub) {
                    const sub = this.fitText(ctx, b.sub, room, { size: t.type.micro, floor: t.type.micro });
                    ctx.globalAlpha = selected ? 0.85 : t.alpha.muted;
                    ctx.font = this.font(sub.size, false);
                    ctx.fillText(sub.lines[0] ?? "", lx2, cy2 + 13);
                    ctx.globalAlpha = 1;
                }
                ctx.textBaseline = "alphabetic";
                return;
            }
            const fit = this._fitLabel(ctx, b.label, b.w - 16, size, b.h, false);
            ctx.font = this.font(fit.size, true);
            ctx.textAlign = "center";
            this._drawLines(ctx, fit.lines, b.x + b.w / 2, cy2 + 1, fit.size);
            ctx.textBaseline = "alphabetic";
        },
        // ---- CHIP (compact toggle: filters, segmented controls) -----------------
        // One chip style everywhere: paper body + hairline; the selected chip is solid
        // ink at exactly the same size (inset stroke, no growth). Labels use the fitting rule.
        chip(this: UiRuntime, ctx: CanvasRenderingContext2D, b: ButtonSpec, on: boolean) {
            const t = this.t, hover = (b._a ?? 0) > 0.01 && !on;
            ctx.fillStyle = on ? this.ink : t.color.paper;
            ctx.globalAlpha = on ? 1 : 0.94;
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.globalAlpha = 1;
            if (hover) { ctx.globalAlpha = 0.08 * (b._a ?? 0); ctx.fillStyle = this.ink; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.globalAlpha = 1; }
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = on ? this.ink : "rgba(40,42,54,0.55)";
            ctx.strokeRect(b.x + 0.75, b.y + 0.75, b.w - 1.5, b.h - 1.5);
            if (hover) { ctx.globalAlpha = b._a ?? 0; ctx.fillStyle = t.color.accent; ctx.fillRect(b.x, b.y + b.h - 3, b.w, 3); ctx.globalAlpha = 1; }
            const fit = this._fitLabel(ctx, b.label, b.w - 14, truthyOr(b.size, () => t.type.micro), b.h, false);
            ctx.fillStyle = on ? t.color.paper : this.ink;
            ctx.font = this.font(fit.size, true);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            this._drawLines(ctx, fit.lines, b.x + b.w / 2, b.y + b.h / 2 + 1, fit.size);
            ctx.textBaseline = "alphabetic";
        },
        // ---- FOCUS RING (keyboard / controller) ----------------------------------
        // Drawn outside the control so it never covers the label; ink-on-sheet or
        // rail-ink for ghost controls, with an accent inner line for identity.
        focusRing(this: UiRuntime, ctx: CanvasRenderingContext2D, b: Rect & { readonly ghost?: boolean }) {
            const m = this.t.metric, gap = m.focusGap, w = m.focusRing;
            ctx.save();
            ctx.lineWidth = w;
            ctx.strokeStyle = b.ghost ? this.t.color.railInk : this.ink;
            ctx.strokeRect(b.x - gap - w / 2, b.y - gap - w / 2, b.w + (gap + w / 2) * 2, b.h + (gap + w / 2) * 2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = this.t.color.accent;
            ctx.strokeRect(b.x - gap + 1.5, b.y - gap + 1.5, b.w + gap * 2 - 3, b.h + gap * 2 - 3);
            ctx.restore();
        },
        // ---- TOGGLE (boolean switch: track + sliding knob) -----------------------
        // b: {x,y,w,h} = the clickable row (registered by the caller as a normal
        // uiButton); `on` = current value. The switch renders right-aligned in the row.
        _togAnim: {} as Record<string, number>,
        toggle(this: UiRuntime, ctx: CanvasRenderingContext2D, b: ButtonSpec, on: boolean) {
            const key = truthyOr(b._k, () => `${String(b.x)},${String(b.y)}`);
            const prev = this._togAnim[key] ?? (on ? 1 : 0);
            const a = this._togAnim[key] = prev + ((on ? 1 : 0) - prev) * 0.25;
            const trW = 58, trH = 26, tx = b.x + b.w - trW - 10, ty = b.y + (b.h - trH) / 2;
            // track
            ctx.globalAlpha = 0.25 + a * 0.75;
            ctx.fillStyle = on ? this.t.color.accent : "#9a9aa4";
            ctx.fillRect(tx, ty, trW, trH);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = this.ink;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(tx, ty, trW, trH);
            // knob slides
            const kx = tx + 3 + a * (trW - trH);
            ctx.fillStyle = this.t.color.paper;
            ctx.fillRect(kx, ty + 3, trH - 6, trH - 6);
            ctx.strokeStyle = this.ink;
            ctx.strokeRect(kx, ty + 3, trH - 6, trH - 6);
            // state word to the left of the track
            ctx.font = this.font(this.t.type.micro, true);
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillStyle = this.ink;
            ctx.globalAlpha = on ? 0.85 : 0.4;
            ctx.fillText(on ? "ON" : "OFF", tx - 10, ty + trH / 2 + 1);
            ctx.globalAlpha = 1;
            ctx.textBaseline = "alphabetic";
            ctx.textAlign = "left";
        },
        // ---- TABS (segmented view-switcher for hub screens) ----------------------
        // Deliberately NOT a chip: chips FILTER content, tabs SWITCH whole views.
        // A centred strip of labels over one hairline, with a sliding accent underline
        // marking the active view. `push` receives one hitbox per tab (b._tab = index).
        _tabAnim: {} as Record<string, number>,
        tabs(this: UiRuntime, ctx: CanvasRenderingContext2D, id: string, labels: string[], active: number, y: number, push?: (button: ButtonSpec) => void, maxWidth = 1120) {
            const t = this.t, cx = view.w / 2, h = 34;
            ctx.font = this.font(t.type.label, true);
            let segW = 150;
            for (const l of labels)
                segW = Math.max(segW, ctx.measureText(l).width + 48);
            // the strip never grows wider than the content column it sits in
            segW = Math.min(segW, maxWidth / Math.max(1, labels.length));
            const total = segW * labels.length, x0 = cx - total / 2;
            this.divider(ctx, x0, y + h, total, 0.18);
            // sliding accent underline eases toward the active segment
            const prev = this._tabAnim[id] ?? active;
            const cur = this._tabAnim[id] = prev + (active - prev) * 0.25;
            ctx.fillStyle = t.color.accent;
            ctx.fillRect(x0 + cur * segW + segW * 0.18, y + h - 3, segW * 0.64, 3);
            labels.forEach((label, i) => {
                const on = i === active;
                ctx.fillStyle = this.ink;
                ctx.globalAlpha = on ? 1 : t.alpha.muted;
                const fit = this.fitText(ctx, label, segW - 16, { size: t.type.label, floor: t.type.micro, ellipsis: false, bold: true });
                ctx.font = this.font(fit.size, true);
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(fit.lines[0] ?? label, x0 + i * segW + segW / 2, y + h / 2);
                ctx.globalAlpha = 1;
                if (push)
                    push({ x: x0 + i * segW, y, w: segW, h, label: "", _hideBox: true, _tab: i });
            });
            // controller affordance: L1 ‹ … › R1 flanks the strip while a pad owns the UI
            if (Input.mode === "gamepad") {
                ctx.globalAlpha = t.alpha.muted;
                ctx.fillStyle = t.color.accent;
                ctx.font = this.font(t.type.micro, true);
                ctx.textBaseline = "middle";
                ctx.textAlign = "right";
                ctx.fillText(`${controllerGlyph(4)} ‹`, x0 - 12, y + h / 2);
                ctx.textAlign = "left";
                ctx.fillText(`› ${controllerGlyph(5)}`, x0 + total + 12, y + h / 2);
                ctx.globalAlpha = 1;
            }
            ctx.textBaseline = "alphabetic";
            return y + h + 10;
        },
        // ---- LEDGER KIT (small editorial pieces shared by the sub-screens) --------
        // a bordered key-cap chip ("W", "SHIFT", "RMB") for control listings.
        // Returns the width consumed so callers can lay a row of caps.
  };
}

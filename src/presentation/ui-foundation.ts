import type { Align, ButtonSpec, Rect, TokenSnapshot, UiDependencies, UiRuntime } from "./ui-contracts";
import { truthyOr } from "./value-fallback";

function fitLine(context: CanvasRenderingContext2D, value: string, maximumWidth: number): string {
    if (context.measureText(value).width <= maximumWidth) return value;
    let low = 0, high = value.length;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (context.measureText(value.slice(0, middle).trimEnd() + "…").width <= maximumWidth) low = middle;
        else high = middle - 1;
    }
    return value.slice(0, low).trimEnd() + "…";
}

export function createUiFoundation(dependencies: UiDependencies) {
  const { CONFIG, Input, OVERSCAN } = dependencies;
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
            const t = this.t, vw = CONFIG.view.w, vh = CONFIG.view.h, k = Math.max(0, Math.min(amount, 1));
            const dense = washKind === "light" ? t.chapter.washLight : t.chapter.washDark;
            const span = vw * t.chapter.washSpan;
            ctx.save();
            // a whole-screen breath of dim first (only ~26%, biome stays legible)
            ctx.globalAlpha = k * t.chapter.washDim;
            ctx.fillStyle = washKind === "light" ? "#f8f7f4" : "#06070c";
            ctx.fillRect(-OVERSCAN.x, -OVERSCAN.y, vw + OVERSCAN.x * 2, vh + OVERSCAN.y * 2);
            ctx.globalAlpha = k;
            const g = side === "right"
                ? ctx.createLinearGradient(vw, 0, vw - span, 0)
                : ctx.createLinearGradient(0, 0, span, 0);
            g.addColorStop(0, dense);
            g.addColorStop(1, washKind === "light" ? "rgba(248,247,244,0)" : "rgba(6,7,12,0)");
            ctx.fillStyle = g;
            if (side === "right")
                ctx.fillRect(vw - span, -OVERSCAN.y, span + OVERSCAN.x, vh + OVERSCAN.y * 2);
            else
                ctx.fillRect(-OVERSCAN.x, -OVERSCAN.y, span + OVERSCAN.x, vh + OVERSCAN.y * 2);
            ctx.restore();
            return washKind === "light" ? "#12131a" : "#f1eff9"; // the ink color that reads on this wash
        },
        // ---- TEXT ---------------------------------------------------------------
        // body / inline copy. size defaults to the `body` token.
        text(this: UiRuntime, ctx: CanvasRenderingContext2D, str: string, x: number, y: number, size?: number, align?: Align, alpha?: number) {
            ctx.globalAlpha = alpha ?? this.t.alpha.full;
            ctx.fillStyle = this.ink;
            ctx.font = this.font(truthyOr(size, () => this.t.type.body), false);
            ctx.textAlign = truthyOr(align, () => "left");
            ctx.textBaseline = "alphabetic";
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
        tag(this: UiRuntime, ctx: CanvasRenderingContext2D, str: string, x: number, y: number, color?: string, align?: Align, size?: number) {
            ctx.fillStyle = truthyOr(color, () => this.t.color.muted);
            ctx.font = this.font(truthyOr(size, () => this.t.type.micro), true);
            ctx.textAlign = truthyOr(align, () => "left");
            ctx.textBaseline = "alphabetic";
            ctx.fillText(str, x, y);
        },
        // standard screen header: an h1/h2 title + an optional muted tagline beneath it.
        // Returns the y just below the header so callers can flow content under it.
        screenHeader(this: UiRuntime, ctx: CanvasRenderingContext2D, title: string, subtitle?: string, y?: number, big?: boolean) {
            const ty = y ?? 70;
            const cx = CONFIG.view.w / 2;
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
                    typeTokens[key] = (b.type[key] ?? 0) + bump[key as keyof typeof bump];
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
        button(this: UiRuntime, ctx: CanvasRenderingContext2D, b: ButtonSpec, active?: boolean) {
            if (b.ghost) {
                // main-menu rail button: translucent over the dark sidebar, a soft light edge,
                // and a hot accent bar + label slide driven by the smooth hover progress (b._a).
                // Optional trimmings: b.glyph (left icon), b.dot (status pip), b.sub (subline),
                // b.hero (accent-filled call-to-action).
                const a = b._a ?? (active ? 1 : 0);
                const on = b.enabled !== false, cy = b.y + b.h / 2;
                if (b.hero) {
                    // HERO: the primary call-to-action — solid accent body, dark ink label that
                    // brightens + slides on hover, a top sheen line, and an optional subline.
                    ctx.fillStyle = this.t.color.accent;
                    ctx.globalAlpha = on ? 0.88 + 0.12 * a : 0.5;
                    ctx.fillRect(b.x, b.y, b.w, b.h);
                    ctx.globalAlpha = 1;
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
                    const hx = b.x + (b.glyph ? 70 : 24) + a * 6;
                    ctx.font = this.font(truthyOr(b.size, () => 34), true);
                    ctx.fillText(fitLine(ctx, b.label, b.x + b.w - hx - 18), hx, cy - (b.sub ? 12 : 0) + 1);
                    if (b.sub) {
                        ctx.globalAlpha = 0.72;
                        ctx.font = this.font(this.t.type.caption, true);
                        ctx.fillText(fitLine(ctx, b.sub, b.x + b.w - hx - 18), hx, cy + 16);
                        ctx.globalAlpha = 1;
                    }
                    ctx.textBaseline = "alphabetic";
                    return;
                }
                ctx.fillStyle = "rgba(241,239,249," + (0.05 + a * 0.10).toFixed(3) + ")";
                ctx.fillRect(b.x, b.y, b.w, b.h);
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = "rgba(241,239,249," + (on ? 0.28 + a * 0.5 : 0.15).toFixed(3) + ")";
                ctx.strokeRect(b.x, b.y, b.w, b.h);
                ctx.globalAlpha = a;
                ctx.fillStyle = this.t.color.accent;
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
                    ctx.globalAlpha = on ? 0.5 + 0.5 * a : 0.3;
                    ctx.fillStyle = this.t.color.accent;
                    ctx.font = this.font(18, true);
                    ctx.fillText(b.glyph, b.x + 16 + a * 8, cy + 1);
                    ctx.globalAlpha = 1;
                    labelX = b.x + 50 + a * 8;
                }
                ctx.fillStyle = on ? "#f1eff9" : "rgba(241,239,249,0.4)";
                ctx.font = this.font(truthyOr(b.size, () => this.t.type.lead), true);
                ctx.fillText(fitLine(ctx, b.label, b.x + b.w - labelX - 16), labelX, (b.sub ? cy - 10 : cy) + 1);
                if (b.sub) {
                    ctx.globalAlpha = 0.6;
                    ctx.font = this.font(this.t.type.caption, false);
                    ctx.fillText(fitLine(ctx, b.sub, b.x + b.w - labelX - 16), labelX, cy + 12);
                    ctx.globalAlpha = 1;
                }
                ctx.textBaseline = "alphabetic";
                return;
            }
            // default buttons share the menu's ghost language, adapted to light content zones:
            // a frosted body + ink hairline; hover/focus warms the wash and slides in a cyan
            // accent bar (b._a = smooth hover progress); a SELECTED button stays solid ink.
            const on = b.enabled !== false;
            const a = on ? (b._a ?? (active ? 1 : 0)) : 0;
            const selected = on && !!b.sel;
            if (selected) {
                ctx.fillStyle = this.ink;
                ctx.fillRect(b.x, b.y, b.w, b.h);
                ctx.lineWidth = 2;
                ctx.strokeStyle = this.ink;
                ctx.strokeRect(b.x, b.y, b.w, b.h);
                ctx.fillStyle = this.t.color.paper;
            }
            else {
                ctx.globalAlpha = on ? 0.62 : 0.35;
                ctx.fillStyle = this.t.color.paper;
                ctx.fillRect(b.x, b.y, b.w, b.h);
                if (a > 0.01) {
                    ctx.globalAlpha = 0.08 * a;
                    ctx.fillStyle = this.ink;
                    ctx.fillRect(b.x, b.y, b.w, b.h);
                }
                ctx.globalAlpha = on ? 0.55 + 0.45 * a : 1;
                ctx.lineWidth = 1.5 + a * 0.8;
                ctx.strokeStyle = on ? this.ink : this.t.color.disabled;
                ctx.strokeRect(b.x, b.y, b.w, b.h);
                ctx.globalAlpha = 1;
                if (b.accent) {
                    ctx.fillStyle = b.accent;
                    ctx.fillRect(b.x, b.y, 4, b.h);
                } // identity bar (e.g. enemy kind colour)
                if (a > 0.01) {
                    ctx.globalAlpha = a;
                    ctx.fillStyle = this.t.color.accent;
                    ctx.fillRect(b.x, b.y, b.accent ? 4 : 3, b.h);
                    ctx.globalAlpha = 1;
                }
                ctx.fillStyle = on ? this.ink : this.t.color.disabled;
            }
            // optional trimmings (parity with the ghost style): b.glyph = left icon
            // slot, b.sub = caption subline, b.pips = {n, filled, color} right-aligned
            // level/heat meter; otherwise, text lays out left-aligned.
            const cy2 = b.y + b.h / 2;
            ctx.textBaseline = "middle";
            if (b.pips)
                this.pips(ctx, b.x + b.w - 14, cy2, b.pips.n, b.pips.filled, selected ? this.t.color.paper : b.pips.color);
            if (b.glyph || b.sub) {
                let lx2 = b.x + 16;
                if (b.glyph) {
                    ctx.globalAlpha = selected ? 1 : 0.55 + 0.45 * a;
                    ctx.fillStyle = selected ? this.t.color.paper : (truthyOr(b.accent, () => this.t.color.accent));
                    ctx.font = this.font(17, true);
                    ctx.textAlign = "left";
                    ctx.fillText(b.glyph, lx2, cy2 + 1);
                    ctx.globalAlpha = 1;
                    lx2 += 30;
                }
                ctx.fillStyle = selected ? this.t.color.paper : (on ? this.ink : this.t.color.disabled);
                ctx.font = this.font(truthyOr(b.size, () => this.t.type.lead), true);
                ctx.textAlign = "left";
                const rightReserve = b.pips ? 110 : 16;
                ctx.fillText(fitLine(ctx, b.label, b.x + b.w - lx2 - rightReserve), lx2, (b.sub ? cy2 - 9 : cy2) + 1);
                if (b.sub) {
                    ctx.globalAlpha = selected ? 0.75 : 0.55;
                    ctx.font = this.font(this.t.type.micro, false);
                    ctx.fillText(fitLine(ctx, b.sub, b.x + b.w - lx2 - rightReserve), lx2, cy2 + 12);
                    ctx.globalAlpha = 1;
                }
                ctx.textBaseline = "alphabetic";
                return;
            }
            ctx.font = this.font(truthyOr(b.size, () => this.t.type.lead), true);
            ctx.textAlign = "center";
            ctx.fillText(b.label, b.x + b.w / 2, cy2 + 1);
            ctx.textBaseline = "alphabetic";
        },
        // ---- CHIP (compact toggle: filters, segmented controls) -----------------
        chip(this: UiRuntime, ctx: CanvasRenderingContext2D, b: ButtonSpec, on: boolean) {
            ctx.lineWidth = on ? 2.5 : 1.5;
            ctx.strokeStyle = on ? this.ink : this.t.color.muted;
            ctx.fillStyle = on ? this.ink : this.t.color.paper;
            ctx.beginPath();
            ctx.rect(b.x, b.y, b.w, b.h);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = on ? this.t.color.paper : this.ink;
            ctx.font = this.font(truthyOr(b.size, () => this.t.type.micro), true);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
            ctx.textBaseline = "alphabetic";
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
        tabs(this: UiRuntime, ctx: CanvasRenderingContext2D, id: string, labels: string[], active: number, y: number, push?: (button: ButtonSpec) => void) {
            const t = this.t, cx = CONFIG.view.w / 2, h = 34;
            ctx.font = this.font(t.type.label, true);
            let segW = 150;
            for (const l of labels)
                segW = Math.max(segW, ctx.measureText(l).width + 48);
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
                ctx.font = this.font(t.type.label, true);
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(label, x0 + i * segW + segW / 2, y + h / 2);
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
                ctx.fillText("L1 ‹", x0 - 12, y + h / 2);
                ctx.textAlign = "left";
                ctx.fillText("› R1", x0 + total + 12, y + h / 2);
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

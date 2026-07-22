import type { Align, CardOptions, Rect, UiDependencies, UiRuntime } from "./ui-contracts";
import { truthyOr } from "./value-fallback";

export function createUiLedger(dependencies: UiDependencies) {
  const { CONFIG } = dependencies;
  return {
keycap(this: UiRuntime, ctx: CanvasRenderingContext2D, key: string, x: number, y: number) {
            ctx.font = this.font(this.t.type.micro, true);
            const w = Math.max(26, ctx.measureText(key).width + 14), h = 22;
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = this.t.color.paper;
            ctx.fillRect(x, y - h + 5, w, h);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = this.ink;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x, y - h + 5, w, h);
            ctx.fillStyle = this.ink;
            ctx.fillRect(x, y + 3, w, 2); // key-cap "depth" lip
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            ctx.fillText(key, x + w / 2, y);
            ctx.textAlign = "left";
            return w;
        },
        // a BADGE: small filled pill with paper text ("✦ SPECIAL", "FELLED ×214").
        // align "left"|"right"|"center" anchors it; returns the pill width.
        badge(this: UiRuntime, ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color?: string, align?: Align, size?: number) {
            ctx.font = this.font(truthyOr(size, () => this.t.type.micro), true);
            const w = ctx.measureText(text).width + 14, h = (truthyOr(size, () => this.t.type.micro)) + 8;
            const bx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
            ctx.fillStyle = truthyOr(color, () => this.t.color.accent);
            ctx.fillRect(bx, y - h + 4, w, h);
            ctx.fillStyle = this.t.color.paper;
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            ctx.fillText(text, bx + w / 2, y);
            ctx.textAlign = "left";
            return w;
        },
        // the ROTATE GATE: full-screen block shown on touch devices in portrait —
        // the arena is wide, so gameplay pauses and this asks for landscape. Drawn in
        // its own upscaled space (sr.w/460) because in portrait the logical view is
        // scaled tiny; without the upscale the gate itself would be microscopic.
        rotateGate(this: UiRuntime, ctx: CanvasRenderingContext2D, sr: Rect, t: number) {
            ctx.save();
            ctx.fillStyle = "#06070c";
            ctx.globalAlpha = 0.97;
            ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
            ctx.globalAlpha = 1;
            const k = sr.w / 460;
            ctx.translate(sr.x + sr.w / 2, sr.y + sr.h / 2);
            ctx.scale(k, k);
            // the phone glyph, easing portrait -> landscape and holding, on a loop
            const ph = (t % 2.6) / 2.6;
            const rot = ph < 0.35 ? 0 : ph < 0.6 ? ((ph - 0.35) / 0.25) * (Math.PI / 2) : Math.PI / 2;
            ctx.save();
            ctx.translate(0, -46);
            ctx.rotate(-rot);
            ctx.strokeStyle = "#f1eff9";
            ctx.lineWidth = 4;
            ctx.strokeRect(-26, -46, 52, 92);
            ctx.fillStyle = this.t.color.accent;
            ctx.fillRect(-8, 34, 16, 4); // home bar
            ctx.restore();
            ctx.fillStyle = "#f1eff9";
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            ctx.font = this.font(26, true);
            ctx.fillText("ROTATE YOUR DEVICE", 0, 46);
            ctx.globalAlpha = 0.65;
            ctx.font = this.font(13, false);
            ctx.fillText("the blade needs the wide view — TEAR plays in landscape", 0, 72);
            ctx.globalAlpha = 1;
            ctx.restore();
            ctx.textAlign = "left";
        },
        // the player AVATAR: a framed portrait of the fighter — ink silhouette with
        // its blade mid-slash. Procedural; scales with s (box side).
        avatar(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
            ctx.save();
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = this.t.color.paper;
            ctx.fillRect(x, y, s, s);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = this.ink;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x, y, s, s);
            const px = x + s * 0.34, py = y + s * 0.30, pw = s * 0.26, ph = s * 0.44;
            ctx.fillStyle = this.ink;
            ctx.fillRect(px, py, pw, ph); // the fighter
            ctx.fillStyle = this.t.color.accent;
            ctx.fillRect(px + pw * 0.55, py + ph * 0.26, pw * 0.24, ph * 0.13); // the eye
            ctx.strokeStyle = this.ink;
            ctx.lineWidth = Math.max(2, s * 0.05);
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(px + pw + s * 0.05, py + ph * 0.55); // the blade, mid-slash
            ctx.lineTo(x + s * 0.88, y + s * 0.14);
            ctx.stroke();
            ctx.strokeStyle = this.t.color.accent;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.moveTo(px + pw + s * 0.02, py + ph * 0.62);
            ctx.lineTo(x + s * 0.82, y + s * 0.22);
            ctx.stroke();
            ctx.restore();
        },
        // a section label + hairline that RESERVES its vertical space (returns the y
        // content should start at) — so labels can never collide with what follows.
        sectionLabel(this: UiRuntime, ctx: CanvasRenderingContext2D, label: string, x: number, y: number, w: number, hue?: string) {
            this.tag(ctx, label.toUpperCase(), x, y, truthyOr(hue, () => this.t.color.accent), "left", this.t.type.micro);
            ctx.font = this.font(this.t.type.micro, true);
            const lw = ctx.measureText(label.toUpperCase()).width;
            this.divider(ctx, x + lw + 12, y - 4, w - lw - 12, 0.14);
            return y + 18;
        },
        // a designed empty state: big ghost glyph + one-liner (+ optional CTA the
        // caller registers as a button and passes for placement). Centred in a zone.
        emptyState(this: UiRuntime, ctx: CanvasRenderingContext2D, glyph: string, line: string, cx: number, cy: number) {
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            ctx.globalAlpha = 0.09;
            ctx.fillStyle = this.ink;
            ctx.font = this.font(56, true);
            ctx.fillText(glyph, cx, cy);
            ctx.globalAlpha = 1;
            this.text(ctx, line, cx, cy + 36, this.t.type.body, "center", this.t.alpha.soft);
            return cy + 60; // y for an optional CTA button under the line
        },
        // ---- SURFACES -----------------------------------------------------------
        // THE SHEET: the content surface every sub-screen sits on — a calm paper zone
        // over the live attract scene (soft shadow, wash, hairline frame, and a
        // signature-hue top edge that gives each screen its identity).
        // Standard geometry: UI.sheetRect() so every screen wraps identically.
        sheetRect(this: UiRuntime) {
            const vw = CONFIG.view.w, vh = CONFIG.view.h;
            return { x: vw / 2 - 620, y: 44, w: 1240, h: vh - 80 };
        },
        sheet(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hue?: string) {
            ctx.save();
            ctx.globalAlpha = 0.10;
            ctx.fillStyle = "#0a0b10"; // soft drop shadow
            ctx.fillRect(x + 6, y + 8, w, h);
            ctx.globalAlpha = 0.62;
            ctx.fillStyle = this.t.color.paper; // the paper surface
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = 0.22;
            ctx.strokeStyle = this.ink;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); // hairline frame
            ctx.globalAlpha = 1;
            ctx.fillStyle = truthyOr(hue, () => this.t.color.accent); // signature top edge
            ctx.fillRect(x, y, w, 3);
            ctx.restore();
        },
        // a plain bordered panel
        panel(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
            ctx.fillStyle = this.t.color.paper;
            ctx.strokeStyle = this.ink;
            ctx.lineWidth = 2;
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        },
        // an interactive card: panel + hover emphasis (inner wash + thicker border).
        // opts: { dashed } = an "unfilled socket" (greyed paper + dashed hairline, for
        // locked content); { edge } = coloured identity border (e.g. rarity);
        // { shimmer } = 0..1 phase for a slow highlight sweep along the top edge.
        card(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hovered?: boolean, opts?: CardOptions) {
            if (opts?.dashed) {
                ctx.globalAlpha = 0.45;
                ctx.fillStyle = this.t.color.paper;
                ctx.fillRect(x, y, w, h);
                ctx.globalAlpha = 0.04;
                ctx.fillStyle = this.ink;
                ctx.fillRect(x, y, w, h);
                ctx.globalAlpha = 1;
                ctx.setLineDash([5, 4]);
                ctx.strokeStyle = "rgba(90,92,108,0.5)";
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x, y, w, h);
                ctx.setLineDash([]);
            }
            else {
                this.panel(ctx, x, y, w, h);
                if (opts?.edge) {
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = opts.edge;
                    ctx.strokeRect(x, y, w, h);
                }
            }
            if (opts?.shimmer != null) { // a bright segment sweeping the top edge
                const sw = w * 0.22, sx = x + (w + sw) * opts.shimmer - sw;
                const g = ctx.createLinearGradient(sx, 0, sx + sw, 0);
                g.addColorStop(0, "rgba(255,240,190,0)");
                g.addColorStop(0.5, "rgba(255,240,190,0.9)");
                g.addColorStop(1, "rgba(255,240,190,0)");
                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y - 1, w, 4);
                ctx.clip();
                ctx.fillStyle = g;
                ctx.fillRect(x, y - 1, w, 4);
                ctx.restore();
            }
            if (hovered) {
                ctx.globalAlpha = 0.05;
                ctx.fillStyle = this.ink;
                ctx.fillRect(x, y, w, h);
                ctx.globalAlpha = 1;
                ctx.lineWidth = 3;
                ctx.strokeStyle = this.ink;
                ctx.strokeRect(x, y, w, h);
            }
        },
        // a SEAL: filled diamond badge with a glyph (rarity/category marks). muted =
        // the locked look (outline + grey glyph).
        seal(this: UiRuntime, ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, glyph: string, muted?: boolean) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(Math.PI / 4);
            if (muted) {
                ctx.strokeStyle = "rgba(140,142,156,0.5)";
                ctx.lineWidth = 1.5;
                ctx.strokeRect(-r, -r, r * 2, r * 2);
            }
            else {
                ctx.fillStyle = color;
                ctx.fillRect(-r, -r, r * 2, r * 2);
            }
            ctx.restore();
            ctx.fillStyle = muted ? "rgba(140,142,156,0.55)" : this.t.color.paper;
            ctx.font = this.font(Math.round(r * 0.95), true);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(glyph, cx, cy + 1);
            ctx.textBaseline = "alphabetic";
            ctx.textAlign = "left";
        },
        // a vertical identity bar down a card's left edge (rarity ribbon, mode spine)
        spine(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color?: string, w?: number) {
            ctx.fillStyle = color ?? this.t.color.accent;
            ctx.fillRect(x, y, truthyOr(w, () => 4), h);
        },
        // a rotated ink stamp ("✓ DONE") — the ledger's approval mark
        stamp(this: UiRuntime, ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color?: string) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-0.10);
            ctx.font = this.font(this.t.type.body, true);
            const w = ctx.measureText(text).width + 20;
            const stampColor = color ?? this.t.color.accent;
            ctx.globalAlpha = 0.9;
            ctx.strokeStyle = stampColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(-w / 2, -15, w, 30);
            ctx.fillStyle = stampColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, 0, 1);
            ctx.restore();
            ctx.globalAlpha = 1;
            ctx.textBaseline = "alphabetic";
            ctx.textAlign = "left";
        },
        // a coloured accent strip along the top of a surface (card category cue)
        accentStrip(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color?: string, thick?: number) {
            ctx.fillStyle = color ?? this.t.color.accent;
            ctx.fillRect(x, y, w, truthyOr(thick, () => 6));
        },
        // a thin divider line
        divider(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, w: number, alpha?: number) {
            ctx.globalAlpha = alpha ?? this.t.alpha.faint;
            ctx.strokeStyle = this.ink;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + w, y);
            ctx.stroke();
            ctx.globalAlpha = 1;
        },
        // ---- BAR (progress / HP / meter) ----------------------------------------
        bar(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, fill?: string, line?: string) {
            ctx.strokeStyle = truthyOr(line, () => this.ink);
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = truthyOr(fill, () => this.ink);
            ctx.fillRect(x, y, w * Math.max(0, Math.min(frac, 1)), h);
        },
        // Recoverable-health segment for Aldric's rally window. Call after the base
        // health fill so the orange wound sits between current and recoverable HP.
        // `hpFrac` and `rallyFrac` are independently expressed against max health.
  };
}

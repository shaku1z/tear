import type { Align, CardOptions, UiDependencies, UiRuntime } from "./ui-contracts";
import { truthyOr } from "./value-fallback";

/** The wide compact sheet: inset from the safe frame's sides, and from its top and bottom. */
const COMPACT_SHEET_INSET = 40,
  COMPACT_SHEET_TOP = 20;
/** The authored key-cap height; the taller phone cap centres its label instead of keeping the authored baseline. */
const KEYCAP_AUTHORED_H = 22;

export function createUiLedger(dependencies: UiDependencies) {
  const {
    presentation: { view },
  } = dependencies;
  return {
    /** The size `keycap` draws for this key (sets the key font on `ctx`). */
    keycapSize(this: UiRuntime, ctx: CanvasRenderingContext2D, key: string) {
      ctx.font = this.font(this.t.type.micro, true);
      // The cap grows with the type token, so touch density never overfills it.
      const h = Math.max(KEYCAP_AUTHORED_H, Math.round(this.t.type.micro * 1.7));
      return { w: Math.max(h + 4, ctx.measureText(key).width + 14), h };
    },
    keycap(this: UiRuntime, ctx: CanvasRenderingContext2D, key: string, x: number, y: number) {
      const { w, h } = this.keycapSize(ctx, key);
      // The phone cap is twice the authored height: its label is centred rather than left on the authored baseline.
      const lift = this.density.compact ? Math.round((h - KEYCAP_AUTHORED_H) / 2) : 0;
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
      ctx.fillText(key, x + w / 2, y - lift);
      ctx.textAlign = "left";
      return w;
    },
    // a BADGE: small filled pill with paper text ("✦ SPECIAL", "FELLED ×214").
    // align "left"|"right"|"center" anchors it; returns the pill width.
    badge(
      this: UiRuntime,
      ctx: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      color?: string,
      align?: Align,
      size?: number,
    ) {
      ctx.font = this.font(
        truthyOr(size, () => this.t.type.micro),
        true,
      );
      const w = ctx.measureText(text).width + 14,
        h = truthyOr(size, () => this.t.type.micro) + 8;
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
      const px = x + s * 0.34,
        py = y + s * 0.3,
        pw = s * 0.26,
        ph = s * 0.44;
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
    sectionLabel(
      this: UiRuntime,
      ctx: CanvasRenderingContext2D,
      label: string,
      x: number,
      y: number,
      w: number,
      hue?: string,
    ) {
      this.tag(
        ctx,
        label.toUpperCase(),
        x,
        y,
        this.readable(truthyOr(hue, () => this.t.color.accent)),
        "left",
        this.t.type.micro,
      );
      ctx.font = this.font(this.t.type.micro, true);
      const lw = ctx.measureText(label.toUpperCase()).width;
      this.divider(ctx, x + lw + 12, y - 4, w - lw - 12, 0.14);
      return y + 18;
    },
    // a designed empty state: big ghost glyph + one-liner (+ optional CTA the
    // caller registers as a button and passes for placement). Centred in a zone.
    // `detail` is an optional muted explanation wrapped to `width` under the line.
    emptyState(
      this: UiRuntime,
      ctx: CanvasRenderingContext2D,
      glyph: string,
      line: string,
      cx: number,
      cy: number,
      detail?: string,
      width = 640,
    ) {
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = this.ink;
      ctx.font = this.font(56, true);
      ctx.fillText(glyph, cx, cy);
      ctx.globalAlpha = 1;
      this.displayText(ctx, line, cx, cy + 40, this.t.type.lead, "center");
      let bottom = cy + 40;
      if (detail) {
        const box = this.fitText(ctx, detail, width, {
          size: this.t.type.body,
          floor: this.t.type.caption,
          maxLines: 3,
        });
        ctx.save();
        ctx.globalAlpha = this.t.alpha.muted;
        ctx.fillStyle = this.ink;
        ctx.font = this.font(box.size, false);
        box.lines.forEach((text, index) => {
          ctx.fillText(text, cx, cy + 70 + index * 22);
        });
        ctx.restore();
        bottom = cy + 70 + (box.lines.length - 1) * 22;
      }
      return bottom + 28; // y for an optional CTA button under the copy
    },
    // ---- SURFACES -----------------------------------------------------------
    // THE SHEET: the content surface every sub-screen sits on — a calm paper zone
    // over the live attract scene (soft shadow, wash, hairline frame, and a
    // signature-hue top edge that gives each screen its identity).
    // Standard geometry: UI.sheetRect() so every screen wraps identically.
    sheetRect(this: UiRuntime) {
      const vw = view.w,
        vh = view.h;
      // A phone composition (compact density) spends the whole safe frame on its page.
      if (this.density.wideSheet)
        return {
          x: COMPACT_SHEET_INSET,
          y: COMPACT_SHEET_TOP,
          w: vw - COMPACT_SHEET_INSET * 2,
          h: vh - COMPACT_SHEET_TOP * 2,
        };
      return { x: vw / 2 - 620, y: 44, w: 1240, h: vh - 80 };
    },
    // The sheet's footer row (BACK sits centred in it): the single owner of its geometry.
    sheetFooter(this: UiRuntime) {
      const sheet = this.sheetRect(),
        m = this.t.metric;
      return { y: sheet.y + sheet.h - m.btnH - 12, h: m.btnH, backX: view.w / 2 - m.backW / 2 };
    },
    sheet(this: UiRuntime, ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hue?: string) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = "#0a0b10"; // soft drop shadow
      ctx.fillRect(x + 6, y + 8, w, h);
      ctx.globalAlpha = this.t.alpha.sheet;
      ctx.fillStyle = this.t.color.paper; // the paper surface: effectively solid so scene art never fights text
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = "#0a0b10";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); // hairline frame
      ctx.globalAlpha = 1;
      const signature = truthyOr(hue, () => this.t.color.accent);
      ctx.fillStyle = signature; // signature top edge
      ctx.fillRect(x, y, w, 4);
      // Registration marks make the surface read like a deliberate field sheet,
      // not a generic translucent modal. They stay outside the content rhythm.
      const mark = 16;
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = this.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + mark, y + 14);
      ctx.lineTo(x + mark, y + 28);
      ctx.moveTo(x + 10, y + 20);
      ctx.lineTo(x + 24, y + 20);
      ctx.moveTo(x + w - mark, y + h - 14);
      ctx.lineTo(x + w - mark, y + h - 28);
      ctx.moveTo(x + w - 10, y + h - 20);
      ctx.lineTo(x + w - 24, y + h - 20);
      ctx.stroke();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = signature;
      ctx.fillRect(x + 34, y + h - 18, Math.min(180, w * 0.16), 2);
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
    card(
      this: UiRuntime,
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      hovered?: boolean,
      opts?: CardOptions,
    ) {
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
      } else {
        this.panel(ctx, x, y, w, h);
        if (opts?.edge) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = opts.edge;
          ctx.strokeRect(x, y, w, h);
        }
      }
      if (opts?.shimmer != null) {
        // a bright segment sweeping the top edge
        const sw = w * 0.22,
          sx = x + (w + sw) * opts.shimmer - sw;
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
    seal(
      this: UiRuntime,
      ctx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      r: number,
      color: string,
      glyph: string,
      muted?: boolean,
    ) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      if (muted) {
        ctx.strokeStyle = "rgba(140,142,156,0.5)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-r, -r, r * 2, r * 2);
      } else {
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
      ctx.fillRect(
        x,
        y,
        truthyOr(w, () => 4),
        h,
      );
    },
    // a rotated ink stamp ("✓ DONE") — the ledger's approval mark
    stamp(this: UiRuntime, ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color?: string) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.1);
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
    accentStrip(
      this: UiRuntime,
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      color?: string,
      thick?: number,
    ) {
      ctx.fillStyle = color ?? this.t.color.accent;
      ctx.fillRect(
        x,
        y,
        w,
        truthyOr(thick, () => 6),
      );
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
    bar(
      this: UiRuntime,
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      frac: number,
      fill?: string,
      line?: string,
    ) {
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

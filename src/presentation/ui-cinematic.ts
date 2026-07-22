import type { Align, UiDependencies, UiOptions, UiRuntime } from "./ui-contracts";
import { truthyOr } from "./value-fallback";

export function createUiCinematic(dependencies: UiDependencies) {
  const { CLOCK, CONFIG, clamp } = dependencies;
  return {
rallyOverlay(this: UiRuntime, ctx: CanvasRenderingContext2D, opts?: UiOptions) {
            const o = truthyOr<UiOptions>(opts, () => ({})), t = this.t, m = t.metric, a = t.alpha;
            const x = Number(o.x) || 0, y = Number(o.y) || 0;
            const w = Math.max(0, Number(o.w) || 0), h = Math.max(0, Number(o.h) || 0);
            const hp = Math.max(0, Math.min(Number(o.hpFrac) || 0, 1));
            const end = Math.max(hp, Math.min(hp + Math.max(0, Number(o.rallyFrac) || 0), 1));
            const segmentW = w * (end - hp);
            if (segmentW <= 0 || h <= 0)
                return 0;
            const now = Number.isFinite(Number(o.time)) ? Number(o.time) : 0;
            const wave = 0.5 + 0.5 * Math.sin(now * t.motion.rallyPulse);
            const inset = Math.min(m.rallyInset, h / 2);
            ctx.save();
            ctx.globalAlpha = a.rallyBase + a.rallyPulse * wave;
            ctx.fillStyle = truthyOr(o.color, () => t.color.rally);
            ctx.fillRect(x + w * hp, y + inset, segmentW, h - inset * 2);
            ctx.restore();
            return segmentW;
        },
        // ---- BOSS THEATER -------------------------------------------------------
        // The complete boss health surface: segmented HP, phase thresholds, a quiet
        // moving sheen, the phase-turn crack, and an optional posture/guard meter.
        bossHud(this: UiRuntime, ctx: CanvasRenderingContext2D, opts?: UiOptions) {
            const o = truthyOr<UiOptions>(opts, () => ({})), t = this.t, m = t.metric, a = t.alpha;
            const x = Number(o.x) || 0, y = Number(o.y) || 0;
            const w = Math.max(0, Number(o.w) || 0), h = Math.max(1, Number(o.h) || m.bossHudH);
            const frac = Math.max(0, Math.min(Number(o.frac) || 0, 1));
            const fill = truthyOr(o.fill, () => t.color.danger), fillW = w * frac;
            const now = Number.isFinite(Number(o.time)) ? Number(o.time) : 0;
            const low = !!o.lowGraphics;
            ctx.save();
            // Track + identity fill.
            ctx.globalAlpha = a.bossTrack;
            ctx.fillStyle = this.ink;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = a.full;
            if (!low) {
                ctx.shadowColor = fill;
                ctx.shadowBlur = m.bossGlow;
            }
            ctx.fillStyle = fill;
            ctx.fillRect(x, y, fillW, h);
            ctx.shadowBlur = 0;
            // A restrained light sweep keeps the bar alive without competing with combat.
            if (!low && fillW > 0 && m.bossShimmerW > 0) {
                const cycle = t.motion.bossShimmerCycle;
                const phase = cycle > 0 ? ((now % cycle) + cycle) % cycle / cycle : 0;
                const sw = Math.min(m.bossShimmerW, Math.max(fillW, 1));
                const sx = x - sw + (fillW + sw * 2) * phase;
                const sheen = ctx.createLinearGradient(sx, 0, sx + sw, 0);
                sheen.addColorStop(0, "transparent");
                sheen.addColorStop(0.5, t.color.paper);
                sheen.addColorStop(1, "transparent");
                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y, fillW, h);
                ctx.clip();
                ctx.globalAlpha = a.ghost;
                ctx.fillStyle = sheen;
                ctx.fillRect(sx, y, sw, h);
                ctx.restore();
            }
            // Phase change: a brief white strike through the remaining health edge.
            const flash = Math.max(0, Number(o.phaseFlash) || 0);
            const flashK = Math.min(flash / t.motion.bossPhaseFlash, 1);
            if (flashK > 0) {
                ctx.globalAlpha = flashK * a.bossFlash;
                ctx.fillStyle = t.color.paper;
                ctx.fillRect(x, y, fillW, h);
                const j = m.bossCrackJut;
                const crackX = Math.max(x + j, Math.min(x + w - j, x + fillW));
                ctx.globalAlpha = flashK;
                ctx.strokeStyle = t.color.paper;
                ctx.lineWidth = m.bossBorderW;
                ctx.beginPath();
                ctx.moveTo(crackX - j * 0.20, y - m.bossBorderW);
                ctx.lineTo(crackX + j * 0.35, y + h * 0.34);
                ctx.lineTo(crackX - j * 0.25, y + h * 0.64);
                ctx.lineTo(crackX + j * 0.20, y + h + m.bossBorderW);
                ctx.stroke();
            }
            // Segments and future phase thresholds remain readable over every boss colour.
            ctx.globalAlpha = a.faint;
            ctx.strokeStyle = this.ink;
            ctx.lineWidth = 1;
            for (let i = 1; i < m.bossSegments; i++) {
                const sx = x + w * i / m.bossSegments;
                ctx.beginPath();
                ctx.moveTo(sx, y);
                ctx.lineTo(sx, y + h);
                ctx.stroke();
            }
            const marks = Array.isArray(o.phaseMarks) ? o.phaseMarks : [];
            ctx.globalAlpha = a.bossNotch;
            ctx.lineWidth = m.bossBorderW;
            for (const mark of marks) {
                const f = mark;
                if (!Number.isFinite(f) || f <= 0 || f >= 1)
                    continue;
                const mx = x + w * f;
                ctx.beginPath();
                ctx.moveTo(mx, y + h);
                ctx.lineTo(mx, y + h + m.bossNotchH);
                ctx.stroke();
            }
            ctx.globalAlpha = a.full;
            ctx.strokeStyle = this.ink;
            ctx.lineWidth = m.bossBorderW;
            ctx.strokeRect(x, y, w, h);
            // Guard may be a plain 0..1 number or {frac,color}; the object form leaves
            // room for a future boss-specific posture colour without another API.
            let guard = null, guardColor = t.color.guard;
            if (typeof o.guard === "number")
                guard = o.guard;
            else if (o.guard && typeof o.guard === "object") {
                guard = o.guard.frac;
                guardColor = truthyOr(o.guard.color, () => guardColor);
            }
            let bottom = y + h + m.bossNotchH;
            if (typeof guard === "number" && Number.isFinite(guard)) {
                const gf = Math.max(0, Math.min(guard, 1));
                const gw = w * m.bossGuardScale, gx = x + (w - gw) / 2, gy = y + h + m.bossGuardGap;
                ctx.globalAlpha = a.bossGuardTrack;
                ctx.fillStyle = this.ink;
                ctx.fillRect(gx, gy, gw, m.bossGuardH);
                ctx.globalAlpha = a.full;
                ctx.fillStyle = guardColor;
                ctx.fillRect(gx, gy, gw * gf, m.bossGuardH);
                if (guard >= 1) {
                    const pulse = 0.5 + 0.5 * Math.sin(now * t.motion.bossGuardPulse);
                    ctx.globalAlpha = a.faint + a.faint * pulse;
                    ctx.fillRect(gx, gy, gw, m.bossGuardH);
                }
                ctx.globalAlpha = a.faint;
                ctx.strokeStyle = this.ink;
                ctx.lineWidth = 1;
                ctx.strokeRect(gx, gy, gw, m.bossGuardH);
                bottom = gy + m.bossGuardH;
            }
            ctx.restore();
            return bottom;
        },
        // Arrival ceremony: overscan-safe letterbox, radial vignette, name, identity
        // stroke, and lore epithet. `t` is elapsed real time, not simulation time.
        bossIntro(this: UiRuntime, ctx: CanvasRenderingContext2D, opts?: UiOptions) {
            const o = truthyOr<UiOptions>(opts, () => ({})), t = this.t, m = t.metric, a = t.alpha, motion = t.motion;
            const fallbackW = CONFIG.view.w;
            const fallbackH = CONFIG.view.h;
            const sr = truthyOr(o.screen, () => ({ x: 0, y: 0, w: fallbackW, h: fallbackH }));
            const vw = fallbackW, vh = fallbackH, cx = vw / 2;
            const elapsed = Math.max(0, Number(o.t) || 0), dur = Math.max(Number(o.dur) || 1.4, 0.001);
            const clamp01 = (n: number) => Math.max(0, Math.min(n, 1));
            const easeOut = (n: number) => { const k = clamp01(n); return 1 - (1 - k) * (1 - k); };
            const k = clamp01(elapsed / dur);
            const aIn = easeOut(elapsed / motion.bossIntroIn);
            const aOut = 1 - easeOut((k - motion.bossIntroOutAt) / motion.bossIntroOutSpan);
            const alpha = aIn * aOut;
            const barH = m.bossIntroBarH * aIn;
            const color = truthyOr(o.color, () => t.color.danger);
            ctx.save();
            // Vignette first, bars second: the bars retain a clean cinematic black.
            const inner = Math.min(vw, vh) * m.bossVignetteInner;
            const outer = Math.max(vw, vh) * m.bossVignetteOuter;
            const vignette = ctx.createRadialGradient(cx, vh * m.bossVignetteFocusY, inner, cx, vh * m.bossVignetteFocusY, outer);
            vignette.addColorStop(0, "transparent");
            vignette.addColorStop(1, t.color.cinema);
            ctx.globalAlpha = a.cinemaVignette * alpha;
            ctx.fillStyle = vignette;
            ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
            ctx.globalAlpha = a.cinemaBar * aOut;
            ctx.fillStyle = t.color.cinema;
            ctx.fillRect(sr.x, sr.y, sr.w, Math.max(0, barH - sr.y));
            const bottomY = vh - barH, screenBottom = sr.y + sr.h;
            ctx.fillRect(sr.x, bottomY, sr.w, Math.max(0, screenBottom - bottomY));
            // Card typography is intentionally fixed light-on-cinema, independent of biome ink.
            ctx.globalAlpha = alpha;
            ctx.fillStyle = t.color.cinemaInk;
            ctx.font = this.font(t.type.display, true);
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            ctx.fillText(truthyOr(o.bossName, () => "BOSS"), cx, vh - m.bossIntroTitleBottom);
            const accentK = easeOut((elapsed - motion.bossIntroAccentDelay) / motion.bossIntroAccentGrow);
            const accentW = m.bossIntroAccentHalfW * accentK;
            ctx.fillStyle = color;
            ctx.fillRect(cx - accentW, vh - m.bossIntroAccentBottom, accentW * 2, m.bossIntroAccentH);
            if (o.epithet) {
                ctx.globalAlpha = alpha * a.cinemaSubtitle;
                ctx.fillStyle = t.color.cinemaMuted;
                ctx.font = this.font(t.type.body, true);
                ctx.fillText(o.epithet, cx, vh - m.bossIntroEpithetBottom);
            }
            ctx.restore();
            return alpha;
        },
        // Screen-space phase title. The caller owns its clock and supplies a 0..1 alpha;
        // this component owns every visual detail so phase beats stay consistent.
        bossPhaseBanner(this: UiRuntime, ctx: CanvasRenderingContext2D, opts?: UiOptions) {
            const o = truthyOr<UiOptions>(opts, () => ({})), text = truthyOr(o.text, () => "");
            if (!text)
                return;
            const t = this.t, m = t.metric;
            const a = o.alpha == null ? 1 : Math.max(0, Math.min(o.alpha || 0, 1));
            const vw = CONFIG.view.w;
            const vh = CONFIG.view.h;
            const w = Math.min(m.bossPhaseBannerW, vw - t.space.xl * 2);
            const h = m.bossPhaseBannerH, x = (vw - w) / 2, y = vh * m.bossPhaseBannerY - h / 2;
            const color = truthyOr(o.color, () => t.color.danger);
            ctx.save();
            ctx.globalAlpha = a * t.alpha.bossPhasePanel;
            ctx.fillStyle = t.color.cinema;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = a;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, w, m.bossPhaseAccentH);
            ctx.fillRect(x, y + h - m.bossPhaseAccentH, w, m.bossPhaseAccentH);
            ctx.fillStyle = t.color.cinemaInk;
            ctx.font = this.font(t.type.h2, true);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, vw / 2, y + h / 2);
            ctx.restore();
        },
        // Shared cinematic chrome. Game code supplies only state; the design system
        // owns bars, vignette, accent seam and every screen-space measurement.
        cinematicFrame(this: UiRuntime, ctx: CanvasRenderingContext2D, opts?: UiOptions) {
            const o = truthyOr<UiOptions>(opts, () => ({})), t = this.t, m = t.metric, a = t.alpha;
            const fallbackW = CONFIG.view.w;
            const fallbackH = CONFIG.view.h;
            const sr = truthyOr(o.screen, () => ({ x: 0, y: 0, w: fallbackW, h: fallbackH }));
            const k = Math.max(0, Math.min(Number(o.amount) || 0, 1));
            const reduced = !!o.reducedMotion, barH = m.cinemaBarH * (reduced ? 1 : (1 - (1 - k) * (1 - k)));
            const color = truthyOr(o.color, () => t.color.accent);
            ctx.save();
            const vg = ctx.createRadialGradient(fallbackW / 2, fallbackH * 0.48, fallbackH * 0.20, fallbackW / 2, fallbackH * 0.48, fallbackW * 0.68);
            vg.addColorStop(0, "transparent");
            vg.addColorStop(1, t.color.cinema);
            ctx.globalAlpha = a.cinemaVignette * k;
            ctx.fillStyle = vg;
            ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
            ctx.globalAlpha = a.cinemaBar * k;
            ctx.fillStyle = t.color.cinema;
            ctx.fillRect(sr.x, sr.y, sr.w, Math.max(0, barH - sr.y));
            ctx.fillRect(sr.x, fallbackH - barH, sr.w, Math.max(0, sr.y + sr.h - (fallbackH - barH)));
            ctx.globalAlpha = k * a.soft;
            ctx.fillStyle = color;
            ctx.fillRect(sr.x, barH - m.bossPhaseAccentH, sr.w, m.bossPhaseAccentH);
            ctx.restore();
        },
        // Dialogue card for authored boss speech. Lines are intentionally concise;
        // wrapping lives here so no cinematic caller reaches into the canvas API.
        dialogueCard(this: UiRuntime, ctx: CanvasRenderingContext2D, opts?: UiOptions) {
            const o = truthyOr<UiOptions>(opts, () => ({})), t = this.t, m = t.metric, a = t.alpha;
            const vw = CONFIG.view.w;
            const vh = CONFIG.view.h;
            const k0 = Math.max(0, Math.min(Number(o.amount) || 0, 1));
            const k = 1 - (1 - k0) * (1 - k0), w = Math.min(m.cinemaDialogueW, vw - t.space.xl * 2);
            const h = m.cinemaDialogueH, x = (vw - w) / 2, y = vh - m.cinemaDialogueBottom - h + (1 - k) * t.space.lg;
            const color = truthyOr(o.color, () => t.color.accent), savedInk = this.ink;
            ctx.save();
            ctx.globalAlpha = k * a.cinemaPanel;
            ctx.fillStyle = t.color.cinema;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = k;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, m.bossPhaseAccentH, h);
            this.ink = t.color.cinemaInk;
            this.tag(ctx, truthyOr(o.speaker, () => ""), x + m.cinemaDialoguePad, y + t.space.lg, color, "left", t.type.caption);
            const allWords = truthyOr(o.line, () => "").split(/\s+/), reveal = o.reveal == null ? 1 : Math.max(0, Math.min(o.reveal || 0, 1));
            const words = allWords.slice(0, Math.max(1, Math.ceil(allWords.length * reveal))), maxW = w - m.cinemaDialoguePad * 2;
            ctx.font = this.font(t.type.lead, true);
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
            let line = "", yy = y + t.space.lg + t.type.lead + t.space.sm;
            for (const word of words) {
                const next = line ? line + " " + word : word;
                if (line && ctx.measureText(next).width > maxW) {
                    ctx.fillText(line, x + m.cinemaDialoguePad, yy);
                    line = word;
                    yy += t.type.lead + t.space.xs;
                }
                else
                    line = next;
            }
            if (line)
                ctx.fillText(line, x + m.cinemaDialoguePad, yy);
            // No countdown bar (it made every line read as disappearing). Instead: a small
            // continue chevron once the line is readable, a hold ring while a skip charges,
            // and an AUTO glyph only as a timed boss beat approaches its fallback.
            const cx = x + w - m.cinemaDialoguePad, cy = y + h - t.space.md;
            const hold = Math.max(0, Math.min(Number(o.holdRing) || 0, 1));
            if (hold > 0.01) {
                ctx.globalAlpha = k;
                ctx.strokeStyle = color;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(cx - 6, cy - 4, 9, -Math.PI / 2, -Math.PI / 2 + hold * Math.PI * 2);
                ctx.stroke();
            }
            else if (o.canAdvance) {
                const pulse = 0.55 + 0.45 * Math.sin((typeof CLOCK !== "undefined" ? CLOCK.sim : 0) * 6);
                ctx.globalAlpha = k * pulse;
                ctx.fillStyle = color;
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                ctx.font = this.font(t.type.body, true);
                ctx.fillText("›", cx, cy - 4);
            }
            if (o.auto) {
                ctx.globalAlpha = k * a.soft;
                this.tag(ctx, "AUTO", x + m.cinemaDialoguePad, y + h - t.space.sm, color, "left", t.type.micro);
            }
            if (o.hint)
                this.text(ctx, o.hint, x + w, y - t.space.sm, t.type.micro, "right", k * a.cinemaHint);
            this.ink = savedInk;
            ctx.restore();
        },
        // Boss transformation declaration (Pantheon VI P4): a spoken line anchored to a
        // corner of the frame instead of the universal bottom card, so each ritual's
        // world choreography owns the center. No full opaque panel — a soft local scrim
        // holds contrast. Same reading affordances (chevron / hold ring / AUTO) as the
        // dialogue card. `anchor`: lower-left | lower-right | upper-left | depth-center.
        bossDeclaration(this: UiRuntime, ctx: CanvasRenderingContext2D, o?: UiOptions) {
            o = truthyOr<UiOptions>(o, () => ({}));
            const t = this.t, vw = CONFIG.view.w, vh = CONFIG.view.h;
            const k = clamp(o.amount ?? 1, 0, 1), color = truthyOr(o.color, () => t.color.accent);
            const scale = clamp(vh / 900, 0.8, 1.4), SM = Math.max(t.chapter.safeMargin, vw * t.chapter.safeVW);
            const anchor = vw < 720 ? "lower-center" : (truthyOr(o.anchor, () => "lower-left")); // narrow screens fall back to a lower third
            const blockW = Math.min((truthyOr(o.maxWidth, () => 620)) * scale, vw - SM * 2);
            const speakerSize = Math.round(13 * scale), lineSize = Math.round(30 * scale), lineH = lineSize * 1.14;
            ctx.save();
            ctx.font = this.displayFont(lineSize);
            ctx.textBaseline = "alphabetic";
            const allWords = truthyOr(o.line, () => "").split(/\s+/).filter(Boolean);
            const reveal = o.reveal == null ? 1 : clamp(o.reveal, 0, 1);
            const words = allWords.slice(0, Math.max(1, Math.ceil(allWords.length * reveal)));
            const lines = [];
            let line = "";
            for (const wd of words) {
                const next = line ? line + " " + wd : wd;
                if (line && ctx.measureText(next).width > blockW) {
                    lines.push(line);
                    line = wd;
                }
                else
                    line = next;
            }
            if (line)
                lines.push(line);
            const blockH = speakerSize + t.space.md + lines.length * lineH;
            let x: number, y: number, align: Align;
            if (anchor === "lower-right") {
                x = vw - SM - blockW;
                align = "right";
                y = vh - SM - blockH;
            }
            else if (anchor === "upper-left") {
                x = SM;
                align = "left";
                y = SM * 1.4;
            }
            else if (anchor === "depth-center") {
                x = (vw - blockW) / 2;
                align = "left";
                y = vh * 0.28;
            }
            else if (anchor === "lower-center") {
                x = (vw - blockW) / 2;
                align = "left";
                y = vh - SM - blockH - vh * 0.06;
            }
            else {
                x = SM;
                align = "left";
                y = vh - SM - blockH;
            } // lower-left (default)
            const anchorX = align === "right" ? x + blockW : x;
            ctx.globalAlpha = k;
            const g = ctx.createLinearGradient(0, y - t.space.lg, 0, y + blockH + t.space.lg);
            g.addColorStop(0, "rgba(6,7,12,0)");
            g.addColorStop(0.5, "rgba(6,7,12,0.52)");
            g.addColorStop(1, "rgba(6,7,12,0)");
            ctx.fillStyle = g;
            ctx.fillRect(x - t.space.md, y - t.space.lg, blockW + t.space.lg, blockH + t.space.xl);
            ctx.fillStyle = color;
            ctx.fillRect(align === "right" ? anchorX - Math.min(blockW, 46 * scale) : anchorX, y - 3 * scale, Math.min(blockW, 46 * scale), 2 * scale);
            ctx.fillStyle = color;
            ctx.font = this.bodyFont(speakerSize, t.font.bodyMediumWeight);
            this.trackedText(ctx, truthyOr(o.speaker, () => ""), anchorX, y + speakerSize, t.track.label, align);
            ctx.fillStyle = "#f1eff9";
            ctx.font = this.displayFont(lineSize);
            ctx.textAlign = align;
            let yy = y + speakerSize + t.space.md + lineSize;
            for (const ln of lines) {
                ctx.fillText(ln, anchorX, yy);
                yy += lineH;
            }
            const cx = align === "right" ? anchorX - 10 : anchorX + 10, cy = yy - lineH + t.space.sm;
            const hold = clamp(Number(o.holdRing) || 0, 0, 1);
            if (hold > 0.01) {
                ctx.globalAlpha = k;
                ctx.strokeStyle = color;
                ctx.lineWidth = 2.5 * scale;
                ctx.beginPath();
                ctx.arc(cx, cy, 9 * scale, -Math.PI / 2, -Math.PI / 2 + hold * Math.PI * 2);
                ctx.stroke();
            }
            else if (o.canAdvance) {
                const pulse = 0.55 + 0.45 * Math.sin((typeof CLOCK !== "undefined" ? CLOCK.sim : 0) * 6);
                ctx.globalAlpha = k * pulse;
                ctx.fillStyle = color;
                ctx.textAlign = align;
                ctx.font = this.displayFont(Math.round(22 * scale));
                ctx.fillText("›", anchorX, yy + t.space.xs);
            }
            if (o.auto) {
                ctx.globalAlpha = k * t.alpha.soft;
                this.tag(ctx, "AUTO", anchorX, y - t.space.sm, color, align, t.type.micro);
            }
            ctx.restore();
        },
        // ---- LIVING BIOME CHAPTER (Pantheon VI) ---------------------------------
        // The world writes the chapter. No modal: a directional ink-wash on one side
        // makes negative space for a tracked label, a condensed display title, and a
        // readable mono lore column. Every component shares this one layout so the
        // header, lore, progress and prompt stay aligned, and the biome reveal is the
        // same composition breathing open.
  };
}

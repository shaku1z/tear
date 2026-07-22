import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { EnemyRendererRuntime } from "./enemy-renderer-runtime";
import type { RenderInstance } from "./enemy-renderer-types";

export function installSourceRenderer(types: EnemyTypes, runtime: EnemyRendererRuntime): void {
  const { CLOCK, CONFIG, THEME, UI, clamp, len, lerp, dangerColumn, dangerReticle, drawPeril, telegraphInk } = runtime;
  Object.assign(types.Source.prototype, {
        drawRear(this: RenderInstance<"Source">, ctx: CanvasRenderingContext2D) {
            if (this.depthPlane !== "rear" || this.dead) return;
            const C = CONFIG.source, t = CLOCK.sim * 1000, core = this.phaseMarker >= 3 ? CONFIG.colors.perfect : this.color;
            const pulse = 0.5 + 0.5 * Math.sin(t / 190), strike = this.depthState === "rearStrike" ? 1 : 0;
            ctx.save(); ctx.translate(this.rearX, this.rearY); ctx.scale(C.depthRearScale, C.depthRearScale);
            ctx.globalAlpha = C.depthRearAlpha + strike * 0.16;
            const halo = ctx.createRadialGradient(0, 0, 8, 0, 0, this.hw * 1.75);
            halo.addColorStop(0, "rgba(255,255,255,0.42)"); halo.addColorStop(0.18, core); halo.addColorStop(1, "rgba(20,8,42,0)");
            ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, this.hw * 1.75, 0, Math.PI * 2); ctx.fill();
            // A split horizon silhouette suggests shoulders and hands in a plane whose
            // scale cannot fit through the foreground breach.
            ctx.fillStyle = THEME.ink; ctx.globalAlpha = 0.24 + pulse * 0.09;
            ctx.beginPath(); ctx.moveTo(-this.hw * 2.2, this.hh * 0.8); ctx.quadraticCurveTo(-this.hw * 1.2, -this.hh * 1.0, 0, -this.hh * 0.62);
            ctx.quadraticCurveTo(this.hw * 1.2, -this.hh * 1.0, this.hw * 2.2, this.hh * 0.8); ctx.lineTo(0, this.hh * 1.28); ctx.closePath(); ctx.fill();
            for (let ring = 0; ring < 4; ring++) {
              ctx.save(); ctx.rotate(t / (1050 - ring * 130) * (ring % 2 ? -1 : 1));
              ctx.globalAlpha = 0.24 + ring * 0.07; ctx.strokeStyle = ring === 2 ? "#fff" : core; ctx.lineWidth = 1.4 + ring * 0.7;
              ctx.setLineDash([12 + ring * 3, 10 + ring * 2]); ctx.beginPath();
              ctx.ellipse(0, 0, this.hw * (0.7 + ring * 0.31), this.hh * (0.48 + ring * 0.18), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
            }
            ctx.setLineDash([]); ctx.globalAlpha = 0.72; ctx.fillStyle = "#fff";
            ctx.beginPath(); ctx.ellipse(0, 0, this.hw * (0.22 + pulse * 0.025), this.hh * 0.10, 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 0.9; ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, 6 + pulse * 4, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          },
        _drawDepthTelegraph(this: RenderInstance<"Source">, ctx: CanvasRenderingContext2D) {
            if (this.depthState !== "rearTell" && this.depthState !== "rearStrike") return;
            const C = CONFIG.source, core = CONFIG.colors.perfect;
            const tell = this.depthState === "rearTell" ? 1 - clamp(this.depthT / (this.depthMaxT || 1), 0, 1) : 1;
            const live = this.depthState === "rearStrike", pulse = 0.55 + 0.45 * Math.sin(CLOCK.sim * 24);
            ctx.save();
            if (this.depthKind === "spear") {
              ctx.strokeStyle = telegraphInk(core); ctx.lineCap = "round"; ctx.setLineDash(live ? [] : [16, 12]);
              ctx.globalAlpha = live ? 0.9 : 0.28 + tell * 0.5; ctx.lineWidth = live ? 10 : 2 + tell * 3;
              ctx.beginPath(); ctx.moveTo(this.rearX, this.rearY); ctx.lineTo(this.depthTargetX, this.depthTargetY); ctx.stroke(); ctx.setLineDash([]);
              dangerReticle(ctx, this.depthTargetX, this.depthTargetY, 18 + tell * 14, tell, core);
            } else {
              const width = this.depthKind === "hand" ? C.depthHandW : C.depthMawW;
              dangerColumn(ctx, this.depthTargetX, width, Math.max(0, this.depthTargetY - (this.depthKind === "hand" ? 260 : 120)), this.depthTargetY + 8, core, tell);
              if (live) {
                ctx.globalAlpha = 0.66 + pulse * 0.22; ctx.fillStyle = core;
                if (this.depthKind === "hand") {
                  ctx.fillRect(this.depthTargetX - width * 0.28, this.depthTargetY - 210, width * 0.56, 210);
                  for (let i = -2; i <= 2; i++) ctx.fillRect(this.depthTargetX + i * width * 0.11 - 6, this.depthTargetY - 245 - Math.abs(i) * 10, 12, 55);
                } else {
                  ctx.beginPath(); ctx.ellipse(this.depthTargetX, this.depthTargetY, width / 2, 38 + pulse * 12, 0, Math.PI, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.78;
                  for (let i = -4; i <= 4; i++) { const tx = this.depthTargetX + i * width / 10; ctx.beginPath(); ctx.moveTo(tx - 8, this.depthTargetY - 4); ctx.lineTo(tx, this.depthTargetY - 30 - (i % 2) * 8); ctx.lineTo(tx + 8, this.depthTargetY - 4); ctx.fill(); }
                }
              }
            }
            ctx.restore();
          },
        _drawSiphon(this: RenderInstance<"Source">, ctx: CanvasRenderingContext2D) {
            if (!this.siphon) return;
            const s = this.siphon, ex = this.depthPlane === "rear" ? this.rearX : this.x, ey = this.depthPlane === "rear" ? this.rearY : this.y;
            const k = clamp(s.t / s.maxT, 0, 1), pulse = 0.5 + 0.5 * Math.sin(CLOCK.sim * 34);
            ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = telegraphInk(CONFIG.colors.perfect);
            ctx.globalAlpha = 0.28 + pulse * 0.2; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.globalAlpha = 0.82; ctx.lineWidth = 2.5; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -CLOCK.sim * 90;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
            dangerReticle(ctx, lerp(s.x, ex, 0.5), lerp(s.y, ey, 0.5), 13 + (1 - k) * 8, pulse, CONFIG.colors.perfect);
            ctx.restore();
          },
        draw(this: RenderInstance<"Source">, ctx: CanvasRenderingContext2D) {
            if (this.depthPlane === "rear") {
              this._drawDepthTelegraph(ctx); this._drawSiphon(ctx);
              if (this.captionT > 0) UI.tag(ctx, this.echoCaption, this.rearX, this.rearY - this.hh * CONFIG.source.depthRearScale - 24, CONFIG.colors.perfect, "center", UI.t.type.caption);
              drawPeril(ctx, this); return;
            }
            const t = CLOCK.sim * 1000, x = this.x, y = this.y, w = this.hw, h = this.hh;
            const core = this.mode === "void" ? CONFIG.colors.perfect : this.color;
            const introP = this.introT > 0 ? clamp(1 - this.introT / ((CONFIG.bossTheater.introDur) || 1.4), 0, 1) : 1;
            const deathScale = this.dying ? Math.max(0.04, 1 - this.deathP * 0.92) : 1;
            const breachTellK = this.breachState === "tell" ? 1 - clamp(this.breachT / (this.breachMaxT || 1), 0, 1) : 0;
            const breachRecoilK = this.breachState === "recoil" ? clamp(this.breachT / (this.breachMaxT || 1), 0, 1) : 0;
            const breachA = Math.atan2(this.breachDY, this.breachDX);
            ctx.save();
            const targetScale = this.phase >= 2 || this.mode === "void" || this.mode === "downed" ? CONFIG.source.voidFormScale : 1;
            this.formScale = lerp(this.formScale, targetScale, 0.075);
            ctx.translate(x, y); ctx.scale(deathScale * this.formScale, deathScale * this.formScale);
            // Void wake: particles stream left as if the arena itself is being pulled in.
            for (let i = 0; i < 18; i++) {
              const a = i / 18 * Math.PI * 2 + t / (850 + i * 17), rr = w * (1.3 + (i % 4) * 0.22) * introP * (1 - breachTellK * 0.24);
              ctx.globalAlpha = 0.15 + (i % 3) * 0.06; ctx.fillStyle = i % 3 ? core : THEME.ink;
              ctx.fillRect(Math.cos(a) * rr - (this.mode === "void" ? 22 : 0), Math.sin(a) * rr, 8 + (i % 4) * 3, 3);
            }
            // Three counter-rotating shard rings make every stolen cast feel housed in a
            // single impossible body rather than a generic caster silhouette.
            const motion = clamp(len(this.vx || 0, this.vy || 0) / 1400, 0, 0.28);
            const attackContract = this.dashState === "wind" || this.collapseState === "wind" || this.beamState === "tell" ? 0.18 : 0;
            ctx.save(); ctx.rotate(breachA);
            ctx.transform(1 + motion - breachTellK * 0.22, breachRecoilK * 0.18, -breachRecoilK * 0.08, 1 - motion * 0.42 + breachTellK * 0.10, -breachRecoilK * 12, 0);
            ctx.rotate(-breachA);
            for (let ring = 0; ring < 3; ring++) {
              const rr = w * (0.58 + ring * 0.34) * introP * (1 - attackContract),
                desync = this.stun > 0 ? Math.sin(t / (43 + ring * 19)) * (0.22 + ring * 0.08) : 0,
                spin = t / (620 - ring * 120) * (ring % 2 ? -1 : 1) + desync;
              ctx.save(); ctx.rotate(spin); ctx.strokeStyle = ring === 1 ? core : THEME.ink; ctx.lineWidth = 2 + ring;
              ctx.globalAlpha = 0.55 + ring * 0.12;
              const n = 7 + ring * 3;
              for (let i = 0; i < n; i++) {
                const a = i / n * Math.PI * 2, px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.78;
                ctx.save(); ctx.translate(px, py); ctx.rotate(a + Math.PI / 4);
                ctx.beginPath(); ctx.moveTo(-8 - ring * 2, 0); ctx.lineTo(0, -4 - ring); ctx.lineTo(11 + ring * 2, 0); ctx.lineTo(0, 4 + ring); ctx.closePath(); ctx.stroke(); ctx.restore();
              }
              ctx.restore();
            }
            ctx.restore();
            const cr = w * 0.36 * (0.82 + 0.18 * Math.sin(t / 100));
            const coreLean = breachTellK * 18 - breachRecoilK * 10;
            const coreX = this.breachDX * coreLean, coreY = this.breachDY * coreLean;
            ctx.globalAlpha = 0.95; ctx.fillStyle = core; ctx.beginPath(); ctx.arc(coreX, coreY, cr, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = this.dying ? this.deathP : 0.78; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(coreX, coreY, cr * (this.dying ? 1.8 : 0.46), 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            // SOFT BREACH: the thin captured line and two anchors communicate where the
            // Source committed. They never chase a player who changes direction mid-tell.
            if (this.breachState === "tell") {
              const k = breachTellK, pulse = 0.55 + 0.45 * Math.sin(k * Math.PI * 5);
              ctx.save(); ctx.strokeStyle = core; ctx.lineCap = "round";
              ctx.globalAlpha = 0.22 + 0.35 * k; ctx.lineWidth = 2.2; ctx.setLineDash([12, 10]);
              ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.breachDestX, this.breachDestY); ctx.stroke();
              ctx.setLineDash([]); ctx.globalAlpha = 0.45 + 0.35 * k;
              ctx.beginPath(); ctx.arc(this.breachCommitX, this.breachCommitY, 10 + 13 * k, 0, Math.PI * 2); ctx.stroke();
              ctx.globalAlpha = 0.5 + 0.4 * pulse; ctx.lineWidth = 3;
              const tx = this.breachDestX, ty = this.breachDestY, nx = -this.breachDY, ny = this.breachDX;
              ctx.beginPath(); ctx.moveTo(tx - nx * 18, ty - ny * 18); ctx.lineTo(tx + nx * 18, ty + ny * 18); ctx.stroke();
              ctx.restore();
            } else if (this.breachState === "drift") {
              ctx.save(); ctx.globalAlpha = 0.24; ctx.strokeStyle = core; ctx.lineWidth = 10; ctx.lineCap = "round";
              ctx.beginPath(); ctx.moveTo(this.breachStartX, this.breachStartY); ctx.lineTo(this.x, this.y); ctx.stroke();
              ctx.globalAlpha = 0.7; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(this.x - this.breachDX * 46, this.y - this.breachDY * 46); ctx.lineTo(this.x, this.y); ctx.stroke();
              ctx.restore();
            }
            if (this.breachRipple > 0) {
              const k = 1 - this.breachRipple;
              ctx.save(); ctx.translate(this.x - this.breachDX * 18, this.y - this.breachDY * 18); ctx.rotate(breachA);
              ctx.globalAlpha = this.breachRipple * 0.7; ctx.strokeStyle = CONFIG.colors.perfect; ctx.lineWidth = 3;
              for (let i = 0; i < 3; i++) {
                const rr = 24 + i * 18 + k * 42;
                ctx.beginPath(); ctx.ellipse(-i * 8, 0, 8 + k * 7, rr, 0, -Math.PI * 0.48, Math.PI * 0.48); ctx.stroke();
              }
              ctx.restore();
            }
            // RIFT DASH: chromatic afterimages of the blink, then a lane telegraph on wind
            for (const g of this.dashGhosts) {
              const gk = g.t / 0.24; ctx.save(); ctx.globalAlpha = gk * 0.4;
              ctx.fillStyle = gk > 0.5 ? "#39f0ff" : "#ff4d8d";
              ctx.fillRect(g.x - w + (gk - 0.5) * 8, g.y - h, w * 2, h * 2); ctx.restore();
            }
            if (this.dashState === "wind") {
              const dk = 1 - clamp(this.dashT / CONFIG.source.dashWindup, 0, 1);
              const ang = Math.atan2(this.dashTY, this.dashTX);
              ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(ang);
              ctx.globalAlpha = 0.2 + 0.35 * dk; ctx.fillStyle = core;
              ctx.fillRect(0, -18, CONFIG.view.w * 1.4, 36);
              ctx.globalAlpha = 0.6 + 0.4 * dk; ctx.fillRect(0, -2, CONFIG.view.w * 1.4, 4);
              ctx.restore();
            }
            if (this.collapseState === "wind") {
              const ck = 1 - clamp(this.collapseWT / CONFIG.source.collapseWindup, 0, 1);
              for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2;
                dangerReticle(ctx, this.x + Math.cos(a) * 150 * (1 - ck * 0.3), this.y + Math.sin(a) * 90 * (1 - ck * 0.3), 14, ck, core); }
            }
            if (this.beamState === "tell") {
              const k = 1 - clamp(this.beamT / CONFIG.source.beamWarn, 0, 1);
              dangerColumn(ctx, this.beamX, CONFIG.source.beamW, 10, CONFIG.world.groundY, CONFIG.colors.perfect, k);
            } else if (this.beamState === "sweep") {
              ctx.save(); ctx.globalAlpha = 0.78; ctx.fillStyle = CONFIG.colors.perfect;
              ctx.fillRect(this.beamX - CONFIG.source.beamW / 2, 0, CONFIG.source.beamW, CONFIG.view.h);
              ctx.globalAlpha = 0.85; ctx.fillStyle = "#fff"; ctx.fillRect(this.beamX - 5, 0, 10, CONFIG.view.h); ctx.restore();
            }
            this._drawDepthTelegraph(ctx); this._drawSiphon(ctx);
            if (this.captionT > 0) UI.tag(ctx, this.echoCaption, this.x, this.y - this.hh - 48, core, "center", UI.t.type.caption);
            drawPeril(ctx, this);
            // Source intentionally has no local health bar: the top boss HUD is the only authority.
          }
      });
}

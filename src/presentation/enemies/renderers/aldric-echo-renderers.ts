import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { EnemyRendererRuntime } from "./enemy-renderer-runtime";
import type { RenderInstance } from "./enemy-renderer-types";

export function installAldricEchoRenderers(types: EnemyTypes, runtime: EnemyRendererRuntime): void {
  const { CLOCK, CONFIG, GFX, THEME, UI, clamp, lerp, chargeTelegraph, dangerColumn, dangerReticle, drawAldricCrown, drawGreatCleaver, drawPeril, telegraphInk, weaponGlint } = runtime;
  Object.assign(types.Aldric.prototype, {
        draw(this: RenderInstance<"Aldric">, ctx: CanvasRenderingContext2D) {
            const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
            const downed = this.mode === "downed", frenzy = this.mode === "frenzy";
            ctx.save();
            if (this.dying) {
              ctx.translate(this.x, this.y + this.hh); ctx.scale(1, 1 - this.deathP * 0.38); ctx.translate(-this.x, -(this.y + this.hh));
            }
            // regen glow during the fake
            if (downed) {
              const pulse = 0.3 + 0.3 * Math.sin(CLOCK.sim * 1000 / 150);
              ctx.fillStyle = CONFIG.colors.charger; ctx.globalAlpha = pulse;
              ctx.beginPath(); ctx.arc(this.x, this.y, this.hw + 14, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
            }
            if (frenzy) {   // burning aura
              ctx.fillStyle = CONFIG.colors.bomber; ctx.globalAlpha = 0.2 + 0.1 * Math.sin(CLOCK.sim * 1000 / 90);
              ctx.fillRect(x - 6, y - 6, w + 12, h + 12); ctx.globalAlpha = 1;
            }
            // A royal scarf/cape has its own restrained secondary motion: it lags the
            // king's velocity and snaps forward only on committed attacks.
            const capeLead = clamp(-this.vx * 0.035, -52, 52), capeLift = (this.state === "lunge" || this.state === "charge") ? -22 : 0;
            ctx.fillStyle = this.mode === "duel" ? "#74202b" : CONFIG.colors.bomber; ctx.globalAlpha = downed ? 0.35 : 0.82;
            ctx.beginPath(); ctx.moveTo(this.x - this.facing * this.hw * 0.55, y + 16);
            ctx.lineTo(this.x - this.facing * (this.hw + 34) + capeLead, y + h * 0.55 + capeLift + Math.sin(CLOCK.sim * 1000 / 140) * 5);
            ctx.lineTo(this.x - this.facing * (this.hw + 18) + capeLead * 0.6, y + h - 5); ctx.lineTo(this.x - this.facing * this.hw * 0.45, y + h - 18); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
            // body — squat when downed
            const by = downed ? y + h * 0.3 : y, bh = downed ? h * 0.7 : h;
            ctx.fillStyle = this.flash > 0 ? "#fff" : (downed ? "#7a1320" : this.color);
            ctx.fillRect(x, by, w, bh);
            ctx.strokeStyle = THEME.ink; ctx.lineWidth = 4; ctx.strokeRect(x, by, w, bh);
            // eye
            ctx.fillStyle = "#fff"; ctx.fillRect(this.x + this.facing * 16 - 8, by + 14, 16, 11);
            if (this.crownWorn) drawAldricCrown(ctx, this._wornCrownPose(), this.crownHeat);
            // Royal Great-Cleaver: buried for the kneel, visibly reclaimed, never discarded in frenzy.
            const shoulderLead = (this.state === "windup" || this.state === "overheadwind" || this.state === "chargewind") ? -this.facing * 9 : 0;
            ctx.strokeStyle = downed ? "#6f3b40" : "#d0a35a"; ctx.lineWidth = 6; ctx.beginPath();
            ctx.moveTo(this.x - this.hw * 0.5 + shoulderLead, by + 28); ctx.lineTo(this.x + this.hw * 0.5 + shoulderLead, by + 28); ctx.stroke();
            const introP = this.introT > 0 ? clamp(1 - this.introT / ((CONFIG.bossTheater.introDur) || 1.4), 0, 1) : -1;
            const poseA = introP >= 0 ? lerp(-0.6, -1.75, Math.sin(introP * Math.PI)) : this.weaponA;
            const cleaverPose = this.weaponGeometry(poseA, introP >= 0 ? poseA : this.weaponPrevA);
            if (!downed && Math.abs(this.weaponA - this.weaponPrevA) > 0.04 && !(GFX.low)) {
              const sweep = cleaverPose.sweptAttackHull.segments[2]; ctx.strokeStyle = this.anger ? "#fff0b0" : CONFIG.colors.bomber;
              if (sweep) { ctx.globalAlpha = 0.25; ctx.lineWidth = 30; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(sweep.a.x, sweep.a.y); ctx.lineTo(sweep.b.x, sweep.b.y); ctx.stroke(); ctx.globalAlpha = 1; }
            }
            drawGreatCleaver(ctx, cleaverPose, this, downed);
            if (!downed && this.mode !== "duel" && (this.state === "lunge" || this.state === "charge" || this.state === "overhead") && !(GFX.low)) {
              const edge = cleaverPose.cuttingEdge;
              ctx.strokeStyle = CONFIG.colors.bomber; ctx.globalAlpha = 0.48; ctx.lineWidth = 13; ctx.lineCap = "round";
              ctx.beginPath(); ctx.moveTo(edge.a.x, edge.a.y); ctx.lineTo(edge.b.x, edge.b.y); ctx.stroke();
              ctx.strokeStyle = "#fff7d6"; ctx.globalAlpha = 0.72; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
            }
            // frenzy charge telegraph: the lane he's about to barrel down
            if (this.state === "chargewind") {
              const k = 1 - clamp(this.stateT / (CONFIG.aldric.chargeWindup || 0.5), 0, 1);
              chargeTelegraph(ctx, this.x, this.y, this.hh, this.facing, k, CONFIG.colors.charger);
              weaponGlint(ctx, cleaverPose.tip.x, cleaverPose.tip.y, CONFIG.colors.charger, k);
            }
            if (this.state === "crownfire") {
              const k = 1 - clamp(this.stateT / CONFIG.aldric.crownfireWindup, 0, 1);
              dangerColumn(ctx, CONFIG.view.w / 2, 160, 30, CONFIG.world.groundY, CONFIG.colors.bomber, k);
            }
            if (this.state === "overheadwind") {   // OVERHEAD CLEAVER: the kill-column tracks the raised blade
              const k = 1 - clamp(this.stateT / CONFIG.aldric.overheadWindup, 0, 1);
              dangerColumn(ctx, this.x, CONFIG.aldric.overheadRange * 2, this.y + this.hh, CONFIG.world.groundY, CONFIG.colors.bomber, k);
              weaponGlint(ctx, cleaverPose.tip.x, cleaverPose.tip.y, CONFIG.colors.bomber, k); drawPeril(ctx, this);
            }
            if (["vaultwind", "ascendwind", "thronewind"].includes(this.state) && this.verticalTarget) {
              const k = 1 - clamp(this.stateT / (this.verticalMaxT || 1), 0, 1), tx = this.verticalTargetX, ty = this.verticalTarget.y;
              dangerReticle(ctx, tx, ty, this.state === "thronewind" ? 34 : 23, k, CONFIG.colors.bomber);
              if (this.state === "ascendwind") dangerColumn(ctx, tx, CONFIG.aldric.ascendHalfW * 2, ty - 18, this.y + this.hh, CONFIG.colors.bomber, k);
              else {
                ctx.save(); ctx.strokeStyle = telegraphInk(CONFIG.colors.bomber); ctx.globalAlpha = 0.34 + k * 0.45; ctx.lineWidth = 2.5; ctx.setLineDash([12, 9]);
                ctx.beginPath(); ctx.moveTo(this.verticalStartX, this.verticalStartY);
                ctx.quadraticCurveTo(lerp(this.verticalStartX, tx, 0.5), Math.min(this.verticalStartY, ty) - (this.state === "thronewind" ? CONFIG.aldric.thronefallRise : CONFIG.aldric.vaultArc), tx, ty); ctx.stroke(); ctx.restore();
              }
              weaponGlint(ctx, cleaverPose.tip.x, cleaverPose.tip.y, CONFIG.colors.bomber, k); drawPeril(ctx, this);
            }
            if (this.mode === "downed") UI.tag(ctx, "STRIKE — OR STAND WITNESS.", this.x, this.y - this.hh - 38,
              this.kneelStruck ? CONFIG.colors.charger : CONFIG.colors.bomber, "center", UI.t.type.caption);
            if (this.crown) {
              drawAldricCrown(ctx, this.crown, this.crown.heat);
            }
            drawPeril(ctx, this);
            ctx.restore();
          }
      });

      Object.assign(types.Echo.prototype, {
        draw(this: RenderInstance<"Echo">, ctx: CanvasRenderingContext2D) {
            const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
            // Cleaner mirrored trails: phase-specific outlines, not a cloud of particles.
            for (const g of this.edgeTrail) {
              const a = g.t / 0.2;
              ctx.globalAlpha = a * (this.phase === 1 ? 0.08 : this.phase === 2 ? 0.13 : 0.2);
              ctx.strokeStyle = this.phase === 3 ? CONFIG.colors.perfect : CONFIG.colors.eye; ctx.lineWidth = this.phase;
              ctx.strokeRect(g.x - this.hw, g.y - this.hh, w, h);
            }
            ctx.globalAlpha = 1 - this.whiteFlash * 0.88;   // near-invisible during a white-out
            // your silhouette + cyan visor + a faint blade
            ctx.fillStyle = this.flash > 0 ? "#fff" : (this.isClone ? "#3a3a3a" : THEME.ink);
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.colors.eye; ctx.fillRect(this.x + this.facing * 5 - 4, y + 12, 8, 5);
            ctx.strokeStyle = THEME.ink; ctx.lineWidth = 4; ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.facing * 22, this.y - 26); ctx.stroke();
            ctx.strokeStyle = this.phase === 1 ? CONFIG.colors.eye : (this.phase === 2 ? "#b06cff" : CONFIG.colors.perfect);
            ctx.lineWidth = this.harmonyLockT > 0 ? 4 : 2; ctx.setLineDash(this.phase === 2 ? [7, 5] : (this.phase === 3 ? [3, 4] : []));
            ctx.strokeRect(x - this.phase * 3, y - this.phase * 3, w + this.phase * 6, h + this.phase * 6); ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            // dive telegraph — always visible (even mid white-out) so the dive is readable
            if (this.state === "aim") {
              const k = 1 - clamp(this.aimT / 0.32, 0, 1);
              ctx.strokeStyle = CONFIG.colors.eye; ctx.globalAlpha = 0.5 + 0.4 * k; ctx.lineWidth = 2 + 3 * k; ctx.setLineDash([9, 7]); ctx.lineCap = "round";
              ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.diveTX, this.diveTY); ctx.stroke(); ctx.setLineDash([]);
              ctx.beginPath(); ctx.arc(this.diveTX, this.diveTY, 18 - 9 * k, 0, Math.PI * 2); ctx.stroke();
              ctx.globalAlpha = 1;
            }
            this.drawHpBar(ctx);
          }
      });

      Object.assign(types.VoidWisp.prototype, {
        draw(this: RenderInstance<"VoidWisp">, ctx: CanvasRenderingContext2D) {
            const p = 0.65 + 0.35 * Math.sin(CLOCK.sim * 1000 / 120 + this.x * 0.01);
            if (this.passState === "tell") {
              const k = 1 - clamp(this.passT / CONFIG.source.voidWispTell, 0, 1);
              ctx.save(); ctx.strokeStyle = this.color; ctx.globalAlpha = 0.4 + 0.45 * k; ctx.lineWidth = 2.5; ctx.setLineDash([10, 8]);
              ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(-40, this.passY); ctx.stroke(); ctx.setLineDash([]);
              ctx.beginPath(); ctx.arc(this.x, this.y, this.hw * (1.4 - k * 0.35), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
            }
            ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.hw * 1.7, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = p; ctx.strokeStyle = this.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(this.x, this.y, this.hw * 0.7, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 0.8; ctx.fillStyle = "#fff"; ctx.fillRect(this.x - 4, this.y - 4, 8, 8); ctx.restore();
            this.drawHpBar(ctx);
          }
      });
}

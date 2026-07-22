import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { EnemyRendererRuntime } from "./enemy-renderer-runtime";
import type { RenderInstance } from "./enemy-renderer-types";

export function installWardenColossusRenderers(types: EnemyTypes, runtime: EnemyRendererRuntime): void {
  const { CLOCK, CONFIG, GFX, THEME, clamp, lerp, chargeTelegraph, dangerColumn, dangerLane, dangerReticle, drawPeril, drawWardstaff, weaponGlint } = runtime;
  Object.assign(types.Warden.prototype, {
        draw(this: RenderInstance<"Warden">, ctx: CanvasRenderingContext2D) {
            const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
            const dim = this.state === "fakedeath";
            ctx.save();
            if (this.dying) {
              ctx.translate(this.x, this.y + this.hh); ctx.rotate(-this.facing * this.deathP * 0.72);
              ctx.scale(1, 1 - this.deathP * 0.28); ctx.translate(-this.x, -(this.y + this.hh));
            }
            ctx.fillStyle = this.flash > 0 ? "#fff" : (dim ? "#7a1020" : this.color);
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = THEME.ink; ctx.lineWidth = 4; ctx.strokeRect(x, y, w, h);
            // Planted feet and an opposite-body anticipation lean sell the staff's mass.
            const anticipating = (this.state === "string" && this.beatPh === "wind") || this.state === "windup" || (this.state === "batonlunge" && this.beatPh === "wind");
            ctx.fillStyle = dim ? "#4c4c4c" : THEME.ink;
            ctx.fillRect(this.x - this.hw * 0.72 - (anticipating ? this.facing * 7 : 0), this.y + this.hh - 9, this.hw * 0.62, 11);
            ctx.fillRect(this.x + this.hw * 0.10 - (anticipating ? this.facing * 7 : 0), this.y + this.hh - 9, this.hw * 0.62, 11);
            const introP = this.introT > 0 ? clamp(1 - this.introT / ((CONFIG.bossTheater.introDur) || 1.4), 0, 1) : -1;
            let staffA = this.dying ? lerp(this.batonA, 1.5, this.deathP) : this.batonA;
            if (introP >= 0) staffA = introP < 0.62 ? lerp(-0.45, -1.55, introP / 0.62) : lerp(-1.55, 0.82, (introP - 0.62) / 0.38);
            if (this.mortarKickT > 0) staffA -= Math.sin(this.mortarKickT / 0.2 * Math.PI) * 0.22;   // artillery recoil kicks the base into his planted stance
            const staffPose = this.weaponGeometry(staffA, introP >= 0 ? staffA : this.batonPrevA);
            if (!dim && Math.abs(this.batonA - this.batonPrevA) > 0.045 && !(GFX.low)) {
              const sweep = staffPose.sweptAttackHull.segments[2]; ctx.strokeStyle = this.phase >= 3 ? CONFIG.colors.charger : CONFIG.colors.slam;
              if (sweep) { ctx.globalAlpha = 0.28; ctx.lineWidth = 24; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(sweep.a.x, sweep.a.y); ctx.lineTo(sweep.b.x, sweep.b.y); ctx.stroke(); ctx.globalAlpha = 1; }
            }
            drawWardstaff(ctx, staffPose, this, dim);
            if (this.onCeiling || this.state === "lungewind" || (this.state === "lunge" && this.phase >= 3)) {
              // The phase-three dive hangs from the wardstaff's deployed custody hook.
              ctx.strokeStyle = this.phase >= 3 ? CONFIG.colors.charger : "#9ca7ad"; ctx.lineWidth = 3; ctx.globalAlpha = 0.8;
              ctx.beginPath(); ctx.moveTo(staffPose.tip.x, staffPose.tip.y); ctx.lineTo(this.x - this.facing * 34, 18); ctx.stroke();
              ctx.beginPath(); ctx.arc(this.x - this.facing * 34, 18, 8, 0.2, Math.PI * 1.75); ctx.stroke(); ctx.globalAlpha = 1;
            }
            // eye + phase pips + badge
            ctx.fillStyle = "#fff";
            ctx.fillRect(this.x + this.facing * 18 - 9, this.y - 20, 18, 13);
            for (let i = 0; i < this.phase; i++) ctx.fillRect(x + 14 + i * 18, y + h - 20, 12, 9);
            // Guard wear is physical: gold custody bands disappear and crimson fractures
            // cross the breastplate as posture approaches a break.
            const guardBands = 4, intact = Math.max(0, guardBands - Math.floor(this.guardMeter * guardBands + 0.001));
            ctx.fillStyle = "#e0a326";
            for (let i = 0; i < intact; i++) ctx.fillRect(x + 8 + i * 11, y + 7, 7, 5);
            if (this.guardMeter > 0.2) {
              ctx.strokeStyle = this.guardBrokenT > 0 ? CONFIG.colors.charger : "#e0a326"; ctx.lineWidth = this.guardBrokenT > 0 ? 3 : 2;
              ctx.beginPath(); ctx.moveTo(this.x - 18, y + 8); ctx.lineTo(this.x - 4, this.y - 4); ctx.lineTo(this.x - 13, this.y + 13);
              if (this.guardMeter > 0.65) { ctx.moveTo(this.x + 16, y + 13); ctx.lineTo(this.x + 3, this.y + 4); ctx.lineTo(this.x + 12, this.y + 24); } ctx.stroke();
            }
            // wind-up telegraph
            if (this.state === "windup") {
              const gy = this.y + this.hh;
              const wk = 1 - clamp(this.stateT / (CONFIG.warden.batonWindup || 0.5), 0, 1);
              ctx.strokeStyle = CONFIG.colors.slam; ctx.globalAlpha = 0.65; ctx.lineWidth = 4; ctx.setLineDash([8, 6]);
              if (this.pendingAtk === "mortar" || this.pendingAtk === "volley") {
                ctx.beginPath(); ctx.arc(this.x, this.y - this.hh - 12, 16, 0, Math.PI * 2); ctx.stroke();
                { const ry = this.pendingAtk === "volley" ? this.volleyTargetY - 3 : CONFIG.world.groundY - 3;
                  for (const tx of this.mortarTargets) dangerReticle(ctx, tx, ry, 28, wk, this.color); }
              }
              else if (this.pendingAtk === "heavy") dangerLane(ctx, this.x, gy - 76, CONFIG.view.w, 82, this.facing, CONFIG.colors.charger, wk);
              else { ctx.beginPath(); ctx.moveTo(this.x, gy - 2); ctx.lineTo(this.x + this.facing * 210, gy - 2); ctx.stroke(); }
              ctx.setLineDash([]); ctx.globalAlpha = 1;
              const bs = this.batonSegment(); weaponGlint(ctx, bs.x2, bs.y2, this.pendingAtk === "heavy" ? CONFIG.colors.charger : CONFIG.colors.slam, wk);
            }
            // string beats: the baton glints through every wind — crimson when the
            // finisher (unparryable) is coming, gold when the beat can be deflected
            if (this.state === "string" && this.beatPh === "wind") {
              const sk = 1 - clamp(this.stateT / (CONFIG.warden.stringWind || 0.3), 0, 1);
              const bs2 = this.batonSegment();
              weaponGlint(ctx, bs2.x2, bs2.y2, this.beatHeavy ? CONFIG.colors.charger : "#e0a326", sk);
            }
            // SHIELD-BATON LUNGE telegraph: the lane he's about to hop-strike down
            if (this.state === "batonlunge" && this.beatPh === "wind") {
              const lk = 1 - clamp(this.stateT / (CONFIG.warden.lungeWind || 0.42), 0, 1);
              dangerLane(ctx, this.x, this.y - this.hh, CONFIG.view.w, this.hh * 2, this.facing, this.color, lk * 0.7);
              const lungePose = this.weaponGeometry(); weaponGlint(ctx, lungePose.tip.x, lungePose.tip.y, "#e0a326", lk);
            }
            // ceiling-dive telegraph: a marked line from the cling to the spot it locked onto
            if (this.state === "lungewind") {
              const k = 1 - clamp(this.lungeWT / (CONFIG.warden.lungeWindup || 0.5), 0, 1);
              ctx.strokeStyle = CONFIG.colors.charger; ctx.globalAlpha = 0.4 + 0.5 * k; ctx.lineWidth = 3 + 3 * k; ctx.setLineDash([10, 8]); ctx.lineCap = "round";
              ctx.beginPath(); ctx.moveTo(this.x, this.y + this.hh); ctx.lineTo(this.diveTX, this.diveTY); ctx.stroke();
              ctx.setLineDash([]);
              ctx.fillStyle = CONFIG.colors.charger; ctx.globalAlpha = 0.3 + 0.6 * k;   // target reticle
              ctx.beginPath(); ctx.arc(this.diveTX, this.diveTY, 16 - 8 * k, 0, Math.PI * 2); ctx.stroke();
              ctx.globalAlpha = 1;
              dangerColumn(ctx, this.diveTX, 92, 30, CONFIG.world.groundY, CONFIG.colors.charger, k);
            }
            drawPeril(ctx, this);
            this.drawHpBar(ctx);   // (boss HP also shown in the HUD)
            ctx.restore();
          }
      });

      Object.assign(types.Colossus.prototype, {
        draw(this: RenderInstance<"Colossus">, ctx: CanvasRenderingContext2D) {
            const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2, ph = this.phase;
            ctx.save();
            if (this.dying) {
              ctx.translate(this.x, this.y + this.hh); ctx.scale(1 + this.deathP * 0.12, 1 - this.deathP * 0.58); ctx.translate(-this.x, -(this.y + this.hh));
            }
            if (this.ventT > 0) {
              const vk = clamp(this.ventT / this.cfg.ventDur, 0, 1), top = 70;
              ctx.fillStyle = CONFIG.colors.armoredShield; ctx.globalAlpha = 0.08 + 0.12 * vk;
              ctx.fillRect(this.ventX - this.cfg.ventW / 2, top, this.cfg.ventW, CONFIG.world.groundY - top);
              ctx.strokeStyle = CONFIG.colors.armoredShield; ctx.lineWidth = 3; ctx.globalAlpha = 0.35 + 0.4 * vk;
              for (let i = -2; i <= 2; i++) {
                const sx = this.ventX + i * this.cfg.ventW * 0.16, off = (CLOCK.sim * 1000 / 5 + i * 31) % 90;
                ctx.beginPath(); ctx.moveTo(sx, CONFIG.world.groundY - off); ctx.lineTo(sx, CONFIG.world.groundY - off - 48); ctx.stroke();
              }
              ctx.globalAlpha = 1;
            }
            // body (heavy plating + rivets)
            ctx.fillStyle = this.flash > 0 ? "#fff" : (this.stun > 0 ? "#9aa6b2" : this.color);
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = THEME.ink; ctx.lineWidth = 5; ctx.strokeRect(x, y, w, h);
            // Separate armor, piston and core layers sell mass without constant camera shake.
            const wind = this.state === "windup" || this.state === "smashwind" || this.state === "meltdown";
            const compress = wind ? 7 + 5 * Math.sin(clamp(this.stateT || 0, 0, 1) * Math.PI) : 0;
            const plateOut = (this.coreOpenT > 0 ? 11 : 0) + (this.plateKickT > 0 ? Math.sin(this.plateKickT / 0.5 * Math.PI) * 16 : 0);
            ctx.strokeStyle = "#40474f"; ctx.lineWidth = 7;
            for (const side of [-1, 1]) {
              const sx = this.x + side * (this.hw * 0.58 + plateOut), py = y + 24 + compress;
              ctx.beginPath(); ctx.moveTo(this.x + side * 12, this.y - 18); ctx.lineTo(sx, py); ctx.lineTo(sx, y + h - 20 - compress); ctx.stroke();
              ctx.fillStyle = side === this.facing ? CONFIG.colors.armoredShield : "#59616a";
              ctx.fillRect(sx - 15, y + 12 - plateOut * 0.18, 30, h - 24);
              ctx.strokeStyle = THEME.ink; ctx.lineWidth = 3; ctx.strokeRect(sx - 15, y + 12 - plateOut * 0.18, 30, h - 24);
            }
            ctx.fillStyle = THEME.ink;
            for (let i = 0; i < 4; i++) { ctx.fillRect(x + 8 + i * (w - 24) / 3, y + 8, 5, 5); ctx.fillRect(x + 8 + i * (w - 24) / 3, y + h - 13, 5, 5); }
            // eye
            ctx.fillStyle = "#fff"; ctx.fillRect(this.x + this.facing * 26 - 12, this.y - 28, 24, 16);
            // front shield (phase 1) or exposed molten core (phase 3)
            if (this.shielded) {
              const gx = this.x + this.facing * (this.hw + 12);
              // PLATE CLANG: the struck plating flashes white for a beat
              if (this._plateFlashT > 0) { this._plateFlashT -= 1 / 60; ctx.fillStyle = "#fff"; }
              else ctx.fillStyle = CONFIG.colors.armoredShield;
              ctx.fillRect(gx - 6, y - 8, 12, h + 16);
              ctx.fillRect(gx - this.facing * 10 - 1, y - 8, this.facing * 11, 8);
              ctx.fillRect(gx - this.facing * 10 - 1, y + h + 1, this.facing * 11, 8);
            } else if (ph === 3 || this.coreOpenT > 0) {
              const pulse = 0.6 + 0.4 * Math.sin(CLOCK.sim * 1000 / 120);
              ctx.fillStyle = this.coreOpenT > 0 ? CONFIG.colors.armoredShield : CONFIG.colors.boss; ctx.globalAlpha = pulse;
              ctx.beginPath(); ctx.arc(this.x, this.y + 6, 22, 0, Math.PI * 2); ctx.fill();
              ctx.globalAlpha = 1; ctx.strokeStyle = CONFIG.colors.slam; ctx.lineWidth = 3; ctx.stroke();
            }
            if (!this.shielded && this.shieldArmRuptured) {
              // The returned saw leaves the front actuator visibly broken; posture damage
              // reads on the body even while a perfect return exposes the molten core.
              const ax = this.x + this.facing * (this.hw + 7), ay = this.y + 3;
              ctx.strokeStyle = "#ff8a32"; ctx.lineWidth = 5; ctx.lineCap = "square";
              ctx.beginPath(); ctx.moveTo(ax, ay - 30); ctx.lineTo(ax - this.facing * 15, ay - 8); ctx.lineTo(ax + this.facing * 5, ay + 8); ctx.lineTo(ax - this.facing * 12, ay + 31); ctx.stroke();
              ctx.fillStyle = THEME.ink; ctx.fillRect(ax - 6, ay - 7, 12, 14);
            }
            // wind-up telegraph
            if (this.state === "windup") {
              const gy = this.y + this.hh, k = 1 - clamp(this.stateT / (this.pendingAtk === "charge" ? this.cfg.chargeWindup : this.cfg.windup), 0, 1);
              if (this.pendingAtk === "charge") { dangerLane(ctx, this.x, this.y - this.hh, CONFIG.view.w, this.hh * 2, this.facing, CONFIG.colors.slam, k); chargeTelegraph(ctx, this.x, this.y, this.hh, this.facing, k, CONFIG.colors.slam); }
              else {
                ctx.strokeStyle = CONFIG.colors.slam; ctx.globalAlpha = 0.35 + 0.5 * k; ctx.lineWidth = 4; ctx.setLineDash([8, 6]);
                if (this.pendingAtk === "stomp") { ctx.beginPath(); ctx.moveTo(this.x - (60 + 180 * k), gy - 2); ctx.lineTo(this.x + (60 + 180 * k), gy - 2); ctx.stroke(); }
                else { ctx.beginPath(); ctx.moveTo(this.x, gy - 2); ctx.lineTo(this.x + this.facing * (60 + 200 * k), gy - 2); ctx.stroke(); }
                ctx.setLineDash([]); ctx.globalAlpha = 1;
              }
              weaponGlint(ctx, this.x + this.facing * (this.hw + 12), this.y - 4, CONFIG.colors.armoredShield, k);
            }
            // OVERHEAD SMASH telegraph: the kill-column follows the raised fist
            if (this.state === "smashwind") {
              const k = 1 - clamp(this.stateT / this.cfg.smashWindup, 0, 1);
              dangerColumn(ctx, this.x, this.cfg.smashRange * 1.4, this.y + this.hh, CONFIG.world.groundY, CONFIG.colors.slam, k);
              weaponGlint(ctx, this.x, this.y - this.hh - 10, CONFIG.colors.slam, k);
              drawPeril(ctx, this);
            }
            // SEISMIC BACKHAND telegraph: a short arc sweeping to the strike side
            if (this.state === "grabwind") {
              const k = 1 - clamp(this.stateT / this.cfg.grabWindup, 0, 1);
              ctx.save(); ctx.strokeStyle = CONFIG.colors.armoredShield; ctx.globalAlpha = 0.4 + 0.5 * k; ctx.lineWidth = 5;
              ctx.beginPath(); ctx.arc(this.x, this.y, this.cfg.grabRange, this.facing > 0 ? -0.8 : Math.PI - 0.8, this.facing > 0 ? 0.8 : Math.PI + 0.8); ctx.stroke(); ctx.restore();
            }
            if (this.state === "meltdown") {
              const k = 1 - clamp(this.stateT / this.cfg.meltdownWindup, 0, 1);
              dangerColumn(ctx, CONFIG.view.w / 2, 190, 20, CONFIG.world.groundY, CONFIG.colors.slam, k);
            }
            if (this.dying) {
              ctx.globalAlpha = 1 - this.deathP * 0.35; ctx.fillStyle = CONFIG.colors.armoredShield;
              for (let i = 0; i < 5; i++) {
                const d = this.deathP * (34 + i * 9), px = this.x + (i - 2) * 24, py = this.y - 30 + d * d * 0.035;
                ctx.save(); ctx.translate(px, py); ctx.rotate((i - 2) * this.deathP); ctx.fillRect(-10, -7, 20, 14); ctx.restore();
              }
              ctx.globalAlpha = 1;
            }
            drawPeril(ctx, this);
            ctx.restore();
          }
      });
}

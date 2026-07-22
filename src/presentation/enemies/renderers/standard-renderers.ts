import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { EnemyRendererRuntime } from "./enemy-renderer-runtime";
import type { RenderInstance } from "./enemy-renderer-types";

export function installStandardEnemyRenderers(types: EnemyTypes, runtime: EnemyRendererRuntime): void {
  const { CONFIG, THEME, clamp, CHIMERA_MOVE_COLOR } = runtime;
  Object.assign(types.Flyer.prototype, {
        draw(this: RenderInstance<"Flyer">, ctx: CanvasRenderingContext2D) {
            // Dive Bomber's ground warning marker
            if (this.behavior === "divebomb" && this.state === "warn" && this.diveX != null) {
              const gy = CONFIG.world.groundY, k = 1 - clamp(this.warnT / 1.1, 0, 1);
              ctx.strokeStyle = CONFIG.colors.slam; ctx.globalAlpha = 0.35 + 0.5 * k; ctx.lineWidth = 3;
              ctx.beginPath(); ctx.arc(this.diveX, gy - 4, 34 - 22 * k, 0, Math.PI * 2); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(this.diveX, this.y + this.hh); ctx.setLineDash([4, 8]); ctx.lineTo(this.diveX, gy - 4); ctx.stroke();
              ctx.setLineDash([]); ctx.globalAlpha = 1;
            }
            const dir = Math.sign(this.vx) || 1, r = this.hw + 3;
            ctx.fillStyle = this.flash > 0 ? "#fff" : (this.stun > 0 ? "#c4a8e0" : this.color);
            ctx.beginPath();
            ctx.moveTo(this.x + dir * r, this.y);
            ctx.lineTo(this.x - dir * r, this.y - this.hh);
            ctx.lineTo(this.x - dir * r * 0.4, this.y);
            ctx.lineTo(this.x - dir * r, this.y + this.hh);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2; ctx.stroke();
            // variant accent: a downward fang on divers
            if (this.behavior !== "swoop") {
              ctx.fillStyle = THEME.ink;
              ctx.beginPath(); ctx.moveTo(this.x - 4, this.y + this.hh - 2); ctx.lineTo(this.x + 4, this.y + this.hh - 2); ctx.lineTo(this.x, this.y + this.hh + 6); ctx.fill();
            }
            this.drawHpBar(ctx);
          }
      });

      Object.assign(types.Bomber.prototype, {
        draw(this: RenderInstance<"Bomber">, ctx: CanvasRenderingContext2D) {
            // Geomancer channel telegraph: a wall rising from the floor at the target spot
            if (this.behavior === "geo" && this.atk === "channel") {
              const k = 1 - clamp(this.atkT / (this.atkMax || 1), 0, 1), X = CONFIG.exotic, gy = CONFIG.world.groundY;
              ctx.fillStyle = CONFIG.colors.sludge; ctx.globalAlpha = 0.3 + 0.4 * k;
              ctx.fillRect(this.geoX - X.geoWallW / 2, gy - X.geoWallH * k, X.geoWallW, X.geoWallH * k);
              ctx.globalAlpha = 1;
              // channel link
              ctx.strokeStyle = CONFIG.colors.sludge; ctx.globalAlpha = 0.5; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
              ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.geoX, gy - X.geoWallH * k * 0.5); ctx.stroke();
              ctx.setLineDash([]); ctx.globalAlpha = 1;
            }
            ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.hw, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = THEME.ink; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = THEME.ink; ctx.fillRect(this.x - 2, this.y - this.hh - 8, 4, 8);   // launcher spout
            // variant accent
            if (this.behavior === "trap") { ctx.fillStyle = "#fff"; ctx.fillRect(this.x - 6, this.y - 1, 12, 3); }
            else if (this.behavior === "juggle") { ctx.fillStyle = "#fff"; for (let i = 0; i < 3; i++) ctx.fillRect(this.x - 6 + i * 5, this.y - 3, 3, 3); }
            else if (this.behavior === "sludge") { ctx.fillStyle = CONFIG.colors.sludge; ctx.beginPath(); ctx.arc(this.x, this.y, this.hw * 0.5, 0, Math.PI * 2); ctx.fill(); }
            else if (this.behavior === "geo") { ctx.fillStyle = "#fff"; ctx.fillRect(this.x - 5, this.y - 4, 10, 8); }
            this.drawHpBar(ctx);
          }
      });

      Object.assign(types.Armored.prototype, {
        draw(this: RenderInstance<"Armored">, ctx: CanvasRenderingContext2D) {
            const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
            const vulnerable = !this.onGround;   // launched -> takes full/extra damage
            // stomp wind-up telegraph: a building warning along the floor on both sides
            if (this.atk === "stompwind") {
              const k = 1 - clamp(this.atkT / (this.atkMax || 0.55), 0, 1);
              const gy = this.y + this.hh;   // telegraph along its current surface (platform or floor)
              ctx.strokeStyle = CONFIG.colors.slam; ctx.globalAlpha = 0.35 + 0.5 * k; ctx.lineWidth = 3 + k * 3;
              ctx.beginPath(); ctx.moveTo(this.x - (40 + 160 * k), gy - 2); ctx.lineTo(this.x + (40 + 160 * k), gy - 2); ctx.stroke();
              ctx.globalAlpha = 1;
            }
            const body = this.enraged ? CONFIG.colors.charger : this.color;   // enraged runs hot
            ctx.fillStyle = this.flash > 0 ? "#fff" : (this.stun > 0 ? "#9aa6b2" : body);
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
            // vulnerable (airborne) -> dashed double outline so it reads as "hit me now"
            if (vulnerable && this.stun <= 0) {
              ctx.strokeStyle = CONFIG.colors.slam;
              ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeRect(x - 4, y - 4, w + 8, h + 8); ctx.setLineDash([]);
            }
            if (this.enraged) {
              // shield is gone — show angry spikes instead
              ctx.fillStyle = THEME.ink;
              for (let i = 0; i < 3; i++) { const sx = x + 6 + i * (w - 12) / 2; ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + 5, y - 8); ctx.lineTo(sx + 10, y); ctx.fill(); }
            } else if (this.stun <= 0) {
              // bold cyan shield: a thick offset bar with prongs on the guarded side
              const gx = this.x + this.guardSide * (this.hw + 9);
              ctx.fillStyle = CONFIG.colors.armoredShield;
              ctx.fillRect(gx - 4, y - 6, 8, h + 12);
              ctx.fillRect(gx - this.guardSide * 6 - 1, y - 6, this.guardSide * 7, 5);
              ctx.fillRect(gx - this.guardSide * 6 - 1, y + h + 1, this.guardSide * 7, 5);
            }
            this.drawHpBar(ctx);
          }
      });

      Object.assign(types.Boss.prototype, {
        draw(this: RenderInstance<"Boss">, ctx: CanvasRenderingContext2D) {
            const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
            ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = THEME.ink; ctx.lineWidth = 4; ctx.strokeRect(x, y, w, h);
            // eye + phase pips
            ctx.fillStyle = "#fff";
            const dir = Math.sign(this.vx) || 1;
            ctx.fillRect(this.x + dir * 18 - 9, this.y - 18, 18, 14);
            for (let i = 0; i < this.phase; i++) ctx.fillRect(x + 12 + i * 16, y + h - 18, 10, 8);
            // local hp bar hidden (a big one is drawn in the HUD)
          }
      });

      Object.assign(types.Support.prototype, {
        draw(this: RenderInstance<"Support">, ctx: CanvasRenderingContext2D) {
            const t = this.supportType, x = this.x, y = this.y, hw = this.hw, hh = this.hh;
            // clear connection lines to EVERY ally this support is affecting (so you can see who to break)
            if (this.links.length) {
              const beam = t === "mender" || t === "anchor";
              ctx.strokeStyle = this.color; ctx.lineWidth = beam ? 3 : 2;
              for (const a of this.links) {
                if (a.dead) continue;
                ctx.globalAlpha = 0.4 + 0.18 * Math.sin(this.auraPulse * 6);
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(a.x, a.y); ctx.stroke();
                ctx.globalAlpha = 0.8; ctx.fillStyle = this.color;
                ctx.beginPath(); ctx.arc(a.x, a.y - a.hh - 7, 3, 0, Math.PI * 2); ctx.fill();   // marker over the buffed ally
              }
              ctx.globalAlpha = 1;
            }
            // aura ring for the field supports
            if (t === "priest" || t === "herald") {
              ctx.strokeStyle = this.color; ctx.globalAlpha = 0.22 + 0.12 * Math.sin(this.auraPulse * 3.5);
              ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, this.range, 0, Math.PI * 2); ctx.stroke();
              ctx.globalAlpha = 1;
            }
            // Anchor: a shield bubble around the bonded ally
            if (t === "anchor" && this.links[0] && !this.links[0].dead) {
              const a = this.links[0], r = a.radius + 12;
              ctx.strokeStyle = this.color; ctx.globalAlpha = 0.5 + 0.2 * Math.sin(this.auraPulse * 4);
              ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.stroke();
              ctx.globalAlpha = 0.1; ctx.fillStyle = this.color; ctx.fill();
              ctx.globalAlpha = 1;
            }

            // distinct silhouette per support type so they read apart at a glance
            const body = this.flash > 0 ? "#fff" : this.color;
            ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2.5;
            if (t === "priest") {
              // tall robe + a halo ring (authority)
              ctx.fillStyle = body;
              ctx.beginPath(); ctx.moveTo(x, y - hh); ctx.lineTo(x + hw, y); ctx.lineTo(x + hw * 0.7, y + hh);
              ctx.lineTo(x - hw * 0.7, y + hh); ctx.lineTo(x - hw, y); ctx.closePath(); ctx.fill(); ctx.stroke();
              ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y - hh - 4, 7, 0, Math.PI * 2); ctx.stroke();
              ctx.fillStyle = "#fff"; ctx.fillRect(x - 2, y - 7, 4, 14); ctx.fillRect(x - 6, y - 3, 12, 4);   // cross
            } else if (t === "herald") {
              // slim body holding a banner on a tall pole
              ctx.fillStyle = body; ctx.fillRect(x - hw * 0.55, y - hh * 0.6, hw * 1.1, hh * 1.6); ctx.strokeRect(x - hw * 0.55, y - hh * 0.6, hw * 1.1, hh * 1.6);
              ctx.fillStyle = THEME.ink; ctx.fillRect(x + hw * 0.55, y - hh, 3, hh * 2);                 // pole
              ctx.fillStyle = body; ctx.fillRect(x + hw * 0.55 + 3, y - hh, 16, 12); ctx.strokeRect(x + hw * 0.55 + 3, y - hh, 16, 12);   // flag
              ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(x + hw * 0.55 + 6, y - hh + 3); ctx.lineTo(x + hw * 0.55 + 12, y - hh + 6); ctx.lineTo(x + hw * 0.55 + 6, y - hh + 9); ctx.fill();
            } else if (t === "mender") {
              // round, hunched body + a big cross
              ctx.fillStyle = body; ctx.beginPath(); ctx.arc(x, y, hw * 1.05, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
              ctx.fillStyle = "#fff"; ctx.fillRect(x - 2.5, y - 10, 5, 20); ctx.fillRect(x - 9, y - 2.5, 18, 5);
            } else {
              // anchor: a heavy, blocky body + an anchor emblem (chains)
              ctx.fillStyle = body; ctx.fillRect(x - hw, y - hh * 0.7, hw * 2, hh * 1.7); ctx.strokeRect(x - hw, y - hh * 0.7, hw * 2, hh * 1.7);
              ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.arc(x, y - 6, 3, 0, Math.PI * 2); ctx.stroke();                    // ring
              ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 8); ctx.stroke();               // shaft
              ctx.beginPath(); ctx.moveTo(x - 7, y + 4); ctx.quadraticCurveTo(x, y + 12, x + 7, y + 4); ctx.stroke();   // flukes
            }
            this.drawHpBar(ctx);
          }
      });

      Object.assign(types.Wraith.prototype, {
        draw(this: RenderInstance<"Wraith">, ctx: CanvasRenderingContext2D) {
            const x = this.x, y = this.y, hw = this.hw, hh = this.hh;
            ctx.globalAlpha = 0.5 + 0.22 * Math.sin(this.phase * 3);
            ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
            ctx.beginPath();
            ctx.moveTo(x, y - hh); ctx.lineTo(x + hw, y); ctx.lineTo(x + hw * 0.5, y + hh);
            ctx.lineTo(x, y + hh * 0.55); ctx.lineTo(x - hw * 0.5, y + hh); ctx.lineTo(x - hw, y);
            ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 1; ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = CONFIG.colors.eye; ctx.fillRect(x - 7, y - 4, 4, 6); ctx.fillRect(x + 3, y - 4, 4, 6);
            this.drawHpBar(ctx);
          }
      });

      Object.assign(types.Chimera.prototype, {
        draw(this: RenderInstance<"Chimera">, ctx: CanvasRenderingContext2D) {
            const x = this.x, y = this.y, hw = this.hw, hh = this.hh;
            const cueCol = CONFIG.colors[CHIMERA_MOVE_COLOR[this.curMove] ?? "chimera"];
            const active = this.atk === "windup" || this.atk === "strike";
            // a hunched, asymmetric patchwork beast (clearly NOT the old box) — jagged crest of
            // mismatched spikes, two mismatched halves, a cluster of eyes. The "many faces."
            if (this.atk === "windup") {   // telegraph in the color of the move it's about to use
              ctx.strokeStyle = cueCol; ctx.globalAlpha = 0.6; ctx.setLineDash([5, 4]); ctx.lineWidth = 2.5;
              ctx.strokeRect(x - hw - 4, y - hh - 4, hw * 2 + 8, hh * 2 + 8); ctx.setLineDash([]); ctx.globalAlpha = 1;
            }
            // body: an irregular hexagon
            ctx.beginPath();
            ctx.moveTo(x - hw, y - hh * 0.2);
            ctx.lineTo(x - hw * 0.5, y - hh);
            ctx.lineTo(x + hw * 0.7, y - hh * 0.8);
            ctx.lineTo(x + hw, y + hh * 0.1);
            ctx.lineTo(x + hw * 0.5, y + hh);
            ctx.lineTo(x - hw * 0.7, y + hh);
            ctx.closePath();
            ctx.fillStyle = this.flash > 0 ? "#fff" : (active ? cueCol : this.color);
            ctx.fill();
            // mismatched left half tint (patchwork)
            ctx.save(); ctx.clip();
            ctx.globalAlpha = 0.35; ctx.fillStyle = THEME.ink;
            ctx.fillRect(x - hw, y - hh, hw, hh * 2);
            ctx.restore(); ctx.globalAlpha = 1;
            ctx.strokeStyle = THEME.ink; ctx.lineWidth = 3; ctx.stroke();
            // jagged crest of mismatched spikes
            ctx.fillStyle = THEME.ink;
            for (let i = -1; i <= 2; i++) {
              const sx = x + i * (hw * 0.5) - 3, sh = 6 + ((i + 1) % 3) * 4;
              ctx.beginPath(); ctx.moveTo(sx, y - hh * 0.7); ctx.lineTo(sx + 4, y - hh * 0.7 - sh); ctx.lineTo(sx + 8, y - hh * 0.7); ctx.fill();
            }
            // a cluster of three eyes (the "many faces")
            ctx.fillStyle = CONFIG.colors.eye;
            ctx.fillRect(x - 8, y - 2, 4, 5); ctx.fillRect(x - 1, y - 5, 4, 5); ctx.fillRect(x + 5, y - 1, 4, 5);
            this.drawHpBar(ctx);
          }
      });
}

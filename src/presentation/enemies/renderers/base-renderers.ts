import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { EnemyPlayerPort } from "../../../gameplay/entities/enemy-contracts";
import type { EnemyRendererRuntime } from "./enemy-renderer-runtime";
import type { RenderInstance } from "./enemy-renderer-types";

export function installBaseEnemyRenderers(types: EnemyTypes, runtime: EnemyRendererRuntime): void {
  const { CONFIG, GFX, THEME, UI, clamp, len } = runtime;
  Object.assign(types.Enemy.prototype, {
        drawHpBar(this: RenderInstance<"Enemy">, ctx: CanvasRenderingContext2D) {
            if (this._noBar) return;                                  // suppressed (e.g. INDEX previews)
            const fr = clamp(this.hp / this.maxHp, 0, 1);
            const shielded = this.maxShield > 0 && this.shield > 0;
            const status = this.bleedStacks > 0 || this.burnT > 0 || this.markT > 0 || this.seamT > 0 || this.severT > 0 || this.breakPressure > 0;
            const hit = clamp((this.flash || 0) / 0.08, 0, 1);        // 1 right after a hit -> 0
            if (fr >= 1 && !shielded && hit <= 0 && !status) return;  // pristine & unhurt -> no bar (less clutter)
            const w = Math.max(this.hw * 2, 28), x = this.x - w / 2, y = this.y - this.hh - 15, h = 5, cy = y + h / 2;
            const fl = clamp(this.hpDisplay / this.maxHp, 0, 1), low = fr <= 0.3;
            ctx.save();
            if (hit > 0) { ctx.translate(this.x, cy); ctx.scale(1 + hit * 0.05, 1 + hit * 0.45); ctx.translate(-this.x, -cy); }  // swell on hit
            ctx.fillStyle = "rgba(0,0,0,0.82)"; ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);   // outline
            ctx.fillStyle = "#39343f"; ctx.fillRect(x, y, w, h);                                // track
            if (fl > fr) { ctx.fillStyle = CONFIG.colors.slam; ctx.fillRect(x + w * fr, y, w * (fl - fr), h); }  // lagging damage chip
            ctx.fillStyle = low ? CONFIG.colors.charger : "#fff"; ctx.fillRect(x, y, w * fr, h);                 // current hp (warns red when low)
            if (hit > 0) { ctx.globalAlpha = hit * 0.7; ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w * fr, h); ctx.globalAlpha = 1; }  // hit flash
            ctx.fillStyle = low ? CONFIG.colors.charger : CONFIG.colors.eye; ctx.fillRect(x + w * fr - 1.5, y - 1, 2.5, h + 2);        // bright leading edge
            if (shielded) { ctx.fillStyle = CONFIG.colors.perfect; ctx.fillRect(x, y - 5, w * clamp(this.shield / this.maxShield, 0, 1), 3); }  // warded shield
            // status pips above the bar (bleed / burn / mark)
            if (status) {
              let sx = x; const sy = y - (shielded ? 9 : 5) - 4;
              if (this.bleedStacks > 0) { ctx.fillStyle = CONFIG.colors.charger; ctx.fillRect(sx, sy, 4, 4); sx += 6; }
              if (this.burnT > 0) { ctx.fillStyle = CONFIG.colors.slam; ctx.fillRect(sx, sy, 4, 4); sx += 6; }
              if (this.markT > 0) { ctx.fillStyle = CONFIG.colors.eye; ctx.fillRect(sx, sy, 4, 4); }
              if (this.seamT > 0) { sx += 6; ctx.fillStyle = CONFIG.colors.perfect; ctx.fillRect(sx, sy, 2, 6); }
              if (this.severT > 0) { sx += 6; ctx.fillStyle = "#b06cff"; ctx.fillRect(sx, sy, 4, 4); }
              if (this.breakPressure > 0) { sx += 6; ctx.fillStyle = CONFIG.colors.armoredShield; ctx.fillRect(sx, sy, 5, 3); }
            }
            ctx.restore();
          }
      });

      Object.assign(types.Charger.prototype, {
        _drawWeapon(this: RenderInstance<"Charger">, ctx: CanvasRenderingContext2D, dir: number) {
            let type = null;
            if (this.behavior === "gravedigger") type = "shovel";
            else if (this.behavior === "executioner") type = "axe";
            else if (this.behavior === "duelist") type = "sword";
            else if (this.contactReach > 14) type = "club";
            if (!type) return;
            const hx = this.x + dir * this.hw * 0.5, hy = this.y - 2;
            const len = type === "shovel" ? 54 : type === "axe" ? 48 : Math.max(28, this.hw + this.contactReach);
            const a = this.weaponA, tx = hx + dir * Math.cos(a) * len, ty = hy + Math.sin(a) * len;
            // swoosh wedge between the previous and current angle while swinging fast
            if (Math.abs(this.weaponA - this.weaponPrevA) > 0.05) {
              ctx.fillStyle = CONFIG.colors.bladeTrail; ctx.globalAlpha = 0.28;
              ctx.beginPath(); ctx.moveTo(hx, hy);
              for (let s = 0; s <= 1; s += 0.2) { const aa = this.weaponPrevA + (a - this.weaponPrevA) * s; ctx.lineTo(hx + dir * Math.cos(aa) * len, hy + Math.sin(aa) * len); }
              ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
            }
            ctx.strokeStyle = THEME.ink; ctx.lineCap = "round"; ctx.lineWidth = type === "club" ? 6 : 5;
            ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
            ctx.save(); ctx.translate(tx, ty); ctx.rotate(Math.atan2(ty - hy, tx - hx)); ctx.fillStyle = THEME.ink;
            if (type === "axe") { ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(11, -13); ctx.lineTo(13, 0); ctx.lineTo(11, 13); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill(); }
            else if (type === "shovel") { ctx.fillRect(-2, -11, 15, 22); }
            else if (type === "club") { ctx.beginPath(); ctx.arc(5, 0, 8, 0, Math.PI * 2); ctx.fill(); }
            else { ctx.fillRect(0, -2.5, 18, 5); }   // sword: extend the blade
            ctx.restore();
          },
        draw(this: RenderInstance<"Charger">, ctx: CanvasRenderingContext2D) {
            const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
            const dir = this.atkDir || Math.sign(this.vx) || 1;

            // Executioner: an overhead slam warning (ground lines both sides + rising marker)
            if (this.behavior === "executioner" && this.atk === "windup") {
              const k = 1 - clamp(this.atkT / (this.atkMax || 1), 0, 1), gy = this.y + this.hh;
              ctx.strokeStyle = CONFIG.colors.slam; ctx.globalAlpha = 0.3 + 0.55 * k; ctx.lineWidth = 3 + k * 4;
              ctx.beginPath(); ctx.moveTo(this.x - (50 + 150 * k), gy - 2); ctx.lineTo(this.x + (50 + 150 * k), gy - 2); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(this.x, y - 8 - 30 * k); ctx.lineTo(this.x, y - 6); ctx.stroke();
              ctx.globalAlpha = 1;
            }
            // Gravedigger: a wide arc telegraph out at mid-range (point-blank is safe)
            if (this.behavior === "gravedigger" && (this.atk === "windup" || this.atk === "swing")) {
              const k = this.atk === "swing" ? 1 : 1 - clamp(this.atkT / (this.atkMax || 1), 0, 1);
              const sx = this.x + this.atkDir * CONFIG.exotic.gravReach, gy = this.y + this.hh;
              ctx.strokeStyle = CONFIG.colors.slam; ctx.globalAlpha = 0.3 + 0.5 * k; ctx.lineWidth = 4;
              ctx.beginPath(); ctx.arc(sx, gy, 26 + 30 * k, Math.PI, Math.PI * 2); ctx.stroke();
              ctx.globalAlpha = 1;
            }

            // bull charge wind-up telegraph: a building dashed arrow — longer/thicker for a
            // higher-power (longer wind-up) charge, so you can read how hard it's coming
            if (this.behavior === "bull" && this.atk === "windup" && !this.feint) {
              const k = 1 - clamp(this.atkT / (this.atkMax || 0.55), 0, 1);
              const reach = 40 + (60 + this.chargePower * 130) * k;
              ctx.strokeStyle = this.color; ctx.globalAlpha = 0.35 + 0.45 * k; ctx.lineWidth = 3 + this.chargePower * 2; ctx.setLineDash([7, 5]);
              ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.atkDir * reach, this.y); ctx.stroke();
              ctx.setLineDash([]); ctx.globalAlpha = 1;
            }

            ctx.fillStyle = this.flash > 0 ? "#fff" : (this.stun > 0 ? "#d7b3b3" : this.color);
            const _rim = !(GFX.low);
            if (_rim) { ctx.shadowColor = THEME.rim; ctx.shadowBlur = 6; }   // separating halo (esp. dark-bodied enemies on dark biomes)
            ctx.fillRect(x, y, w, h);
            ctx.shadowBlur = 0;
            ctx.strokeStyle = THEME.ink; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);

            // variant accents
            if (this.behavior === "bull") {                 // horns
              ctx.fillStyle = THEME.ink;
              ctx.fillRect(x + 2, y - 6, 5, 6); ctx.fillRect(x + w - 7, y - 6, 5, 6);
            } else if (this.behavior === "stalker") {        // shoulder spikes
              ctx.fillStyle = THEME.ink;
              ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 6); ctx.lineTo(x, y + 10); ctx.fill();
              ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + 6, y + 6); ctx.lineTo(x + w, y + 10); ctx.fill();
            }

            // eye (x-ed out while stunned)
            ctx.fillStyle = "#fff";
            if (this.stun > 0) { ctx.fillStyle = THEME.ink; ctx.font = UI.font(11, true); ctx.textAlign = "center"; ctx.fillText("x x", this.x, y + 16); }
            else ctx.fillRect(this.x + dir * 7 - 3, y + 11, 6, 6);

            // brawler fists (cock back on windup, extend on the punch)
            if (this.behavior === "brawler") {
              ctx.fillStyle = THEME.ink;
              const ext = this.atk === "commit" ? 12 : (this.atk === "windup" ? -3 : 4);
              ctx.fillRect(this.x + dir * (this.hw + ext) - 4, this.y - 3, 8, 9);
            }

            // animated weapon (Armed club, Gravedigger shovel, Executioner axe, Duelist sword)
            this._drawWeapon(ctx, dir);
            this.drawHpBar(ctx);
          }
      });

      Object.assign(types.Ranged.prototype, {
        draw(this: RenderInstance<"Ranged">, ctx: CanvasRenderingContext2D, player?: EnemyPlayerPort) {
            const r = this.hw + 2, b = this.behavior;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y - r); ctx.lineTo(this.x + r, this.y);
            ctx.lineTo(this.x, this.y + r); ctx.lineTo(this.x - r, this.y);
            ctx.closePath();
            ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
            if (!(GFX.low)) { ctx.shadowColor = THEME.rim; ctx.shadowBlur = 6; } ctx.fill(); ctx.shadowBlur = 0;
            ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2.5; ctx.stroke();

            // variant accents
            if (b === "sentinel") { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, Math.PI * 2); ctx.fill(); }
            else if (b === "marksman") { ctx.fillStyle = THEME.ink; ctx.fillRect(this.x - 2, this.y - r - 4, 4, 6); }

            // aim telegraph during wind-up
            if (this.state === "windup" && player) {
              const k = 1 - clamp(this.windT / (this.windMax || this.cfg.windup), 0, 1);
              const dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
              const sentinel = b === "sentinel", marksman = b === "marksman";
              ctx.strokeStyle = THEME.ink; ctx.globalAlpha = sentinel ? 0.5 + 0.4 * k : 0.7;
              if (sentinel) ctx.setLineDash([]); else ctx.setLineDash([5, 6]);
              ctx.lineWidth = sentinel ? 1.2 : 1.5;
              ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + (dx / m) * 620, this.y + (dy / m) * 620); ctx.stroke();
              ctx.setLineDash([]); ctx.globalAlpha = 1;
              // a tracking dot at the player + a closing ring; marksman charges a growing orb
              if (sentinel) { ctx.fillStyle = CONFIG.colors.enemyShot; ctx.beginPath(); ctx.arc(player.x, player.y, 5, 0, Math.PI * 2); ctx.fill(); }
              if (marksman) {
                ctx.fillStyle = CONFIG.colors.enemyShot; ctx.globalAlpha = 0.4 + 0.5 * k;
                ctx.beginPath(); ctx.arc(this.x, this.y, 4 + k * (CONFIG.chargedShot.r - 2), 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
              } else {
                ctx.lineWidth = 2; ctx.strokeStyle = THEME.ink;
                ctx.beginPath(); ctx.arc(this.x, this.y, 26 * (1 - k) + 6, 0, Math.PI * 2); ctx.stroke();
              }
            }
            this.drawHpBar(ctx);
          }
      });
}

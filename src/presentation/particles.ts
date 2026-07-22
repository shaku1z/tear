// ------- lightweight FX: sparks + shockwave rings + shards (color-aware) -------
import { A11Y, CONFIG, GFX } from "../config/game-config";
import { clamp } from "../domain/geometry";
import { cosmeticRandom } from "./cosmetic-random";

interface ViewRect { left: number; top: number; right: number; bottom: number }
interface ParticleBase { type: string; x: number; y: number; life: number; max: number; col?: string | null; critical?: boolean }
interface SparkParticle extends ParticleBase { type: "spark"; vx: number; vy: number }
interface RingParticle extends ParticleBase { type: "ring"; r: number }
interface RibbonParticle extends ParticleBase { type: "ribbon"; x1: number; y1: number }
interface ShardParticle extends ParticleBase { type: "shard"; vx: number; vy: number; rot: number; spin: number; size: number }
interface FlashParticle extends ParticleBase { type: "flash"; r: number }
interface ShockParticle extends ParticleBase { type: "shock"; r: number; vr: number; thick: number }
interface SmokeParticle extends ParticleBase { type: "smoke"; vx: number; vy: number; size: number }
interface GhostParticle extends ParticleBase { type: "ghost"; hw: number; hh: number }
interface EmberParticle extends ParticleBase { type: "ember"; vx: number; vy: number; size: number }
interface DripParticle extends ParticleBase { type: "drip"; vx: number; vy: number; size: number }
type Particle = SparkParticle | RingParticle | RibbonParticle | ShardParticle | FlashParticle | ShockParticle | SmokeParticle | GhostParticle | EmberParticle | DripParticle;

export interface ParticleSystem {
  list: Particle[];
  view: ViewRect | null;
  _criticalCursor: number;
  reset(): void;
  setViewRect(view: ViewRect | null): void;
  _visible(particle: Particle, extra: number): boolean;
  _emit(particle: Particle, critical: boolean): boolean;
  spark(x: number, y: number, dirX: number, dirY: number, color?: string): void;
  burst(x: number, y: number, dirX: number, dirY: number, count: number, color?: string): void;
  ring(x: number, y: number, radius?: number, color?: string): void;
  ribbon(x0: number, y0: number, x1: number, y1: number, color?: string): void;
  shard(x: number, y: number, color?: string): void;
  death(x: number, y: number, count?: number, color?: string): void;
  flash(x: number, y: number, radius?: number, color?: string): void;
  shockwave(x: number, y: number, radius?: number, color?: string, maxRadius?: number, thickness?: number): void;
  smoke(x: number, y: number, color?: string): void;
  explode(x: number, y: number, color?: string, scale?: number): void;
  ghost(x: number, y: number, halfWidth: number, halfHeight: number, color?: string): void;
  ember(x: number, y: number, color?: string): void;
  drip(x: number, y: number, color?: string): void;
  update(dt: number): void;
  draw(context: CanvasRenderingContext2D): void;
}

const FX: ParticleSystem = {
  list: [],
  view: null,
  _criticalCursor: 0,

  reset() { this.list.length = 0; this.view = null; this._criticalCursor = 0; },
  setViewRect(view) {
    if (!view) { this.view = null; return; }
    this.view ??= { left: 0, top: 0, right: 0, bottom: 0 };
    this.view.left = view.left; this.view.top = view.top; this.view.right = view.right; this.view.bottom = view.bottom;
  },
  _visible(p, extra) {
    if (!this.view) return true;
    const radius = "r" in p ? p.r : "size" in p ? p.size : 0;
    const endX = p.type === "ribbon" ? p.x1 : p.x;
    const endY = p.type === "ribbon" ? p.y1 : p.y;
    const m = extra + radius, x0 = Math.min(p.x, endX), x1 = Math.max(p.x, endX);
    const y0 = Math.min(p.y, endY), y1 = Math.max(p.y, endY);
    return x1 + m >= this.view.left && x0 - m <= this.view.right && y1 + m >= this.view.top && y0 - m <= this.view.bottom;
  },
  _emit(p, critical) {
    const E = CONFIG.effects, budget = GFX.low ? E.lowBudget : E.highBudget;
    if (!this._visible(p, E.cullMargin)) return false;
    p.critical = critical;
    if (this.list.length >= budget) {
      if (!critical) return false;
      let replace = -1;
      for (let i = 0; i < this.list.length; i++) {
        const particle = this.list[i];
        if (particle && !particle.critical) { replace = i; break; }
      }
      if (replace < 0) replace = this._criticalCursor++ % this.list.length;
      this.list[replace] = p; return true;
    }
    this.list.push(p); return true;
  },

  spark(x, y, dirX, dirY, col) {
    const a = Math.atan2(dirY, dirX) + (cosmeticRandom() - 0.5) * 1.3;
    const sp = 220 + cosmeticRandom() * 460;
    this._emit({
      type: "spark", x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      col: col ?? "#000",
      life: 0.22 + cosmeticRandom() * 0.12, max: 0.34,
    }, false);
  },

  burst(x, y, dirX, dirY, n, col) {
    for (let i = 0; i < n; i++) this.spark(x, y, dirX, dirY, col);
  },

  ring(x, y, r0, col) {
    this._emit({ type: "ring", x, y, r: r0 ?? 6, col: col ?? "#000", life: 0.32, max: 0.32 }, false);
  },

  ribbon(x0, y0, x1, y1, col) {
    this._emit({ type: "ribbon", x: x0, y: y0, x1, y1, col: col ?? "#ff8a1e", life: 0.34, max: 0.34 }, true);
  },

  // a spinning shard (used for enemy death shatter)
  shard(x, y, col) {
    const a = cosmeticRandom() * Math.PI * 2;
    const sp = 160 + cosmeticRandom() * 460;
    this._emit({
      type: "shard", x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
      rot: cosmeticRandom() * Math.PI, spin: (cosmeticRandom() - 0.5) * 18,
      size: 5 + cosmeticRandom() * 7, col: col ?? "#000",
      life: 0.4 + cosmeticRandom() * 0.25, max: 0.65,
    }, false);
  },

  death(x, y, n, col) {
    for (let i = 0; i < (n ?? 11); i++) this.shard(x, y, col);
    this.ring(x, y, 10, col);
    this.ring(x, y, 4, col);
  },

  // ---- explosion kit: a bright flash, expanding shockwave rings, smoke ----
  flash(x, y, r, col) { this._emit({ type: "flash", x, y, r: r ?? 50, col: col ?? "#fff", life: 0.18, max: 0.18 }, true); },
  shockwave(x, y, r0, col, maxR, thick) {
    const life = 0.42, radius = r0 ?? 10;
    this._emit({ type: "shock", x, y, r: radius, vr: ((maxR ?? 160) - radius) / life, col: col ?? "#fff", thick: thick ?? 6, life, max: life }, true);
  },
  smoke(x, y, col) {
    this._emit({ type: "smoke", x: x + (cosmeticRandom() - 0.5) * 16, y, vx: (cosmeticRandom() - 0.5) * 40, vy: -30 - cosmeticRandom() * 55, size: 9 + cosmeticRandom() * 13, col: col ?? "#33323a", life: 0.5 + cosmeticRandom() * 0.45, max: 0.95 }, false);
  },
  // a full explosion: flash core + double shockwave + sparks + shards + embers + smoke.
  explode(x, y, col, scale) {
    scale ??= 1;
    const low = GFX.low;
    this.flash(x, y, 54 * scale, col);
    this.shockwave(x, y, 16 * scale, col, 175 * scale, 7 * scale);
    this.shockwave(x, y, 6 * scale, "#ffffff", 112 * scale, 3 * scale);
    this.burst(x, y, 0, -0.3, low ? 8 : Math.round(18 * scale), col);
    for (let i = 0; i < (low ? 4 : Math.round(9 * scale)); i++) this.shard(x, y, col);
    if (!low) { for (let i = 0; i < Math.round(5 * scale); i++) this.ember(x, y - 6, col); for (let i = 0; i < Math.round(3 * scale); i++) this.smoke(x, y - 4); }
  },

  // a fading silhouette (dash afterimage). col tints it (e.g. fire for Cinder Trail)
  ghost(x, y, hw, hh, col) {
    this._emit({ type: "ghost", x, y, hw, hh, col: col ?? null, life: 0.22, max: 0.22 }, false);
  },

  // a rising, flickering fire ember (burn / flame dash)
  ember(x, y, col) {
    this._emit({
      type: "ember", x: x + (cosmeticRandom() - 0.5) * 12, y: y + (cosmeticRandom() - 0.5) * 8,
      vx: (cosmeticRandom() - 0.5) * 50, vy: -70 - cosmeticRandom() * 120,
      col: col ?? (cosmeticRandom() < 0.5 ? "#ff8a1e" : "#ffd23e"),
      size: 2.5 + cosmeticRandom() * 3.5, life: 0.35 + cosmeticRandom() * 0.35, max: 0.7,
    }, false);
  },

  // a falling blood drip (bleed)
  drip(x, y, col) {
    this._emit({
      type: "drip", x: x + (cosmeticRandom() - 0.5) * 10, y,
      vx: (cosmeticRandom() - 0.5) * 36, vy: 20 + cosmeticRandom() * 70,
      col: col ?? "#b81d1d", size: 3 + cosmeticRandom() * 3, life: 0.45 + cosmeticRandom() * 0.3, max: 0.75,
    }, false);
  },

  update(dt) {
    const motion = A11Y.reducedMotion ? 0.25 : 1;
    for (const p of this.list) {
      p.life -= dt;
      if (p.type === "spark") {
        p.x += p.vx * dt * motion;
        p.y += p.vy * dt * motion;
        p.vy += 1300 * dt;   // gravity on sparks
        p.vx *= 0.9;
      } else if (p.type === "ring") {
        p.r += 820 * dt * motion;
      } else if (p.type === "shard") {
        p.x += p.vx * dt * motion; p.y += p.vy * dt * motion;
        p.vy += 1500 * dt; p.vx *= 0.92;
        p.rot += p.spin * dt * motion;
      } else if (p.type === "ember") {
        p.x += p.vx * dt * motion; p.y += p.vy * dt * motion;
        p.vy *= 0.97; p.vx *= 0.94;   // buoyant: coast upward, slowing
      } else if (p.type === "drip") {
        p.x += p.vx * dt * motion; p.y += p.vy * dt * motion;
        p.vy += 680 * dt;             // gravity
      } else if (p.type === "shock") {
        p.r += p.vr * dt * motion;
      } else if (p.type === "smoke") {
        p.x += p.vx * dt * motion; p.y += p.vy * dt * motion;
        p.vy *= 0.96; p.vx *= 0.95; p.size += 26 * dt * motion;   // rise + billow
      }
      // flash + ghosts just fade in place
    }
    let write = 0; for (const particle of this.list) if (particle.life > 0) this.list[write++] = particle; this.list.length = write;
  },

  draw(ctx) {
    for (const p of this.list) {
      if (!this._visible(p, 24)) continue;
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      const col = p.col ?? "#000";
      if (p.type === "spark") {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.018, p.y - p.vy * 0.018);
        ctx.stroke();
      } else if (p.type === "ring") {
        ctx.strokeStyle = col;
        ctx.lineWidth = 3 * a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === "ribbon") {
        ctx.strokeStyle = col; ctx.lineWidth = 3 + a * 4; ctx.lineCap = "round";
        const mx = (p.x + p.x1) * 0.5, my = Math.min(p.y, p.y1) - 55 * (1 - a * 0.35);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(mx, my, p.x1, p.y1); ctx.stroke();
        ctx.globalAlpha = a * 0.72; ctx.strokeStyle = "#fff1c2"; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (p.type === "shard") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = col;
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.6); ctx.lineTo(-s * 0.7, s * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.type === "ghost") {
        ctx.globalAlpha = a * (p.col ? 0.5 : 0.35);
        ctx.fillStyle = p.col ?? "#000";
        ctx.fillRect(p.x - p.hw, p.y - p.hh, p.hw * 2, p.hh * 2);
      } else if (p.type === "ember") {
        ctx.globalAlpha = a * 0.95;
        ctx.fillStyle = col;
        const s = p.size * (0.5 + a * 0.5);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.type === "drip") {
        ctx.globalAlpha = a;
        ctx.fillStyle = col;
        ctx.fillRect(p.x - 1.5, p.y - p.size, 3, p.size + 1);
      } else if (p.type === "flash") {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const rr = p.r * (1.4 - a * 0.4);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
        g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, col); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = a * 0.7; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (p.type === "shock") {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = a * 0.85; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, p.thick * a);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      } else {
        ctx.globalAlpha = a * 0.26; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },
};

export { FX };

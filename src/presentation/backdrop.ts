// ------- biome backdrop: parallax sky, distant ridges, ambient motes, depth + post -------
// Turns the flat per-stage tint into a layered, moving scene. Drawn in three places:
//   Backdrop.draw(...)      — inside the world camera, BEFORE platforms (sky + parallax + motes)
//   Backdrop.platform(...)  — per platform, gives ledges/floor depth (gradient + edge + shadow)
//   Backdrop.post(...)      — screen space, AFTER the world, BEFORE the HUD (vignette + grain)
// Phase 2 ships a strong generic treatment driven by each stage's palette; Phase 3 layers in
// per-biome art (silhouettes, biome particles, set dressing) on top of this engine.
import { A11Y, CLOCK, CONFIG, GFX, OVERSCAN, THEME, _relLum } from "../config/game-config";
import type { STAGES as StageValues } from "../gameplay/stages";
import { BIOME_ART } from "./backdrop-biomes";
import { clamp, lerp } from "../domain/geometry";
import { VoidGen } from "../gameplay/voidgen";
import type { VoidPlatform } from "../gameplay/voidgen";

function truthyString(value: string | undefined, fallback: string): string {
  if (value) return value;
  return fallback;
}

function truthyNumber(value: number | undefined, fallback: number): number {
  if (value) return value;
  return fallback;
}

export type Stage = (typeof StageValues)[number];
export interface ViewRect { left: number; top: number; right: number; bottom: number }
interface CameraPort { scale: number; cx: number; cy: number; ox: number; oy: number }
interface Mote { x: number; y: number; z: number; r: number; ph: number; sp: number }
export interface BackdropCache { vign: HTMLCanvasElement; dark: boolean; parts: Mote[]; accent: string; _vw: number; _vh: number }
interface MoteStyle { rgb?: string; dir?: number; glow?: boolean; twinkle?: boolean; drift?: number; aMul?: number; sizeMul?: number }
interface PlatformPort {
  x: number; y: number; w: number; h: number;
  materializationState?: string; hazardSeed?: number; voidType?: string; touchT?: number; fireState?: string;
  arenaPlatId?: string | number; arenaState?: string; arenaMaterial?: string; material?: string;
  stress?: number; crackWarn?: number; respawnIn?: number; respawnWarn?: number; void?: boolean;
}
interface LocalFlare { screen: false; x: number; y: number; col: string; r: number; life: number; end: number }
interface ScreenBloom { screen: true; col: string; strength: number; life: number; end: number }
type BackdropEffect = LocalFlare | ScreenBloom;
export interface BackdropController {
  readonly W: number; readonly H: number; readonly PX: number; readonly PY: number;
  _cache: Record<string, BackdropCache>; _fx: BackdropEffect[];
  fillFull(context: CanvasRenderingContext2D, view?: ViewRect): void; resetFx(): void;
  _rgb(hex?: string): [number, number, number]; _mix(a: string, b: string, amount: number): string;
  _lighten(color: string, amount: number): string; _darken(color: string, amount: number): string;
  _rgba(hex: string, alpha: number): string; _rng(seed: number): () => number;
  _cellRand(x: number, y: number, salt: number): number;
  _build(stage: Stage): BackdropCache; _get(stage: Stage): BackdropCache;
  draw(context: CanvasRenderingContext2D, stage: Stage, time: number, playerX: number, view?: ViewRect): void;
  baseSky(context: CanvasRenderingContext2D, stage: Stage, cache: BackdropCache, groundY: number, glowAlpha?: number, view?: ViewRect): void;
  ridge(context: CanvasRenderingContext2D, groundY: number, offset: number, base: number, amplitude: number, frequency: number, phase: number, color: string, alpha: number, view?: ViewRect): void;
  motes(context: CanvasRenderingContext2D, cache: BackdropCache, time: number, playerX: number, style?: MoteStyle, view?: ViewRect): void;
  voidPlatform(context: CanvasRenderingContext2D, platform: PlatformPort, stage: Stage): void;
  arenaPlatform(context: CanvasRenderingContext2D, platform: PlatformPort): void;
  platform(context: CanvasRenderingContext2D, platform: PlatformPort, stage: Stage, isFloor?: boolean, view?: ViewRect): void;
  flare(x: number, y: number, color: string, radius: number, life: number): void;
  bloom(color: string, strength: number, life: number): void;
  drawFx(context: CanvasRenderingContext2D, camera?: CameraPort): void;
  post(context: CanvasRenderingContext2D, stage: Stage, camera?: CameraPort): void;
}
export interface BiomeArt {
  sky(backdrop: BackdropController, context: CanvasRenderingContext2D, stage: Stage, cache: BackdropCache, time: number, groundY: number, view?: ViewRect): void;
  far(backdrop: BackdropController, context: CanvasRenderingContext2D, stage: Stage, cache: BackdropCache, time: number, playerX: number, groundY: number, view?: ViewRect): void;
  motes(backdrop: BackdropController, context: CanvasRenderingContext2D, stage: Stage, cache: BackdropCache, time: number, playerX: number, view?: ViewRect): void;
}

const Backdrop: BackdropController = {
  get W() { return CONFIG.view.w; },
  get H() { return CONFIG.view.h; },
  // fullscreen overscan bleed (logical px per side) — scene fills extend this far
  // beyond the arena so true fullscreen never letterboxes
  get PX() { return (typeof OVERSCAN !== "undefined") ? OVERSCAN.x : 0; },
  get PY() { return (typeof OVERSCAN !== "undefined") ? OVERSCAN.y : 0; },
  // World-camera draws may reveal more than fullscreen OVERSCAN when the camera
  // pulls out.  Callers pass that inverse-camera rectangle through `view`; screen-
  // space callers (post/Fx/replays) keep the original fullscreen bounds.
  fillFull(ctx, view) {
    const l = view ? view.left : -this.PX, t = view ? view.top : -this.PY;
    const r = view ? view.right : this.W + this.PX, b = view ? view.bottom : this.H + this.PY;
    ctx.fillRect(l, t, r - l, b - t);
  },
  _cache: {},                 // stage.name -> baked + spec
  _fx: [],                    // transient reactive lights (combat -> backdrop)
  resetFx() { this._fx.length = 0; },

  // --- self-contained colour utils (game.js's blendCol is IIFE-local) ---
  _rgb(hex) { hex = truthyString(hex, "#000").replace("#", ""); if (hex.length === 3) hex = hex.split("").map((c) => c + c).join(""); return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]; },
  _mix(a, b, t) { const x = this._rgb(a), y = this._rgb(b); return `rgb(${String(Math.round(lerp(x[0], y[0], t)))},${String(Math.round(lerp(x[1], y[1], t)))},${String(Math.round(lerp(x[2], y[2], t)))})`; },
  _lighten(c, t) { return this._mix(c, "#ffffff", t); },
  _darken(c, t) { return this._mix(c, "#000000", t); },
  _rgba(hex, a) { const c = this._rgb(hex); return `rgba(${String(c[0])},${String(c[1])},${String(c[2])},${String(a)})`; },
  _rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; },
  // Allocation-free signed-cell hash.  Biome dressing uses it instead of frame
  // RNG, so easing the camera in/out only reveals more of the same world.
  _cellRand(x, y, salt) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  },

  _build(stage) {
    const dark = _relLum(stage.bg) < 0.5;
    // bake the EXPENSIVE bits once: vignette + film grain (half-res; scaled on blit)
    const lw = Math.round(this.W / 2), lh = Math.round(this.H / 2);
    const vign = globalThis.document.createElement("canvas"); vign.width = lw; vign.height = lh;
    const v = vign.getContext("2d");
    if (!v) throw new Error("Backdrop canvas 2D context is unavailable");
    const vg = v.createRadialGradient(lw / 2, lh * 0.46, lh * 0.32, lw / 2, lh * 0.5, lw * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, dark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.20)");
    v.fillStyle = vg; v.fillRect(0, 0, lw, lh);
    const r = this._rng(stage.name.length * 131 + 7);
    v.globalAlpha = dark ? 0.05 : 0.035;
    for (let i = 0; i < 1500; i++) { const x = r() * lw, y = r() * lh, sz = r() * 1.4; v.fillStyle = r() > 0.5 ? "#fff" : "#000"; v.fillRect(x, y, sz, sz); }
    v.globalAlpha = 1;

    // ambient motes (generic dust; Phase 3 swaps per biome)
    const parts = [];
    for (let i = 0; i < 40; i++) parts.push({ x: r() * this.W, y: r() * this.H, z: 0.3 + r() * 0.9, r: 0.6 + r() * 2.0, ph: r() * 6.28, sp: 5 + r() * 14 });

    const cache = { vign, dark, parts, accent: stage.accent, _vw: this.W, _vh: this.H };
    this._cache[stage.name] = cache;
    return cache;
  },
  _get(stage) { const c = this._cache[stage.name]; if (c?._vw === this.W && c._vh === this.H) return c; return this._build(stage); },

  // === sky + parallax + motes (inside world camera, before platforms) ===
  // dispatches to per-biome art (BIOME_ART), falling back to the generic treatment.
  draw(ctx, stage, t, playerX, view) {
    const c = this._get(stage), gy = CONFIG.world.groundY;
    const px = (playerX - this.W / 2) / (this.W / 2);   // -1..1, drives parallax
    const art = BIOME_ART[stage.name] ?? BIOME_ART._default;
    if (!art) throw new Error("Backdrop default biome art is unavailable");
    art.sky(this, ctx, stage, c, t, gy, view);
    art.far(this, ctx, stage, c, t, px, gy, view);
    art.motes(this, ctx, stage, c, t, px, view);
  },

  // base sky used by every biome: vertical gradient from the stage bg + a horizon accent glow
  baseSky(ctx, stage, c, gy, glowA, view) {
    const W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, this._lighten(stage.bg, c.dark ? 0.06 : 0.10));
    g.addColorStop(0.55, stage.bg);
    g.addColorStop(1, this._darken(stage.bg, c.dark ? 0.18 : 0.05));
    ctx.fillStyle = g; this.fillFull(ctx, view);
    const rg = ctx.createRadialGradient(W / 2, gy, 40, W / 2, gy, W * 0.6);
    rg.addColorStop(0, this._rgba(stage.accent, glowA ?? (c.dark ? 0.22 : 0.13)));
    rg.addColorStop(1, this._rgba(stage.accent, 0));
    ctx.fillStyle = rg; this.fillFull(ctx, view);
  },

  // a rolling silhouette band along the horizon (parallax)
  ridge(ctx, gy, off, base, amp, freq, phase, col, alpha, view) {
    const vl = view ? view.left : -this.PX, vr = view ? view.right : this.W + this.PX;
    const bleed = 90 + Math.abs(off), lo = vl - bleed, hi = vr + bleed;
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(lo, gy);
    for (let x = lo; x <= hi; x += 80) { const h = base + amp * Math.sin(x * freq + phase); ctx.lineTo(x + off, gy - h); }
    ctx.lineTo(hi, gy); ctx.closePath(); ctx.fill();
    ctx.restore();
  },

  // parameterised ambient particles. style: { rgb, dir(+down/-up), glow, twinkle, drift, aMul }
  motes(ctx, c, t, px, style, view) {
    const W = this.W, s = style ?? {};
    // Wrap across the current inverse-camera span so a pull-out does not leave a
    // conspicuously empty fringe.  The particles remain bounded (40 at all zooms).
    const vl = view ? view.left : -this.PX, vt = view ? view.top : -this.PY;
    const vr = view ? view.right : W + this.PX, vb = view ? view.bottom : this.H + this.PY;
    const Wp = vr - vl, Hp = vb - vt + 80;
    const rgb = truthyString(s.rgb, c.dark ? "236,235,246" : "20,20,30");
    const dir = s.dir ?? 1, drift = s.drift ?? 14, aMul = s.aMul ?? 1;
    if (GFX.low) return;   // skip ambient motes on low-end
    ctx.save();
    if (s.glow) { ctx.shadowColor = `rgba(${rgb},0.9)`; ctx.shadowBlur = 8; }
    for (const p of c.parts) {
      const y = ((p.y - vt + dir * t * p.sp) % Hp + Hp) % Hp + vt - 40;
      let x = p.x - px * 38 * p.z + Math.sin(t * 0.3 + p.ph) * drift;
      x = ((x - vl) % Wp + Wp) % Wp + vl;
      const tw = s.twinkle ? (0.25 + 0.75 * Math.abs(Math.sin(t * 1.4 + p.ph))) : (0.45 + 0.55 * Math.sin(t * 0.6 + p.ph));
      ctx.globalAlpha = (c.dark ? 0.5 : 0.28) * p.z * tw * aMul;
      ctx.fillStyle = `rgba(${rgb},1)`;
      const sizeMultiplier = truthyNumber(s.sizeMul, 1);
      ctx.beginPath(); ctx.arc(x, y, p.r * p.z * sizeMultiplier, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();
  },

  // Native Void ruin: the collision body stays a reliable rectangle, while the
  // art reads as a torn piece of the biome rather than a lane-coded game tile.
  voidPlatform(ctx, p, stage) {
    const now = CLOCK.sim * 1000, low = GFX.low;
    const forming = p.materializationState === "forming", alpha = forming ? 0.55 : 1;
    const seed = (p.hazardSeed ?? 0) >>> 0, chipL = 5 + seed % 11, chipR = 7 + (seed >>> 5) % 13;
    const mineral = stage.plat;
    const accent = stage.accent;
    ctx.save(); ctx.globalAlpha = alpha;

    if (!low) {
      ctx.fillStyle = this._rgba(accent, forming ? 0.20 : 0.10);
      ctx.beginPath(); ctx.ellipse(p.x + p.w * 0.5, p.y + p.h + 9, p.w * 0.48, 13, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const sx = p.x + ((seed >>> (i * 6)) % 97) / 97 * p.w;
        ctx.globalAlpha = alpha * (0.22 - i * 0.04); ctx.fillStyle = mineral;
        ctx.beginPath(); ctx.moveTo(sx, p.y + p.h + 3); ctx.lineTo(sx + 5, p.y + p.h + 13 + i * 5); ctx.lineTo(sx + 10, p.y + p.h + 2); ctx.fill();
      }
      ctx.globalAlpha = alpha;
    }

    const body = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    body.addColorStop(0, this._lighten(mineral, 0.08)); body.addColorStop(0.18, mineral); body.addColorStop(1, this._darken(mineral, 0.58));
    ctx.fillStyle = body; ctx.beginPath();
    ctx.moveTo(p.x + chipL, p.y); ctx.lineTo(p.x + p.w - chipR, p.y); ctx.lineTo(p.x + p.w, p.y + 5);
    ctx.lineTo(p.x + p.w - 5, p.y + p.h - 2); ctx.lineTo(p.x + p.w * 0.72, p.y + p.h + 7 + (seed % 7));
    ctx.lineTo(p.x + p.w * 0.48, p.y + p.h - 1); ctx.lineTo(p.x + p.w * 0.27, p.y + p.h + 6 + ((seed >>> 4) % 8));
    ctx.lineTo(p.x + 3, p.y + p.h - 2); ctx.lineTo(p.x, p.y + 5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = this._lighten(mineral, 0.32); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x + chipL, p.y + 1); ctx.lineTo(p.x + p.w - chipR, p.y + 1); ctx.stroke();

    if (p.voidType === "crumble") {
      const touchTime = p.touchT ?? -1;
      const k = touchTime < 0 ? 0 : 1 - clamp(touchTime / CONFIG.source.voidCrumbleStand, 0, 1);
      ctx.strokeStyle = "#fff"; ctx.globalAlpha = alpha * (0.34 + 0.62 * k); ctx.lineWidth = 1.5 + k * 1.5;
      const cracks = 2 + Math.floor(k * 4);
      ctx.beginPath();
      for (let i = 0; i < cracks; i++) {
        const x = p.x + p.w * (0.13 + ((i * 0.31 + (seed % 17) / 31) % 0.74));
        ctx.moveTo(x, p.y); ctx.lineTo(x + (i & 1 ? 10 : -9), p.y + p.h * (0.45 + k * 0.45));
      }
      ctx.stroke(); ctx.globalAlpha = alpha;
    } else if (p.voidType === "fire") {
      if (p.fireState === "arming") {
        const pulse = 0.55 + 0.45 * Math.sin(now / 85);
        const high = A11Y.highContrast;
        ctx.globalAlpha = alpha * (0.62 + pulse * 0.28); ctx.strokeStyle = high ? (THEME.dark ? "#fff36b" : "#4b00d1") : "#ffad35"; ctx.lineWidth = high ? 7 : 5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 3); ctx.lineTo(p.x + p.w, p.y - 3); ctx.stroke();
        if (high) for (let x = p.x + 18; x < p.x + p.w - 8; x += 34) { ctx.beginPath(); ctx.moveTo(x - 7, p.y - 18); ctx.lineTo(x, p.y - 9); ctx.lineTo(x + 7, p.y - 18); ctx.stroke(); }
        ctx.globalAlpha = alpha;
      } else if (p.fireState === "hot") {
        const tongues = low ? 5 : 9;
        ctx.fillStyle = "#ff8f2f"; ctx.beginPath(); ctx.moveTo(p.x, p.y);
        for (let i = 0; i <= tongues; i++) {
          const x = p.x + p.w * i / tongues, h = 12 + ((i * 17 + seed) % 19);
          ctx.lineTo(x, p.y - h); ctx.lineTo(Math.min(p.x + p.w, x + p.w / tongues * 0.55), p.y);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#fff4c7"; ctx.fillRect(p.x, p.y - 4, p.w, 4);
      }
    } else if (p.voidType === "cage" && typeof VoidGen !== "undefined") {
      const r = VoidGen.cageGeometry(p as VoidPlatform);
      if (!r) { ctx.restore(); return; }
      ctx.globalAlpha = alpha * 0.26; ctx.fillStyle = accent;
      ctx.beginPath(); ctx.moveTo(r.centerX, r.y); ctx.lineTo(r.x + r.w, r.y + r.h * 0.45); ctx.lineTo(r.centerX, r.y + r.h); ctx.lineTo(r.x, r.y + r.h * 0.55); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = alpha * 0.7; ctx.strokeStyle = this._lighten(accent, 0.35); ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = alpha;
    }
    ctx.restore();
  },

  // Living boss terrain. The same arenaState that controls collision also owns
  // every warning, fragment, and reform silhouette drawn here.
  arenaPlatform(ctx, p) {
    const A = CONFIG.bossArena, state = truthyString(p.arenaState, "stable");
    const mat = truthyString(p.arenaMaterial, truthyString(p.material, "arena"));
    const stressK = clamp((p.stress ?? 0) / A.standBeforeWarn, 0, 1);
    const warnK = state === "warning" ? 1 - clamp((p.crackWarn ?? 0) / A.crackWarn, 0, 1) : 0;
    const totalDown = A.brokenDuration + A.reformWarn;
    ctx.save();

    if (state === "broken") {
      const fallK = clamp((totalDown - (p.respawnIn ?? 0)) / 0.72, 0, 1);
      ctx.globalAlpha = 1 - fallK;
      for (let i = 0; i < 6; i++) {
        const sw = p.w / 6 + 1, inward = (2.5 - i) * fallK * 8;
        ctx.fillStyle = mat === "aldricStone" ? (i % 2 ? "#5c5656" : "#736a63") :
          (mat === "colossusGantry" ? (i % 2 ? "#60483a" : "#806042") : (i % 2 ? "#3d4854" : "#566270"));
        ctx.save(); ctx.translate(inward, fallK * (28 + (i % 3) * 18)); ctx.rotate((i - 2.5) * fallK * 0.09);
        ctx.fillRect(p.x + i * p.w / 6, p.y, sw, p.h); ctx.restore();
      }
      if (mat === "wardenSteel") {
        ctx.fillStyle = "#d0ad48"; ctx.globalAlpha = 1 - fallK;
        for (const x of [p.x + 10, p.x + p.w - 26]) {
          ctx.save(); ctx.translate(x, p.y + fallK * 74); ctx.rotate(fallK * 0.8); ctx.fillRect(0, 0, 16, 7); ctx.restore();
        }
      } else if (mat === "colossusGantry" && !GFX.low) {
        ctx.fillStyle = "#d7d2c8";
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = (1 - fallK) * (0.22 + i * 0.1);
          ctx.beginPath(); ctx.ellipse(p.x + p.w * (0.25 + i * 0.24), p.y - 8 - i * 12 - fallK * 24, 8 + i * 3, 5 + i * 2, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore(); return;
    }

    if (state === "reforming") {
      const respawnWarning = truthyNumber(p.respawnWarn, A.reformWarn);
      const k = 1 - clamp((p.respawnIn ?? 0) / respawnWarning, 0, 1);
      const col = mat === "aldricStone" ? "#d8b85e" : (mat === "colossusGantry" ? "#ef8f3a" : "#e4c85d");
      ctx.globalAlpha = 0.22 + k * 0.66; ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.setLineDash([10 - k * 5, 7]); ctx.strokeRect(p.x, p.y, p.w, p.h); ctx.setLineDash([]);
      // Material-specific reconstruction language stays readable in low effects.
      if (mat === "wardenSteel") {
        const scanX = p.x + p.w * k;
        ctx.globalAlpha = 0.35 + k * 0.45; ctx.fillStyle = col; ctx.fillRect(scanX - 3, p.y - 46, 6, 48 + p.h);
      } else if (mat === "colossusGantry") {
        ctx.globalAlpha = 0.42 + k * 0.4; ctx.fillStyle = "#5c4436";
        for (const x of [p.x + 28, p.x + p.w - 46]) ctx.fillRect(x, p.y + p.h, 18, 68 * k);
      } else {
        ctx.globalAlpha = 0.28 + k * 0.5;
        for (let i = 0; i < 5; i++) {
          const sw = p.w / 5 - 3, y = p.y + (1 - k) * (28 + (i % 2) * 20);
          ctx.strokeRect(p.x + i * p.w / 5 + 1, y, sw, p.h);
        }
      }
      ctx.restore(); return;
    }

    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(p.x + 5, p.y + p.h, p.w, 8);
    if (mat === "wardenSteel") {
      const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      g.addColorStop(0, "#637181"); g.addColorStop(1, "#303a45");
      ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = "#d0ad48";
      ctx.fillRect(p.x + 9, p.y - 3, 18, 7); ctx.fillRect(p.x + p.w - 27, p.y - 3, 18, 7);
      ctx.strokeStyle = "#aeb9c4"; ctx.globalAlpha = 0.56; ctx.lineWidth = 1;
      for (let x = p.x + 38; x < p.x + p.w - 26; x += 22) { ctx.beginPath(); ctx.moveTo(x, p.y + 3); ctx.lineTo(x, p.y + p.h - 3); ctx.stroke(); }
    } else if (mat === "colossusGantry") {
      const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      g.addColorStop(0, "#8a694d"); g.addColorStop(1, "#49372f");
      ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = "#e78936"; ctx.fillRect(p.x, p.y, p.w, 3);
      ctx.fillStyle = "#c9b39a";
      for (let x = p.x + 16; x < p.x + p.w; x += 34) {
        const lift = state === "warning" ? Math.sin(x * 0.11) * 2 - warnK * 5 : 0;
        ctx.beginPath(); ctx.arc(x, p.y + 8 + lift, 2.4, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      const heat = clamp(stressK + warnK * 0.55, 0, 1);
      const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      g.addColorStop(0, heat > 0.55 ? "#574a46" : "#81766c"); g.addColorStop(1, "#4b4647");
      ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = "#c9a950"; ctx.fillRect(p.x, p.y, p.w, 3);
      if (!GFX.low) {
        ctx.globalAlpha = 0.34; ctx.strokeStyle = "#d4bd7a"; ctx.lineWidth = 1;
        for (let x = p.x + 24; x < p.x + p.w - 18; x += 58) ctx.strokeRect(x, p.y + 7, 27, 8);
      }
    }

    if (stressK > 0) {
      ctx.globalAlpha = 0.12 + stressK * 0.28; ctx.fillStyle = mat === "aldricStone" ? "#8b3028" : "#14181d";
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }
    if (state === "warning") {
      const high = A11Y.highContrast;
      const pulse = 0.62 + 0.38 * Math.sin(CLOCK.sim * 1000 / Math.max(28, 76 - warnK * 42));
      ctx.globalAlpha = (0.52 + warnK * 0.4) * pulse;
      ctx.strokeStyle = high ? (THEME.dark ? "#fff36b" : "#4b00d1") : (mat === "aldricStone" ? "#f0c85a" : (mat === "colossusGantry" ? "#ff8a2c" : "#e5c34f"));
      ctx.lineWidth = (high ? 4.2 : 2.4) + warnK * 1.8; ctx.beginPath();
      const teeth = mat === "aldricStone" ? 5 : 7;
      for (let i = 0; i < teeth; i++) {
        const x = p.x + p.w * (0.1 + i * 0.8 / Math.max(1, teeth - 1));
        const lean = i % 2 ? 12 : -12;
        ctx.moveTo(x, p.y); ctx.lineTo(x + lean, p.y + p.h * (0.55 + (i % 3) * 0.18));
      }
      if (mat === "aldricStone") {
        const cx = p.x + p.w / 2;
        ctx.moveTo(cx - 34, p.y); ctx.lineTo(cx - 18, p.y - 13 - warnK * 8);
        ctx.lineTo(cx, p.y); ctx.lineTo(cx + 18, p.y - 13 - warnK * 8); ctx.lineTo(cx + 34, p.y);
      }
      ctx.stroke();
      if (high) { ctx.globalAlpha = 0.9; ctx.setLineDash([10, 7]); ctx.strokeRect(p.x, p.y - 4, p.w, p.h + 4); ctx.setLineDash([]); }
    }
    ctx.globalAlpha = 1; ctx.restore();
  },

  platform(ctx, p, stage, isFloor, view) {
    if (p.void) { this.voidPlatform(ctx, p, stage); return; }
    if (p.arenaPlatId && !isFloor) { this.arenaPlatform(ctx, p); return; }
    const c = this._get(stage), plat = stage.plat;
    if (isFloor) {
      // Collision remains authored to the arena, but its ground art must reach the
      // inverse-camera bounds while a boss pulls the camera out. Otherwise the
      // original 1600x900 floor reads as a shrinking rectangle during the descent.
      const baseL = p.x - this.PX, baseR = p.x + p.w + this.PX, baseB = p.y + p.h + this.PY;
      const fx = view ? Math.min(baseL, view.left) : baseL;
      const fr = view ? Math.max(baseR, view.right) : baseR;
      const fb = view ? Math.max(baseB, view.bottom) : baseB;
      const fw = fr - fx, fh = fb - p.y;
      const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      g.addColorStop(0, this._lighten(plat, c.dark ? 0.10 : 0.0));
      g.addColorStop(0.14, plat);
      g.addColorStop(1, this._darken(plat, 0.25));
      ctx.fillStyle = g; ctx.fillRect(fx, p.y, fw, fh);
      ctx.fillStyle = this._rgba(c.dark ? "#ffffff" : this._lighten(plat, 0.5), c.dark ? 0.16 : 0.45);
      ctx.fillRect(fx, p.y, fw, 3);                                  // top edge highlight (the horizon)
      ctx.fillStyle = this._rgba(stage.accent, 0.22); ctx.fillRect(fx, p.y - 2, fw, 2);   // accent rail
      return;
    }
    // one-way ledge: soft contact shadow + body gradient + top highlight
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(p.x + 4, p.y + p.h, p.w, 7);
    const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    g.addColorStop(0, this._lighten(plat, 0.18)); g.addColorStop(1, this._darken(plat, 0.15));
    ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = this._rgba(this._lighten(plat, 0.6), 0.7); ctx.fillRect(p.x, p.y, p.w, 2);
    ctx.restore();
  },

  // === reactive lighting: combat events bleed light into the backdrop ===
  // time-based so undrawn events (arcade modes / paused) simply expire, never pile up.
  flare(x, y, col, r, life) { this._fx.push({ x, y, col, r, life, end: CLOCK.sim + life, screen: false }); if (this._fx.length > 16) this._fx.shift(); },
  // A bloom is screen chrome rather than world geometry, so it deliberately
  // keeps UI wall time while local flares freeze with hit-stop simulation time.
  bloom(col, strength, life) { this._fx.push({ col, strength, life, end: globalThis.performance.now() / 1000 + life, screen: true }); if (this._fx.length > 16) this._fx.shift(); },
  drawFx(ctx, camera) {
    if (!this._fx.length) return;
    const simNow = CLOCK.sim, uiNow = globalThis.performance.now() / 1000;
    // additive light has little headroom on a bright background -> attenuate hard on light biomes
    const atten = (typeof THEME !== "undefined" && !THEME.dark) ? 0.3 : 1;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const f of this._fx) {
      const k = clamp((f.end - (f.screen ? uiNow : simNow)) / f.life, 0, 1); if (k <= 0) continue;
      if (f.screen) { ctx.globalAlpha = k * f.strength * atten * A11Y.flashScale; ctx.fillStyle = f.col; this.fillFull(ctx); }
      else {
        // Local flares are recorded in world coordinates but composited after the
        // world, in screen space. Map their centre and radius through the exact
        // camera used for this frame so Source pull-out and shake cannot detach the
        // light from the parry/impact that spawned it. Replays omit camera and keep
        // the historical identity mapping.
        const sc = camera ? camera.scale : 1;
        const x = camera ? camera.cx + camera.ox + (f.x - camera.cx) * sc : f.x;
        const y = camera ? camera.cy + camera.oy + (f.y - camera.cy) * sc : f.y;
        const r = f.r * sc;
        ctx.globalAlpha = 1;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, this._rgba(f.col, 0.55 * k * atten)); g.addColorStop(1, this._rgba(f.col, 0));
        ctx.fillStyle = g; this.fillFull(ctx);
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.restore();
    let write = 0; for (const f of this._fx) {
      if (f.end > (f.screen ? uiNow : simNow)) this._fx[write++] = f;
    } this._fx.length = write;
  },

  // === vignette + grain (screen space, after world, before HUD) ===
  post(ctx, stage, camera) {
    const c = this._get(stage);
    ctx.drawImage(c.vign, -this.PX, -this.PY, this.W + this.PX * 2, this.H + this.PY * 2);
    this.drawFx(ctx, camera);   // combat light glows over the vignette
  },
};

export { Backdrop };

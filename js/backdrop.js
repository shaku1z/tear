// ------- biome backdrop: parallax sky, distant ridges, ambient motes, depth + post -------
// Turns the flat per-stage tint into a layered, moving scene. Drawn in three places:
//   Backdrop.draw(...)      — inside the world camera, BEFORE platforms (sky + parallax + motes)
//   Backdrop.platform(...)  — per platform, gives ledges/floor depth (gradient + edge + shadow)
//   Backdrop.post(...)      — screen space, AFTER the world, BEFORE the HUD (vignette + grain)
// Phase 2 ships a strong generic treatment driven by each stage's palette; Phase 3 layers in
// per-biome art (silhouettes, biome particles, set dressing) on top of this engine.
const Backdrop = {
  get W() { return CONFIG.view.w; },
  get H() { return CONFIG.view.h; },
  // fullscreen overscan bleed (logical px per side) — scene fills extend this far
  // beyond the arena so true fullscreen never letterboxes
  get PX() { return (typeof OVERSCAN !== "undefined") ? OVERSCAN.x : 0; },
  get PY() { return (typeof OVERSCAN !== "undefined") ? OVERSCAN.y : 0; },
  fillFull(ctx) { ctx.fillRect(-this.PX, -this.PY, this.W + this.PX * 2, this.H + this.PY * 2); },
  _cache: {},                 // stage.name -> baked + spec
  _fx: [],                    // transient reactive lights (combat -> backdrop)

  // --- self-contained colour utils (game.js's blendCol is IIFE-local) ---
  _rgb(hex) { hex = (hex || "#000").replace("#", ""); if (hex.length === 3) hex = hex.split("").map((c) => c + c).join(""); return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]; },
  _mix(a, b, t) { const x = this._rgb(a), y = this._rgb(b); return `rgb(${Math.round(lerp(x[0], y[0], t))},${Math.round(lerp(x[1], y[1], t))},${Math.round(lerp(x[2], y[2], t))})`; },
  _lighten(c, t) { return this._mix(c, "#ffffff", t); },
  _darken(c, t) { return this._mix(c, "#000000", t); },
  _rgba(hex, a) { const c = this._rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; },
  _rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; },

  _build(stage) {
    const dark = _relLum(stage.bg) < 0.5;
    // bake the EXPENSIVE bits once: vignette + film grain (half-res; scaled on blit)
    const lw = Math.round(this.W / 2), lh = Math.round(this.H / 2);
    const vign = document.createElement("canvas"); vign.width = lw; vign.height = lh;
    const v = vign.getContext("2d");
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

    this._cache[stage.name] = { vign, dark, parts, accent: stage.accent, _vw: this.W, _vh: this.H };
    return this._cache[stage.name];
  },
  _get(stage) { const c = this._cache[stage.name]; if (c && c._vw === this.W && c._vh === this.H) return c; return this._build(stage); },

  // === sky + parallax + motes (inside world camera, before platforms) ===
  // dispatches to per-biome art (BIOME_ART), falling back to the generic treatment.
  draw(ctx, stage, t, playerX) {
    const c = this._get(stage), gy = CONFIG.world.groundY;
    const px = (playerX - this.W / 2) / (this.W / 2);   // -1..1, drives parallax
    const art = (typeof BIOME_ART !== "undefined" && BIOME_ART[stage.name]) || BIOME_ART._default;
    art.sky(this, ctx, stage, c, t, gy);
    art.far(this, ctx, stage, c, t, px, gy);
    art.motes(this, ctx, stage, c, t, px);
  },

  // base sky used by every biome: vertical gradient from the stage bg + a horizon accent glow
  baseSky(ctx, stage, c, gy, glowA) {
    const W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, this._lighten(stage.bg, c.dark ? 0.06 : 0.10));
    g.addColorStop(0.55, stage.bg);
    g.addColorStop(1, this._darken(stage.bg, c.dark ? 0.18 : 0.05));
    ctx.fillStyle = g; this.fillFull(ctx);
    const rg = ctx.createRadialGradient(W / 2, gy, 40, W / 2, gy, W * 0.6);
    rg.addColorStop(0, this._rgba(stage.accent, glowA == null ? (c.dark ? 0.22 : 0.13) : glowA));
    rg.addColorStop(1, this._rgba(stage.accent, 0));
    ctx.fillStyle = rg; this.fillFull(ctx);
  },

  // a rolling silhouette band along the horizon (parallax)
  ridge(ctx, gy, off, base, amp, freq, phase, col, alpha) {
    const lo = -this.PX - 90, hi = this.W + this.PX + 90;
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(lo, gy);
    for (let x = lo; x <= hi; x += 80) { const h = base + amp * Math.sin(x * freq + phase); ctx.lineTo(x + off, gy - h); }
    ctx.lineTo(hi, gy); ctx.closePath(); ctx.fill();
    ctx.restore();
  },

  // parameterised ambient particles. style: { rgb, dir(+down/-up), glow, twinkle, drift, aMul }
  motes(ctx, c, t, px, style) {
    const W = this.W, s = style || {};
    // wrap across the overscan-padded span so the bleed area has motes too
    const Wp = W + this.PX * 2, Hp = this.H + this.PY * 2 + 80;
    const rgb = s.rgb || (c.dark ? "236,235,246" : "20,20,30");
    const dir = s.dir == null ? 1 : s.dir, drift = s.drift == null ? 14 : s.drift, aMul = s.aMul == null ? 1 : s.aMul;
    if (typeof GFX !== "undefined" && GFX.low) return;   // skip ambient motes on low-end
    ctx.save();
    if (s.glow) { ctx.shadowColor = `rgba(${rgb},0.9)`; ctx.shadowBlur = 8; }
    for (const p of c.parts) {
      const y = ((p.y + dir * t * p.sp) % Hp + Hp) % Hp - 40 - this.PY;
      let x = p.x - px * 38 * p.z + Math.sin(t * 0.3 + p.ph) * drift;
      x = ((x % Wp) + Wp) % Wp - this.PX;
      const tw = s.twinkle ? (0.25 + 0.75 * Math.abs(Math.sin(t * 1.4 + p.ph))) : (0.45 + 0.55 * Math.sin(t * 0.6 + p.ph));
      ctx.globalAlpha = (c.dark ? 0.5 : 0.28) * p.z * tw * aMul;
      ctx.fillStyle = `rgba(${rgb},1)`;
      ctx.beginPath(); ctx.arc(x, y, p.r * p.z * (s.sizeMul || 1), 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();
  },

  // === a platform with depth (replaces the old flat rect) ===
  platform(ctx, p, stage, isFloor) {
    const c = this._get(stage), plat = stage.plat;
    if (isFloor) {
      // the ground visually bleeds into the fullscreen overscan (sides + below)
      const fx = p.x - this.PX, fw = p.w + this.PX * 2, fh = p.h + this.PY;
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
  flare(x, y, col, r, life) { this._fx.push({ x, y, col, r, life, end: performance.now() / 1000 + life, screen: false }); if (this._fx.length > 16) this._fx.shift(); },
  bloom(col, strength, life) { this._fx.push({ col, strength, life, end: performance.now() / 1000 + life, screen: true }); if (this._fx.length > 16) this._fx.shift(); },
  drawFx(ctx) {
    if (!this._fx.length) return;
    const now = performance.now() / 1000;
    // additive light has little headroom on a bright background -> attenuate hard on light biomes
    const atten = (typeof THEME !== "undefined" && !THEME.dark) ? 0.3 : 1;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const f of this._fx) {
      const k = clamp((f.end - now) / f.life, 0, 1); if (k <= 0) continue;
      if (f.screen) { ctx.globalAlpha = k * f.strength * atten; ctx.fillStyle = f.col; this.fillFull(ctx); }
      else { ctx.globalAlpha = 1; const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r); g.addColorStop(0, this._rgba(f.col, 0.55 * k * atten)); g.addColorStop(1, this._rgba(f.col, 0)); ctx.fillStyle = g; this.fillFull(ctx); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.restore();
    this._fx = this._fx.filter((f) => f.end > now);
  },

  // === vignette + grain (screen space, after world, before HUD) ===
  post(ctx, stage) {
    const c = this._get(stage);
    ctx.drawImage(c.vign, -this.PX, -this.PY, this.W + this.PX * 2, this.H + this.PY * 2);
    this.drawFx(ctx);   // combat light glows over the vignette
  },
};

// ------- per-biome art direction (lush atmosphere, layered on the engine) -------
// Each biome keeps its stage.bg luminance polarity so THEME ink stays readable: the four
// surface biomes are light (warm/cool atmospheres), only The Tear is a dark void.
const BIOME_ART = {
  _default: {
    sky(B, ctx, stage, c, t, gy) { B.baseSky(ctx, stage, c, gy); },
    far(B, ctx, stage, c, t, px, gy) {
      B.ridge(ctx, gy, -px * 16, 120, 52, 0.004, 1.3, c.dark ? B._lighten(stage.bg, 0.07) : B._darken(stage.bg, 0.09), 0.5);
      B.ridge(ctx, gy, -px * 40, 74, 40, 0.006, 4.1, c.dark ? B._lighten(stage.bg, 0.03) : B._darken(stage.bg, 0.15), 0.5);
    },
    motes(B, ctx, stage, c, t, px) { B.motes(ctx, c, t, px, {}); },
  },

  // The Grounds — clean dawn, disciplined order: warm light, a colonnade, light shafts
  "The Grounds": {
    sky(B, ctx, stage, c, t, gy) {
      B.baseSky(ctx, stage, c, gy, 0.10);
      const g = ctx.createLinearGradient(0, 0, 0, gy);
      g.addColorStop(0, "rgba(255,214,150,0.20)"); g.addColorStop(1, "rgba(255,214,150,0)");
      ctx.fillStyle = g; ctx.fillRect(-B.PX, -B.PY, B.W + B.PX * 2, gy + B.PY);
      const sx = B.W * 0.78, sy = B.H * 0.20;
      const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 440);
      sg.addColorStop(0, "rgba(255,238,200,0.55)"); sg.addColorStop(1, "rgba(255,238,200,0)");
      ctx.fillStyle = sg; B.fillFull(ctx);
      ctx.save(); ctx.globalAlpha = 0.05; ctx.fillStyle = "#fff7e0";
      for (let i = 0; i < 5; i++) { const x = sx - 180 + i * 110; ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x - 260, gy); ctx.lineTo(x - 200, gy); ctx.lineTo(x + 60, sy); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    },
    far(B, ctx, stage, c, t, px, gy) {
      B.ridge(ctx, gy, -px * 14, 70, 22, 0.005, 1.0, B._darken(stage.bg, 0.06), 0.5);
      ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = B._darken(stage.bg, 0.13);
      const off = (-px * 26) % 175, ch = 150, cw = 26, top = gy - ch;   // wrap by the spacing: an endless colonnade under travel
      for (let x = 130 - Math.ceil((B.PX + 350) / 175) * 175; x < B.W + B.PX + 175; x += 175) { const cx = x + off; ctx.fillRect(cx, top, cw, ch); ctx.fillRect(cx - 6, top - 10, cw + 12, 12); ctx.fillRect(cx - 6, gy - 8, cw + 12, 8); }
      ctx.restore();
    },
    motes(B, ctx, stage, c, t, px) { B.motes(ctx, c, t, px, { drift: 20, aMul: 0.8 }); },
  },

  // The Undercroft — gray steel industry: furnace glow, girders, a slow-turning gear, embers
  "The Undercroft": {
    sky(B, ctx, stage, c, t, gy) {
      B.baseSky(ctx, stage, c, gy, 0.08);
      const fx = B.W * 0.16, fy = gy - 40;
      const fg = ctx.createRadialGradient(fx, fy, 10, fx, fy, 540);
      fg.addColorStop(0, "rgba(255,150,60,0.22)"); fg.addColorStop(1, "rgba(255,150,60,0)");
      ctx.fillStyle = fg; B.fillFull(ctx);
    },
    far(B, ctx, stage, c, t, px, gy) {
      ctx.save(); const col = B._darken(stage.bg, 0.22), off = (-px * 30) % 260;   // wrap: endless machinery under travel
      ctx.globalAlpha = 0.55; ctx.fillStyle = col;
      for (let x = 60 - Math.ceil((B.PX + 520) / 260) * 260; x < B.W + B.PX + 260; x += 260) { const cx = x + off; ctx.fillRect(cx, gy - 220, 70, 220); ctx.fillRect(cx - 30, gy - 150, 150, 18); }
      const poff = (-px * 30) % 700;
      ctx.lineWidth = 14; ctx.strokeStyle = col; ctx.beginPath();
      ctx.moveTo(-B.PX - 20, gy - 90); ctx.lineTo(B.W * 0.4 + poff, gy - 90); ctx.lineTo(B.W * 0.4 + poff, gy - 210); ctx.stroke();
      ctx.restore();
      const gspan = B.W + B.PX * 2 + 260;
      const gx = ((B.W * 0.82 - px * 20) % gspan + gspan) % gspan - B.PX - 130, gyy = gy - 190, R = 92;
      ctx.save(); ctx.translate(gx, gyy); ctx.rotate(t * 0.2); ctx.globalAlpha = 0.5;
      ctx.fillStyle = B._darken(stage.bg, 0.28);
      for (let i = 0; i < 10; i++) { ctx.rotate(Math.PI * 2 / 10); ctx.fillRect(-10, R - 14, 20, 26); }
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.fill();
      ctx.fillStyle = B._lighten(stage.bg, 0.10); ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, 6.283); ctx.fill();
      ctx.restore();
    },
    motes(B, ctx, stage, c, t, px) { B.motes(ctx, c, t, px, { rgb: "255,150,70", dir: -1, glow: true, sizeMul: 0.8, aMul: 1.2 }); },
  },

  // The Crimson Fields — golden-hour battlefield: warm sky, hills, burning banners, ash
  "The Crimson Fields": {
    sky(B, ctx, stage, c, t, gy) {
      B.baseSky(ctx, stage, c, gy, 0.0);
      const g = ctx.createLinearGradient(0, 0, 0, gy);
      g.addColorStop(0, "rgba(255,206,150,0.38)"); g.addColorStop(0.6, "rgba(255,176,150,0.12)"); g.addColorStop(1, "rgba(255,160,120,0)");
      ctx.fillStyle = g; ctx.fillRect(-B.PX, -B.PY, B.W + B.PX * 2, gy + B.PY);
      const sx = B.W * 0.5, sy = gy - 20;
      const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 430);
      sg.addColorStop(0, "rgba(255,238,186,0.7)"); sg.addColorStop(1, "rgba(255,200,140,0)");
      ctx.fillStyle = sg; B.fillFull(ctx);
    },
    far(B, ctx, stage, c, t, px, gy) {
      B.ridge(ctx, gy, -px * 16, 130, 46, 0.004, 2.0, "rgba(90,30,38,0.6)", 1);
      B.ridge(ctx, gy, -px * 36, 80, 34, 0.006, 5.0, "rgba(60,18,28,0.7)", 1);
      ctx.save(); const off = (-px * 30) % 300;   // wrap: the banner line marches past under travel
      for (let i = -1; i < 7; i++) {
        const x = 200 + i * 300 + off, ph = ((i % 5) + 5) % 5 * 1.7, flick = 0.8 + 0.2 * Math.sin(t * 3 + ph);
        ctx.strokeStyle = "rgba(30,12,16,0.7)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy - 150); ctx.stroke();
        ctx.fillStyle = `rgba(210,60,44,${0.55 * flick})`; ctx.beginPath();
        ctx.moveTo(x, gy - 150); ctx.lineTo(x + 50 + 8 * Math.sin(t * 2 + ph), gy - 140); ctx.lineTo(x + 44, gy - 118); ctx.lineTo(x + 52, gy - 100); ctx.lineTo(x, gy - 110); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    },
    motes(B, ctx, stage, c, t, px) { B.motes(ctx, c, t, px, { rgb: "255,140,70", dir: -1, glow: true, drift: 30, aMul: 1.1 }); },
  },

  // The Voidspire — surreal violet: aurora bands, floating broken geometry, drifting shards
  "The Voidspire": {
    sky(B, ctx, stage, c, t, gy) {
      B.baseSky(ctx, stage, c, gy, 0.14);
      ctx.save();
      const cols = ["rgba(139,59,214,0.10)", "rgba(214,77,214,0.08)", "rgba(80,120,240,0.08)"];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = cols[i]; const yb = 120 + i * 70, amp = 40 + i * 10;
        const lo = -B.PX - 60, hi = B.W + B.PX + 60;
        ctx.beginPath(); ctx.moveTo(lo, yb);
        for (let x = lo; x <= hi; x += 60) ctx.lineTo(x, yb + Math.sin(x * 0.005 + t * 0.4 + i) * amp);
        ctx.lineTo(hi, -B.PY); ctx.lineTo(lo, -B.PY); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    },
    far(B, ctx, stage, c, t, px, gy) {
      ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = B._darken(stage.bg, 0.14);
      for (let i = 0; i < 7; i++) {
        const x = (((i * 240 - px * 24) % (B.W + 200)) + (B.W + 200)) % (B.W + 200) - 100;
        const y = 140 + ((i * 130) % 480) + Math.sin(t * 0.5 + i) * 16, s = 40 + (i % 3) * 22;
        ctx.save(); ctx.translate(x, y); ctx.rotate(0.3 * Math.sin(t * 0.3 + i)); ctx.fillRect(-s / 2, -6, s, 12); ctx.restore();
      }
      ctx.restore();
      B.ridge(ctx, gy, -px * 30, 90, 40, 0.006, 2.0, B._darken(stage.bg, 0.12), 0.4);
    },
    motes(B, ctx, stage, c, t, px) { B.motes(ctx, c, t, px, { rgb: "180,120,220", twinkle: true, drift: 24, aMul: 0.9 }); },
  },

  // The Tear — the void: a central glowing rift that pulses and lights the scene, a starfield
  "The Tear": {
    sky(B, ctx, stage, c, t, gy) {
      B.baseSky(ctx, stage, c, gy, 0.10);
      const cx = B.W * 0.5, cyc = B.H * 0.40, pulse = 0.5 + 0.5 * Math.sin(t * 1.2);
      const rg = ctx.createRadialGradient(cx, cyc, 20, cx, cyc, 580);
      rg.addColorStop(0, `rgba(19,196,214,${0.16 + 0.12 * pulse})`); rg.addColorStop(0.5, "rgba(19,196,214,0.05)"); rg.addColorStop(1, "rgba(19,196,214,0)");
      ctx.fillStyle = rg; B.fillFull(ctx);
      ctx.save(); ctx.translate(cx, cyc); if (!(typeof GFX !== "undefined" && GFX.low)) { ctx.shadowColor = "#13c4d6"; ctx.shadowBlur = 38; }
      const h = B.H * 0.52, w = 20 + 10 * pulse;
      const grd = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      grd.addColorStop(0, "rgba(19,196,214,0)"); grd.addColorStop(0.5, `rgba(190,250,255,${0.7 + 0.3 * pulse})`); grd.addColorStop(1, "rgba(19,196,214,0)");
      ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(0, 0, w, h / 2, 0, 0, 6.283); ctx.fill();
      ctx.restore();
    },
    far(B, ctx, stage, c, t, px, gy) {
      ctx.save(); ctx.globalAlpha = 0.22; ctx.strokeStyle = "rgba(200,210,240,0.6)"; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) { const x = (((i * 270 - px * 20) % B.W) + B.W) % B.W; const y = 120 + ((i * 160) % 500) + Math.sin(t * 0.5 + i) * 10, s = 30 + i * 6; ctx.strokeRect(x, y, s, s * 0.6); }
      ctx.restore();
    },
    motes(B, ctx, stage, c, t, px) { B.motes(ctx, c, t, px, { rgb: "190,230,255", twinkle: true, drift: 6, aMul: 1.1 }); },
  },
};

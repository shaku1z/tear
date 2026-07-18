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

  // --- self-contained colour utils (game.js's blendCol is IIFE-local) ---
  _rgb(hex) { hex = (hex || "#000").replace("#", ""); if (hex.length === 3) hex = hex.split("").map((c) => c + c).join(""); return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]; },
  _mix(a, b, t) { const x = this._rgb(a), y = this._rgb(b); return `rgb(${Math.round(lerp(x[0], y[0], t))},${Math.round(lerp(x[1], y[1], t))},${Math.round(lerp(x[2], y[2], t))})`; },
  _lighten(c, t) { return this._mix(c, "#ffffff", t); },
  _darken(c, t) { return this._mix(c, "#000000", t); },
  _rgba(hex, a) { const c = this._rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; },
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
  draw(ctx, stage, t, playerX, view) {
    const c = this._get(stage), gy = CONFIG.world.groundY;
    const px = (playerX - this.W / 2) / (this.W / 2);   // -1..1, drives parallax
    const art = (typeof BIOME_ART !== "undefined" && BIOME_ART[stage.name]) || BIOME_ART._default;
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
    rg.addColorStop(0, this._rgba(stage.accent, glowA == null ? (c.dark ? 0.22 : 0.13) : glowA));
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
    const W = this.W, s = style || {};
    // Wrap across the current inverse-camera span so a pull-out does not leave a
    // conspicuously empty fringe.  The particles remain bounded (40 at all zooms).
    const vl = view ? view.left : -this.PX, vt = view ? view.top : -this.PY;
    const vr = view ? view.right : W + this.PX, vb = view ? view.bottom : this.H + this.PY;
    const Wp = vr - vl, Hp = vb - vt + 80;
    const rgb = s.rgb || (c.dark ? "236,235,246" : "20,20,30");
    const dir = s.dir == null ? 1 : s.dir, drift = s.drift == null ? 14 : s.drift, aMul = s.aMul == null ? 1 : s.aMul;
    if (typeof GFX !== "undefined" && GFX.low) return;   // skip ambient motes on low-end
    ctx.save();
    if (s.glow) { ctx.shadowColor = `rgba(${rgb},0.9)`; ctx.shadowBlur = 8; }
    for (const p of c.parts) {
      const y = ((p.y - vt + dir * t * p.sp) % Hp + Hp) % Hp + vt - 40;
      let x = p.x - px * 38 * p.z + Math.sin(t * 0.3 + p.ph) * drift;
      x = ((x - vl) % Wp + Wp) % Wp + vl;
      const tw = s.twinkle ? (0.25 + 0.75 * Math.abs(Math.sin(t * 1.4 + p.ph))) : (0.45 + 0.55 * Math.sin(t * 0.6 + p.ph));
      ctx.globalAlpha = (c.dark ? 0.5 : 0.28) * p.z * tw * aMul;
      ctx.fillStyle = `rgba(${rgb},1)`;
      ctx.beginPath(); ctx.arc(x, y, p.r * p.z * (s.sizeMul || 1), 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();
  },

  // === a platform with depth (replaces the old flat rect) ===
  platform(ctx, p, stage, isFloor, view) {
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
  flare(x, y, col, r, life) { this._fx.push({ x, y, col, r, life, end: performance.now() / 1000 + life, screen: false }); if (this._fx.length > 16) this._fx.shift(); },
  bloom(col, strength, life) { this._fx.push({ col, strength, life, end: performance.now() / 1000 + life, screen: true }); if (this._fx.length > 16) this._fx.shift(); },
  drawFx(ctx, camera) {
    if (!this._fx.length) return;
    const now = performance.now() / 1000;
    // additive light has little headroom on a bright background -> attenuate hard on light biomes
    const atten = (typeof THEME !== "undefined" && !THEME.dark) ? 0.3 : 1;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const f of this._fx) {
      const k = clamp((f.end - now) / f.life, 0, 1); if (k <= 0) continue;
      if (f.screen) { ctx.globalAlpha = k * f.strength * atten; ctx.fillStyle = f.col; this.fillFull(ctx); }
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
    this._fx = this._fx.filter((f) => f.end > now);
  },

  // === vignette + grain (screen space, after world, before HUD) ===
  post(ctx, stage, camera) {
    const c = this._get(stage);
    ctx.drawImage(c.vign, -this.PX, -this.PY, this.W + this.PX * 2, this.H + this.PY * 2);
    this.drawFx(ctx, camera);   // combat light glows over the vignette
  },
};

// ------- per-biome art direction (lush atmosphere, layered on the engine) -------
// Each biome keeps its stage.bg luminance polarity so THEME ink stays readable: the four
// surface biomes are light (warm/cool atmospheres), only The Tear is a dark void.
const BIOME_ART = {
  _default: {
    sky(B, ctx, stage, c, t, gy, view) { B.baseSky(ctx, stage, c, gy, undefined, view); },
    far(B, ctx, stage, c, t, px, gy, view) {
      B.ridge(ctx, gy, -px * 16, 120, 52, 0.004, 1.3, c.dark ? B._lighten(stage.bg, 0.07) : B._darken(stage.bg, 0.09), 0.5, view);
      B.ridge(ctx, gy, -px * 40, 74, 40, 0.006, 4.1, c.dark ? B._lighten(stage.bg, 0.03) : B._darken(stage.bg, 0.15), 0.5, view);
    },
    motes(B, ctx, stage, c, t, px, view) { B.motes(ctx, c, t, px, {}, view); },
  },

  // The Grounds — clean dawn, disciplined order: warm light, a colonnade, light shafts
  "The Grounds": {
    sky(B, ctx, stage, c, t, gy, view) {
      B.baseSky(ctx, stage, c, gy, 0.10, view);
      const g = ctx.createLinearGradient(0, 0, 0, gy);
      g.addColorStop(0, "rgba(255,214,150,0.20)"); g.addColorStop(1, "rgba(255,214,150,0)");
      const vl = view ? view.left : -B.PX, vt = view ? view.top : -B.PY;
      const vr = view ? view.right : B.W + B.PX;
      ctx.fillStyle = g; ctx.fillRect(vl, vt, vr - vl, Math.max(0, gy - vt));
      const sx = B.W * 0.78, sy = B.H * 0.20;
      const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 440);
      sg.addColorStop(0, "rgba(255,238,200,0.55)"); sg.addColorStop(1, "rgba(255,238,200,0)");
      ctx.fillStyle = sg; B.fillFull(ctx, view);
      ctx.save(); ctx.globalAlpha = 0.05; ctx.fillStyle = "#fff7e0";
      for (let i = 0; i < 5; i++) { const x = sx - 180 + i * 110; ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x - 260, gy); ctx.lineTo(x - 200, gy); ctx.lineTo(x + 60, sy); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    },
    far(B, ctx, stage, c, t, px, gy, view) {
      B.ridge(ctx, gy, -px * 14, 70, 22, 0.005, 1.0, B._darken(stage.bg, 0.06), 0.5, view);
      ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = B._darken(stage.bg, 0.13);
      const vl = view ? view.left : -B.PX, vr = view ? view.right : B.W + B.PX;
      const off = (-px * 26) % 175, ch = 150, cw = 26, top = gy - ch;   // wrap by the spacing: an endless colonnade under travel
      const first = 130 + Math.floor((vl - 350 - off - 130) / 175) * 175;
      for (let x = first; x + off < vr + 175; x += 175) { const cx = x + off; ctx.fillRect(cx, top, cw, ch); ctx.fillRect(cx - 6, top - 10, cw + 12, 12); ctx.fillRect(cx - 6, gy - 8, cw + 12, 8); }
      ctx.restore();
    },
    motes(B, ctx, stage, c, t, px, view) { B.motes(ctx, c, t, px, { drift: 20, aMul: 0.8 }, view); },
  },

  // The Undercroft — gray steel industry: furnace glow, girders, a slow-turning gear, embers
  "The Undercroft": {
    sky(B, ctx, stage, c, t, gy, view) {
      B.baseSky(ctx, stage, c, gy, 0.08, view);
      const fx = B.W * 0.16, fy = gy - 40;
      const fg = ctx.createRadialGradient(fx, fy, 10, fx, fy, 540);
      fg.addColorStop(0, "rgba(255,150,60,0.22)"); fg.addColorStop(1, "rgba(255,150,60,0)");
      ctx.fillStyle = fg; B.fillFull(ctx, view);
    },
    far(B, ctx, stage, c, t, px, gy, view) {
      const vl = view ? view.left : -B.PX, vr = view ? view.right : B.W + B.PX;
      ctx.save(); const col = B._darken(stage.bg, 0.22), off = (-px * 30) % 260;   // wrap: endless machinery under travel
      ctx.globalAlpha = 0.55; ctx.fillStyle = col;
      const first = 60 + Math.floor((vl - 520 - off - 60) / 260) * 260;
      for (let x = first; x + off < vr + 260; x += 260) { const cx = x + off; ctx.fillRect(cx, gy - 220, 70, 220); ctx.fillRect(cx - 30, gy - 150, 150, 18); }
      const poff = (-px * 30) % 700;
      ctx.lineWidth = 14; ctx.strokeStyle = col; ctx.beginPath();
      ctx.moveTo(vl - 20, gy - 90); ctx.lineTo(B.W * 0.4 + poff, gy - 90); ctx.lineTo(B.W * 0.4 + poff, gy - 210); ctx.stroke();
      ctx.restore();
      // A stable world lattice keeps the original focal gear while allowing very
      // wide/pulled-out views to reveal another one without camera-bound popping.
      let gearStep, gearBase, gi0, gi1;
      const gyy = gy - 190, R = 92;
      if (view) {
        gearStep = B.W + 260; gearBase = B.W * 0.82 - px * 20 - 130;
        gi0 = Math.floor((vl - R - gearBase) / gearStep); gi1 = Math.ceil((vr + R - gearBase) / gearStep);
      } else {
        // Attract/replay keep the historical single-gear framing exactly.
        const gspan = B.W + B.PX * 2 + 260;
        gearStep = 0; gearBase = ((B.W * 0.82 - px * 20) % gspan + gspan) % gspan - B.PX - 130;
        gi0 = 0; gi1 = 0;
      }
      for (let gi = gi0; gi <= gi1; gi++) {
        const gx = gearBase + gi * gearStep;
        ctx.save(); ctx.translate(gx, gyy); ctx.rotate(t * 0.2); ctx.globalAlpha = 0.5;
        ctx.fillStyle = B._darken(stage.bg, 0.28);
        for (let i = 0; i < 10; i++) { ctx.rotate(Math.PI * 2 / 10); ctx.fillRect(-10, R - 14, 20, 26); }
        ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.fill();
        ctx.fillStyle = B._lighten(stage.bg, 0.10); ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, 6.283); ctx.fill();
        ctx.restore();
      }
    },
    motes(B, ctx, stage, c, t, px, view) { B.motes(ctx, c, t, px, { rgb: "255,150,70", dir: -1, glow: true, sizeMul: 0.8, aMul: 1.2 }, view); },
  },

  // The Crimson Fields — golden-hour battlefield: warm sky, hills, burning banners, ash
  "The Crimson Fields": {
    sky(B, ctx, stage, c, t, gy, view) {
      B.baseSky(ctx, stage, c, gy, 0.0, view);
      const g = ctx.createLinearGradient(0, 0, 0, gy);
      g.addColorStop(0, "rgba(255,206,150,0.38)"); g.addColorStop(0.6, "rgba(255,176,150,0.12)"); g.addColorStop(1, "rgba(255,160,120,0)");
      const vl = view ? view.left : -B.PX, vt = view ? view.top : -B.PY;
      const vr = view ? view.right : B.W + B.PX;
      ctx.fillStyle = g; ctx.fillRect(vl, vt, vr - vl, Math.max(0, gy - vt));
      const sx = B.W * 0.5, sy = gy - 20;
      const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 430);
      sg.addColorStop(0, "rgba(255,238,186,0.7)"); sg.addColorStop(1, "rgba(255,200,140,0)");
      ctx.fillStyle = sg; B.fillFull(ctx, view);
    },
    far(B, ctx, stage, c, t, px, gy, view) {
      B.ridge(ctx, gy, -px * 16, 130, 46, 0.004, 2.0, "rgba(90,30,38,0.6)", 1, view);
      B.ridge(ctx, gy, -px * 36, 80, 34, 0.006, 5.0, "rgba(60,18,28,0.7)", 1, view);
      const vl = view ? view.left : -B.PX, vr = view ? view.right : B.W + B.PX;
      ctx.save(); const off = (-px * 30) % 300;   // wrap: the banner line marches past under travel
      const i0 = Math.floor((vl - 100 - off - 200) / 300);
      for (let i = i0; 200 + i * 300 + off < vr + 100; i++) {
        const x = 200 + i * 300 + off, ph = ((i % 5) + 5) % 5 * 1.7, flick = 0.8 + 0.2 * Math.sin(t * 3 + ph);
        ctx.strokeStyle = "rgba(30,12,16,0.7)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy - 150); ctx.stroke();
        ctx.fillStyle = `rgba(210,60,44,${0.55 * flick})`; ctx.beginPath();
        ctx.moveTo(x, gy - 150); ctx.lineTo(x + 50 + 8 * Math.sin(t * 2 + ph), gy - 140); ctx.lineTo(x + 44, gy - 118); ctx.lineTo(x + 52, gy - 100); ctx.lineTo(x, gy - 110); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    },
    motes(B, ctx, stage, c, t, px, view) { B.motes(ctx, c, t, px, { rgb: "255,140,70", dir: -1, glow: true, drift: 30, aMul: 1.1 }, view); },
  },

  // The Voidspire — surreal violet: aurora bands, floating broken geometry, drifting shards
  "The Voidspire": {
    sky(B, ctx, stage, c, t, gy, view) {
      B.baseSky(ctx, stage, c, gy, 0.14, view);
      ctx.save();
      const cols = ["rgba(139,59,214,0.10)", "rgba(214,77,214,0.08)", "rgba(80,120,240,0.08)"];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = cols[i]; const yb = 120 + i * 70, amp = 40 + i * 10;
        const lo = (view ? view.left : -B.PX) - 60, hi = (view ? view.right : B.W + B.PX) + 60;
        ctx.beginPath(); ctx.moveTo(lo, yb);
        for (let x = lo; x <= hi; x += 60) ctx.lineTo(x, yb + Math.sin(x * 0.005 + t * 0.4 + i) * amp);
        const top = view ? view.top : -B.PY;
        ctx.lineTo(hi, top); ctx.lineTo(lo, top); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    },
    far(B, ctx, stage, c, t, px, gy, view) {
      const vl = view ? view.left : -B.PX, vr = view ? view.right : B.W + B.PX;
      const drift = -px * 24, step = 240;
      ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = B._darken(stage.bg, 0.14);
      const i0 = Math.floor((vl - 100 - drift + 100) / step), i1 = Math.ceil((vr + 100 - drift + 100) / step);
      for (let i = i0; i <= i1; i++) {
        const x = -100 + i * step + drift;
        const yi = ((i * 130) % 480 + 480) % 480, si = ((i % 3) + 3) % 3;
        const y = 140 + yi + Math.sin(t * 0.5 + i) * 16, s = 40 + si * 22;
        ctx.save(); ctx.translate(x, y); ctx.rotate(0.3 * Math.sin(t * 0.3 + i)); ctx.fillRect(-s / 2, -6, s, 12); ctx.restore();
      }
      ctx.restore();
      B.ridge(ctx, gy, -px * 30, 90, 40, 0.006, 2.0, B._darken(stage.bg, 0.12), 0.4, view);
    },
    motes(B, ctx, stage, c, t, px, view) { B.motes(ctx, c, t, px, { rgb: "180,120,220", twinkle: true, drift: 24, aMul: 0.9 }, view); },
  },

  // The Tear — the void: a central glowing rift that pulses and lights the scene, a starfield
  "The Tear": {
    sky(B, ctx, stage, c, t, gy, view) {
      B.baseSky(ctx, stage, c, gy, 0.10, view);
      const vl = view ? view.left : -B.PX, vr = view ? view.right : B.W + B.PX;
      const low = typeof GFX !== "undefined" && GFX.low;
      // Distant membranes span world space rather than the original arena.  Their
      // very slow motion keeps the pull-out alive without competing with hazards.
      ctx.save(); ctx.lineCap = "round"; ctx.lineWidth = low ? 1.5 : 2;
      for (let band = 0; band < (low ? 1 : 3); band++) {
        ctx.globalAlpha = 0.08 - band * 0.012;
        ctx.strokeStyle = band === 1 ? "#d45ee8" : "#13c4d6";
        ctx.beginPath();
        const start = Math.floor((vl - 120) / 96) * 96, baseY = B.H * (0.18 + band * 0.18);
        for (let x = start; x <= vr + 120; x += 96) {
          const y = baseY + Math.sin(x * (0.0028 + band * 0.0005) + t * (0.08 + band * 0.025) + band * 2.1) * (44 + band * 14);
          if (x === start) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      const cx = B.W * 0.5, cyc = B.H * 0.40, pulse = 0.5 + 0.5 * Math.sin(t * 1.2);
      const rg = ctx.createRadialGradient(cx, cyc, 20, cx, cyc, 580);
      rg.addColorStop(0, `rgba(19,196,214,${0.16 + 0.12 * pulse})`); rg.addColorStop(0.5, "rgba(19,196,214,0.05)"); rg.addColorStop(1, "rgba(19,196,214,0)");
      ctx.fillStyle = rg; B.fillFull(ctx, view);
      ctx.save(); ctx.translate(cx, cyc); if (!low) { ctx.shadowColor = "#13c4d6"; ctx.shadowBlur = 38; }
      const h = B.H * 0.52, w = 20 + 10 * pulse;
      const grd = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      grd.addColorStop(0, "rgba(19,196,214,0)"); grd.addColorStop(0.5, `rgba(190,250,255,${0.7 + 0.3 * pulse})`); grd.addColorStop(1, "rgba(19,196,214,0)");
      ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(0, 0, w, h / 2, 0, 0, 6.283); ctx.fill();
      ctx.restore();
    },
    far(B, ctx, stage, c, t, px, gy, view) {
      const vl = view ? view.left : -B.PX, vt = view ? view.top : -B.PY;
      const vr = view ? view.right : B.W + B.PX, vb = view ? view.bottom : B.H + B.PY;
      const low = typeof GFX !== "undefined" && GFX.low, cell = 320, drift = -px * 18;
      const x0 = Math.floor((vl - drift) / cell) - 1, x1 = Math.ceil((vr - drift) / cell) + 1;
      const y0 = Math.floor(vt / cell) - 1, y1 = Math.ceil(vb / cell) + 1;
      ctx.save(); ctx.lineCap = "square";
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          // Stars and ruins are derived only from their signed cell coordinates:
          // no per-frame RNG and no cache growth as the camera reveals new space.
          const ax = cx * cell + 38 + B._cellRand(cx, cy, 1) * (cell - 76) + drift;
          const ay = cy * cell + 36 + B._cellRand(cx, cy, 2) * (cell - 72);
          const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.55 + B._cellRand(cx, cy, 3) * 6.283));
          ctx.globalAlpha = (low ? 0.22 : 0.34) * tw;
          ctx.fillStyle = B._cellRand(cx, cy, 4) > 0.76 ? "#d45ee8" : "#bee6ff";
          const star = 1 + B._cellRand(cx, cy, 5) * (low ? 1.2 : 2.2);
          ctx.fillRect(ax, ay, star, star);
          if (!low) {
            const ax2 = cx * cell + 26 + B._cellRand(cx, cy, 6) * (cell - 52) + drift;
            const ay2 = cy * cell + 24 + B._cellRand(cx, cy, 7) * (cell - 48);
            ctx.globalAlpha = 0.16 + B._cellRand(cx, cy, 8) * 0.12;
            ctx.fillRect(ax2, ay2, 1.2, 1.2);
          }

          const ruinChance = B._cellRand(cx, cy, 9);
          if (ruinChance > (low ? 0.83 : 0.67)) {
            const rw = 48 + B._cellRand(cx, cy, 10) * 86, rh = 24 + B._cellRand(cx, cy, 11) * 58;
            const rx = cx * cell + B._cellRand(cx, cy, 12) * (cell - rw) + drift;
            const ry = cy * cell + B._cellRand(cx, cy, 13) * (cell - rh) + Math.sin(t * 0.16 + B._cellRand(cx, cy, 14) * 6.283) * 4;
            ctx.save(); ctx.translate(rx + rw / 2, ry + rh / 2);
            ctx.rotate((B._cellRand(cx, cy, 15) - 0.5) * 0.42);
            ctx.globalAlpha = low ? 0.12 : 0.19; ctx.strokeStyle = "#b8c5df"; ctx.lineWidth = low ? 1.5 : 2;
            ctx.beginPath(); ctx.moveTo(-rw / 2, -rh / 2); ctx.lineTo(rw * 0.18, -rh / 2);
            ctx.moveTo(rw * 0.34, -rh / 2); ctx.lineTo(rw / 2, -rh / 2); ctx.lineTo(rw / 2, rh * 0.14);
            ctx.moveTo(rw / 2, rh * 0.34); ctx.lineTo(rw / 2, rh / 2); ctx.lineTo(-rw * 0.12, rh / 2);
            ctx.moveTo(-rw * 0.28, rh / 2); ctx.lineTo(-rw / 2, rh / 2); ctx.lineTo(-rw / 2, -rh * 0.08); ctx.stroke();
            ctx.globalAlpha *= 0.55; ctx.fillStyle = "#13c4d6";
            ctx.fillRect(-rw * 0.42, rh * 0.18, rw * 0.48, 2);
            ctx.restore();
          }

          if (!low && B._cellRand(cx, cy, 16) > 0.84) {
            const fx = cx * cell + B._cellRand(cx, cy, 17) * cell + drift;
            const fy = cy * cell + B._cellRand(cx, cy, 18) * cell;
            ctx.globalAlpha = 0.10; ctx.strokeStyle = B._cellRand(cx, cy, 19) > 0.5 ? "#13c4d6" : "#d45ee8"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(fx, fy);
            ctx.bezierCurveTo(fx + (B.W / 2 - fx) * 0.25, fy - 70, B.W / 2 + (fx - B.W / 2) * 0.12, B.H * 0.4 + 60, B.W / 2, B.H * 0.4);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    },
    motes(B, ctx, stage, c, t, px, view) { B.motes(ctx, c, t, px, { rgb: "190,230,255", twinkle: true, drift: 6, aMul: 1.1 }, view); },
  },
};

// ------- biome backdrop: parallax sky, distant ridges, ambient motes, depth + post -------
// Turns the flat per-stage tint into a layered, moving scene. Drawn in three places:
//   Backdrop.draw(...)      — inside the world camera, BEFORE platforms (sky + parallax + motes)
//   Backdrop.platform(...)  — per platform, gives ledges/floor depth (gradient + edge + shadow)
//   Backdrop.post(...)      — screen space, AFTER the world, BEFORE the HUD (vignette + grain)
// Phase 2 ships a strong generic treatment driven by each stage's palette; Phase 3 layers in
// per-biome art (silhouettes, biome particles, set dressing) on top of this engine.
const Backdrop = {
  W: 1600, H: 900,
  _cache: {},                 // stage.name -> baked + spec

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
    const lw = 800, lh = 450;
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

    this._cache[stage.name] = { vign, dark, parts, accent: stage.accent };
    return this._cache[stage.name];
  },
  _get(stage) { return this._cache[stage.name] || this._build(stage); },

  // === sky + parallax + motes (inside world camera, before platforms) ===
  draw(ctx, stage, t, playerX) {
    const c = this._get(stage), W = this.W, H = this.H, gy = CONFIG.world.groundY;
    const px = (playerX - W / 2) / (W / 2);   // -1..1, drives parallax

    // sky gradient (live — cheap, always crisp)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, this._lighten(stage.bg, c.dark ? 0.06 : 0.10));
    g.addColorStop(0.55, stage.bg);
    g.addColorStop(1, this._darken(stage.bg, c.dark ? 0.18 : 0.05));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // soft horizon glow in the stage accent
    const rg = ctx.createRadialGradient(W / 2, gy, 40, W / 2, gy, W * 0.6);
    rg.addColorStop(0, this._rgba(stage.accent, c.dark ? 0.22 : 0.13));
    rg.addColorStop(1, this._rgba(stage.accent, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

    // two distant ridges (parallax) for depth
    this._ridge(ctx, stage, c, gy, -px * 16, 120, 52, 0.004, 1.3, c.dark ? this._lighten(stage.bg, 0.07) : this._darken(stage.bg, 0.09), 0.5);
    this._ridge(ctx, stage, c, gy, -px * 40, 74, 40, 0.006, 4.1, c.dark ? this._lighten(stage.bg, 0.03) : this._darken(stage.bg, 0.15), 0.5);

    // ambient motes (slow drift + parallax)
    ctx.save();
    const ink = c.dark ? "236,235,246" : "20,20,30";
    for (const p of c.parts) {
      const y = ((p.y + t * p.sp) % (H + 80)) - 40;
      let x = p.x - px * 38 * p.z + Math.sin(t * 0.3 + p.ph) * 14;
      x = ((x % W) + W) % W;
      const a = (c.dark ? 0.5 : 0.28) * p.z * (0.45 + 0.55 * Math.sin(t * 0.6 + p.ph));
      ctx.globalAlpha = a; ctx.fillStyle = `rgba(${ink},1)`;
      ctx.beginPath(); ctx.arc(x, y, p.r * p.z, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();
  },

  _ridge(ctx, stage, c, gy, off, base, amp, freq, phase, col, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(-60, gy);
    for (let x = -60; x <= this.W + 60; x += 80) { const h = base + amp * Math.sin(x * freq + phase); ctx.lineTo(x + off, gy - h); }
    ctx.lineTo(this.W + 60, gy); ctx.closePath(); ctx.fill();
    ctx.restore();
  },

  // === a platform with depth (replaces the old flat rect) ===
  platform(ctx, p, stage, isFloor) {
    const c = this._get(stage), plat = stage.plat;
    if (isFloor) {
      const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      g.addColorStop(0, this._lighten(plat, c.dark ? 0.10 : 0.0));
      g.addColorStop(0.14, plat);
      g.addColorStop(1, this._darken(plat, 0.25));
      ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = this._rgba(c.dark ? "#ffffff" : this._lighten(plat, 0.5), c.dark ? 0.16 : 0.45);
      ctx.fillRect(p.x, p.y, p.w, 3);                                  // top edge highlight (the horizon)
      ctx.fillStyle = this._rgba(stage.accent, 0.22); ctx.fillRect(p.x, p.y - 2, p.w, 2);   // accent rail
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

  // === vignette + grain (screen space, after world, before HUD) ===
  post(ctx, stage) {
    const c = this._get(stage);
    ctx.drawImage(c.vign, 0, 0, this.W, this.H);
  },
};

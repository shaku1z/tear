// ------- attract mode: a self-contained auto-battle demo for the main menu -------
// The game "playing itself" behind the menu. It does NOT use the real run/sim (those
// are coupled to input, platforms, state); it's a lightweight bespoke sim with simple
// AI, reusing the shared Backdrop + FX so it shows off the real biomes and the new VFX.
// FX is updated/drawn here (the main loop only ticks FX while actually playing).
const Attract = {
  W: 1600, H: 900, GY: CONFIG.world.groundY,
  t: 0, biomeIdx: 0, biomeT: 0, fade: 0,
  hero: null, foes: [], shots: [], target: null, ready: false,

  // cycle only the light/colourful biomes — the dark void (The Tear) reads muddy behind the
  // dimmed sub-tabs, so it's left out of the attract rotation.
  _biomes() { const a = []; for (let i = 0; i < STAGES.length; i++) if (!STAGES[i].dark) a.push(i); return a; },
  reset() {
    this.t = 0; this.biomeList = this._biomes(); this.biomePtr = Math.floor(Math.random() * this.biomeList.length); this.biomeT = 0; this.fade = 0;
    this.hero = { x: this.W / 2, vx: 0, facing: 1, swingT: 0, swingDir: 1, scarf: [] };
    this.foes = []; this.shots = []; this.target = null; this.ready = true;
    try { FX.reset(); } catch (e) {}
    for (let i = 0; i < 5; i++) this._spawn();
  },
  stage() { return STAGES[this.biomeList[this.biomePtr % this.biomeList.length]]; },
  _spawn() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const types = ["charger", "ranged", "flyer", "bomber", "armored", "wraith"];
    const kind = types[(Math.random() * types.length) | 0];
    const flyer = kind === "flyer" || kind === "wraith";
    this.foes.push({ x: this.W / 2 + side * (640 + Math.random() * 280), y: this.GY - 22 - (flyer ? 110 + Math.random() * 140 : 0),
      kind, color: CONFIG.colors[kind] || "#e23b3b", fireCd: 1.4 + Math.random() * 2.4, dead: false, spawnT: 0.4, flash: 0, hw: 17, hh: 22, flyer });
  },
  _heroY() { return this.GY - 30; },

  update(dt) {
    if (!this.ready) this.reset();
    if (dt > 0.05) dt = 0.05;
    this.t += dt; this.fade = Math.min(1, this.fade + dt * 0.5);
    this.biomeT += dt;
    if (this.biomeT > 15) { this.biomeT = 0; this.biomePtr = (this.biomePtr + 1) % this.biomeList.length; }
    const h = this.hero, hy = this._heroY();

    // target the nearest living foe; close in and swing
    if (!this.target || this.target.dead) { let bd = 1e9; this.target = null; for (const f of this.foes) { if (f.dead || f.spawnT > 0) continue; const d = Math.abs(f.x - h.x); if (d < bd) { bd = d; this.target = f; } } }
    if (this.target) {
      const dir = Math.sign(this.target.x - h.x) || 1; h.facing = dir;
      const dist = Math.abs(this.target.x - h.x);
      if (dist > 95) h.vx += dir * 2300 * dt;
      else if (h.swingT <= 0) { h.swingT = 0.26; h.swingDir = dir; }
    }
    h.vx *= 0.85; h.x = clamp(h.x + h.vx * dt, 110, this.W - 110);
    h.scarf.unshift({ x: h.x - h.facing * 8, y: hy - 12 }); if (h.scarf.length > 9) h.scarf.pop();

    // swing -> cut foes within reach in the facing arc
    if (h.swingT > 0) {
      h.swingT -= dt;
      for (const f of this.foes) { if (f.dead || f.spawnT > 0) continue; const dx = f.x - h.x, dy = f.y - hy; if (Math.hypot(dx, dy) < 155 && Math.sign(dx) === h.swingDir) this._kill(f); }
    }

    for (const f of this.foes) {
      if (f.spawnT > 0) { f.spawnT -= dt; continue; }
      f.flash = Math.max(0, f.flash - dt * 4);
      const dir = Math.sign(h.x - f.x) || 1;
      if (!f.flyer && f.kind !== "ranged") f.x += dir * 64 * dt;             // melee creep in
      else if (f.flyer) { f.x += dir * 40 * dt; f.y += Math.sin(this.t * 2 + f.x) * 18 * dt; }
      f.fireCd -= dt;
      if (f.fireCd <= 0 && (f.kind === "ranged" || f.kind === "flyer")) { f.fireCd = 2.2 + Math.random() * 2; this._fire(f); }
      if (f.kind === "bomber" && Math.abs(f.x - h.x) < 130) { this._explode(f.x, f.y); this._kill(f, true); }
    }

    for (const s of this.shots) {
      if (s.dead) continue;
      s.hist.push({ x: s.x, y: s.y }); if (s.hist.length > 7) s.hist.shift();
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (!s.deflected && Math.hypot(s.x - h.x, s.y - hy) < 64) {   // auto-parry a close shot
        s.deflected = true; const m = Math.hypot(s.vx, s.vy) || 1; s.vx = -s.vx / m * 760; s.vy = -260; s.tint = CONFIG.colors.perfect;
        h.swingT = Math.max(h.swingT, 0.2); FX.burst(s.x, s.y, s.vx, 0, 8, CONFIG.colors.perfect); FX.flash(s.x, s.y, 36, CONFIG.colors.perfect);
      }
      if (s.deflected) for (const f of this.foes) { if (f.dead || f.spawnT > 0) continue; if (Math.hypot(f.x - s.x, f.y - s.y) < 28) { this._kill(f); s.dead = true; break; } }
      if (s.x < -50 || s.x > this.W + 50 || s.y < -50 || s.y > this.H + 50) s.dead = true;
    }
    this.shots = this.shots.filter((s) => !s.dead);
    this.foes = this.foes.filter((f) => !f.dead);
    while (this.foes.length < 5) this._spawn();
    try { FX.update(dt); } catch (e) {}
  },

  _kill(f, silent) { if (f.dead) return; f.dead = true; try { FX.death(f.x, f.y, 12, f.color); if (!silent) FX.burst(f.x, f.y, 0, -1, 6, CONFIG.colors.perfect); } catch (e) {} },
  _fire(f) { const h = this.hero, dx = h.x - f.x, dy = this._heroY() - f.y, m = Math.hypot(dx, dy) || 1; this.shots.push({ x: f.x, y: f.y, vx: dx / m * 430, vy: dy / m * 430, r: 8, tint: f.color, hist: [], deflected: false, dead: false }); },
  _explode(x, y) { try { FX.explode(x, y, CONFIG.colors.bomber, 1.3); } catch (e) {} },

  // ---- drawing ----
  draw(ctx) {
    const stage = this.stage();
    THEME.set(stage.bg);
    ctx.fillStyle = stage.bg; ctx.fillRect(0, 0, this.W, this.H);
    Backdrop.draw(ctx, stage, this.t, this.hero ? this.hero.x : this.W / 2);
    const floor = { x: 0, y: this.GY, w: this.W, h: this.H - this.GY, floor: true };
    Backdrop.platform(ctx, floor, stage, true);
    for (const f of this.foes) this._drawFoe(ctx, f);
    for (const s of this.shots) this._drawShot(ctx, s);
    this._drawHero(ctx);
    try { FX.draw(ctx); } catch (e) {}
    Backdrop.post(ctx, stage);
  },
  _drawFoe(ctx, f) {
    const lowG = (typeof GFX !== "undefined" && GFX.low);
    if (f.spawnT > 0) { ctx.globalAlpha = 1 - f.spawnT / 0.4; }
    const x = f.x - f.hw, y = f.y - f.hh, w = f.hw * 2, hgt = f.hh * 2;
    ctx.fillStyle = f.flash > 0 ? "#fff" : f.color;
    if (!lowG) { ctx.shadowColor = THEME.rim; ctx.shadowBlur = 6; }
    ctx.fillRect(x, y, w, hgt); ctx.shadowBlur = 0;
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2.5; ctx.strokeRect(x, y, w, hgt);
    ctx.fillStyle = "#fff"; ctx.fillRect(f.x + 4, y + 11, 6, 6);   // eye
    ctx.globalAlpha = 1;
  },
  _drawShot(ctx, s) {
    const dark = THEME.dark, lowG = (typeof GFX !== "undefined" && GFX.low);
    if (!lowG && s.hist.length > 1) {
      ctx.save(); if (dark) ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = s.tint; ctx.lineCap = "round";
      for (let i = 1; i < s.hist.length; i++) { const k = i / s.hist.length; ctx.globalAlpha = k * 0.5; ctx.lineWidth = s.r * 1.6 * k; ctx.beginPath(); ctx.moveTo(s.hist[i - 1].x, s.hist[i - 1].y); ctx.lineTo(s.hist[i].x, s.hist[i].y); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.restore();
    }
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy, s.vx));
    if (!lowG) { ctx.shadowColor = s.tint; ctx.shadowBlur = dark ? 12 : 7; }
    ctx.fillStyle = s.tint; ctx.strokeStyle = THEME.ink; ctx.lineWidth = 1.5;
    const r = s.r; ctx.beginPath(); ctx.moveTo(r * 1.5, 0); ctx.quadraticCurveTo(0, -r * 0.9, -r, -r * 0.5); ctx.quadraticCurveTo(-r * 0.9, 0, -r, r * 0.5); ctx.quadraticCurveTo(0, r * 0.9, r * 1.5, 0); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.restore();
  },
  _drawHero(ctx) {
    const h = this.hero, hy = this._heroY(), lowG = (typeof GFX !== "undefined" && GFX.low);
    // scarf (red ribbon)
    ctx.fillStyle = CONFIG.colors.scarf; ctx.beginPath();
    if (h.scarf.length > 1) { ctx.moveTo(h.x, hy - 8); for (const p of h.scarf) ctx.lineTo(p.x, p.y - 4); for (let i = h.scarf.length - 1; i >= 0; i--) ctx.lineTo(h.scarf[i].x, h.scarf[i].y + 4); ctx.closePath(); ctx.fill(); }
    // blade swing arc
    if (h.swingT > 0) {
      const k = h.swingT / 0.26, sweep = (1 - k) * 2.4 - 1.2, base = h.swingDir > 0 ? -0.2 : Math.PI + 0.2;
      const a = base + sweep * h.swingDir, r = 150;
      ctx.save(); if (!lowG) { ctx.shadowColor = CONFIG.colors.bladeTrail; ctx.shadowBlur = 16; }
      if (THEME.dark) ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = CONFIG.colors.bladeTrail; ctx.globalAlpha = 0.5 + 0.5 * k; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(h.x, hy, r, a - h.swingDir * 0.9, a, h.swingDir < 0); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = 4; ctx.strokeStyle = THEME.ink;   // the blade itself
      ctx.beginPath(); ctx.moveTo(h.x, hy); ctx.lineTo(h.x + Math.cos(a) * r, hy + Math.sin(a) * r); ctx.stroke();
      ctx.restore();
    }
    // body + visor
    ctx.save(); if (!lowG) { ctx.shadowColor = THEME.rim; ctx.shadowBlur = 8; }
    ctx.fillStyle = THEME.ink; ctx.fillRect(h.x - 16, hy - 25, 32, 50); ctx.shadowBlur = 0;
    ctx.fillStyle = CONFIG.colors.eye; ctx.fillRect(h.x + h.facing * 5 - 4, hy - 13, 8, 5);
    ctx.restore();
  },
};

// ------- attract mode: the game playing itself behind the menu -------
// Uses the REAL Player + Blade (driven by a synthetic controller via player.aiInput /
// blade.aimOverride from blade.js & player.js), so movement, dashes, jumps, and the blade
// swing/trail are the genuine article. Enemies are lightweight bespoke actors with proper
// physics — ground types fall to the floor and never hover; only flyers stay airborne.
// FX is ticked/drawn here (the main loop only ticks FX while actually playing).
const Attract = {
  get W() { return CONFIG.view.w; },
  get H() { return CONFIG.view.h; },
  get GY() { return CONFIG.world.groundY; },
  t: 0, biomeList: [], biomePtr: 0, biomeT: 0, fade: 0,
  player: null, blade: null, platforms: null, ai: null, foes: [], shots: [],
  target: null, dashCd: 0, jumpCd: 0, aimAng: -1, ready: false,

  _biomes() { const a = []; for (let i = 0; i < STAGES.length; i++) if (!STAGES[i].dark) a.push(i); return a; },

  reset() {
    this.t = 0; this.biomeList = this._biomes(); this.biomePtr = Math.floor(Math.random() * this.biomeList.length);
    this.biomeT = 0; this.fade = 0; this.dashCd = 0; this.jumpCd = 0; this.aimAng = -1; this.target = null;
    this.swingT = 0; this.swingDir = 1; this.swingBase = 0;   // deliberate slash rhythm
    this.platforms = [
      { x: 0, y: this.GY, w: this.W, h: this.H - this.GY, floor: true },
      { x: this.W * 0.30, y: this.GY - 175, w: 250, h: 24, oneway: true },
      { x: this.W * 0.60, y: this.GY - 265, w: 240, h: 24, oneway: true },
    ];
    this.player = new Player(this.W / 2, this.GY - 60);
    this.player.maxHp = this.player.hp = 99999;   // the demo hero never falls
    const ai = this.ai = { left: false, right: false, up: false, down: false, _dash: false, _jump: false };
    this.player.aiInput = {
      left: () => ai.left, right: () => ai.right, up: () => ai.up, down: () => ai.down,
      dashPressed: () => { const v = ai._dash; ai._dash = false; return v; },
      jumpPressed: () => { const v = ai._jump; ai._jump = false; return v; },
    };
    this.blade = new Blade();
    this.blade.aimOverride = { x: this.W / 2, y: this.GY - 80 };
    this.foes = []; this.shots = [];
    try { FX.reset(); } catch (e) {}
    for (let i = 0; i < 5; i++) this._spawn();
    this.ready = true;
  },
  stage() { return STAGES[this.biomeList[this.biomePtr % this.biomeList.length]]; },

  update(dt) {
    if (!this.ready) this.reset();
    if (dt > 0.04) dt = 0.04;
    this.t += dt; this.fade = Math.min(1, this.fade + dt * 0.5);
    this.biomeT += dt;
    if (this.biomeT > 15) { this.biomeT = 0; this.biomePtr = (this.biomePtr + 1) % this.biomeList.length; }
    this.dashCd -= dt; this.jumpCd -= dt;
    const p = this.player, b = this.blade, ai = this.ai;
    if (!this.target || this.target.dead || this.target.spawnT > 0) this.target = this._nearest();
    const tg = this.target;

    // ---- drive the real player via the synthetic controller ----
    ai.left = ai.right = ai.up = ai.down = false;
    if (tg) {
      const dx = tg.x - p.x, dy = tg.y - p.y, adx = Math.abs(dx);
      if (adx > 52) { if (dx > 0) ai.right = true; else ai.left = true; }       // pursue, don't camp
      if (tg.flyer && dy < -70 && p.onGround && this.jumpCd <= 0) { ai._jump = true; this.jumpCd = 1.0; }   // hop to a flyer
      // dash to close a gap, or a periodic flourish dash so the hero keeps moving & blinking around
      if (this.dashCd <= 0 && p.dashCharges > 0 && (adx > 240 || Math.random() < 0.016)) {
        if (dx > 0) ai.right = true; else ai.left = true; if (tg.flyer && dy < -50) ai.up = true;
        ai._dash = true; this.dashCd = 0.7 + Math.random() * 0.6;
      }
    }
    // dodge a near incoming shot (dash away)
    for (const s of this.shots) {
      if (s.dead || s.deflected) continue;
      if (Math.hypot(s.x - p.x, s.y - p.y) < 150 && this.dashCd <= 0 && p.dashCharges > 0) {
        ai.left = s.x > p.x; ai.right = s.x <= p.x; ai._dash = true; this.dashCd = 0.8; break;
      }
    }

    // ---- aim the blade: deliberate slashes, not a constant blur ----
    // Rest the aim on the target; when a foe is within reach, BURST a fast arc across it (that
    // 0.16s sweep clears minHitSpeed so the cut lands exactly where the blade visibly slashes),
    // then a brief recover. Reads as approach -> slash -> approach, like a real player.
    {
      const hand = { x: p.x, y: p.y - p.hh * 0.2 }, R = CONFIG.blade.aimRadius;
      const baseAng = tg ? Math.atan2(tg.y - hand.y, tg.x - hand.x) : this.aimAng;
      const reach = tg ? Math.hypot(tg.x - hand.x, tg.y - hand.y) : 9999;
      this.swingT -= dt;
      if (this.swingT <= -0.10 && reach < 150) { this.swingT = 0.16; this.swingDir = Math.random() < 0.5 ? -1 : 1; this.swingBase = baseAng; }
      if (this.swingT > 0) {
        const k = 1 - this.swingT / 0.16;                                  // 0 -> 1 across the slash
        this.aimAng = this.swingBase - this.swingDir * 1.05 + this.swingDir * 2.1 * k;
      } else {
        this.aimAng += (baseAng - this.aimAng) * clamp(7 * dt, 0, 1);      // rest: track the target (no cut)
      }
      b.aimOverride.x = hand.x + Math.cos(this.aimAng) * R;
      b.aimOverride.y = hand.y + Math.sin(this.aimAng) * R;
    }

    // ---- step the real entities ----
    p.update(dt, this.platforms);
    b.update(dt, p, this.platforms);
    if (tg) p.facing = tg.x >= p.x ? 1 : -1;

    // ---- the real blade cuts foes it sweeps through fast ----
    for (const f of this.foes) {
      if (f.dead || f.spawnT > 0) continue;
      if (b.tipSpeed > CONFIG.blade.minHitSpeed && this._segNear(b.x, b.y, b.tipX, b.tipY, f.x, f.y, f.hw + 12)) this._kill(f);
    }

    for (const f of this.foes) this._updateFoe(f, dt, p);
    for (const s of this.shots) this._updateShot(s, dt, p, b);
    this.shots = this.shots.filter((s) => !s.dead);
    this.foes = this.foes.filter((f) => !f.dead);
    while (this.foes.length < 5) this._spawn();
    try { FX.update(dt); } catch (e) {}
  },

  _nearest() { let bd = 1e9, best = null; for (const f of this.foes) { if (f.dead || f.spawnT > 0) continue; const d = Math.hypot(f.x - this.player.x, f.y - this.player.y); if (d < bd) { bd = d; best = f; } } return best; },
  _segNear(ax, ay, bx, by, px, py, r) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1; let tt = ((px - ax) * dx + (py - ay) * dy) / l2; tt = clamp(tt, 0, 1); return Math.hypot(px - (ax + dx * tt), py - (ay + dy * tt)) <= r; },
  _kill(f, silent) { if (f.dead) return; f.dead = true; try { FX.death(f.x, f.y, 12, f.color); if (!silent) FX.burst(f.x, f.y, 0, -1, 6, CONFIG.colors.perfect); } catch (e) {} },

  _spawn() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const types = ["charger", "ranged", "bomber", "armored", "flyer", "wraith"];
    const kind = types[(Math.random() * types.length) | 0];
    const flyer = kind === "flyer" || kind === "wraith";
    this.foes.push({ x: this.W / 2 + side * (600 + Math.random() * 280), y: flyer ? this.GY - 200 - Math.random() * 150 : this.GY - 22,
      vx: 0, vy: 0, onGround: false, kind, color: CONFIG.colors[kind] || "#e23b3b", hw: 17, hh: 22, flyer, fireCd: 1.1 + Math.random() * 2, spawnT: 0.4, flash: 0, dead: false });
  },
  _updateFoe(f, dt, p) {
    if (f.spawnT > 0) { f.spawnT -= dt; return; }
    f.flash = Math.max(0, f.flash - dt * 4);
    const dir = Math.sign(p.x - f.x) || 1;
    if (f.flyer) {
      const ty = p.y - 40 + Math.sin(this.t * 1.6 + f.x) * 32;
      f.vy += (ty - f.y) * 2.6 * dt; f.vy *= 0.9; f.y += f.vy * dt; f.x += dir * 150 * dt;
    } else {
      f.vy += CONFIG.world.gravity * dt; f.y += f.vy * dt;
      const floorY = this.GY - f.hh;
      if (f.y >= floorY) { f.y = floorY; f.vy = 0; f.onGround = true; } else f.onGround = false;
      if (f.onGround) f.x += dir * 135 * dt;
    }
    f.x = clamp(f.x, 60, this.W - 60);
    f.fireCd -= dt;
    if (f.fireCd <= 0 && (f.kind === "ranged" || f.kind === "flyer")) { f.fireCd = 1.7 + Math.random() * 1.6; this._fire(f, p); }
    if (f.kind === "bomber" && f.onGround && Math.abs(f.x - p.x) < 120) { this._explode(f.x, f.y); this._kill(f, true); }
  },
  _fire(f, p) { const dx = p.x - f.x, dy = p.y - f.y, m = Math.hypot(dx, dy) || 1; this.shots.push({ x: f.x, y: f.y - 6, vx: dx / m * 440, vy: dy / m * 440, r: 8, tint: f.color, hist: [], deflected: false, dead: false }); },
  _explode(x, y) { try { FX.explode(x, y, CONFIG.colors.bomber, 1.3); } catch (e) {} },
  _updateShot(s, dt, p, b) {
    s.hist.push({ x: s.x, y: s.y }); if (s.hist.length > 7) s.hist.shift();
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (!s.deflected && b.tipSpeed > 850 && this._segNear(b.x, b.y, b.tipX, b.tipY, s.x, s.y, 20)) {
      s.deflected = true; const m = Math.hypot(s.vx, s.vy) || 1; s.vx = -s.vx / m * 780; s.vy = -260; s.tint = CONFIG.colors.perfect;
      FX.burst(s.x, s.y, s.vx, 0, 8, CONFIG.colors.perfect); FX.flash(s.x, s.y, 34, CONFIG.colors.perfect);
    }
    if (s.deflected) for (const f of this.foes) { if (f.dead || f.spawnT > 0) continue; if (Math.hypot(f.x - s.x, f.y - s.y) < 28) { this._kill(f); s.dead = true; break; } }
    if (s.x < -50 || s.x > this.W + 50 || s.y < -50 || s.y > this.H + 50) s.dead = true;
  },

  // ---- drawing ----
  draw(ctx) {
    const stage = this.stage();
    THEME.set(stage.bg);
    ctx.fillStyle = stage.bg; Backdrop.fillFull(ctx);   // include the fullscreen overscan bleed
    Backdrop.draw(ctx, stage, this.t, this.player ? this.player.x : this.W / 2);
    if (this.platforms) for (const pl of this.platforms) Backdrop.platform(ctx, pl, stage, !!pl.floor);
    for (const f of this.foes) this._drawFoe(ctx, f);
    for (const s of this.shots) this._drawShot(ctx, s);
    if (this.player) this.player.draw(ctx);
    if (this.blade) this.blade.draw(ctx, this.player);
    try { FX.draw(ctx); } catch (e) {}
    Backdrop.post(ctx, stage);
  },
  _drawFoe(ctx, f) {
    const lowG = (typeof GFX !== "undefined" && GFX.low);
    if (f.spawnT > 0) ctx.globalAlpha = 1 - f.spawnT / 0.4;
    const x = f.x - f.hw, y = f.y - f.hh, w = f.hw * 2, h = f.hh * 2;
    ctx.fillStyle = f.flash > 0 ? "#fff" : f.color;
    if (!lowG) { ctx.shadowColor = THEME.rim; ctx.shadowBlur = 6; }
    ctx.fillRect(x, y, w, h); ctx.shadowBlur = 0;
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2.5; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#fff"; ctx.fillRect(f.x + (f.x < this.player.x ? 4 : -10), y + 11, 6, 6);
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
};

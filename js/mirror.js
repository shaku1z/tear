// ------- THE ECHO (reborn): a real momentum-blade boss that reads, mirrors, and answers you -------
// One boss, two layers:
//   MirrorHost (bottom of file) — a REAL Enemy in enemies[]: it carries the boss HP bar, takes
//     blade hits / statuses / knockback through every existing combat system, scales with
//     difficulty, and dies through the normal boss-death flow. The body.
//   Mirror (this object) — the brain: a real Player (aiInput) + real Blade (aimOverride) with a
//     full boss moveset (rising rend, power slam, juggles, blade throw + flash-step, crescent
//     rends), trick-mirroring taken from the classic Echo, ghost-echo replay, sync escalation,
//     and phase-driven looks (sealed silhouette -> torn cracks -> white-out final).
// Isolation contract: nothing in the enemy/boss loops knows this exists beyond the host being a
// normal enemy; game.js consumes Mirror.fxq for shake/floaters and calls Mirror.updateCombat.
const Mirror = {
  active: false,
  host: null,          // the MirrorHost enemy (HP source of truth, boss bar, statuses)
  actor: null,         // a real Player instance, AI-driven (movement physics)
  blade: null,         // a real Blade instance, AI-aimed
  facing: 1,
  color: "#b06cff",    // the tear-violet identity
  ai: null,
  fxq: [],             // juice queue for game.js: {shake, flash, txt, x, y, big, color}

  // ---- tiny helpers ----
  segNear(ax, ay, bx, by, px, py, r) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) <= r;
  },
  _dirAng(a) { return this.facing > 0 ? a : Math.PI - a; },   // mirror an angle across facing
  juice(q) { this.fxq.push(q); },

  get phase() {   // 1 sealed -> 2 torn -> 3 final (same thresholds as the classic Echo)
    if (!this.host) return 1;
    const f = this.host.hp / this.host.maxHp;
    return f > 0.6 ? 1 : (f > 0.25 ? 2 : 3);
  },

  // ---- attach the brain to a freshly spawned host ----
  attach(host, mods) {
    this.host = host;
    const a = this.actor = new Player(host.x, host.y);
    a.maxHp = a.hp = 99999;                 // the actor never "dies" — the host's HP is the fight
    a.maxDashCharges = 2; a.dashCharges = 2;
    const ai = this.ai = { left: false, right: false, up: false, down: false, _dash: false, _jump: false };
    a.aiInput = {
      left: () => ai.left, right: () => ai.right, up: () => ai.up, down: () => ai.down,
      dashPressed: () => { const v = ai._dash; ai._dash = false; return v; },
      jumpPressed: () => { const v = ai._jump; ai._jump = false; return v; },
    };
    const b = this.blade = new Blade();
    b.aimOverride = { x: host.x, y: host.y - 120 };
    b.lmbOverride = false;
    b.trailColor = "#b06cff"; b.glowColor = "#c98cff";
    b.freeRecall = true; b.hideThrowUI = true;
    b.lengthBonus = 30;                     // ~5 Long-Arms as the SEALED baseline (grows per phase)

    this.sync = 0.35;
    this.read = { dist: 300, airborne: 0, aggression: 0, dashHeat: 0, closing: 0, pBladeSpeed: 0 };
    this._state = "approach"; this._stateT = 0; this._decideT = 0;
    this._swingT = 0; this._swingDir = 1; this._swingBase = 0; this._aimAng = -Math.PI / 2;
    this._dashCd = 0; this._jumpCd = 0; this._clashCd = 0; this._syncBump = 0; this.lock = null;
    this._air = null;   // P3 aerial director state
    this._pDashPrev = 0; this._pPrevX = host.x; this._pDashPrev2 = 0; this._pGroundPrev = true; this._prevDist = 300;
    this.echoBuf = []; this._echoClip = []; this._echoPtr = 0; this._echoCd = 6;
    this.mv = null; this._moveCd = 2.2;     // committed-move director
    this.waves = []; this.imgs = [];   // crescents are real projectiles now (see _crescent)
    this._recallT = 0; this._fsPending = false; this._threwHit = false;
    this.seenTrickT = 0; this._answer = ""; this._answerT = 0; this._lastAnswered = "";
    this._phaseMark = 1; this.white = 0; this._wtT = 5.5; this._sparkT = 0; this._stagger = 0;
    this.mods = mods || {};
    this.airBias = (this.mods.airBonus || this.mods.aerialRave) ? 1 : 0;
    this.parryWary = (this.mods.parryGuard || this.mods.backlash || this.mods.backlashSurge || this.mods.parryStun) ? 1 : 0;
    this.active = true;
    return this;
  },

  // =====================================================================
  //  PER-FRAME BRAIN (called by MirrorHost.update — the enemy loop drives it)
  // =====================================================================
  hostStep(dt, platforms, player, projectiles) {
    if (!this.active || !this.host) return;
    this._proj = projectiles;   // crescents are real projectiles pushed into the game's array
    if (this._clashCd > 0) this._clashCd -= dt;
    if (this._stagger > 0) this._stagger -= dt;
    this.sync = clamp(this.sync + dt * 0.016 + this._syncBump, 0.15, 1); this._syncBump = 0;
    this._updatePhase();
    this._whiteout(dt);

    // perception + echo capture always run
    this._updateRead(dt, player, this.pb || { tipSpeed: 0 });
    this._recordEcho(dt, player);
    this._watchTricks(player);

    // brain: lock > reeling > committed move > neutral
    const ai = this.ai;
    ai.left = ai.right = ai.up = ai.down = false;
    if (this.lock) {                                         // saber lock: lean into the bind, blade crossed
      const L = this.lock, hand = { x: this.actor.x, y: this.actor.y - this.actor.hh * 0.2 };
      this.actor.vx = lerp(this.actor.vx, (L.x - this.actor.x) * 2.6, clamp(9 * dt, 0, 1));
      this.actor.vy = lerp(this.actor.vy, 0, clamp(9 * dt, 0, 1));
      this._aimAng = Math.atan2(L.y - hand.y, L.x - hand.x);
      this.blade.aimOverride.x = hand.x + Math.cos(this._aimAng) * CONFIG.blade.aimRadius;
      this.blade.aimOverride.y = hand.y + Math.sin(this._aimAng) * CONFIG.blade.aimRadius;
      this.facing = Math.sign(player.x - this.actor.x) || this.facing;
      this.actor.update(dt, platforms); this.actor.facing = this.facing; this.blade.update(dt, this.actor, platforms);
      this._updateWaves(dt);
      return;
    }
    if (this._stagger > 0) {
      this._aim(dt, player, false);                          // knocked silly: blade just trails
    } else if (this.phase >= 3) {                            // FINAL FORM: plays from the air, sword-first dives
      this._aerialBrain(dt, player);
      this.actor.facing = this.facing;
      this.blade.update(dt, this.actor, platforms);
      this._updateWaves(dt);
      for (const g of this.imgs) g.t -= dt; this.imgs = this.imgs.filter((g) => g.t > 0);
      return;                                                // the aerial director fully owns the body
    } else if (this.mv) {
      this._runMove(dt, player);
    } else {
      this._moveCd -= dt;
      this._answerT -= dt;
      if (this._answerT > 0 && this._answer && this._moveCd < 1.2) { /* answer pending, let it fire below */ }
      if (this._answer && this._answerT <= 0) { const m = this._answer; this._answer = ""; this._startMove(m, player); }
      else if (this._moveCd <= 0) { const pick = this._pickMove(player); if (pick) this._startMove(pick, player); }
      if (!this.mv) { this._decide(dt, player); this._act(dt, player); }
    }

    // step the real body + blade
    this.actor.update(dt, platforms);
    this.actor.facing = this.facing;
    this.actor.x = clamp(this.actor.x, 40, CONFIG.view.w - 40);
    this.blade.update(dt, this.actor, platforms);

    // thrown-blade lifecycle (+ P3 flash-step to the embedded blade)
    if (this.blade.state !== "held") {
      this._recallT -= dt;
      if (this._fsPending && this.blade.state === "embedded") this._flashStep(player);
      else if (this._recallT <= 0 || this.blade.state === "embedded") this.blade.tryRecall(this.actor);
    }

    // dash afterimages (P2+) + P2 drag sparks
    if (this.phase >= 2) {
      if (this.actor.dashTimer > 0) this.imgs.push({ x: this.actor.x, y: this.actor.y, f: this.facing, t: 0.28 });
      this._sparkT -= dt;
      if (this._sparkT <= 0 && this.actor.onGround && !this.mv && this.blade.state === "held" && this.blade.tipY > CONFIG.world.groundY - 16) {
        this._sparkT = 0.09;
        try { FX.burst(this.blade.tipX, CONFIG.world.groundY - 2, -this.facing, -0.3, 2, "#c98cff"); } catch (e) {}
      }
    }
    for (const g of this.imgs) g.t -= dt;
    this.imgs = this.imgs.filter((g) => g.t > 0);
    this._updateWaves(dt);
  },

  // ---- phase escalation: the release beats ----
  _updatePhase() {
    const ph = this.phase;
    if (ph <= this._phaseMark) return;
    this._phaseMark = ph;
    this.mv = null; this._moveCd = 1.1;
    this.blade.lengthBonus = ph === 2 ? 65 : 100;            // the blade GROWS with each tear
    this.sync = Math.max(this.sync, ph === 2 ? 0.55 : 0.75);
    // the reflection SHIFTS colour as it unseals: violet -> hot magenta -> pale spectre
    this.color = ph === 2 ? "#c94bff" : "#e6d3ff";
    this.blade.trailColor = this.color; this.blade.glowColor = ph === 3 ? "#ffffff" : this.color;
    const a = this.actor, h = this.host;
    if (ph === 2) { h.spawnClone = true; this.juice({ txt: "THE REFLECTION SPLITS", x: h.x, y: h.y - 84, big: true }); }   // game spawns a real ReflectionEnemy
    if (ph === 3) { this._air = null; this._wtT = 2.2; this.juice({ txt: "FINAL REFLECTION", x: h.x, y: h.y - 84, big: true }); }   // the reflection self-dissolves at P3
    // the release BEAT: a deep slow-mo punch so each unseal lands like an event
    this.juice({ shake: ph === 3 ? 13 : 10, flash: ph === 3 ? 0.4 : 0.28, slowmo: 0.55, zoom: CONFIG.juice.zoomBig, hitstop: CONFIG.hitStop.big });
    try {
      FX.flash(a.x, a.y - a.hh, 90, "#f0e0ff"); FX.ring(a.x, a.y, 48, this.color); FX.ring(a.x, a.y, 28, "#ffffff");
      FX.burst(a.x, a.y, 0, -1, 34, this.color); FX.explode(a.x, a.y, this.color, 1.25);
    } catch (e) {}
  },

  // ---- P3 white-out cycle: a blinding flash, then you track it by its blade ----
  _whiteout(dt) {
    if (this.phase < 3) { this.white = Math.max(0, this.white - dt * 2); return; }
    this._wtT -= dt;
    if (this._wtT <= 0) {
      if (this.white < 0.5) {   // flash on
        this.white = 1; this._wtT = 3.2;
        this.juice({ flash: 0.5 });
        try { FX.flash(this.actor.x, this.actor.y, 90, "#ffffff"); } catch (e) {}
      } else { this.white = 0; this._wtT = 6.5; }
    }
  },

  // =====================================================================
  //  PERCEPTION
  // =====================================================================
  _updateRead(dt, player, playerBlade) {
    const R = this.read, a = this.actor, B = CONFIG.blade;
    const dist = Math.abs(player.x - a.x), kSlow = clamp(2.2 * dt, 0, 1), kFast = clamp(6 * dt, 0, 1);
    R.dist += (dist - R.dist) * kSlow;
    R.airborne += ((player.onGround ? 0 : 1) - R.airborne) * kSlow;
    const pvx = (player.x - this._pPrevX) / (dt || 0.016); this._pPrevX = player.x;
    R.closing += ((Math.sign(a.x - player.x) === Math.sign(pvx) && Math.abs(pvx) > 60 ? 1 : 0) - R.closing) * kFast;
    const swinging = (playerBlade.tipSpeed > B.minHitSpeed * 1.1 && dist < 200) ? 1 : 0;
    R.aggression += (swinging - R.aggression) * clamp(1.8 * dt, 0, 1);
    if (player.dashTimer > 0 && this._pDashPrev <= 0) R.dashHeat = Math.min(1, R.dashHeat + 0.34);
    this._pDashPrev = player.dashTimer;
    R.dashHeat *= Math.exp(-0.5 * dt);
    R.pBladeSpeed = playerBlade.tipSpeed;
  },

  _recordEcho(dt, player) {
    const a = this.actor, dist = Math.abs(player.x - a.x);
    const closed = this._prevDist - dist; this._prevDist = dist;
    const adv = Math.abs(closed) < 0.4 ? 0 : Math.sign(closed);
    const dash = (player.dashTimer > 0 && this._pDashPrev2 <= 0) ? 1 : 0; this._pDashPrev2 = player.dashTimer;
    const jump = (!player.onGround && this._pGroundPrev) ? 1 : 0; this._pGroundPrev = player.onGround;
    const swing = this.read.pBladeSpeed > CONFIG.blade.minHitSpeed ? 1 : 0;
    this.echoBuf.push({ adv, dash, jump, swing });
    if (this.echoBuf.length > 130) this.echoBuf.shift();
  },

  // ---- THE ECHO's soul: watch your tricks and ANSWER in kind (faster if you repeat) ----
  _watchTricks(player) {
    if (player.lastTrickT == null || player.lastTrickT <= this.seenTrickT) return;
    const k = player.lastTrickKind, repeat = k === this._lastAnswered;
    this.seenTrickT = player.lastTrickT; this._lastAnswered = k;
    const map = { slam: "slam", superslam: "slam", spike: "slam", updraft: "rend", launch: "rend", parry: "getsuga", deflect: "getsuga", throwHit: "throw" };
    this._answer = map[k] || "lunge";
    this._answerT = 0.62 * (repeat ? 0.45 : 1) * lerp(1.25, 0.7, this.sync);
  },

  // =====================================================================
  //  COMMITTED MOVES — the boss moveset (telegraph -> execute -> recover)
  // =====================================================================
  _pickMove(player) {
    const a = this.actor, ph = this.phase, adx = Math.abs(player.x - a.x);
    const deck = [];
    if (player.onGround && adx < 280) deck.push("rend", "rend");
    if (adx > 240 && adx < 540 && this.blade.state === "held") deck.push("throw");
    if (ph >= 2 && adx < 460) deck.push("slam", "slam");
    if (ph >= 2 && adx > 240 && adx < 720) deck.push("getsuga");
    if (ph >= 3) deck.push("getsuga", "slam");
    if (!player.onGround && player.y < a.y - 40 && adx < 240) deck.push("juggle", "juggle");
    if (!deck.length) return null;
    return deck[Math.floor(Math.random() * deck.length)];
  },

  _startMove(id, player) {
    if (id === "lunge") { this._state = "punish"; this._stateT = 0.45; this._decideT = 0.5; this._moveCd = lerp(3.4, 1.7, this.sync); return; }
    if (id === "throw" && this.blade.state !== "held") return;
    if (id === "juggle" && (player.onGround || player.y > this.actor.y)) id = "rend";
    const tele = { rend: 0.34, slam: 0.38, getsuga: 0.3, throw: 0.24, juggle: 0.05 }[id] || 0.3;
    this.mv = { id, ph: "tele", t: tele, hitDone: false };
    this._moveCd = lerp(3.4, 1.7, this.sync) + Math.random() * 0.8;
    this._swingT = 0;
  },

  _runMove(dt, player) {
    const mv = this.mv, a = this.actor, ai = this.ai, dx = player.x - a.x, dir = Math.sign(dx) || this.facing;
    mv.t -= dt;
    this.facing = mv.id === "getsuga" || mv.ph === "tele" ? dir : this.facing;
    const setAim = (ang) => {
      const hand = { x: a.x, y: a.y - a.hh * 0.2 }, R = CONFIG.blade.aimRadius;
      this._aimAng = ang;
      this.blade.aimOverride.x = hand.x + Math.cos(ang) * R;
      this.blade.aimOverride.y = hand.y + Math.sin(ang) * R;
    };

    if (mv.id === "rend") {   // ---- RISING REND: a leaping uppercut that LAUNCHES you ----
      if (mv.ph === "tele") {
        a.vx = lerp(a.vx, 0, clamp(10 * dt, 0, 1));
        setAim(this._dirAng(2.35));                          // blade cocked low behind — the wind-up read
        if (mv.t <= 0) { mv.ph = "exec"; mv.t = 0.42; mv.k = 0; a.vy = -660; a.vx = dir * 420; try { FX.ring(a.x, a.y + a.hh, 14, this.color); } catch (e) {} }
      } else if (mv.ph === "exec") {
        mv.k = Math.min(1, mv.k + dt / 0.34);
        setAim(this._dirAng(lerp(1.1, -1.9, mv.k)));         // the blade RISES through you
        if (mv.t <= 0) { mv.ph = "rec"; mv.t = 0.36; }
      } else { a.vx = lerp(a.vx, 0, clamp(8 * dt, 0, 1)); if (mv.t <= 0) this.mv = null; }
    }

    else if (mv.id === "juggle") {   // ---- JUGGLE: hop after an airborne player and bat them ----
      if (mv.ph === "tele") { if (mv.t <= 0) { mv.ph = "exec"; mv.t = 0.5; mv.k = 0; a.vy = -700; a.vx = clamp(dx * 2.6, -520, 520); } }
      else if (mv.ph === "exec") {
        mv.k = Math.min(1, mv.k + dt / 0.3);
        setAim(this._dirAng(lerp(-1.7, 0.6, mv.k)));         // an overhead air-swat
        if (mv.t <= 0) { mv.ph = "rec"; mv.t = 0.3; }
      } else if (mv.t <= 0) this.mv = null;
    }

    else if (mv.id === "slam") {   // ---- POWER SLAM: leap -> hang -> plunge -> shockwaves ----
      if (mv.ph === "tele") {      // leap up toward a point above the player
        if (mv.k == null) { mv.k = 1; a.vy = -780; a.vx = clamp(dx * 1.9, -640, 640); }
        setAim(-Math.PI / 2);
        if (mv.t <= 0) { mv.ph = "hang"; mv.t = 0.24; }
      } else if (mv.ph === "hang") {                          // the held beat at the apex — your dodge window
        a.vy = 0; a.vx = lerp(a.vx, 0, clamp(9 * dt, 0, 1));
        setAim(Math.PI / 2);                                  // blade snaps point-DOWN
        if (mv.t <= 0) { mv.ph = "exec"; mv.t = 1.0; try { FX.ring(a.x, a.y, 18, "#e9d5ff"); } catch (e) {} }
      } else if (mv.ph === "exec") {                          // the plunge
        a.vy = 1350; a.vx = lerp(a.vx, 0, clamp(6 * dt, 0, 1));
        setAim(Math.PI / 2);
        if (a.onGround || mv.t <= 0) {
          mv.ph = "rec"; mv.t = 0.45;
          const gy = CONFIG.world.groundY;
          this.waves.push({ x: a.x + 26, y: gy, vx: 620, life: 0.85 }, { x: a.x - 26, y: gy, vx: -620, life: 0.85 });
          this.juice({ shake: 13, hitstop: CONFIG.hitStop.big, zoom: CONFIG.juice.zoomBig });   // the PLUNGE lands like a hammer
          try { FX.explode(a.x, gy - 6, this.color, 1.25); FX.ring(a.x, gy - 4, 30, "#ffffff"); FX.ring(a.x, gy - 4, 18, this.color); FX.burst(a.x, gy - 8, 0, -1, 20, this.color); } catch (e) {}
        }
      } else { a.vx = lerp(a.vx, 0, clamp(8 * dt, 0, 1)); if (mv.t <= 0) this.mv = null; }
    }

    else if (mv.id === "getsuga") {   // ---- CRESCENT REND: overhead chop rips a tear-wave loose ----
      if (mv.ph === "tele") {
        a.vx = lerp(a.vx, 0, clamp(10 * dt, 0, 1));
        setAim(-Math.PI / 2);                                 // raised high — the read
        if (mv.t <= 0) { mv.ph = "exec"; mv.t = 0.22; mv.k = 0; }
      } else if (mv.ph === "exec") {
        mv.k = Math.min(1, mv.k + dt / 0.22);
        setAim(this._dirAng(lerp(-1.55, 0.75, mv.k)));        // the chop
        if (!mv.hitDone && mv.k > 0.45) { mv.hitDone = true; this._fireCrescents(player); a.vx -= dir * 130; }
        if (mv.t <= 0) { mv.ph = "rec"; mv.t = 0.38; }
      } else { a.vx = lerp(a.vx, 0, clamp(8 * dt, 0, 1)); if (mv.t <= 0) this.mv = null; }
    }

    else if (mv.id === "throw") {   // ---- BLADE THROW (P3: flash-step to the embedded blade) ----
      if (mv.ph === "tele") {
        const ang = Math.atan2(player.y - (a.y - a.hh * 0.2), player.x - a.x);
        setAim(ang);
        if (mv.t <= 0) {
          this.blade.throwBlade(); this._recallT = 0.9; this._threwHit = false;
          this._fsPending = this.phase >= 3;
          this.mv = null; this._state = "throw";
          try { if (typeof SFX !== "undefined") SFX.throwBlade(); } catch (e) {}
        }
      }
    }
    else this.mv = null;
  },

  // fire a crescent as a REAL projectile (parryable / deflectable through the game's own system)
  _crescent(x, y, ang, sp, dmg, r) {
    if (!this._proj || typeof Projectile === "undefined") return;
    const p = new Projectile(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp);
    p.crescent = true; p.kind = "crescent"; p.tint = "#b06cff"; p.dmg = dmg; p.r = r; p.life = 2.4; p.deflectDmg = 34;
    this._proj.push(p);
  },
  // QUALITY over quantity: one big, FAST crescent (a tight fan only in the final form)
  _fireCrescents(player) {
    const a = this.actor, ph = this.phase;
    const ang = Math.atan2(player.y - (a.y - a.hh * 0.4), player.x - a.x);
    const sp = 760 + ph * 90, n = ph >= 3 ? 3 : 1, spread = 0.13;
    const ox = a.x + Math.cos(ang) * 52, oy = a.y - a.hh * 0.4 + Math.sin(ang) * 20;
    for (let i = 0; i < n; i++) this._crescent(ox, oy, ang + (i - (n - 1) / 2) * spread, sp, 16 + ph * 5, 26 + ph * 3);
    this.juice({ shake: 5 });
    try { if (typeof SFX !== "undefined") SFX.crescent(); FX.flash(ox, oy, 34, "#c98cff"); FX.burst(ox, oy, Math.cos(ang), Math.sin(ang), 12, this.color); } catch (e) {}
  },

  _flashStep(player) {   // vanish and reappear at the embedded blade, catching it mid-strike
    const a = this.actor, b = this.blade;
    this.imgs.push({ x: a.x, y: a.y, f: this.facing, t: 0.4 }, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 20, f: this.facing, t: 0.3 });
    try { FX.ghost(a.x, a.y, a.hw, a.hh, this.color); FX.burst(b.x, b.y, 0, -1, 8, "#e9d5ff"); } catch (e) {}
    a.x = clamp(b.x, 40, CONFIG.view.w - 40); a.y = Math.min(b.y, CONFIG.world.groundY - a.hh); a.vx = 0; a.vy = 0;
    b.tryRecall(a);
    this._fsPending = false;
    this.facing = Math.sign(player.x - a.x) || 1;
    this._startStrike(this.facing);   // arrival strike
  },

  // =====================================================================
  //  NEUTRAL GAME (between committed moves)
  // =====================================================================
  _decide(dt, player) {
    const R = this.read, a = this.actor, B = CONFIG.blade;
    const dist = Math.abs(player.x - a.x);
    const incoming = R.pBladeSpeed > B.minHitSpeed * 1.3 && dist < 150 && !player.invulnerable;
    if (incoming && Math.random() < this.sync * dt * 22) { this._state = "dodge"; this._stateT = 0.3; this._decideT = 0.18; return; }
    if (this.blade.state !== "held") { this._state = "throw"; return; }
    if (this._state === "echo") { if (this._echoPtr < this._echoClip.length) return; this._state = "space"; }
    this._echoCd -= dt;
    if (this._echoCd <= 0 && this.echoBuf.length >= 40 && dist < 460) {
      this._echoClip = this.echoBuf.slice(-96); this._echoPtr = 0; this._state = "echo";
      this._echoCd = lerp(9, 5, this.sync) + Math.random() * 2;
      return;
    }
    this._decideT -= dt;
    if (this._decideT > 0) return;
    this._decideT = lerp(0.42, 0.12, this.sync);
    if (dist > 320) this._state = "approach";
    else if (dist < 170) {
      if (R.aggression > 0.45 && Math.random() < 0.55) { this._state = "bait"; this._stateT = 0.4 + Math.random() * 0.3; }
      else { this._state = "strike"; this._stateT = 0.2; }
    } else {
      if (R.pBladeSpeed < B.minHitSpeed * 0.6 && R.aggression > 0.3) { this._state = "punish"; this._stateT = 0.45; }
      else this._state = "space";
    }
  },

  _act(dt, player) {
    const a = this.actor, ai = this.ai;
    const dx = player.x - a.x, adx = Math.abs(dx), dir = Math.sign(dx) || 1, away = -dir;
    this.facing = dir;
    this._dashCd -= dt; this._jumpCd -= dt; if (this._stateT > 0) this._stateT -= dt;
    const band = 120 + (this.blade.lengthBonus || 0) * 0.6;
    let wantSwing = false;

    switch (this._state) {
      case "approach":
        if (dx > 0) ai.right = true; else ai.left = true;
        if (this._dashCd <= 0 && a.dashCharges > 0 && adx > 320) { ai._dash = true; this._dashCd = 0.8; }
        break;
      case "space":
        if (adx > band + 40) { if (dx > 0) ai.right = true; else ai.left = true; }
        else if (adx < band - 40) { if (dx > 0) ai.left = true; else ai.right = true; }
        break;
      case "strike":
        if (this.parryWary && player.guardT > 0 && Math.random() < this.sync) {
          if (adx < band) { if (away > 0) ai.right = true; else ai.left = true; }
          break;
        }
        if (adx > band) { if (dx > 0) ai.right = true; else ai.left = true; }
        wantSwing = true;
        break;
      case "bait":
        if (this._stateT > 0.2) { if (dx > 0) ai.right = true; else ai.left = true; }
        else { if (away > 0) ai.right = true; else ai.left = true;
               if (this._dashCd <= 0 && a.dashCharges > 0) { ai._dash = true; this._dashCd = 0.7; } }
        break;
      case "punish":
        if (dx > 0) ai.right = true; else ai.left = true;
        if (this._dashCd <= 0 && a.dashCharges > 0 && adx > 90) { ai._dash = true; this._dashCd = 0.6; }
        wantSwing = adx < band + 50;
        break;
      case "dodge":
        if (away > 0) ai.right = true; else ai.left = true;
        if (this._dashCd <= 0 && a.dashCharges > 0) { ai._dash = true; this._dashCd = 0.5; }
        break;
      case "echo": {
        const s = this._echoClip[this._echoPtr++];
        if (s) {
          if (s.adv > 0) { if (dx > 0) ai.right = true; else ai.left = true; }
          else if (s.adv < 0) { if (away > 0) ai.right = true; else ai.left = true; }
          if (s.dash && this._dashCd <= 0 && a.dashCharges > 0) { if (dx > 0) ai.right = true; else ai.left = true; ai._dash = true; this._dashCd = 0.4; }
          if (s.jump && a.onGround && this._jumpCd <= 0) { ai._jump = true; this._jumpCd = 0.5; }
          wantSwing = !!s.swing;
        }
        break;
      }
      case "throw":   // blade is out: kite until it comes home
        if (adx < 240) { if (away > 0) ai.right = true; else ai.left = true; }
        else if (adx > 380) { if (dx > 0) ai.right = true; else ai.left = true; }
        break;
    }
    const airThresh = 0.5 - this.airBias * 0.28 * this.sync;
    if (this.read.airborne > airThresh && player.y < a.y - 60 && a.onGround && this._jumpCd <= 0) { ai._jump = true; this._jumpCd = 0.9; }
    this._aim(dt, player, wantSwing);
  },

  // pick a PRECISE strike — mostly vertical (overhead chop / rising cut), sometimes a flat cut.
  // atan2(dy, dx*F) auto-mirrors across facing. Momentum: it whips (smoothstep) + leans in.
  _startStrike(F) {
    const r = Math.random();
    if (r < 0.44) { this._swingFrom = Math.atan2(-1.0, 0.12 * F); this._swingTo = Math.atan2(0.85, 0.85 * F); this._swingKind = "chop"; }        // overhead DOWN
    else if (r < 0.76) { this._swingFrom = Math.atan2(0.9, 0.7 * F); this._swingTo = Math.atan2(-1.0, 0.35 * F); this._swingKind = "rise"; }      // rising UP
    else { this._swingFrom = Math.atan2(-0.15, -0.95 * F); this._swingTo = Math.atan2(0.15, 0.95 * F); this._swingKind = "cut"; }                  // flat CUT across
    this._swingT = 0.18;
    try { if (typeof SFX !== "undefined") SFX.swing(2500); } catch (e) {}
  },

  // ---- blade carriage: a crisp committed STRIKE on demand, otherwise rest the blade VERTICAL
  // (held high when sealed, dragged low once torn) — a stance + planned cuts, never a flail ----
  _aim(dt, player, wantSwing) {
    const a = this.actor, hand = { x: a.x, y: a.y - a.hh * 0.2 }, R = CONFIG.blade.aimRadius;
    const reach = Math.hypot(player.x - hand.x, player.y - hand.y);
    const rr = 150 + (this.blade.lengthBonus || 0) * 0.9;
    this._swingT -= dt;
    if (wantSwing && this._swingT <= -0.34 && reach < rr) this._startStrike(Math.sign(player.x - a.x) || this.facing);
    if (this._swingT > 0) {
      const k = 1 - this._swingT / 0.18, e = k * k * (3 - 2 * k);   // smoothstep = a WHIP: slow cock, fast cut
      this._aimAng = lerpAngle(this._swingFrom, this._swingTo, e);
      if (k > 0.25 && k < 0.8 && a.onGround && !this.mv) {           // momentum: step into the cut so it carries weight
        const dir = Math.sign(player.x - a.x) || this.facing; a.vx = lerp(a.vx, dir * 300, clamp(9 * dt, 0, 1));
      }
    } else {
      const rest = this.phase >= 2 ? Math.PI / 2 : -Math.PI / 2;
      this._aimAng = lerpAngle(this._aimAng, rest, clamp(6 * dt, 0, 1));
    }
    this.blade.aimOverride.x = hand.x + Math.cos(this._aimAng) * R;
    this.blade.aimOverride.y = hand.y + Math.sin(this._aimAng) * R;
  },

  // =====================================================================
  //  PROJECTILE-LIKE HAZARDS the boss owns (crescents + ground waves)
  // =====================================================================
  _updateWaves(dt) {
    if (!this.waves.length) return;
    for (const w of this.waves) { w.x += w.vx * dt; w.life -= dt; }
    this.waves = this.waves.filter((w) => w.life > 0 && w.x > -40 && w.x < CONFIG.view.w + 40);
  },

  // =====================================================================
  //  THE SABER LOCK — a Star Wars blade bind: cross, spark, struggle, break
  // =====================================================================
  _enterLock(x, y, player) {
    // SHORT + snappy so it never kills momentum: a quick bind you resolve in a heartbeat
    this.lock = { t: 0.4, x, y, press: 0.5, sparkT: 0 };
    this.host.hitCd = Math.max(this.host.hitCd, 0.42);   // no chip trades while bound
    this._clashCd = 0.4; player.iframe = Math.max(player.iframe, 0.1);
    this.juice({ shake: 5, flash: 0.12 });
    try { if (typeof SFX !== "undefined") SFX.saberLock(); FX.flash(x, y, 44, "#ffffff"); FX.ring(x, y, 15, this.color); } catch (e) {}
  },
  _tickLock(dt, player, playerBlade) {
    const L = this.lock;
    L.t -= dt;
    if (playerBlade.state === "held") { L.x = (this.blade.tipX + playerBlade.tipX) / 2; L.y = (this.blade.tipY + playerBlade.tipY) / 2; }
    // PRESS: a fast player blade pushes toward YOU winning; letting up lets the reflection win.
    // Fast build so the short bind still resolves decisively.
    const pressing = (playerBlade.state === "held" && playerBlade.tipSpeed > CONFIG.blade.minHitSpeed * 0.45) ? 1 : -0.95;
    L.press = clamp(L.press + pressing * dt * 1.6, 0, 1);
    player.vx = lerp(player.vx, (L.x - player.x) * 1.5, clamp(6 * dt, 0, 1));   // eased hold, not a freeze
    player.iframe = Math.max(player.iframe, 0.08);
    L.sparkT -= dt;
    if (L.sparkT <= 0) {   // pour sparks + a metallic sizzle
      L.sparkT = 0.03;
      try { FX.burst(L.x + (Math.random() * 2 - 1) * 7, L.y + (Math.random() * 2 - 1) * 7, (Math.random() * 2 - 1), (Math.random() * 2 - 1) - 0.3, 3, Math.random() < 0.5 ? "#ffffff" : this.color); if (typeof SFX !== "undefined") SFX.saberSizzle(); } catch (e) {}
      this.juice({ shake: 2 });
    }
    if (L.t <= 0) this._breakLock(player);
  },
  _breakLock(player) {
    const L = this.lock, a = this.actor, s = Math.sign(player.x - a.x) || 1, won = L.press > 0.6;
    // NO slow-mo (it killed momentum) — a crisp shove + a tiny hitstop only
    if (won) {   // you OVERPOWER the reflection: flung back + staggered = a punish window
      a.vx += -s * 900; a.vy -= 240; this._stagger = 0.5; this.sync = clamp(this.sync - 0.22, 0.15, 1);
      this.juice({ txt: "GUARD BROKEN", x: L.x, y: L.y - 24, big: true, quiet: true, color: "#4bd6ff", shake: 9, hitstop: CONFIG.hitStop.small });
      try { if (typeof SFX !== "undefined") SFX.saberBreak(true); } catch (e) {}
    } else {     // the reflection overpowers YOU: shoved back + chipped (drop bind i-frames so it lands)
      player.iframe = 0; player.vx += s * 760; player.vy -= 200; player.takeHit(9 + this.phase * 4, s, -0.4, a); this._syncBump += 0.06;
      this.juice({ txt: "OVERPOWERED", x: L.x, y: L.y - 24, big: true, quiet: true, color: this.color, shake: 8, hitstop: CONFIG.hitStop.small });
      try { if (typeof SFX !== "undefined") { SFX.saberBreak(false); SFX.hurt(); } } catch (e) {}
    }
    try { FX.flash(L.x, L.y, 62, "#ffffff"); FX.ring(L.x, L.y, 28, this.color); FX.ring(L.x, L.y, 15, "#ffffff"); FX.burst(L.x, L.y, 0, 0, 24, "#ffffff"); FX.burst(L.x, L.y, 0, -1, 12, this.color); } catch (e) {}
    this.lock = null;
  },
  _drawLock(ctx) {
    const L = this.lock; if (!L) return;
    const glow = !(typeof GFX !== "undefined" && GFX.low), pulse = 0.6 + 0.4 * Math.sin(performance.now() / 28);
    ctx.save();
    if (glow) ctx.globalCompositeOperation = "lighter";
    const rad = 15 + 9 * pulse, g = ctx.createRadialGradient(L.x, L.y, 1, L.x, L.y, rad * 2.3);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.4, this.color); g.addColorStop(1, "rgba(176,108,255,0)");
    ctx.globalAlpha = 0.92; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L.x, L.y, rad * 2.3, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 0.85; ctx.lineWidth = 3.5; ctx.strokeStyle = L.press > 0.6 ? "#4bd6ff" : this.color;   // strain gauge
    ctx.beginPath(); ctx.arc(L.x, L.y, 22, -Math.PI / 2, -Math.PI / 2 + 6.2832 * L.press); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  },

  // =====================================================================
  //  P3 AERIAL DIRECTOR — the final form plays from DISTANCE and rains
  //  sword-first air-strike DIVES + crescents; you track it by its blade.
  // =====================================================================
  _pointBladeAt(pt, k) {
    const a = this.actor, hand = { x: a.x, y: a.y - a.hh * 0.2 }, R = CONFIG.blade.aimRadius;
    const ang = Math.atan2(pt.y - hand.y, pt.x - hand.x);
    this._aimAng = lerpAngle(this._aimAng, ang, k);
    this.blade.aimOverride.x = hand.x + Math.cos(this._aimAng) * R;
    this.blade.aimOverride.y = hand.y + Math.sin(this._aimAng) * R;
  },
  _aerialBrain(dt, player) {
    const a = this.actor, gy = CONFIG.world.groundY;
    if (!this._air) this._air = { st: "hover", t: 1.1 };
    const A = this._air; A.t -= dt; a.onGround = false;
    this.facing = Math.sign(player.x - a.x) || this.facing;
    if (A.st === "hover") {                              // KEEP FAR: hover high on a side at a big standoff
      if (A.side == null) A.side = (player.x < CONFIG.view.w / 2) ? 1 : -1;
      const weave = Math.sin(performance.now() / 780) * 130;
      const tx = clamp(player.x + A.side * (410 + weave), 90, CONFIG.view.w - 90), ty = clamp(player.y - 285, 70, gy - 150);
      a.x += (tx - a.x) * clamp(2.1 * dt, 0, 1); a.y += (ty - a.y) * clamp(2.1 * dt, 0, 1); a.vx = 0; a.vy = 0;
      this._pointBladeAt(player, clamp(5 * dt, 0, 1));
      if (A.t <= 0) {
        const r = Math.random();
        if (r < 0.4) { A.st = "aim"; A.t = 0.4; A.tx = player.x; A.ty = player.y; A.side = -A.side; this.juice({ shake: 3 }); }
        else if (r < 0.6 && this.blade.state === "held") { A.st = "throwaim"; A.t = 0.3; A.tx = player.x; A.ty = player.y; }
        else if (r < 0.8 && this.blade.state === "held") { A.st = "corner"; A.raise = 0; A.cx = (player.x < CONFIG.view.w / 2) ? CONFIG.view.w - 190 : 190; this.juice({ shake: 4 }); }   // the corner OVERHEAD SLAM
        else { this._fireCrescents(player); A.t = 0.8 + Math.random() * 0.5; }
      }
    } else if (A.st === "aim") {                        // lock the dive line (telegraph)
      a.vx = 0; a.vy = 0;
      this._pointBladeAt({ x: A.tx, y: A.ty }, clamp(9 * dt, 0, 1));
      if (A.t <= 0) {
        A.st = "dive"; A.t = 0.45;
        const m = Math.hypot(A.tx - a.x, A.ty - a.y) || 1; A.dvx = (A.tx - a.x) / m * 1650; A.dvy = (A.ty - a.y) / m * 1650;
        try { if (typeof SFX !== "undefined") SFX.swing(3400); } catch (e) {}
      }
    } else if (A.st === "throwaim") {                   // wind up a blade THROW from the air (like you)
      a.vx = lerp(a.vx, 0, clamp(6 * dt, 0, 1)); a.vy = lerp(a.vy, 0, clamp(6 * dt, 0, 1));
      this._pointBladeAt({ x: A.tx, y: A.ty }, clamp(10 * dt, 0, 1));
      if (A.t <= 0) { this.blade.throwBlade(); A._rt = 1.0; this._threwHit = false; A.st = "throw"; this.juice({ shake: 3 }); try { if (typeof SFX !== "undefined") SFX.throwBlade(); } catch (e) {} }
    } else if (A.st === "throw") {                      // blade is out — hold height, recall when home
      const ty = clamp(player.y - 285, 70, gy - 150);
      a.vx = lerp(a.vx, 0, clamp(4 * dt, 0, 1)); a.y += (ty - a.y) * clamp(1.8 * dt, 0, 1); a.x += a.vx * dt;
      if (this.blade.state === "held") { A.st = "hover"; A.t = 0.7 + Math.random() * 0.4; }
      else { A._rt -= dt; if (A._rt <= 0 || this.blade.state === "embedded") this.blade.tryRecall(this.actor); }
    } else if (A.st === "corner") {                     // rise to a TOP corner, blade straight UP, and GROW it huge
      const tx = A.cx, ty = 130;
      a.x += (tx - a.x) * clamp(2.8 * dt, 0, 1); a.y += (ty - a.y) * clamp(2.8 * dt, 0, 1); a.vx = 0; a.vy = 0;
      this._pointBladeAt({ x: a.x, y: a.y - 400 }, clamp(11 * dt, 0, 1));         // sword points to the sky
      A.raise = Math.min(1, (A.raise || 0) + dt / 0.85);
      this.blade.lengthBonus = 100 + A.raise * 230;                              // it GROWS enormously
      if (A.raise >= 1 && Math.abs(a.x - tx) < 46 && Math.abs(a.y - ty) < 46) {
        A.st = "cornerslam"; A.tx = player.x; this.juice({ shake: 6, flash: 0.22 });
        try { if (typeof SFX !== "undefined") SFX.swing(3600); FX.flash(this.blade.tipX, this.blade.tipY, 42, "#c98cff"); } catch (e) {}
      }
    } else if (A.st === "cornerslam") {                 // SLAM straight down, sword facing DOWN -> a HUGE purple rend
      a.vy = 1600; a.vx = lerp(a.vx, (A.tx - a.x) * 1.4, clamp(4 * dt, 0, 1)); a.x += a.vx * dt; a.y += a.vy * dt;
      this._pointBladeAt({ x: a.x, y: a.y + 400 }, 1);                            // sword points down through the slam
      this.imgs.push({ x: a.x, y: a.y, f: this.facing, t: 0.32 });
      if (a.y >= gy - a.hh) { a.y = gy - a.hh; this._bigSlash(a.x); this.blade.lengthBonus = 100; A.st = "hover"; A.t = 1.3; }
    } else {                                            // DIVE — sword-first plunge
      a.x += A.dvx * dt; a.y += A.dvy * dt;
      this.imgs.push({ x: a.x, y: a.y, f: this.facing, t: 0.26 });
      this._pointBladeAt({ x: a.x + A.dvx, y: a.y + A.dvy }, 1);
      if (a.y >= gy - a.hh || A.t <= 0) {
        a.y = Math.min(a.y, gy - a.hh);
        A.st = "hover"; A.t = 0.9 + Math.random() * 0.6;
        this.juice({ shake: 8, hitstop: CONFIG.hitStop.small });
        try { if (typeof SFX !== "undefined") SFX.slam(); FX.ring(a.x, a.y, 22, this.color); FX.burst(a.x, a.y, 0, -1, 12, this.color); } catch (e) {}
      }
    }
    a.x = clamp(a.x, 40, CONFIG.view.w - 40);
  },
  _bigSlash(x) {   // the corner-slam payoff: a HUGE purple rend — twin sweeping crescents + wide shockwaves
    const gy = CONFIG.world.groundY;
    this.waves.push({ x: x + 34, y: gy, vx: 900, life: 1.15, big: true }, { x: x - 34, y: gy, vx: -900, life: 1.15, big: true });
    this._crescent(x, gy - 34, 0.06, 720, 22, 58);
    this._crescent(x, gy - 34, Math.PI - 0.06, 720, 22, 58);
    this.juice({ shake: 16, hitstop: CONFIG.hitStop.big, zoom: CONFIG.juice.zoomBig, txt: "TEAR", x, y: gy - 130, big: true });
    try { if (typeof SFX !== "undefined") { SFX.boom(); SFX.slam(); } FX.explode(x, gy - 8, this.color, 1.9); FX.ring(x, gy - 4, 48, "#ffffff"); FX.ring(x, gy - 4, 28, this.color); FX.burst(x, gy - 10, 0, -1, 34, this.color); } catch (e) {}
  },

  // =====================================================================
  //  THE ISOLATED COMBAT EXCHANGE (game.js calls this once per step)
  //  The host takes the player's blade through the NORMAL enemy loop — this
  //  handles only what that loop can't: the boss's own weapon vs the player,
  //  the blade CLASH, crescent deflects, and hazard contact.
  // =====================================================================
  updateCombat(dt, player, playerBlade) {
    // The shared boss-death theater retains the host for a short kill-cam. That pose is
    // visual-only: the Echo's isolated weapon loop must not keep hurting the player while
    // the normal enemy loop is advancing Enemy.updateDeath().
    if (!this.active || !this.host || this.host.dead || this.host.dying) return;
    const a = this.actor, mb = this.blade, B = CONFIG.blade;
    this.pb = playerBlade;   // perception cache

    // (0) THE SABER LOCK — a Star Wars blade duel. Two momentum blades meet tip-to-tip at
    // speed and BIND: they cross, sparks pour, the ground trembles, and a press-struggle
    // decides who's thrown back. Keep your blade fast to overpower it; let up and it breaks YOU.
    if (this.lock) { this._tickLock(dt, player, playerBlade); return; }
    if (this._clashCd <= 0 && playerBlade.state === "held" && mb.state === "held" &&
        playerBlade.tipSpeed > B.minHitSpeed * 1.05 && mb.tipSpeed > B.minHitSpeed * 0.65 &&
        Math.hypot(playerBlade.tipX - mb.tipX, playerBlade.tipY - mb.tipY) < 42) {
      this._enterLock((playerBlade.tipX + mb.tipX) / 2, (playerBlade.tipY + mb.tipY) / 2, player);
      return;
    }

    // (1) the boss's HELD blade vs the player — with per-move flavor (launch / spike / juggle)
    if (mb.state === "held" && mb.tipSpeed > B.minHitSpeed && !player.invulnerable &&
        this.segNear(mb.x, mb.y, mb.tipX, mb.tipY, player.x, player.y, player.hw + 10)) {
      let dmg = mb.damageAt() * 0.65;   // the Echo's blade bites, but doesn't shred (balance tune)
      if (dmg > 0) {
        const mv = this.mv;
        if (mv && mv.ph === "exec") {
          if (mv.id === "rend") { player.takeHit(dmg, mb.tipVX, mb.tipVY, a); player.vy = -720; this.juice({ txt: "LAUNCHED", x: player.x, y: player.y - 46, color: this.color, hitstop: CONFIG.hitStop.small, shake: 6 }); this._syncBump += 0.05; try { if (typeof SFX !== "undefined") SFX.updraft(); } catch (e) {} if (this.phase >= 2) { this._answer = "juggle"; this._answerT = 0.28; } return; }
          if (mv.id === "slam") { player.takeHit(dmg * 1.4, 0, 1, a); player.vy = Math.max(player.vy, 520); this._syncBump += 0.05; return; }
          if (mv.id === "juggle") { player.takeHit(dmg, mb.tipVX, mb.tipVY, a); player.vy = Math.min(player.vy, -380); this._syncBump += 0.05; return; }
        }
        player.takeHit(dmg, mb.tipVX, mb.tipVY, a); this._syncBump += 0.05;
      }
    }

    // (2) the boss's THROWN blade vs the player — one hit per throw
    if ((mb.state === "flying" || mb.state === "returning") && !this._threwHit && !player.invulnerable &&
        this.segNear(mb.x, mb.y, mb.tipX, mb.tipY, player.x, player.y, player.hw + 12)) {
      player.takeHit(mb.throwDmg || 20, mb.vx, mb.vy, a); this._threwHit = true; this._syncBump += 0.05;
    }

    // (crescents are real projectiles now — the game's own loop handles their damage,
    //  parry, and deflect-back; nothing to do here)

    // (3) ground shockwaves vs the player (jump them) — the corner-slam rend hits wider + harder
    for (const w of this.waves) {
      if (!w.hit && !player.invulnerable && Math.abs(w.x - player.x) < (w.big ? 40 : 26) && player.y + player.hh > CONFIG.world.groundY - 44) {
        w.hit = true; player.takeHit((w.big ? 22 : 12) + this.phase * 4, w.vx, -0.4, a); player.vy = Math.min(player.vy, -420);
      }
    }
  },

  // =====================================================================
  //  RENDER — the whole boss look lives here (host.draw delegates)
  // =====================================================================
  draw(ctx) {
    if (!this.active || !this.host || !this.actor) return;
    const a = this.actor, ph = this.phase, lowG = (typeof GFX !== "undefined" && GFX.low);

    this._drawTelegraph(ctx);   // ground danger-zone for the slam (behind everything)

    // afterimages (flash-steps + dashes)
    for (const g of this.imgs) {
      ctx.save(); ctx.globalAlpha = clamp(g.t / 0.4, 0, 1) * 0.3; ctx.fillStyle = this.color;
      ctx.fillRect(g.x - a.hw, g.y - a.hh, a.hw * 2, a.hh * 2); ctx.restore();
    }
    // release aura
    if (ph > 1 && !lowG) {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.10 + 0.06 * ph;
      const rad = 42 + ph * 15, g = ctx.createRadialGradient(a.x, a.y, 4, a.x, a.y, rad);
      g.addColorStop(0, this.color); g.addColorStop(1, "rgba(176,108,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a.x, a.y, rad, 0, 6.2832); ctx.fill(); ctx.restore();
    }
    // torn chromatic doubling — converges as sync rises
    if (!lowG) {
      const split = (1 - this.sync) * 9 + 1;
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const j = Math.sin(now * 0.018) * split * 0.35;
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = (0.10 + 0.3 * (1 - this.sync)) * (1 - this.white);
      ctx.fillStyle = "#4bd6ff"; ctx.fillRect(a.x - a.hw - split + j, a.y - a.hh - j * 0.4, a.hw * 2, a.hh * 2);
      ctx.fillStyle = "#ff4b93"; ctx.fillRect(a.x - a.hw + split - j, a.y - a.hh + j * 0.4, a.hw * 2, a.hh * 2);
      ctx.restore();
    }

    // ---- the body: YOUR silhouette (ink + cyan visor), leaning into its motion ----
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(clamp(a.vx / 2400, -1, 1) * 0.14);
    ctx.globalAlpha = 1 - this.white * 0.88;              // P3 white-out: the body fades...
    ctx.fillStyle = this.host.flash > 0 ? "#fff" : ((typeof THEME !== "undefined") ? THEME.ink : "#101018");
    if (!lowG) { ctx.shadowColor = this.color; ctx.shadowBlur = 10; }
    ctx.fillRect(-a.hw, -a.hh, a.hw * 2, a.hh * 2);
    ctx.shadowBlur = 0;
    if (!lowG) {                                          // spectral rim-light down the leading edge
      ctx.fillStyle = this.color; ctx.globalAlpha = (0.65 + 0.25 * Math.sin(performance.now() / 220)) * (1 - this.white * 0.88);
      ctx.fillRect(this.facing > 0 ? a.hw - 2.5 : -a.hw, -a.hh, 2.5, a.hh * 2);
      ctx.globalAlpha = 1 - this.white * 0.88;
    }
    if (ph >= 2) {                                        // torn: violet crack veins glow across the body
      ctx.strokeStyle = this.color; ctx.lineWidth = 1.6; ctx.globalAlpha = (0.5 + 0.5 * Math.sin(performance.now() / 300)) * (1 - this.white * 0.88);
      ctx.beginPath();
      ctx.moveTo(-a.hw * 0.5, -a.hh); ctx.lineTo(-a.hw * 0.1, -a.hh * 0.3); ctx.lineTo(-a.hw * 0.6, a.hh * 0.4);
      ctx.moveTo(a.hw * 0.6, -a.hh * 0.6); ctx.lineTo(a.hw * 0.15, 0); ctx.lineTo(a.hw * 0.55, a.hh);
      if (ph >= 3) { ctx.moveTo(0, -a.hh); ctx.lineTo(a.hw * 0.2, -a.hh * 0.1); ctx.lineTo(-a.hw * 0.2, a.hh * 0.7); }
      ctx.stroke();
    }
    ctx.restore();
    // the visor eye stays at FULL alpha — even mid white-out you can track its gaze
    ctx.fillStyle = CONFIG.colors.eye;
    ctx.fillRect(a.x + this.facing * 5 - 4, a.y - a.hh + 12, 8, 5);

    // ---- the blade (always fully visible — in P3 it IS how you track the boss) ----
    this.blade.draw(ctx, a);
    this._drawGlint(ctx);
    this._drawWaves(ctx);
    this._drawLock(ctx);
    // NO bar above the model — the boss uses only the top segmented HP bar (like every boss)
  },

  _drawTelegraph(ctx) {   // slam danger-zone: a column + a ground ring where the plunge will land
    const mv = this.mv;
    if (!mv || mv.id !== "slam" || (mv.ph !== "tele" && mv.ph !== "hang" && mv.ph !== "exec")) return;
    const gy = CONFIG.world.groundY, a = this.actor, pulse = 0.5 + 0.5 * Math.sin(performance.now() / 70);
    ctx.save();
    ctx.globalAlpha = 0.12 + 0.16 * pulse; ctx.fillStyle = this.color;
    ctx.fillRect(a.x - 22, a.y, 44, Math.max(0, gy - a.y));
    ctx.globalAlpha = 0.45 + 0.4 * pulse; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.setLineDash([11, 8]);
    ctx.beginPath(); ctx.ellipse(a.x, gy - 2, 48, 12, 0, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 0.55 + 0.4 * pulse; ctx.strokeStyle = this.color; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(a.x, gy - 2, 30, 8, 0, 0, 6.2832); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
  },

  _drawGlint(ctx) {   // a bright edge along the blade during a move telegraph — the universal "big one coming" read
    const mv = this.mv;
    if (!mv || mv.ph !== "tele" && mv.ph !== "hang") return;
    const b = this.blade, pulse = 0.55 + 0.45 * Math.sin(performance.now() / 55);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.7 * pulse; ctx.strokeStyle = "#f0e6ff"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.tipX, b.tipY); ctx.stroke();
    ctx.globalAlpha = pulse; ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(b.tipX, b.tipY, 3.5 + 2 * pulse, 0, 6.2832); ctx.fill();
    ctx.restore();
  },

  _drawWaves(ctx) {
    if (!this.waves.length) return;
    const glow = !(typeof GFX !== "undefined" && GFX.low);
    for (const w of this.waves) {
      const life = w.big ? 1.15 : 0.85, k = 1 - w.life / life, al = clamp(w.life / life, 0, 1), s = w.big ? 1.9 : 1;
      ctx.save();
      if (glow) ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.75 * al; ctx.strokeStyle = this.color; ctx.lineWidth = 4 * s;
      ctx.beginPath(); ctx.arc(w.x, w.y, (12 + k * 12) * s, Math.PI, 0); ctx.stroke();
      ctx.globalAlpha = 0.5 * al; ctx.strokeStyle = "#efe3ff"; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.arc(w.x, w.y, (7 + k * 9) * s, Math.PI, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};

// ------- the HOST: a real Enemy so every existing boss system just works -------
// Blade hits, statuses, knockback, the segmented boss HP bar, difficulty scaling, kill credit,
// and the boss-death cinematic all flow through the normal enemy path. Its update() drives the
// Mirror brain and mirrors the actor's position; knockback is forwarded into the actor.
class MirrorHost extends Enemy {
  constructor(x, y, mods) {
    // heavier presence than the old Echo, and knockback tuned so hits FEEL like they land
    super(x, y, Object.assign({}, CONFIG.echo, { knockbackTaken: 5.5, weight: 1.35 }));
    this.kind = "boss"; this.isBoss = true; this.isMirrorBoss = true;
    this.bossName = "THE ECHO"; this.color = "#b06cff";
    this.epithet = "YOUR REFLECTION"; this.phaseMarks = [0.60, 0.25]; this.phaseTag = "SEALED";
    this.spawnClone = false; this.mode = "mirror";
    this._mods = mods || null;
    this._live = false;   // set true by the game when actually fought (bestiary previews stay inert)
  }
  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    if (typeof Mirror === "undefined" || !this._live) return;
    if (Mirror.host !== this) Mirror.attach(this, this._mods);
    Mirror.hostStep(dt, platforms, player, projectiles);
    // the host IS the body: hitbox, contact damage, and the boss bar track the actor
    this.x = Mirror.actor.x; this.y = Mirror.actor.y;
    this.facing = Mirror.facing; this.onGround = Mirror.actor.onGround;
    this.vx = 0; this.vy = 0;   // impulses were forwarded to the actor in hit()
  }
  hit(dmg, kx, ky) {
    const pvx = this.vx, pvy = this.vy;
    const dealt = super.hit(dmg, kx, ky);   // damage, statuses, flash, kill-credit — the real pipeline
    if (typeof Mirror !== "undefined" && Mirror.host === this && Mirror.actor) {
      Mirror.actor.vx += (this.vx - pvx); Mirror.actor.vy += (this.vy - pvy);   // knockback lands on the BODY
      Mirror._stagger = Math.max(Mirror._stagger || 0, 0.1);                    // it visibly reels
      Mirror._syncBump -= 0.02;
    }
    this.vx = pvx; this.vy = pvy;
    return dealt;   // preserve Enemy.hit()'s damage contract for shared boss feedback hooks
  }
  draw(ctx) {
    if (typeof Mirror !== "undefined" && Mirror.host === this && Mirror.active) { Mirror.draw(ctx); return; }
    // inert fallback (bestiary / previews): the sealed silhouette
    const x = this.x - this.hw, y = this.y - this.hh;
    ctx.fillStyle = (typeof THEME !== "undefined") ? THEME.ink : "#101018";
    ctx.fillRect(x, y, this.hw * 2, this.hh * 2);
    ctx.fillStyle = CONFIG.colors.eye; ctx.fillRect(this.x + this.facing * 5 - 4, y + 12, 8, 5);
    ctx.strokeStyle = "#b06cff"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x, this.y - this.hh - 26); ctx.stroke();
  }
}

// ------- THE REFLECTION — a real Enemy (so it reacts to your hits like anything else) -------
// Spawned in phase 2 via the boss's spawnClone hook. A bright mirror-image of YOU that flees to
// a CORNER and unleashes fully-fleshed crescent patterns (fan / barrage / sweep). Because it
// extends Enemy, blade hits knock it around + flash it through the normal pipeline; a spring pulls
// it back to its corner so knockback reads. It self-dissolves when the boss reaches its final phase.
class ReflectionEnemy extends Enemy {
  constructor(x, y) {
    super(x, y, Object.assign({}, CONFIG.echo, { hp: 200, w: 30, h: 46, knockbackTaken: 6, weight: 1.0, contactDmg: 14 }));
    this.kind = "reflection"; this.isBoss = false; this.bossName = null;
    this.color = "#c96bff";                       // bright + glowing (was barely visible before)
    this._corner = this._pickCorner(); this._st = "fly";
    this._patCd = 1.4; this._pat = null; this._patN = 0; this._patT = 0; this._bob = Math.random() * 6.28;
  }
  _pickCorner() {
    const m = 150, gy = CONFIG.world.groundY, cs = [
      { x: m, y: 140 }, { x: CONFIG.view.w - m, y: 140 },
      { x: m, y: gy - 280 }, { x: CONFIG.view.w - m, y: gy - 280 },
    ];
    return cs[Math.floor(Math.random() * cs.length)];
  }
  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    this._proj = projectiles;   // its crescents are real projectiles too (parryable)
    if (typeof Mirror === "undefined" || !Mirror.active || (Mirror.host && Mirror.host.dead) || Mirror.phase >= 3) {
      this.dead = true; try { FX.death(this.x, this.y, 18, this.color); FX.burst(this.x, this.y, 0, -1, 14, "#e9d5ff"); if (typeof SFX !== "undefined") SFX.recall(); } catch (e) {}
      return;
    }
    this.facing = Math.sign(player.x - this.x) || this.facing;
    this._bob += dt * 3;
    // spring toward the corner + integrate, so a hit visibly SHOVES it and it recovers
    const c = this._corner;
    this.vx += (c.x - this.x) * 6 * dt; this.vy += (c.y + Math.sin(this._bob) * 10 - this.y) * 6 * dt;
    this.vx *= Math.exp(-3.2 * dt); this.vy *= Math.exp(-3.2 * dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
    // patterns
    if (this._pat) { this._runPattern(dt, player); }
    else { this._patCd -= dt; if (this._patCd <= 0 && Math.abs(this.x - c.x) < 120) { this._pat = ["fan", "barrage", "sweep"][Math.floor(Math.random() * 3)]; this._patN = 0; this._patT = 0; this._patCd = 2.6 + Math.random() * 1.2; if (Math.random() < 0.4) this._corner = this._pickCorner(); } }
  }
  _shoot(ang, sp, dmg, r) {
    if (this._proj && typeof Projectile !== "undefined") {
      const p = new Projectile(this.x, this.y, Math.cos(ang) * sp, Math.sin(ang) * sp);
      p.crescent = true; p.kind = "crescent"; p.tint = this.color; p.dmg = dmg; p.r = r; p.life = 2.8; p.deflectDmg = 30;
      this._proj.push(p);
    }
    try { if (typeof SFX !== "undefined") SFX.crescent(); FX.flash(this.x, this.y, 24, "#c98cff"); FX.burst(this.x, this.y, Math.cos(ang), Math.sin(ang), 6, this.color); } catch (e) {}
  }
  _runPattern(dt, player) {   // QUALITY over quantity — few, big, FAST crescents
    this._patT -= dt; if (this._patT > 0) return;
    const toP = Math.atan2(player.y - this.y, player.x - this.x);
    if (this._pat === "fan") {                    // a clean 3-wide spread
      for (let i = 0; i < 3; i++) this._shoot(toP + (i - 1) * 0.26, 660, 15, 30);
      this.flash = 0.12; this._pat = null;
    } else if (this._pat === "barrage") {         // a few heavy aimed shots
      this._shoot(toP + (Math.random() * 2 - 1) * 0.06, 780, 16, 28); this._patN++; this._patT = 0.26;
      if (this._patN >= 3) this._pat = null;
    } else {                                      // a short scything sweep
      this._shoot(toP - 0.42 + this._patN * 0.21, 680, 15, 28); this._patN++; this._patT = 0.16;
      if (this._patN >= 5) this._pat = null;
    }
  }
  draw(ctx) {
    const lowG = (typeof GFX !== "undefined" && GFX.low), x = this.x, y = this.y, r = this.hw + 6;
    if (!lowG) {   // strong outer glow so it's unmistakably visible
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.38 + (this._pat ? 0.15 : 0);
      const g = ctx.createRadialGradient(x, y, 2, x, y, r * 2.3);
      g.addColorStop(0, this.color); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.3, 0, 6.2832); ctx.fill(); ctx.restore();
    }
    ctx.save();   // a bright diamond mirror-image + white outline + visor
    ctx.fillStyle = this.flash > 0 ? "#ffffff" : this.color;
    if (!lowG) { ctx.shadowColor = this.color; ctx.shadowBlur = 14; }
    ctx.beginPath(); ctx.moveTo(x, y - this.hh); ctx.lineTo(x + this.hw, y); ctx.lineTo(x, y + this.hh); ctx.lineTo(x - this.hw, y); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.globalAlpha = 0.85; ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = CONFIG.colors.eye; ctx.fillRect(x + this.facing * 4 - 4, y - 6, 8, 5);
    ctx.restore();
    this.drawHpBar(ctx);
  }
}

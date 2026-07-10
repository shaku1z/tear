// ------- THE MIRROR: a real second momentum-blade fighter (Phase F) -------
// Additive, not atomic. The Mirror owns its OWN Player + Blade (driven through the same
// aiInput/aimOverride seams attract mode uses), and lives OUTSIDE enemies[] and the player
// singleton. A single isolated collision function (updateCombat) handles the only two
// interactions that matter — the real player's blade vs the Mirror, and the Mirror's blade
// vs the real player — reusing the existing _segNear/tipSpeed math in both directions.
//
// Nothing in the existing player/blade/enemy/game code has to know the Mirror exists; the
// main loop opts in by calling Mirror.update / updateCombat / draw only while a duel runs.
const Mirror = {
  active: false,
  actor: null,        // a real Player instance, AI-driven (its own hp is unused; see this.hp)
  blade: null,        // a real Blade instance, AI-aimed
  hp: 0, maxHp: 0,    // the Mirror's OWN health (the duel's boss bar)
  hitCd: 0,           // i-frame so the player's blade can't multi-hit one contact
  facing: 1,
  color: "#b06cff",   // the "tear" violet (F6 replaces this with the torn-double render)
  ai: null,           // synthetic controller flags the aiInput closure reads
  _swingT: 0, _swingDir: 1, _swingBase: 0, _aimAng: -Math.PI / 2,
  _dashCd: 0,

  // closest-point segment test (hilt->tip vs a point), copied from the proven attract.js use
  segNear(ax, ay, bx, by, px, py, r) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) <= r;
  },

  spawn(x, y, hp, mods) {
    const a = this.actor = new Player(x, y);
    a.maxHp = a.hp = 99999;   // actor HP is irrelevant — the Mirror's death is this.hp
    const ai = this.ai = { left: false, right: false, up: false, down: false, _dash: false, _jump: false };
    a.aiInput = {
      left: () => ai.left, right: () => ai.right, up: () => ai.up, down: () => ai.down,
      dashPressed: () => { const v = ai._dash; ai._dash = false; return v; },
      jumpPressed: () => { const v = ai._jump; ai._jump = false; return v; },
    };
    const b = this.blade = new Blade();
    b.aimOverride = { x: x, y: y - 80 };
    b.lmbOverride = false;    // the Mirror controls its own tether, never the human's mouse
    b.trailColor = "#b06cff"; b.glowColor = "#c98cff";   // its slashes read as the Mirror's, not yours
    b.freeRecall = true;      // always recalls a thrown blade (no weaponless softlock)
    this.hp = this.maxHp = hp || 900;
    this.hitCd = 0; this._dashCd = 0; this._swingT = 0; this._aimAng = -Math.PI / 2; this.facing = 1;
    this.sync = 0.35;   // 0 = crude, telegraphed torn double; 1 = a perfect reflection (F6 escalates)
    // a rolling model of how THIS player fights, updated every frame
    this.read = { dist: 300, airborne: 0, aggression: 0, dashHeat: 0, closing: 0, pBladeSpeed: 0 };
    this._state = "approach"; this._stateT = 0; this._decideT = 0;
    this._pDashPrev = 0; this._pPrevX = x; this._jumpCd = 0;
    // ghost-echo: a rolling capture of the player's recent motion, replayed back mirrored
    this.echoBuf = []; this._echoClip = []; this._echoPtr = 0; this._echoCd = 3;
    this._prevDist = 300; this._pDashPrev2 = 0; this._pGroundPrev = true; this._justEchoed = false;
    this._clashCd = 0; this._syncBump = 0; this._justClashed = false;
    this._throwCd = 4.5; this._recallT = 0; this._wantThrow = false; this._threwHit = false;   // full-kit: thrown blade
    // build-awareness (F8): read the player's equipped mods and bias behavior (ramped by sync)
    this.mods = mods || {};
    this.airBias = (this.mods.airBonus || this.mods.aerialRave) ? 1 : 0;                              // they favor the air -> contest it harder
    this.parryWary = (this.mods.parryGuard || this.mods.backlash || this.mods.backlashSurge || this.mods.parryStun) ? 1 : 0;  // they punish parries -> don't swing into a guard
    this.active = true;
    return this;
  },

  // ---- behavioral read: a rolling model of how THIS player fights this duel ----
  _updateRead(dt, player, playerBlade) {
    const R = this.read, a = this.actor, B = CONFIG.blade;
    const dist = Math.abs(player.x - a.x), kSlow = clamp(2.2 * dt, 0, 1), kFast = clamp(6 * dt, 0, 1);
    R.dist += (dist - R.dist) * kSlow;
    R.airborne += ((player.onGround ? 0 : 1) - R.airborne) * kSlow;
    const pvx = (player.x - this._pPrevX) / (dt || 0.016); this._pPrevX = player.x;
    R.closing += ((Math.sign(a.x - player.x) === Math.sign(pvx) && Math.abs(pvx) > 60 ? 1 : 0) - R.closing) * kFast;
    const swinging = (playerBlade.tipSpeed > B.minHitSpeed * 1.1 && dist < 180) ? 1 : 0;   // fast blade, close = aiming at us
    R.aggression += (swinging - R.aggression) * clamp(1.8 * dt, 0, 1);
    if (player.dashTimer > 0 && this._pDashPrev <= 0) R.dashHeat = Math.min(1, R.dashHeat + 0.34);   // dash-happiness
    this._pDashPrev = player.dashTimer;
    R.dashHeat *= Math.exp(-0.5 * dt);
    R.pBladeSpeed = playerBlade.tipSpeed;
  },

  // ---- ghost-echo: record the player's recent motion as a compact per-frame stream ----
  _recordEcho(dt, player, playerBlade) {
    const a = this.actor, dist = Math.abs(player.x - a.x);
    const closed = this._prevDist - dist; this._prevDist = dist;
    const adv = Math.abs(closed) < 0.4 ? 0 : Math.sign(closed);        // +1 = the player closed on us
    const dash = (player.dashTimer > 0 && this._pDashPrev2 <= 0) ? 1 : 0; this._pDashPrev2 = player.dashTimer;
    const jump = (!player.onGround && this._pGroundPrev) ? 1 : 0; this._pGroundPrev = player.onGround;
    const swing = playerBlade.tipSpeed > CONFIG.blade.minHitSpeed ? 1 : 0;
    this.echoBuf.push({ adv, dash, jump, swing });
    if (this.echoBuf.length > 130) this.echoBuf.shift();               // ~2s at 60fps
  },

  // ---- decide: pick a combat intent from the read + geometry + sync ----
  _decide(dt, player, playerBlade) {
    const R = this.read, a = this.actor, B = CONFIG.blade;
    const dist = Math.abs(player.x - a.x);
    // an incoming fast blade nearby is an emergency that can interrupt the reaction cadence,
    // but only if the Mirror is synced enough to READ it (low sync = eats the hit)
    const incoming = playerBlade.tipSpeed > B.minHitSpeed * 1.3 && dist < 135 && !player.invulnerable;
    if (incoming && Math.random() < this.sync * dt * 22) { this._state = "dodge"; this._stateT = 0.3; this._decideT = 0.18; return; }
    // while the blade is thrown, kite and wait for it to return before ANY melee intent
    if (this.blade.state !== "held") { this._state = "throw"; return; }
    // let an in-progress ECHO run its clip to completion before re-deciding
    if (this._state === "echo") { if (this._echoPtr < this._echoClip.length) return; this._state = "space"; }
    // periodically THROW YOUR OWN RHYTHM BACK: replay a mirrored snippet of your recent motion.
    // higher sync => it echoes more often (it has learned you better).
    this._echoCd -= dt;
    if (this._echoCd <= 0 && this.echoBuf.length >= 40 && dist < 460) {
      this._echoClip = this.echoBuf.slice(-96); this._echoPtr = 0; this._state = "echo";
      this._echoCd = lerp(6.5, 2.5, this.sync) + Math.random() * 1.5; this._justEchoed = true;
      return;
    }
    // full-kit ranged option: hurl the momentum blade at you, then recall it (like a real player)
    this._throwCd -= dt;
    if (this._throwCd <= 0 && this.blade.state === "held" && this.sync > 0.4 && dist > 160 && dist < 480) {
      this._state = "throw"; this._stateT = 0.7; this._wantThrow = true; this._threwHit = false;
      this._throwCd = lerp(7.5, 4, this.sync) + Math.random() * 2;
      return;
    }
    this._decideT -= dt;
    if (this._decideT > 0) return;
    this._decideT = lerp(0.42, 0.12, this.sync);   // sharper reactions as sync climbs

    if (dist > 300) this._state = "approach";
    else if (dist < 150) {
      // in reach: bait a defensive/aggressive player into a whiff, else just strike
      if (R.aggression > 0.45 && Math.random() < 0.6) { this._state = "bait"; this._stateT = 0.4 + Math.random() * 0.3; }
      else { this._state = "strike"; this._stateT = 0.18; }
    } else {
      // mid: punish a fresh whiff (their blade WAS fast, now slow) or hold a striking band
      if (R.pBladeSpeed < B.minHitSpeed * 0.6 && R.aggression > 0.3) { this._state = "punish"; this._stateT = 0.45; }
      else this._state = "space";
    }
  },

  // ---- act: translate the intent into movement (aiInput) + blade aim ----
  _act(dt, player) {
    const a = this.actor, ai = this.ai;
    ai.left = ai.right = ai.up = ai.down = false;
    const dx = player.x - a.x, adx = Math.abs(dx), dir = Math.sign(dx) || 1, away = -dir;
    this.facing = dir;
    this._dashCd -= dt; this._jumpCd -= dt; if (this._stateT > 0) this._stateT -= dt;
    const band = 118;   // preferred striking distance
    let wantSwing = false, aimAtPlayer = true;

    switch (this._state) {
      case "approach":
        if (dx > 0) ai.right = true; else ai.left = true;
        if (this._dashCd <= 0 && a.dashCharges > 0 && adx > 300) { ai._dash = true; this._dashCd = 0.8; }
        break;
      case "space":                                   // hold the striking band
        if (adx > band + 40) { if (dx > 0) ai.right = true; else ai.left = true; }
        else if (adx < band - 40) { if (dx > 0) ai.left = true; else ai.right = true; }
        break;
      case "strike":                                  // close the last gap and cut
        // build-aware: vs a parry/Backlash build, don't swing into an ACTIVE guard window
        if (this.parryWary && player.guardT > 0 && Math.random() < this.sync) {
          if (adx < band) { if (away > 0) ai.right = true; else ai.left = true; }   // hold spacing, wait it out
          break;
        }
        if (adx > band) { if (dx > 0) ai.right = true; else ai.left = true; }
        wantSwing = true;
        break;
      case "bait":                                    // feint in, then pull out to punish an over-commit
        if (this._stateT > 0.2) { if (dx > 0) ai.right = true; else ai.left = true; }
        else { if (away > 0) ai.right = true; else ai.left = true;
               if (this._dashCd <= 0 && a.dashCharges > 0) { ai._dash = true; this._dashCd = 0.7; } }
        break;
      case "punish":                                  // dash onto the whiff and slash
        if (dx > 0) ai.right = true; else ai.left = true;
        if (this._dashCd <= 0 && a.dashCharges > 0 && adx > 90) { ai._dash = true; this._dashCd = 0.6; }
        wantSwing = adx < 160;
        break;
      case "dodge":                                   // dash clear of the incoming blade
        if (away > 0) ai.right = true; else ai.left = true;
        if (this._dashCd <= 0 && a.dashCharges > 0) { ai._dash = true; this._dashCd = 0.5; }
        aimAtPlayer = false;
        break;
      case "echo": {                                  // replay a mirrored snippet of the player's own motion
        const s = this._echoClip[this._echoPtr++];
        if (s) {
          if (s.adv > 0) { if (dx > 0) ai.right = true; else ai.left = true; }        // echo your approach, aimed at you
          else if (s.adv < 0) { if (away > 0) ai.right = true; else ai.left = true; } // echo your retreat
          if (s.dash && this._dashCd <= 0 && a.dashCharges > 0) { if (dx > 0) ai.right = true; else ai.left = true; ai._dash = true; this._dashCd = 0.4; }
          if (s.jump && a.onGround && this._jumpCd <= 0) { ai._jump = true; this._jumpCd = 0.5; }
          wantSwing = !!s.swing;
        }
        break;
      }
      case "throw":                                   // blade is out / being thrown: kite at range, keep aim true
        if (adx < 220) { if (away > 0) ai.right = true; else ai.left = true; }
        else if (adx > 340) { if (dx > 0) ai.right = true; else ai.left = true; }
        if (this._dashCd <= 0 && a.dashCharges > 0 && this.read.aggression > 0.4 && adx < 170) { if (away > 0) ai.right = true; else ai.left = true; ai._dash = true; this._dashCd = 0.6; }
        break;
    }
    // WIELD THE BLADE LIKE ATTRACT: keep it live with a slash whenever the player is in reach,
    // not only when a state explicitly commits (but never while baiting / dodging / blade thrown)
    if (!wantSwing && this._state !== "bait" && this._state !== "dodge" && this._state !== "throw") {
      const reach = Math.hypot(player.x - a.x, player.y - (a.y - a.hh * 0.2));
      if (reach < 140) wantSwing = true;
    }
    // contest an airborne player: hop to meet them — harder if they run an air build
    const airThresh = 0.5 - this.airBias * 0.28 * this.sync;
    if (this.read.airborne > airThresh && player.y < a.y - 60 && a.onGround && this._jumpCd <= 0) { ai._jump = true; this._jumpCd = this.airBias ? 0.6 : 0.9; }

    this._aim(dt, player, wantSwing, aimAtPlayer);
  },

  _aim(dt, player, wantSwing, aimAtPlayer) {
    const a = this.actor, hand = { x: a.x, y: a.y - a.hh * 0.2 }, R = CONFIG.blade.aimRadius;
    const baseAng = aimAtPlayer ? Math.atan2(player.y - hand.y, player.x - hand.x) : (this.facing > 0 ? 0 : Math.PI);
    const reach = Math.hypot(player.x - hand.x, player.y - hand.y);
    this._swingT -= dt;
    if (wantSwing && this._swingT <= -0.12 && reach < 165) {
      this._swingT = 0.16; this._swingDir = Math.random() < 0.5 ? -1 : 1; this._swingBase = baseAng;
    }
    if (this._swingT > 0) {
      const k = 1 - this._swingT / 0.16;
      const wobble = (1 - this.sync) * 0.5 * Math.sin(k * 9);   // low sync => the arc wanders off target
      this._aimAng = this._swingBase - this._swingDir * 1.05 + this._swingDir * 2.1 * k + wobble;
    } else {
      this._aimAng += (baseAng - this._aimAng) * clamp(7 * dt, 0, 1);
    }
    this.blade.aimOverride.x = hand.x + Math.cos(this._aimAng) * R;
    this.blade.aimOverride.y = hand.y + Math.sin(this._aimAng) * R;
  },

  _think(dt, player, playerBlade) {
    this._updateRead(dt, player, playerBlade);
    this._recordEcho(dt, player, playerBlade);
    this._decide(dt, player, playerBlade);
    this._act(dt, player);
  },

  update(dt, player, playerBlade, platforms) {
    if (!this.active) return;
    if (this.hitCd > 0) this.hitCd -= dt;
    if (this._clashCd > 0) this._clashCd -= dt;
    // sync is the phase curve: it drifts UP over the duel (the reflection converges on you) and
    // is nudged by the exchange — landing reads tightens it, a clash fractures it (see updateCombat)
    this.sync = clamp(this.sync + dt * 0.02 + this._syncBump, 0.15, 1); this._syncBump = 0;
    this._think(dt, player, playerBlade);
    this.actor.update(dt, platforms);
    this.actor.facing = this.facing;
    this.actor.x = clamp(this.actor.x, 40, CONFIG.view.w - 40);   // keep it in the arena
    this.blade.update(dt, this.actor, platforms);
    // full-kit throw: launch once the blade's aim is current this frame, then auto-recall
    // (freeRecall guarantees it always comes back — the Mirror is never left weaponless)
    if (this._wantThrow && this.blade.state === "held") { this._wantThrow = false; this.blade.throwBlade(); this._recallT = 0.85; }
    if (this.blade.state !== "held") {
      this._recallT -= dt;
      if (this._recallT <= 0 || this.blade.state === "embedded") this.blade.tryRecall(this.actor);
    }
  },

  // ---- the ONE isolated collision function ----
  updateCombat(dt, player, playerBlade) {
    if (!this.active) return;
    const a = this.actor, mb = this.blade, B = CONFIG.blade;
    // (0) BLADE CLASH: two momentum blades meeting tip-to-tip at speed. Throws both back and
    // FRACTURES sync — the player's own blade fractures the reflection (the phase-curve lever).
    if (this._clashCd <= 0 && playerBlade.state === "held" && mb.state === "held" &&
        playerBlade.tipSpeed > B.minHitSpeed * 1.05 && mb.tipSpeed > B.minHitSpeed * 0.7 &&
        Math.hypot(playerBlade.tipX - mb.tipX, playerBlade.tipY - mb.tipY) < 36) {
      this._clashCd = 0.3; this.hitCd = Math.max(this.hitCd, 0.18); this._justClashed = true;
      this.sync = clamp(this.sync - 0.2, 0.15, 1);
      const mx = (playerBlade.tipX + mb.tipX) / 2, my = (playerBlade.tipY + mb.tipY) / 2, s = Math.sign(a.x - player.x) || 1;
      a.vx += s * 300; a.vy -= 150;                                        // Mirror knocked back
      player.vx += -s * 240; player.vy -= 110; player.iframe = Math.max(player.iframe, 0.12);   // player knocked back + brief safety
      try { FX.flash(mx, my, 40, "#e9f6ff"); FX.ring(mx, my, 16, this.color); FX.burst(mx, my, 0, -1, 14, "#4bd6ff"); } catch (e) {}
      return;   // a clash consumes this frame's exchange
    }
    // (1) the real player's held blade cuts the Mirror
    if (this.hitCd <= 0 && playerBlade.state === "held" && playerBlade.tipSpeed > B.minHitSpeed &&
        this.segNear(playerBlade.x, playerBlade.y, playerBlade.tipX, playerBlade.tipY, a.x, a.y, a.hw + 14)) {
      const dmg = playerBlade.damageAt();
      if (dmg > 0) {
        this.hp -= dmg; this.hitCd = B.enemyHitIframe; this._syncBump -= 0.02;   // getting cut disrupts its read
        const m = Math.hypot(playerBlade.tipVX, playerBlade.tipVY) || 1;
        a.vx += (playerBlade.tipVX / m) * 220; a.vy += (playerBlade.tipVY / m) * 120 - 110;
        try { FX.burst(a.x, a.y, Math.sign(playerBlade.tipVX) || 1, -0.5, 8, this.color); } catch (e) {}
        if (this.hp <= 0) this._defeat();
      }
    }
    // (2) the Mirror's blade cuts the real player (player.invulnerable + takeHit handle i-frames)
    if (mb.state === "held" && mb.tipSpeed > B.minHitSpeed && !player.invulnerable &&
        this.segNear(mb.x, mb.y, mb.tipX, mb.tipY, player.x, player.y, player.hw + 10)) {
      const dmg = mb.damageAt();
      if (dmg > 0) { player.takeHit(dmg, mb.tipVX, mb.tipVY, a); this._syncBump += 0.05; }   // landing a read tightens sync
    }
    // (3) the Mirror's THROWN blade vs the player — one hit per throw (full-kit ranged)
    if ((mb.state === "flying" || mb.state === "returning") && !this._threwHit && !player.invulnerable &&
        this.segNear(mb.x, mb.y, mb.tipX, mb.tipY, player.x, player.y, player.hw + 12)) {
      player.takeHit(mb.throwDmg || 20, mb.vx, mb.vy, a); this._threwHit = true; this._syncBump += 0.05;
    }
  },

  _defeat() {
    this.active = false; this._justDefeated = true;
    try { FX.death(this.actor.x, this.actor.y, 22, this.color); FX.burst(this.actor.x, this.actor.y, 0, -1, 18, this.color); } catch (e) {}
  },

  draw(ctx) {
    if (!this.active) return;
    const a = this.actor;
    // torn-double: chromatic ghost copies of the body that CONVERGE on the real silhouette as
    // sync rises — a desynced reflection at low sync, a clean double of you at high sync.
    if (!(typeof GFX !== "undefined" && GFX.low)) {
      const split = (1 - this.sync) * 11 + 1;
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const j = Math.sin(now * 0.018) * split * 0.35;
      const bx = a.x - a.hw, by = a.y - a.hh, bw = a.hw * 2, bh = a.hh * 2;
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.14 + 0.34 * (1 - this.sync);
      ctx.fillStyle = "#4bd6ff"; ctx.fillRect(bx - split + j, by - j * 0.4, bw, bh);   // cyan tear
      ctx.fillStyle = "#ff4b93"; ctx.fillRect(bx + split - j, by + j * 0.4, bw, bh);   // magenta tear
      ctx.restore();
    }
    this.actor.draw(ctx);
    this.blade.draw(ctx, this.actor);
    this._drawBar(ctx);
  },

  _drawBar(ctx) {
    const a = this.actor, w = 66, x = a.x - w / 2, y = a.y - a.hh - 24, h = 5;
    const fr = clamp(this.hp / this.maxHp, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.82)"; ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
    ctx.fillStyle = "#39343f"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = this.color; ctx.fillRect(x, y, w * fr, h);
    // sync meter: a thin bar under the HP that fills as the reflection converges on you
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(x, y + h + 1.5, w, 2);
    ctx.fillStyle = "#fff"; ctx.fillRect(x, y + h + 1.5, w * clamp(this.sync, 0, 1), 2);
    if (typeof UI !== "undefined") {
      ctx.fillStyle = this.color; ctx.font = UI.font(9, true); ctx.textAlign = "center";
      ctx.fillText(this._state === "echo" ? "◆ ECHO" : "THE MIRROR", a.x, y - 5);
    }
  },
};

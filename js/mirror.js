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

  spawn(x, y, hp) {
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
    this.hp = this.maxHp = hp || 900;
    this.hitCd = 0; this._dashCd = 0; this._swingT = 0; this._aimAng = -Math.PI / 2; this.facing = 1;
    this.sync = 0.35;   // 0 = crude, telegraphed torn double; 1 = a perfect reflection (F6 escalates)
    // a rolling model of how THIS player fights, updated every frame
    this.read = { dist: 300, airborne: 0, aggression: 0, dashHeat: 0, closing: 0, pBladeSpeed: 0 };
    this._state = "approach"; this._stateT = 0; this._decideT = 0;
    this._pDashPrev = 0; this._pPrevX = x; this._jumpCd = 0;
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

  // ---- decide: pick a combat intent from the read + geometry + sync ----
  _decide(dt, player, playerBlade) {
    const R = this.read, a = this.actor, B = CONFIG.blade;
    const dist = Math.abs(player.x - a.x);
    // an incoming fast blade nearby is an emergency that can interrupt the reaction cadence,
    // but only if the Mirror is synced enough to READ it (low sync = eats the hit)
    const incoming = playerBlade.tipSpeed > B.minHitSpeed * 1.3 && dist < 135 && !player.invulnerable;
    if (incoming && Math.random() < this.sync * dt * 22) { this._state = "dodge"; this._stateT = 0.3; this._decideT = 0.18; return; }
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
    }
    // contest an airborne player: hop to meet them
    if (this.read.airborne > 0.5 && player.y < a.y - 70 && a.onGround && this._jumpCd <= 0) { ai._jump = true; this._jumpCd = 0.9; }

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
    this._decide(dt, player, playerBlade);
    this._act(dt, player);
  },

  update(dt, player, playerBlade, platforms) {
    if (!this.active) return;
    if (this.hitCd > 0) this.hitCd -= dt;
    this._think(dt, player, playerBlade);
    this.actor.update(dt, platforms);
    this.actor.facing = this.facing;
    this.actor.x = clamp(this.actor.x, 40, CONFIG.view.w - 40);   // keep it in the arena
    this.blade.update(dt, this.actor, platforms);
  },

  // ---- the ONE isolated collision function ----
  updateCombat(dt, player, playerBlade) {
    if (!this.active) return;
    const a = this.actor, mb = this.blade, B = CONFIG.blade;
    // (1) the real player's held blade cuts the Mirror
    if (this.hitCd <= 0 && playerBlade.state === "held" && playerBlade.tipSpeed > B.minHitSpeed &&
        this.segNear(playerBlade.x, playerBlade.y, playerBlade.tipX, playerBlade.tipY, a.x, a.y, a.hw + 14)) {
      const dmg = playerBlade.damageAt();
      if (dmg > 0) {
        this.hp -= dmg; this.hitCd = B.enemyHitIframe;
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
      if (dmg > 0) player.takeHit(dmg, mb.tipVX, mb.tipVY, a);
    }
  },

  _defeat() {
    this.active = false; this._justDefeated = true;
    try { FX.death(this.actor.x, this.actor.y, 22, this.color); FX.burst(this.actor.x, this.actor.y, 0, -1, 18, this.color); } catch (e) {}
  },

  draw(ctx) {
    if (!this.active) return;
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
    if (typeof UI !== "undefined") { ctx.fillStyle = this.color; ctx.font = UI.font(9, true); ctx.textAlign = "center"; ctx.fillText("THE MIRROR", a.x, y - 5); }
  },
};

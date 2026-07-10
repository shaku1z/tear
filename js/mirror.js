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
    this.active = true;
    return this;
  },

  // ---- AI (F2 placeholder: approach + burst a slash in reach; real behavior is F3-F6) ----
  _think(dt, player) {
    const a = this.actor, ai = this.ai;
    ai.left = ai.right = ai.up = ai.down = false;
    const dx = player.x - a.x, adx = Math.abs(dx);
    this.facing = Math.sign(dx) || this.facing;
    if (adx > 60) { if (dx > 0) ai.right = true; else ai.left = true; }
    this._dashCd -= dt;
    if (this._dashCd <= 0 && a.dashCharges > 0 && adx > 260) {
      if (dx > 0) ai.right = true; else ai.left = true; ai._dash = true; this._dashCd = 0.9;
    }
    // aim: rest on the player, then BURST a fast arc (clears minHitSpeed) when in reach
    const hand = { x: a.x, y: a.y - a.hh * 0.2 }, R = CONFIG.blade.aimRadius;
    const baseAng = Math.atan2(player.y - hand.y, player.x - hand.x);
    const reach = Math.hypot(player.x - hand.x, player.y - hand.y);
    this._swingT -= dt;
    if (this._swingT <= -0.2 && reach < 150) { this._swingT = 0.16; this._swingDir = Math.random() < 0.5 ? -1 : 1; this._swingBase = baseAng; }
    if (this._swingT > 0) { const k = 1 - this._swingT / 0.16; this._aimAng = this._swingBase - this._swingDir * 1.05 + this._swingDir * 2.1 * k; }
    else this._aimAng += (baseAng - this._aimAng) * clamp(7 * dt, 0, 1);
    this.blade.aimOverride.x = hand.x + Math.cos(this._aimAng) * R;
    this.blade.aimOverride.y = hand.y + Math.sin(this._aimAng) * R;
  },

  update(dt, player, platforms) {
    if (!this.active) return;
    if (this.hitCd > 0) this.hitCd -= dt;
    this._think(dt, player);
    this.actor.update(dt, platforms);
    this.actor.facing = this.facing;
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

  _defeat() { this.active = false; },   // F7 wires in rewards/victory juice

  draw(ctx) {
    if (!this.active) return;
    this.actor.draw(ctx);
    this.blade.draw(ctx, this.actor);
  },
};

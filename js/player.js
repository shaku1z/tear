// ------- player: run, jump, dash -------
class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.hw = CONFIG.player.w / 2;
    this.hh = CONFIG.player.h / 2;
    this.onGround = false;
    this.facing = 1;            // 1 right, -1 left
    this.hp = CONFIG.player.hp;
    this.maxHp = CONFIG.player.hp;
    this.oneHit = false;        // Hard difficulty: any hit kills
    this.iframe = 0;

    this.coyote = 0;
    this.jumpBuf = 0;

    this.dashTimer = 0;         // >0 while dashing
    this.dashCd = 0;            // >0 while on cooldown
    this.dashIframe = 0;
    this.dashX = 0; this.dashY = 0;

    this.moveBoost = 1;         // set by the game (e.g. faster while blade is thrown)
    this.downBufferT = 0;       // brief buffer of "down held" so dash-down is forgiving

    // ---- resilience (earned survivability, set by abilities) ----
    this.guardT = 0;            // Riposte: damage-reduction window after a perfect parry
    this.flowDR = 1;            // Flow Guard: damage-taken mult, refreshed each frame by the game
    this.shield = 0;            // Aegis: stored one-hit absorb pips
    this.maxShield = 0;         // ...cap (0 until Aegis is owned)
    this.airTime = 0;           // Aerial Rave: seconds since last grounded
    this.rootT = 0;             // Chain Caster: snared in place (no move/jump/dash) for a bit
    this.slowMult = 1;          // Sludge: slowed while standing in a mud puddle (set by the game)
  }

  get invulnerable() { return this.iframe > 0 || this.dashIframe > 0; }

  update(dt, platforms) {
    const P = CONFIG.player, D = CONFIG.dash;

    // timers
    if (this.iframe > 0) this.iframe -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.dashIframe > 0) this.dashIframe -= dt;
    if (this.coyote > 0) this.coyote -= dt;
    if (this.jumpBuf > 0) this.jumpBuf -= dt;
    if (this.guardT > 0) this.guardT -= dt;
    if (this.rootT > 0) this.rootT -= dt;
    const rooted = this.rootT > 0;

    const dirX = ((Input.right() ? 1 : 0) - (Input.left() ? 1 : 0)) * (rooted ? 0 : 1);
    if (dirX !== 0) this.facing = dirX;
    this.downBufferT = Input.down() ? 0.16 : Math.max(0, this.downBufferT - dt);
    const downHeld = Input.down() || this.downBufferT > 0;

    // ---- dash trigger (snared = no dash) ----
    if (!rooted && Input.dashPressed() && this.dashCd <= 0 && this.dashTimer <= 0) {
      let ax = (Input.right() ? 1 : 0) - (Input.left() ? 1 : 0);
      let ay = (downHeld ? 1 : 0) - (Input.up() ? 1 : 0);
      // a down-dash takes priority over horizontal drift: "S + dash" goes (almost) straight
      // down instead of veering left/right because you happened to be moving
      if (ay > 0 && ax !== 0) ax *= 0.3;
      if (ax === 0 && ay === 0) ax = this.facing; // default: dash where you face
      const m = len(ax, ay) || 1;
      this.dashX = ax / m; this.dashY = ay / m;
      this.dashTimer = D.duration;
      this.dashCd = D.cooldown;
      this.dashIframe = D.iframe;
    }

    if (this.dashTimer > 0) {
      // ---- dashing: burst; a DOWNWARD dash builds on your natural fall instead of
      // capping it (so it feeds Power Slams) — other directions are a fixed burst ----
      this.dashTimer -= dt;
      this.vx = this.dashX * D.speed;
      if (this.dashY > 0) {
        this.vy = Math.max(this.vy + CONFIG.world.gravity * dt, this.dashY * D.speed);
        if (this.vy > P.maxFall * 1.35) this.vy = P.maxFall * 1.35;
      } else {
        this.vy = this.dashY * D.speed;
      }
      if (this.dashTimer <= 0) {
        this.vx *= D.endSpeedKeep;
        if (this.dashY <= 0) this.vy *= D.endSpeedKeep;   // preserve downward momentum into the slam
      }
    } else {
      // ---- normal movement (mud slows your top speed + acceleration) ----
      const accel = (this.onGround ? P.groundAccel : P.airAccel) * this.slowMult;
      const top = P.moveSpeed * this.moveBoost * this.slowMult;
      if (dirX !== 0) {
        this.vx += dirX * accel * dt;
        this.vx = clamp(this.vx, -top, top);
      } else if (this.onGround) {
        const f = P.friction * dt;
        if (Math.abs(this.vx) <= f) this.vx = 0;
        else this.vx -= Math.sign(this.vx) * f;
      }

      // jump (with coyote + buffer) — snared = grounded
      if (Input.jumpPressed() && !rooted) this.jumpBuf = P.jumpBuffer;
      if (this.jumpBuf > 0 && !rooted && (this.onGround || this.coyote > 0)) {
        this.vy = -P.jumpSpeed;
        this.onGround = false;
        this.coyote = 0;
        this.jumpBuf = 0;
      }

      // gravity
      this.vy += CONFIG.world.gravity * dt;
      if (this.vy > P.maxFall) this.vy = P.maxFall;
    }

    // ---- integrate + collide (axis separated) ----
    this.x += this.vx * dt;
    this._collideAxis(platforms, true, 0);
    const prevBottom = this.y + this.hh;   // bottom before the vertical move
    this.y += this.vy * dt;
    const wasOnGround = this.onGround;
    this.onGround = false;
    this._collideAxis(platforms, false, prevBottom);
    if (this.onGround) this.coyote = P.coyoteTime;
    else if (wasOnGround) this.coyote = P.coyoteTime;
    this.airTime = this.onGround ? 0 : this.airTime + dt;

    // keep inside the arena horizontally
    this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
  }

  _collideAxis(platforms, horizontal, prevBottom) {
    for (const p of platforms) {
      if (horizontal && p.floor) continue;   // full-width floor never blocks horizontal movement
      const phw = p.w / 2, phh = p.h / 2;
      const pcx = p.x + phw, pcy = p.y + phh;
      if (!aabbOverlap(this.x, this.y, this.hw, this.hh, pcx, pcy, phw, phh)) continue;

      if (p.oneway) {
        // one-way: only land on top, when falling and arriving from above
        if (horizontal) continue;
        // intentionally going down (hold S, or a downward dash) -> pass through, keep momentum
        if (Input.down() || this.downBufferT > 0 || (this.dashTimer > 0 && (this.dashY > 0 || this.vy > 80))) continue;
        if (this.vy >= 0 && prevBottom <= p.y + 1.5) {
          this.y = p.y - this.hh; this.vy = 0; this.onGround = true;
        }
        continue;
      }

      if (horizontal) {
        if (this.vx > 0) this.x = pcx - phw - this.hw;
        else if (this.vx < 0) this.x = pcx + phw + this.hw;
        this.vx = 0;
      } else {
        if (this.vy > 0) { this.y = pcy - phh - this.hh; this.onGround = true; }
        else if (this.vy < 0) this.y = pcy + phh + this.hh;
        this.vy = 0;
      }
    }
  }

  // returns: "hit" (HP lost) | "absorbed" (a shield pip ate it) | "" (invulnerable)
  takeDamage(dmg, fromX) {
    if (this.invulnerable) return "";
    // Aegis: a stored pip absorbs the hit entirely (works even in one-hit mode)
    if (this.shield > 0) {
      this.shield--;
      this.iframe = CONFIG.player.hitIframe * 0.7;
      return "absorbed";
    }
    dmg *= CONFIG.player.dmgTakenMult * this.flowDR;          // Flow Guard
    if (this.guardT > 0) dmg *= CONFIG.resilience.parryGuardMult;  // Riposte window
    this.hp = this.oneHit ? 0 : Math.max(0, this.hp - dmg);
    this.iframe = CONFIG.player.hitIframe;
    const dir = Math.sign(this.x - fromX) || 1;
    this.vx = dir * 380;
    this.vy = -260;
    return "hit";
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  draw(ctx) {
    // blink while invulnerable
    if (this.iframe > 0 && Math.floor(this.iframe * 20) % 2 === 0) return;

    // body with subtle squash/stretch from vertical speed
    const v = clamp(this.vy / 2200, -1, 1);
    const sy = this.onGround ? 1 : 1 - v * 0.12;   // taller when rising, flatter when falling
    const sx = this.onGround ? 1 : 1 + v * 0.10;
    ctx.save();
    ctx.translate(this.x, this.y + this.hh);
    ctx.scale(sx, sy);
    ctx.translate(-this.x, -(this.y + this.hh));
    ctx.fillStyle = "#000";
    ctx.fillRect(this.x - this.hw, this.y - this.hh, this.hw * 2, this.hh * 2);
    // colored visor (facing cue)
    ctx.fillStyle = CONFIG.colors.eye;
    const ex = this.x + this.facing * 5;
    ctx.fillRect(ex - 4, this.y - this.hh + 12, 8, 5);
    ctx.restore();
  }
}

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

    const dirX = (Input.right() ? 1 : 0) - (Input.left() ? 1 : 0);
    if (dirX !== 0) this.facing = dirX;

    // ---- dash trigger ----
    if (Input.dashPressed() && this.dashCd <= 0 && this.dashTimer <= 0) {
      let ax = (Input.right() ? 1 : 0) - (Input.left() ? 1 : 0);
      let ay = (Input.down() ? 1 : 0) - (Input.up() ? 1 : 0);
      if (ax === 0 && ay === 0) ax = this.facing; // default: dash where you face
      const m = len(ax, ay) || 1;
      this.dashX = ax / m; this.dashY = ay / m;
      this.dashTimer = D.duration;
      this.dashCd = D.cooldown;
      this.dashIframe = D.iframe;
    }

    if (this.dashTimer > 0) {
      // ---- dashing: fixed-speed burst, no gravity ----
      this.dashTimer -= dt;
      this.vx = this.dashX * D.speed;
      this.vy = this.dashY * D.speed;
      if (this.dashTimer <= 0) {
        this.vx *= D.endSpeedKeep;
        this.vy *= D.endSpeedKeep;
      }
    } else {
      // ---- normal movement ----
      const accel = this.onGround ? P.groundAccel : P.airAccel;
      const top = P.moveSpeed * this.moveBoost;
      if (dirX !== 0) {
        this.vx += dirX * accel * dt;
        this.vx = clamp(this.vx, -top, top);
      } else if (this.onGround) {
        const f = P.friction * dt;
        if (Math.abs(this.vx) <= f) this.vx = 0;
        else this.vx -= Math.sign(this.vx) * f;
      }

      // jump (with coyote + buffer)
      if (Input.jumpPressed()) this.jumpBuf = P.jumpBuffer;
      if (this.jumpBuf > 0 && (this.onGround || this.coyote > 0)) {
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

    // keep inside the arena horizontally
    this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
  }

  _collideAxis(platforms, horizontal, prevBottom) {
    for (const p of platforms) {
      const phw = p.w / 2, phh = p.h / 2;
      const pcx = p.x + phw, pcy = p.y + phh;
      if (!aabbOverlap(this.x, this.y, this.hw, this.hh, pcx, pcy, phw, phh)) continue;

      if (p.oneway) {
        // one-way: only land on top, when falling and arriving from above
        if (horizontal) continue;
        // intentionally going down (hold S, or a downward dash) -> pass through, keep momentum
        if (Input.down() || (this.dashTimer > 0 && this.dashY > 0)) continue;
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

  takeDamage(dmg, fromX) {
    if (this.invulnerable) return false;
    dmg *= CONFIG.player.dmgTakenMult;
    this.hp = this.oneHit ? 0 : Math.max(0, this.hp - dmg);
    this.iframe = CONFIG.player.hitIframe;
    const dir = Math.sign(this.x - fromX) || 1;
    this.vx = dir * 380;
    this.vy = -260;
    return true;
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  draw(ctx) {
    // blink while invulnerable
    if (this.iframe > 0 && Math.floor(this.iframe * 20) % 2 === 0) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(this.x - this.hw, this.y - this.hh, this.hw * 2, this.hh * 2);
    // a white eye to give it a face / facing cue
    ctx.fillStyle = "#fff";
    const ex = this.x + this.facing * 6;
    ctx.fillRect(ex - 3, this.y - this.hh + 12, 6, 6);
  }
}

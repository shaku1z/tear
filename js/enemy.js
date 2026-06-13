// ------- enemies: shared base + Charger (melee) + Ranged (kite/wind-up) -------
class Enemy {
  constructor(x, y, cfg) {
    this.cfg = cfg;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.hw = cfg.w / 2;
    this.hh = cfg.h / 2;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.onGround = false;
    this.dead = false;
    this.hitCd = 0;        // blade-hit cooldown (i-frames)
    this.flash = 0;        // visual hit flash
  }

  get radius() { return Math.max(this.hw, this.hh); }

  // gravity + integrate + collide; call from each subclass after setting vx
  integrate(dt, platforms) {
    this.vy += CONFIG.world.gravity * dt;
    if (this.vy > CONFIG.player.maxFall) this.vy = CONFIG.player.maxFall;
    this.x += this.vx * dt;
    this._collideAxis(platforms, true);
    this.y += this.vy * dt;
    this.onGround = false;
    this._collideAxis(platforms, false);
    this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
  }

  _collideAxis(platforms, horizontal) {
    for (const p of platforms) {
      const phw = p.w / 2, phh = p.h / 2;
      const pcx = p.x + phw, pcy = p.y + phh;
      if (!aabbOverlap(this.x, this.y, this.hw, this.hh, pcx, pcy, phw, phh)) continue;
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

  fireAt(player, projectiles, speed) {
    const dx = player.x - this.x, dy = player.y - this.y;
    const m = len(dx, dy) || 1;
    projectiles.push(new Projectile(this.x, this.y, (dx / m) * speed, (dy / m) * speed));
  }

  tickTimers(dt) {
    if (this.hitCd > 0) this.hitCd -= dt;
    if (this.flash > 0) this.flash -= dt;
  }

  hit(dmg, knockX, knockY) {
    this.hp -= dmg;
    this.hitCd = CONFIG.blade.enemyHitIframe;
    this.flash = 0.08;
    const kb = dmg * this.cfg.knockbackTaken;
    const m = len(knockX, knockY) || 1;
    this.vx += (knockX / m) * kb;
    this.vy += (knockY / m) * kb - 120; // a little pop
    if (this.hp <= 0) this.dead = true;
  }

  drawHpBar(ctx) {
    const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2;
    ctx.fillStyle = "#ddd";
    ctx.fillRect(x, y - 10, w, 4);
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y - 10, w * clamp(this.hp / this.maxHp, 0, 1), 4);
  }
}

// ---- Charger: rushes the player, deals contact damage ----
class Charger extends Enemy {
  constructor(x, y) { super(x, y, CONFIG.enemy); }

  update(dt, platforms, player /*, projectiles */) {
    this.tickTimers(dt);
    const dir = Math.sign(player.x - this.x) || 1;
    this.vx = lerp(this.vx, dir * this.cfg.speed, clamp(8 * dt, 0, 1));
    this.integrate(dt, platforms);
  }

  draw(ctx) {
    const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
    if (this.flash > 0) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#fff";
      const dir = Math.sign(this.vx) || 1;
      ctx.fillRect(this.x + dir * 7 - 3, y + 11, 6, 6);
    }
    this.drawHpBar(ctx);
  }
}

// ---- Ranged: keeps distance, telegraphs a shot, fires, then kites ----
class Ranged extends Enemy {
  constructor(x, y) {
    super(x, y, CONFIG.ranged);
    this.state = "kite";                              // kite | windup
    this.aimTimer = this.cfg.aimInterval * (0.4 + Math.random() * 0.6);
    this.windT = 0;
  }

  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    const C = this.cfg;
    const dx = player.x - this.x;
    const dist = Math.abs(dx);
    const away = (-Math.sign(dx)) || 1;

    if (this.state === "kite") {
      let move = 0;
      if (dist < C.tooClose) move = away;                  // flee when crowded
      else if (dist > C.preferredDist * 1.3) move = -away; // drift back into range
      this.vx = lerp(this.vx, move * C.speed, clamp(6 * dt, 0, 1));
      this.aimTimer -= dt;
      if (this.aimTimer <= 0) { this.state = "windup"; this.windT = C.windup; }
    } else { // windup: brace and telegraph, then fire
      this.vx = lerp(this.vx, 0, clamp(12 * dt, 0, 1));
      this.windT -= dt;
      if (this.windT <= 0) {
        this.fireAt(player, projectiles, C.projSpeed);
        this.state = "kite";
        this.aimTimer = C.aimInterval;
      }
    }
    this.integrate(dt, platforms);
  }

  draw(ctx, player) {
    const charging = this.state === "windup";
    // body: a diamond, to read differently from the square charger
    const r = this.hw + 2;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - r);
    ctx.lineTo(this.x + r, this.y);
    ctx.lineTo(this.x, this.y + r);
    ctx.lineTo(this.x - r, this.y);
    ctx.closePath();
    if (this.flash > 0) {
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.stroke();
    } else {
      ctx.fillStyle = "#000"; ctx.fill();
    }

    // telegraph: dashed aim line + converging charge ring while winding up
    if (charging && player) {
      const k = 1 - clamp(this.windT / this.cfg.windup, 0, 1); // 0 -> 1 as it charges
      const dx = player.x - this.x, dy = player.y - this.y;
      const m = len(dx, dy) || 1;
      ctx.strokeStyle = "#000";
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + (dx / m) * 600, this.y + (dy / m) * 600);
      ctx.stroke();
      ctx.setLineDash([]);
      // ring shrinks inward as it nears firing
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 26 * (1 - k) + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    this.drawHpBar(ctx);
  }
}

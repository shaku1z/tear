// ------- enemies: shared base + Charger, Ranged, Flyer, Bomber, Armored, Boss -------
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
    this.hitCd = 0;
    this.flash = 0;
    this.stun = 0;
    this.speedMult = 1;
    this.contactDmg = cfg.contactDmg;
    this.elite = false;
  }

  get radius() { return Math.max(this.hw, this.hh); }
  get speed() { return this.cfg.speed * this.speedMult; }
  blocks() { return false; }            // armored overrides
  damageTakenMult() { return 1; }       // armored overrides (ground vs air)

  // turn this into a tougher elite variant
  makeElite() {
    const E = CONFIG.elite;
    this.elite = true;
    this.hp *= E.hpMult; this.maxHp *= E.hpMult;
    this.speedMult *= E.speedMult;
    this.contactDmg *= E.dmgMult;
    this.hw *= E.sizeMult; this.hh *= E.sizeMult;
  }

  integrate(dt, platforms) {
    this.vy += CONFIG.world.gravity * dt;
    if (this.vy > CONFIG.player.maxFall) this.vy = CONFIG.player.maxFall;
    this.x += this.vx * dt;
    this._collideAxis(platforms, true);
    this.y += this.vy * dt;
    this.onGround = false;
    this._collideAxis(platforms, false);
    this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
    if (this.y < this.hh) this.y = this.hh;   // never leave the top of the arena (stay killable)
  }

  _collideAxis(platforms, horizontal) {
    for (const p of platforms) {
      if (p.oneway) continue;   // enemies treat one-way platforms as non-solid
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
    if (this.stun > 0) this.stun -= dt;
  }

  hit(dmg, knockX, knockY) {
    this.hp -= dmg;
    this.hitCd = CONFIG.blade.enemyHitIframe;
    this.flash = 0.08;
    const kb = dmg * this.cfg.knockbackTaken;
    const m = len(knockX, knockY) || 1;
    this.vx += (knockX / m) * kb;
    this.vy += (knockY / m) * kb - 120;
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

// ---- Charger: melee rusher ----
class Charger extends Enemy {
  constructor(x, y) { super(x, y, CONFIG.enemy); }
  update(dt, platforms, player) {
    this.tickTimers(dt);
    const dir = Math.sign(player.x - this.x) || 1;
    this.vx = lerp(this.vx, dir * this.speed, clamp(8 * dt, 0, 1));
    this.integrate(dt, platforms);
  }
  draw(ctx) {
    const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
    if (this.flash > 0) {
      ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
    } else {
      ctx.fillStyle = "#000"; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#fff";
      const dir = Math.sign(this.vx) || 1;
      ctx.fillRect(this.x + dir * 7 - 3, y + 11, 6, 6);
    }
    this.drawHpBar(ctx);
  }
}

// ---- Ranged: kites, telegraphs, fires ----
class Ranged extends Enemy {
  constructor(x, y) {
    super(x, y, CONFIG.ranged);
    this.state = "kite";
    this.aimTimer = this.cfg.aimInterval * (0.4 + Math.random() * 0.6);
    this.windT = 0;
  }
  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    const C = this.cfg;
    const dx = player.x - this.x, dist = Math.abs(dx), away = (-Math.sign(dx)) || 1;
    if (this.state === "kite") {
      let move = 0;
      if (dist < C.tooClose) move = away;
      else if (dist > C.preferredDist * 1.3) move = -away;
      this.vx = lerp(this.vx, move * this.speed, clamp(6 * dt, 0, 1));
      this.aimTimer -= dt;
      if (this.aimTimer <= 0) { this.state = "windup"; this.windT = C.windup; }
    } else {
      this.vx = lerp(this.vx, 0, clamp(12 * dt, 0, 1));
      this.windT -= dt;
      if (this.windT <= 0) { this.fireAt(player, projectiles, C.projSpeed); this.state = "kite"; this.aimTimer = C.aimInterval; }
    }
    this.integrate(dt, platforms);
  }
  draw(ctx, player) {
    const r = this.hw + 2;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - r); ctx.lineTo(this.x + r, this.y);
    ctx.lineTo(this.x, this.y + r); ctx.lineTo(this.x - r, this.y);
    ctx.closePath();
    if (this.flash > 0) { ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.stroke(); }
    else { ctx.fillStyle = "#000"; ctx.fill(); }
    if (this.state === "windup" && player) {
      const k = 1 - clamp(this.windT / this.cfg.windup, 0, 1);
      const dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
      ctx.strokeStyle = "#000"; ctx.setLineDash([5, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + (dx / m) * 600, this.y + (dy / m) * 600); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, 26 * (1 - k) + 6, 0, Math.PI * 2); ctx.stroke();
    }
    this.drawHpBar(ctx);
  }
}

// ---- Flyer: hovers and swoops, ignores gravity/platforms ----
class Flyer extends Enemy {
  constructor(x, y) {
    super(x, y, CONFIG.flyer);
    this.state = "hover";
    this.aimTimer = this.cfg.swoopInterval * (0.5 + Math.random() * 0.6);
    this.swoopT = 0;
  }
  update(dt, platforms, player) {
    this.tickTimers(dt);
    const C = this.cfg;
    if (this.state === "swoop") {
      this.swoopT -= dt;
      if (this.swoopT <= 0) this.state = "hover";
    } else {
      const tx = player.x, ty = player.y - C.hoverY;
      const dx = tx - this.x, dy = ty - this.y, d = len(dx, dy) || 1;
      this.vx = lerp(this.vx, (dx / d) * this.speed, clamp(3 * dt, 0, 1));
      this.vy = lerp(this.vy, (dy / d) * this.speed, clamp(3 * dt, 0, 1));
      this.aimTimer -= dt;
      if (this.aimTimer <= 0 && Math.abs(player.x - this.x) < 460) {
        this.state = "swoop"; this.swoopT = 0.5; this.aimTimer = C.swoopInterval;
        const m = len(player.x - this.x, player.y - this.y) || 1;
        this.vx = (player.x - this.x) / m * C.swoopSpeed;
        this.vy = (player.y - this.y) / m * C.swoopSpeed;
      }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
    this.y = clamp(this.y, 50, CONFIG.world.groundY - this.hh);
    this.onGround = false;
  }
  draw(ctx) {
    const dir = Math.sign(this.vx) || 1, r = this.hw + 3;
    ctx.fillStyle = this.flash > 0 ? "#fff" : "#000";
    ctx.beginPath();
    ctx.moveTo(this.x + dir * r, this.y);
    ctx.lineTo(this.x - dir * r, this.y - this.hh);
    ctx.lineTo(this.x - dir * r * 0.4, this.y);
    ctx.lineTo(this.x - dir * r, this.y + this.hh);
    ctx.closePath();
    ctx.fill();
    if (this.flash > 0) { ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke(); }
    this.drawHpBar(ctx);
  }
}

// ---- Bomber: rushes and detonates (on fuse or on death) ----
class Bomber extends Enemy {
  constructor(x, y) {
    super(x, y, CONFIG.bomber);
    this.isBomber = true;
    this.armed = false;
    this.fuse = 0;
    this.blasted = false;
  }
  update(dt, platforms, player) {
    this.tickTimers(dt);
    const C = this.cfg;
    const dir = Math.sign(player.x - this.x) || 1;
    this.vx = lerp(this.vx, dir * this.speed, clamp(7 * dt, 0, 1));
    this.integrate(dt, platforms);
    if (!this.armed && len(player.x - this.x, player.y - this.y) < C.triggerDist) { this.armed = true; this.fuse = C.fuse; }
    if (this.armed) { this.fuse -= dt; if (this.fuse <= 0) this.dead = true; }  // -> game triggers blast
  }
  draw(ctx) {
    ctx.fillStyle = this.flash > 0 ? "#fff" : "#000";
    ctx.beginPath(); ctx.arc(this.x, this.y, this.hw, 0, Math.PI * 2); ctx.fill();
    if (this.flash > 0) { ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.stroke(); }
    // fuse spark on top
    ctx.fillStyle = "#000"; ctx.fillRect(this.x - 2, this.y - this.hh - 8, 4, 8);
    if (this.armed) {
      const k = 1 - clamp(this.fuse / this.cfg.fuse, 0, 1);
      ctx.strokeStyle = "#000"; ctx.lineWidth = 2 + k * 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.hw + 6 + k * 10, 0, Math.PI * 2); ctx.stroke();
    }
    this.drawHpBar(ctx);
  }
}

// ---- Armored: shielded on the side it faces; needs a fast hit or a flank ----
class Armored extends Enemy {
  constructor(x, y) { super(x, y, CONFIG.armored); this.guardSide = 1; }
  update(dt, platforms, player) {
    this.tickTimers(dt);
    this.guardSide = Math.sign(player.x - this.x) || 1;
    const sp = this.stun > 0 ? 0 : this.speed;
    this.vx = lerp(this.vx, this.guardSide * sp, clamp(5 * dt, 0, 1));
    this.integrate(dt, platforms);
  }
  // blocked if the hit lands on the guarded (player-facing) side below break speed
  blocks(hitFromX, tipSpeed) {
    if (this.stun > 0) return false;
    const side = Math.sign(hitFromX - this.x) || 1;
    return side === this.guardSide && tipSpeed < this.cfg.breakSpeed;
  }
  damageTakenMult() { return this.onGround ? CONFIG.armored.groundDR : CONFIG.armored.airDR; }
  draw(ctx) {
    const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
    const vulnerable = !this.onGround;   // launched -> takes full/extra damage
    ctx.fillStyle = this.flash > 0 ? "#fff" : (this.stun > 0 ? "#888" : "#000");
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    // vulnerable (airborne) -> dashed double outline so it reads as "hit me now"
    if (vulnerable && this.stun <= 0) {
      ctx.setLineDash([5, 4]); ctx.strokeRect(x - 4, y - 4, w + 8, h + 8); ctx.setLineDash([]);
    }
    // bold shield: a thick offset bar with a gap on the guarded side
    if (this.stun <= 0) {
      const gx = this.x + this.guardSide * (this.hw + 9);
      ctx.fillStyle = "#000";
      ctx.fillRect(gx - 4, y - 6, 8, h + 12);
      // little prongs
      ctx.fillRect(gx - this.guardSide * 6 - 1, y - 6, this.guardSide * 7, 5);
      ctx.fillRect(gx - this.guardSide * 6 - 1, y + h + 1, this.guardSide * 7, 5);
    }
    this.drawHpBar(ctx);
  }
}

// ---- Boss: large, multi-phase ----
class Boss extends Enemy {
  constructor(x, y) {
    super(x, y, CONFIG.boss);
    this.isBoss = true;
    this.fireTimer = 2;
  }
  get phase() { const f = this.hp / this.maxHp; return f > 0.66 ? 1 : (f > 0.33 ? 2 : 3); }
  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    const C = this.cfg, ph = this.phase;
    const dir = Math.sign(player.x - this.x) || 1;
    this.vx = lerp(this.vx, dir * C.speed * (1 + (ph - 1) * 0.4), clamp(4 * dt, 0, 1));
    this.integrate(dt, platforms);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = C.fireBase / ph;
      const shots = ph === 1 ? 1 : (ph === 2 ? 3 : 5);
      const base = Math.atan2(player.y - this.y, player.x - this.x);
      for (let i = 0; i < shots; i++) {
        const a = base + (i - (shots - 1) / 2) * 0.24;
        projectiles.push(new Projectile(this.x, this.y, Math.cos(a) * CONFIG.proj.speed, Math.sin(a) * CONFIG.proj.speed));
      }
    }
  }
  draw(ctx) {
    const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
    ctx.fillStyle = this.flash > 0 ? "#fff" : "#000";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 4; ctx.strokeRect(x, y, w, h);
    // eye + phase pips
    ctx.fillStyle = "#fff";
    const dir = Math.sign(this.vx) || 1;
    ctx.fillRect(this.x + dir * 18 - 9, this.y - 18, 18, 14);
    for (let i = 0; i < this.phase; i++) ctx.fillRect(x + 12 + i * 16, y + h - 18, 10, 8);
    // local hp bar hidden (a big one is drawn in the HUD)
  }
}

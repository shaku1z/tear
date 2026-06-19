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
    this.hpDisplay = cfg.hp;   // lagging bar for the drain effect
    this.onGround = false;
    this.dead = false;
    this.hitCd = 0;
    this.flash = 0;
    this.stun = 0;
    this.speedMult = 1;
    this.contactDmg = cfg.contactDmg;
    this.elite = false;
    this.color = "#000";
    this.spawnT = 0;       // >0 while materializing (telegraph + can't act)
    this.weight = cfg.weight || 1;   // resists launches (heavier = less pop)
    this.spiked = false;   // slammed downward while airborne -> ground-impact on landing
    // variant / affix state
    this.kind = "enemy";
    this.variant = "";       // distinct "evolution" within the family (variants.js)
    this.variantName = "";
    this.behavior = "";      // AI branch the family.update() switches on
    this.affixes = [];
    this.affixCount = 0;
    this.fireRateMult = 1; // <1 = shoots faster (Rapid)
    this.volley = 1;       // shots per attack (Volley)
    this.contactReach = 0; // extra contact range (Armed)
    this.shield = 0;       // absorbs damage before HP (Warded)
    this.maxShield = 0;
    this.canJump = false;  // some ground enemies can hop onto platforms
    this.jumpCd = 0;
    // generic melee attack state machine (bull charge / brawler punch / stalker)
    this.atk = "idle";     // idle | windup | commit | recover
    this.atkT = 0;         // timer within the current attack phase
    this.atkCd = 0;        // recovery before the next attack
    this.atkDir = 1;       // committed horizontal direction
    this.feint = false;    // this windup is a feint (brawler bluffs, then backs off)
    this.enraged = false;  // armored: shield broken -> faster & aggressive
    this.evadeCd = 0;      // stalker: cooldown between dash-reads
    this.atkMax = 0;       // duration of the current wind-up (for telegraph scaling)
    this.chargePower = 0;  // 0..1 roll: longer wind-up -> farther, harder charge
    this.chargeMult = 1;   // contact-damage multiplier applied during a committed charge
    // platform pathfinding
    this.canClimb = false; // can hop platform-to-platform to reach a perched player
    this.navDir = 1;       // suggested horizontal direction from climbNav
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
    this.vx = clamp(this.vx, -1200, 1200);   // safety: knockback can never fling across the map
    this.vy += CONFIG.world.gravity * dt;
    if (this.vy > CONFIG.player.maxFall) this.vy = CONFIG.player.maxFall;
    this.x += this.vx * dt;
    this._collideAxis(platforms, true, 0);
    const prevBottom = this.y + this.hh;
    this.y += this.vy * dt;
    this.onGround = false;
    this._collideAxis(platforms, false, prevBottom);
    this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
    if (this.y < this.hh) this.y = this.hh;   // never leave the top of the arena (stay killable)
    // hard floor: never sink below the floor surface (failsafe vs phasing through it)
    const floorTop = CONFIG.world.groundY - this.hh;
    if (this.y > floorTop) { this.y = floorTop; this.vy = 0; this.onGround = true; }
  }

  _collideAxis(platforms, horizontal, prevBottom) {
    for (const p of platforms) {
      if (p.oneway) {
        // one-way: land only when actually crossing THIS platform's top from above
        // (must be above last frame AND at/through the top now) — prevents snapping
        // down onto a lower platform that merely overlaps in x.
        if (horizontal) continue;
        if (this.vy >= 0 && prevBottom <= p.y + 1.5 && this.y + this.hh >= p.y &&
            this.x + this.hw > p.x && this.x - this.hw < p.x + p.w) {
          this.y = p.y - this.hh; this.vy = 0; this.onGround = true;
        }
        continue;
      }
      if (horizontal && p.floor) continue;   // the full-width floor never blocks horizontal movement
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

  // some grounded enemies hop toward the player when they're up on a platform
  maybeJump(player, dt) {
    if (this.jumpCd > 0) this.jumpCd -= dt;
    if (!this.canJump || !this.onGround || this.jumpCd > 0) return;
    if (player.y < this.y - 90 && Math.random() < 0.5) { this.vy = -1100; this.onGround = false; this.jumpCd = 1.8; }
  }

  // lightweight platform pathfinding: when the player is perched above, steer toward
  // the nearest reachable one-way platform that steps up toward them and hop onto it.
  // Re-evaluated every frame, so it climbs level-by-level (no full graph search, but
  // it stops the player from safely camping above the enemies). Returns true while
  // it's actively climbing, so callers should follow navDir and hold their attacks.
  climbNav(player, platforms, dt) {
    if (this.jumpCd > 0) this.jumpCd -= dt;
    this.navDir = Math.sign(player.x - this.x) || 1;
    const feetY = this.y + this.hh, playerFeet = player.y + player.hh;
    if (playerFeet > this.y - 50) return false;        // player not meaningfully above -> normal chase
    const MAXJUMP = 300, TOL = 130;
    let best = null, bestDist = Infinity;
    for (const p of platforms) {
      if (!p.oneway) continue;
      if (p.y >= feetY - 30) continue;                 // must be above us
      if (feetY - p.y > MAXJUMP) continue;             // too high to reach in one hop
      if (p.y < playerFeet - 50) continue;             // don't climb above the player
      const d = Math.abs((p.x + p.w / 2) - this.x);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    if (!best) return false;                            // nothing reachable -> gather underneath
    const center = best.x + best.w / 2;
    if (this.x > best.x - TOL && this.x < best.x + best.w + TOL) {
      this.navDir = Math.sign(center - this.x) || this.navDir;
      if (this.onGround && this.jumpCd <= 0) {          // aligned -> hop up (and across) onto it
        this.vy = -1250; this.onGround = false; this.jumpCd = 0.85;
        this.vx += Math.sign(center - this.x) * 320;
      }
    } else {
      this.navDir = Math.sign(center - this.x) || 1;    // walk under it first
    }
    return true;
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
    if (this.hpDisplay > this.hp) this.hpDisplay += (this.hp - this.hpDisplay) * clamp(7 * dt, 0, 1);
  }

  hit(dmg, knockX, knockY) {
    this.hitCd = CONFIG.blade.enemyHitIframe;
    this.flash = 0.08;
    if (this.shield > 0) {                       // Warded: shield absorbs first
      this.shield -= dmg;
      if (this.shield < 0) { this.hp += this.shield; this.shield = 0; }
    } else {
      this.hp -= dmg;
    }
    const kb = dmg * this.cfg.knockbackTaken / this.weight;
    const m = len(knockX, knockY) || 1;
    this.vx += (knockX / m) * kb;
    this.vy += (knockY / m) * kb - 120 / this.weight;
    if (this.hp <= 0) this.dead = true;
  }

  drawHpBar(ctx) {
    const w = this.hw * 2, x = this.x - this.hw, y = this.y - this.hh - 13, h = 6;
    const fr = clamp(this.hp / this.maxHp, 0, 1), fl = clamp(this.hpDisplay / this.maxHp, 0, 1);
    ctx.fillStyle = "#000"; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);     // border
    ctx.fillStyle = "#2a2a2a"; ctx.fillRect(x, y, w, h);                  // track
    if (fl > fr) { ctx.fillStyle = CONFIG.colors.slam; ctx.fillRect(x + w * fr, y, w * (fl - fr), h); } // recent damage
    ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w * fr, h);               // current hp
    if (this.maxShield > 0 && this.shield > 0) {                         // Warded shield
      ctx.fillStyle = CONFIG.colors.perfect;
      ctx.fillRect(x, y - 5, w * clamp(this.shield / this.maxShield, 0, 1), 3);
    }
  }
}

// ---- Melee family: Charger (bull-rush), Brawler (spacing + punch/feint), Stalker (reads your dash) ----
class Charger extends Enemy {
  constructor(x, y) { super(x, y, CONFIG.enemy); this.color = CONFIG.colors.charger; this.kind = "charger"; this.behavior = "bull"; }

  update(dt, platforms, player) {
    this.tickTimers(dt);
    if (this.atkCd > 0) this.atkCd -= dt;
    // a wound-up charge hits harder on contact (longer wind-up = more power)
    this.chargeMult = (this.behavior === "bull" && this.atk === "commit") ? (1 + this.chargePower) : 1;

    // pathfind up to a perched player (never interrupt an in-progress charge)
    if (this.canClimb && this.atk !== "commit" && this.climbNav(player, platforms, dt)) {
      if (this.onGround) this.vx = lerp(this.vx, this.navDir * this.speed * 1.1, clamp(7 * dt, 0, 1));
      this.atk = "idle";
      this.integrate(dt, platforms);
      return;
    }

    const E = CONFIG.enemy;
    const dx = player.x - this.x, dist = Math.abs(dx), dir = Math.sign(dx) || 1;

    if (this.behavior === "brawler") this._brawler(dt, player, dist, dir);
    else if (this.behavior === "stalker") this._stalker(dt, player, dist, dir, E);
    else this._bull(dt, player, dist, dir, E);

    const preVx = this.vx;
    this.integrate(dt, platforms);

    // a committed charge (bull / stalker) that slams a wall or the arena edge stuns
    // itself — that's the punish window the design wants.
    if (this.atk === "commit" && this.behavior !== "brawler") {
      const atEdge = this.x <= this.hw + 1 || this.x >= CONFIG.view.w - this.hw - 1;
      if ((this.vx === 0 && Math.abs(preVx) > 200) || atEdge) {
        this.stun = E.chargeStun; this.atk = "recover"; this.atkCd = E.chargeCd;
        FX.burst(this.x + this.atkDir * this.hw, this.y, this.atkDir, 0, 7, this.color);
      }
    }
  }

  _bull(dt, player, dist, dir, E) {
    switch (this.atk) {
      case "windup":
        this.vx = lerp(this.vx, 0, clamp(10 * dt, 0, 1));   // plant feet, telegraph
        this.atkDir = dir;                                   // can still adjust before committing
        this.atkT -= dt;
        if (this.atkT <= 0) {
          this.atk = "commit";
          this.atkT = E.chargeTime * (0.7 + this.chargePower);          // longer wind-up -> farther charge
          this.vx = this.atkDir * E.chargeSpeed * (0.9 + this.chargePower * 0.4);
        }
        break;
      case "commit":
        this.vx = this.atkDir * E.chargeSpeed * (0.9 + this.chargePower * 0.4);  // fixed line -> sidesteppable
        this.atkT -= dt;
        if (this.atkT <= 0) { this.atk = "recover"; this.atkCd = E.chargeCd; }
        break;
      case "recover":
        this.vx = lerp(this.vx, 0, clamp(6 * dt, 0, 1));
        if (this.atkCd <= 0) this.atk = "idle";
        break;
      default: // idle: stalk forward at a wary pace, then commit to a charge of varied power
        this.vx = lerp(this.vx, dir * this.speed, clamp(6 * dt, 0, 1));
        if (dist < E.chargeRange && this.atkCd <= 0 && Math.abs(player.y - this.y) < 150) {
          this.chargePower = Math.random();
          this.atk = "windup"; this.atkT = E.chargeWindup * (0.6 + this.chargePower); this.atkMax = this.atkT; this.atkDir = dir;
        }
    }
  }

  _brawler(dt, player, dist, dir) {
    const STAND = 130, LUNGE = 540;
    switch (this.atk) {
      case "windup":
        this.vx = lerp(this.vx, 0, clamp(12 * dt, 0, 1)); this.atkT -= dt;
        if (this.atkT <= 0) {
          if (this.feint) { this.atk = "recover"; this.atkCd = 0.7; this.vx = -this.atkDir * 280; } // bluff, hop back
          else { this.atk = "commit"; this.atkT = 0.2; this.vx = this.atkDir * LUNGE; }              // committed punch
        }
        break;
      case "commit":
        this.atkT -= dt;
        if (this.atkT <= 0) { this.atk = "recover"; this.atkCd = 0.9; }
        break;
      case "recover":
        this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1));
        if (this.atkCd <= 0) this.atk = "idle";
        break;
      default: { // hold spacing, then telegraph a punch (sometimes a feint)
        let move = 0;
        if (dist > STAND + 30) move = dir; else if (dist < STAND - 40) move = -dir;
        this.vx = lerp(this.vx, move * this.speed * 1.1, clamp(6 * dt, 0, 1));
        if (dist < STAND + 60 && this.atkCd <= 0 && Math.abs(player.y - this.y) < 110) {
          this.atk = "windup"; this.atkT = 0.4; this.atkDir = dir; this.feint = Math.random() < 0.3;
        }
      }
    }
  }

  _stalker(dt, player, dist, dir, E) {
    if (this.evadeCd > 0) this.evadeCd -= dt;
    // read the dash: if the player dashes toward us up close, sidestep through it
    if (player.dashTimer > 0 && Math.sign(player.dashX) === dir && dist < 240 && this.evadeCd <= 0 && this.onGround) {
      this.vx = -dir * 740; this.vy = -560; this.evadeCd = 1.4; this.atk = "recover"; this.atkCd = 0.4;
      FX.burst(this.x, this.y, -dir, -1, 5, this.color);
      return;
    }
    const FAST = E.chargeSpeed * 0.95;
    switch (this.atk) {
      case "windup":
        this.vx = lerp(this.vx, 0, clamp(11 * dt, 0, 1)); this.atkDir = dir; this.atkT -= dt;
        if (this.atkT <= 0) { this.atk = "commit"; this.atkT = 0.4; this.vx = this.atkDir * FAST; }
        break;
      case "commit":
        this.vx = this.atkDir * FAST; this.atkT -= dt;
        if (this.atkT <= 0) { this.atk = "recover"; this.atkCd = 0.85; }
        break;
      case "recover":
        this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1));
        if (this.atkCd <= 0) this.atk = "idle";
        break;
      default:
        this.vx = lerp(this.vx, dir * this.speed, clamp(8 * dt, 0, 1));
        if (dist < 300 && this.atkCd <= 0) { this.atk = "windup"; this.atkT = 0.28; this.atkDir = dir; }
    }
  }

  draw(ctx) {
    const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
    const dir = this.atkDir || Math.sign(this.vx) || 1;

    // charge wind-up telegraph: a building dashed arrow — longer/thicker for a
    // higher-power (longer wind-up) charge, so you can read how hard it's coming
    if (this.atk === "windup" && !this.feint) {
      const k = 1 - clamp(this.atkT / (this.atkMax || 0.55), 0, 1);
      const reach = 40 + (60 + this.chargePower * 130) * k;
      ctx.strokeStyle = this.color; ctx.globalAlpha = 0.35 + 0.45 * k; ctx.lineWidth = 3 + this.chargePower * 2; ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.atkDir * reach, this.y); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    ctx.fillStyle = this.flash > 0 ? "#fff" : (this.stun > 0 ? "#d7b3b3" : this.color);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);

    // variant accents
    if (this.behavior === "bull") {                 // horns
      ctx.fillStyle = "#000";
      ctx.fillRect(x + 2, y - 6, 5, 6); ctx.fillRect(x + w - 7, y - 6, 5, 6);
    } else if (this.behavior === "stalker") {        // shoulder spikes
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 6); ctx.lineTo(x, y + 10); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + 6, y + 6); ctx.lineTo(x + w, y + 10); ctx.fill();
    }

    // eye (x-ed out while stunned)
    ctx.fillStyle = "#fff";
    if (this.stun > 0) { ctx.fillStyle = "#000"; ctx.font = UI.font(11, true); ctx.textAlign = "center"; ctx.fillText("x x", this.x, y + 16); }
    else ctx.fillRect(this.x + dir * 7 - 3, y + 11, 6, 6);

    // brawler fists (cock back on windup, extend on the punch)
    if (this.behavior === "brawler") {
      ctx.fillStyle = "#000";
      const ext = this.atk === "commit" ? 12 : (this.atk === "windup" ? -3 : 4);
      ctx.fillRect(this.x + dir * (this.hw + ext) - 4, this.y - 3, 8, 9);
    }

    // Armed affix: a weapon extending reach (Brawler's small punch reach draws fists, not this)
    if (this.contactReach > 14) {
      ctx.strokeStyle = "#000"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(this.x + dir * this.hw, this.y);
      ctx.lineTo(this.x + dir * (this.hw + this.contactReach), this.y);
      ctx.stroke();
    }
    this.drawHpBar(ctx);
  }
}

// ---- Ranged: kites, telegraphs, fires ----
class Ranged extends Enemy {
  constructor(x, y) {
    super(x, y, CONFIG.ranged);
    this.color = CONFIG.colors.ranged;
    this.kind = "ranged";
    this.state = "kite";
    this.aimTimer = this.cfg.aimInterval * (0.4 + Math.random() * 0.6);
    this.windT = 0;
  }
  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    // reposition up to a perched player (hold fire while climbing)
    if (this.canClimb && this.state !== "windup" && this.climbNav(player, platforms, dt)) {
      if (this.onGround) this.vx = lerp(this.vx, this.navDir * this.speed, clamp(6 * dt, 0, 1));
      this.integrate(dt, platforms);
      return;
    }
    const C = this.cfg, b = this.behavior;
    const dx = player.x - this.x, dist = Math.abs(dx), away = (-Math.sign(dx)) || 1;

    if (this.state !== "windup") {
      // movement: Sentinel holds its ground; others kite to a preferred range
      if (b === "sentinel") {
        this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1));
      } else {
        let move = 0;
        if (dist < C.tooClose) move = away;
        else if (dist > C.preferredDist * 1.3) move = -away;
        this.vx = lerp(this.vx, move * this.speed, clamp(6 * dt, 0, 1));
      }
      this.aimTimer -= dt;
      if (this.aimTimer <= 0) {
        this.state = "windup";
        const base = b === "sentinel" ? C.windup * 1.5 : (b === "marksman" ? CONFIG.chargedShot.windup : C.windup);
        this.windT = base * this.fireRateMult; this.windMax = this.windT;
      }
    } else {
      // aiming: Rifleman keeps strafing (so it leads you); others plant to fire
      if (b === "rifleman") this.vx = lerp(this.vx, away * this.speed * 0.5, clamp(5 * dt, 0, 1));
      else this.vx = lerp(this.vx, 0, clamp(12 * dt, 0, 1));
      this.windT -= dt;
      if (this.windT <= 0) {
        this._fire(player, projectiles, C);
        this.state = "kite";
        this.aimTimer = C.aimInterval * this.fireRateMult * (b === "sentinel" ? 1.15 : 1);
      }
    }
    this.integrate(dt, platforms);
  }

  _fire(player, projectiles, C) {
    const b = this.behavior;
    if (this.volley > 1) {                       // Volley affix: wide spread
      const base = Math.atan2(player.y - this.y, player.x - this.x);
      for (let i = 0; i < this.volley; i++) {
        const a = base + (i - (this.volley - 1) / 2) * 0.22;
        projectiles.push(new Projectile(this.x, this.y, Math.cos(a) * C.projSpeed, Math.sin(a) * C.projSpeed));
      }
      return;
    }
    if (b === "marksman") {                       // one big, slow, heavy shot (very parryable)
      const CS = CONFIG.chargedShot;
      const dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
      const p = new Projectile(this.x, this.y, (dx / m) * CS.speed, (dy / m) * CS.speed);
      p.r = CS.r; p.dmg = CS.dmg; p.charged = true;
      projectiles.push(p);
      return;
    }
    if (b === "sentinel") { this.fireAt(player, projectiles, C.projSpeed * 1.15); return; }  // single precise shot
    // Rifleman leads your movement; default Ranged just double-taps where you are
    const lead = b === "rifleman" ? 0.2 : 0;
    const sp = C.projSpeed * (b === "rifleman" ? 1.1 : 1);
    for (let i = 0; i < 2; i++) {
      const tx = player.x + player.vx * lead, ty = player.y + player.vy * lead * 0.5;
      const dx = tx - this.x, dy = ty - this.y, m = len(dx, dy) || 1;
      const a = Math.atan2(dy, dx) + (i - 0.5) * (b === "rifleman" ? 0.0 : 0.07);
      projectiles.push(new Projectile(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp));
    }
  }

  draw(ctx, player) {
    const r = this.hw + 2, b = this.behavior;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - r); ctx.lineTo(this.x + r, this.y);
    ctx.lineTo(this.x, this.y + r); ctx.lineTo(this.x - r, this.y);
    ctx.closePath();
    ctx.fillStyle = this.flash > 0 ? "#fff" : this.color; ctx.fill();
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2.5; ctx.stroke();

    // variant accents
    if (b === "sentinel") { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, Math.PI * 2); ctx.fill(); }
    else if (b === "marksman") { ctx.fillStyle = "#000"; ctx.fillRect(this.x - 2, this.y - r - 4, 4, 6); }

    // aim telegraph during wind-up
    if (this.state === "windup" && player) {
      const k = 1 - clamp(this.windT / (this.windMax || this.cfg.windup), 0, 1);
      const dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
      const sentinel = b === "sentinel", marksman = b === "marksman";
      ctx.strokeStyle = "#000"; ctx.globalAlpha = sentinel ? 0.5 + 0.4 * k : 0.7;
      if (sentinel) ctx.setLineDash([]); else ctx.setLineDash([5, 6]);
      ctx.lineWidth = sentinel ? 1.2 : 1.5;
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + (dx / m) * 620, this.y + (dy / m) * 620); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // a tracking dot at the player + a closing ring; marksman charges a growing orb
      if (sentinel) { ctx.fillStyle = CONFIG.colors.enemyShot; ctx.beginPath(); ctx.arc(player.x, player.y, 5, 0, Math.PI * 2); ctx.fill(); }
      if (marksman) {
        ctx.fillStyle = CONFIG.colors.enemyShot; ctx.globalAlpha = 0.4 + 0.5 * k;
        ctx.beginPath(); ctx.arc(this.x, this.y, 4 + k * (CONFIG.chargedShot.r - 2), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.lineWidth = 2; ctx.strokeStyle = "#000";
        ctx.beginPath(); ctx.arc(this.x, this.y, 26 * (1 - k) + 6, 0, Math.PI * 2); ctx.stroke();
      }
    }
    this.drawHpBar(ctx);
  }
}

// ---- Aerial family: Flyer (angled swoop), Dive Bomber (telegraphed drop), Swooper (high dive) ----
class Flyer extends Enemy {
  constructor(x, y) {
    super(x, y, CONFIG.flyer);
    this.color = CONFIG.colors.flyer;
    this.kind = "flyer";
    this.behavior = "swoop";
    this.state = "hover";
    this.aimTimer = this.cfg.swoopInterval * (0.5 + Math.random() * 0.6);
    this.swoopT = 0;
    this.warnT = 0;
    this.diveX = null;
  }

  update(dt, platforms, player) {
    this.tickTimers(dt);
    const C = this.cfg;
    if (this.behavior === "divebomb") this._divebomb(dt, player, C);
    else if (this.behavior === "highdive") this._highdive(dt, player, C);
    else this._swoop(dt, player, C);
    this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
    this.y = clamp(this.y, 40, CONFIG.world.groundY - this.hh);
    this.onGround = this.y >= CONFIG.world.groundY - this.hh - 1;
  }

  _swoop(dt, player, C) {
    if (this.state === "swoop") {
      this.swoopT -= dt; this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.swoopT <= 0) this.state = "recover";
    } else if (this.state === "recover") {
      // every dive ends by dropping to the ground for a brief, vulnerable stun
      this.vx = lerp(this.vx, 0, clamp(4 * dt, 0, 1));
      this.vy = lerp(this.vy, 560, clamp(5 * dt, 0, 1));
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y >= CONFIG.world.groundY - this.hh - 2) {
        this.y = CONFIG.world.groundY - this.hh; this.stun = 0.7; this.state = "hover";
        this.aimTimer = C.swoopInterval; FX.burst(this.x, this.y + this.hh, 0, -1, 5, this.color);
      }
    } else {
      // hover to one side of the player so the dive comes in at an angle
      const tx = player.x + (this.x < player.x ? -130 : 130), ty = player.y - C.hoverY;
      const dx = tx - this.x, dy = ty - this.y, d = len(dx, dy) || 1;
      this.vx = lerp(this.vx, (dx / d) * this.speed, clamp(3 * dt, 0, 1));
      this.vy = lerp(this.vy, (dy / d) * this.speed, clamp(3 * dt, 0, 1));
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.aimTimer -= dt;
      if (this.aimTimer <= 0 && Math.abs(player.x - this.x) < 520) {
        this.state = "swoop"; this.swoopT = 0.45; this.aimTimer = C.swoopInterval;
        const m = len(player.x - this.x, player.y - this.y) || 1;
        this.vx = (player.x - this.x) / m * C.swoopSpeed;
        this.vy = (player.y - this.y) / m * C.swoopSpeed;
      }
    }
  }

  _divebomb(dt, player, C) {
    if (this.state === "warn") {
      this.diveX = this.diveX == null ? player.x : lerp(this.diveX, player.x, clamp(1.5 * dt, 0, 1));
      const ty = Math.max(120, player.y - 240);
      const dx = this.diveX - this.x, dy = ty - this.y, d = len(dx, dy) || 1;
      this.vx = lerp(this.vx, (dx / d) * this.speed * 1.2, clamp(4 * dt, 0, 1));
      this.vy = lerp(this.vy, (dy / d) * this.speed * 1.2, clamp(4 * dt, 0, 1));
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.warnT -= dt;
      if (this.warnT <= 0) { this.state = "dive"; this.vx = 0; this.vy = C.swoopSpeed * 1.55; }
    } else if (this.state === "dive") {
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y >= CONFIG.world.groundY - this.hh - 2) {
        this.y = CONFIG.world.groundY - this.hh; this.stun = 0.85; this.state = "hover";
        this.aimTimer = C.swoopInterval * 1.2; this.diveX = null;
        FX.ring(this.x, this.y + this.hh, 13, CONFIG.colors.slam); FX.burst(this.x, this.y + this.hh, 0, -1, 7, this.color);
      }
    } else {
      const tx = player.x, ty = player.y - C.hoverY - 40;
      const dx = tx - this.x, dy = ty - this.y, d = len(dx, dy) || 1;
      this.vx = lerp(this.vx, (dx / d) * this.speed, clamp(3 * dt, 0, 1));
      this.vy = lerp(this.vy, (dy / d) * this.speed, clamp(3 * dt, 0, 1));
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.aimTimer -= dt;
      if (this.aimTimer <= 0) { this.state = "warn"; this.warnT = 1.1; this.diveX = player.x; }
    }
  }

  _highdive(dt, player, C) {
    if (this.state === "dive") {
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y >= CONFIG.world.groundY - this.hh - 2 || this.x <= this.hw + 1 || this.x >= CONFIG.view.w - this.hw - 1) {
        this.state = "climb"; this.aimTimer = C.swoopInterval;
      }
    } else if (this.state === "climb") {
      this.vy = lerp(this.vy, -this.speed * 2.4, clamp(4 * dt, 0, 1));
      this.vx = lerp(this.vx, (player.x > this.x ? 1 : -1) * this.speed, clamp(2 * dt, 0, 1));
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y <= 70) this.state = "hover";
    } else {
      this.y = lerp(this.y, 78, clamp(2 * dt, 0, 1));
      this.vx = lerp(this.vx, (player.x - this.x) * 0.6, clamp(2 * dt, 0, 1));
      this.x += this.vx * dt;
      this.aimTimer -= dt;
      if (this.aimTimer <= 0 && Math.abs(player.x - this.x) < 720) {
        this.state = "dive";
        const m = len(player.x - this.x, player.y - this.y) || 1;
        this.vx = (player.x - this.x) / m * C.swoopSpeed * 1.6;
        this.vy = (player.y - this.y) / m * C.swoopSpeed * 1.6;
      }
    }
  }

  draw(ctx) {
    // Dive Bomber's ground warning marker
    if (this.behavior === "divebomb" && this.state === "warn" && this.diveX != null) {
      const gy = CONFIG.world.groundY, k = 1 - clamp(this.warnT / 1.1, 0, 1);
      ctx.strokeStyle = CONFIG.colors.slam; ctx.globalAlpha = 0.35 + 0.5 * k; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.diveX, gy - 4, 34 - 22 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.diveX, this.y + this.hh); ctx.setLineDash([4, 8]); ctx.lineTo(this.diveX, gy - 4); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    const dir = Math.sign(this.vx) || 1, r = this.hw + 3;
    ctx.fillStyle = this.flash > 0 ? "#fff" : (this.stun > 0 ? "#c4a8e0" : this.color);
    ctx.beginPath();
    ctx.moveTo(this.x + dir * r, this.y);
    ctx.lineTo(this.x - dir * r, this.y - this.hh);
    ctx.lineTo(this.x - dir * r * 0.4, this.y);
    ctx.lineTo(this.x - dir * r, this.y + this.hh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke();
    // variant accent: a downward fang on divers
    if (this.behavior !== "swoop") {
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.moveTo(this.x - 4, this.y + this.hh - 2); ctx.lineTo(this.x + 4, this.y + this.hh - 2); ctx.lineTo(this.x, this.y + this.hh + 6); ctx.fill();
    }
    this.drawHpBar(ctx);
  }
}

// ---- Hazard family: Bomber (arcing deflectable bombs), Juggler (3-bomb burst), Trapper (mines) ----
class Bomber extends Enemy {
  constructor(x, y) {
    super(x, y, CONFIG.bomber);
    this.color = CONFIG.colors.bomber;
    this.kind = "bomber";
    this.behavior = "lob";
    this.lobTimer = CONFIG.bomber.lobInterval * (0.5 + Math.random() * 0.7);
    this.mineTimer = CONFIG.bomber.mineInterval * (0.6 + Math.random() * 0.6);
    this.bombsLeft = 0;
    this.burstT = 0;
  }

  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    const C = this.cfg;
    if (this.canClimb && this.climbNav(player, platforms, dt)) {   // reposition up to a perched player
      if (this.onGround) this.vx = lerp(this.vx, this.navDir * this.speed, clamp(7 * dt, 0, 1));
      this.integrate(dt, platforms);
      return;
    }
    if (this.behavior === "trap") this._trap(dt, player, projectiles, C);
    else this._lob(dt, player, projectiles, C);
    this.integrate(dt, platforms);
  }

  // hold a throwing distance from the player
  _kite(dt, player, standoff) {
    const dx = player.x - this.x, dist = Math.abs(dx), away = (-Math.sign(dx)) || 1;
    let move = 0;
    if (dist < standoff * 0.7) move = away;
    else if (dist > standoff * 1.25) move = -away;
    this.vx = lerp(this.vx, move * this.speed, clamp(6 * dt, 0, 1));
  }

  _lobBomb(player, projectiles, spread) {
    const C = this.cfg;
    const dx = player.x - this.x;
    const vx = clamp(dx * 1.05, -C.bombSpeed, C.bombSpeed) + (spread || 0);
    const p = new Projectile(this.x, this.y - this.hh, vx, -C.bombArc);
    p.gravity = C.bombGravity; p.bomb = true; p.r = 12; p.dmg = C.blastDmg;
    projectiles.push(p);
  }

  _lob(dt, player, projectiles, C) {
    this._kite(dt, player, C.standoff);
    if (this.bombsLeft > 0) {                       // Juggler: rapid 3-bomb burst
      this.burstT -= dt;
      if (this.burstT <= 0) { this._lobBomb(player, projectiles, (this.bombsLeft - 2) * 60); this.bombsLeft--; this.burstT = 0.18; }
      if (this.bombsLeft === 0) this.lobTimer = C.lobInterval;
      return;
    }
    this.lobTimer -= dt;
    if (this.lobTimer <= 0 && Math.abs(player.x - this.x) < 760) {
      if (this.behavior === "juggle") { this.bombsLeft = 3; this.burstT = 0; }
      else { this._lobBomb(player, projectiles, 0); this.lobTimer = C.lobInterval; }
    }
  }

  _trap(dt, player, projectiles, C) {
    this._kite(dt, player, C.standoff * 0.65);
    this.mineTimer -= dt;
    if (this.mineTimer <= 0 && this.onGround) {
      const m = new Projectile(this.x, this.y, 0, 0);
      m.mine = true; m.gravity = C.bombGravity; m.r = 11; m.armT = C.mineArm;
      projectiles.push(m);
      this.mineTimer = C.mineInterval;
    }
  }

  draw(ctx) {
    ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.hw, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#000"; ctx.fillRect(this.x - 2, this.y - this.hh - 8, 4, 8);   // launcher spout
    // variant accent
    if (this.behavior === "trap") { ctx.fillStyle = "#fff"; ctx.fillRect(this.x - 6, this.y - 1, 12, 3); }
    else if (this.behavior === "juggle") { ctx.fillStyle = "#fff"; for (let i = 0; i < 3; i++) ctx.fillRect(this.x - 6 + i * 5, this.y - 3, 3, 3); }
    this.drawHpBar(ctx);
  }
}

// ---- Armored: shielded on the side it faces; needs a fast hit or a flank ----
class Armored extends Enemy {
  constructor(x, y) { super(x, y, CONFIG.armored); this.guardSide = 1; this.color = CONFIG.colors.armored; this.kind = "armored"; }
  update(dt, platforms, player) {
    this.tickTimers(dt);
    this.guardSide = Math.sign(player.x - this.x) || 1;
    // enraged: chase onto platforms after a perched player
    if (this.enraged && this.canClimb && this.stun <= 0 && this.climbNav(player, platforms, dt)) {
      if (this.onGround) this.vx = lerp(this.vx, this.navDir * this.speed * 1.8, clamp(8 * dt, 0, 1));
      this.integrate(dt, platforms);
      return;
    }
    const sp = this.stun > 0 ? 0 : (this.enraged ? this.speed * 1.8 : this.speed);
    this.vx = lerp(this.vx, this.guardSide * sp, clamp((this.enraged ? 8 : 5) * dt, 0, 1));
    this.integrate(dt, platforms);
  }
  // blocked if the hit lands on the guarded (player-facing) side below break speed.
  // Once enraged (shield broken) it no longer blocks anything.
  blocks(hitFromX, tipSpeed) {
    if (this.stun > 0 || this.enraged) return false;
    const side = Math.sign(hitFromX - this.x) || 1;
    return side === this.guardSide && tipSpeed < this.cfg.breakSpeed;
  }
  damageTakenMult() { return this.enraged ? 1.15 : (this.onGround ? CONFIG.armored.groundDR : CONFIG.armored.airDR); }
  draw(ctx) {
    const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
    const vulnerable = !this.onGround;   // launched -> takes full/extra damage
    const body = this.enraged ? CONFIG.colors.charger : this.color;   // enraged runs hot
    ctx.fillStyle = this.flash > 0 ? "#fff" : (this.stun > 0 ? "#9aa6b2" : body);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    // vulnerable (airborne) -> dashed double outline so it reads as "hit me now"
    if (vulnerable && this.stun <= 0) {
      ctx.strokeStyle = CONFIG.colors.slam;
      ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeRect(x - 4, y - 4, w + 8, h + 8); ctx.setLineDash([]);
    }
    if (this.enraged) {
      // shield is gone — show angry spikes instead
      ctx.fillStyle = "#000";
      for (let i = 0; i < 3; i++) { const sx = x + 6 + i * (w - 12) / 2; ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + 5, y - 8); ctx.lineTo(sx + 10, y); ctx.fill(); }
    } else if (this.stun <= 0) {
      // bold cyan shield: a thick offset bar with prongs on the guarded side
      const gx = this.x + this.guardSide * (this.hw + 9);
      ctx.fillStyle = CONFIG.colors.armoredShield;
      ctx.fillRect(gx - 4, y - 6, 8, h + 12);
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
    this.color = CONFIG.colors.boss;
    this.kind = "boss";
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
    ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
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

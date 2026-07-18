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
    // Bosses linger for a short authored collapse instead of disappearing on the
    // lethal simulation tick. Ordinary enemies still die immediately.
    this.dying = false;
    this.deathT = 0;
    this.deathDur = (CONFIG.bossTheater && CONFIG.bossTheater.deathDur) || 0.9;
    this._deathCause = "";
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
    this.weaponA = -0.5;   // animated weapon angle (radians; -up, 0 forward, +down)
    this.weaponPrevA = -0.5;
    this.chargePower = 0;  // 0..1 roll: longer wind-up -> farther, harder charge
    this.chargeMult = 1;   // contact-damage multiplier applied during a committed charge
    // platform pathfinding
    this.canClimb = false; // family is capable of hopping platforms
    this.climber = false;  // ...and this individual actually does (rolled at spawn)
    this.climbApt = 0.5;   // aptitude 0..1: better climbers react sooner & hop more fluidly
    this.navDir = 1;       // suggested horizontal direction from climbNav
    this.perchT = 0;       // how long the player has been perched above & unreached
    this.climbCommit = 0;  // once it decides to climb, it commits for a stretch (anti-jitter)
    this.aliveT = 0;       // seconds alive — willingness to climb ramps with this
    // support auras (re-applied each frame by updateSupports in game.js)
    this.auraDR = 1;       // War Priest: incoming damage multiplier (<1 = protected)
    this.auraDmg = 1;      // War Priest: outgoing damage multiplier (>1 = empowered)
    this.auraSpeed = 1;    // Herald: movement-speed multiplier
    this.auraHaste = 1;    // Herald: attack-cadence multiplier (>1 = faster shots/attacks)
    this.tetherDR = 1;     // Anchor: shielded ally damage multiplier
    this.anchored = false; // Anchor: bonded ally can't be knocked back / launched
    this.buffs = [];       // which support types currently affect this enemy (for indicators)
    this.immuneToBlade = false;  // Wraith: direct blade hits pass through harmlessly
    // ---- status effects (from Special abilities) ----
    this.bleedStacks = 0; this.bleedT = 0;   // BLEED: stacking damage-over-time
    this.burnT = 0; this.burnDps = 0;         // BURN: flat damage-over-time
    this.markT = 0;                            // MARK: takes +damage from everything
    this.slowStatus = 1;                       // Cinder T2: chilled/slowed while burning
    this._stFx = 0;                            // throttle for status particles
  }

  // ---- status effects ----
  applyBleed(stacks) { const S = CONFIG.status; this.bleedStacks = Math.min(S.bleedMax, this.bleedStacks + stacks); this.bleedT = S.bleedDur; }
  applyBurn() { const S = CONFIG.status; this.burnT = Math.max(this.burnT, S.burnDur); this.burnDps = Math.max(this.burnDps, S.burnDps); }
  applyMark() { this.markT = Math.max(this.markT, CONFIG.status.markDur); }
  bleedPool() { return this.bleedStacks * CONFIG.status.bleedDps * Math.max(this.bleedT, 0); }   // remaining bleed if it ran out
  detonateBleed() { const d = this.bleedPool(); this.bleedStacks = 0; this.bleedT = 0; return d > 0 ? this._dot(d) : 0; }
  _dot(dmg) {   // damage with no i-frame / knockback (used by DoTs + detonations)
    if (this.dead || this.dying) return 0;
    const context = { type: "status", aerial: false };
    if (this.blocksDamage(context)) return 0;
    dmg *= this.damageTakenMult(context);
    dmg = this.limitIncomingDamage(dmg, context);
    const before = this.hp;
    if (this.shield > 0) { this.shield -= dmg; if (this.shield < 0) { this.hp += this.shield; this.shield = 0; } }
    else this.hp -= dmg;
    if (this.hp <= 0) {
      if (this._deathLocked()) { this.hp = 1; }   // scripted-invulnerable boss phase (fake-death): DoTs can't kill either
      else this._beginDeath("skill");
    }
    return Math.max(0, before - Math.max(this.hp, 0));
  }
  // bosses override: true while in a scripted fake-death/kneel phase where NO damage path
  // (blade hit OR DoT) may be lethal — the fight must reach the scripted revival.
  _deathLocked() { return false; }
  _beginDeath(cause) {
    if (this.dead || this.dying) return;
    if (this.isBoss && !this.isMiniBoss) {
      this.hp = 0; this.dying = true; this.deathT = this.deathDur;
      this._deathCause = cause || ""; this.contactDmg = 0; this.vx = 0; this.vy = 0;
      if (typeof bossFeedback === "function") bossFeedback(this, "death");
      if (this.onDeathStart) this.onDeathStart();
    } else {
      this.dead = true;
      if (this.isBoss && typeof Clipper !== "undefined") Clipper.stop();
    }
  }
  updateDeath(dt) {
    if (!this.dying) return false;
    this.deathT = Math.max(0, this.deathT - dt);
    if (this.deathT <= 0) { this.dying = false; this.dead = true; return true; }
    return false;
  }
  get deathP() { return this.deathDur > 0 ? clamp(1 - this.deathT / this.deathDur, 0, 1) : 1; }
  // returns damage dealt this tick (so the loop can credit DoT kills)
  tickStatus(dt) {
    let dealt = 0;
    if (this.markT > 0) this.markT -= dt;
    if (this.bleedStacks > 0) {
      this.bleedT -= dt;
      if (this.bleedT <= 0) { this.bleedStacks = 0; this.bleedT = 0; }
      else { const d = this.bleedStacks * CONFIG.status.bleedDps * dt; this._dot(d); dealt += d; }
    }
    if (this.burnT > 0) { this.burnT -= dt; const d = this.burnDps * dt; this._dot(d); dealt += d; if (this.burnT <= 0) this.burnDps = 0; }
    return dealt;
  }

  get radius() { return Math.max(this.hw, this.hh); }
  get speed() { return this.cfg.speed * this.speedMult * this.auraSpeed * this.slowStatus; }
  blocks() { return false; }            // armored overrides
  blocksDamage() { return false; }      // bosses may gate non-melee damage too
  damageTakenMult() { return 1; }       // armored overrides (ground vs air)
  limitIncomingDamage(dmg) { return dmg; }   // authored bosses may protect a phase boundary
  // Optional authored contact gate. Most actors always deal body contact; stateful
  // bosses can close the gate without mutating their difficulty-scaled contactDmg.
  contactDamageEnabled() { return true; }
  contactDamageAmount() { return this.contactDmg; }
  onContactDamage() {}

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
  // the nearest reachable one-way platform and hop onto it, level-by-level. NOT every
  // enemy climbs, and the ones that do don't react instantly — they need the player to
  // stay perched for a "react delay" that shrinks the longer the enemy has been alive
  // (rookies stay grounded; lingering enemies get determined) and with its aptitude.
  // A commitment window stops per-frame jitter, so a player drifting across platforms
  // doesn't turn the whole arena into a jumping fest. Returns true while it's climbing.
  climbNav(player, platforms, dt) {
    if (this.jumpCd > 0) this.jumpCd -= dt;
    this.navDir = Math.sign(player.x - this.x) || 1;
    const feetY = this.y + this.hh, playerFeet = player.y + player.hh;
    const above = playerFeet <= this.y - 60;
    if (above) this.perchT += dt; else { this.perchT = 0; this.climbCommit = 0; }
    if (!this.canClimb || !this.climber || !above) return false;

    // willingness ramps with time alive; the perch delay before reacting shrinks with
    // age + aptitude (so freshly spawned enemies don't all leap the instant you hop up)
    const will = clamp(this.aliveT / 14, 0, 1);
    const reactDelay = lerp(2.4, 0.45, will * 0.6 + this.climbApt * 0.4);
    if (this.climbCommit <= 0 && this.perchT < reactDelay) return false;
    if (this.climbCommit <= 0) this.climbCommit = 1.6;     // commit a stretch (anti-jitter)
    this.climbCommit -= dt;

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
        this.vy = -1250; this.onGround = false;
        this.jumpCd = lerp(1.5, 0.7, this.climbApt);    // clumsy climbers hesitate between hops
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
    const p = new Projectile(this.x, this.y, (dx / m) * speed, (dy / m) * speed);
    p.dmg = CONFIG.proj.dmg * this.auraDmg;   // War Priest empowers shots
    p.tint = this.color; projectiles.push(p);
  }

  tickTimers(dt) {
    this.aliveT += dt;
    if (this.hitCd > 0) this.hitCd -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.stun > 0) this.stun -= dt;
    if (this.hpDisplay > this.hp) this.hpDisplay += (this.hp - this.hpDisplay) * clamp(7 * dt, 0, 1);
  }

  hit(dmg, knockX, knockY) {
    if (this.dead || this.dying) return 0;
    this.hitCd = CONFIG.blade.enemyHitIframe;
    this.flash = 0.08;
    const before = this.hp;
    dmg *= this.auraDR * this.tetherDR;          // War Priest / Anchor protection
    if (this.markT > 0) dmg *= CONFIG.status.markMult;   // MARK: amplifies every hit
    dmg = this.limitIncomingDamage(dmg, { type: "hit" });
    if (this.shield > 0) {                       // Warded: shield absorbs first
      this.shield -= dmg;
      if (this.shield < 0) { this.hp += this.shield; this.shield = 0; }
    } else {
      this.hp -= dmg;
    }
    if (!this.anchored) {   // an Anchor's bonded ally is immovable until the Anchor dies
      const kb = dmg * this.cfg.knockbackTaken / this.weight;
      const m = len(knockX, knockY) || 1;
      this.vx += (knockX / m) * kb;
      this.vy += (knockY / m) * kb - 120 / this.weight;
    }
    if (this.hp <= 0) {
      if (this._deathLocked()) { this.hp = 1; }   // scripted-invulnerable boss phase: a blade hit can't kill here either
      else this._beginDeath();
    }
    return Math.max(0, before - Math.max(this.hp, 0));
  }

  // additive shim: a uniform damage entrypoint for a symmetric actor-vs-actor collision loop
  // (see Mirror). One-line alias into the existing hit() — no existing call site changes.
  takeHit(dmg, kx, ky, src) { this.hit(dmg, kx, ky); return this.dead ? "dead" : "hit"; }

  drawHpBar(ctx) {
    if (this._noBar) return;                                  // suppressed (e.g. INDEX previews)
    const fr = clamp(this.hp / this.maxHp, 0, 1);
    const shielded = this.maxShield > 0 && this.shield > 0;
    const status = this.bleedStacks > 0 || this.burnT > 0 || this.markT > 0;
    const hit = clamp((this.flash || 0) / 0.08, 0, 1);        // 1 right after a hit -> 0
    if (fr >= 1 && !shielded && hit <= 0 && !status) return;  // pristine & unhurt -> no bar (less clutter)
    const w = Math.max(this.hw * 2, 28), x = this.x - w / 2, y = this.y - this.hh - 15, h = 5, cy = y + h / 2;
    const fl = clamp(this.hpDisplay / this.maxHp, 0, 1), low = fr <= 0.3;
    ctx.save();
    if (hit > 0) { ctx.translate(this.x, cy); ctx.scale(1 + hit * 0.05, 1 + hit * 0.45); ctx.translate(-this.x, -cy); }  // swell on hit
    ctx.fillStyle = "rgba(0,0,0,0.82)"; ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);   // outline
    ctx.fillStyle = "#39343f"; ctx.fillRect(x, y, w, h);                                // track
    if (fl > fr) { ctx.fillStyle = CONFIG.colors.slam; ctx.fillRect(x + w * fr, y, w * (fl - fr), h); }  // lagging damage chip
    ctx.fillStyle = low ? CONFIG.colors.charger : "#fff"; ctx.fillRect(x, y, w * fr, h);                 // current hp (warns red when low)
    if (hit > 0) { ctx.globalAlpha = hit * 0.7; ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w * fr, h); ctx.globalAlpha = 1; }  // hit flash
    ctx.fillStyle = low ? CONFIG.colors.charger : CONFIG.colors.eye; ctx.fillRect(x + w * fr - 1.5, y - 1, 2.5, h + 2);        // bright leading edge
    if (shielded) { ctx.fillStyle = CONFIG.colors.perfect; ctx.fillRect(x, y - 5, w * clamp(this.shield / this.maxShield, 0, 1), 3); }  // warded shield
    // status pips above the bar (bleed / burn / mark)
    if (status) {
      let sx = x; const sy = y - (shielded ? 9 : 5) - 4;
      if (this.bleedStacks > 0) { ctx.fillStyle = CONFIG.colors.charger; ctx.fillRect(sx, sy, 4, 4); sx += 6; }
      if (this.burnT > 0) { ctx.fillStyle = CONFIG.colors.slam; ctx.fillRect(sx, sy, 4, 4); sx += 6; }
      if (this.markT > 0) { ctx.fillStyle = CONFIG.colors.eye; ctx.fillRect(sx, sy, 4, 4); }
    }
    ctx.restore();
  }
}

// ---- Melee family: Charger (bull-rush), Brawler (spacing + punch/feint), Stalker (reads your dash) ----
class Charger extends Enemy {
  constructor(x, y) { super(x, y, CONFIG.enemy); this.color = CONFIG.colors.charger; this.kind = "charger"; this.behavior = "bull"; }

  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    if (this.atkCd > 0) this.atkCd -= dt;
    this._animWeapon(dt);
    // a wound-up charge hits harder on contact (longer wind-up = more power)
    this.chargeMult = (this.behavior === "bull" && this.atk === "commit") ? (1 + this.chargePower) : 1;
    // Duelist parry recharge
    if (this.behavior === "duelist" && this.duelCd > 0) { this.duelCd -= dt; if (this.duelCd <= 0) this.duelReady = true; }

    // pathfind up to a perched player (never interrupt an in-progress charge)
    if (this.canClimb && this.atk !== "commit" && this.atk !== "swing" && this.climbNav(player, platforms, dt)) {
      if (this.onGround) this.vx = lerp(this.vx, this.navDir * this.speed * 1.1, clamp(7 * dt, 0, 1));
      this.atk = "idle";
      this.integrate(dt, platforms);
      return;
    }

    const E = CONFIG.enemy;
    const dx = player.x - this.x, dist = Math.abs(dx), dir = Math.sign(dx) || 1;

    if (this.behavior === "brawler" || this.behavior === "duelist") this._brawler(dt, player, dist, dir);
    else if (this.behavior === "stalker") this._stalker(dt, player, dist, dir, E);
    else if (this.behavior === "executioner") this._executioner(dt, player, dist, dir, projectiles);
    else if (this.behavior === "gravedigger") this._gravedigger(dt, player, dist, dir, projectiles);
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
        if (this.atkT <= 0) { this.atk = "recover"; this.atkCd = E.chargeCd / this.auraHaste; }   // Herald hastens
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

  // Executioner: a long overhead wind-up (huge punish window) then heavy shockwaves both ways
  _executioner(dt, player, dist, dir, projectiles) {
    const X = CONFIG.exotic;
    if (this.atk === "windup") {
      this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1)); this.atkDir = dir; this.atkT -= dt;
      if (this.atkT <= 0) {
        const footY = this.y + this.hh;
        for (const d of [-1, 1]) { const p = new Projectile(this.x + d * this.hw, footY - X.exShockR, d * X.exShockSpeed, 0); p.setFamily("groundShock"); p.r = X.exShockR; p.dmg = X.exShockDmg; p.life = 1.6; projectiles.push(p); }
        FX.ring(this.x, footY, 18, CONFIG.colors.slam); FX.burst(this.x, footY, 0, -1, 11, CONFIG.colors.charger);
        if (typeof SFX !== "undefined" && SFX.ctx && SFX.slam) SFX.slam();
        this.atk = "recover"; this.atkCd = 1.5;
      }
    } else if (this.atk === "recover") {
      this.vx = lerp(this.vx, 0, clamp(6 * dt, 0, 1)); if (this.atkCd <= 0) this.atk = "idle";
    } else {
      this.vx = lerp(this.vx, dir * this.speed, clamp(5 * dt, 0, 1));
      if (dist < 360 && this.atkCd <= 0 && Math.abs(player.y - this.y) < 130) { this.atk = "windup"; this.atkT = X.exWindup; this.atkMax = X.exWindup; this.atkDir = dir; }
    }
  }

  // Gravedigger: a wide swing whose shock starts out at mid-range — so getting INSIDE (point-
  // blank) is the safe play, and staying at mid-range is where it hits
  _gravedigger(dt, player, dist, dir, projectiles) {
    const X = CONFIG.exotic;
    if (this.atk === "windup") {
      this.vx = lerp(this.vx, 0, clamp(7 * dt, 0, 1)); this.atkDir = dir; this.atkT -= dt;
      if (this.atkT <= 0) {
        const footY = this.y + this.hh, sx = this.x + this.atkDir * X.gravReach;
        const p = new Projectile(sx, footY - X.gravShockR, this.atkDir * X.gravShockSpeed, 0);
        p.setFamily("groundShock"); p.r = X.gravShockR; p.dmg = X.gravDmg; p.life = 1.3; projectiles.push(p);
        FX.burst(sx, footY, 0, -1, 9, CONFIG.colors.charger);
        this.atk = "swing"; this.atkT = 0.25;
      }
    } else if (this.atk === "swing") {
      this.atkT -= dt; if (this.atkT <= 0) { this.atk = "recover"; this.atkCd = 1.5; }
    } else if (this.atk === "recover") {
      this.vx = lerp(this.vx, 0, clamp(5 * dt, 0, 1)); if (this.atkCd <= 0) this.atk = "idle";
    } else {
      this.vx = lerp(this.vx, dir * this.speed, clamp(4 * dt, 0, 1));
      if (dist < 330 && dist > 80 && this.atkCd <= 0 && Math.abs(player.y - this.y) < 120) { this.atk = "windup"; this.atkT = X.gravWindup; this.atkMax = X.gravWindup; this.atkDir = dir; }
    }
  }

  // swing the held weapon toward a target angle per attack state (cock back -> slam through)
  _animWeapon(dt) {
    let wt = -0.5, k = 9;                                // idle: held at the ready
    if (this.atk === "windup") { wt = -1.55; k = 11; }   // cock it back
    else if (this.atk === "commit" || this.atk === "strike" || this.atk === "swing") { wt = 0.78; k = 26; }  // slam through
    this.weaponPrevA = this.weaponA;
    this.weaponA = lerp(this.weaponA, wt, clamp(k * dt, 0, 1));
  }

  // draw an animated weapon (per variant) with a swoosh trail while it's swinging
  _drawWeapon(ctx, dir) {
    let type = null;
    if (this.behavior === "gravedigger") type = "shovel";
    else if (this.behavior === "executioner") type = "axe";
    else if (this.behavior === "duelist") type = "sword";
    else if (this.contactReach > 14) type = "club";
    if (!type) return;
    const hx = this.x + dir * this.hw * 0.5, hy = this.y - 2;
    const len = type === "shovel" ? 54 : type === "axe" ? 48 : Math.max(28, this.hw + this.contactReach);
    const a = this.weaponA, tx = hx + dir * Math.cos(a) * len, ty = hy + Math.sin(a) * len;
    // swoosh wedge between the previous and current angle while swinging fast
    if (Math.abs(this.weaponA - this.weaponPrevA) > 0.05) {
      ctx.fillStyle = CONFIG.colors.bladeTrail; ctx.globalAlpha = 0.28;
      ctx.beginPath(); ctx.moveTo(hx, hy);
      for (let s = 0; s <= 1; s += 0.2) { const aa = this.weaponPrevA + (a - this.weaponPrevA) * s; ctx.lineTo(hx + dir * Math.cos(aa) * len, hy + Math.sin(aa) * len); }
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = THEME.ink; ctx.lineCap = "round"; ctx.lineWidth = type === "club" ? 6 : 5;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(Math.atan2(ty - hy, tx - hx)); ctx.fillStyle = THEME.ink;
    if (type === "axe") { ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(11, -13); ctx.lineTo(13, 0); ctx.lineTo(11, 13); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill(); }
    else if (type === "shovel") { ctx.fillRect(-2, -11, 15, 22); }
    else if (type === "club") { ctx.beginPath(); ctx.arc(5, 0, 8, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillRect(0, -2.5, 18, 5); }   // sword: extend the blade
    ctx.restore();
  }

  draw(ctx) {
    const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
    const dir = this.atkDir || Math.sign(this.vx) || 1;

    // Executioner: an overhead slam warning (ground lines both sides + rising marker)
    if (this.behavior === "executioner" && this.atk === "windup") {
      const k = 1 - clamp(this.atkT / (this.atkMax || 1), 0, 1), gy = this.y + this.hh;
      ctx.strokeStyle = CONFIG.colors.slam; ctx.globalAlpha = 0.3 + 0.55 * k; ctx.lineWidth = 3 + k * 4;
      ctx.beginPath(); ctx.moveTo(this.x - (50 + 150 * k), gy - 2); ctx.lineTo(this.x + (50 + 150 * k), gy - 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.x, y - 8 - 30 * k); ctx.lineTo(this.x, y - 6); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Gravedigger: a wide arc telegraph out at mid-range (point-blank is safe)
    if (this.behavior === "gravedigger" && (this.atk === "windup" || this.atk === "swing")) {
      const k = this.atk === "swing" ? 1 : 1 - clamp(this.atkT / (this.atkMax || 1), 0, 1);
      const sx = this.x + this.atkDir * CONFIG.exotic.gravReach, gy = this.y + this.hh;
      ctx.strokeStyle = CONFIG.colors.slam; ctx.globalAlpha = 0.3 + 0.5 * k; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(sx, gy, 26 + 30 * k, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // bull charge wind-up telegraph: a building dashed arrow — longer/thicker for a
    // higher-power (longer wind-up) charge, so you can read how hard it's coming
    if (this.behavior === "bull" && this.atk === "windup" && !this.feint) {
      const k = 1 - clamp(this.atkT / (this.atkMax || 0.55), 0, 1);
      const reach = 40 + (60 + this.chargePower * 130) * k;
      ctx.strokeStyle = this.color; ctx.globalAlpha = 0.35 + 0.45 * k; ctx.lineWidth = 3 + this.chargePower * 2; ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.atkDir * reach, this.y); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    ctx.fillStyle = this.flash > 0 ? "#fff" : (this.stun > 0 ? "#d7b3b3" : this.color);
    const _rim = !(typeof GFX !== "undefined" && GFX.low);
    if (_rim) { ctx.shadowColor = THEME.rim; ctx.shadowBlur = 6; }   // separating halo (esp. dark-bodied enemies on dark biomes)
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);

    // variant accents
    if (this.behavior === "bull") {                 // horns
      ctx.fillStyle = THEME.ink;
      ctx.fillRect(x + 2, y - 6, 5, 6); ctx.fillRect(x + w - 7, y - 6, 5, 6);
    } else if (this.behavior === "stalker") {        // shoulder spikes
      ctx.fillStyle = THEME.ink;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 6); ctx.lineTo(x, y + 10); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + 6, y + 6); ctx.lineTo(x + w, y + 10); ctx.fill();
    }

    // eye (x-ed out while stunned)
    ctx.fillStyle = "#fff";
    if (this.stun > 0) { ctx.fillStyle = THEME.ink; ctx.font = UI.font(11, true); ctx.textAlign = "center"; ctx.fillText("x x", this.x, y + 16); }
    else ctx.fillRect(this.x + dir * 7 - 3, y + 11, 6, 6);

    // brawler fists (cock back on windup, extend on the punch)
    if (this.behavior === "brawler") {
      ctx.fillStyle = THEME.ink;
      const ext = this.atk === "commit" ? 12 : (this.atk === "windup" ? -3 : 4);
      ctx.fillRect(this.x + dir * (this.hw + ext) - 4, this.y - 3, 8, 9);
    }

    // animated weapon (Armed club, Gravedigger shovel, Executioner axe, Duelist sword)
    this._drawWeapon(ctx, dir);
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
        this.windT = base * this.fireRateMult / this.auraHaste; this.windMax = this.windT;   // Herald hastens
      }
    } else {
      // aiming: Rifleman keeps strafing (so it leads you); others plant to fire
      if (b === "rifleman") this.vx = lerp(this.vx, away * this.speed * 0.5, clamp(5 * dt, 0, 1));
      else this.vx = lerp(this.vx, 0, clamp(12 * dt, 0, 1));
      this.windT -= dt;
      if (this.windT <= 0) {
        this._fire(player, projectiles, C);
        this.state = "kite";
        this.aimTimer = C.aimInterval * this.fireRateMult * (b === "sentinel" ? 1.15 : 1) / this.auraHaste;
      }
    }
    this.integrate(dt, platforms);
  }

  _fire(player, projectiles, C) {
    const b = this.behavior;
    const dmg = CONFIG.proj.dmg * this.auraDmg;   // War Priest empowers shots
    if (this.volley > 1) {                       // Volley affix: wide spread
      const base = Math.atan2(player.y - this.y, player.x - this.x);
      for (let i = 0; i < this.volley; i++) {
        const a = base + (i - (this.volley - 1) / 2) * 0.22;
        const p = new Projectile(this.x, this.y, Math.cos(a) * C.projSpeed, Math.sin(a) * C.projSpeed);
        p.dmg = dmg; p.tint = this.color; projectiles.push(p);
      }
      return;
    }
    if (b === "marksman") {                       // a long charge -> the fastest bolt in the game
      const CS = CONFIG.chargedShot;
      const dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
      const p = new Projectile(this.x, this.y, (dx / m) * CS.speed, (dy / m) * CS.speed);
      p.r = CS.r; p.dmg = CS.dmg * this.auraDmg; p.charged = true; p.tint = this.color;
      projectiles.push(p);
      return;
    }
    if (b === "warlock") {                        // slow shot that curves once toward you
      const X = CONFIG.exotic, dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
      const p = new Projectile(this.x, this.y, (dx / m) * X.warlockSpeed, (dy / m) * X.warlockSpeed);
      p.dmg = X.warlockDmg * this.auraDmg; p.curve = true; p.curveT = X.warlockCurveAt; p.r = 11; p.tint = this.color; p.kind = "orb";
      projectiles.push(p); return;
    }
    if (b === "chain") {                          // a shot that roots you in place on hit
      const X = CONFIG.exotic, dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
      const p = new Projectile(this.x, this.y, (dx / m) * X.chainSpeed, (dy / m) * X.chainSpeed);
      p.dmg = X.chainDmg * this.auraDmg; p.root = X.chainRoot; p.r = X.chainR; p.tint = this.color;
      projectiles.push(p); return;
    }
    if (b === "sentinel") { this.fireAt(player, projectiles, C.projSpeed * 1.15); return; }  // single precise shot
    // Rifleman leads your movement; default Ranged just double-taps where you are
    const lead = b === "rifleman" ? 0.2 : 0;
    const sp = C.projSpeed * (b === "rifleman" ? 1.1 : 1);
    for (let i = 0; i < 2; i++) {
      const tx = player.x + player.vx * lead, ty = player.y + player.vy * lead * 0.5;
      const dx = tx - this.x, dy = ty - this.y, m = len(dx, dy) || 1;
      const a = Math.atan2(dy, dx) + (i - 0.5) * (b === "rifleman" ? 0.0 : 0.07);
      const p = new Projectile(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp);
      p.dmg = dmg; p.tint = this.color; projectiles.push(p);
    }
  }

  draw(ctx, player) {
    const r = this.hw + 2, b = this.behavior;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - r); ctx.lineTo(this.x + r, this.y);
    ctx.lineTo(this.x, this.y + r); ctx.lineTo(this.x - r, this.y);
    ctx.closePath();
    ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
    if (!(typeof GFX !== "undefined" && GFX.low)) { ctx.shadowColor = THEME.rim; ctx.shadowBlur = 6; } ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2.5; ctx.stroke();

    // variant accents
    if (b === "sentinel") { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, Math.PI * 2); ctx.fill(); }
    else if (b === "marksman") { ctx.fillStyle = THEME.ink; ctx.fillRect(this.x - 2, this.y - r - 4, 4, 6); }

    // aim telegraph during wind-up
    if (this.state === "windup" && player) {
      const k = 1 - clamp(this.windT / (this.windMax || this.cfg.windup), 0, 1);
      const dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
      const sentinel = b === "sentinel", marksman = b === "marksman";
      ctx.strokeStyle = THEME.ink; ctx.globalAlpha = sentinel ? 0.5 + 0.4 * k : 0.7;
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
        ctx.lineWidth = 2; ctx.strokeStyle = THEME.ink;
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
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2; ctx.stroke();
    // variant accent: a downward fang on divers
    if (this.behavior !== "swoop") {
      ctx.fillStyle = THEME.ink;
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
    if (this.canClimb && this.atk !== "channel" && this.climbNav(player, platforms, dt)) {   // reposition up to a perched player — but never abandon a Geomancer wall-channel mid-cast (its timer would pause and the half-wall linger, then teleport-resume); matches Charger/Ranged holding position during a committed attack
      if (this.onGround) this.vx = lerp(this.vx, this.navDir * this.speed, clamp(7 * dt, 0, 1));
      this.integrate(dt, platforms);
      return;
    }
    if (this.behavior === "trap") this._trap(dt, player, projectiles, C);
    else if (this.behavior === "sludge") this._sludge(dt, player, projectiles, C);
    else if (this.behavior === "geo") this._geo(dt, player, projectiles, C);
    else this._lob(dt, player, projectiles, C);
    this.integrate(dt, platforms);
  }

  // Sludge: lobs a glob of mud that lands and leaves a slowing puddle
  _sludge(dt, player, projectiles, C) {
    this._kite(dt, player, C.standoff);
    this.lobTimer -= dt;
    if (this.lobTimer <= 0 && Math.abs(player.x - this.x) < 780) {
      const X = CONFIG.exotic, vx = clamp(player.x - this.x, -X.sludgeSpeed, X.sludgeSpeed);
      const p = new Projectile(this.x, this.y - this.hh, vx, -X.sludgeArc);
      p.gravity = X.sludgeGravity; p.mud = true; p.r = X.sludgeR;
      projectiles.push(p);
      this.lobTimer = X.sludgeInterval / this.auraHaste;
    }
  }

  // Geomancer: channels, then raises a temporary wall that sections off the arena
  // (killing it during the channel stops the wall). The game spawns the wall from wallRequest.
  _geo(dt, player, projectiles, C) {
    const X = CONFIG.exotic;
    if (this.atk === "channel") {
      this.vx = lerp(this.vx, 0, clamp(9 * dt, 0, 1)); this.atkT -= dt;
      if (this.atkT <= 0) { this.wallRequest = { x: this.geoX }; this.atk = "idle"; this.lobTimer = X.geoInterval; }
    } else {
      this._kite(dt, player, C.standoff);
      this.lobTimer -= dt;
      if (this.lobTimer <= 0 && Math.abs(player.x - this.x) < X.geoRange && this.onGround) {
        const dir = Math.sign(player.x - this.x) || 1;
        this.geoX = clamp(this.x + dir * 160, 60, CONFIG.view.w - 60);
        this.atk = "channel"; this.atkT = X.geoChannel; this.atkMax = X.geoChannel;
      }
    }
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
      if (this.bombsLeft === 0) this.lobTimer = C.lobInterval / this.auraHaste;
      return;
    }
    this.lobTimer -= dt;
    if (this.lobTimer <= 0 && Math.abs(player.x - this.x) < 760) {
      if (this.behavior === "juggle") { this.bombsLeft = 3; this.burstT = 0; }
      else { this._lobBomb(player, projectiles, 0); this.lobTimer = C.lobInterval / this.auraHaste; }
    }
  }

  _trap(dt, player, projectiles, C) {
    this._kite(dt, player, C.standoff * 0.65);
    this.mineTimer -= dt;
    if (this.mineTimer <= 0 && this.onGround) {
      const m = new Projectile(this.x, this.y, 0, 0);
      m.mine = true; m.gravity = C.bombGravity; m.r = 11; m.armT = C.mineArm;
      projectiles.push(m);
      this.mineTimer = C.mineInterval / this.auraHaste;
    }
  }

  draw(ctx) {
    // Geomancer channel telegraph: a wall rising from the floor at the target spot
    if (this.behavior === "geo" && this.atk === "channel" && this.geoX != null) {
      const k = 1 - clamp(this.atkT / (this.atkMax || 1), 0, 1), X = CONFIG.exotic, gy = CONFIG.world.groundY;
      ctx.fillStyle = CONFIG.colors.sludge; ctx.globalAlpha = 0.3 + 0.4 * k;
      ctx.fillRect(this.geoX - X.geoWallW / 2, gy - X.geoWallH * k, X.geoWallW, X.geoWallH * k);
      ctx.globalAlpha = 1;
      // channel link
      ctx.strokeStyle = CONFIG.colors.sludge; ctx.globalAlpha = 0.5; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.geoX, gy - X.geoWallH * k * 0.5); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.hw, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = THEME.ink; ctx.fillRect(this.x - 2, this.y - this.hh - 8, 4, 8);   // launcher spout
    // variant accent
    if (this.behavior === "trap") { ctx.fillStyle = "#fff"; ctx.fillRect(this.x - 6, this.y - 1, 12, 3); }
    else if (this.behavior === "juggle") { ctx.fillStyle = "#fff"; for (let i = 0; i < 3; i++) ctx.fillRect(this.x - 6 + i * 5, this.y - 3, 3, 3); }
    else if (this.behavior === "sludge") { ctx.fillStyle = CONFIG.colors.sludge; ctx.beginPath(); ctx.arc(this.x, this.y, this.hw * 0.5, 0, Math.PI * 2); ctx.fill(); }
    else if (this.behavior === "geo") { ctx.fillStyle = "#fff"; ctx.fillRect(this.x - 5, this.y - 4, 10, 8); }
    this.drawHpBar(ctx);
  }
}

// ---- Armored: shielded on the side it faces; needs a fast hit or a flank ----
class Armored extends Enemy {
  constructor(x, y) { super(x, y, CONFIG.armored); this.guardSide = 1; this.color = CONFIG.colors.armored; this.kind = "armored"; this.stompCd = CONFIG.armored.stompCd * 0.6; }
  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    this.guardSide = Math.sign(player.x - this.x) || 1;
    if (this.stompCd > 0) this.stompCd -= dt;
    const C = this.cfg;
    // enraged: chase onto platforms after a perched player
    if (this.enraged && this.canClimb && this.stun <= 0 && this.climbNav(player, platforms, dt)) {
      if (this.onGround) this.vx = lerp(this.vx, this.navDir * this.speed * 1.8, clamp(8 * dt, 0, 1));
      this.integrate(dt, platforms);
      return;
    }
    // shielded STOMP: a telegraphed ground pound sends shockwaves you must jump over
    if (!this.enraged && this.stun <= 0) {
      if (this.atk === "stompwind") {
        this.vx = lerp(this.vx, 0, clamp(10 * dt, 0, 1)); this.atkT -= dt;
        if (this.atkT <= 0) { this._stomp(projectiles, C); this.atk = "idle"; this.stompCd = C.stompCd; }
        this.integrate(dt, platforms); return;
      }
      if (this.onGround && this.stompCd <= 0 && Math.abs(player.x - this.x) < C.stompRange && Math.abs(player.y - this.y) < 130) {
        this.atk = "stompwind"; this.atkT = C.stompWindup; this.atkMax = C.stompWindup;
        this.integrate(dt, platforms); return;
      }
    }
    const sp = this.stun > 0 ? 0 : (this.enraged ? this.speed * 1.8 : this.speed);
    this.vx = lerp(this.vx, this.guardSide * sp, clamp((this.enraged ? 8 : 5) * dt, 0, 1));
    this.integrate(dt, platforms);
  }
  _stomp(projectiles, C) {
    const footY = this.y + this.hh;   // shock travels along whatever surface it's standing on
    for (const d of [-1, 1]) {
      const p = new Projectile(this.x + d * this.hw, footY - C.shockR, d * C.shockSpeed, 0);
      p.setFamily("groundShock"); p.r = C.shockR; p.dmg = C.shockDmg; p.life = 1.6;
      projectiles.push(p);
    }
    FX.ring(this.x, footY, 14, CONFIG.colors.slam);
    FX.burst(this.x, footY, 0, -1, 9, CONFIG.colors.armored);
    if (typeof SFX !== "undefined" && SFX.ctx && SFX.slam) SFX.slam();
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
    // stomp wind-up telegraph: a building warning along the floor on both sides
    if (this.atk === "stompwind") {
      const k = 1 - clamp(this.atkT / (this.atkMax || 0.55), 0, 1);
      const gy = this.y + this.hh;   // telegraph along its current surface (platform or floor)
      ctx.strokeStyle = CONFIG.colors.slam; ctx.globalAlpha = 0.35 + 0.5 * k; ctx.lineWidth = 3 + k * 3;
      ctx.beginPath(); ctx.moveTo(this.x - (40 + 160 * k), gy - 2); ctx.lineTo(this.x + (40 + 160 * k), gy - 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const body = this.enraged ? CONFIG.colors.charger : this.color;   // enraged runs hot
    ctx.fillStyle = this.flash > 0 ? "#fff" : (this.stun > 0 ? "#9aa6b2" : body);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    // vulnerable (airborne) -> dashed double outline so it reads as "hit me now"
    if (vulnerable && this.stun <= 0) {
      ctx.strokeStyle = CONFIG.colors.slam;
      ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeRect(x - 4, y - 4, w + 8, h + 8); ctx.setLineDash([]);
    }
    if (this.enraged) {
      // shield is gone — show angry spikes instead
      ctx.fillStyle = THEME.ink;
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
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 4; ctx.strokeRect(x, y, w, h);
    // eye + phase pips
    ctx.fillStyle = "#fff";
    const dir = Math.sign(this.vx) || 1;
    ctx.fillRect(this.x + dir * 18 - 9, this.y - 18, 18, 14);
    for (let i = 0; i < this.phase; i++) ctx.fillRect(x + 12 + i * 16, y + h - 18, 10, 8);
    // local hp bar hidden (a big one is drawn in the HUD)
  }
}

// ---- Support family: no real attack, they make every OTHER enemy worse (priority kills) ----
// War Priest (damage-reduction aura), Herald (speed buff), Mender (heals allies), Anchor
// (shields a tethered ally). The actual buff/heal/tether is applied by updateSupports() in
// game.js (it has the enemy list); these classes handle movement + drawing the effect.
class Support extends Enemy {
  constructor(x, y, type) {
    super(x, y, CONFIG.support);
    this.kind = "support";
    this.supportType = type;
    this.range = CONFIG.support.range;
    this.color = CONFIG.colors[type] || CONFIG.colors.priest;
    if (type === "anchor") { this.hp *= 0.55; this.maxHp *= 0.55; this.hpDisplay = this.hp; }  // fragile
    this.links = [];          // allies this support is currently affecting (set by updateSupports)
    this.auraPulse = Math.random() * 6;
  }
  update(dt, platforms, player) {
    this.tickTimers(dt);
    this.auraPulse += dt;
    // hang back from the player at a protected distance
    const dx = player.x - this.x, dist = Math.abs(dx), away = (-Math.sign(dx)) || 1;
    const KEEP = CONFIG.support.keepAway;
    let move = 0;
    if (dist < KEEP) move = away;
    else if (dist > KEEP * 1.7) move = -away;
    this.vx = lerp(this.vx, move * this.speed, clamp(5 * dt, 0, 1));
    this.integrate(dt, platforms);
  }
  draw(ctx) {
    const t = this.supportType, x = this.x, y = this.y, hw = this.hw, hh = this.hh;
    // clear connection lines to EVERY ally this support is affecting (so you can see who to break)
    if (this.links && this.links.length) {
      const beam = t === "mender" || t === "anchor";
      ctx.strokeStyle = this.color; ctx.lineWidth = beam ? 3 : 2;
      for (const a of this.links) {
        if (a.dead) continue;
        ctx.globalAlpha = 0.4 + 0.18 * Math.sin(this.auraPulse * 6);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(a.x, a.y); ctx.stroke();
        ctx.globalAlpha = 0.8; ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(a.x, a.y - a.hh - 7, 3, 0, Math.PI * 2); ctx.fill();   // marker over the buffed ally
      }
      ctx.globalAlpha = 1;
    }
    // aura ring for the field supports
    if (t === "priest" || t === "herald") {
      ctx.strokeStyle = this.color; ctx.globalAlpha = 0.22 + 0.12 * Math.sin(this.auraPulse * 3.5);
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, this.range, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Anchor: a shield bubble around the bonded ally
    if (t === "anchor" && this.links && this.links[0] && !this.links[0].dead) {
      const a = this.links[0], r = a.radius + 12;
      ctx.strokeStyle = this.color; ctx.globalAlpha = 0.5 + 0.2 * Math.sin(this.auraPulse * 4);
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.1; ctx.fillStyle = this.color; ctx.fill();
      ctx.globalAlpha = 1;
    }

    // distinct silhouette per support type so they read apart at a glance
    const body = this.flash > 0 ? "#fff" : this.color;
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2.5;
    if (t === "priest") {
      // tall robe + a halo ring (authority)
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.moveTo(x, y - hh); ctx.lineTo(x + hw, y); ctx.lineTo(x + hw * 0.7, y + hh);
      ctx.lineTo(x - hw * 0.7, y + hh); ctx.lineTo(x - hw, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y - hh - 4, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.fillRect(x - 2, y - 7, 4, 14); ctx.fillRect(x - 6, y - 3, 12, 4);   // cross
    } else if (t === "herald") {
      // slim body holding a banner on a tall pole
      ctx.fillStyle = body; ctx.fillRect(x - hw * 0.55, y - hh * 0.6, hw * 1.1, hh * 1.6); ctx.strokeRect(x - hw * 0.55, y - hh * 0.6, hw * 1.1, hh * 1.6);
      ctx.fillStyle = THEME.ink; ctx.fillRect(x + hw * 0.55, y - hh, 3, hh * 2);                 // pole
      ctx.fillStyle = body; ctx.fillRect(x + hw * 0.55 + 3, y - hh, 16, 12); ctx.strokeRect(x + hw * 0.55 + 3, y - hh, 16, 12);   // flag
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(x + hw * 0.55 + 6, y - hh + 3); ctx.lineTo(x + hw * 0.55 + 12, y - hh + 6); ctx.lineTo(x + hw * 0.55 + 6, y - hh + 9); ctx.fill();
    } else if (t === "mender") {
      // round, hunched body + a big cross
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(x, y, hw * 1.05, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.fillRect(x - 2.5, y - 10, 5, 20); ctx.fillRect(x - 9, y - 2.5, 18, 5);
    } else {
      // anchor: a heavy, blocky body + an anchor emblem (chains)
      ctx.fillStyle = body; ctx.fillRect(x - hw, y - hh * 0.7, hw * 2, hh * 1.7); ctx.strokeRect(x - hw, y - hh * 0.7, hw * 2, hh * 1.7);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y - 6, 3, 0, Math.PI * 2); ctx.stroke();                    // ring
      ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 8); ctx.stroke();               // shaft
      ctx.beginPath(); ctx.moveTo(x - 7, y + 4); ctx.quadraticCurveTo(x, y + 12, x + 7, y + 4); ctx.stroke();   // flukes
    }
    this.drawHpBar(ctx);
  }
}

// ---- Wraith (special): immune to direct blade hits; only a thrown blade or a deflected
//      shot kills it. Forces you to orchestrate the arena instead of just swinging. ----
class Wraith extends Enemy {
  constructor(x, y) {
    super(x, y, CONFIG.wraith);
    this.kind = "wraith";
    this.color = CONFIG.colors.wraith;
    this.immuneToBlade = true;
    this.phase = Math.random() * 6;
  }
  update(dt, platforms, player) {
    this.tickTimers(dt);
    this.phase += dt;
    const tx = player.x, ty = player.y - CONFIG.wraith.hoverY;
    const dx = tx - this.x, dy = ty - this.y, d = len(dx, dy) || 1;
    this.vx = lerp(this.vx, (dx / d) * this.speed, clamp(2.4 * dt, 0, 1));
    this.vy = lerp(this.vy, (dy / d) * this.speed, clamp(2.4 * dt, 0, 1));
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
    this.y = clamp(this.y, 50, CONFIG.world.groundY - this.hh);
    this.onGround = false;
  }
  draw(ctx) {
    const x = this.x, y = this.y, hw = this.hw, hh = this.hh;
    ctx.globalAlpha = 0.5 + 0.22 * Math.sin(this.phase * 3);
    ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
    ctx.beginPath();
    ctx.moveTo(x, y - hh); ctx.lineTo(x + hw, y); ctx.lineTo(x + hw * 0.5, y + hh);
    ctx.lineTo(x, y + hh * 0.55); ctx.lineTo(x - hw * 0.5, y + hh); ctx.lineTo(x - hw, y);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = CONFIG.colors.eye; ctx.fillRect(x - 7, y - 4, 4, 6); ctx.fillRect(x + 3, y - 4, 4, 6);
    this.drawHpBar(ctx);
  }
}

// ---- Chimera (special): adopts the attacks of the enemy types in its wave (often several)
//      and cycles through them. The wind-up colors it to the move that's coming. ----
const CHIMERA_MOVE_COLOR = {
  charger: "charger", brawler: "charger", stalker: "charger",
  ranged: "ranged", flyer: "flyer", bomber: "bomber", armored: "armored",
};
class Chimera extends Enemy {
  constructor(x, y) {
    super(x, y, CONFIG.chimera);
    this.kind = "chimera";
    this.color = CONFIG.colors.chimera;
    this.atk = "idle"; this.atkT = 0;
    this.copyT = 1.4 + Math.random();
    this.moves = ["charger"];   // overwritten at spawn from the wave roster
    this.curMove = "charger";
  }
  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    const C = this.cfg, dir = Math.sign(player.x - this.x) || 1, dist = Math.abs(player.x - this.x), away = -dir;
    if (this.atk === "windup") {
      this.vx = lerp(this.vx, 0, clamp(10 * dt, 0, 1)); this.atkT -= dt;
      if (this.atkT <= 0) this._exec(player, projectiles, dir);
    } else if (this.atk === "strike") {
      this.atkT -= dt; if (this.atkT <= 0) { this.atk = "recover"; this.copyT = 1.3; }
    } else if (this.atk === "recover") {
      // recover drains copyT to ~0; RESET it on the handoff to idle, or the idle block below
      // sees copyT<=0 on the very next frame and re-attacks instantly — skipping the intended
      // wander/reposition beat (without this the Chimera just plants and attacks ~every 1.85s).
      this.vx = lerp(this.vx, 0, clamp(7 * dt, 0, 1)); this.copyT -= dt; if (this.copyT <= 0) { this.atk = "idle"; this.copyT = 0.9 + Math.random() * 0.6; }   // idle reposition window (tunable)
    } else {
      let move = 0;
      if (dist > 380) move = dir; else if (dist < 210) move = away;
      this.vx = lerp(this.vx, move * this.speed, clamp(6 * dt, 0, 1));
      this.copyT -= dt;
      if (this.copyT <= 0 && dist < 660) {
        this.atk = "windup"; this.atkT = C.copyDelay;
        this.curMove = this.moves[Math.floor(Math.random() * this.moves.length)] || "charger";
      }
    }
    this.integrate(dt, platforms);
  }
  _exec(player, projectiles, dir) {
    const k = this.curMove;
    if (k === "ranged") {
      const dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1, sp = CONFIG.ranged.projSpeed;
      const p = new Projectile(this.x, this.y, (dx / m) * sp, (dy / m) * sp); p.dmg = CONFIG.proj.dmg * this.auraDmg;
      projectiles.push(p); this.atk = "recover"; this.copyT = 1.3;
    } else if (k === "bomber") {
      const B = CONFIG.bomber, vx = clamp((player.x - this.x) * 1.05, -B.bombSpeed, B.bombSpeed);
      const p = new Projectile(this.x, this.y - this.hh, vx, -B.bombArc);
      p.gravity = B.bombGravity; p.bomb = true; p.r = 12; p.dmg = B.blastDmg;
      projectiles.push(p); this.atk = "recover"; this.copyT = 1.3;
    } else if (k === "armored") {
      const A = CONFIG.armored, footY = this.y + this.hh;
      for (const d of [-1, 1]) { const p = new Projectile(this.x + d * this.hw, footY - A.shockR, d * A.shockSpeed, 0); p.setFamily("groundShock"); p.r = A.shockR; p.dmg = A.shockDmg; p.life = 1.5; projectiles.push(p); }
      FX.ring(this.x, footY, 12, CONFIG.colors.slam); this.atk = "recover"; this.copyT = 1.4;
    } else if (k === "flyer") {
      this.atk = "strike"; this.atkT = 0.4; this.vx = dir * 600; this.vy = -540;   // leap-dive
    } else {  // charger / brawler / stalker -> a committed lunge
      this.atk = "strike"; this.atkT = 0.32; this.vx = dir * 740;
    }
  }
  draw(ctx) {
    const x = this.x, y = this.y, hw = this.hw, hh = this.hh;
    const cueCol = CONFIG.colors[CHIMERA_MOVE_COLOR[this.curMove] || "chimera"];
    const active = this.atk === "windup" || this.atk === "strike";
    // a hunched, asymmetric patchwork beast (clearly NOT the old box) — jagged crest of
    // mismatched spikes, two mismatched halves, a cluster of eyes. The "many faces."
    if (this.atk === "windup") {   // telegraph in the color of the move it's about to use
      ctx.strokeStyle = cueCol; ctx.globalAlpha = 0.6; ctx.setLineDash([5, 4]); ctx.lineWidth = 2.5;
      ctx.strokeRect(x - hw - 4, y - hh - 4, hw * 2 + 8, hh * 2 + 8); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    // body: an irregular hexagon
    ctx.beginPath();
    ctx.moveTo(x - hw, y - hh * 0.2);
    ctx.lineTo(x - hw * 0.5, y - hh);
    ctx.lineTo(x + hw * 0.7, y - hh * 0.8);
    ctx.lineTo(x + hw, y + hh * 0.1);
    ctx.lineTo(x + hw * 0.5, y + hh);
    ctx.lineTo(x - hw * 0.7, y + hh);
    ctx.closePath();
    ctx.fillStyle = this.flash > 0 ? "#fff" : (active ? cueCol : this.color);
    ctx.fill();
    // mismatched left half tint (patchwork)
    ctx.save(); ctx.clip();
    ctx.globalAlpha = 0.35; ctx.fillStyle = THEME.ink;
    ctx.fillRect(x - hw, y - hh, hw, hh * 2);
    ctx.restore(); ctx.globalAlpha = 1;
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 3; ctx.stroke();
    // jagged crest of mismatched spikes
    ctx.fillStyle = THEME.ink;
    for (let i = -1; i <= 2; i++) {
      const sx = x + i * (hw * 0.5) - 3, sh = 6 + ((i + 1) % 3) * 4;
      ctx.beginPath(); ctx.moveTo(sx, y - hh * 0.7); ctx.lineTo(sx + 4, y - hh * 0.7 - sh); ctx.lineTo(sx + 8, y - hh * 0.7); ctx.fill();
    }
    // a cluster of three eyes (the "many faces")
    ctx.fillStyle = CONFIG.colors.eye;
    ctx.fillRect(x - 8, y - 2, 4, 5); ctx.fillRect(x - 1, y - 5, 4, 5); ctx.fillRect(x + 5, y - 1, 4, 5);
    this.drawHpBar(ctx);
  }
}

// Shared charge telegraph: paints the lane a boss is about to charge down so the player
// can read it and prepare. `k` (0..1) is wind-up progress — the lane fills + the arrows
// march faster as the charge commits. Drawn at the boss's ACTUAL charge height (no more
// last-instant teleport to the player's level).
function chargeTelegraph(ctx, x, cy, hh, dir, k, color) {
  const W = CONFIG.view.w;
  const x0 = dir > 0 ? x : 0, x1 = dir > 0 ? W : x, ww = x1 - x0;
  ctx.save();
  // lane fill
  ctx.fillStyle = color; ctx.globalAlpha = 0.10 + 0.18 * k;
  ctx.fillRect(x0, cy - hh, ww, hh * 2);
  // bright pulsing rails top + bottom
  ctx.globalAlpha = 0.45 + 0.45 * k;
  ctx.fillRect(x0, cy - hh - 1, ww, 3); ctx.fillRect(x0, cy + hh - 2, ww, 3);
  // chevrons marching the way it'll go
  ctx.globalAlpha = 0.5 + 0.4 * k;
  const march = (CLOCK.sim * 1000 / 90 * dir) % 46;
  for (let ax = x0 - 46 + march; ax < x1; ax += 46) {
    const px = dir > 0 ? ax : ax;
    ctx.beginPath(); ctx.moveTo(px, cy - 9); ctx.lineTo(px + dir * 13, cy); ctx.lineTo(px, cy + 9); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ====================================================================================
//  BOSS THEATER — the shared ceremony layer every boss speaks through.
//  BOSSFX mirrors the Echo's fxq (drained generically in game.js): any boss can push
//  {shake, flash, hitstop, slowmo, zoom, txt, x, y, big, color, quiet} beats.
// ====================================================================================
const BOSS_PRESENTATION = {
  warden: {
    windup: { shake: 1.5, cue: "wardenLockdown", priority: 2 }, launch: { shake: 3, cue: "wardenMortarLaunch", priority: 3 },
    contact: { shake: 6, hitstop: 0.035, cue: "wardenClash", priority: 5 }, counter: { shake: 5, flash: 0.15, hitstop: 0.045, cue: "wardenClash", priority: 6 },
    stagger: { shake: 9, flash: 0.32, hitstop: 0.07, cue: "wardenGuardBreak", priority: 8 },
    phaseTransition: { shake: 8, flash: 0.34, slowmo: 0.42, zoom: 0.04, cue: "wardenLockdown", priority: 9 },
    platformBreak: { shake: 3, cue: "wardenLockdown", priority: 2 }, platformRebuild: { shake: 1, cue: "platformRebuild", priority: 1 },
    death: { shake: 10, flash: 0.42, slowmo: 0.7, zoom: 0.055, hitstop: 0.09, cue: "bossDeathWarden", priority: 10 },
  },
  colossus: {
    windup: { shake: 2, cue: "colossusServo", priority: 2 }, launch: { shake: 4, cue: "colossusServo", priority: 3 },
    contact: { shake: 9, hitstop: 0.055, cue: "colossusPlate", priority: 6 }, counter: { shake: 7, hitstop: 0.05, cue: "sweeperCounter", priority: 7 },
    stagger: { shake: 11, flash: 0.22, slowmo: 0.35, zoom: 0.055, hitstop: 0.075, cue: "colossusStagger", priority: 8 },
    phaseTransition: { shake: 10, flash: 0.3, slowmo: 0.4, zoom: 0.05, cue: "colossusServo", priority: 9 },
    platformBreak: { shake: 6, cue: "colossusPlate", priority: 4 }, platformRebuild: { shake: 2, cue: "platformRebuild", priority: 1 },
    death: { shake: 12, flash: 0.38, slowmo: 0.75, zoom: 0.065, hitstop: 0.1, cue: "bossDeathColossus", priority: 10 },
  },
  aldric: {
    windup: { shake: 1, cue: "aldricCleaver", priority: 2 }, launch: { shake: 3, cue: "aldricCleaver", priority: 3 },
    contact: { shake: 7, hitstop: 0.045, cue: "aldricCleaver", priority: 6 }, counter: { shake: 5, hitstop: 0.04, cue: "aldricCleaver", priority: 6 },
    stagger: { shake: 8, flash: 0.18, slowmo: 0.3, cue: "aldricCleaver", priority: 8 },
    phaseTransition: { shake: 8, flash: 0.3, slowmo: 0.4, zoom: 0.045, cue: "aldricIgnite", priority: 9 },
    platformBreak: { shake: 4, cue: "aldricCleaver", priority: 3 }, platformRebuild: { shake: 1, cue: "platformRebuild", priority: 1 },
    death: { shake: 10, flash: 0.36, slowmo: 0.72, zoom: 0.05, hitstop: 0.09, cue: "bossDeathAldric", priority: 10 },
  },
  echo: {
    windup: { shake: 0, cue: "echoResonance", priority: 2 }, launch: { shake: 2, cue: "echoResonance", priority: 3 },
    contact: { shake: 4, hitstop: 0.035, cue: "echoResonance", priority: 5 }, counter: { shake: 3, flash: 0.1, cue: "echoResonance", priority: 6 },
    stagger: { shake: 5, flash: 0.16, slowmo: 0.3, cue: "echoResonance", priority: 8 },
    phaseTransition: { shake: 4, flash: 0.24, slowmo: 0.38, zoom: 0.03, cue: "echoResonance", priority: 9 },
    platformBreak: { shake: 1, cue: "echoResonance", priority: 2 }, platformRebuild: { shake: 0, cue: "echoResonance", priority: 1 },
    death: { shake: 7, flash: 0.5, slowmo: 0.75, zoom: 0.035, hitstop: 0.08, cue: "bossDeathEcho", priority: 10 },
  },
  source: {
    windup: { shake: 0, cue: "sourceCross", priority: 2 }, launch: { shake: 3, cue: "sourceCross", priority: 3 },
    contact: { shake: 6, hitstop: 0.04, cue: "sourceFracture", priority: 6 }, counter: { shake: 5, flash: 0.12, hitstop: 0.045, cue: "sourceRepel", priority: 7 },
    stagger: { shake: 7, flash: 0.2, slowmo: 0.34, cue: "sourceFracture", priority: 8 },
    phaseTransition: { shake: 7, flash: 0.32, slowmo: 0.42, zoom: 0.045, cue: "sourceCross", priority: 9 },
    platformBreak: { shake: 2, cue: "sourceFracture", priority: 3 }, platformRebuild: { shake: 0, cue: "voidTransfer", priority: 1 },
    death: { shake: 9, flash: 0.5, slowmo: 0.85, zoom: 0.07, hitstop: 0.1, cue: "bossDeathSource", priority: 10 },
  },
};
const BOSSFX = {
  q: [],
  juice(ev) { this.q.push(Object.assign({ priority: Math.max(1, (ev && ev.shake) || 0) }, ev || {})); },
  event(boss, name, overrides) {
    const id = boss && (boss.presentationId || boss.bossId) || "source";
    const profile = BOSS_PRESENTATION[id] || BOSS_PRESENTATION.source;
    this.q.push(Object.assign({ bossId: id, event: name, priority: 1 }, profile[name] || {}, overrides || {}));
  },
  drain() {
    if (!this.q.length) return [];
    const requests = this.q.splice(0), out = { priority: -1, quiet: true }, numeric = ["shake", "flash", "hitstop", "slowmo", "zoom"];
    let cuePriority = -1, textPriority = -1;
    for (const ev of requests) {
      for (const key of numeric) if ((ev[key] || 0) > (out[key] || 0)) out[key] = ev[key];
      const pr = ev.priority == null ? 1 : ev.priority;
      if (ev.cue && pr >= cuePriority) { out.cue = ev.cue; cuePriority = pr; }
      if ((ev.banner || ev.txt) && pr >= textPriority) {
        out.banner = ev.banner; out.txt = ev.txt; out.x = ev.x; out.y = ev.y; out.big = ev.big; out.color = ev.color; textPriority = pr;
      }
      out.priority = Math.max(out.priority, pr); out.quiet = out.quiet && !!ev.quiet;
    }
    return [out];   // camera, flash, hit-stop and sound are one coalesced request per simulation frame
  },
};
function bossFeedback(boss, name, overrides) { BOSSFX.event(boss, name, overrides); }

// a PHASE TURN, made ceremonial: slow-mo + flash + shake + a named banner + rings.
// Also arms the HP bar's crack-flash (game.js reads boss._phaseFlashT).
function bossPhaseBeat(boss, title, color) {
  const c = color || boss.color;
  bossFeedback(boss, "phaseTransition", { banner: title, color: c });
  try { FX.ring(boss.x, boss.y, 26, c); FX.shockwave(boss.x, boss.y, 12, c, 260, 5); } catch (e) {}
  boss._phaseFlashT = 0.7;
}

// a danger LANE — horizontal commitment for charges / sweeping beams.
function telegraphInk(color) {
  if (typeof A11Y === "undefined" || !A11Y.highContrast) return color;
  return (typeof THEME !== "undefined" && THEME.dark) ? "#fff36b" : "#4b00d1";
}
function dangerLane(ctx, x, y, w, h, dir, color, k) {
  ctx.save();
  const high = typeof A11Y !== "undefined" && A11Y.highContrast; color = telegraphInk(color);
  const sx = dir >= 0 ? x : x - w;
  ctx.fillStyle = color; ctx.globalAlpha = (high ? 0.14 : 0.07) + (high ? 0.18 : 0.13) * k; ctx.fillRect(sx, y, w, h);
  ctx.strokeStyle = color; ctx.lineWidth = (high ? 4 : 2) + 2 * k; ctx.globalAlpha = 0.45 + 0.45 * k;
  ctx.setLineDash([12, 9]); ctx.strokeRect(sx, y, w, h); ctx.setLineDash([]);
  if (high) {
    ctx.globalAlpha = 0.72; ctx.lineWidth = 3;
    for (let px = sx + 24; px < sx + w; px += 44) { ctx.beginPath(); ctx.moveTo(px - dir * 12, y + h * 0.25); ctx.lineTo(px + dir * 9, y + h * 0.5); ctx.lineTo(px - dir * 12, y + h * 0.75); ctx.stroke(); }
  }
  ctx.restore();
}

// a shared weapon GLINT: a sharp four-point tell that blooms at the striking tip.
function weaponGlint(ctx, x, y, color, k) {
  const r = 5 + 13 * clamp(k, 0, 1);
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.globalAlpha = 0.45 + 0.55 * k;
  ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
  ctx.rotate(Math.PI / 4); ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.moveTo(-r * 0.55, 0); ctx.lineTo(r * 0.55, 0); ctx.moveTo(0, -r * 0.55); ctx.lineTo(0, r * 0.55); ctx.stroke();
  ctx.restore();
}

// TELEGRAPH LANGUAGE 2.0 (shared grammar, promoted from the Echo):
// a danger COLUMN — the vertical strike/landing zone — with a pulsing ground ring
function dangerColumn(ctx, x, w, yTop, yGround, color, k) {
  ctx.save();
  const high = typeof A11Y !== "undefined" && A11Y.highContrast; color = telegraphInk(color);
  ctx.fillStyle = color; ctx.globalAlpha = (high ? 0.15 : 0.08) + 0.10 * k;
  ctx.fillRect(x - w / 2, yTop, w, yGround - yTop);
  const pr = (CLOCK.sim / 0.5) % 1;
  ctx.globalAlpha = (0.5 + 0.4 * k) * (1 - pr);
  ctx.strokeStyle = color; ctx.lineWidth = high ? 5 : 3;
  ctx.beginPath(); ctx.ellipse(x, yGround, (w * 0.55) * (0.4 + pr * 0.6), 9, 0, 0, Math.PI * 2); ctx.stroke();
  if (high) { ctx.globalAlpha = 0.8; ctx.setLineDash([9, 7]); ctx.strokeRect(x - w / 2, yTop, w, yGround - yTop); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x - 14, yGround - 25); ctx.lineTo(x, yGround - 8); ctx.lineTo(x + 14, yGround - 25); ctx.stroke(); }
  ctx.restore();
}

// a landing RETICLE (mortars, falling debris): rotating quarter-arcs closing in as k -> 1
function dangerReticle(ctx, x, y, r, k, color) {
  ctx.save();
  const high = typeof A11Y !== "undefined" && A11Y.highContrast; color = telegraphInk(color);
  ctx.strokeStyle = color; ctx.lineWidth = high ? 4.5 : 2.5; ctx.globalAlpha = 0.5 + 0.5 * k;
  const rot = CLOCK.sim / 0.4, rr = r * (1.4 - 0.4 * k);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.arc(x, y, rr, rot + i * Math.PI / 2, rot + i * Math.PI / 2 + 0.7); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke();
  if (high) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.strokeRect(-9, -9, 18, 18); ctx.restore(); }
  ctx.restore();
}

// the PERIL FLASH — the "this one cannot be parried" tell (crimson diamond + sting).
// Call perilPing(boss) at the wind-up; the boss's draw calls drawPeril each frame.
function perilPing(boss) {
  boss._perilUntil = CLOCK.sim + 0.6;
  try { SFX.rankup(); } catch (e) {}
  BOSSFX.juice({ txt: "⚠", x: boss.x, y: boss.y - boss.hh - 30, color: "#e23b3b", quiet: true });
}
function drawPeril(ctx, boss) {
  const left = (boss._perilUntil || 0) - CLOCK.sim;
  if (left <= 0) return;
  const k = left / 0.6, s = 13 + (1 - k) * 8, high = typeof A11Y !== "undefined" && A11Y.highContrast;
  ctx.save();
  ctx.translate(boss.x, boss.y - boss.hh - 34); ctx.rotate(Math.PI / 4);
  ctx.globalAlpha = 0.85 * k; ctx.fillStyle = high ? "#fff36b" : "#e23b3b";
  ctx.fillRect(-s / 2, -s / 2, s, s);
  ctx.globalAlpha = k; ctx.strokeStyle = high ? "#000" : "#fff"; ctx.lineWidth = high ? 4 : 2;
  ctx.strokeRect(-s / 2, -s / 2, s, s);
  ctx.restore();
}

// ====================================================================================
//  BOSS FRAMEWORK — The Warden (Stage 1). HP-gated phases, an attack scheduler, and
//  arena-effect hooks (floor shockwaves, mortar fire, prohibited zones, platform vaulting,
//  a fake-death beat, and a ceiling-cling finale). Later bosses follow the same shape.
// ====================================================================================
// Authoritative boss-weapon poses. Drawing, attack damage, debug hulls, and the
// Warden's blade clash all consume these exact points instead of parallel lengths.
function weaponBasis(x, y, a, facing) {
  return { x, y, ux: facing * Math.cos(a), uy: Math.sin(a), px: -Math.sin(a) * facing, py: Math.cos(a) };
}
function weaponPoint(b, along, side) { return { x: b.x + b.ux * along + b.px * side, y: b.y + b.uy * along + b.py * side }; }
function weaponSegment(a, b) { return { a, b, x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }
function freezeWeaponTemplate(points) { return Object.freeze(points.map((p) => Object.freeze(p))); }
// Static local-space silhouettes are cached once. Poses still transform into
// fresh world points because collision/debug consumers own those snapshots.
const WARDSTAFF_HEAD_LOCAL = freezeWeaponTemplate([
  [CONFIG.warden.staffFront - 8, -18], [CONFIG.warden.staffFront + CONFIG.warden.staffHead, -18],
  [CONFIG.warden.staffFront + CONFIG.warden.staffHead - 8, -6], [CONFIG.warden.staffFront + CONFIG.warden.staffHead + 3, -2],
  [CONFIG.warden.staffFront + CONFIG.warden.staffHead + 3, 7], [CONFIG.warden.staffFront + 7, 5],
  [CONFIG.warden.staffFront + CONFIG.warden.staffHead - 6, 18], [CONFIG.warden.staffFront - 8, 18],
]);
const CLEAVER_HEAD_LOCAL = freezeWeaponTemplate([
  [CONFIG.aldric.cleaverShaft - 7, -14], [CONFIG.aldric.cleaverShaft + CONFIG.aldric.cleaverBlade * 0.54, -CONFIG.aldric.cleaverHalfW],
  [CONFIG.aldric.cleaverShaft + CONFIG.aldric.cleaverBlade, -CONFIG.aldric.cleaverHalfW * 0.82],
  [CONFIG.aldric.cleaverShaft + CONFIG.aldric.cleaverBlade * 0.78, -10], [CONFIG.aldric.cleaverShaft + CONFIG.aldric.cleaverBlade + 2, -2],
  [CONFIG.aldric.cleaverShaft + CONFIG.aldric.cleaverBlade * 0.78, 8],
  [CONFIG.aldric.cleaverShaft + CONFIG.aldric.cleaverBlade, CONFIG.aldric.cleaverHalfW * 0.82],
  [CONFIG.aldric.cleaverShaft + CONFIG.aldric.cleaverBlade * 0.42, CONFIG.aldric.cleaverHalfW], [CONFIG.aldric.cleaverShaft - 7, 15],
]);
function springWeapon(actor, angleKey, velocityKey, target, dt, stiffness, damping) {
  const a = actor[angleKey], v = actor[velocityKey] || 0;
  const nv = (v + (target - a) * stiffness * dt) * Math.exp(-damping * dt);
  actor[velocityKey] = nv; actor[angleKey] = a + nv * dt;
}
function wardstaffPose(actor, angle, prevAngle) {
  const C = CONFIG.warden, origin = { x: actor.x + actor.facing * actor.hw * 0.08, y: actor.y - 7 };
  const build = (a) => {
    const b = weaponBasis(origin.x, origin.y, a, actor.facing), front = C.staffFront, head = C.staffHead;
    const shaftA = weaponPoint(b, -C.staffRear, 0), shaftB = weaponPoint(b, front, 0);
    const gripA = weaponPoint(b, -13, 0), gripB = weaponPoint(b, 18, 0);
    const headPolygon = WARDSTAFF_HEAD_LOCAL.map((p) => weaponPoint(b, p[0], p[1]));
    const cuttingEdge = weaponSegment(headPolygon[1], headPolygon[6]);
    return { shaftA, shaftB, gripA, gripB, headPolygon, cuttingEdge, tip: weaponPoint(b, front + head + 3, 2),
      counterweight: weaponPoint(b, -C.staffRear, 0), guardRing: weaponPoint(b, 31, 0) };
  };
  const cur = build(angle), prev = build(prevAngle == null ? angle : prevAngle);
  const swept = [cur.cuttingEdge, prev.cuttingEdge, weaponSegment(prev.tip, cur.tip), weaponSegment(cur.shaftA, cur.shaftB)];
  return { gripA: cur.gripA, gripB: cur.gripB, shaftA: cur.shaftA, shaftB: cur.shaftB,
    headPolygon: cur.headPolygon, cuttingEdge: cur.cuttingEdge, tip: cur.tip,
    counterweight: cur.counterweight, guardRing: cur.guardRing,
    sweptAttackHull: { segments: swept, radius: 10 },
    parryCapsule: Object.assign(weaponSegment(cur.gripB, cur.tip), { radius: C.staffParryR }) };
}
function greatCleaverPose(actor, angle, prevAngle, originOverride) {
  const C = CONFIG.aldric, hand = originOverride || { x: actor.x + actor.facing * actor.hw * 0.08, y: actor.y - 2 };
  const build = (a) => {
    const b = weaponBasis(hand.x, hand.y, a, actor.facing), shaft = C.cleaverShaft, blade = C.cleaverBlade, hw = C.cleaverHalfW;
    const shaftA = weaponPoint(b, -C.cleaverRear, 0), shaftB = weaponPoint(b, shaft + 5, 0);
    const gripA = weaponPoint(b, -15, 0), gripB = weaponPoint(b, 20, 0);
    // The double inward step at the nose is the broken-crown notch.
    const headPolygon = CLEAVER_HEAD_LOCAL.map((p) => weaponPoint(b, p[0], p[1]));
    const cuttingEdge = weaponSegment(headPolygon[2], headPolygon[6]);
    return { shaftA, shaftB, gripA, gripB, headPolygon, cuttingEdge,
      tip: weaponPoint(b, shaft + blade + 2, -2), guardRing: weaponPoint(b, shaft - 10, 0) };
  };
  const cur = build(angle), prev = build(prevAngle == null ? angle : prevAngle);
  return { gripA: cur.gripA, gripB: cur.gripB, shaftA: cur.shaftA, shaftB: cur.shaftB,
    headPolygon: cur.headPolygon, cuttingEdge: cur.cuttingEdge, tip: cur.tip, guardRing: cur.guardRing,
    sweptAttackHull: { segments: [cur.cuttingEdge, prev.cuttingEdge, weaponSegment(prev.tip, cur.tip), weaponSegment(cur.shaftA, cur.shaftB)], radius: 12 },
    parryCapsule: Object.assign(weaponSegment(cur.gripB, cur.tip), { radius: 13 }) };
}
function weaponHullHitsTarget(pose, target, pad) {
  if (!pose || !pose.sweptAttackHull || !target) return false;
  const targetR = Math.min(target.hw || 0, target.hh || 0) + (pad || 0) + pose.sweptAttackHull.radius;
  return pose.sweptAttackHull.segments.some((s) => segPointDist(s.a.x, s.a.y, s.b.x, s.b.y, target.x, target.y).dist <= targetR);
}
function weaponCapsuleIntersectsSegment(cap, ax, ay, bx, by) {
  if (!cap) return false;
  const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const A = { x: ax, y: ay }, B = { x: bx, y: by }, C = cap.a, D = cap.b;
  const boxOverlap = Math.max(Math.min(A.x, B.x), Math.min(C.x, D.x)) <= Math.min(Math.max(A.x, B.x), Math.max(C.x, D.x)) + 1e-6 &&
    Math.max(Math.min(A.y, B.y), Math.min(C.y, D.y)) <= Math.min(Math.max(A.y, B.y), Math.max(C.y, D.y)) + 1e-6;
  const crosses = boxOverlap && orient(A, B, C) * orient(A, B, D) <= 0 && orient(C, D, A) * orient(C, D, B) <= 0;
  if (crosses) return true;
  const d = Math.min(segPointDist(ax, ay, bx, by, C.x, C.y).dist, segPointDist(ax, ay, bx, by, D.x, D.y).dist,
    segPointDist(C.x, C.y, D.x, D.y, ax, ay).dist, segPointDist(C.x, C.y, D.x, D.y, bx, by).dist);
  return d <= (cap.radius || 0);
}
function weaponDebugGeometry(pose) { return pose && pose.sweptAttackHull ? pose.sweptAttackHull.segments.map((s) => ({ a: s.a, b: s.b, radius: pose.sweptAttackHull.radius })) : []; }

function traceWeaponPolygon(ctx, points) {
  if (!points || !points.length) return;
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
}
function drawWardstaff(ctx, pose, actor, dim) {
  const ph = actor.phase, low = typeof GFX !== "undefined" && GFX.low;
  const steel = dim ? "#555" : "#303842", control = ph === 1 ? "#bfeef2" : (ph === 2 ? "#d7a83e" : "#d94b56");
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (!low && !dim && ph >= 3) { ctx.strokeStyle = CONFIG.colors.charger; ctx.globalAlpha = 0.28; ctx.lineWidth = 20;
    ctx.beginPath(); ctx.moveTo(pose.shaftA.x, pose.shaftA.y); ctx.lineTo(pose.tip.x, pose.tip.y); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.strokeStyle = steel; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(pose.shaftA.x, pose.shaftA.y); ctx.lineTo(pose.shaftB.x, pose.shaftB.y); ctx.stroke();
  ctx.strokeStyle = dim ? "#777" : control; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(pose.shaftA.x, pose.shaftA.y); ctx.lineTo(pose.shaftB.x, pose.shaftB.y); ctx.stroke();
  traceWeaponPolygon(ctx, pose.headPolygon); ctx.fillStyle = dim ? "#555" : (ph === 1 ? "#657482" : ph === 2 ? "#b88a2f" : "#51232a"); ctx.fill();
  ctx.strokeStyle = control; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = steel; ctx.beginPath(); ctx.arc(pose.counterweight.x, pose.counterweight.y, 10, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = control; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = control; ctx.lineWidth = ph >= 2 ? 5 : 3; ctx.beginPath(); ctx.arc(pose.guardRing.x, pose.guardRing.y, ph >= 2 ? 12 : 9, 0, Math.PI * 2); ctx.stroke();
  // Two separated hands make the staff's leverage readable in every pose.
  for (const hand of [pose.gripA, pose.gripB]) { ctx.fillStyle = dim ? "#555" : actor.color; ctx.beginPath(); ctx.arc(hand.x, hand.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2; ctx.stroke(); }
  if (ph >= 3 && !dim) {   // failing custody bands and crimson stress fractures
    ctx.strokeStyle = "#ff9a8d"; ctx.lineWidth = 2;
    for (const t of [0.36, 0.58, 0.78]) { const x = lerp(pose.shaftA.x, pose.shaftB.x, t), y = lerp(pose.shaftA.y, pose.shaftB.y, t);
      ctx.beginPath(); ctx.moveTo(x - 5, y - 6); ctx.lineTo(x + 5, y + 6); ctx.stroke(); }
  }
  ctx.restore();
}
function drawGreatCleaver(ctx, pose, actor, downed) {
  const low = typeof GFX !== "undefined" && GFX.low, angry = !!actor.anger, witnessed = !!actor.witnessEarned;
  const steel = downed ? "#2c292b" : (witnessed ? "#434951" : "#292b30");
  const gold = witnessed ? "#9c8a59" : "#b58a32", heat = angry ? "#fff0b0" : (actor.mode === "duel" ? "#842535" : "#ed4b32");
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (!low && !downed && actor.mode !== "duel") { ctx.strokeStyle = heat; ctx.globalAlpha = 0.24; ctx.lineWidth = 22;
    ctx.beginPath(); ctx.moveTo(pose.guardRing.x, pose.guardRing.y); ctx.lineTo(pose.tip.x, pose.tip.y); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.strokeStyle = "#211f22"; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(pose.shaftA.x, pose.shaftA.y); ctx.lineTo(pose.shaftB.x, pose.shaftB.y); ctx.stroke();
  ctx.strokeStyle = gold; ctx.lineWidth = 4; ctx.stroke();
  traceWeaponPolygon(ctx, pose.headPolygon); ctx.fillStyle = steel; ctx.fill(); ctx.strokeStyle = gold; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = heat; ctx.lineWidth = angry ? 5 : 3; ctx.beginPath();
  ctx.moveTo(pose.cuttingEdge.a.x, pose.cuttingEdge.a.y); ctx.lineTo(pose.cuttingEdge.b.x, pose.cuttingEdge.b.y); ctx.stroke();
  // Internal heat and the broken-crown notch remain readable without bloom.
  ctx.globalAlpha = downed ? 0.35 : 0.8; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pose.guardRing.x, pose.guardRing.y); ctx.lineTo(pose.tip.x, pose.tip.y); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.strokeStyle = gold; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(pose.guardRing.x, pose.guardRing.y, 11, 0, Math.PI * 2); ctx.stroke();
  if (!downed) for (const hand of [pose.gripA, pose.gripB]) { ctx.fillStyle = actor.color; ctx.beginPath(); ctx.arc(hand.x, hand.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2; ctx.stroke(); }
  if (angry && !downed) { ctx.strokeStyle = "#ff6a42"; ctx.lineWidth = 2;
    for (let i = 1; i < pose.headPolygon.length - 1; i += 2) { const p = pose.headPolygon[i]; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(lerp(p.x, pose.guardRing.x, 0.3), lerp(p.y, pose.guardRing.y, 0.3)); ctx.stroke(); } }
  ctx.restore();
}

class Warden extends Enemy {
  constructor(x, y) {
    super(x, y, CONFIG.boss);
    this.color = CONFIG.colors.boss;
    this.kind = "boss"; this.isBoss = true; this.bossName = "THE WARDEN";
    this.presentationId = "warden";
    this.epithet = "KEEPER OF THE GROUNDS"; this.phaseMarks = [0.65, 0.30]; this.phaseTag = "ON DUTY";
    this.state = "idle"; this.stateT = 0;
    this.atkT = 1.8; this.pendingAtk = "baton";
    this.facing = 1;
    this.zones = [];              // phase-2 prohibited zones [{x}]
    this.zoneShiftT = 0;
    this.phaseMarker = 1;
    this.onCeiling = false;
    this.ceilDropT = 0;
    this.lungeT = CONFIG.warden.lungeCd;
    this.batonA = -0.6; this.batonPrevA = -0.6; this.batonAV = 0; this.batonStrike = 0;
    this.weaponHitSpent = false;
    this.guardMeter = 0; this.guardDelayT = 0; this.guardBrokenT = 0; this.batonParryCd = 0;
    this.searchlights = []; this.cages = []; this.trails = []; this.lockdownT = 0; this.lockdownCd = 0;
    this.mortarTargets = []; this.trailDropT = 0; this._playerRef = null;
    this.volleyCd = 0; this.volleyTargetY = 0;   // NO SHELTER: the skyward volley answers perch-campers
    this.stringIdx = 0; this.stringN = 2; this.beatPh = "wind"; this.beatHeavy = false; this.beatParried = false;   // baton strings
    this.mortarKickT = 0;
  }
  get phase() { const f = this.hp / this.maxHp; return f > 0.65 ? 1 : (f > 0.30 ? 2 : 3); }
  damageTakenMult() { return this.guardBrokenT > 0 ? CONFIG.warden.guardBreakMult : 1; }
  tickTimers(dt) {
    super.tickTimers(dt);
    if (this.batonParryCd > 0) this.batonParryCd -= dt;
    if (this.mortarKickT > 0) this.mortarKickT = Math.max(0, this.mortarKickT - dt);
    if (this.guardBrokenT > 0) {
      this.guardBrokenT -= dt;
      this.guardMeter = 1;
      if (this.guardBrokenT <= 0) this.guardMeter = 0;
    } else if (this.guardDelayT > 0) this.guardDelayT -= dt;
    else if (this.guardMeter > 0) this.guardMeter = Math.max(0, this.guardMeter - CONFIG.warden.guardDecay * dt);
  }

  weaponGeometry(angle, prevAngle) { return wardstaffPose(this, angle == null ? this.batonA : angle, prevAngle == null ? this.batonPrevA : prevAngle); }
  batonSegment() { return this.weaponGeometry().parryCapsule; }
  contactDamageEnabled() { return this.state !== "string" && this.state !== "batonlunge" && this.state !== "lunge"; }
  parryBaton(perfect) {
    if (this.dying || this.batonParryCd > 0 || this.batonStrike <= 0 || this.beatHeavy) return false;
    this.beatParried = true;   // the string beat that was deflected does not land
    const Wc = CONFIG.warden;
    this.batonParryCd = 0.22; this.batonStrike = 0; this.guardDelayT = Wc.guardDecayDelay;
    this.batonPrevA = this.batonA; this.batonA -= perfect ? 0.30 : 0.20; this.batonAV = -11;
    this.guardMeter = Math.min(1, this.guardMeter + (perfect ? Wc.guardPerfect : Wc.guardParry));
    bossFeedback(this, "counter", { color: perfect ? CONFIG.colors.perfect : "#e0a326" });
    if (typeof SFX !== "undefined" && SFX.wardenLockClang) SFX.wardenLockClang();
    if (this.guardMeter >= 1) {
      this.guardBrokenT = Wc.guardBreakDur; this.stun = Math.max(this.stun, Wc.guardBreakDur);
      this.state = "idle"; this.vx = 0;
      bossFeedback(this, "stagger", { banner: "GUARD BROKEN", color: CONFIG.colors.charger });
      FX.ring(this.x, this.y, 18, "#e0a326"); FX.burst(this.x, this.y, 0, -1, 14, CONFIG.colors.charger);
      if (typeof SFX !== "undefined" && SFX.wardenGuardBreak) SFX.wardenGuardBreak();
    }
    return true;
  }

  _syncZones() { this.zones = this.searchlights.concat(this.cages, this.trails); }
  _startLockdown() {
    const Wc = CONFIG.warden;
    this.lockdownT = Wc.lockdownDur; this.lockdownCd = Wc.lockdownCd;
    this.cages = [
      { kind: "cage", x: Wc.cageW / 2, w: Wc.cageW, fullHeight: true, dmg: Wc.zoneTick, tickCd: Wc.zoneTickCd, on: true },
      { kind: "cage", x: CONFIG.view.w - Wc.cageW / 2, w: Wc.cageW, fullHeight: true, dmg: Wc.zoneTick, tickCd: Wc.zoneTickCd, on: true },
    ];
    bossFeedback(this, "windup", { banner: "LOCKDOWN", color: this.color, quiet: true });
    this._syncZones();
  }

  // animate the baton: raised on a wind-up, slammed through on the strike.
  // String beats alternate the raise height so the rhythm READS (high-low-high).
  _animBaton(dt) {
    let wt = -0.45, k = 9;
    if (this.batonStrike > 0) { this.batonStrike -= dt; wt = 0.85; k = 30; }
    else if (this.state === "string" && this.beatPh === "wind") { wt = this.stringIdx % 2 ? -1.05 : -1.65; k = 10; }
    else if (this.state === "windup") { wt = this.pendingAtk === "mortar" ? -1.7 : -1.45; k = 8; }
    else if (this.state === "lunge") { wt = 0.2; k = 14; }
    this.batonPrevA = this.batonA;
    springWeapon(this, "batonA", "batonAV", wt, dt, 210 + k * 3, 21);
    this.debugGeometry = weaponDebugGeometry(this.weaponGeometry());
  }

  _mortar(player, projectiles, landY) {
    const Wc = CONFIG.warden, v = Wc.mortarSpeed, g = Wc.mortarGravity;
    const t = (2 * v) / g;
    const targets = this.mortarTargets.length ? this.mortarTargets : [-1, 0, 1].map((i) => clamp(player.x + i * 180, 60, CONFIG.view.w - 60));
    for (const tx of targets) {
      const p = new Projectile(this.x, this.y - this.hh, (tx - this.x) / t, -v);
      p.gravity = g; p.dmg = Wc.mortarDmg; p.r = 11; p.owner = this; p.tint = this.color;
      p.landingX = tx; p.landingY = landY != null ? landY : CONFIG.world.groundY;   // volleys burst at PLATFORM height
      p.landingT = t; p.groundImpact = true; p.bossAttack = "mortar";
      p.whistleStage = 0;
      projectiles.push(p);
    }
    this.mortarTargets = [];
  }

  _enterPhase(ph, platforms) {
    const Wc = CONFIG.warden;
    if (ph === 2) {
      this.phaseTag = "UNCHAINED";
      this.searchlights = [];
      for (let i = 0; i < Wc.zoneCount; i++) this.searchlights.push({ kind: "searchlight", x: 260 + i * (CONFIG.view.w - 520) / Math.max(1, Wc.zoneCount - 1),
        w: Wc.zoneW * 0.72, phase: i * 2.1, fullHeight: true, dmg: Wc.zoneTick, tickCd: Wc.zoneTickCd, on: true });
      this._startLockdown();
      bossPhaseBeat(this, "THE WARDEN UNCHAINS", this.color);
    } else if (ph === 3) {
      this.phaseTag = "NOTHING LEFT"; this.searchlights = []; this.cages = []; this.trails = []; this._syncZones();
      this.state = "fakedeath"; this.stateT = 2.2;   // The Fake: slump, then rise
      bossPhaseBeat(this, "NOTHING LEFT TO GUARD", CONFIG.colors.charger);
      // Phase violence enters the same readable fracture lifecycle as standing.
      // Miniboss arenas have no metadata, so this safely becomes a no-op.
      const ow = platforms.filter((p) => p.arenaPlatId && !p.floor && p.arenaState !== "warning");
      if (ow.length) ow[Math.floor(Math.random() * ow.length)].arenaFractureRequest = { color: CONFIG.colors.charger, reason: "wardenPhase" };
    }
  }

  _deathLocked() { return this.phaseMarker < 3 || this.state === "fakedeath"; }   // a huge hit cannot skip the graduation finale
  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    this._animBaton(dt);
    const Wc = CONFIG.warden, ph = this.phase;
    this._playerRef = player;
    this.facing = Math.sign(player.x - this.x) || this.facing;
    if (ph !== this.phaseMarker) { this._enterPhase(ph, platforms); this.phaseMarker = ph; }

    // Searchlights sweep instead of teleporting. Lockdown bars and burning dive seams
    // share the generic zone contract consumed by game.js.
    if (this.searchlights.length) {
      for (let i = 0; i < this.searchlights.length; i++) {
        const z = this.searchlights[i];
        z.x = clamp(CONFIG.view.w * 0.5 + Math.sin(this.aliveT * (0.48 + i * 0.07) + z.phase) * CONFIG.view.w * 0.34,
          z.w / 2, CONFIG.view.w - z.w / 2);
      }
    }
    if (this.lockdownT > 0) { this.lockdownT -= dt; if (this.lockdownT <= 0) this.cages = []; }
    else if (ph === 2) { this.lockdownCd -= dt; if (this.lockdownCd <= 0) this._startLockdown(); }
    for (const z of this.trails) z.life -= dt;
    this.trails = this.trails.filter((z) => z.life > 0);
    this._syncZones();

    if (this.introT > 0) {
      const ip = 1 - this.introT / ((CONFIG.bossTheater && CONFIG.bossTheater.introDur) || 1.4);
      if (ip > 0.66 && !this._introBeat) { this._introBeat = true; FX.shockwave(this.x, this.y + this.hh, 10, this.color, 180, 4); }
      this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1)); this.integrate(dt, platforms); return;
    }

    if (this.state === "fakedeath") {
      this.vx = lerp(this.vx, 0, clamp(4 * dt, 0, 1)); this.integrate(dt, platforms);
      this.stateT -= dt;
      if (this.stateT <= 0) { this.onCeiling = true; this.state = "idle"; this.ceilDropT = Wc.ceilDropCd; this.lungeT = Wc.lungeCd; }
      return;
    }
    if (this.onCeiling) { this._ceiling(dt, player, projectiles, Wc); return; }

    // ---- grounded phases (1 & 2) ----
    const footY = this.y + this.hh, dist = Math.abs(player.x - this.x);
    const sp = CONFIG.boss.speed * (1 + (ph - 1) * 0.35);
    if (this.state === "batonlunge") {
      // SHIELD-BATON LUNGE — plant, then hop-strike forward to close on a kiter,
      // flowing straight into a string on arrival
      if (this.beatPh === "wind") {
        this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1)); this.stateT -= dt;
        if (this.stateT <= 0) { this.beatPh = "go"; this.vx = this.facing * Wc.lungeSpeed; this.vy = -420; this.onGround = false; this.batonStrike = 0.4; this.weaponHitSpent = false;
          if (typeof SFX !== "undefined" && SFX.wardenStaffWhoosh) SFX.wardenStaffWhoosh(); }
      } else {
        this.x += this.vx * dt; this.vx = lerp(this.vx, this.facing * Wc.lungeSpeed * 0.4, clamp(3 * dt, 0, 1));
        if (!this.weaponHitSpent && weaponHullHitsTarget(this.weaponGeometry(), player, 4)) {
          this.weaponHitSpent = true; if (!player.invulnerable) player.takeDamage(Wc.lungeDmg, this.x, this);
        }
        if (this.onGround || this.x <= this.hw + 4 || this.x >= CONFIG.view.w - this.hw - 4) {
          this.x = clamp(this.x, this.hw + 4, CONFIG.view.w - this.hw - 4);
          this.state = "string"; this.stringIdx = 0; this.stringN = ph >= 2 ? 3 : 2; this.beatPh = "wind"; this.stateT = Wc.stringWind; this.beatHeavy = false; this.beatParried = false;
        }
      }
      this.integrate(dt, platforms); return;
    }
    if (this.state === "string") {
      // BATON STRINGS — the posture duel. Each beat: a wind (glint), then an
      // OPEN deflect window (batonStrike), then the swing lands unless it was
      // parried inside the window. P2's finisher beat is unparryable (peril).
      this.vx = lerp(this.vx, this.facing * sp * 1.35, clamp(4 * dt, 0, 1));
      this.stateT -= dt;
      if (this.beatPh === "wind" && this.stateT <= 0) {
        this.beatPh = "open"; this.stateT = Wc.parryWin;
        this.batonStrike = Wc.parryWin + 0.05; this.beatParried = false;
        if (typeof SFX !== "undefined" && SFX.wardenStaffWhoosh) SFX.wardenStaffWhoosh();
      } else if (this.beatPh === "open" && this.stateT <= 0) {
        if (!this.beatParried && weaponHullHitsTarget(this.weaponGeometry(), player, 3) && !player.invulnerable) {
          player.takeDamage(Wc.stringDmg * (this.beatHeavy ? 1.5 : 1), this.x, this);
          FX.burst(player.x, player.y, this.facing, -0.3, 7, this.color);
          if (this.beatHeavy) { player.vx = this.facing * Wc.bashKnock * 0.85; player.vy = -280; }
        }
        this.stringIdx++;
        if (this.stringIdx >= this.stringN) {
          this.state = "idle"; this.beatHeavy = false;
          this.atkT = Wc.batonCd / (1 + (ph - 1) * 0.3);
        } else {
          this.beatPh = "wind"; this.stateT = Wc.stringWind * (0.8 + Math.random() * 0.45);   // the rhythm varies — read it
          this.beatHeavy = this.stringIdx === this.stringN - 1 && ph >= 2;
          if (typeof SFX !== "undefined" && SFX.wardenStaffScrape) SFX.wardenStaffScrape();
          if (this.beatHeavy) perilPing(this);
        }
      }
    } else if (this.state === "windup") {
      this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1)); this.stateT -= dt;
      if (this.stateT <= 0) { this._fire(player, projectiles, footY, Wc); this.state = "idle"; this.atkT = Wc.batonCd / (1 + (ph - 1) * 0.3); }
    } else {
      this.vx = lerp(this.vx, this.facing * sp, clamp(3 * dt, 0, 1));
      this.atkT -= dt;
      this.volleyCd -= dt;
      // NO SHELTER: camp a perch too long and the volley comes for it — three
      // shells onto YOUR platform, reticles first
      if (this.campT > Wc.campAfter && this.volleyCd <= 0 && this.campPlat) {
        const pl = this.campPlat;
        this.pendingAtk = "volley"; this.state = "windup"; this.stateT = Wc.batonWindup * 1.25;
        this.mortarTargets = [-1, 0, 1].map((i) => clamp(pl.x + pl.w / 2 + i * Math.min(95, pl.w / 3), pl.x + 16, pl.x + pl.w - 16));
        this.volleyTargetY = pl.y;
        this.volleyCd = Wc.volleyCd; this.campT = 1.2;
        bossFeedback(this, "windup", { banner: "SKYWARD VOLLEY", color: this.color, quiet: true });
      }
      else if (this.atkT <= 0) {
        // his kit is MELEE + ARTILLERY now: in reach he opens a string; at mid
        // range he LUNGES to close on a kiter; far out the mortars arc in
        if (dist < Wc.stringRange) {
          this.state = "string"; this.stringIdx = 0; this.stringN = ph >= 2 ? 3 : 2;
          this.beatPh = "wind"; this.stateT = Wc.stringWind; this.beatHeavy = false; this.beatParried = false;
          if (typeof SFX !== "undefined" && SFX.wardenStaffScrape) SFX.wardenStaffScrape();
        } else if (dist < Wc.lungeRange && Math.random() < 0.55) {
          this.state = "batonlunge"; this.beatPh = "wind"; this.stateT = Wc.lungeWind;
          this.facing = Math.sign(player.x - this.x) || this.facing;
          if (typeof SFX !== "undefined" && SFX.wardenStaffScrape) SFX.wardenStaffScrape();
        } else {
          this.pendingAtk = "mortar"; this.state = "windup"; this.stateT = Wc.batonWindup;
          this.mortarTargets = [-1, 0, 1].map((i) => clamp(player.x + i * 180, 60, CONFIG.view.w - 60));
        }
      }
      // vault: random footwork in P2 — but a camping player makes it TARGETED
      // (he lands on the perch, baton first)
      if (ph === 2 && this.onGround && Math.random() < (this.campT > 2 ? 1.2 : 0.5) * dt) {
        this.vy = -1150; this.onGround = false;
        if (this.campT > 2 && this.campPlat) this.vx = (this.campPlat.x + this.campPlat.w / 2 - this.x) * 1.1;
      }
    }
    this.integrate(dt, platforms);
  }

  // artillery only — his melee lives in the string state now (no ground waves)
  _fire(player, projectiles, footY, Wc) {
    if (this.pendingAtk === "volley") this._mortar(player, projectiles, this.volleyTargetY);
    else this._mortar(player, projectiles);
    this.batonStrike = 0.18;   // the launch gesture still snaps the baton (parry it for posture)
    this.mortarKickT = 0.2; this.batonAV += this.facing * 7;
    bossFeedback(this, "launch", { color: this.color });
  }

  onProjectileGroundImpact(p) {
    const col = p.bossAttack === "mortar" ? this.color : CONFIG.colors.charger;
    const impactY = p.landingY != null ? p.landingY : CONFIG.world.groundY;
    FX.explode(p.x, impactY, col, p.bossAttack === "mortar" ? 0.8 : 0.55);
    bossFeedback(this, "contact", { color: col });
    const pl = this._playerRef;
    if (pl && Math.abs(pl.x - p.x) < 62 + pl.hw && Math.abs(pl.y + pl.hh - impactY) < 95) pl.takeDamage(p.dmg || CONFIG.warden.debrisDmg, p.x, this);
  }

  _ceiling(dt, player, projectiles, Wc) {
    this.onGround = false;
    if (this.state === "lungewind") {             // hang, lock onto a spot, telegraph the dive
      this.lungeWT -= dt;
      this.vx = lerp(this.vx, 0, clamp(6 * dt, 0, 1));
      this.x = clamp(this.x + this.vx * dt, this.hw, CONFIG.view.w - this.hw);
      if (this.lungeWT <= 0) {
        this.state = "lunge";
        this.weaponHitSpent = false;
        const m = len(this.diveTX - this.x, this.diveTY - this.y) || 1;
        this.vx = (this.diveTX - this.x) / m * Wc.lungeSpeed;
        this.vy = (this.diveTY - this.y) / m * Wc.lungeSpeed;
        if (typeof SFX !== "undefined" && SFX.wardenStaffWhoosh) SFX.wardenStaffWhoosh();
      }
      return;
    }
    if (this.state === "lunge") {                 // committed diagonal dive toward the locked spot
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (!this.weaponHitSpent && weaponHullHitsTarget(this.weaponGeometry(), player, 5)) {
        this.weaponHitSpent = true; if (!player.invulnerable) player.takeDamage(Wc.lungeDmg, this.x, this);
      }
      this.trailDropT -= dt;
      if (this.trailDropT <= 0) {
        this.trailDropT = 0.11;
        this.trails.push({ kind: "trail", x: this.x, w: 82, life: Wc.trailLife, maxLife: Wc.trailLife, dmg: Wc.zoneTick, tickCd: Wc.zoneTickCd, on: true });
        FX.ember(this.x, this.y, CONFIG.colors.charger);
      }
      const gy = CONFIG.world.groundY;
      if (this.x <= this.hw + 4 || this.x >= CONFIG.view.w - this.hw - 4 || this.y >= gy - this.hh) {
        this.y = Math.min(this.y, gy - this.hh); this.state = "idle"; this.lungeT = Wc.lungeCd;
      }
      return;
    }
    this.lungeT -= dt;
    if (this.lungeT <= 0) {                        // commit: lock the target now, dive after a readable wind-up
      this.state = "lungewind"; this.lungeWT = Wc.lungeWindup || 0.5;
      this.diveTX = clamp(player.x, this.hw, CONFIG.view.w - this.hw); this.diveTY = player.y;
      perilPing(this); this.trailDropT = 0;
      return;
    }
    // glide along the ceiling toward the player
    this.y = lerp(this.y, Wc.ceilingY, clamp(2.5 * dt, 0, 1));
    this.vx = lerp(this.vx, (player.x - this.x) * 1.1, clamp(1.5 * dt, 0, 1));
    this.x = clamp(this.x + this.vx * dt, this.hw, CONFIG.view.w - this.hw);
    this.ceilDropT -= dt;
    if (this.ceilDropT <= 0) {                    // marked ceiling debris: read the landing, then move
      for (const off of [-150, 0, 150]) {
        const tx = clamp(player.x + off, 50, CONFIG.view.w - 50);
        const p = new Projectile(tx, 36, 0, 80);
        p.gravity = Wc.debrisGravity; p.dmg = Wc.debrisDmg; p.r = 13; p.owner = this;
        p.tint = CONFIG.colors.charger; p.landingX = tx; p.landingY = CONFIG.world.groundY;
        p.landingT = 0.82; p.groundImpact = true; p.bossAttack = "debris"; projectiles.push(p);
      }
      this.ceilDropT = Wc.ceilDropCd;
    }
  }

  draw(ctx) {
    const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
    const dim = this.state === "fakedeath";
    ctx.save();
    if (this.dying) {
      ctx.translate(this.x, this.y + this.hh); ctx.rotate(-this.facing * this.deathP * 0.72);
      ctx.scale(1, 1 - this.deathP * 0.28); ctx.translate(-this.x, -(this.y + this.hh));
    }
    ctx.fillStyle = this.flash > 0 ? "#fff" : (dim ? "#7a1020" : this.color);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 4; ctx.strokeRect(x, y, w, h);
    // Planted feet and an opposite-body anticipation lean sell the staff's mass.
    const anticipating = (this.state === "string" && this.beatPh === "wind") || this.state === "windup" || (this.state === "batonlunge" && this.beatPh === "wind");
    ctx.fillStyle = dim ? "#4c4c4c" : THEME.ink;
    ctx.fillRect(this.x - this.hw * 0.72 - (anticipating ? this.facing * 7 : 0), this.y + this.hh - 9, this.hw * 0.62, 11);
    ctx.fillRect(this.x + this.hw * 0.10 - (anticipating ? this.facing * 7 : 0), this.y + this.hh - 9, this.hw * 0.62, 11);
    const introP = this.introT > 0 ? clamp(1 - this.introT / ((CONFIG.bossTheater && CONFIG.bossTheater.introDur) || 1.4), 0, 1) : -1;
    let staffA = this.dying ? lerp(this.batonA, 1.5, this.deathP) : this.batonA;
    if (introP >= 0) staffA = introP < 0.62 ? lerp(-0.45, -1.55, introP / 0.62) : lerp(-1.55, 0.82, (introP - 0.62) / 0.38);
    if (this.mortarKickT > 0) staffA -= Math.sin(this.mortarKickT / 0.2 * Math.PI) * 0.22;   // artillery recoil kicks the base into his planted stance
    const staffPose = this.weaponGeometry(staffA, introP >= 0 ? staffA : this.batonPrevA);
    if (!dim && Math.abs(this.batonA - this.batonPrevA) > 0.045 && !(typeof GFX !== "undefined" && GFX.low)) {
      const sweep = staffPose.sweptAttackHull.segments[2]; ctx.strokeStyle = this.phase >= 3 ? CONFIG.colors.charger : CONFIG.colors.slam;
      ctx.globalAlpha = 0.28; ctx.lineWidth = 24; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(sweep.a.x, sweep.a.y); ctx.lineTo(sweep.b.x, sweep.b.y); ctx.stroke(); ctx.globalAlpha = 1;
    }
    drawWardstaff(ctx, staffPose, this, dim);
    if (this.onCeiling || this.state === "lungewind" || (this.state === "lunge" && this.phase >= 3)) {
      // The phase-three dive hangs from the wardstaff's deployed custody hook.
      ctx.strokeStyle = this.phase >= 3 ? CONFIG.colors.charger : "#9ca7ad"; ctx.lineWidth = 3; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(staffPose.tip.x, staffPose.tip.y); ctx.lineTo(this.x - this.facing * 34, 18); ctx.stroke();
      ctx.beginPath(); ctx.arc(this.x - this.facing * 34, 18, 8, 0.2, Math.PI * 1.75); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // eye + phase pips + badge
    ctx.fillStyle = "#fff";
    ctx.fillRect(this.x + this.facing * 18 - 9, this.y - 20, 18, 13);
    for (let i = 0; i < this.phase; i++) ctx.fillRect(x + 14 + i * 18, y + h - 20, 12, 9);
    // Guard wear is physical: gold custody bands disappear and crimson fractures
    // cross the breastplate as posture approaches a break.
    const guardBands = 4, intact = Math.max(0, guardBands - Math.floor(this.guardMeter * guardBands + 0.001));
    ctx.fillStyle = "#e0a326";
    for (let i = 0; i < intact; i++) ctx.fillRect(x + 8 + i * 11, y + 7, 7, 5);
    if (this.guardMeter > 0.2) {
      ctx.strokeStyle = this.guardBrokenT > 0 ? CONFIG.colors.charger : "#e0a326"; ctx.lineWidth = this.guardBrokenT > 0 ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(this.x - 18, y + 8); ctx.lineTo(this.x - 4, this.y - 4); ctx.lineTo(this.x - 13, this.y + 13);
      if (this.guardMeter > 0.65) { ctx.moveTo(this.x + 16, y + 13); ctx.lineTo(this.x + 3, this.y + 4); ctx.lineTo(this.x + 12, this.y + 24); } ctx.stroke();
    }
    // wind-up telegraph
    if (this.state === "windup") {
      const gy = this.y + this.hh;
      const wk = 1 - clamp(this.stateT / (CONFIG.warden.batonWindup || 0.5), 0, 1);
      ctx.strokeStyle = CONFIG.colors.slam; ctx.globalAlpha = 0.65; ctx.lineWidth = 4; ctx.setLineDash([8, 6]);
      if (this.pendingAtk === "mortar" || this.pendingAtk === "volley") {
        ctx.beginPath(); ctx.arc(this.x, this.y - this.hh - 12, 16, 0, Math.PI * 2); ctx.stroke();
        { const ry = this.pendingAtk === "volley" ? this.volleyTargetY - 3 : CONFIG.world.groundY - 3;
          for (const tx of this.mortarTargets) dangerReticle(ctx, tx, ry, 28, wk, this.color); }
      }
      else if (this.pendingAtk === "heavy") dangerLane(ctx, this.x, gy - 76, CONFIG.view.w, 82, this.facing, CONFIG.colors.charger, wk);
      else { ctx.beginPath(); ctx.moveTo(this.x, gy - 2); ctx.lineTo(this.x + this.facing * 210, gy - 2); ctx.stroke(); }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      const bs = this.batonSegment(); weaponGlint(ctx, bs.x2, bs.y2, this.pendingAtk === "heavy" ? CONFIG.colors.charger : CONFIG.colors.slam, wk);
    }
    // string beats: the baton glints through every wind — crimson when the
    // finisher (unparryable) is coming, gold when the beat can be deflected
    if (this.state === "string" && this.beatPh === "wind") {
      const sk = 1 - clamp(this.stateT / (CONFIG.warden.stringWind || 0.3), 0, 1);
      const bs2 = this.batonSegment();
      weaponGlint(ctx, bs2.x2, bs2.y2, this.beatHeavy ? CONFIG.colors.charger : "#e0a326", sk);
    }
    // SHIELD-BATON LUNGE telegraph: the lane he's about to hop-strike down
    if (this.state === "batonlunge" && this.beatPh === "wind") {
      const lk = 1 - clamp(this.stateT / (CONFIG.warden.lungeWind || 0.42), 0, 1);
      dangerLane(ctx, this.x, this.y - this.hh, CONFIG.view.w, this.hh * 2, this.facing, this.color, lk * 0.7);
      const lungePose = this.weaponGeometry(); weaponGlint(ctx, lungePose.tip.x, lungePose.tip.y, "#e0a326", lk);
    }
    // ceiling-dive telegraph: a marked line from the cling to the spot it locked onto
    if (this.state === "lungewind") {
      const k = 1 - clamp(this.lungeWT / (CONFIG.warden.lungeWindup || 0.5), 0, 1);
      ctx.strokeStyle = CONFIG.colors.charger; ctx.globalAlpha = 0.4 + 0.5 * k; ctx.lineWidth = 3 + 3 * k; ctx.setLineDash([10, 8]); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(this.x, this.y + this.hh); ctx.lineTo(this.diveTX, this.diveTY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = CONFIG.colors.charger; ctx.globalAlpha = 0.3 + 0.6 * k;   // target reticle
      ctx.beginPath(); ctx.arc(this.diveTX, this.diveTY, 16 - 8 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      dangerColumn(ctx, this.diveTX, 92, 30, CONFIG.world.groundY, CONFIG.colors.charger, k);
    }
    drawPeril(ctx, this);
    this.drawHpBar && this.drawHpBar(ctx);   // (boss HP also shown in the HUD)
    ctx.restore();
  }
}

// ---- The Iron Colossus (Stage 2 boss): tank with a front shield -> thrown sweeping arm -> molten core ----
class Colossus extends Enemy {
  constructor(x, y) {
    super(x, y, CONFIG.colossus);
    this.color = CONFIG.colors.armored;
    this.kind = "boss"; this.isBoss = true; this.bossName = "IRON COLOSSUS";
    this.presentationId = "colossus";
    this.epithet = "THE CONTAINMENT ENGINE"; this.phaseMarks = [0.60, 0.25]; this.phaseTag = "SEALED";
    this.blockStyle = "plate";   // blocked hits CLANG off fortress plating (not an Armored reskin)
    this.state = "idle"; this.stateT = 0; this.atkT = 2.2; this.pendingAtk = "sweep";
    this.facing = 1; this.exposed = false; this.shielded = true;
    this.phaseMarker = 1;
    this.zones = []; this.zoneColor = CONFIG.colors.slam;   // phase-3 hot floor panels (reuses the boss-zone system)
    this.crossT = 0;
    this.ventT = 0; this.ventX = this.x; this.coreOpenT = 0; this.shieldEmbedT = 0;
    this.sweeperPosture = 0; this.shieldArmRuptured = false;
    this.panelIdx = -1; this.panelStepT = 0; this.meltdownCd = CONFIG.colossus.meltdownCd;
    this.attackIdx = 0; this._playerRef = null;
    this.chargeStop = false; this.smashTX = 0; this.grabCd = 0;   // bruiser kit
    this.plateKickT = 0; this.servoCompression = 0;
  }
  get phase() { const f = this.hp / this.maxHp; return f > 0.6 ? 1 : (f > 0.25 ? 2 : 3); }
  get guardSide() { return this.facing; }
  // phase-1 front shield: only an aerial hit (you striking from above) gets through
  blocks() { return this.shielded && !this.exposed; }
  blocksDamage(context) { return this.shielded && !(context && context.aerial); }
  damageTakenMult() { return this.coreOpenT > 0 ? CONFIG.colossus.coreOpenMult : (this.phase === 3 ? 1.35 : 1); }
  tickTimers(dt) {
    super.tickTimers(dt);
    if (this.ventT > 0) this.ventT -= dt;
    if (this.coreOpenT > 0) this.coreOpenT -= dt;
    if (this.shieldEmbedT > 0) this.shieldEmbedT -= dt;
    if (this.plateKickT > 0) this.plateKickT = Math.max(0, this.plateKickT - dt);
    if (this._playerRef) this._applyVent(dt, this._playerRef);
  }
  _startVent() {
    this.ventT = CONFIG.colossus.ventDur;
    this.ventX = clamp(this.x - this.facing * (this.hw + 46), CONFIG.colossus.ventW / 2, CONFIG.view.w - CONFIG.colossus.ventW / 2);
  }
  _applyVent(dt, player) {
    if (this.ventT <= 0 || !player) return;
    const C = CONFIG.colossus;
    if (Math.abs(player.x - this.ventX) <= C.ventW / 2 + player.hw && player.y < CONFIG.world.groundY && player.y > 80) {
      player.vy = Math.max(-1250, player.vy - C.ventLift * dt);
      player.onGround = false;
    }
  }

  _shock(projectiles, dir) {
    // QUAKES — the earthquake is HIS language alone now: taller, slower tremor
    // columns (see the quake draw in projectile.js), nothing like the old ripples
    const C = this.cfg, footY = this.y + this.hh;
    const p = new Projectile(this.x + dir * this.hw * 0.7, footY - C.shockR, dir * C.shockSpeed * (C.quakeSpeedMult || 0.78), 0);
    p.setFamily("groundShock"); p.quake = true; p.r = C.shockR * (C.quakeRMult || 1.25); p.dmg = C.shockDmg; p.life = 2.8;
    p.owner = this; p.tint = CONFIG.colors.armoredShield;
    projectiles.push(p);
    FX.shockwave(p.x, footY, 8, CONFIG.colors.armoredShield, 130, 4);   // the ground jolts at the epicentre
  }
  _throwShield(projectiles) {
    const C = this.cfg;
    const active = projectiles.find((shot) => shot && !shot.dead && shot.family === "sweeper" && shot.owner === this);
    if (active) return active;   // one counter-object per owner: no overlapping cheap lanes
    const p = new Projectile(this.x + this.facing * (this.hw + 12), this.y, this.facing * C.sweeperSpeed, 0);
    p.sweeperStyle = "saw"; p.setFamily("sweeper").configureSweeper({ passes: C.shieldCrossings, integrity: C.sweeperIntegrity,
      maxLife: C.sweeperMaxLife, embeddedLife: C.shieldEmbedDur });
    p.r = 22; p.dmg = C.sweeperDmg; p.owner = this; p.tint = "#ff8a32";
    p.onCountered = (shot) => this.onSweeperReturned(shot);
    projectiles.push(p);
    FX.ring(this.x, this.y, 20, CONFIG.colors.armoredShield);
    return p;
  }
  _crossBurst(projectiles) {
    const C = this.cfg;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      const p = new Projectile(this.x, this.y, dx * C.crossSpeed, dy * C.crossSpeed);
      p.dmg = C.crossDmg; p.r = 12; p.tint = CONFIG.colors.armoredShield; p.owner = this; projectiles.push(p);
    }
    FX.ring(this.x, this.y, 16, CONFIG.colors.boss);
  }
  _enterPhase(ph, projectiles) {
    if (ph === 2) {
      this.shielded = false; this.phaseTag = "BREACHED"; this._throwShield(projectiles); this.crossT = 0.8;
      bossPhaseBeat(this, "THE SHIELD FALLS", CONFIG.colors.armoredShield);
    }
    else if (ph === 3) {
      const C = this.cfg; this.zones = [];
      for (let i = 0; i < C.panelCount; i++) this.zones.push({ kind: "panel", x: 220 + i * (CONFIG.view.w - 440) / (C.panelCount - 1), w: CONFIG.warden.zoneW, on: false, arming: i === 0,
        dmg: CONFIG.warden.zoneTick, tickCd: CONFIG.warden.zoneTickCd });
      this.panelIdx = -1; this.panelStepT = 0.35; this.meltdownCd = C.meltdownCd * 0.65; this.phaseTag = "MELTDOWN";
      bossPhaseBeat(this, "THE CORE IGNITES", CONFIG.colors.slam);
    }
  }

  _debris(projectiles) {
    const C = this.cfg;
    for (const tx of [this.x - 170, this.x, this.x + 170]) {
      const x = clamp(tx, 55, CONFIG.view.w - 55), p = new Projectile(x, 32, 0, 50);
      p.gravity = C.debrisGravity; p.dmg = C.debrisDmg; p.r = 14; p.owner = this; p.tint = CONFIG.colors.armoredShield;
      p.landingX = x; p.landingY = CONFIG.world.groundY; p.landingT = 0.86; p.groundImpact = true; p.bossAttack = "debris";
      projectiles.push(p);
    }
  }
  _stagger(projectiles) {
    const C = this.cfg;
    this.state = "recover"; this.stateT = C.staggerDur; this.stun = C.staggerDur;
    this.coreOpenT = C.coreOpenDur; this._startVent(); this._debris(projectiles);
    this.plateKickT = 0.5; bossFeedback(this, "stagger", { banner: "STAGGERED", color: CONFIG.colors.armoredShield });
    FX.shockwave(this.x, this.y + this.hh, 14, CONFIG.colors.armoredShield, 230, 6);
  }
  onShieldEmbedded() {
    this.shieldEmbedT = this.cfg.shieldEmbedDur; this.stun = Math.max(this.stun, this.cfg.shieldEmbedDur * 0.55);
    bossFeedback(this, "counter", { banner: "BREACH THE FORTRESS", color: CONFIG.colors.armoredShield, zoom: 0.04, quiet: true });
  }
  onSweeperReturned(p) {
    const perfect = !!(p && p.perfect);
    this.sweeperPosture = clamp(this.sweeperPosture + (perfect ? 0.75 : 0.45), 0, 1);
    this.shieldArmRuptured = true;
    this.state = "recover"; this.stateT = perfect ? 1.05 : 0.68;
    this.stun = Math.max(this.stun, this.stateT);
    if (perfect) this.coreOpenT = Math.max(this.coreOpenT, 1.8);
    this.plateKickT = perfect ? 0.48 : 0.3;
    bossFeedback(this, "counter", { banner: perfect ? "CORE EXPOSED" : "SHIELD ARM RUPTURED", color: perfect ? CONFIG.colors.perfect : "#ff8a32",
      priority: perfect ? 9 : 7, slowmo: perfect ? 0.42 : 0, zoom: perfect ? 0.09 : 0.045 });
    FX.shockwave(this.x, this.y, 12, perfect ? CONFIG.colors.perfect : "#ff8a32", perfect ? 260 : 180, 6);
  }
  onProjectileGroundImpact(p) {
    const impactY = p.landingY != null ? p.landingY : CONFIG.world.groundY;
    FX.explode(p.x, impactY, CONFIG.colors.armoredShield, 0.55);
    const pl = this._playerRef;
    if (pl && Math.abs(pl.x - p.x) < 64 + pl.hw && Math.abs(pl.y + pl.hh - impactY) < 100) pl.takeDamage(p.dmg || this.cfg.debrisDmg, p.x, this);
  }
  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    const C = this.cfg, ph = this.phase;
    this._playerRef = player;
    this.facing = Math.sign(player.x - this.x) || this.facing;
    this.exposed = player.y < this.y - this.hh * 0.15;   // attacking from above
    if (ph !== this.phaseMarker) { this._enterPhase(ph, projectiles); this.phaseMarker = ph; }
    if (this.introT > 0) {
      const ip = 1 - this.introT / ((CONFIG.bossTheater && CONFIG.bossTheater.introDur) || 1.4);
      if (ip > 0.64 && !this._introBeat) { this._introBeat = true; this._shock(projectiles, 1); this._shock(projectiles, -1); }
      this.vx = 0; this.integrate(dt, platforms); return;
    }
    if (ph === 2) { this.crossT -= dt; if (this.crossT <= 0) { this._crossBurst(projectiles); this.crossT = C.crossCd; } }
    if (ph === 3) {
      this.panelStepT -= dt;
      if (this.panelStepT <= 0) {
        this.panelIdx = (this.panelIdx + 1) % this.zones.length;
        for (let i = 0; i < this.zones.length; i++) { this.zones[i].on = i === this.panelIdx; this.zones[i].arming = i === (this.panelIdx + 1) % this.zones.length; }
        this.panelStepT = C.panelStep;
      }
      this.meltdownCd -= dt;
      if (this.meltdownCd <= 0 && this.state === "idle") {
        this.state = "meltdown"; this.stateT = C.meltdownWindup; this.meltdownCd = C.meltdownCd; perilPing(this);
      }
    }

    if (this.state === "meltdown") {
      this.stateT -= dt;
      const k = 1 - clamp(this.stateT / C.meltdownWindup, 0, 1), gy = CONFIG.world.groundY - this.hh;
      this.x = lerp(this.x, CONFIG.view.w / 2, clamp(5 * dt, 0, 1)); this.y = gy - Math.sin(k * Math.PI) * 220;
      this.onGround = false;
      if (this.stateT <= 0) {
        this.x = CONFIG.view.w / 2; this.y = gy; this._shock(projectiles, 1); this._shock(projectiles, -1);
        this._shock(projectiles, 1); this._shock(projectiles, -1);
        for (const z of this.zones) { z.on = true; z.arming = false; }
        FX.explode(this.x, this.y + this.hh, CONFIG.colors.slam, 1.6);
        this.plateKickT = 0.5; bossFeedback(this, "contact", { banner: "MELTDOWN SLAM", color: CONFIG.colors.slam, priority: 9, shake: 14, flash: 0.4, slowmo: 0.4, zoom: 0.08 });
        this.state = "recover"; this.stateT = 0.9;
      }
      return;
    }

    if (this.state === "charge") {                    // shoulder charge (no gravity)
      this.x += this.vx * dt;
      // SMART CHARGE: most charges STOP SHORT with a shoulder-check shock once
      // they blow past the player — only a charge baited into a WALL self-staggers
      if (this.chargeStop && Math.sign(player.x - this.x) !== Math.sign(this.vx)) {
        this.vx = 0; this._shock(projectiles, this.facing);
        FX.shockwave(this.x, this.y + this.hh, 10, CONFIG.colors.armoredShield, 200, 5);
        this.state = "recover"; this.stateT = 0.5; this.atkT = this.cfg.atkCd;
        return;
      }
      if (this.x <= this.hw + 4 || this.x >= CONFIG.view.w - this.hw - 4) { this.x = clamp(this.x, this.hw + 4, CONFIG.view.w - this.hw - 4); this._stagger(projectiles); }
      return;
    }
    if (this.state === "smashwind") {                 // OVERHEAD SMASH: rise, track the player's x, then plunge
      this.stateT -= dt;
      this.x = lerp(this.x, clamp(this.smashTX, this.hw, CONFIG.view.w - this.hw), clamp(3 * dt, 0, 1));
      this.y = lerp(this.y, CONFIG.world.groundY - this.hh - 170, clamp(5 * dt, 0, 1)); this.onGround = false;
      if (this.stateT <= 0) { this.state = "smash"; this.vy = 2600; }
      return;
    }
    if (this.state === "smash") {
      this.y += this.vy * dt; this.vy += 2600 * dt;
      if (this.y >= CONFIG.world.groundY - this.hh) {
        this.y = CONFIG.world.groundY - this.hh; this.onGround = true;
        this._shock(projectiles, 1); this._shock(projectiles, -1);
        if (Math.abs(player.x - this.x) < this.cfg.smashRange && player.y > this.y - 40 && !player.invulnerable) player.takeDamage(this.cfg.smashDmg, this.x, this);
        FX.shockwave(this.x, this.y + this.hh, 16, CONFIG.colors.slam, 300, 7);
        this.plateKickT = 0.45; bossFeedback(this, "contact", { shake: 12, slowmo: 0.36, zoom: 0.06 });
        this.state = "recover"; this.stateT = 0.7; this.atkT = this.cfg.atkCd;
      }
      return;
    }
    if (this.state === "grab") {                      // SEISMIC BACKHAND — the point-blank punish
      this.stateT -= dt;
      if (this.stateT <= 0) {
        if (Math.abs(player.x - this.x) < this.cfg.grabRange + player.hw && Math.abs(player.y - this.y) < this.hh && !player.invulnerable) {
          player.takeDamage(this.cfg.grabDmg, this.x, this);
          player.vx = (Math.sign(player.x - this.x) || 1) * this.cfg.grabKnock; player.vy = -360;
        }
        FX.burst(this.x + this.facing * this.hw, this.y, this.facing, -0.2, 10, CONFIG.colors.armoredShield);
        this.state = "recover"; this.stateT = 0.45; this.atkT = this.cfg.atkCd;
      }
      return;
    }
    if (this.state === "windup") {
      this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1)); this.stateT -= dt;
      if (this.stateT <= 0) this._fire(player, projectiles, C, ph);
    } else if (this.state === "recover") {
      this.vx = lerp(this.vx, 0, clamp(6 * dt, 0, 1)); this.stateT -= dt; if (this.stateT <= 0) this.state = "idle";
    } else {
      this.vx = lerp(this.vx, this.facing * C.speed * (1 + (ph - 1) * 0.3), clamp(2.5 * dt, 0, 1));
      // NO SHELTER — PILLAR QUAKE: camp the gantry and the fortress slams its
      // support out from under you (crack warning, then the perch gives way for a while)
      this.pillarCd = (this.pillarCd || 0) - dt;
      if (this.campT > C.campAfter && this.pillarCd <= 0 && this.campPlat &&
          this.campPlat.arenaPlatId && (this.campPlat.arenaState === "stable" || this.campPlat.arenaState === "stressed")) {
        const pl = this.campPlat;
        pl.arenaFractureRequest = { color: CONFIG.colors.armoredShield, reason: "pillarQuake" };
        this.pillarCd = C.pillarCd; this.campT = 1.2;
        bossFeedback(this, "platformBreak", { banner: "PILLAR QUAKE", color: CONFIG.colors.armoredShield, priority: 7 });
        FX.shockwave(this.x, this.y + this.hh, 10, CONFIG.colors.armoredShield, 260, 5);
      }
      // SEISMIC BACKHAND: crowd the fortress and it swats you (reactive, off the rotation)
      if (this.state === "idle" && Math.abs(player.x - this.x) < C.grabRange && Math.abs(player.y - this.y) < this.hh && this.grabCd <= 0) {
        this.pendingAtk = "grab"; this.state = "grabwind"; this.stateT = C.grabWindup; this.grabCd = 3.0; perilPing(this);
      }
      this.grabCd = (this.grabCd || 0) - dt;
      this.atkT -= dt;
      if (this.atkT <= 0 && this.state === "idle") {
        // a bruiser's rhythm — charge is now just 1 option, not the whole fight;
        // P2 adds the saw, P3 the smash + meltdown
        const patterns = ph === 1 ? ["stomp", "smash", "sweep", "stomp", "charge"]
          : (ph === 2 ? ["stomp", "sweep", "smash", "charge", "stomp", "sweep"]
          : ["smash", "stomp", "charge", "sweep", "smash"]);
        this.pendingAtk = patterns[this.attackIdx++ % patterns.length];
        if (this.pendingAtk === "smash") { this.state = "smashwind"; this.stateT = C.smashWindup; this.smashTX = player.x; perilPing(this); }
        else { this.state = "windup"; this.stateT = this.pendingAtk === "charge" ? C.chargeWindup : C.windup; }
        if (this.pendingAtk === "charge") this.chargeStop = Math.random() < C.chargeStopShort;   // most charges halt short
      }
      if (this.pendingAtk === "grab" && this.state === "grabwind") { this.stateT -= dt; if (this.stateT <= 0) { this.state = "grab"; this.stateT = 0.12; } }
    }
    this.integrate(dt, platforms);
  }
  _fire(player, projectiles, C, ph) {
    const a = this.pendingAtk;
    if (a === "stomp") { this._shock(projectiles, 1); this._shock(projectiles, -1); this._startVent(); this.state = "idle"; this.atkT = C.atkCd / (1 + (ph - 1) * 0.25); }
    else if (a === "sweep") { this._shock(projectiles, this.facing); this.state = "idle"; this.atkT = C.atkCd / (1 + (ph - 1) * 0.25); }
    else { this.state = "charge"; this.vx = this.facing * C.chargeSpeed; }   // charges along its own (ground) level — telegraphed during wind-up, no teleport
    if (typeof SFX !== "undefined" && SFX.ctx && SFX.slam) SFX.slam();
  }
  draw(ctx) {
    const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2, ph = this.phase;
    ctx.save();
    if (this.dying) {
      ctx.translate(this.x, this.y + this.hh); ctx.scale(1 + this.deathP * 0.12, 1 - this.deathP * 0.58); ctx.translate(-this.x, -(this.y + this.hh));
    }
    if (this.ventT > 0) {
      const vk = clamp(this.ventT / this.cfg.ventDur, 0, 1), top = 70;
      ctx.fillStyle = CONFIG.colors.armoredShield; ctx.globalAlpha = 0.08 + 0.12 * vk;
      ctx.fillRect(this.ventX - this.cfg.ventW / 2, top, this.cfg.ventW, CONFIG.world.groundY - top);
      ctx.strokeStyle = CONFIG.colors.armoredShield; ctx.lineWidth = 3; ctx.globalAlpha = 0.35 + 0.4 * vk;
      for (let i = -2; i <= 2; i++) {
        const sx = this.ventX + i * this.cfg.ventW * 0.16, off = (CLOCK.sim * 1000 / 5 + i * 31) % 90;
        ctx.beginPath(); ctx.moveTo(sx, CONFIG.world.groundY - off); ctx.lineTo(sx, CONFIG.world.groundY - off - 48); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // body (heavy plating + rivets)
    ctx.fillStyle = this.flash > 0 ? "#fff" : (this.stun > 0 ? "#9aa6b2" : this.color);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 5; ctx.strokeRect(x, y, w, h);
    // Separate armor, piston and core layers sell mass without constant camera shake.
    const wind = this.state === "windup" || this.state === "smashwind" || this.state === "meltdown";
    const compress = wind ? 7 + 5 * Math.sin(clamp(this.stateT || 0, 0, 1) * Math.PI) : 0;
    const plateOut = (this.coreOpenT > 0 ? 11 : 0) + (this.plateKickT > 0 ? Math.sin(this.plateKickT / 0.5 * Math.PI) * 16 : 0);
    ctx.strokeStyle = "#40474f"; ctx.lineWidth = 7;
    for (const side of [-1, 1]) {
      const sx = this.x + side * (this.hw * 0.58 + plateOut), py = y + 24 + compress;
      ctx.beginPath(); ctx.moveTo(this.x + side * 12, this.y - 18); ctx.lineTo(sx, py); ctx.lineTo(sx, y + h - 20 - compress); ctx.stroke();
      ctx.fillStyle = side === this.facing ? CONFIG.colors.armoredShield : "#59616a";
      ctx.fillRect(sx - 15, y + 12 - plateOut * 0.18, 30, h - 24);
      ctx.strokeStyle = THEME.ink; ctx.lineWidth = 3; ctx.strokeRect(sx - 15, y + 12 - plateOut * 0.18, 30, h - 24);
    }
    ctx.fillStyle = THEME.ink;
    for (let i = 0; i < 4; i++) { ctx.fillRect(x + 8 + i * (w - 24) / 3, y + 8, 5, 5); ctx.fillRect(x + 8 + i * (w - 24) / 3, y + h - 13, 5, 5); }
    // eye
    ctx.fillStyle = "#fff"; ctx.fillRect(this.x + this.facing * 26 - 12, this.y - 28, 24, 16);
    // front shield (phase 1) or exposed molten core (phase 3)
    if (this.shielded) {
      const gx = this.x + this.facing * (this.hw + 12);
      // PLATE CLANG: the struck plating flashes white for a beat
      if (this._plateFlashT > 0) { this._plateFlashT -= 1 / 60; ctx.fillStyle = "#fff"; }
      else ctx.fillStyle = CONFIG.colors.armoredShield;
      ctx.fillRect(gx - 6, y - 8, 12, h + 16);
      ctx.fillRect(gx - this.facing * 10 - 1, y - 8, this.facing * 11, 8);
      ctx.fillRect(gx - this.facing * 10 - 1, y + h + 1, this.facing * 11, 8);
    } else if (ph === 3 || this.coreOpenT > 0) {
      const pulse = 0.6 + 0.4 * Math.sin(CLOCK.sim * 1000 / 120);
      ctx.fillStyle = this.coreOpenT > 0 ? CONFIG.colors.armoredShield : CONFIG.colors.boss; ctx.globalAlpha = pulse;
      ctx.beginPath(); ctx.arc(this.x, this.y + 6, 22, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = CONFIG.colors.slam; ctx.lineWidth = 3; ctx.stroke();
    }
    if (!this.shielded && this.shieldArmRuptured) {
      // The returned saw leaves the front actuator visibly broken; posture damage
      // reads on the body even while a perfect return exposes the molten core.
      const ax = this.x + this.facing * (this.hw + 7), ay = this.y + 3;
      ctx.strokeStyle = "#ff8a32"; ctx.lineWidth = 5; ctx.lineCap = "square";
      ctx.beginPath(); ctx.moveTo(ax, ay - 30); ctx.lineTo(ax - this.facing * 15, ay - 8); ctx.lineTo(ax + this.facing * 5, ay + 8); ctx.lineTo(ax - this.facing * 12, ay + 31); ctx.stroke();
      ctx.fillStyle = THEME.ink; ctx.fillRect(ax - 6, ay - 7, 12, 14);
    }
    // wind-up telegraph
    if (this.state === "windup") {
      const gy = this.y + this.hh, k = 1 - clamp(this.stateT / (this.pendingAtk === "charge" ? this.cfg.chargeWindup : this.cfg.windup), 0, 1);
      if (this.pendingAtk === "charge") { dangerLane(ctx, this.x, this.y - this.hh, CONFIG.view.w, this.hh * 2, this.facing, CONFIG.colors.slam, k); chargeTelegraph(ctx, this.x, this.y, this.hh, this.facing, k, CONFIG.colors.slam); }
      else {
        ctx.strokeStyle = CONFIG.colors.slam; ctx.globalAlpha = 0.35 + 0.5 * k; ctx.lineWidth = 4; ctx.setLineDash([8, 6]);
        if (this.pendingAtk === "stomp") { ctx.beginPath(); ctx.moveTo(this.x - (60 + 180 * k), gy - 2); ctx.lineTo(this.x + (60 + 180 * k), gy - 2); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(this.x, gy - 2); ctx.lineTo(this.x + this.facing * (60 + 200 * k), gy - 2); ctx.stroke(); }
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      weaponGlint(ctx, this.x + this.facing * (this.hw + 12), this.y - 4, CONFIG.colors.armoredShield, k);
    }
    // OVERHEAD SMASH telegraph: the kill-column follows the raised fist
    if (this.state === "smashwind") {
      const k = 1 - clamp(this.stateT / this.cfg.smashWindup, 0, 1);
      dangerColumn(ctx, this.x, this.cfg.smashRange * 1.4, this.y + this.hh, CONFIG.world.groundY, CONFIG.colors.slam, k);
      weaponGlint(ctx, this.x, this.y - this.hh - 10, CONFIG.colors.slam, k);
      drawPeril(ctx, this);
    }
    // SEISMIC BACKHAND telegraph: a short arc sweeping to the strike side
    if (this.state === "grabwind") {
      const k = 1 - clamp(this.stateT / this.cfg.grabWindup, 0, 1);
      ctx.save(); ctx.strokeStyle = CONFIG.colors.armoredShield; ctx.globalAlpha = 0.4 + 0.5 * k; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.cfg.grabRange, this.facing > 0 ? -0.8 : Math.PI - 0.8, this.facing > 0 ? 0.8 : Math.PI + 0.8); ctx.stroke(); ctx.restore();
    }
    if (this.state === "meltdown") {
      const k = 1 - clamp(this.stateT / this.cfg.meltdownWindup, 0, 1);
      dangerColumn(ctx, CONFIG.view.w / 2, 190, 20, CONFIG.world.groundY, CONFIG.colors.slam, k);
    }
    if (this.dying) {
      ctx.globalAlpha = 1 - this.deathP * 0.35; ctx.fillStyle = CONFIG.colors.armoredShield;
      for (let i = 0; i < 5; i++) {
        const d = this.deathP * (34 + i * 9), px = this.x + (i - 2) * 24, py = this.y - 30 + d * d * 0.035;
        ctx.save(); ctx.translate(px, py); ctx.rotate((i - 2) * this.deathP); ctx.fillRect(-10, -7, 20, 14); ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    drawPeril(ctx, this);
    ctx.restore();
  }
}

// THRONE FIRE is a single deterministic sequencer shared by Aldric and the Source's
// copied ground cycle. Pattern A (even columns) is always the documented opener:
// 2.2s stable -> 0.8s warning for B -> atomic B commit, then the inverse.
function syncThroneFire(owner) {
  const seams = Array.isArray(owner.seams) ? owner.seams : [];
  owner.zones = (owner.fireZones || []).concat(seams);
}
function applyThroneFire(owner) {
  const warning = owner.fireState === "warning";
  const warnDur = Math.max(0.001, CONFIG.aldric.fireWarn);
  const warnK = warning ? clamp(1 - owner.fireClock / warnDur, 0, 1) : 0;
  for (const z of owner.fireZones || []) {
    z.on = z.patternIndex === owner.firePattern;
    z.nextOn = z.patternIndex === (owner.firePattern ^ 1);
    z.warn = warning && z.nextOn;
    z.warnK = z.warn ? warnK : 0;
  }
  owner.zoneCycleT = owner.fireClock;   // legacy/debug clock now mirrors the explicit state
  syncThroneFire(owner);
}
function playThroneFireWarning(owner) {
  if (owner.fireState !== "warning") return;
  const k = clamp(1 - owner.fireClock / Math.max(0.001, CONFIG.aldric.fireWarn), 0, 1);
  const thresholds = [0, 0.42, 0.78];
  while (owner.fireWarnStep < 2 && k + 1e-6 >= thresholds[owner.fireWarnStep + 1]) {
    owner.fireWarnStep++;
    if (typeof SFX !== "undefined" && SFX.aldricFireWarn) SFX.aldricFireWarn(owner.fireWarnStep);
  }
}
function startThroneFire(owner, preservePattern) {
  const C = CONFIG.aldric, colW = CONFIG.view.w / C.fireCols;
  if (!preservePattern || !Number.isInteger(owner.firePattern)) owner.firePattern = 0;
  owner.firePattern &= 1;
  owner.fireState = "stable";
  owner.fireClock = Math.max(0.001, C.fireCycle - C.fireWarn);
  owner.fireWarnStep = -1;
  owner.fireZones = [];
  for (let i = 0; i < C.fireCols; i++) owner.fireZones.push({
    kind: "fire", x: (i + 0.5) * colW, w: colW, patternIndex: i & 1,
    on: false, nextOn: false, warn: false, warnK: 0,
    dmg: CONFIG.warden.zoneTick, tickCd: CONFIG.warden.zoneTickCd,
  });
  applyThroneFire(owner);
}
function clearThroneFire(owner, preservePattern) {
  owner.fireZones = [];
  owner.fireState = "idle"; owner.fireClock = 0; owner.zoneCycleT = 0; owner.fireWarnStep = -1;
  if (!preservePattern) owner.firePattern = 0;
  syncThroneFire(owner);
}
function tickThroneFire(owner, dt) {
  if (!owner.fireZones || !owner.fireZones.length || owner.fireState === "idle") return;
  const C = CONFIG.aldric, stableDur = Math.max(0.001, C.fireCycle - C.fireWarn), warnDur = Math.max(0.001, C.fireWarn);
  let remaining = Math.max(0, dt), guard = 0;
  while (remaining > 0 && guard++ < 8) {
    const slice = Math.min(remaining, Math.max(0, owner.fireClock));
    owner.fireClock -= slice; remaining -= slice;
    if (owner.fireState === "warning") playThroneFireWarning(owner);
    if (owner.fireClock > 1e-8) break;
    if (owner.fireState === "stable") {
      owner.fireState = "warning"; owner.fireClock = warnDur; owner.fireWarnStep = -1;
      playThroneFireWarning(owner);
    } else {
      owner.firePattern ^= 1; owner.fireState = "stable"; owner.fireClock = stableDur; owner.fireWarnStep = -1;
      if (typeof SFX !== "undefined" && SFX.aldricIgnite) SFX.aldricIgnite();
    }
    applyThroneFire(owner);
  }
  applyThroneFire(owner);
}

// ---- The Berserker King / Aldric (Stage 3 boss): a duel -> a throne of fire -> a fake death & frenzy ----
class Aldric extends Enemy {
  constructor(x, y) {
    super(x, y, CONFIG.aldric);
    this.color = CONFIG.colors.charger;
    this.kind = "boss"; this.isBoss = true; this.bossName = "ALDRIC";
    this.presentationId = "aldric";
    this.epithet = "THE BERSERKER KING"; this.phaseMarks = [0.65, 0.20]; this.phaseTag = "THE DUEL";
    this.mode = "duel"; this.state = "idle"; this.stateT = 0; this.atkT = 1.6; this.facing = 1;
    this.zones = []; this.zoneColor = CONFIG.colors.bomber; this.zoneCycleT = 0;
    this.spawnAdds = false; this.faked = false; this.reviveCap = 0; this.chargeT = 0;
    this.weaponA = -0.6; this.weaponPrevA = -0.6; this.weaponAV = 0;
    this.weaponHitSpent = false; this.weaponEmberT = 0; this.weaponImpactT = 0; this.weaponBuriedT = 0; this.weaponReclaimT = 0;
    this.fireZones = []; this.seams = []; this.firePattern = 0; this.fireState = "idle"; this.fireClock = 0; this.fireWarnStep = -1;
    this.kneelT = 0; this.kneelStruck = false; this.anger = false;
    this.crown = null; this.crownfireCd = CONFIG.aldric.crownfireCd; this.chainLeft = 0; this.ghostT = 0; this.seamDropT = 0;
    this._playerRef = null; this.witnessEarned = false;
    this.overheadCd = CONFIG.aldric.overheadCd; this.overTX = 0;   // OVERHEAD CLEAVER
  }
  damageTakenMult() { return this.mode === "frenzy" ? CONFIG.aldric.frenzyDmgTaken : (this.mode === "downed" ? CONFIG.aldric.downedDmgTaken : 1); }
  _buriedWeaponOrigin() { return { x: this.x + this.facing * 88, y: CONFIG.world.groundY - 44 }; }
  weaponGeometry(angle, prevAngle, origin) {
    let a = angle == null ? this.weaponA : angle, pa = prevAngle == null ? this.weaponPrevA : prevAngle, o = origin;
    if (!o && this.mode === "downed") { o = this._buriedWeaponOrigin(); a = -1.36; pa = a; }
    else if (!o && this.weaponReclaimT > 0) {
      const k = clamp(1 - this.weaponReclaimT / 0.55, 0, 1), buried = this._buriedWeaponOrigin();
      const hand = { x: this.x + this.facing * this.hw * 0.08, y: this.y - 2 };
      o = { x: lerp(buried.x, hand.x, k), y: lerp(buried.y, hand.y, k) }; a = lerp(-1.36, a, k); pa = a;
    }
    return greatCleaverPose(this, a, pa, o);
  }
  contactDamageEnabled() { return this.state !== "lunge" && this.state !== "overhead"; }
  // during the fake he can't be killed (hit OR DoT) — he always rises into the frenzy
  _deathLocked() { return this.mode === "downed"; }
  hit(dmg, knockX, knockY) {
    if (this.mode === "downed" && dmg > 0 && !this.kneelStruck) {
      this.kneelStruck = true; this.anger = true;
      this.reviveCap = this.maxHp * CONFIG.aldric.angerReviveFrac;
      this.kneelT = Math.min(this.kneelT, 2.2);
      bossFeedback(this, "counter", { banner: "THE KING REMEMBERS", color: CONFIG.colors.charger, quiet: true });
    }
    return super.hit(dmg, knockX, knockY);
  }

  _shock(projectiles, dir, fire) {
    const C = CONFIG.aldric, footY = this.y + this.hh;
    const p = new Projectile(this.x + dir * this.hw * 0.7, footY - C.shockR, dir * C.shockSpeed, 0);
    p.setFamily("groundShock"); p.r = C.shockR; p.dmg = C.shockDmg; p.life = 2.0; p.owner = this;
    p.tint = fire ? CONFIG.colors.bomber : CONFIG.colors.charger; p.crownfire = !!fire;
    projectiles.push(p);
  }
  _lightFire(preservePattern) { startThroneFire(this, !!preservePattern); }
  _syncZones() { this.zones = this.fireZones.concat(this.seams); }
  onDeathStart() { clearThroneFire(this, true); this.seams = []; this._syncZones(); }

  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    const C = CONFIG.aldric;
    this._playerRef = player;
    this.facing = Math.sign(player.x - this.x) || this.facing;
    this._animWeapon(dt);
    const f = this.hp / this.maxHp;
    if (this.mode === "duel" && f < C.fireTier) {
      this.mode = "fire"; this.phaseTag = "THRONE BURNS"; this._lightFire();
      bossPhaseBeat(this, "THE THRONE BURNS", CONFIG.colors.bomber);
    }
    if (this.mode === "fire" && f < C.fakeTier && !this.faked) { this._enterDowned(); }
    tickThroneFire(this, dt);
    for (const z of this.seams) z.life -= dt;
    this.seams = this.seams.filter((z) => z.life > 0); this._syncZones();
    if (this.crown) {
      this.crown.vy += CONFIG.world.gravity * dt; this.crown.x += this.crown.vx * dt; this.crown.y += this.crown.vy * dt; this.crown.rot += this.crown.vx * dt * 0.018;
      const floor = CONFIG.world.groundY - 8;
      if (this.crown.y > floor) { this.crown.y = floor; this.crown.vy *= -0.25; this.crown.vx *= 0.86; }
    }

    if (this.introT > 0) { this.vx = 0; this.integrate(dt, platforms); return; }

    if (this.mode === "downed") {   // the kneel: strike, or stand witness
      this.vx = lerp(this.vx, 0, clamp(6 * dt, 0, 1));
      const regen = C.regenRate * (this.kneelStruck ? C.angerRegenMult : 1);
      this.hp = Math.min(this.reviveCap, this.hp + this.maxHp * regen * dt);
      this.kneelT -= dt;
      this.integrate(dt, platforms);
      if (this.kneelT <= 0) this.revive(!this.kneelStruck);
      return;
    }

    const spd = C.speed * (this.mode === "frenzy" ? 1.5 : (this.mode === "fire" ? 1.2 : 1));
    if (this.mode === "frenzy") {
      this.chargeT -= dt; this.crownfireCd -= dt; this.ghostT -= dt;
      if (this.ghostT <= 0) { this.ghostT = 0.11; FX.ghost(this.x, this.y, this.hw, this.hh, CONFIG.colors.bomber); }
      if (this.crownfireCd <= 0 && this.state === "idle") { this.state = "crownfire"; this.stateT = C.crownfireWindup; this.crownfireCd = C.crownfireCd; }
      else if (this.chargeT <= 0 && this.state === "idle") { this.state = "chargewind"; this.stateT = C.chargeWindup; this.chargeT = C.chargeCd / (this.anger ? 1.35 : 1); }
    }

    if (this.state === "crownfire") {
      this.stateT -= dt;
      const k = 1 - clamp(this.stateT / C.crownfireWindup, 0, 1), gy = CONFIG.world.groundY - this.hh;
      this.x = lerp(this.x, CONFIG.view.w / 2, clamp(6 * dt, 0, 1)); this.y = gy - Math.sin(k * Math.PI) * 190;
      if (this.stateT <= 0) {
        this.x = CONFIG.view.w / 2; this.y = gy; this._shock(projectiles, 1, true); this._shock(projectiles, -1, true);
        for (let i = 0; i < 7; i++) {
          const a = Math.PI + i / 6 * Math.PI, p = new Projectile(this.x, this.y - 35, Math.cos(a) * C.emberSpeed, Math.sin(a) * C.emberSpeed - 120);
          p.gravity = 520; p.dmg = C.emberDmg; p.r = 10; p.tint = CONFIG.colors.bomber; p.kind = "orb"; p.crownfire = true; p.owner = this; projectiles.push(p);
        }
        FX.explode(this.x, this.y + this.hh, CONFIG.colors.bomber, 1.35);
        bossFeedback(this, "contact", { banner: "CROWNFIRE", color: "#fff7d6", priority: 9, shake: 11, flash: 0.38, slowmo: 0.38, zoom: 0.065, cue: "aldricIgnite" });
        this.state = "recover"; this.stateT = 0.45;
      }
      return;
    }

    if (this.state === "chargewind") {            // plant, roar, telegraph the lane — then explode forward
      this.vx = lerp(this.vx, 0, clamp(9 * dt, 0, 1)); this.stateT -= dt;
      if (this.stateT <= 0) { this.state = "charge"; this.vx = this.facing * C.chargeSpeed; }
      this.integrate(dt, platforms);
      return;
    }
    if (this.state === "overheadwind") {          // OVERHEAD CLEAVER: rise, track the player, then plunge
      this.stateT -= dt;
      this.x = lerp(this.x, clamp(this.overTX, this.hw, CONFIG.view.w - this.hw), clamp(4 * dt, 0, 1));
      this.y = lerp(this.y, CONFIG.world.groundY - this.hh - 150, clamp(6 * dt, 0, 1)); this.onGround = false;
      if (this.stateT <= 0) { this.state = "overhead"; this.vy = 2500; }
      return;
    }
    if (this.state === "overhead") {
      this.y += this.vy * dt; this.vy += 2500 * dt;
      if (this.y >= CONFIG.world.groundY - this.hh) {
        this.y = CONFIG.world.groundY - this.hh; this.onGround = true;
        if (Math.abs(player.x - this.x) < C.overheadRange && !player.invulnerable) player.takeDamage(C.overheadDmg, this.x, this);
        this.seams.push({ kind: "seam", x: this.x, w: 110, life: C.seamLife, maxLife: C.seamLife, dir: this.facing, on: true, dmg: CONFIG.warden.zoneTick, tickCd: CONFIG.warden.zoneTickCd });
        FX.explode(this.x, this.y + this.hh, CONFIG.colors.bomber, 1.3); FX.shockwave(this.x, this.y + this.hh, 12, CONFIG.colors.bomber, 240, 6);
        bossFeedback(this, "contact", { banner: "OVERHEAD", color: CONFIG.colors.bomber, priority: 8, shake: 10, slowmo: 0.35, zoom: 0.05 });
        this.weaponImpactT = 0.24; this.weaponBuriedT = C.overheadRecover;
        this.state = "recover"; this.stateT = C.overheadRecover;
        if (typeof SFX !== "undefined" && SFX.aldricCleaverBury) SFX.aldricCleaverBury();
      }
      return;
    }
    if (this.state === "charge") {
      this.x += this.vx * dt;
      this.seamDropT -= dt;
      if (this.seamDropT <= 0) { this.seamDropT = 0.12; this.seams.push({ kind: "seam", x: this.x, w: 76, life: C.seamLife, maxLife: C.seamLife, dir: Math.sign(this.vx) || this.facing, on: true, dmg: CONFIG.warden.zoneTick, tickCd: CONFIG.warden.zoneTickCd }); }
      if (Math.random() < 16 * dt) FX.ember(this.x, CONFIG.world.groundY - 5, CONFIG.colors.bomber);
      if (this.x <= this.hw + 4 || this.x >= CONFIG.view.w - this.hw - 4) { this.state = "recover"; this.stateT = 0.7; }
      return;
    }
    if (this.state === "windup") {
      this.vx = lerp(this.vx, 0, clamp(9 * dt, 0, 1)); this.stateT -= dt;
      if (this.stateT <= 0) this._strike(player, projectiles);
    } else if (this.state === "lunge") {
      const bladePose = this.weaponGeometry();
      if (!this.weaponHitSpent && weaponHullHitsTarget(bladePose, player, 4)) {
        this.weaponHitSpent = true; if (!player.invulnerable) player.takeDamage(C.shockDmg, this.x, this);
      }
      this.weaponEmberT -= dt;
      if (this.mode !== "duel" && this.weaponEmberT <= 0) { this.weaponEmberT = 0.045; FX.ember(bladePose.tip.x, bladePose.tip.y, CONFIG.colors.bomber); }
      this.stateT -= dt; if (this.stateT <= 0) { this.state = "recover"; this.stateT = 0.35; }
    } else if (this.state === "recover") {
      this.vx = lerp(this.vx, 0, clamp(7 * dt, 0, 1)); this.stateT -= dt;
      if (this.stateT <= 0) {
        if (this.chainLeft > 0) { this.chainLeft--; this.state = "windup"; this.stateT = C.windup * 0.58; }
        else this.state = "idle";
      }
    } else {
      const dist = Math.abs(player.x - this.x);
      const duelDir = this.mode === "duel" && dist < 190 ? -this.facing : this.facing;
      this.vx = lerp(this.vx, duelDir * spd, clamp(4 * dt, 0, 1));
      this.overheadCd = (this.overheadCd || 0) - dt;
      // OVERHEAD CLEAVER — a committed vertical slam (fire/frenzy), his kingliest
      // blow; complements the horizontal lunges + arcs
      if (this.mode !== "duel" && this.overheadCd <= 0 && dist < 420 && this.onGround) {
        this.state = "overheadwind"; this.stateT = C.overheadWindup; this.overTX = player.x;
        this.overheadCd = C.overheadCd; perilPing(this);
      } else {
        this.atkT -= dt;
        if (this.atkT <= 0 && Math.abs(player.x - this.x) < 500) { this.state = "windup"; this.stateT = C.windup; }
      }
      // NO SHELTER: hover above the king and the pounce COMES — deterministic,
      // not a dice roll (tracks time-spent-above, leaps at the player)
      this.aboveT = (player.y < this.y - 60) ? (this.aboveT || 0) + dt : 0;
      if (this.onGround && this.aboveT > (C.pounceAfter || 1)) {
        this.vy = -1120; this.vx = (player.x - this.x) * 1.1; this.onGround = false; this.aboveT = 0;
      }
    }
    this.integrate(dt, platforms);
  }
  _strike(player, projectiles) {
    const C = CONFIG.aldric;
    // his kit is the CLEAVER now, not ground waves: in reach the lunge IS the
    // strike; out of reach he hurls burning CLEAVER ARCS (crescents — parry
    // food, i.e. rally fuel)
    if (Math.abs(this._playerRef ? this._playerRef.x - this.x : 999) > 235) {
      this._arc(projectiles, this.mode === "frenzy" ? 2 : 1);
    }
    this.state = "lunge"; this.stateT = 0.25; this.vx = this.facing * C.lungeSpeed; this.weaponHitSpent = false;
    if (this.mode === "fire" && this.chainLeft <= 0) this.chainLeft = 1;
    if (this.mode === "frenzy" && this.chainLeft <= 0) this.chainLeft = this.anger ? 2 : 1;
    this.atkT = C.atkCd / (this.mode === "frenzy" ? 1.7 : (this.mode === "fire" ? 1.25 : 1));
    if (typeof SFX !== "undefined" && SFX.aldricCleaverWhoosh) SFX.aldricCleaverWhoosh();
  }
  // a burning crescent thrown along the lunge line — arcs with gravity, fully
  // parryable/deflectable through the game's own projectile loop
  _arc(projectiles, n) {
    const C = CONFIG.aldric;
    for (let i = 0; i < n; i++) {
      const p = new Projectile(this.x + this.facing * 34, this.y - 24 - i * 16,
        this.facing * C.arcSpeed * (1 - i * 0.12), -C.arcRise - i * 70);
      p.crescent = true; p.kind = "crescent"; p.tint = CONFIG.colors.bomber;
      p.dmg = C.arcDmg; p.r = 24; p.gravity = C.arcGravity; p.deflectDmg = 30; p.owner = this;
      projectiles.push(p);
    }
    FX.ring(this.x + this.facing * 28, this.y - 20, 10, CONFIG.colors.bomber);
    try { SFX.crescent(); } catch (e) {}   // the cleaver tears the air
  }
  _enterDowned() {
    const C = CONFIG.aldric;
    this.mode = "downed"; this.state = "idle"; this.spawnAdds = false; this.kneelT = C.kneelDur; this.kneelStruck = false; this.anger = false;
    this.weaponReclaimT = 0; this.weaponBuriedT = 0; this.weaponAV = 0;
    this.reviveCap = this.maxHp * C.witnessReviveFrac; this.vx = 0; this.seams = []; clearThroneFire(this, true); this._syncZones();
    this.crown = { x: this.x + this.facing * 18, y: this.y - this.hh - 18, vx: this.facing * 330, vy: -420, rot: 0 };
    this.phaseTag = "THE KNEEL";
    bossPhaseBeat(this, "STRIKE — OR STAND WITNESS", CONFIG.colors.charger);
  }
  revive(witnessed) {
    this.mode = "frenzy"; this.faked = true; this.state = "idle"; this.atkT = 0.35; this.phaseTag = witnessed ? "WITNESSED" : "FRENZY";
    this.weaponReclaimT = 0.55; this.weaponAV = 0;
    this.chargeT = CONFIG.aldric.chargeCd * 0.45; this.crownfireCd = CONFIG.aldric.crownfireCd * 0.55;
    if (witnessed) { this.witnessEarned = true; this.hp = Math.min(this.hp, this.maxHp * CONFIG.aldric.witnessReviveFrac); }
    else { this.anger = true; this.hp = Math.max(this.hp, this.maxHp * CONFIG.aldric.angerReviveFrac); this.contactDmg *= CONFIG.aldric.angerDamageMult; }
    this._lightFire(true); bossPhaseBeat(this, witnessed ? "THE LAST CROWN RISES" : "THE BEAST AWAKES", CONFIG.colors.bomber);
  }
  _animWeapon(dt) {
    let wt = -0.6, k = 9;
    if (this.state === "overheadwind") { wt = -2.1; k = 12; }   // cleaver raised straight overhead
    else if (this.state === "overhead") { wt = 1.4; k = 34; }   // driven down on the plunge
    else if (this.state === "windup" || this.state === "chargewind") { wt = -1.5; k = 11; }
    else if (this.state === "lunge" || this.state === "charge") { wt = 0.8; k = 28; }
    else if (this.state === "recover" && this.weaponBuriedT > 0) { wt = 1.28; k = 18; }
    if (this.weaponImpactT > 0) { this.weaponImpactT = Math.max(0, this.weaponImpactT - dt); wt += Math.sin(this.weaponImpactT * 95) * this.weaponImpactT * 0.32; }
    if (this.weaponBuriedT > 0) this.weaponBuriedT = Math.max(0, this.weaponBuriedT - dt);
    if (this.weaponReclaimT > 0) this.weaponReclaimT = Math.max(0, this.weaponReclaimT - dt);
    this.weaponPrevA = this.weaponA; springWeapon(this, "weaponA", "weaponAV", wt, dt, 190 + k * 4, 18);
    this.debugGeometry = weaponDebugGeometry(this.weaponGeometry());
  }
  draw(ctx) {
    const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
    const downed = this.mode === "downed", frenzy = this.mode === "frenzy";
    ctx.save();
    if (this.dying) {
      ctx.translate(this.x, this.y + this.hh); ctx.scale(1, 1 - this.deathP * 0.38); ctx.translate(-this.x, -(this.y + this.hh));
    }
    // regen glow during the fake
    if (downed) {
      const pulse = 0.3 + 0.3 * Math.sin(CLOCK.sim * 1000 / 150);
      ctx.fillStyle = CONFIG.colors.charger; ctx.globalAlpha = pulse;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.hw + 14, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    if (frenzy) {   // burning aura
      ctx.fillStyle = CONFIG.colors.bomber; ctx.globalAlpha = 0.2 + 0.1 * Math.sin(CLOCK.sim * 1000 / 90);
      ctx.fillRect(x - 6, y - 6, w + 12, h + 12); ctx.globalAlpha = 1;
    }
    // A royal scarf/cape has its own restrained secondary motion: it lags the
    // king's velocity and snaps forward only on committed attacks.
    const capeLead = clamp(-this.vx * 0.035, -52, 52), capeLift = (this.state === "lunge" || this.state === "charge") ? -22 : 0;
    ctx.fillStyle = this.mode === "duel" ? "#74202b" : CONFIG.colors.bomber; ctx.globalAlpha = downed ? 0.35 : 0.82;
    ctx.beginPath(); ctx.moveTo(this.x - this.facing * this.hw * 0.55, y + 16);
    ctx.lineTo(this.x - this.facing * (this.hw + 34) + capeLead, y + h * 0.55 + capeLift + Math.sin(CLOCK.sim * 1000 / 140) * 5);
    ctx.lineTo(this.x - this.facing * (this.hw + 18) + capeLead * 0.6, y + h - 5); ctx.lineTo(this.x - this.facing * this.hw * 0.45, y + h - 18); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    // body — squat when downed
    const by = downed ? y + h * 0.3 : y, bh = downed ? h * 0.7 : h;
    ctx.fillStyle = this.flash > 0 ? "#fff" : (downed ? "#7a1320" : this.color);
    ctx.fillRect(x, by, w, bh);
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 4; ctx.strokeRect(x, by, w, bh);
    // eye
    ctx.fillStyle = "#fff"; ctx.fillRect(this.x + this.facing * 16 - 8, by + 14, 16, 11);
    // Royal Great-Cleaver: buried for the kneel, visibly reclaimed, never discarded in frenzy.
    const shoulderLead = (this.state === "windup" || this.state === "overheadwind" || this.state === "chargewind") ? -this.facing * 9 : 0;
    ctx.strokeStyle = downed ? "#6f3b40" : "#d0a35a"; ctx.lineWidth = 6; ctx.beginPath();
    ctx.moveTo(this.x - this.hw * 0.5 + shoulderLead, by + 28); ctx.lineTo(this.x + this.hw * 0.5 + shoulderLead, by + 28); ctx.stroke();
    const introP = this.introT > 0 ? clamp(1 - this.introT / ((CONFIG.bossTheater && CONFIG.bossTheater.introDur) || 1.4), 0, 1) : -1;
    const poseA = introP >= 0 ? lerp(-0.6, -1.75, Math.sin(introP * Math.PI)) : this.weaponA;
    const cleaverPose = this.weaponGeometry(poseA, introP >= 0 ? poseA : this.weaponPrevA);
    if (!downed && Math.abs(this.weaponA - this.weaponPrevA) > 0.04 && !(typeof GFX !== "undefined" && GFX.low)) {
      const sweep = cleaverPose.sweptAttackHull.segments[2]; ctx.strokeStyle = this.anger ? "#fff0b0" : CONFIG.colors.bomber;
      ctx.globalAlpha = 0.25; ctx.lineWidth = 30; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(sweep.a.x, sweep.a.y); ctx.lineTo(sweep.b.x, sweep.b.y); ctx.stroke(); ctx.globalAlpha = 1;
    }
    drawGreatCleaver(ctx, cleaverPose, this, downed);
    if (!downed && this.mode !== "duel" && (this.state === "lunge" || this.state === "charge" || this.state === "overhead") && !(typeof GFX !== "undefined" && GFX.low)) {
      const edge = cleaverPose.cuttingEdge;
      ctx.strokeStyle = CONFIG.colors.bomber; ctx.globalAlpha = 0.48; ctx.lineWidth = 13; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(edge.a.x, edge.a.y); ctx.lineTo(edge.b.x, edge.b.y); ctx.stroke();
      ctx.strokeStyle = "#fff7d6"; ctx.globalAlpha = 0.72; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
    }
    // frenzy charge telegraph: the lane he's about to barrel down
    if (this.state === "chargewind") {
      const k = 1 - clamp(this.stateT / (CONFIG.aldric.chargeWindup || 0.5), 0, 1);
      chargeTelegraph(ctx, this.x, this.y, this.hh, this.facing, k, CONFIG.colors.charger);
      weaponGlint(ctx, cleaverPose.tip.x, cleaverPose.tip.y, CONFIG.colors.charger, k);
    }
    if (this.state === "crownfire") {
      const k = 1 - clamp(this.stateT / CONFIG.aldric.crownfireWindup, 0, 1);
      dangerColumn(ctx, CONFIG.view.w / 2, 160, 30, CONFIG.world.groundY, CONFIG.colors.bomber, k);
    }
    if (this.state === "overheadwind") {   // OVERHEAD CLEAVER: the kill-column tracks the raised blade
      const k = 1 - clamp(this.stateT / CONFIG.aldric.overheadWindup, 0, 1);
      dangerColumn(ctx, this.x, CONFIG.aldric.overheadRange * 2, this.y + this.hh, CONFIG.world.groundY, CONFIG.colors.bomber, k);
      weaponGlint(ctx, cleaverPose.tip.x, cleaverPose.tip.y, CONFIG.colors.bomber, k); drawPeril(ctx, this);
    }
    if (this.mode === "downed") UI.tag(ctx, "STRIKE — OR STAND WITNESS.", this.x, this.y - this.hh - 38,
      this.kneelStruck ? CONFIG.colors.charger : CONFIG.colors.bomber, "center", UI.t.type.caption);
    if (this.crown) {
      ctx.save(); ctx.translate(this.crown.x, this.crown.y); ctx.rotate(this.crown.rot); ctx.strokeStyle = CONFIG.colors.bomber; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-13, 7); ctx.lineTo(-9, -8); ctx.lineTo(0, 1); ctx.lineTo(9, -8); ctx.lineTo(13, 7); ctx.closePath(); ctx.stroke(); ctx.restore();
    }
    drawPeril(ctx, this);
    ctx.restore();
  }
}

// ---- The Echo (Stage 4 boss): your own silhouette — mirrors your last trick -> splits -> goes invisible ----
class Echo extends Enemy {
  constructor(x, y, isClone) {
    super(x, y, CONFIG.echo);
    this.color = "#000";
    this.kind = "boss"; this.isBoss = !isClone; this.bossName = "THE ECHO";
    this.presentationId = "echo";
    this.isClone = !!isClone;
    this.mode = "mirror"; this.state = "idle"; this.stateT = 0; this.facing = 1;
    this.seenTrickT = 0; this.copyKind = "hit"; this.copyT = -1; this.lastCopied = "";
    this.phaseMarker = 1; this.spawnClone = false;
    this.whiteFlash = 0; this.invisT = CONFIG.echo.invisCycle; this.lungeCd = 1.3;
    this.copyOffset = isClone ? 1.7 : 1;   // the clone mirrors on a longer, offset delay
    this.harmonyLockT = 0; this.edgeTrail = [];
    if (isClone) { this.hp *= 0.5; this.maxHp = this.hp; this.hpDisplay = this.hp; }
  }
  get phase() { const f = this.hp / this.maxHp; return f > 0.6 ? 1 : (f > 0.25 ? 2 : 3); }
  _shock(projectiles, dir) {
    const C = CONFIG.echo, footY = this.y + this.hh;
    const p = new Projectile(this.x + dir * this.hw, footY - 12, dir * C.shockSpeed, 0);
    p.setFamily("groundShock"); p.r = 14; p.dmg = C.shockDmg; p.life = 1.6; projectiles.push(p);
  }
  _shot(player, projectiles) {
    const C = CONFIG.echo, dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
    const p = new Projectile(this.x, this.y, (dx / m) * C.projSpeed, (dy / m) * C.projSpeed); p.dmg = C.projDmg; p.r = 10; p.tint = this.color; projectiles.push(p);
  }
  _scheduleFrom(player) {   // a new trick from the player queues a copy (faster if you repeat yourself)
    if (player.lastTrickT > this.seenTrickT) {
      const repeat = player.lastTrickKind === this.lastCopied;
      this.seenTrickT = player.lastTrickT; this.copyKind = player.lastTrickKind;
      this.copyT = CONFIG.echo.copyDelay * this.copyOffset * (repeat ? 0.5 : 1);
      if (repeat && !this.isClone) {
        this.harmonyLockT = 0.75;
        FX.ring(CONFIG.view.w / 2, CONFIG.world.groundY - 4, 18, CONFIG.colors.eye);
        bossFeedback(this, "windup", { quiet: true, priority: 4 });
      }
    }
  }
  _doCopy(player, projectiles) {
    const k = this.copyKind, dir = Math.sign(player.x - this.x) || this.facing;
    this.lastCopied = k;
    if (k === "throwHit" || k === "parry" || k === "deflect") { this._shot(player, projectiles); this.state = "recover"; this.stateT = 0.4; }
    else if (k === "slam" || k === "superslam" || k === "spike") { this._shock(projectiles, 1); this._shock(projectiles, -1); this.state = "recover"; this.stateT = 0.5; }
    else if (k === "updraft" || k === "launch") { this.state = "lunge"; this.stateT = 0.3; this.vx = dir * 560; this.vy = -720; }
    else { this.state = "lunge"; this.stateT = 0.24; this.vx = dir * 920; }   // hit / default melee dash
    if (!this.isClone) bossFeedback(this, "launch", { quiet: true });
  }
  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    if (this.harmonyLockT > 0) this.harmonyLockT = Math.max(0, this.harmonyLockT - dt);
    this.edgeTrail.push({ x: this.x, y: this.y, t: 0.2 }); if (this.edgeTrail.length > 5) this.edgeTrail.shift();
    for (const g of this.edgeTrail) g.t -= dt; this.edgeTrail = this.edgeTrail.filter((g) => g.t > 0);
    this.facing = Math.sign(player.x - this.x) || this.facing;
    if (!this.isClone) {
      const ph = this.phase;
      if (ph !== this.phaseMarker) {
        if (ph === 2) this.spawnClone = true;
        if (ph === 3) this.mode = "invert";
        this.phaseMarker = ph;
        bossFeedback(this, "phaseTransition", { banner: ph === 2 ? "A SECOND VOICE" : "HARMONY INVERTED", color: CONFIG.colors.eye });
      }
    }
    if (this.mode === "invert") { this._invert(dt, player, projectiles); return; }

    // ---- mirror mode (phases 1-2) ----
    this._scheduleFrom(player);
    if (this.copyT > 0) { this.copyT -= dt; if (this.copyT <= 0) this._doCopy(player, projectiles); }
    if (this.state === "lunge") { this.stateT -= dt; if (this.stateT <= 0) { this.state = "recover"; this.stateT = 0.3; } }
    else if (this.state === "recover") { this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1)); this.stateT -= dt; if (this.stateT <= 0) this.state = "idle"; }
    else { const targetX = player.x - this.facing * (this.isClone ? 260 : 200); this.vx = lerp(this.vx, (targetX - this.x) * 2, clamp(3 * dt, 0, 1)); }
    this.integrate(dt, platforms);
  }
  _invert(dt, player, projectiles) {
    const C = CONFIG.echo;
    this.invisT -= dt;
    if (this.invisT <= 0) {
      if (this.whiteFlash < 0.5) { this.whiteFlash = 1; this.invisT = C.invisDur; }   // blinding white-out -> nearly invisible
      else { this.whiteFlash = 0; this.invisT = C.invisCycle; }
    }
    if (this.state === "aim") {                  // lock a spot + flash a line, THEN dive (so it never just appears on you)
      this.aimT -= dt;
      this.vx = lerp(this.vx, 0, clamp(7 * dt, 0, 1)); this.vy = lerp(this.vy, 0, clamp(7 * dt, 0, 1));
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.aimT <= 0) {
        this.state = "lunge"; this.stateT = 0.34;
        const m = len(this.diveTX - this.x, this.diveTY - this.y) || 1;
        this.vx = (this.diveTX - this.x) / m * C.lungeSpeed; this.vy = (this.diveTY - this.y) / m * C.lungeSpeed;
      }
    } else if (this.state === "lunge") {
      this.x += this.vx * dt; this.y += this.vy * dt; this.stateT -= dt;
      if (this.stateT <= 0) { this.state = "idle"; this.lungeCd = 0.9 + Math.random() * 0.6; }
    } else {
      const tx = player.x, ty = player.y - 90;   // drift above/around you, then commit a dive
      this.vx = lerp(this.vx, (tx - this.x) * 1.6, clamp(2 * dt, 0, 1));
      this.vy = lerp(this.vy, (ty - this.y) * 1.6, clamp(2 * dt, 0, 1));
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.lungeCd -= dt;
      if (this.lungeCd <= 0 && Math.abs(player.x - this.x) < 820) {
        this.state = "aim"; this.aimT = 0.32; this.diveTX = player.x; this.diveTY = player.y;
      }
    }
    this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
    this.y = clamp(this.y, 50, CONFIG.world.groundY - this.hh);
    this.onGround = false;
  }
  draw(ctx) {
    const x = this.x - this.hw, y = this.y - this.hh, w = this.hw * 2, h = this.hh * 2;
    // Cleaner mirrored trails: phase-specific outlines, not a cloud of particles.
    for (let i = 0; i < this.edgeTrail.length; i++) {
      const g = this.edgeTrail[i], a = g.t / 0.2;
      ctx.globalAlpha = a * (this.phase === 1 ? 0.08 : this.phase === 2 ? 0.13 : 0.2);
      ctx.strokeStyle = this.phase === 3 ? CONFIG.colors.perfect : CONFIG.colors.eye; ctx.lineWidth = this.phase;
      ctx.strokeRect(g.x - this.hw, g.y - this.hh, w, h);
    }
    ctx.globalAlpha = 1 - this.whiteFlash * 0.88;   // near-invisible during a white-out
    // your silhouette + cyan visor + a faint blade
    ctx.fillStyle = this.flash > 0 ? "#fff" : (this.isClone ? "#3a3a3a" : THEME.ink);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = CONFIG.colors.eye; ctx.fillRect(this.x + this.facing * 5 - 4, y + 12, 8, 5);
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.facing * 22, this.y - 26); ctx.stroke();
    ctx.strokeStyle = this.phase === 1 ? CONFIG.colors.eye : (this.phase === 2 ? "#b06cff" : CONFIG.colors.perfect);
    ctx.lineWidth = this.harmonyLockT > 0 ? 4 : 2; ctx.setLineDash(this.phase === 2 ? [7, 5] : (this.phase === 3 ? [3, 4] : []));
    ctx.strokeRect(x - this.phase * 3, y - this.phase * 3, w + this.phase * 6, h + this.phase * 6); ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // dive telegraph — always visible (even mid white-out) so the dive is readable
    if (this.state === "aim") {
      const k = 1 - clamp(this.aimT / 0.32, 0, 1);
      ctx.strokeStyle = CONFIG.colors.eye; ctx.globalAlpha = 0.5 + 0.4 * k; ctx.lineWidth = 2 + 3 * k; ctx.setLineDash([9, 7]); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.diveTX, this.diveTY); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(this.diveTX, this.diveTY, 18 - 9 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this.drawHpBar(ctx);
  }
}

// Void-run utility add: a launchable air target and a restrained lane-pressure
// pass. It remains a juggle foothold, but the thin captured-line tell prevents an
// upper route from becoming permanent shelter.
class VoidWisp extends Enemy {
  constructor(x, y) {
    super(x, y, { w: 38, h: 38, hp: 85, speed: 105, contactDmg: CONFIG.source.voidWispDmg, knockbackTaken: 14, weight: 0.65 });
    this.kind = "wisp"; this.color = CONFIG.colors.perfect; this.noScore = true; this.isVoidWisp = true;
    this.baseY = y; this.life = 9; this.voidLane = "upper";
    this.passState = "hover"; this.passCd = 0.9; this.passT = 0; this.passY = y; this.passContactSpent = true;
  }
  contactDamageEnabled() { return this.passState === "pass" && !this.passContactSpent; }
  onContactDamage() { if (this.passState === "pass") this.passContactSpent = true; }
  update(dt, platforms, player) {
    this.tickTimers(dt); this.life -= dt;
    const C = CONFIG.source;
    if (this.passState === "tell") {
      this.passT -= dt;
      this.vx = lerp(this.vx, 0, clamp(9 * dt, 0, 1));
      this.vy = lerp(this.vy, (this.passY - this.y) * 2.5, clamp(4 * dt, 0, 1));
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.passT <= 0) {
        this.passState = "pass"; this.passT = C.voidWispPassTime; this.passContactSpent = false;
        this.vx = -C.voidWispPassSpeed; this.vy = (this.passY - this.y) / Math.max(0.25, C.voidWispPassTime * 0.45);
      }
    } else if (this.passState === "pass") {
      this.passT -= dt; this.x += this.vx * dt; this.y += this.vy * dt;
      this.vy = lerp(this.vy, (this.passY - this.y) * 4.2, clamp(5 * dt, 0, 1));
      if (this.passT <= 0) { this.passState = "hover"; this.passCd = 1.4; this.passContactSpent = true; this.baseY = this.y; }
    } else {
      this.passCd -= dt;
      this.vx = lerp(this.vx, -C.scrollSpeed * 0.42, clamp(1.6 * dt, 0, 1));
      this.vy += CONFIG.world.gravity * 0.22 * dt;
      this.vy = lerp(this.vy, (this.baseY + Math.sin(this.aliveT * 2.2) * 55 - this.y) * 2.1, clamp(1.3 * dt, 0, 1));
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.passCd <= 0 && player && player.voidLane === this.voidLane && player.voidTransferT <= 0) {
        this.passState = "tell"; this.passT = C.voidWispTell; this.passY = player.y; this.passContactSpent = true;
      }
    }
    if (this.x < -80 || this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    const p = 0.65 + 0.35 * Math.sin(CLOCK.sim * 1000 / 120 + this.x * 0.01);
    if (this.passState === "tell") {
      const k = 1 - clamp(this.passT / CONFIG.source.voidWispTell, 0, 1);
      ctx.save(); ctx.strokeStyle = this.color; ctx.globalAlpha = 0.4 + 0.45 * k; ctx.lineWidth = 2.5; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(-40, this.passY); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(this.x, this.y, this.hw * (1.4 - k * 0.35), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.hw * 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = p; ctx.strokeStyle = this.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(this.x, this.y, this.hw * 0.7, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.8; ctx.fillStyle = "#fff"; ctx.fillRect(this.x - 4, this.y - 4, 8, 8); ctx.restore();
    this.drawHpBar(ctx);
  }
}

// ---- The Source (Stage 5 FINAL boss): cycles every fallen boss's mechanic, collapses
//      the floor, fakes its death, then erupts into a true form. Reuses the boss-zone
//      hazard system + the generic fake-death-adds-revive handler in game.js. ----
class Source extends Enemy {
  constructor(x, y) {
    super(x, y, CONFIG.source);
    this.color = "#8b3bd6"; this.kind = "boss"; this.isBoss = true; this.bossName = "THE SOURCE";
    this._noBar = true;   // the final boss speaks through the authored HUD, never a second head bar
    this.presentationId = "source";
    this.epithet = "THE TEAR ITSELF"; this.phaseMarks = [CONFIG.source.voidTier, CONFIG.source.fakeTier]; this.phaseTag = "THE CYCLE";
    this.mode = "cycle"; this.atkT = 2.2; this.castIdx = 0; this.facing = 1;
    this.zones = []; this.fireZones = []; this.zoneColor = CONFIG.colors.bomber; this.zoneCycleT = 0;
    this.firePattern = 0; this.fireState = "idle"; this.fireClock = 0; this.fireWarnStep = -1;
    this.collapsing = false; this.collapseT = 0; this.phaseMarker = 1; this.requestVoid = false; this.requestVoidCinematic = false; this.freezeVoid = false;
    this.thawVoid = false; this.voidDelayT = -1; this.downT = -1;   // phase-2 shatter countdown + the kneel clock
    this.seenTrickT = 0; this.copyKind = "hit"; this.copyT = -1; this.lastCopied = ""; this.copyOffset = 1;
    this.echoCaption = ""; this.captionT = 0; this.bladeCaught = false;
    this.beamState = "idle"; this.beamT = 0; this.beamCd = CONFIG.source.beamCd; this.beamX = CONFIG.view.w + 100;
    // physical kit: a flash-charge and a converging shard drop
    this.dashState = "idle"; this.dashT = 0; this.dashCd = CONFIG.source.dashCd; this.dashTX = 0; this.dashTY = 0; this.dashDX = 0; this.dashDY = 0; this.dashGhosts = [];
    this.collapseState = "idle"; this.collapseWT = 0; this.riftCollapseCd = CONFIG.source.riftCollapseCd;
    this._burstN = 0; this._burstT = 0;
    // SOFT BREACH locomotion is deliberately separate from RIFT DASH. Its line
    // is captured once, and recoil owns movement long enough for a blade counter
    // to create real space instead of being erased by the normal hover steering.
    this.breachState = "follow"; this.breachCd = this._rollBreachCd();
    this.breachT = 0; this.breachMaxT = 0; this.breachSpeed = 0;
    this.breachDX = 1; this.breachDY = 0;
    this.breachCommitX = x; this.breachCommitY = y;
    this.breachDestX = x; this.breachDestY = y;
    this.breachStartX = x; this.breachStartY = y;
    this.breachLane = null;
    this.breachContactSpent = false; this.breachRepelGraceT = 0;
    this.breachRecoilVX = 0; this.breachRecoilVY = 0;
    this.breachNudgeVX = 0; this.breachNudgeVY = 0; this.breachRipple = 0;
    // PREDATORY ORBIT: ordinary locomotion changes side, height and reach instead
    // of converging on one forever-safe point just above the player's blade.
    this.predatorDecisionT = 0; this.predatorEngageT = 0;
    this.predatorSide = Math.random() < 0.5 ? -1 : 1;
    this.predatorDist = CONFIG.source.predatorStalkMin;
    this.predatorY = CONFIG.source.predatorYMin;
    this.formScale = 1; this.voidFormAwake = false;
  }
  get phase() { const f = this.hp / this.maxHp, C = CONFIG.source; return f > C.voidTier ? 1 : (f > C.fakeTier ? 2 : 3); }
  damageTakenMult() { return this.mode === "downed" ? 0.3 : (this.mode === "void" ? CONFIG.source.voidDamageTaken : 1); }
  _voidDmg(dmg) { return this.mode === "void" ? dmg * CONFIG.source.voidDamageMult : dmg; }
  _awakenVoidForm() {
    if (this.voidFormAwake) return;
    this.voidFormAwake = true;
    this.weight = this.cfg.weight * CONFIG.source.voidWeightMult;
    this.phaseTag = "THE VOID RUN";
  }
  beginVoidRun() {
    this.mode = "void"; this.collapsing = false; this.voidDelayT = -1;
    this.requestVoid = false; this.requestVoidCinematic = false; this._awakenVoidForm();
    bossFeedback(this, "phaseTransition", { banner: "THE VOID RUN", color: this.color, zoom: 0.06 });
  }
  // Preserve the authored phase turns against a single late-run burst without
  // deleting the player's damage: part of the overflow crosses the line, capped
  // far above the next phase gate so every form still gets to act.
  limitIncomingDamage(dmg) {
    const C = CONFIG.source, gate = this.phase === 1 ? C.voidTier : (this.phase === 2 ? C.fakeTier : 0);
    const gateHp = this.maxHp * gate;
    if (gate > 0 && this.mode !== "downed" && this.hp > gateHp && this.hp - dmg < gateHp) {
      const toGate = this.hp - gateHp, overflow = Math.max(0, dmg - toGate);
      dmg = toGate + Math.min(overflow * C.phaseOverflowCarry, this.maxHp * C.phaseOverflowCap);
    }
    return dmg;
  }

  _rollBreachCd() {
    const C = CONFIG.source;
    return C.breachIntervalMin + Math.random() * (C.breachIntervalMax - C.breachIntervalMin);
  }
  _softBreachBlocked(player) {
    const locomotionMode = this.mode === "cycle" || this.mode === "void";
    const voidTransfer = this.mode === "void" && (!player || !player.voidLane || !player.supportPlatform || player.voidTransferT > 0);
    return !locomotionMode || voidTransfer || this.collapsing || this.voidDelayT > 0 ||
      this.beamState !== "idle" || this.dashState !== "idle" || this.collapseState !== "idle" ||
      this.introT > 0 || this.dead || this.dying || this.breachRepelGraceT > 0 ||
      !!(player && player.voidSlowT > 0);   // a rescue/forced connector is never a breach window
  }
  _cancelSoftBreach(extraCd) {
    if (this.breachState !== "follow") {
      this.breachState = "follow"; this.breachT = 0; this.breachContactSpent = true;
      this.breachRecoilVX = 0; this.breachRecoilVY = 0;
    }
    this.breachLane = null;
    this.breachCd = Math.max(this.breachCd, extraCd || 0);
  }
  _startSoftBreach(player) {
    const C = CONFIG.source;
    let dx = player.x - this.x, dy = player.y - this.y, d = len(dx, dy) || 1;
    dx /= d; dy /= d;
    const beyond = C.breachPassMin + Math.random() * (C.breachPassMax - C.breachPassMin);
    this.breachSpeed = C.breachSpeedMin + Math.random() * (C.breachSpeedMax - C.breachSpeedMin);
    this.breachDX = dx; this.breachDY = dy;
    this.breachCommitX = player.x; this.breachCommitY = player.y;
    this.breachLane = this.mode === "void" ? player.voidLane : null;
    this.breachDestX = player.x + dx * beyond; this.breachDestY = player.y + dy * beyond;
    this.breachStartX = this.x; this.breachStartY = this.y;
    this.breachState = "tell";
    this.breachT = C.breachTellMin + Math.random() * (C.breachTellMax - C.breachTellMin);
    this.breachMaxT = this.breachT;
    this.breachContactSpent = false; this.vx = 0; this.vy = 0;
    this.predatorEngageT = 0;
    FX.ring(this.x, this.y, 12, this.color);
    bossFeedback(this, "windup", { quiet: true });
  }
  _finishSoftBreach() {
    this.breachState = "follow"; this.breachT = 0; this.breachContactSpent = true;
    this.breachRecoilVX = 0; this.breachRecoilVY = 0;
    this.breachLane = null;
    this.breachCd = this._rollBreachCd();
    this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
    this.y = clamp(this.y, 70, CONFIG.world.groundY - this.hh);
  }
  _applyBreachNudge(dt) {
    if (Math.abs(this.breachNudgeVX) + Math.abs(this.breachNudgeVY) < 0.1) {
      this.breachNudgeVX = 0; this.breachNudgeVY = 0; return;
    }
    this.x += this.breachNudgeVX * dt; this.y += this.breachNudgeVY * dt;
    const damp = Math.exp(-16 * dt);
    this.breachNudgeVX *= damp; this.breachNudgeVY *= damp;
  }
  _tickSoftBreach(dt) {
    const C = CONFIG.source;
    if (this.breachState === "tell") {
      this.breachT -= dt;
      this.vx = lerp(this.vx, 0, clamp(10 * dt, 0, 1)); this.vy = lerp(this.vy, 0, clamp(10 * dt, 0, 1));
      this._applyBreachNudge(dt);
      if (this.breachT <= 0) {
        const travel = len(this.breachDestX - this.x, this.breachDestY - this.y);
        this.breachState = "drift";
        this.breachT = Math.min(C.breachMaxDur, travel / this.breachSpeed + 1 / 60);
        this.breachMaxT = this.breachT;
      }
      return;
    }
    if (this.breachState === "drift") {
      this.breachT -= dt;
      this.vx = this.breachDX * this.breachSpeed; this.vy = this.breachDY * this.breachSpeed;
      this.x += this.vx * dt; this.y += this.vy * dt; this._applyBreachNudge(dt);
      const remain = (this.breachDestX - this.x) * this.breachDX + (this.breachDestY - this.y) * this.breachDY;
      if (remain <= 0 || this.breachT <= 0) this._finishSoftBreach();
      return;
    }
    if (this.breachState === "recoil") {
      this.breachT -= dt;
      this.x += this.breachRecoilVX * dt; this.y += this.breachRecoilVY * dt; this._applyBreachNudge(dt);
      const damp = Math.exp(-C.breachRecoilDrag * dt);
      this.breachRecoilVX *= damp; this.breachRecoilVY *= damp;
      this.vx = this.breachRecoilVX; this.vy = this.breachRecoilVY;
      this.x = clamp(this.x, -this.hw, CONFIG.view.w + this.hw);
      this.y = clamp(this.y, 50, CONFIG.world.groundY - this.hh);
      if (this.breachT <= 0) this._finishSoftBreach();
    }
  }

  contactDamageEnabled() {
    if (this.breachState === "tell" || this.breachState === "recoil") return false;
    if (this.breachState === "drift") return !this.breachContactSpent;
    return true;
  }
  contactDamageAmount() { return this._voidDmg(this.breachState === "drift" ? CONFIG.source.breachDmg : this.contactDmg); }
  onContactDamage() { if (this.breachState === "drift") this.breachContactSpent = true; }

  onBladeImpulse(hit) {
    if (!hit || !hit.held) return { handled: false };
    const C = CONFIG.source, speed = hit.tipSpeed || len(hit.tipVX || 0, hit.tipVY || 0);
    const m = len(hit.tipVX || 0, hit.tipVY || 0) || 1;
    const nx = (hit.tipVX || 0) / m, ny = (hit.tipVY || 0) / m;
    // Authored attacks retain authority: a body hit may deal damage, but cannot
    // cancel the high-threat dash/collapse, a beam, the kneel, or the Void Run.
    const locomotionMode = this.mode === "cycle" || this.mode === "void";
    const immune = !locomotionMode || this.collapsing || this.voidDelayT > 0 ||
      this.beamState !== "idle" || this.dashState !== "idle" || this.collapseState !== "idle" ||
      this.introT > 0 || this.dead || this.dying;
    if (immune) return { handled: true, immune: true };

    if (speed >= C.breachRepelMinSpeed && this.breachRepelGraceT <= 0 && this.breachState !== "recoil") {
      const k = clamp((speed - C.breachRepelMinSpeed) / 2600, 0, 1);
      const force = lerp(C.breachRepelVMin, C.breachRepelVMax, k);
      this.breachState = "recoil";
      this.breachT = C.breachSteerLockMin + Math.random() * (C.breachSteerLockMax - C.breachSteerLockMin);
      this.breachMaxT = this.breachT;
      this.breachDX = nx; this.breachDY = ny;
      this.breachLane = this.mode === "void" && hit.player ? hit.player.voidLane : null;
      this.breachRecoilVX = nx * force; this.breachRecoilVY = ny * force;
      this.breachContactSpent = true; this.breachRepelGraceT = C.breachRepelGrace; this.breachRipple = 1;
      FX.burst(this.x, this.y, nx, ny, 10, this.color); FX.ring(this.x, this.y, 16, CONFIG.colors.perfect);
      bossFeedback(this, "counter", { color: CONFIG.colors.perfect, quiet: true });
      return { handled: true, repelled: true, force };
    }

    // Weak or grace-window cuts only add a capped physical nudge. They never
    // reset a tell/recoil timer, so rapid taps cannot hold the boss indefinitely.
    let weakNX = nx, weakNY = ny;
    if (this.breachState === "tell" || this.breachState === "drift") {
      // Keep the authored crossover line through the captured player point. A
      // weak graze may advance/retard it, but only a committed cut can knock it
      // off that line and cancel the breach outright.
      const along = nx * this.breachDX + ny * this.breachDY;
      weakNX = this.breachDX * along; weakNY = this.breachDY * along;
    }
    this.breachNudgeVX += weakNX * C.breachWeakNudge; this.breachNudgeVY += weakNY * C.breachWeakNudge;
    const nm = len(this.breachNudgeVX, this.breachNudgeVY);
    if (nm > C.breachWeakNudgeCap) {
      this.breachNudgeVX *= C.breachWeakNudgeCap / nm; this.breachNudgeVY *= C.breachWeakNudgeCap / nm;
    }
    return { handled: true, nudged: true };
  }
  _deathLocked() { return this.mode === "downed"; }   // the kneel cannot be a kill

  _shot(player, projectiles, tint, motif) {
    const C = CONFIG.source, dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
    const drift = this.mode === "void" ? -C.scrollSpeed * 0.32 : 0;
    const p = new Projectile(this.x, this.y, (dx / m) * C.shockSpeed + drift, (dy / m) * C.shockSpeed);
    p.dmg = this._voidDmg(C.shockDmg); p.r = 11; p.tint = tint || this.color; p.owner = this; p.sourceStolen = motif || "echo"; projectiles.push(p);
  }
  _shock(projectiles, dir, footY, tint, surface) {
    const C = CONFIG.source, surfaceY = surface ? surface.y : (footY || CONFIG.world.groundY);
    const fy = surfaceY - C.shockR;
    const sx = surface ? clamp(this.x + dir * this.hw, surface.x + C.shockR, surface.x + surface.w - C.shockR) : this.x + dir * this.hw;
    const p = new Projectile(sx, fy, dir * C.shockSpeed, 0);
    p.setFamily("groundShock"); p.r = C.shockR; p.dmg = this._voidDmg(C.shockDmg); p.life = 2.0; p.owner = this; p.tint = tint || CONFIG.colors.boss; projectiles.push(p);
    if (surface) {
      p.surfacePlatformId = surface.platformId; p.surfaceLeft = surface.x; p.surfaceRight = surface.x + surface.w; p.surfaceY = surface.y;
    }
  }
  _sweeper(projectiles, tint) {
    const C = CONFIG.source;
    const active = projectiles.find((shot) => shot && !shot.dead && shot.family === "sweeper" && shot.owner === this);
    if (active) return active;
    const p = new Projectile(this.x, Math.min(CONFIG.world.groundY - 24, this.y + 90), -C.sweeperSpeed, 0);
    p.sweeperStyle = "shard"; p.setFamily("sweeper").configureSweeper({ passes: C.sweeperCrossings, integrity: C.sweeperIntegrity,
      maxLife: C.sweeperMaxLife, embeddedLife: C.sweeperEmbedDur });
    p.r = 22; p.dmg = this._voidDmg(C.sweeperDmg); p.owner = this; p.tint = "#6ef2ff";
    p.onCountered = (shot) => this.onSweeperReturned(shot); projectiles.push(p);
    FX.ring(this.x, this.y, 18, this.color);
    return p;
  }
  onSweeperReturned(p) {
    const perfect = !!(p && p.perfect);
    // A returned memory does not become generic damage: it breaks the copied
    // sequence itself and buys a readable gap before the next stolen move.
    this.copyT = -1; this._burstN = 0;
    this.atkT = Math.max(this.atkT, CONFIG.source.cycleCd * (perfect ? 1.6 : 1.25));
    this.stun = Math.max(this.stun, perfect ? 0.55 : 0.32); this.breachRipple = 1;
    this.echoCaption = perfect ? "MEMORY COLLAPSED" : "MEMORY FRACTURES"; this.captionT = perfect ? 1.7 : 1.2;
    FX.ring(this.x, this.y, perfect ? 30 : 20, "#6ef2ff"); FX.burst(this.x, this.y, 0, -1, perfect ? 15 : 9, "#d65cff");
    bossFeedback(this, perfect ? "stagger" : "counter", { banner: perfect ? "MEMORY COLLAPSED" : "MEMORY FRACTURED", color: perfect ? "#ffffff" : "#6ef2ff",
      priority: perfect ? 9 : 7, slowmo: perfect ? 0.38 : 0, zoom: perfect ? 0.08 : 0.035, quiet: !perfect });
  }
  _cross(projectiles, motif) {
    const C = CONFIG.source;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      const p = new Projectile(this.x, this.y, dx * C.crossSpeed, dy * C.crossSpeed); p.dmg = this._voidDmg(C.crossDmg); p.r = 11; p.tint = this.color; p.owner = this; p.sourceStolen = motif || "source"; projectiles.push(p);
    }
    FX.ring(this.x, this.y, 16, this.color);
  }
  _lightFire() {
    if (this.mode !== "cycle" || this.collapsing || this.voidDelayT > 0) return;
    if (!this.fireZones.length) startThroneFire(this, false);
  }
  // Echo-style mirror: copy the player's last trick as a void attack
  _scheduleFrom(player) {
    if (player.lastTrickT > this.seenTrickT) {
      const repeat = player.lastTrickKind === this.lastCopied;
      this.seenTrickT = player.lastTrickT; this.copyKind = player.lastTrickKind;
      this.copyT = CONFIG.source.copyDelay * (repeat ? 0.5 : 1);
    }
  }
  _doCopy(player, projectiles, platforms) {
    const k = this.copyKind, groundCopy = k === "slam" || k === "superslam" || k === "spike";
    if (groundCopy) {
      let support = player.supportPlatform || null;
      if (!support && this.mode === "void" && platforms) support = platforms.find((p) => p.void && p.oneway &&
        Math.abs(player.y + player.hh - p.y) < 8 && player.x + player.hw > p.x && player.x - player.hw < p.x + p.w) || null;
      if (this.mode === "void" && !support) { this.copyT = 0.12; return false; }
      this.lastCopied = k;
      this._shock(projectiles, 1, support ? support.y : null, this.color, support);
      this._shock(projectiles, -1, support ? support.y : null, this.color, support);
    } else { this.lastCopied = k; this._shot(player, projectiles, this.color); }
    const label = ({ superslam: "SLAM", throwHit: "THROW", updraft: "UPDRAFT", launch: "LAUNCH" })[k] || (k || "CUT").toUpperCase();
    this.echoCaption = "IT LEARNED YOUR " + label; this.captionT = 1.4;
    FX.ring(this.x, this.y, 13, this.color);
    return true;
  }
  _cast(projectiles, count) {
    const picks = ["warden", "colossus", "aldric"];
    for (let i = 0; i < count; i++) {
      const m = picks[(this.castIdx++) % picks.length];
      if (m === "warden") {
        // quotes the NEW kit: the baton string's rhythm as a three-count burst
        this._burstN = 3; this._burstT = 0; this._burstMotif = "warden";
        this.echoCaption = "ECHO OF THE WARDEN…";
      } else if (m === "colossus") {
        this._sweeper(projectiles, CONFIG.colors.armoredShield); this.echoCaption = "ECHO OF THE COLOSSUS…";
      } else {
        // over the void there's no ground for the fire checkerboard — the Aldric
        // echo becomes a downward shard fan instead
        if (this.mode === "void") this._cross(projectiles, "aldric");
        else this._lightFire();
        this.echoCaption = "ECHO OF ALDRIC…";
      }
      this.captionT = 1.25;
    }
    if (this.mode === "void") this._cross(projectiles, "source");
    FX.ring(this.x, this.y, 20, this.color);
  }
  // RIFT DASH — a telegraphed flash-charge along a line locked to the player.
  // A chromatic blink (afterimages), not a slow slide. In the void it charges
  // along the horizontal lane so it shares the arena with the conveyor.
  _startDash(player) {
    const C = CONFIG.source;
    this.dashState = "wind"; this.dashT = C.dashWindup;
    if (this.mode === "void") { this.dashTX = -1; this.dashTY = 0; }   // sweep leftward across the lane
    else { const dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1; this.dashTX = dx / m; this.dashTY = dy / m; }
    perilPing(this);
    this.echoCaption = "IT LUNGES"; this.captionT = 1.0;
  }
  _tickDash(dt, player, projectiles) {
    const C = CONFIG.source;
    if (this.dashState === "wind") {
      this.dashT -= dt; this.vx = lerp(this.vx, 0, clamp(6 * dt, 0, 1)); this.vy = lerp(this.vy, 0, clamp(6 * dt, 0, 1));
      if (this.dashT <= 0) {
        this.dashState = "dash"; this.dashT = 0.34;
        this.dashDX = this.dashTX * C.dashSpeed; this.dashDY = this.dashTY * C.dashSpeed;
        bossFeedback(this, "launch", { quiet: true });
      }
    } else if (this.dashState === "dash") {
      this.dashT -= dt;
      // chromatic afterimages trail the blink
      this.dashGhosts.push({ x: this.x, y: this.y, t: 0.24 });
      this.x += this.dashDX * dt; this.y += this.dashDY * dt;
      const contact = len(player.x - this.x, player.y - this.y) < this.hw + player.hw + 8;
      if (contact && !player.invulnerable) { player.takeDamage(this._voidDmg(C.dashDmg), this.x, this); FX.burst(player.x, player.y, this.dashTX, this.dashTY, 8, this.color); }
      const off = this.x < -60 || this.x > CONFIG.view.w + 60 || this.y < 40 || this.y > CONFIG.world.groundY + 40;
      if (this.dashT <= 0 || off) {
        this.dashState = "idle"; this.dashCd = C.dashCd;
        this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw); this.y = clamp(this.y, 80, CONFIG.world.groundY - this.hh);
      }
    }
    for (const g of this.dashGhosts) g.t -= dt;
    this.dashGhosts = this.dashGhosts.filter((g) => g.t > 0);
  }
  // RIFT COLLAPSE — teleport above the player, then drop a converging ring of shards
  _startCollapse(player, projectiles) {
    const C = CONFIG.source;
    this.collapseState = "wind"; this.collapseWT = C.collapseWindup;
    this.x = clamp(player.x, this.hw, CONFIG.view.w - this.hw); this.y = clamp(player.y - 230, 90, 360);
    FX.ring(this.x, this.y, 22, this.color); this.echoCaption = "RIFT COLLAPSE"; this.captionT = 1.1;
  }
  _tickCollapse(dt, player, projectiles) {
    const C = CONFIG.source;
    if (this.collapseState !== "wind") return;
    this.collapseWT -= dt;
    if (this.collapseWT <= 0) {
      this.collapseState = "idle"; this.riftCollapseCd = C.riftCollapseCd;
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2 - Math.PI / 2;
        const p = new Projectile(this.x + Math.cos(a) * 150, this.y + Math.sin(a) * 90, -Math.cos(a) * C.collapseSpeed, -Math.sin(a) * C.collapseSpeed * 0.6 + 260);
        p.dmg = this._voidDmg(C.collapseDmg); p.r = 11; p.tint = this.color; p.owner = this; projectiles.push(p);
      }
      bossFeedback(this, "launch", { shake: 6, flash: 0.18, zoom: 0.035 });
    }
  }
  _hover(dt, player) {
    const C = CONFIG.source;
    this.predatorDecisionT -= dt; this.predatorEngageT += dt;
    if (this.predatorDecisionT <= 0) {
      this.predatorDecisionT = C.predatorDecisionMin + Math.random() * (C.predatorDecisionMax - C.predatorDecisionMin);
      // Ordinary steering owns one side of the duel. Only the telegraphed breach
      // is allowed to cross the player; after that pass, the new physical side
      // naturally becomes the next orbit side.
      this.predatorSide = Math.sign(this.x - player.x) || this.predatorSide;
      const close = this.predatorEngageT > C.predatorForceBreach * 0.55 || Math.random() < 0.56;
      this.predatorDist = close
        ? C.predatorCloseMin + Math.random() * (C.predatorCloseMax - C.predatorCloseMin)
        : C.predatorStalkMin + Math.random() * (C.predatorStalkMax - C.predatorStalkMin);
      this.predatorY = C.predatorYMin + Math.random() * (C.predatorYMax - C.predatorYMin);
    }
    const tx = this.mode === "void" ? CONFIG.view.w * 0.80 : player.x + this.predatorSide * this.predatorDist;
    const ty = this.mode === "void" ? clamp(player.y + this.predatorY, 120, CONFIG.world.groundY - 230) : clamp(player.y + this.predatorY, 90, CONFIG.world.groundY - 150);
    this.vx = lerp(this.vx, (tx - this.x) * 1.65, clamp(2.8 * dt, 0, 1));
    this.vy = lerp(this.vy, (ty - this.y) * 1.55, clamp(2.6 * dt, 0, 1));
    this.x += this.vx * dt; this.y += this.vy * dt;
    this._applyBreachNudge(dt);
    this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
    this.y = clamp(this.y, 70, CONFIG.world.groundY - this.hh);
    this.onGround = false;
  }
  _enterPhase(ph) {
    const C = CONFIG.source;
    this._cancelSoftBreach(C.breachIntervalMin);
    if (ph === 2) {
      // THE VOID RUN begins at the halfway mark: the whole floor shatters fast,
      // then the platform stream replaces the world — the fight's centerpiece.
      this.mode = "collapse"; this.collapsing = true; this.collapseT = 0.05;
      this.voidDelayT = C.voidDelay; this.requestVoidCinematic = true; this.phaseTag = "WORLD UNMAKES";
      clearThroneFire(this, true);   // no ground fire once the floor is going
      bossPhaseBeat(this, "THE WORLD UNMAKES", this.color);
    } else if (ph === 3) {
      // THE KNEEL, on the void: the conveyor freezes mid-air while it gathers
      // itself — then TRUE FORM thaws the stream, faster.
      this.mode = "downed"; this.downT = C.kneelDur; this.freezeVoid = true;
      this.beamState = "idle"; this.phaseTag = "IT REMEMBERS";
      bossPhaseBeat(this, "IT REMEMBERS EVERY BLADE", this.color);
    }
  }
  revive() {
    const C = CONFIG.source;
    this.mode = "void"; this.downT = -1; this.thawVoid = true; this.phaseTag = "TRUE FORM";
    this.color = CONFIG.colors.perfect; this.castIdx = 0; this.atkT = 0.35; this.beamCd = C.beamCd * 0.55;
    bossPhaseBeat(this, "TRUE FORM", CONFIG.colors.perfect);
  }
  tryCatchBlade(blade, player) {
    if (this.mode !== "void" || this.bladeCaught || !blade || blade.state !== "flying" || blade.hostile) return false;
    this.bladeCaught = true; blade.hostile = true; blade.stolenBy = this; blade.pierced = new Set([this]); blade.flyTime = 0;
    const dx = player.x - blade.x, dy = player.y - blade.y, m = len(dx, dy) || 1;
    blade.vx = dx / m * CONFIG.source.stolenBladeSpeed; blade.vy = dy / m * CONFIG.source.stolenBladeSpeed;
    this.echoCaption = "IT TOOK YOUR BLADE"; this.captionT = 1.8;
    bossFeedback(this, "counter", { banner: "IT TOOK YOUR BLADE", color: CONFIG.colors.perfect, priority: 8, slowmo: 0.35, zoom: 0.06 });
    return true;
  }
  onDeathStart() { this.freezeVoid = true; this.beamState = "idle"; clearThroneFire(this, true); }

  update(dt, platforms, player, projectiles) {
    this.tickTimers(dt);
    this.facing = Math.sign(player.x - this.x) || this.facing;
    const C = CONFIG.source, ph = this.phase;
    if (this.breachRepelGraceT > 0) this.breachRepelGraceT = Math.max(0, this.breachRepelGraceT - dt);
    if (this.breachRipple > 0) this.breachRipple = Math.max(0, this.breachRipple - dt * 3.2);
    if (this.captionT > 0) this.captionT -= dt;
    while (this.phaseMarker < ph) { this.phaseMarker++; this._enterPhase(this.phaseMarker); }
    if (this.introT > 0) { this.vx = lerp(this.vx, 0, clamp(5 * dt, 0, 1)); this.vy = lerp(this.vy, 0, clamp(5 * dt, 0, 1)); return; }

    // The cinematic director owns the collapse clock, player safety and exact
    // hand-off. Source simulation is held here so it cannot cast through speech.
    if (this.mode === "collapse") {
      this.vx = lerp(this.vx, 0, clamp(5 * dt, 0, 1)); this.vy = lerp(this.vy, 0, clamp(5 * dt, 0, 1));
      return;
    }

    // THE KNEEL: it gathers itself over the frozen stream — no attacks, then TRUE FORM
    if (this.mode === "downed") {
      this.downT -= dt;
      this.vx = lerp(this.vx, (CONFIG.view.w / 2 - this.x) * 1.1, clamp(2 * dt, 0, 1));
      this.vy = lerp(this.vy, (250 - this.y) * 1.1, clamp(2 * dt, 0, 1));
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.downT <= 0) this.revive();
      return;
    }
    tickThroneFire(this, dt);
    this._scheduleFrom(player);
    const voidTransferBusy = this.mode === "void" && (player.voidTransferT > 0 || !player.supportPlatform);
    // A learned move may queue during a crossover, but it cannot fire over the
    // captured locomotion. Its timer resumes once follow steering returns.
    if (this.copyT > 0 && this.breachState === "follow" && !voidTransferBusy) { this.copyT -= dt; if (this.copyT <= 0) this._doCopy(player, projectiles, platforms); }
    // the Warden-echo burst: three shots on the baton string's beat
    if (this._burstN > 0 && this.breachState === "follow" && !voidTransferBusy) {
      this._burstT -= dt;
      if (this._burstT <= 0) { this._shot(player, projectiles, CONFIG.colors.boss, this._burstMotif || "warden"); this._burstN--; this._burstT = 0.18; }
    }

    // (platform crack ticking/splicing is GENERIC now — game.js runs it; this
    // boss only SETS crackT on its victims)
    if (this.collapsing) {
      this.collapseT -= dt;
      if (this.collapseT <= 0) {
        this.collapseT = C.platformCollapseCd;
        const ow = platforms.filter((p) => p.oneway && !(p.crackT > 0));
        if (ow.length) { const pl = ow[Math.floor(Math.random() * ow.length)]; pl.crackT = C.crackWarn; pl.crackMax = C.crackWarn; pl.crackColor = this.color; }
      }
    }

    if (this.mode === "void") {
      if (this.beamState === "idle") {
        this.beamCd -= dt;
        if (this.beamCd <= 0 && !voidTransferBusy && player.voidMajorWindow) { this.beamState = "tell"; this.beamT = C.beamWarn; this.beamX = CONFIG.view.w - 70; perilPing(this); }
      } else if (this.beamState === "tell") {
        this.beamT -= dt;
        if (this.beamT <= 0) { this.beamState = "sweep"; this.beamT = C.beamSweep; }
      } else {
        this.beamT -= dt;
        const k = 1 - clamp(this.beamT / C.beamSweep, 0, 1);
        this.beamX = lerp(CONFIG.view.w + C.beamW, -C.beamW, k);
        if (Math.abs(player.x - this.beamX) < C.beamW / 2 + player.hw) player.takeDamage(this._voidDmg(C.beamDmg), this.beamX, this);
        if (this.beamT <= 0) { this.beamState = "idle"; this.beamCd = C.beamCd; }
      }
    }

    // A soft crossover/recoil owns movement and suppresses the copied cast bag.
    // Revalidate the captured Void lane every tick: a route transfer, rescue, or
    // disappearing support that starts after commitment is still protected.
    if (this.breachState !== "follow") {
      const voidRouteLost = this.mode === "void" && (!player || !player.supportPlatform ||
        player.voidTransferT > 0 || player.voidSlowT > 0 ||
        (this.breachLane && player.voidLane !== this.breachLane));
      if (voidRouteLost) {
        if (this.breachState === "recoil" && player && player.voidLane === this.breachLane &&
            !player.voidSlowT) {
          // A successful repel remains earned, but does not move the Source
          // through a forced connector while the player is unsupported.
          this.vx = 0; this.vy = 0;
        } else {
          this._cancelSoftBreach(this._rollBreachCd());
        }
        return;
      }
      this._tickSoftBreach(dt); return;
    }

    // physical moves run their own state machines (they suppress the hover/cast)
    if (this.dashState !== "idle") { this._tickDash(dt, player, projectiles); return; }
    if (this.collapseState !== "idle") { this._tickCollapse(dt, player, projectiles); this._hover(dt, player); return; }
    this.dashCd -= dt; this.riftCollapseCd -= dt;

    // Cooldown is sampled once per completed cycle. If the player is too far
    // away, the ready breach waits instead of rerolling or timing out off-screen.
    const breachRange = len(player.x - this.x, player.y - this.y);
    if (!this._softBreachBlocked(player) && breachRange <= C.breachStartRange) {
      this.breachCd -= dt;
      if (this.predatorEngageT >= C.predatorForceBreach) this.breachCd = 0;
      if (this.breachCd <= 0) { this._startSoftBreach(player); this._tickSoftBreach(dt); return; }
    }

    this._hover(dt, player);
    this.atkT -= dt;
    if (this.atkT <= 0 && !voidTransferBusy) {
      this.atkT = C.cycleCd / (this.mode === "void" ? 1.9 : (this.collapsing ? 1.35 : 1));
      // MOVE BAG: weave the physical moves between ranged casts so the rift isn't
      // a pure projectile turret. Dash/collapse fire when off cooldown; otherwise
      // it casts (roughly halving the pure-projectile ratio).
      if (this.dashCd <= 0 && (this.mode === "void" || Math.random() < 0.7)) this._startDash(player);
      else if (this.riftCollapseCd <= 0 && Math.random() < 0.6) this._startCollapse(player, projectiles);
      else this._cast(projectiles, this.mode === "void" ? 2 : 1);
    }
  }

  draw(ctx) {
    const t = CLOCK.sim * 1000, x = this.x, y = this.y, w = this.hw, h = this.hh;
    const core = this.mode === "void" ? CONFIG.colors.perfect : this.color;
    const introP = this.introT > 0 ? clamp(1 - this.introT / ((CONFIG.bossTheater && CONFIG.bossTheater.introDur) || 1.4), 0, 1) : 1;
    const deathScale = this.dying ? Math.max(0.04, 1 - this.deathP * 0.92) : 1;
    const breachTellK = this.breachState === "tell" ? 1 - clamp(this.breachT / (this.breachMaxT || 1), 0, 1) : 0;
    const breachRecoilK = this.breachState === "recoil" ? clamp(this.breachT / (this.breachMaxT || 1), 0, 1) : 0;
    const breachA = Math.atan2(this.breachDY, this.breachDX);
    ctx.save();
    const targetScale = this.phase >= 2 || this.mode === "void" || this.mode === "downed" ? CONFIG.source.voidFormScale : 1;
    this.formScale = lerp(this.formScale, targetScale, 0.075);
    ctx.translate(x, y); ctx.scale(deathScale * this.formScale, deathScale * this.formScale);
    // Void wake: particles stream left as if the arena itself is being pulled in.
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2 + t / (850 + i * 17), rr = w * (1.3 + (i % 4) * 0.22) * introP * (1 - breachTellK * 0.24);
      ctx.globalAlpha = 0.15 + (i % 3) * 0.06; ctx.fillStyle = i % 3 ? core : THEME.ink;
      ctx.fillRect(Math.cos(a) * rr - (this.mode === "void" ? 22 : 0), Math.sin(a) * rr, 8 + (i % 4) * 3, 3);
    }
    // Three counter-rotating shard rings make every stolen cast feel housed in a
    // single impossible body rather than a generic caster silhouette.
    const motion = clamp(len(this.vx || 0, this.vy || 0) / 1400, 0, 0.28);
    const attackContract = this.dashState === "wind" || this.collapseState === "wind" || this.beamState === "tell" ? 0.18 : 0;
    ctx.save(); ctx.rotate(breachA);
    ctx.transform(1 + motion - breachTellK * 0.22, breachRecoilK * 0.18, -breachRecoilK * 0.08, 1 - motion * 0.42 + breachTellK * 0.10, -breachRecoilK * 12, 0);
    ctx.rotate(-breachA);
    for (let ring = 0; ring < 3; ring++) {
      const rr = w * (0.58 + ring * 0.34) * introP * (1 - attackContract),
        desync = this.stun > 0 ? Math.sin(t / (43 + ring * 19)) * (0.22 + ring * 0.08) : 0,
        spin = t / (620 - ring * 120) * (ring % 2 ? -1 : 1) + desync;
      ctx.save(); ctx.rotate(spin); ctx.strokeStyle = ring === 1 ? core : THEME.ink; ctx.lineWidth = 2 + ring;
      ctx.globalAlpha = 0.55 + ring * 0.12;
      const n = 7 + ring * 3;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.78;
        ctx.save(); ctx.translate(px, py); ctx.rotate(a + Math.PI / 4);
        ctx.beginPath(); ctx.moveTo(-8 - ring * 2, 0); ctx.lineTo(0, -4 - ring); ctx.lineTo(11 + ring * 2, 0); ctx.lineTo(0, 4 + ring); ctx.closePath(); ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();
    const cr = w * 0.36 * (0.82 + 0.18 * Math.sin(t / 100));
    const coreLean = breachTellK * 18 - breachRecoilK * 10;
    const coreX = this.breachDX * coreLean, coreY = this.breachDY * coreLean;
    ctx.globalAlpha = 0.95; ctx.fillStyle = core; ctx.beginPath(); ctx.arc(coreX, coreY, cr, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = this.dying ? this.deathP : 0.78; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(coreX, coreY, cr * (this.dying ? 1.8 : 0.46), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // SOFT BREACH: the thin captured line and two anchors communicate where the
    // Source committed. They never chase a player who changes direction mid-tell.
    if (this.breachState === "tell") {
      const k = breachTellK, pulse = 0.55 + 0.45 * Math.sin(k * Math.PI * 5);
      ctx.save(); ctx.strokeStyle = core; ctx.lineCap = "round";
      ctx.globalAlpha = 0.22 + 0.35 * k; ctx.lineWidth = 2.2; ctx.setLineDash([12, 10]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.breachDestX, this.breachDestY); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 0.45 + 0.35 * k;
      ctx.beginPath(); ctx.arc(this.breachCommitX, this.breachCommitY, 10 + 13 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.5 + 0.4 * pulse; ctx.lineWidth = 3;
      const tx = this.breachDestX, ty = this.breachDestY, nx = -this.breachDY, ny = this.breachDX;
      ctx.beginPath(); ctx.moveTo(tx - nx * 18, ty - ny * 18); ctx.lineTo(tx + nx * 18, ty + ny * 18); ctx.stroke();
      ctx.restore();
    } else if (this.breachState === "drift") {
      ctx.save(); ctx.globalAlpha = 0.24; ctx.strokeStyle = core; ctx.lineWidth = 10; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(this.breachStartX, this.breachStartY); ctx.lineTo(this.x, this.y); ctx.stroke();
      ctx.globalAlpha = 0.7; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(this.x - this.breachDX * 46, this.y - this.breachDY * 46); ctx.lineTo(this.x, this.y); ctx.stroke();
      ctx.restore();
    }
    if (this.breachRipple > 0) {
      const k = 1 - this.breachRipple;
      ctx.save(); ctx.translate(this.x - this.breachDX * 18, this.y - this.breachDY * 18); ctx.rotate(breachA);
      ctx.globalAlpha = this.breachRipple * 0.7; ctx.strokeStyle = CONFIG.colors.perfect; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const rr = 24 + i * 18 + k * 42;
        ctx.beginPath(); ctx.ellipse(-i * 8, 0, 8 + k * 7, rr, 0, -Math.PI * 0.48, Math.PI * 0.48); ctx.stroke();
      }
      ctx.restore();
    }
    // RIFT DASH: chromatic afterimages of the blink, then a lane telegraph on wind
    for (const g of this.dashGhosts) {
      const gk = g.t / 0.24; ctx.save(); ctx.globalAlpha = gk * 0.4;
      ctx.fillStyle = gk > 0.5 ? "#39f0ff" : "#ff4d8d";
      ctx.fillRect(g.x - w + (gk - 0.5) * 8, g.y - h, w * 2, h * 2); ctx.restore();
    }
    if (this.dashState === "wind") {
      const dk = 1 - clamp(this.dashT / CONFIG.source.dashWindup, 0, 1);
      const ang = Math.atan2(this.dashTY, this.dashTX);
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(ang);
      ctx.globalAlpha = 0.2 + 0.35 * dk; ctx.fillStyle = core;
      ctx.fillRect(0, -18, CONFIG.view.w * 1.4, 36);
      ctx.globalAlpha = 0.6 + 0.4 * dk; ctx.fillRect(0, -2, CONFIG.view.w * 1.4, 4);
      ctx.restore();
    }
    if (this.collapseState === "wind") {
      const ck = 1 - clamp(this.collapseWT / CONFIG.source.collapseWindup, 0, 1);
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2;
        dangerReticle(ctx, this.x + Math.cos(a) * 150 * (1 - ck * 0.3), this.y + Math.sin(a) * 90 * (1 - ck * 0.3), 14, ck, core); }
    }
    if (this.beamState === "tell") {
      const k = 1 - clamp(this.beamT / CONFIG.source.beamWarn, 0, 1);
      dangerColumn(ctx, this.beamX, CONFIG.source.beamW, 10, CONFIG.world.groundY, CONFIG.colors.perfect, k);
    } else if (this.beamState === "sweep") {
      ctx.save(); ctx.globalAlpha = 0.78; ctx.fillStyle = CONFIG.colors.perfect;
      ctx.fillRect(this.beamX - CONFIG.source.beamW / 2, 0, CONFIG.source.beamW, CONFIG.view.h);
      ctx.globalAlpha = 0.85; ctx.fillStyle = "#fff"; ctx.fillRect(this.beamX - 5, 0, 10, CONFIG.view.h); ctx.restore();
    }
    if (this.captionT > 0) UI.tag(ctx, this.echoCaption, this.x, this.y - this.hh - 48, core, "center", UI.t.type.caption);
    drawPeril(ctx, this);
    // Source intentionally has no local health bar: the top boss HUD is the only authority.
  }
}

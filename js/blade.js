// ------- the momentum blade -------
// HELD: the hilt is a physics point spring-pulled toward the reticle, tethered to
//   the player's hand by an elastic leash; the blade points outward toward the aim
//   with a velocity lead. Damage comes from tip speed.
// FLYING/RETURNING/EMBEDDED: thrown blade. It pierces, embeds where it lands, and
//   is reclaimed by getting within tether range and recalling it.
class Blade {
  constructor() {
    this.x = CONFIG.view.w * 0.5;
    this.y = CONFIG.view.h * 0.5;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2;     // pointing up to start
    this.tipX = this.x;
    this.tipY = this.y - CONFIG.blade.length;
    this.prevTipX = this.tipX;
    this.prevTipY = this.tipY;
    this.tipSpeed = 0;
    this.tipVX = 0;     // tip velocity components (slam/launch detection, knockback)
    this.tipVY = 0;
    this.glowV = 0;     // smoothed "charge" level for the tip glow
    this.tetherFactor = 1; // shrinks while holding left-click (closer control)
    this.trail = [];    // recent {hx,hy,tx,ty} for the swoosh

    // aim is an offset from the hand (player-relative reticle), starts overhead
    this.aimX = 0;
    this.aimY = -CONFIG.blade.aimRadius;
    this.reticleX = this.x;
    this.reticleY = this.y;

    // throw state machine
    this.state = "held";          // held | flying | returning | embedded
    this.pierced = new Set();     // enemies already hit by the current throw pass
    this.throwDmg = 0;
    this.flyTime = 0;
    this.throwSizeMult = 1;       // blade length multiplier while thrown (ability)
    this.freeRecall = false;      // ability: recall from any distance
    this.recallWindow = 0;        // shop: seconds of return travel added to recall reach
    this.throwCooldownMult = 1;   // shop: faster release recovery between throws
    this.embeddedNew = false;     // set the frame a flying blade embeds (for lob shockwave)
    this.caughtNew = false;       // set when a return completes (normalized catch event)
    this.model = "sword";         // visual: sword | hammer | spear | chainblade | ringblade
    this.weapon = null;
    this.channelMods = { throwPower: 1, throwSpeed: 1, remoteRange: 1, secondaryPower: 1, returnSpeed: 1, controlDuration: 1 };
    this.throwId = 0;
    this.throwOrigin = null;
    this.throwResolved = false;
    this.impactResolved = false;   // terminal first-impact effects are one-shot per throw route
    this.secondaryActive = false;
    this.anchorTarget = null;
    this.anchorTerrain = false;
    this.linkT = 0;
    this.circuitEnergy = 0;
    this.circuitOrbit = 0;
    this.orbit = 0;
    this.orbitDir = 0;
    this._orbitAngle = null;
    this.tension = 0;
    this._repeatHits = new Map();
    this._lastHand = null;
    this.hostile = false;          // Source capture: the flying blade can temporarily turn against its owner
    this.stolenBy = null;          // actor currently controlling that hostile flight
  }

  forceEmbed() {
    if (this.impactVX == null) this.impactVX = this.vx;
    if (this.impactVY == null) this.impactVY = this.vy;
    this.state = "embedded"; this.vx = 0; this.vy = 0;
  }

  claimImpact() {
    if (this.impactResolved) return false;
    this.impactResolved = true;
    return true;
  }

  // effective blade length (longer while thrown if the ability is owned).
  // lengthBonus is a per-instance additive override — the Mirror boss wields a much longer,
  // phase-growing blade without touching the global config or the player's blade.
  get curLength() {
    return (CONFIG.blade.length + (this.lengthBonus || 0)) * (this.state === "held" ? 1 : this.throwSizeMult);
  }

  // hand anchor follows the player
  handPos(player) {
    return {
      x: player.x + CONFIG.blade.handOffsetX,
      y: player.y + CONFIG.blade.handOffsetY,
    };
  }

  // ---- aim / reticle (runs in every state so the throw direction stays current) ----
  _updateAim(hand, dt) {
    const B = CONFIG.blade;
    if (this.aimOverride) {
      // attract-mode AI aims the blade at an absolute world point (else read the mouse)
      this.aimX = this.aimOverride.x - hand.x;
      this.aimY = this.aimOverride.y - hand.y;
    } else if (Input.touchAim && Input.stickAim) {
      // radial touch stick: the reticle sits where the stick points; the spring
      // chasing it supplies the whip, so flicking the stick IS a fast cut
      this.aimX = Input.stickAim.x * B.aimRadius;
      this.aimY = Input.stickAim.y * B.aimRadius;
    } else if (Input.locked || Input.touchAim) {
      // captured mouse (or drag-mode touch): relative movement drives a
      // player-anchored reticle
      const d = Input.consumeDelta();
      this.aimX += d.x * B.aimSensitivity;
      this.aimY += d.y * B.aimSensitivity;
    } else {
      // free cursor (menus / before capture): aim toward the cursor
      this.aimX = Input.mouseX - hand.x;
      this.aimY = Input.mouseY - hand.y;
    }
    // hold left-click to ease the tether in close (exponential approach) for finer control.
    // lmbOverride lets an AI-driven second blade (the Mirror) control its own tether instead
    // of reading the human's mouse button (additive: undefined -> reads Input.lmb as before).
    const lmb = this.lmbOverride != null ? this.lmbOverride : Input.tetherHeld;
    const target = lmb ? B.minTether : 1;
    this.tetherFactor = lerp(this.tetherFactor, target, clamp(9 * (dt || 0.016), 0, 1));
    const R = B.aimRadius * this.tetherFactor;
    const am = len(this.aimX, this.aimY);
    if (am > R && am > 0) {
      this.aimX = (this.aimX / am) * R;
      this.aimY = (this.aimY / am) * R;
    }
    this.reticleX = hand.x + this.aimX;
    this.reticleY = hand.y + this.aimY;
  }

  _recomputeTip(dt) {
    const L = this.curLength;
    this.prevTipX = this.tipX;
    this.prevTipY = this.tipY;
    this.tipX = this.x + Math.cos(this.angle) * L;
    this.tipY = this.y + Math.sin(this.angle) * L;
    this.tipVX = (this.tipX - this.prevTipX) / dt;
    this.tipVY = (this.tipY - this.prevTipY) / dt;
    this.tipSpeed = len(this.tipVX, this.tipVY);
    const target = clamp((this.tipSpeed - CONFIG.blade.minHitSpeed) / 3000, 0, 1);
    this.glowV = lerp(this.glowV, target, clamp(10 * dt, 0, 1));
  }

  _pushTrail() {
    this.trail.push({ hx: this.x, hy: this.y, tx: this.tipX, ty: this.tipY });
    if (this.trail.length > CONFIG.juice.trailSamples) this.trail.shift();
  }

  update(dt, player, platforms) {
    const hand = this.handPos(player);
    this._lastHand = hand;
    this._updateAim(hand, dt);

    if (this.state === "held") {
      this._updateHeld(dt, hand);
      this._updateWeaponMeters(dt, hand);
      if (this.weapon && this.weapon.onHeldUpdate) this.weapon.onHeldUpdate({ blade: this, dt, player, platforms, hand });
    }
    else this._updateThrown(dt, player, platforms);
  }

  channel(name) {
    const channels = this.weapon && this.weapon.channels;
    const base = channels && channels[name] != null ? channels[name] : 1;
    return base * (this.channelMods[name] == null ? 1 : this.channelMods[name]);
  }

  _updateWeaponMeters(dt, hand) {
    const reach = Math.max(1, CONFIG.blade.maxReach * 1.25);
    this.tension = clamp(len(this.x - hand.x, this.y - hand.y) / reach, 0, 1);
    if (!this.weapon || this.weapon.id !== "ringblade") { this.orbit = Math.max(0, this.orbit - dt); this._orbitAngle = null; return; }
    const W = CONFIG.weapons.ringblade;
    const a = Math.atan2(this.y - hand.y, this.x - hand.x);
    if (this._orbitAngle != null) {
      let da = a - this._orbitAngle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const dir = Math.sign(da);
      if (dir && this.orbitDir && dir !== this.orbitDir) this.orbit *= W.orbitReverseLoss;
      if (dir) this.orbitDir = dir;
      const angularSpeed = Math.abs(da) / Math.max(dt, 0.001);
      if (angularSpeed > 1.4 && this.tipSpeed > CONFIG.blade.minHitSpeed * 0.55) this.orbit = clamp(this.orbit + angularSpeed * W.orbitBuild * dt * 0.16, 0, 1);
      else this.orbit = Math.max(0, this.orbit - W.orbitDecay * dt);
    }
    this._orbitAngle = a;
  }

  _updateHeld(dt, hand) {
    const B = CONFIG.blade;

    // spring pull toward the reticle (the lag here is the momentum/weight feel)
    let ax = (this.reticleX - this.x) * B.springStiffness;
    let ay = (this.reticleY - this.y) * B.springStiffness;
    ay += B.gravity;

    // elastic leash: only fights you once past maxReach
    const hx = this.x - hand.x, hy = this.y - hand.y;
    const d = len(hx, hy);
    if (d > B.maxReach && d > 0) {
      const over = d - B.maxReach;
      ax += (-hx / d) * over * B.leashStiffness;
      ay += (-hy / d) * over * B.leashStiffness;
    }

    this.vx += ax * dt;
    this.vy += ay * dt;
    const damp = Math.exp(-B.damping * dt);
    this.vx *= damp;
    this.vy *= damp;

    const sp = len(this.vx, this.vy);
    if (sp > B.maxSpeed) {
      const k = B.maxSpeed / sp;
      this.vx *= k; this.vy *= k;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // hard clamp so it can never escape the leash entirely
    const nhx = this.x - hand.x, nhy = this.y - hand.y;
    const nd = len(nhx, nhy);
    const hardMax = B.maxReach * 1.25;
    if (nd > hardMax) {
      this.x = hand.x + (nhx / nd) * hardMax;
      this.y = hand.y + (nhy / nd) * hardMax;
    }

    // orientation: point outward from the hand (toward the aim), with a velocity
    // lead so fast swings whip the tip ahead of the aim line.
    const hhx = this.x - hand.x, hhy = this.y - hand.y;
    const hd = len(hhx, hhy);
    let aimAngle = hd > 8 ? Math.atan2(hhy, hhx) : Math.atan2(this.aimY, this.aimX);
    if (sp > 40) {
      const velAngle = Math.atan2(this.vy, this.vx);
      const lead = clamp(sp / B.leadSpeedRef, 0, 1) * B.leadAmount;
      aimAngle = lerpAngle(aimAngle, velAngle, lead);
    }
    this.angle = lerpAngle(this.angle, aimAngle, clamp(B.angleSmooth * dt, 0, 1));

    this._recomputeTip(dt);
    this._pushTrail();
  }

  _updateThrown(dt, player, platforms) {
    if (this.weapon && this.weapon.updateThrown) {
      this.weapon.updateThrown({ blade: this, dt, player, platforms });
      return;
    }
    this._updateStandardThrown(dt, player, platforms, false);
  }

  _updateStandardThrown(dt, player, platforms, retrace) {
    const B = CONFIG.blade, T = B.throw;

    if (this.state === "returning") {
      const hand = this.handPos(player);
      let target = hand;
      if ((this.retraceReturn || retrace) && this.throwOrigin && !this.retraceDone) target = this.throwOrigin;
      let dx = target.x - this.x, dy = target.y - this.y;
      const dd = len(dx, dy);
      if (target !== hand && dd < 30) {
        this.retraceDone = true;
        dx = hand.x - this.x; dy = hand.y - this.y;
      }
      const homeD = len(hand.x - this.x, hand.y - this.y);
      const returnSpeed = T.returnSpeed * this.channel("returnSpeed");
      if ((target === hand || this.retraceDone) && homeD <= Math.max(26, returnSpeed * dt)) {
        // reattach to the hand -> back to a normal held blade
        this.state = "held";
        this.hostile = false; this.stolenBy = null;
        this.x = hand.x; this.y = hand.y;
        this.vx = 0; this.vy = 0;
        this.anchorTarget = null; this.anchorTerrain = false; this.secondaryActive = false;
        this.caughtNew = true;
        if (this.weapon && this.weapon.onCatch) this.weapon.onCatch({ blade: this, player });
        this._recomputeTip(dt);
        return;
      }
      const travelD = len(dx, dy) || 1;
      this.angle = Math.atan2(dy, dx);
      this.vx = (dx / travelD) * returnSpeed;
      this.vy = (dy / travelD) * returnSpeed;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this._recomputeTip(dt);
      this._pushTrail();
    } else if (this.state === "flying") {
      this.flyTime += dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this._recomputeTip(dt);
      this._pushTrail();
      if (this.flyTime >= T.maxLife || this._embedIfHit(platforms)) {
        this.impactVX = this.vx; this.impactVY = this.vy;
        this.state = "embedded";
        this.vx = 0; this.vy = 0;
        this.embeddedNew = true;   // game triggers the lob shockwave on this edge
      }
    } else { // embedded / a weapon-owned stationary state
      this.vx = 0; this.vy = 0;
      this._recomputeTip(dt);
    }
  }

  _launchStraight() {}

  _launchBallistic(gravity) { this.throwGravity = gravity || 0; }

  _updateBallisticThrown(dt, player, platforms) {
    if (this.state === "flying") {
      this.vy += (this.throwGravity || CONFIG.weapons.hammer.meteorGravity) * dt;
      this.angle = Math.atan2(this.vy, this.vx);
    }
    this._updateStandardThrown(dt, player, platforms, false);
  }

  _updateSpearThrown(dt, player, platforms) {
    if (this.state === "reeling") {
      this.linkT -= dt;
      const target = this.anchorTarget;
      if (target && (target.dead || target.dying)) { this.anchorTarget = null; this.state = "returning"; }
      else {
        const W = CONFIG.weapons.spear;
        const tx = target ? target.x : this.x, ty = target ? target.y : this.y;
        const dx = tx - player.x, dy = ty - player.y, d = len(dx, dy) || 1;
        const heavy = target && (target.isBoss || target.weight >= W.heavyWeight || target.anchored);
        if (target && !heavy) {
          const ex = player.x - target.x, ey = player.y - target.y, em = len(ex, ey) || 1;
          target.vx += ex / em * W.reelSpeed * dt * 3.2; target.vy += ey / em * W.reelSpeed * dt * 3.2;
          this.x = target.x; this.y = target.y;
          if (em < 58) this.state = "returning";
        } else {
          player.vx = lerp(player.vx, dx / d * W.reelSpeed, clamp(7 * dt, 0, 1));
          player.vy = lerp(player.vy, dy / d * W.reelSpeed, clamp(7 * dt, 0, 1));
          if (d < 54) this.state = "returning";
        }
        if (this.linkT <= 0) this.state = "returning";
        this._recomputeTip(dt); this._pushTrail();
        return;
      }
    }
    this._updateStandardThrown(dt, player, platforms, false);
  }

  _launchChain() {
    this.linkT = CONFIG.weapons.chainblade.bindDuration * this.channel("controlDuration");
  }

  _updateChainThrown(dt, player, platforms) {
    const hand = this.handPos(player), W = CONFIG.weapons.chainblade;
    if (this.state === "latched") {
      this.linkT -= dt;
      if (!this.anchorTarget || this.anchorTarget.dead || this.anchorTarget.dying || this.linkT <= 0) {
        this.anchorTarget = null; this.state = "returning";
      } else {
        this.x = this.anchorTarget.x; this.y = this.anchorTarget.y;
        this.angle = Math.atan2(this.y - hand.y, this.x - hand.x);
        this._recomputeTip(dt); return;
      }
    }
    if (this.state === "yanking") {
      const e = this.anchorTarget;
      if (!e || e.dead || e.dying) { this.anchorTarget = null; this.state = "returning"; }
      else {
        const dx = player.x - e.x, dy = player.y - e.y, d = len(dx, dy) || 1;
        const resist = e.isBoss ? W.bossTug : (e.weight > 2 ? 0.48 : 1);
        e.vx += dx / d * W.yankSpeed * resist * dt * 4; e.vy += dy / d * W.yankSpeed * resist * dt * 4;
        if (e.isBoss) { player.vx += -dx / d * W.yankSpeed * 0.18 * dt; player.vy += -dy / d * W.yankSpeed * 0.12 * dt; }
        this.x = e.x; this.y = e.y; this.angle = Math.atan2(dy, dx);
        this._recomputeTip(dt);
        if (d < 68 || this.linkT <= 0) { this.state = "returning"; this.anchorTarget = null; }
        return;
      }
    }
    if (this.state === "flying") {
      this.linkT -= dt;
      const d = len(this.x - hand.x, this.y - hand.y);
      if (d > CONFIG.blade.throw.reclaimDistance * this.channel("remoteRange") || this.linkT <= 0 || this.flyTime + dt >= CONFIG.blade.throw.maxLife) this.state = "returning";
    }
    this._updateStandardThrown(dt, player, [], false); // Chainblade never embeds in terrain.
  }

  _launchCircuit() {
    this.state = "circuiting";
    this.circuitOrbit = this.orbit;
    this.circuitEnergy = CONFIG.weapons.ringblade.circuitEnergy * this.channel("controlDuration") * (0.75 + this.orbit * 0.5);
    const releaseSpeed = len(this.releaseVX || 0, this.releaseVY || 0);
    if (releaseSpeed >= CONFIG.blade.minHitSpeed * 0.35) {
      const throwSpeed = len(this.vx, this.vy);
      this.vx = this.releaseVX / releaseSpeed * throwSpeed;
      this.vy = this.releaseVY / releaseSpeed * throwSpeed;
      this.angle = Math.atan2(this.vy, this.vx);
    }
    this.orbit = 0;
  }

  _updateCircuit(dt, player, platforms) {
    if (this.state === "circuiting") {
      const W = CONFIG.weapons.ringblade;
      this.flyTime += dt; this.circuitEnergy -= dt;
      this.circuitBounceCd = Math.max(0, (this.circuitBounceCd || 0) - dt);
      const desired = Math.atan2(this.aimY, this.aimX); // remote stick/mouse direction, not a homing line back to the player
      const current = Math.atan2(this.vy, this.vx);
      const next = lerpAngle(current, desired, clamp(W.steer * this.channel("remoteRange") * dt, 0, 0.18));
      const sp = Math.max(CONFIG.blade.throw.speed, len(this.vx, this.vy));
      this.vx = Math.cos(next) * sp; this.vy = Math.sin(next) * sp;
      this.x += this.vx * dt; this.y += this.vy * dt; this.angle = next;
      if (this.circuitBounceCd <= 0 && this._circuitBounce(platforms)) { this.circuitEnergy -= W.bounceCost; this.circuitBounceCd = 0.08; }
      if (this.circuitEnergy <= 0 || this.flyTime >= CONFIG.blade.throw.maxLife * this.channel("controlDuration") * 1.8) this.state = "returning";
      this._recomputeTip(dt); this._pushTrail(); return;
    }
    this._updateStandardThrown(dt, player, platforms, false);
  }

  _circuitBounce(platforms) {
    const V = CONFIG.view, r = Math.max(14, this.curLength * 0.28); let hit = false;
    if (this.x < r) { this.x = r; this.vx = Math.abs(this.vx); hit = true; }
    else if (this.x > V.w - r) { this.x = V.w - r; this.vx = -Math.abs(this.vx); hit = true; }
    if (this.y < r) { this.y = r; this.vy = Math.abs(this.vy); hit = true; }
    else if (this.y > CONFIG.world.groundY - r) { this.y = CONFIG.world.groundY - r; this.vy = -Math.abs(this.vy); hit = true; }
    for (const p of platforms || []) {
      if (p.oneway || p.floor) continue;
      if (this.x + r < p.x || this.x - r > p.x + p.w || this.y + r < p.y || this.y - r > p.y + p.h) continue;
      const dl = Math.abs((this.x + r) - p.x), dr = Math.abs((p.x + p.w) - (this.x - r));
      const dt = Math.abs((this.y + r) - p.y), db = Math.abs((p.y + p.h) - (this.y - r));
      if (Math.min(dl, dr) < Math.min(dt, db)) this.vx *= -1; else this.vy *= -1;
      hit = true; break;
    }
    if (hit) { this.angle = Math.atan2(this.vy, this.vx); this.vx *= 0.94; this.vy *= 0.94; }
    return hit;
  }

  _beginReturn(player, opts) {
    if (this.state === "held" || this.state === "returning" || this.secondaryActive) return "busy";
    const hand = this.handPos(player);
    const earlyReach = CONFIG.blade.throw.reclaimDistance * this.channel("remoteRange") + CONFIG.blade.throw.returnSpeed * this.recallWindow;
    if (!(this.hostile || this.stolenBy || this.freeRecall || len(this.x - hand.x, this.y - hand.y) <= earlyReach)) return "toofar";
    this.pierced = new Set(); this.hostile = false; this.stolenBy = null;
    this.secondaryActive = true; this.retraceReturn = !!(opts && opts.retrace); this.retraceDone = false;
    this.state = "returning";
    return "recalled";
  }

  _beginSpearReel(player) {
    if (this.state === "flying" || this.state === "reeling" || this.secondaryActive) return "busy";
    if (this.state !== "embedded") return this._beginReturn(player);
    this.secondaryActive = true; this.pierced = new Set(); this.state = "reeling"; return "recalled";
  }

  _beginYank(player) {
    if (this.state === "yanking" || this.secondaryActive) return "busy";
    if (this.state === "latched" && this.anchorTarget) { this.secondaryActive = true; this.pierced = new Set(); this.chainCollided = new Set(); this.state = "yanking"; return "recalled"; }
    return this._beginReturn(player);
  }

  _beginCircuitReturn(player) {
    if (this.state === "returning" || this.secondaryActive) return "busy";
    if (this.state === "circuiting") { this.secondaryActive = true; this.orbit = this.circuitOrbit * 0.45; this.state = "returning"; this.vx *= -1; this.vy *= -1; return "recalled"; }
    return this._beginReturn(player);
  }

  // back the blade out of any wall it has driven its tip into, or off-screen; returns
  // true if it should embed now.
  _embedIfHit(platforms) {
    const V = CONFIG.view, L = this.curLength;
    const inSolid = (tx, ty) => {
      if (tx < 0 || tx > V.w || ty < 0 || ty > V.h) return true;
      for (const p of platforms) {
        if (tx >= p.x && tx <= p.x + p.w && ty >= p.y && ty <= p.y + p.h) return true;
      }
      return false;
    };
    if (!inSolid(this.tipX, this.tipY)) return false;

    // blade sinks in tip-first, up to the hilt: keep the travel orientation and slide
    // the hilt to the surface so most of the blade is buried (tip stays inside the wall).
    const m = len(this.vx, this.vy) || 1;
    const dx = this.vx / m, dy = this.vy / m;     // travel direction (into the wall)
    let g = 0;
    while (inSolid(this.x, this.y) && g < 80) { this.x -= dx * 3; this.y -= dy * 3; g++; } // if hilt is inside, back it out
    g = 0;
    while (g < 80) {                               // then advance the hilt up to the surface
      const nx = this.x + dx * 3, ny = this.y + dy * 3;
      if (inSolid(nx, ny)) break;
      this.x = nx; this.y = ny; g++;
    }
    this.tipX = this.x + Math.cos(this.angle) * L;
    this.tipY = this.y + Math.sin(this.angle) * L;
    return true;
  }

  // ---- actions ----
  throwBlade() {
    if (this.state !== "held") return false;
    const T = CONFIG.blade.throw;
    this.releaseVX = this.vx; this.releaseVY = this.vy;
    // throw toward the reticle (where you're aiming) — far more accurate than the
    // momentum-led blade angle while you're moving/jumping/dashing.
    let dirX = this.aimX, dirY = this.aimY;
    const am = len(dirX, dirY);
    if (am < 1) { dirX = Math.cos(this.angle); dirY = Math.sin(this.angle); }
    else { dirX /= am; dirY /= am; }
    this.angle = Math.atan2(dirY, dirX);   // blade points the way it's thrown
    const channelSpeed = this.channel("throwSpeed");
    const sp = clamp((T.speed + this.tipSpeed * T.speedFromSwing) * channelSpeed, T.speed * channelSpeed, T.maxSpeed * channelSpeed);
    this.vx = dirX * sp;
    this.vy = dirY * sp;
    this.throwDmg = (T.damage + sp * T.damageFromSpeed) * this.channel("throwPower");
    this.throwBaseDmg = this.throwDmg;   // Overdrive ramp is capped relative to this
    this.pierced = new Set();
    this.flyTime = 0;
    this.throwId++;
    this.throwOrigin = { x: this.x, y: this.y };
    this.throwResolved = false;
    this.impactResolved = false;
    this.secondaryActive = false;
    this.anchorTarget = null; this.anchorTerrain = false;
    this.retraceReturn = false; this.retraceDone = false;
    this.redirectSpent = false;
    this.impactVX = null; this.impactVY = null;
    this._repeatHits.clear();
    this.hostile = false; this.stolenBy = null;
    this.state = "flying";
    if (this.weapon && this.weapon.onThrowLaunch) this.weapon.onThrowLaunch({ blade: this });
    return true;
  }

  // recall if within tether range; returns "recalled" | "toofar"
  tryRecall(player) {
    if (this.state === "held" || this.state === "returning" || this.secondaryActive) return "busy";
    if (this.weapon && this.weapon.onSecondaryThrowAction) {
      const result = this.weapon.onSecondaryThrowAction({ blade: this, player });
      if (result) return result;
    }
    return this._beginReturn(player);
  }

  get thrown() { return ["flying", "returning", "embedded", "reeling", "latched", "yanking", "circuiting"].includes(this.state); }

  // how "clean" the swing is: 1 = a true perpendicular cut, ~0 = a straight poke/thrust.
  // (the perpendicular component of tip velocity relative to the blade's own axis)
  sliceQuality() {
    if (this.tipSpeed < 1) return 0;
    const perpX = -Math.sin(this.angle), perpY = Math.cos(this.angle);
    return clamp(Math.abs((this.tipVX * perpX + this.tipVY * perpY) / this.tipSpeed), 0, 1);
  }

  axialQuality() {
    if (this.tipSpeed < 1) return 0;
    const ax = Math.cos(this.angle), ay = Math.sin(this.angle);
    return clamp(Math.abs((this.tipVX * ax + this.tipVY * ay) / this.tipSpeed), 0, 1);
  }

  hitQuality(enemy) {
    if (this.weapon && this.weapon.qualityMetric) return clamp(this.weapon.qualityMetric({ blade: this, enemy }), 0, 1);
    return this.sliceQuality();
  }

  repeatScale(enemy) {
    if (!enemy) return 1;
    const W = CONFIG.weapons.ringblade, now = typeof CLOCK !== "undefined" ? CLOCK.sim : 0;
    const prev = this._repeatHits.get(enemy);
    if (prev == null || now - prev >= W.repeatWindow) return 1;
    const momentum = this.state === "held" ? this.orbit : this.circuitOrbit;
    return lerp(W.repeatFloor, 0.8, momentum);
  }

  thrownCollisionPad() {
    return this.weapon && this.weapon.throwCollisionPad != null ? this.weapon.throwCollisionPad : 4;
  }

  recordHit(enemy) {
    if (enemy) this._repeatHits.set(enemy, typeof CLOCK !== "undefined" ? CLOCK.sim : 0);
  }

  canHitThrownEnemy(enemy) {
    if (this.weapon && this.weapon.id === "hammer" && this.state === "returning" && this.pierced.size >= CONFIG.weapons.hammer.recallTargetCap) return false;
    if (this.weapon && this.weapon.id === "ringblade") {
      const now = typeof CLOCK !== "undefined" ? CLOCK.sim : 0, prev = this._repeatHits.get(enemy);
      return prev == null || now - prev >= CONFIG.weapons.ringblade.repeatWindow * 0.62;
    }
    return !this.pierced.has(enemy);
  }

  // damage for a held swing (0 if below threshold or not held).
  // Skill shaping: a clean CUT beats a POKE, and a committed arm swing (the hilt
  // actually travelling) beats a wrist-flick of the tip. Style->damage is applied
  // by the combat loop (it needs the live trick multiplier).
  damageAt() {
    const B = CONFIG.blade, S = CONFIG.skill;
    if (this.state !== "held" || this.tipSpeed < B.minHitSpeed) return 0;
    let dmg = Math.min((this.tipSpeed - B.minHitSpeed) * B.damageScale, B.maxDamage);
    const quality = this.hitQuality();
    dmg *= lerp(S.pokeFloor, 1, quality);
    const commit = clamp(len(this.vx, this.vy) / S.commitRef, 0, 1);
    dmg *= lerp(S.commitFloor, 1, commit);
    if (this.weapon && this.weapon.damageProfile) dmg *= this.weapon.damageProfile({ blade: this, quality, baseDamage: dmg });
    return dmg;
  }

  // ---- drawing ----
  _drawBody(ctx) {
    const s = this.state === "held" ? 1 : this.throwSizeMult;
    // ink + a soft separating halo so the blade reads on dark voids as well as paper
    if (!(typeof GFX !== "undefined" && GFX.low)) { ctx.shadowColor = THEME.rim; ctx.shadowBlur = 6; }
    ctx.strokeStyle = THEME.ink;
    ctx.fillStyle = THEME.ink;
    ctx.lineCap = "round";

    if (this.model === "hammer") {
      // thick shaft + a chunky head block at the tip
      ctx.lineWidth = 7 * s;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.tipX, this.tipY);
      ctx.stroke();
      ctx.shadowBlur = 0;   // details crisp
      ctx.save();
      ctx.translate(this.tipX, this.tipY);
      ctx.rotate(this.angle);
      const hl = 22 * s, hh = 16 * s;        // head: long across the shaft
      ctx.fillRect(-hl * 0.35, -hh, hl, hh * 2);
      ctx.strokeStyle = THEME.dark ? "rgba(10,12,20,0.9)" : "#fff"; ctx.lineWidth = 2;   // edge highlight reads on either polarity
      ctx.strokeRect(-hl * 0.35, -hh, hl, hh * 2);
      ctx.restore();
      return;
    }

    if (this.model === "spear") {
      ctx.lineWidth = 5 * s;
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.tipX, this.tipY); ctx.stroke();
      ctx.save(); ctx.translate(this.tipX, this.tipY); ctx.rotate(this.angle);
      ctx.beginPath(); ctx.moveTo(8 * s, 0); ctx.lineTo(-13 * s, -9 * s); ctx.lineTo(-9 * s, 0); ctx.lineTo(-13 * s, 9 * s); ctx.closePath(); ctx.fill();
      ctx.restore(); return;
    }

    if (this.model === "chainblade") {
      const hand = this._lastHand || { x: this.x, y: this.y };
      ctx.lineWidth = 3; ctx.strokeStyle = this.tension > 0.7 ? CONFIG.colors.perfect : THEME.ink;
      ctx.beginPath(); ctx.moveTo(hand.x, hand.y);
      const segments = 7;
      for (let i = 1; i <= segments; i++) {
        const t = i / segments, sag = Math.sin(t * Math.PI) * (1 - this.tension) * 28;
        ctx.lineTo(lerp(hand.x, this.tipX, t), lerp(hand.y, this.tipY, t) + sag);
      }
      ctx.stroke();
      ctx.save(); ctx.translate(this.tipX, this.tipY); ctx.rotate(this.angle);
      ctx.beginPath(); ctx.moveTo(13 * s, 0); ctx.lineTo(-7 * s, -11 * s); ctx.lineTo(-3 * s, 0); ctx.lineTo(-7 * s, 11 * s); ctx.closePath(); ctx.fill();
      ctx.restore(); return;
    }

    if (this.model === "ringblade") {
      const r = 20 * s;
      ctx.lineWidth = 7 * s; ctx.strokeStyle = THEME.ink;
      ctx.beginPath(); ctx.arc(this.tipX, this.tipY, r, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = CONFIG.colors.bladeGlow;
      const spin = (typeof CLOCK !== "undefined" ? CLOCK.sim : 0) * (5 + this.orbit * 9);
      for (let i = 0; i < 3; i++) {
        const a = spin + i * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.arc(this.tipX, this.tipY, r + 3, a, a + 0.55); ctx.stroke();
      }
      return;
    }

    // sword: tapered line + crossguard
    ctx.lineWidth = 7 * s;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.tipX, this.tipY);
    ctx.stroke();
    ctx.shadowBlur = 0;   // crossguard crisp
    const gx = Math.cos(this.angle + Math.PI / 2) * 9;
    const gy = Math.sin(this.angle + Math.PI / 2) * 9;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(this.x - gx, this.y - gy);
    ctx.lineTo(this.x + gx, this.y + gy);
    ctx.stroke();
  }

  _drawTrail(ctx) {
    if (typeof GFX !== "undefined" && GFX.low) return;
    const J = CONFIG.juice, tr = this.trail;
    // on dark biomes, blend the swoosh additively so it blooms like real light
    const glow = (typeof THEME !== "undefined") && THEME.dark;
    if (glow) { ctx.save(); ctx.globalCompositeOperation = "lighter"; }
    ctx.fillStyle = this.trailColor || CONFIG.colors.bladeTrail;   // per-blade override (the Mirror wields a violet blade)
    const restored = ["#13c4d6", "#e0a326", "#b06cff", "#2f9e6b", "#eafcff"];
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i];
      // fade each band smoothly by how fast the tip was moving (no hard cutoff -> no blink)
      const seg = len(b.tx - a.tx, b.ty - a.ty);
      const speedA = clamp((seg - 1) / 22, 0, 1);
      const al = (i / tr.length) * (J.trailAlpha + 0.3) * speedA;
      if (al <= 0.002) continue;
      if (this.restoredTrail) ctx.fillStyle = restored[i % restored.length];
      ctx.globalAlpha = al;
      ctx.beginPath();
      ctx.moveTo(a.hx, a.hy);
      ctx.lineTo(a.tx, a.ty);
      ctx.lineTo(b.tx, b.ty);
      ctx.lineTo(b.hx, b.hy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (glow) ctx.restore();
  }

  _drawTipGlow(ctx) {
    if (this.state !== "held") return;
    const v = this.glowV;
    if (v <= 0.04) return;
    const glow = (typeof THEME !== "undefined") && THEME.dark;
    if (glow) { ctx.save(); ctx.globalCompositeOperation = "lighter"; }
    ctx.globalAlpha = 0.2 + v * 0.5;
    ctx.fillStyle = this.glowColor || CONFIG.colors.bladeGlow;   // per-blade override
    ctx.beginPath();
    ctx.arc(this.tipX, this.tipY, 4 + v * 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (glow) ctx.restore();
  }

  draw(ctx, player) {
    const hand = this.handPos(player);
    this._drawTrail(ctx);

    if (this.state === "held") {
      // faint tether from hand to hilt
      if (!this.finalFree) {
        ctx.strokeStyle = "#cfcfcf";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hand.x, hand.y);
        ctx.lineTo(this.x, this.y);
        ctx.stroke();
      }
      this._drawTipGlow(ctx);
      this._drawBody(ctx);
      return;
    }

    // ---- thrown: show the recall range + a tether that darkens when in range ----
    // hideThrowUI (the Mirror boss) skips the player-facing recall HUD — it just flies as a weapon
    const T = CONFIG.blade.throw;
    const inRange = len(this.x - hand.x, this.y - hand.y) <= T.reclaimDistance;

    if (!this.hideThrowUI) {
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = inRange ? THEME.ink : (THEME.dark ? "rgba(236,235,246,0.45)" : "#cfcfcf");
      ctx.lineWidth = inRange ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();

      // reclaim radius around the player
      ctx.strokeStyle = THEME.dark ? "rgba(236,235,246,0.30)" : "#dcdcdc";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, T.reclaimDistance, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    this._drawBody(ctx);

    // little "recall ready" tick on an embedded, in-range blade
    if (this.state === "embedded" && inRange) {
      ctx.strokeStyle = THEME.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 13, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

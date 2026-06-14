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
  }

  // effective blade length (longer while thrown if the ability is owned)
  get curLength() {
    return CONFIG.blade.length * (this.state === "held" ? 1 : this.throwSizeMult);
  }

  // hand anchor follows the player
  handPos(player) {
    return {
      x: player.x + CONFIG.blade.handOffsetX,
      y: player.y + CONFIG.blade.handOffsetY,
    };
  }

  // ---- aim / reticle (runs in every state so the throw direction stays current) ----
  _updateAim(hand) {
    const B = CONFIG.blade;
    if (Input.locked) {
      // captured mouse: relative movement drives a player-anchored reticle
      const d = Input.consumeDelta();
      this.aimX += d.x * B.aimSensitivity;
      this.aimY += d.y * B.aimSensitivity;
    } else {
      // free cursor (menus / before capture): aim toward the cursor
      this.aimX = Input.mouseX - hand.x;
      this.aimY = Input.mouseY - hand.y;
    }
    const am = len(this.aimX, this.aimY);
    if (am > B.aimRadius && am > 0) {
      this.aimX = (this.aimX / am) * B.aimRadius;
      this.aimY = (this.aimY / am) * B.aimRadius;
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
  }

  _pushTrail() {
    this.trail.push({ hx: this.x, hy: this.y, tx: this.tipX, ty: this.tipY });
    if (this.trail.length > CONFIG.juice.trailSamples) this.trail.shift();
  }

  update(dt, player, platforms) {
    const hand = this.handPos(player);
    this._updateAim(hand);

    if (this.state === "held") this._updateHeld(dt, hand);
    else this._updateThrown(dt, player, platforms);
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
    const B = CONFIG.blade, T = B.throw;

    if (this.state === "returning") {
      const hand = this.handPos(player);
      let dx = hand.x - this.x, dy = hand.y - this.y;
      const dd = len(dx, dy);
      if (dd < 26) {
        // reattach to the hand -> back to a normal held blade
        this.state = "held";
        this.x = hand.x; this.y = hand.y;
        this.vx = 0; this.vy = 0;
        this._recomputeTip(dt);
        return;
      }
      this.angle = Math.atan2(dy, dx);
      this.vx = (dx / dd) * T.returnSpeed;
      this.vy = (dy / dd) * T.returnSpeed;
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
        this.state = "embedded";
        this.vx = 0; this.vy = 0;
      }
    } else { // embedded
      this.vx = 0; this.vy = 0;
      this._recomputeTip(dt);
    }
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

    // step back along travel direction until the tip is just clear of the surface
    const m = len(this.vx, this.vy) || 1;
    const bx = -(this.vx / m), by = -(this.vy / m);
    let guard = 0;
    while (inSolid(this.tipX, this.tipY) && guard < 60) {
      this.x += bx * 3; this.y += by * 3;
      this.tipX = this.x + Math.cos(this.angle) * L;
      this.tipY = this.y + Math.sin(this.angle) * L;
      guard++;
    }
    return true;
  }

  // ---- actions ----
  throwBlade() {
    if (this.state !== "held") return false;
    const T = CONFIG.blade.throw;
    const dirX = Math.cos(this.angle), dirY = Math.sin(this.angle);
    const sp = clamp(T.speed + this.tipSpeed * T.speedFromSwing, T.speed, T.maxSpeed);
    this.vx = dirX * sp;
    this.vy = dirY * sp;
    this.throwDmg = T.damage + sp * T.damageFromSpeed;
    this.pierced = new Set();
    this.flyTime = 0;
    this.state = "flying";
    return true;
  }

  // recall if within tether range; returns "recalled" | "toofar"
  tryRecall(player) {
    if (this.state === "held" || this.state === "returning") return "busy";
    const hand = this.handPos(player);
    if (len(this.x - hand.x, this.y - hand.y) <= CONFIG.blade.throw.reclaimDistance) {
      this.pierced = new Set();   // can pierce again on the way home
      this.state = "returning";
      return "recalled";
    }
    return "toofar";
  }

  get thrown() { return this.state === "flying" || this.state === "returning"; }

  // damage for a held swing (0 if below threshold or not held)
  damageAt() {
    const B = CONFIG.blade;
    if (this.state !== "held" || this.tipSpeed < B.minHitSpeed) return 0;
    return Math.min((this.tipSpeed - B.minHitSpeed) * B.damageScale, B.maxDamage);
  }

  // ---- drawing ----
  _drawBody(ctx) {
    const thrownScale = this.state === "held" ? 1 : this.throwSizeMult;
    ctx.strokeStyle = "#000";
    ctx.lineCap = "round";
    ctx.lineWidth = 7 * thrownScale;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.tipX, this.tipY);
    ctx.stroke();

    const gx = Math.cos(this.angle + Math.PI / 2) * 9;
    const gy = Math.sin(this.angle + Math.PI / 2) * 9;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(this.x - gx, this.y - gy);
    ctx.lineTo(this.x + gx, this.y + gy);
    ctx.stroke();
  }

  _drawTrail(ctx) {
    const J = CONFIG.juice, tr = this.trail;
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i];
      if (len(b.tx - a.tx, b.ty - a.ty) < J.trailMinStep) continue;
      ctx.globalAlpha = (i / tr.length) * J.trailAlpha;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.moveTo(a.hx, a.hy);
      ctx.lineTo(a.tx, a.ty);
      ctx.lineTo(b.tx, b.ty);
      ctx.lineTo(b.hx, b.hy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx, player) {
    const hand = this.handPos(player);
    this._drawTrail(ctx);

    if (this.state === "held") {
      // faint tether from hand to hilt
      ctx.strokeStyle = "#cfcfcf";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
      this._drawBody(ctx);
      return;
    }

    // ---- thrown: show the recall range + a tether that darkens when in range ----
    const T = CONFIG.blade.throw;
    const inRange = len(this.x - hand.x, this.y - hand.y) <= T.reclaimDistance;

    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = inRange ? "#000" : "#cfcfcf";
    ctx.lineWidth = inRange ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(hand.x, hand.y);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();

    // reclaim radius around the player
    ctx.strokeStyle = "#dcdcdc";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, T.reclaimDistance, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    this._drawBody(ctx);

    // little "recall ready" tick on an embedded, in-range blade
    if (this.state === "embedded" && inRange) {
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 13, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

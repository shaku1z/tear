// ------- projectiles (enemy fire, deflectable) -------
class Projectile {
  constructor(x, y, vx, vy) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.r = CONFIG.proj.r;
    this.dead = false;
    this.deflected = false;   // once deflected, it hurts enemies instead of the player
    this.perfect = false;     // perfect parry: homed + bonus damage
    this.deflectDmg = 28;     // damage dealt to enemies after a deflect
    this.pierce = false;      // ability: passes through enemies
    this.pierced = null;      // set of enemies already hit (when piercing)
    this.bounces = 0;         // ability: ricochets off walls this many times
    this.life = 6;            // seconds before it expires
    this.dmg = null;          // override damage to the player (null = CONFIG.proj.dmg)
    this.charged = false;     // Marksman's heavy shot: big, slow, very parryable
    this.gravity = 0;         // arcing projectiles (bombs) fall under gravity
    this.bomb = false;        // explodes (AoE) on impact instead of a direct hit
    this.mine = false;        // settles on the floor, arms, then detonates on proximity
    this.armed = false;
    this.armT = 0;
    this.shock = false;       // armored stomp ground wave (jump it; non-parryable)
    this.curve = false;       // Warlock: redirects once toward the player mid-flight
    this.curveT = 0;          // ...countdown to that adjustment
    this.curved = false;
    this.root = 0;            // Chain: roots the player for this many seconds on hit
    this.mud = false;         // Sludge: lands and leaves a slowing puddle
    this.tint = null;         // shot colour, set by the firing enemy (else default enemyShot)
    this.kind = "dart";       // visual shape: "dart" (oriented bolt) | "orb" (caster)
    this.hist = [];           // recent positions -> a real motion trail for EVERY projectile
    // Optional boss-pattern metadata. Neutral defaults preserve every legacy projectile.
    this.owner = null;
    this.landingX = null; this.landingY = null; this.landingT = null;
    this.maxCrossings = 0; this.crossings = 0;
    this.embeddedLife = 0;
    this.groundImpact = false;
    this.embedded = false;    // inert sweeper lodged in an arena wall
    this.harmless = false;    // collision consumers can ignore an embedded prop
    this._embedNotified = false;
    this._groundImpactDone = false;
  }

  update(dt) {
    if (this.embedded) {
      this.vx = 0; this.vy = 0;
      this.embeddedLife -= dt;
      if (this.embeddedLife <= 0) this.dead = true;
      return;
    }

    if (this.landingT != null) this.landingT = Math.max(0, this.landingT - dt);
    if (this.gravity) this.vy += this.gravity * dt;   // bombs arc; mines fall to the floor
    this.hist.push({ x: this.x, y: this.y });          // record the path for the motion trail
    if (this.hist.length > 7) this.hist.shift();
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;

    // Optional falling-hazard impact. Bombs/mines keep their legacy game-owned handling
    // unless their creator explicitly opts into groundImpact.
    if (this.gravity && this.groundImpact && !this._groundImpactDone && this.vy > 0 &&
        this.y + this.r >= (this.landingY != null ? this.landingY : CONFIG.world.groundY)) {
      this.y = CONFIG.world.groundY - this.r;
      this.vx = 0; this.vy = 0; this.landingT = 0;
      this._groundImpactDone = true;
      if (this.owner && typeof this.owner.onProjectileGroundImpact === "function") this.owner.onProjectileGroundImpact(this);
      this.dead = true;
      return;
    }

    if (this.bounces > 0 || (this.sweeper && this.maxCrossings > 0)) {
      // ricochet off the play-area edges
      const r = this.r, W = CONFIG.view.w, top = 0, bottom = CONFIG.world.groundY;
      let hit = false;
      if (this.x < r) { this.x = r; this.vx = Math.abs(this.vx); hit = true; }
      else if (this.x > W - r) { this.x = W - r; this.vx = -Math.abs(this.vx); hit = true; }
      if (this.y < top + r) { this.y = top + r; this.vy = Math.abs(this.vy); hit = true; }
      else if (this.y > bottom - r) { this.y = bottom - r; this.vy = -Math.abs(this.vy); hit = true; }
      if (hit) {
        if (this.sweeper) {
          FX.ring(this.x, this.y, 6, this.tint || CONFIG.colors.armoredShield);
          if (this.maxCrossings > 0) {
            this.crossings++;
            if (this.crossings >= this.maxCrossings) {
              this.crossings = this.maxCrossings;
              this.vx = 0; this.vy = 0;
              this.embedded = true; this.harmless = true;
              this.hist.length = 0;
              if (!this._embedNotified) {
                this._embedNotified = true;
                if (this.owner && typeof this.owner.onShieldEmbedded === "function") this.owner.onShieldEmbedded(this);
              }
            }
          }
        }   // maxCrossings=0 preserves the legacy infinite sweeper
        else { this.bounces--; this.vx *= 0.85; this.vy *= 0.85; FX.ring(this.x, this.y, 4); }
      }
      return;
    }

    const m = 40;
    if (this.x < -m || this.x > CONFIG.view.w + m || this.y < -m || this.y > CONFIG.view.h + m) {
      this.dead = true;
    }
  }

  // reflect along a direction (blade travel, or toward a target for a perfect parry)
  deflect(dirX, dirY, speed, perfect) {
    const inSpeed = len(this.vx, this.vy) || CONFIG.proj.speed;   // the incoming shot's speed
    const m = len(dirX, dirY) || 1;
    const boost = perfect ? CONFIG.blade.deflectBoost * 1.6 : CONFIG.blade.deflectBoost;
    const s = Math.max(speed, CONFIG.proj.speed) * boost;
    this.vx = (dirX / m) * s;
    this.vy = (dirY / m) * s;
    this.deflected = true;
    this.perfect = !!perfect;
    // parry damage scales with BOTH the original shot's damage AND its speed — sending a
    // fast, heavy shot back is the big payoff; a slow pellet barely stings
    const orig = this.dmg != null ? this.dmg : CONFIG.proj.dmg;
    const speedF = clamp(inSpeed / 600, 0.6, 2.2);
    this.deflectDmg = Math.round((orig * (perfect ? 2.6 : 1.8) + (perfect ? 10 : 8)) * (0.7 + 0.3 * speedF));
    this.life = 6;
  }

  // a tapering, fading motion trail through the recent path — every projectile gets it
  _trail(ctx, col, dark, lowG) {
    const h = this.hist; if (lowG || h.length < 2) return;
    ctx.save();
    if (dark) ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = col; ctx.lineCap = "round";
    for (let i = 1; i < h.length; i++) {
      const k = i / h.length;
      ctx.globalAlpha = k * 0.5;
      ctx.lineWidth = this.r * 1.7 * k;
      ctx.beginPath(); ctx.moveTo(h[i - 1].x, h[i - 1].y); ctx.lineTo(h[i].x, h[i].y); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  draw(ctx) {
    const C = CONFIG.colors;
    const ink = (typeof THEME !== "undefined") ? THEME.ink : "#000";
    const dark = (typeof THEME !== "undefined") && THEME.dark;
    const lowG = (typeof GFX !== "undefined") && GFX.low;
    // universal motion trail (skipped only for the stationary mine once it settles)
    if (!(this.mine && this.armed) && !this.embedded) {
      const tcol = this.deflected ? (this.perfect ? C.perfect : C.deflected) : (this.tint || (this.shock ? C.slam : this.mud ? C.sludge : this.bomb ? C.bomber : C.enemyShot));
      this._trail(ctx, tcol, dark, lowG);
    }
    if (this.sweeper) {                    // Colossus's thrown shield arm: a rotating bar of death
      const col = this.tint || C.armoredShield;
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.embedded ? 0 : performance.now() / 200);
      ctx.globalAlpha = this.embedded ? 0.62 : 1;
      if (!lowG && !this.embedded) { ctx.shadowColor = col; ctx.shadowBlur = 12; }
      ctx.fillStyle = col; ctx.fillRect(-44, -9, 88, 18);
      ctx.shadowBlur = 0; ctx.strokeStyle = ink; ctx.lineWidth = this.embedded ? 2 : 2.5;
      if (this.embedded) ctx.setLineDash([6, 4]);
      ctx.strokeRect(-44, -9, 88, 18); ctx.setLineDash([]);
      ctx.fillStyle = ink; ctx.fillRect(-6, -6, 12, 12);
      if (this.embedded) {                  // fixed wall-prongs read as an inert lodged prop
        ctx.globalAlpha = 0.75; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-44, -14); ctx.lineTo(-44, 14); ctx.moveTo(44, -14); ctx.lineTo(44, 14); ctx.stroke();
      }
      ctx.restore(); return;
    }
    if (this.shock) {                      // armored stomp shockwave: a ground spike you jump
      const col = this.tint || C.slam;
      ctx.save();
      if (!lowG) { ctx.shadowColor = col; ctx.shadowBlur = 10; }
      ctx.fillStyle = col; ctx.globalAlpha = 0.92;
      ctx.beginPath(); ctx.moveTo(this.x - this.r, this.y + this.r);
      ctx.lineTo(this.x, this.y - this.r); ctx.lineTo(this.x + this.r, this.y + this.r);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore(); return;
    }
    if (this.mud && !this.deflected) {     // sludge glob in flight: a wobbling blob + drip
      const wob = Math.sin(performance.now() / 90) * 1.4;
      ctx.fillStyle = C.sludge; ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r + wob, this.r - wob, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = C.sludge; ctx.beginPath(); ctx.arc(this.x + this.r * 0.5, this.y - this.r * 0.4, this.r * 0.3, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (this.root && !this.deflected) {    // chain shot: two interlocked links, spinning
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(performance.now() / 260);
      ctx.strokeStyle = this.tint || C.enemyShot; ctx.lineWidth = 3.5;
      for (const o of [-this.r * 0.5, this.r * 0.5]) { ctx.beginPath(); ctx.ellipse(o, 0, this.r * 0.7, this.r * 0.45, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore(); return;
    }
    if (this.mine) {                       // floor mine: disk + arming/armed blink
      ctx.fillStyle = this.deflected ? C.deflected : C.bomber;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
      const blink = this.armed ? (Math.floor(performance.now() / 140) % 2 === 0) : false;
      ctx.fillStyle = this.armed ? (blink ? C.charger : ink) : "#888";
      ctx.beginPath(); ctx.arc(this.x, this.y - 1, 2.5, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (this.bomb && !this.deflected) {    // lobbed bomb: impact-shadow telegraph + danger ring + sputtering fuse
      const gy = CONFIG.world.groundY, t = performance.now();
      // ground shadow under the bomb — grows as it falls, telegraphing the danger zone
      const fall = clamp(1 - (gy - this.y) / 460, 0.25, 1);
      ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(this.x, gy - 3, 24 * fall, 6 * fall, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      // pulsing danger ring
      const pulse = 0.5 + 0.5 * Math.sin(t / 110);
      ctx.save(); if (!lowG) { ctx.shadowColor = C.bomber; ctx.shadowBlur = 9; }
      ctx.strokeStyle = C.bomber; ctx.globalAlpha = 0.32 + 0.28 * pulse; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 6 + 3 * pulse, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      // body: dark sphere with a bomber-orange rim + seam
      ctx.save(); if (!lowG) { ctx.shadowColor = C.bomber; ctx.shadowBlur = dark ? 12 : 7; }
      ctx.fillStyle = C.bomber; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(this.x - this.r, this.y); ctx.lineTo(this.x + this.r, this.y);
      ctx.moveTo(this.x, this.y - this.r); ctx.lineTo(this.x, this.y + this.r); ctx.stroke(); ctx.restore();
      // sputtering fuse spark on top
      const fy = this.y - this.r - 5, fl = 0.55 + 0.45 * Math.sin(t / 38);
      ctx.save(); ctx.strokeStyle = ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(this.x, this.y - this.r); ctx.lineTo(this.x, fy); ctx.stroke();
      if (!lowG) { ctx.shadowColor = "#ffd23e"; ctx.shadowBlur = 10; }
      ctx.globalAlpha = fl; ctx.fillStyle = (Math.floor(t / 60) % 2) ? "#ffd23e" : "#ff8a1e";
      ctx.beginPath(); ctx.arc(this.x, fy, 2.5 + 1.6 * fl, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      return;
    }

    if (this.crescent) {   // THE ECHO's tear-slash: a crisp PURPLE crescent (a real, parryable projectile)
      const col = this.deflected ? (this.perfect ? C.perfect : C.deflected) : (this.tint || "#b06cff");
      const ang2 = Math.atan2(this.vy, this.vx), R = this.r * 1.7;
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(ang2);
      if (!lowG) { ctx.shadowColor = col; ctx.shadowBlur = 7; }
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(-R * 0.25, 0, R, -1.25, 1.25, false);
      ctx.arc(-R * 0.95, 0, R * 0.9, 1.08, -1.08, true);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();                     // ink edge = a clear SHAPE, not a blob
      ctx.globalAlpha = 0.7; ctx.strokeStyle = "#efe3ff"; ctx.lineWidth = 1.5;     // thin bright edge, no white wash
      ctx.beginPath(); ctx.arc(-R * 0.25, 0, R, -1.12, 1.12); ctx.stroke(); ctx.globalAlpha = 1;
      if (this.deflected) { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore(); return;
    }

    // --- generic shot: an oriented body with a comet trail, hot core, and soft glow ---
    const col = this.deflected ? (this.perfect ? C.perfect : C.deflected) : (this.tint || (this.bomb ? C.bomber : C.enemyShot));
    const m = len(this.vx, this.vy) || 1, ang = Math.atan2(this.vy, this.vx), r = this.r;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (!lowG) { ctx.shadowColor = col; ctx.shadowBlur = dark ? 12 : 7; }
    ctx.rotate(ang);
    ctx.fillStyle = col; ctx.strokeStyle = ink; ctx.lineWidth = this.charged ? 2.5 : 1.5;
    if (this.kind === "orb" || this.bomb) {            // caster orb / bomb: round body
      const pr = this.bomb ? r : r * (1 + 0.12 * Math.sin(performance.now() / 120));
      ctx.beginPath(); ctx.arc(0, 0, pr, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
      if (this.kind === "orb") { ctx.strokeStyle = "#fff"; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, pr * 0.5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    } else {                                            // streamlined dart, tip forward along travel
      const rx = r * (this.charged ? 1.8 : 1.5), ry = r * 0.92;
      ctx.beginPath(); ctx.moveTo(rx, 0);
      ctx.quadraticCurveTo(0, -ry, -rx * 0.7, -ry * 0.55);
      ctx.quadraticCurveTo(-rx * 0.9, 0, -rx * 0.7, ry * 0.55);
      ctx.quadraticCurveTo(0, ry, rx, 0);
      ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
    }
    // hot white core
    ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.restore();

    if (this.bomb) { ctx.fillStyle = ink; ctx.fillRect(this.x - 1.5, this.y - r - 5, 3, 5); }   // fuse
    if (this.deflected) {                                // rings: it's yours now (double on a perfect parry)
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, r + 5, 0, Math.PI * 2); ctx.stroke();
      if (this.perfect) { ctx.beginPath(); ctx.arc(this.x, this.y, r + 9, 0, Math.PI * 2); ctx.stroke(); }
    }
  }
}

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
  }

  update(dt) {
    if (this.gravity) this.vy += this.gravity * dt;   // bombs arc; mines fall to the floor
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;

    if (this.bounces > 0) {
      // ricochet off the play-area edges
      const r = this.r, W = CONFIG.view.w, top = 0, bottom = CONFIG.world.groundY;
      let hit = false;
      if (this.x < r) { this.x = r; this.vx = Math.abs(this.vx); hit = true; }
      else if (this.x > W - r) { this.x = W - r; this.vx = -Math.abs(this.vx); hit = true; }
      if (this.y < top + r) { this.y = top + r; this.vy = Math.abs(this.vy); hit = true; }
      else if (this.y > bottom - r) { this.y = bottom - r; this.vy = -Math.abs(this.vy); hit = true; }
      if (hit) { this.bounces--; this.vx *= 0.85; this.vy *= 0.85; FX.ring(this.x, this.y, 4); }
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

  draw(ctx) {
    const C = CONFIG.colors;
    if (this.shock) {                      // armored stomp shockwave: a ground spike you jump
      ctx.fillStyle = C.slam; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(this.x - this.r, this.y + this.r);
      ctx.lineTo(this.x, this.y - this.r); ctx.lineTo(this.x + this.r, this.y + this.r);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.stroke();
      return;
    }
    if (this.root && !this.deflected) {    // chain shot: a hollow link ring
      ctx.strokeStyle = C.enemyShot; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.4, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (this.mine) {                       // floor mine: disk + arming/armed blink
      ctx.fillStyle = this.deflected ? C.deflected : C.bomber;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke();
      const blink = this.armed ? (Math.floor(performance.now() / 140) % 2 === 0) : false;
      ctx.fillStyle = this.armed ? (blink ? C.charger : "#000") : "#888";
      ctx.beginPath(); ctx.arc(this.x, this.y - 1, 2.5, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const col = this.deflected ? (this.perfect ? C.perfect : C.deflected) : (this.bomb ? C.bomber : C.enemyShot);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#000"; ctx.lineWidth = this.charged ? 2.5 : 1.5; ctx.stroke();
    if (this.charged && !this.deflected) {   // fast bolt: a motion streak + bright core
      const m = len(this.vx, this.vy) || 1, tl = 24;
      ctx.strokeStyle = col; ctx.globalAlpha = 0.5; ctx.lineWidth = this.r * 1.1; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x - (this.vx / m) * tl, this.y - (this.vy / m) * tl); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.45, 0, Math.PI * 2); ctx.fill();
    }
    if (this.bomb) {                          // fuse spark on top of the lobbed bomb
      ctx.fillStyle = "#000"; ctx.fillRect(this.x - 1.5, this.y - this.r - 5, 3, 5);
    }
    if (this.deflected) {
      // ring to show it's now yours (double ring if a perfect parry)
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 5, 0, Math.PI * 2);
      ctx.stroke();
      if (this.perfect) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 9, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

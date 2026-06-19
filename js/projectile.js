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
  }

  update(dt) {
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
    const m = len(dirX, dirY) || 1;
    const boost = perfect ? CONFIG.blade.deflectBoost * 1.6 : CONFIG.blade.deflectBoost;
    const s = Math.max(speed, CONFIG.proj.speed) * boost;
    this.vx = (dirX / m) * s;
    this.vy = (dirY / m) * s;
    this.deflected = true;
    this.perfect = !!perfect;
    this.deflectDmg = perfect ? 48 : 28;
    this.life = 6;
  }

  draw(ctx) {
    const C = CONFIG.colors;
    const col = this.deflected ? (this.perfect ? C.perfect : C.deflected) : C.enemyShot;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#000"; ctx.lineWidth = this.charged ? 2.5 : 1.5; ctx.stroke();
    if (this.charged && !this.deflected) {   // heavy-shot accent: a pulsing inner core
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.4, 0, Math.PI * 2); ctx.fill();
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

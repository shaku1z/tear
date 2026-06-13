// ------- lightweight black-on-white FX: sparks + shockwave rings -------
const FX = {
  list: [],

  reset() { this.list.length = 0; },

  spark(x, y, dirX, dirY) {
    const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 1.3;
    const sp = 220 + Math.random() * 460;
    this.list.push({
      type: "spark", x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.22 + Math.random() * 0.12, max: 0.34,
    });
  },

  burst(x, y, dirX, dirY, n) {
    for (let i = 0; i < n; i++) this.spark(x, y, dirX, dirY);
  },

  ring(x, y, r0) {
    this.list.push({ type: "ring", x, y, r: r0 || 6, life: 0.32, max: 0.32 });
  },

  // a spinning shard (used for enemy death shatter)
  shard(x, y) {
    const a = Math.random() * Math.PI * 2;
    const sp = 160 + Math.random() * 460;
    this.list.push({
      type: "shard", x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
      rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 18,
      size: 5 + Math.random() * 7,
      life: 0.4 + Math.random() * 0.25, max: 0.65,
    });
  },

  death(x, y, n) {
    for (let i = 0; i < (n || 11); i++) this.shard(x, y);
    this.ring(x, y, 10);
    this.ring(x, y, 4);
  },

  // a fading silhouette (dash afterimage)
  ghost(x, y, hw, hh) {
    this.list.push({ type: "ghost", x, y, hw, hh, life: 0.22, max: 0.22 });
  },

  update(dt) {
    for (const p of this.list) {
      p.life -= dt;
      if (p.type === "spark") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 1300 * dt;   // gravity on sparks
        p.vx *= 0.9;
      } else if (p.type === "ring") {
        p.r += 820 * dt;
      } else if (p.type === "shard") {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += 1500 * dt; p.vx *= 0.92;
        p.rot += p.spin * dt;
      }
      // ghosts just fade in place
    }
    this.list = this.list.filter((p) => p.life > 0);
  },

  draw(ctx) {
    for (const p of this.list) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.strokeStyle = "#000";
      if (p.type === "spark") {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.018, p.y - p.vy * 0.018);
        ctx.stroke();
      } else if (p.type === "ring") {
        ctx.lineWidth = 3 * a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === "shard") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = "#000";
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.6); ctx.lineTo(-s * 0.7, s * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.type === "ghost") {
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = "#000";
        ctx.fillRect(p.x - p.hw, p.y - p.hh, p.hw * 2, p.hh * 2);
      }
    }
    ctx.globalAlpha = 1;
  },
};

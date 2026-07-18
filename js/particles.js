// ------- lightweight FX: sparks + shockwave rings + shards (color-aware) -------
const FX = {
  list: [],

  reset() { this.list.length = 0; },

  spark(x, y, dirX, dirY, col) {
    const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 1.3;
    const sp = 220 + Math.random() * 460;
    this.list.push({
      type: "spark", x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      col: col || "#000",
      life: 0.22 + Math.random() * 0.12, max: 0.34,
    });
  },

  burst(x, y, dirX, dirY, n, col) {
    for (let i = 0; i < n; i++) this.spark(x, y, dirX, dirY, col);
  },

  ring(x, y, r0, col) {
    this.list.push({ type: "ring", x, y, r: r0 || 6, col: col || "#000", life: 0.32, max: 0.32 });
  },

  ribbon(x0, y0, x1, y1, col) {
    this.list.push({ type: "ribbon", x: x0, y: y0, x1, y1, col: col || "#ff8a1e", life: 0.34, max: 0.34 });
  },

  // a spinning shard (used for enemy death shatter)
  shard(x, y, col) {
    const a = Math.random() * Math.PI * 2;
    const sp = 160 + Math.random() * 460;
    this.list.push({
      type: "shard", x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
      rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 18,
      size: 5 + Math.random() * 7, col: col || "#000",
      life: 0.4 + Math.random() * 0.25, max: 0.65,
    });
  },

  death(x, y, n, col) {
    for (let i = 0; i < (n || 11); i++) this.shard(x, y, col);
    this.ring(x, y, 10, col);
    this.ring(x, y, 4, col);
  },

  // ---- explosion kit: a bright flash, expanding shockwave rings, smoke ----
  flash(x, y, r, col) { this.list.push({ type: "flash", x, y, r: r || 50, col: col || "#fff", life: 0.18, max: 0.18 }); },
  shockwave(x, y, r0, col, maxR, thick) {
    const life = 0.42; this.list.push({ type: "shock", x, y, r: r0 || 10, vr: ((maxR || 160) - (r0 || 10)) / life, col: col || "#fff", thick: thick || 6, life, max: life });
  },
  smoke(x, y, col) {
    this.list.push({ type: "smoke", x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 55, size: 9 + Math.random() * 13, col: col || "#33323a", life: 0.5 + Math.random() * 0.45, max: 0.95 });
  },
  // a full explosion: flash core + double shockwave + sparks + shards + embers + smoke.
  explode(x, y, col, scale) {
    scale = scale || 1;
    const low = (typeof GFX !== "undefined") && GFX.low;
    this.flash(x, y, 54 * scale, col);
    this.shockwave(x, y, 16 * scale, col, 175 * scale, 7 * scale);
    this.shockwave(x, y, 6 * scale, "#ffffff", 112 * scale, 3 * scale);
    this.burst(x, y, 0, -0.3, low ? 8 : Math.round(18 * scale), col);
    for (let i = 0; i < (low ? 4 : Math.round(9 * scale)); i++) this.shard(x, y, col);
    if (!low) { for (let i = 0; i < Math.round(5 * scale); i++) this.ember(x, y - 6, col); for (let i = 0; i < Math.round(3 * scale); i++) this.smoke(x, y - 4); }
  },

  // a fading silhouette (dash afterimage). col tints it (e.g. fire for Cinder Trail)
  ghost(x, y, hw, hh, col) {
    this.list.push({ type: "ghost", x, y, hw, hh, col: col || null, life: 0.22, max: 0.22 });
  },

  // a rising, flickering fire ember (burn / flame dash)
  ember(x, y, col) {
    this.list.push({
      type: "ember", x: x + (Math.random() - 0.5) * 12, y: y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 50, vy: -70 - Math.random() * 120,
      col: col || (Math.random() < 0.5 ? "#ff8a1e" : "#ffd23e"),
      size: 2.5 + Math.random() * 3.5, life: 0.35 + Math.random() * 0.35, max: 0.7,
    });
  },

  // a falling blood drip (bleed)
  drip(x, y, col) {
    this.list.push({
      type: "drip", x: x + (Math.random() - 0.5) * 10, y,
      vx: (Math.random() - 0.5) * 36, vy: 20 + Math.random() * 70,
      col: col || "#b81d1d", size: 3 + Math.random() * 3, life: 0.45 + Math.random() * 0.3, max: 0.75,
    });
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
      } else if (p.type === "ember") {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy *= 0.97; p.vx *= 0.94;   // buoyant: coast upward, slowing
      } else if (p.type === "drip") {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += 680 * dt;             // gravity
      } else if (p.type === "shock") {
        p.r += p.vr * dt;
      } else if (p.type === "smoke") {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy *= 0.96; p.vx *= 0.95; p.size += 26 * dt;   // rise + billow
      }
      // flash + ghosts just fade in place
    }
    this.list = this.list.filter((p) => p.life > 0);
  },

  draw(ctx) {
    for (const p of this.list) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      const col = p.col || "#000";
      if (p.type === "spark") {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.018, p.y - p.vy * 0.018);
        ctx.stroke();
      } else if (p.type === "ring") {
        ctx.strokeStyle = col;
        ctx.lineWidth = 3 * a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === "ribbon") {
        ctx.strokeStyle = col; ctx.lineWidth = 3 + a * 4; ctx.lineCap = "round";
        const mx = (p.x + p.x1) * 0.5, my = Math.min(p.y, p.y1) - 55 * (1 - a * 0.35);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(mx, my, p.x1, p.y1); ctx.stroke();
        ctx.globalAlpha = a * 0.72; ctx.strokeStyle = "#fff1c2"; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (p.type === "shard") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = col;
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.6); ctx.lineTo(-s * 0.7, s * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.type === "ghost") {
        ctx.globalAlpha = a * (p.col ? 0.5 : 0.35);
        ctx.fillStyle = p.col || "#000";
        ctx.fillRect(p.x - p.hw, p.y - p.hh, p.hw * 2, p.hh * 2);
      } else if (p.type === "ember") {
        ctx.globalAlpha = a * 0.95;
        ctx.fillStyle = col;
        const s = p.size * (0.5 + a * 0.5);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.type === "drip") {
        ctx.globalAlpha = a;
        ctx.fillStyle = col;
        ctx.fillRect(p.x - 1.5, p.y - p.size, 3, p.size + 1);
      } else if (p.type === "flash") {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const rr = p.r * (1.4 - a * 0.4);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
        g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, col); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = a * 0.7; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (p.type === "shock") {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = a * 0.85; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, p.thick * a);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      } else if (p.type === "smoke") {
        ctx.globalAlpha = a * 0.26; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },
};

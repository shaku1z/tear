import type { MirrorController, MirrorDependencies } from "./mirror-contracts";

type MirrorActionMethods = Pick<MirrorController,
  "_pickMove" | "_startMove" | "_runMove" | "_crescent" | "_fireCrescents" |
  "_flashStep" | "_decide" | "_act" | "_startStrike" | "_aim" | "_updateWaves" |
  "_enterLock" | "_tickLock" | "_breakLock" | "_pointBladeAt" | "_aerialBrain" |
  "_bigSlash" | "updateCombat"
>;

export function createMirrorActions(dependencies: MirrorDependencies): MirrorActionMethods {
  const { CLOCK, CONFIG, FX, GAME_RANDOM, Projectile, SFX, presentation, clamp, lerp, lerpAngle } = dependencies;
  const actions: MirrorActionMethods & ThisType<MirrorController> = {
  _pickMove(player) {
    const a = this.actor, ph = this.phase, adx = Math.abs(player.x - a.x);
    const deck: string[] = [];
    if (player.onGround && adx < 280) deck.push("rend", "rend");
    if (adx > 240 && adx < 540 && this.blade.state === "held") deck.push("throw");
    if (ph >= 2 && adx < 460) deck.push("slam", "slam");
    if (ph >= 2 && adx > 240 && adx < 720) deck.push("getsuga");
    if (ph >= 3) deck.push("getsuga", "slam");
    if (!player.onGround && player.y < a.y - 40 && adx < 240) deck.push("juggle", "juggle");
    if (!deck.length) return null;
    return deck[Math.floor(GAME_RANDOM.next() * deck.length)] ?? null;
  },

  _startMove(id, player) {
    if (id === "lunge") { this._state = "punish"; this._stateT = 0.45; this._decideT = 0.5; this._moveCd = lerp(3.4, 1.7, this.sync); return; }
    if (id === "throw" && this.blade.state !== "held") return;
    if (id === "juggle" && (player.onGround || player.y > this.actor.y)) id = "rend";
    const tele = { rend: 0.34, slam: 0.38, getsuga: 0.3, throw: 0.24, juggle: 0.05 }[id] ?? 0.3;
    this.mv = { id, ph: "tele", t: tele, hitDone: false, k: 0 };
    this._moveCd = lerp(3.4, 1.7, this.sync) + GAME_RANDOM.next() * 0.8;
    this._swingT = 0;
  },

  _runMove(dt, player) {
    const mv = this.mv, a = this.actor, dx = player.x - a.x, dir = Math.sign(dx) || this.facing;
    if (!mv) return;
    mv.t -= dt;
    this.facing = mv.id === "getsuga" || mv.ph === "tele" ? dir : this.facing;
    const setAim = (ang: number): void => {
      const hand = { x: a.x, y: a.y - a.hh * 0.2 }, R = CONFIG.blade.aimRadius;
      this._aimAng = ang;
      const aimOverride = this.blade.aimOverridePoint();
      aimOverride.x = hand.x + Math.cos(ang) * R;
      aimOverride.y = hand.y + Math.sin(ang) * R;
    };

    if (mv.id === "rend") {   // ---- RISING REND: a leaping uppercut that LAUNCHES you ----
      if (mv.ph === "tele") {
        a.vx = lerp(a.vx, 0, clamp(10 * dt, 0, 1));
        setAim(this._dirAng(2.35));                          // blade cocked low behind — the wind-up read
        if (mv.t <= 0) { mv.ph = "exec"; mv.t = 0.42; mv.k = 0; a.vy = -660; a.vx = dir * 420; try { FX.ring(a.x, a.y + a.hh, 14, this.color); } catch { /* feedback is best-effort */ } }
      } else if (mv.ph === "exec") {
        mv.k = Math.min(1, mv.k + dt / 0.34);
        setAim(this._dirAng(lerp(1.1, -1.9, mv.k)));         // the blade RISES through you
        if (mv.t <= 0) { mv.ph = "rec"; mv.t = 0.36; }
      } else { a.vx = lerp(a.vx, 0, clamp(8 * dt, 0, 1)); if (mv.t <= 0) this.mv = null; }
    }

    else if (mv.id === "juggle") {   // ---- JUGGLE: hop after an airborne player and bat them ----
      if (mv.ph === "tele") { if (mv.t <= 0) { mv.ph = "exec"; mv.t = 0.5; mv.k = 0; a.vy = -700; a.vx = clamp(dx * 2.6, -520, 520); } }
      else if (mv.ph === "exec") {
        mv.k = Math.min(1, mv.k + dt / 0.3);
        setAim(this._dirAng(lerp(-1.7, 0.6, mv.k)));         // an overhead air-swat
        if (mv.t <= 0) { mv.ph = "rec"; mv.t = 0.3; }
      } else if (mv.t <= 0) this.mv = null;
    }

    else if (mv.id === "slam") {   // ---- POWER SLAM: leap -> hang -> plunge -> shockwaves ----
      if (mv.ph === "tele") {      // leap up toward a point above the player
        if (mv.k === 0) { mv.k = 1; a.vy = -780; a.vx = clamp(dx * 1.9, -640, 640); }
        setAim(-Math.PI / 2);
        if (mv.t <= 0) { mv.ph = "hang"; mv.t = 0.24; }
      } else if (mv.ph === "hang") {                          // the held beat at the apex — your dodge window
        a.vy = 0; a.vx = lerp(a.vx, 0, clamp(9 * dt, 0, 1));
        setAim(Math.PI / 2);                                  // blade snaps point-DOWN
        if (mv.t <= 0) { mv.ph = "exec"; mv.t = 1.0; try { FX.ring(a.x, a.y, 18, "#e9d5ff"); } catch { /* feedback is best-effort */ } }
      } else if (mv.ph === "exec") {                          // the plunge
        a.vy = 1350; a.vx = lerp(a.vx, 0, clamp(6 * dt, 0, 1));
        setAim(Math.PI / 2);
        if (a.onGround || mv.t <= 0) {
          mv.ph = "rec"; mv.t = 0.45;
          const gy = CONFIG.world.groundY;
          this.waves.push({ x: a.x + 26, y: gy, vx: 620, life: 0.85 }, { x: a.x - 26, y: gy, vx: -620, life: 0.85 });
          this.juice({ shake: 13, hitstop: CONFIG.hitStop.big, zoom: CONFIG.juice.zoomBig });   // the PLUNGE lands like a hammer
          try { FX.explode(a.x, gy - 6, this.color, 1.25); FX.ring(a.x, gy - 4, 30, "#ffffff"); FX.ring(a.x, gy - 4, 18, this.color); FX.burst(a.x, gy - 8, 0, -1, 20, this.color); } catch { /* feedback is best-effort */ }
        }
      } else { a.vx = lerp(a.vx, 0, clamp(8 * dt, 0, 1)); if (mv.t <= 0) this.mv = null; }
    }

    else if (mv.id === "getsuga") {   // ---- CRESCENT REND: overhead chop rips a tear-wave loose ----
      if (mv.ph === "tele") {
        a.vx = lerp(a.vx, 0, clamp(10 * dt, 0, 1));
        setAim(-Math.PI / 2);                                 // raised high — the read
        if (mv.t <= 0) { mv.ph = "exec"; mv.t = 0.22; mv.k = 0; }
      } else if (mv.ph === "exec") {
        mv.k = Math.min(1, mv.k + dt / 0.22);
        setAim(this._dirAng(lerp(-1.55, 0.75, mv.k)));        // the chop
        if (!mv.hitDone && mv.k > 0.45) { mv.hitDone = true; this._fireCrescents(player); a.vx -= dir * 130; }
        if (mv.t <= 0) { mv.ph = "rec"; mv.t = 0.38; }
      } else { a.vx = lerp(a.vx, 0, clamp(8 * dt, 0, 1)); if (mv.t <= 0) this.mv = null; }
    }

    else if (mv.id === "throw") {   // ---- BLADE THROW (P3: flash-step to the embedded blade) ----
      if (mv.ph === "tele") {
        const ang = Math.atan2(player.y - (a.y - a.hh * 0.2), player.x - a.x);
        setAim(ang);
        if (mv.t <= 0) {
          this.blade.throwBlade(); this._recallT = 0.9; this._threwHit = false;
          this._fsPending = this.phase >= 3;
          this.mv = null; this._state = "throw";
          try { if (typeof SFX !== "undefined") SFX.throwBlade(); } catch { /* feedback is best-effort */ }
        }
      }
    }
    else this.mv = null;
  },

  // fire a crescent as a REAL projectile (parryable / deflectable through the game's own system)
  _crescent(x, y, ang, sp, dmg, r) {
    const p = new Projectile(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp);
    p.crescent = true; p.kind = "crescent"; p.tint = "#b06cff"; p.dmg = dmg; p.r = r; p.life = 2.4; p.deflectDmg = 34;
    this._proj.push(p);
  },
  // QUALITY over quantity: one big, FAST crescent (a tight fan only in the final form)
  _fireCrescents(player) {
    const a = this.actor, ph = this.phase;
    const ang = Math.atan2(player.y - (a.y - a.hh * 0.4), player.x - a.x);
    const sp = 760 + ph * 90, n = ph >= 3 ? 3 : 1, spread = 0.13;
    const ox = a.x + Math.cos(ang) * 52, oy = a.y - a.hh * 0.4 + Math.sin(ang) * 20;
    for (let i = 0; i < n; i++) this._crescent(ox, oy, ang + (i - (n - 1) / 2) * spread, sp, 16 + ph * 5, 26 + ph * 3);
    this.juice({ shake: 5 });
    try { if (typeof SFX !== "undefined") SFX.crescent(); FX.flash(ox, oy, 34, "#c98cff"); FX.burst(ox, oy, Math.cos(ang), Math.sin(ang), 12, this.color); } catch { /* feedback is best-effort */ }
  },

  _flashStep(player) {   // vanish and reappear at the embedded blade, catching it mid-strike
    const a = this.actor, b = this.blade;
    this.imgs.push({ x: a.x, y: a.y, f: this.facing, t: 0.4 }, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 20, f: this.facing, t: 0.3 });
    try { FX.ghost(a.x, a.y, a.hw, a.hh, this.color); FX.burst(b.x, b.y, 0, -1, 8, "#e9d5ff"); } catch { /* feedback is best-effort */ }
    a.x = clamp(b.x, 40, CONFIG.view.w - 40); a.y = Math.min(b.y, CONFIG.world.groundY - a.hh); a.vx = 0; a.vy = 0;
    b.tryRecall(a);
    this._fsPending = false;
    this.facing = Math.sign(player.x - a.x) || 1;
    this._startStrike(this.facing);   // arrival strike
  },

  // =====================================================================
  //  NEUTRAL GAME (between committed moves)
  // =====================================================================
  _decide(dt, player) {
    const R = this.read, a = this.actor, B = CONFIG.blade;
    const dist = Math.abs(player.x - a.x);
    const incoming = R.pBladeSpeed > B.minHitSpeed * 1.3 && dist < 150 && !player.invulnerable;
    if (incoming && GAME_RANDOM.next() < this.sync * dt * 22) { this._state = "dodge"; this._stateT = 0.3; this._decideT = 0.18; return; }
    if (this.blade.state !== "held") { this._state = "throw"; return; }
    if (this._state === "echo") { if (this._echoPtr < this._echoClip.length) return; this._state = "space"; }
    this._echoCd -= dt;
    if (this._echoCd <= 0 && this.echoBuf.length >= 40 && dist < 460) {
      this._echoClip = this.echoBuf.slice(-96); this._echoPtr = 0; this._state = "echo";
      this._echoCd = lerp(9, 5, this.sync) + GAME_RANDOM.next() * 2;
      return;
    }
    this._decideT -= dt;
    if (this._decideT > 0) return;
    this._decideT = lerp(0.42, 0.12, this.sync);
    if (dist > 320) this._state = "approach";
    else if (dist < 170) {
      if (R.aggression > 0.45 && GAME_RANDOM.next() < 0.55) { this._state = "bait"; this._stateT = 0.4 + GAME_RANDOM.next() * 0.3; }
      else { this._state = "strike"; this._stateT = 0.2; }
    } else {
      if (R.pBladeSpeed < B.minHitSpeed * 0.6 && R.aggression > 0.3) { this._state = "punish"; this._stateT = 0.45; }
      else this._state = "space";
    }
  },

  _act(dt, player) {
    const a = this.actor, ai = this.ai;
    const dx = player.x - a.x, adx = Math.abs(dx), dir = Math.sign(dx) || 1, away = -dir;
    this.facing = dir;
    this._dashCd -= dt; this._jumpCd -= dt; if (this._stateT > 0) this._stateT -= dt;
    const band = 120 + (this.blade.lengthBonus ?? 0) * 0.6;
    let wantSwing = false;

    switch (this._state) {
      case "approach":
        if (dx > 0) ai.right = true; else ai.left = true;
        if (this._dashCd <= 0 && a.dashCharges > 0 && adx > 320) { ai._dash = true; this._dashCd = 0.8; }
        break;
      case "space":
        if (adx > band + 40) { if (dx > 0) ai.right = true; else ai.left = true; }
        else if (adx < band - 40) { if (dx > 0) ai.left = true; else ai.right = true; }
        break;
      case "strike":
        if (this.parryWary && player.guardT > 0 && GAME_RANDOM.next() < this.sync) {
          if (adx < band) { if (away > 0) ai.right = true; else ai.left = true; }
          break;
        }
        if (adx > band) { if (dx > 0) ai.right = true; else ai.left = true; }
        wantSwing = true;
        break;
      case "bait":
        if (this._stateT > 0.2) { if (dx > 0) ai.right = true; else ai.left = true; }
        else { if (away > 0) ai.right = true; else ai.left = true;
               if (this._dashCd <= 0 && a.dashCharges > 0) { ai._dash = true; this._dashCd = 0.7; } }
        break;
      case "punish":
        if (dx > 0) ai.right = true; else ai.left = true;
        if (this._dashCd <= 0 && a.dashCharges > 0 && adx > 90) { ai._dash = true; this._dashCd = 0.6; }
        wantSwing = adx < band + 50;
        break;
      case "dodge":
        if (away > 0) ai.right = true; else ai.left = true;
        if (this._dashCd <= 0 && a.dashCharges > 0) { ai._dash = true; this._dashCd = 0.5; }
        break;
      case "echo": {
        const s = this._echoClip[this._echoPtr++];
        if (s) {
          if (s.adv > 0) { if (dx > 0) ai.right = true; else ai.left = true; }
          else if (s.adv < 0) { if (away > 0) ai.right = true; else ai.left = true; }
          if (s.dash && this._dashCd <= 0 && a.dashCharges > 0) { if (dx > 0) ai.right = true; else ai.left = true; ai._dash = true; this._dashCd = 0.4; }
          if (s.jump && a.onGround && this._jumpCd <= 0) { ai._jump = true; this._jumpCd = 0.5; }
          wantSwing = !!s.swing;
        }
        break;
      }
      case "throw":   // blade is out: kite until it comes home
        if (adx < 240) { if (away > 0) ai.right = true; else ai.left = true; }
        else if (adx > 380) { if (dx > 0) ai.right = true; else ai.left = true; }
        break;
    }
    const airThresh = 0.5 - this.airBias * 0.28 * this.sync;
    if (this.read.airborne > airThresh && player.y < a.y - 60 && a.onGround && this._jumpCd <= 0) { ai._jump = true; this._jumpCd = 0.9; }
    this._aim(dt, player, wantSwing);
  },

  // pick a PRECISE strike — mostly vertical (overhead chop / rising cut), sometimes a flat cut.
  // atan2(dy, dx*F) auto-mirrors across facing. Momentum: it whips (smoothstep) + leans in.
  _startStrike(F) {
    const r = GAME_RANDOM.next();
    if (r < 0.44) { this._swingFrom = Math.atan2(-1.0, 0.12 * F); this._swingTo = Math.atan2(0.85, 0.85 * F); this._swingKind = "chop"; }        // overhead DOWN
    else if (r < 0.76) { this._swingFrom = Math.atan2(0.9, 0.7 * F); this._swingTo = Math.atan2(-1.0, 0.35 * F); this._swingKind = "rise"; }      // rising UP
    else { this._swingFrom = Math.atan2(-0.15, -0.95 * F); this._swingTo = Math.atan2(0.15, 0.95 * F); this._swingKind = "cut"; }                  // flat CUT across
    this._swingT = 0.18;
    try { if (typeof SFX !== "undefined") SFX.swing(2500); } catch { /* feedback is best-effort */ }
  },

  // ---- blade carriage: a crisp committed STRIKE on demand, otherwise rest the blade VERTICAL
  // (held high when sealed, dragged low once torn) — a stance + planned cuts, never a flail ----
  _aim(dt, player, wantSwing) {
    const a = this.actor, hand = { x: a.x, y: a.y - a.hh * 0.2 }, R = CONFIG.blade.aimRadius;
    const reach = Math.hypot(player.x - hand.x, player.y - hand.y);
    const rr = 150 + (this.blade.lengthBonus ?? 0) * 0.9;
    this._swingT -= dt;
    if (wantSwing && this._swingT <= -0.34 && reach < rr) this._startStrike(Math.sign(player.x - a.x) || this.facing);
    if (this._swingT > 0) {
      const k = 1 - this._swingT / 0.18, e = k * k * (3 - 2 * k);   // smoothstep = a WHIP: slow cock, fast cut
      this._aimAng = lerpAngle(this._swingFrom, this._swingTo, e);
      if (k > 0.25 && k < 0.8 && a.onGround && !this.mv) {           // momentum: step into the cut so it carries weight
        const dir = Math.sign(player.x - a.x) || this.facing; a.vx = lerp(a.vx, dir * 300, clamp(9 * dt, 0, 1));
      }
    } else {
      const rest = this.phase >= 2 ? Math.PI / 2 : -Math.PI / 2;
      this._aimAng = lerpAngle(this._aimAng, rest, clamp(6 * dt, 0, 1));
    }
    const aimOverride = this.blade.aimOverridePoint();
    aimOverride.x = hand.x + Math.cos(this._aimAng) * R;
    aimOverride.y = hand.y + Math.sin(this._aimAng) * R;
  },

  // =====================================================================
  //  PROJECTILE-LIKE HAZARDS the boss owns (crescents + ground waves)
  // =====================================================================
  _updateWaves(dt) {
    if (!this.waves.length) return;
    for (const w of this.waves) { w.x += w.vx * dt; w.life -= dt; }
    this.waves = this.waves.filter((w) => w.life > 0 && w.x > -40 && w.x < CONFIG.view.w + 40);
  },

  // =====================================================================
  //  THE SABER LOCK — a Star Wars blade bind: cross, spark, struggle, break
  // =====================================================================
  _enterLock(x, y, player) {
    // SHORT + snappy so it never kills momentum: a quick bind you resolve in a heartbeat
    this.lock = { t: 0.4, x, y, press: 0.5, sparkT: 0 };
    if (this.host) this.host.hitCd = Math.max(this.host.hitCd, 0.42);   // no chip trades while bound
    this._clashCd = 0.4; player.iframe = Math.max(player.iframe, 0.1);
    this.juice({ shake: 5, flash: 0.12 });
    try { if (typeof SFX !== "undefined") SFX.saberLock(); FX.flash(x, y, 44, "#ffffff"); FX.ring(x, y, 15, this.color); } catch { /* feedback is best-effort */ }
  },
  _tickLock(dt, player, playerBlade) {
    const L = this.lock;
    if (!L) return;
    L.t -= dt;
    if (playerBlade.state === "held") { L.x = (this.blade.tipX + playerBlade.tipX) / 2; L.y = (this.blade.tipY + playerBlade.tipY) / 2; }
    // PRESS: a fast player blade pushes toward YOU winning; letting up lets the reflection win.
    // Fast build so the short bind still resolves decisively.
    const pressing = (playerBlade.state === "held" && playerBlade.tipSpeed > CONFIG.blade.minHitSpeed * 0.45) ? 1 : -0.95;
    L.press = clamp(L.press + pressing * dt * 1.6, 0, 1);
    player.vx = lerp(player.vx, (L.x - player.x) * 1.5, clamp(6 * dt, 0, 1));   // eased hold, not a freeze
    player.iframe = Math.max(player.iframe, 0.08);
    L.sparkT -= dt;
    if (L.sparkT <= 0) {   // pour sparks + a metallic sizzle
      L.sparkT = 0.03;
      try { presentation.saberLockSparks(L.x, L.y, this.color); if (typeof SFX !== "undefined") SFX.saberSizzle(); } catch { /* feedback is best-effort */ }
      this.juice({ shake: 2 });
    }
    if (L.t <= 0) this._breakLock(player);
  },
  _breakLock(player) {
    const L = this.lock;
    if (!L) return;
    const a = this.actor, s = Math.sign(player.x - a.x) || 1, won = L.press > 0.6;
    // NO slow-mo (it killed momentum) — a crisp shove + a tiny hitstop only
    if (won) {   // you OVERPOWER the reflection: flung back + staggered = a punish window
      a.vx += -s * 900; a.vy -= 240; this._stagger = 0.5; this.sync = clamp(this.sync - 0.22, 0.15, 1);
      this.juice({ txt: "GUARD BROKEN", x: L.x, y: L.y - 24, big: true, quiet: true, color: "#4bd6ff", shake: 9, hitstop: CONFIG.hitStop.small });
      try { if (typeof SFX !== "undefined") SFX.saberBreak(true); } catch { /* feedback is best-effort */ }
    } else {     // the reflection overpowers YOU: shoved back + chipped (drop bind i-frames so it lands)
      player.iframe = 0; player.vx += s * 760; player.vy -= 200; player.takeHit(9 + this.phase * 4, s, -0.4, a); this._syncBump += 0.06;
      this.juice({ txt: "OVERPOWERED", x: L.x, y: L.y - 24, big: true, quiet: true, color: this.color, shake: 8, hitstop: CONFIG.hitStop.small });
      try { if (typeof SFX !== "undefined") { SFX.saberBreak(false); SFX.hurt(); } } catch { /* feedback is best-effort */ }
    }
    try { FX.flash(L.x, L.y, 62, "#ffffff"); FX.ring(L.x, L.y, 28, this.color); FX.ring(L.x, L.y, 15, "#ffffff"); FX.burst(L.x, L.y, 0, 0, 24, "#ffffff"); FX.burst(L.x, L.y, 0, -1, 12, this.color); } catch { /* feedback is best-effort */ }
    this.lock = null;
  },
  _pointBladeAt(pt, k) {
    const a = this.actor, hand = { x: a.x, y: a.y - a.hh * 0.2 }, R = CONFIG.blade.aimRadius;
    const ang = Math.atan2(pt.y - hand.y, pt.x - hand.x);
    this._aimAng = lerpAngle(this._aimAng, ang, k);
    const aimOverride = this.blade.aimOverridePoint();
    aimOverride.x = hand.x + Math.cos(this._aimAng) * R;
    aimOverride.y = hand.y + Math.sin(this._aimAng) * R;
  },
  _aerialBrain(dt, player) {
    const a = this.actor, gy = CONFIG.world.groundY;
    this._air ??= { st: "hover", t: 1.1, side: null, tx: 0, ty: 0, dvx: 0, dvy: 0, raise: 0, cx: 0, _rt: 0 };
    const A = this._air; A.t -= dt; a.onGround = false;
    this.facing = Math.sign(player.x - a.x) || this.facing;
    if (A.st === "hover") {                              // KEEP FAR: hover high on a side at a big standoff
      A.side ??= (player.x < CONFIG.view.w / 2) ? 1 : -1;
      const weave = Math.sin(CLOCK.sim * 1000 / 780) * 130;
      const tx = clamp(player.x + A.side * (410 + weave), 90, CONFIG.view.w - 90), ty = clamp(player.y - 285, 70, gy - 150);
      a.x += (tx - a.x) * clamp(2.1 * dt, 0, 1); a.y += (ty - a.y) * clamp(2.1 * dt, 0, 1); a.vx = 0; a.vy = 0;
      this._pointBladeAt(player, clamp(5 * dt, 0, 1));
      if (A.t <= 0) {
        const r = GAME_RANDOM.next();
        if (r < 0.4) { A.st = "aim"; A.t = 0.4; A.tx = player.x; A.ty = player.y; A.side = -A.side; this.juice({ shake: 3 }); }
        else if (r < 0.6 && this.blade.state === "held") { A.st = "throwaim"; A.t = 0.3; A.tx = player.x; A.ty = player.y; }
        else if (r < 0.8 && this.blade.state === "held") { A.st = "corner"; A.raise = 0; A.cx = (player.x < CONFIG.view.w / 2) ? CONFIG.view.w - 190 : 190; this.juice({ shake: 4 }); }   // the corner OVERHEAD SLAM
        else { this._fireCrescents(player); A.t = 0.8 + GAME_RANDOM.next() * 0.5; }
      }
    } else if (A.st === "aim") {                        // lock the dive line (telegraph)
      a.vx = 0; a.vy = 0;
      this._pointBladeAt({ x: A.tx, y: A.ty }, clamp(9 * dt, 0, 1));
      if (A.t <= 0) {
        A.st = "dive"; A.t = 0.45;
        const m = Math.hypot(A.tx - a.x, A.ty - a.y) || 1; A.dvx = (A.tx - a.x) / m * 1650; A.dvy = (A.ty - a.y) / m * 1650;
        try { if (typeof SFX !== "undefined") SFX.swing(3400); } catch { /* feedback is best-effort */ }
      }
    } else if (A.st === "throwaim") {                   // wind up a blade THROW from the air (like you)
      a.vx = lerp(a.vx, 0, clamp(6 * dt, 0, 1)); a.vy = lerp(a.vy, 0, clamp(6 * dt, 0, 1));
      this._pointBladeAt({ x: A.tx, y: A.ty }, clamp(10 * dt, 0, 1));
      if (A.t <= 0) { this.blade.throwBlade(); A._rt = 1.0; this._threwHit = false; A.st = "throw"; this.juice({ shake: 3 }); try { if (typeof SFX !== "undefined") SFX.throwBlade(); } catch { /* feedback is best-effort */ } }
    } else if (A.st === "throw") {                      // blade is out — hold height, recall when home
      const ty = clamp(player.y - 285, 70, gy - 150);
      a.vx = lerp(a.vx, 0, clamp(4 * dt, 0, 1)); a.y += (ty - a.y) * clamp(1.8 * dt, 0, 1); a.x += a.vx * dt;
      if (this.blade.state === "held") { A.st = "hover"; A.t = 0.7 + GAME_RANDOM.next() * 0.4; }
      else { A._rt -= dt; if (A._rt <= 0 || this.blade.state === "embedded") this.blade.tryRecall(this.actor); }
    } else if (A.st === "corner") {                     // rise to a TOP corner, blade straight UP, and GROW it huge
      const tx = A.cx, ty = 130;
      a.x += (tx - a.x) * clamp(2.8 * dt, 0, 1); a.y += (ty - a.y) * clamp(2.8 * dt, 0, 1); a.vx = 0; a.vy = 0;
      this._pointBladeAt({ x: a.x, y: a.y - 400 }, clamp(11 * dt, 0, 1));         // sword points to the sky
      A.raise = Math.min(1, (A.raise || 0) + dt / 0.85);
      this.blade.lengthBonus = 100 + A.raise * 230;                              // it GROWS enormously
      if (A.raise >= 1 && Math.abs(a.x - tx) < 46 && Math.abs(a.y - ty) < 46) {
        A.st = "cornerslam"; A.tx = player.x; this.juice({ shake: 6, flash: 0.22 });
        try { if (typeof SFX !== "undefined") SFX.swing(3600); FX.flash(this.blade.tipX, this.blade.tipY, 42, "#c98cff"); } catch { /* feedback is best-effort */ }
      }
    } else if (A.st === "cornerslam") {                 // SLAM straight down, sword facing DOWN -> a HUGE purple rend
      a.vy = 1600; a.vx = lerp(a.vx, (A.tx - a.x) * 1.4, clamp(4 * dt, 0, 1)); a.x += a.vx * dt; a.y += a.vy * dt;
      this._pointBladeAt({ x: a.x, y: a.y + 400 }, 1);                            // sword points down through the slam
      this.imgs.push({ x: a.x, y: a.y, f: this.facing, t: 0.32 });
      if (a.y >= gy - a.hh) { a.y = gy - a.hh; this._bigSlash(a.x); this.blade.lengthBonus = 100; A.st = "hover"; A.t = 1.3; }
    } else {                                            // DIVE — sword-first plunge
      a.x += A.dvx * dt; a.y += A.dvy * dt;
      this.imgs.push({ x: a.x, y: a.y, f: this.facing, t: 0.26 });
      this._pointBladeAt({ x: a.x + A.dvx, y: a.y + A.dvy }, 1);
      if (a.y >= gy - a.hh || A.t <= 0) {
        a.y = Math.min(a.y, gy - a.hh);
        A.st = "hover"; A.t = 0.9 + GAME_RANDOM.next() * 0.6;
        this.juice({ shake: 8, hitstop: CONFIG.hitStop.small });
        try { if (typeof SFX !== "undefined") SFX.slam(); FX.ring(a.x, a.y, 22, this.color); FX.burst(a.x, a.y, 0, -1, 12, this.color); } catch { /* feedback is best-effort */ }
      }
    }
    a.x = clamp(a.x, 40, CONFIG.view.w - 40);
  },
  _bigSlash(x) {   // the corner-slam payoff: a HUGE purple rend — twin sweeping crescents + wide shockwaves
    const gy = CONFIG.world.groundY;
    this.waves.push({ x: x + 34, y: gy, vx: 900, life: 1.15, big: true }, { x: x - 34, y: gy, vx: -900, life: 1.15, big: true });
    this._crescent(x, gy - 34, 0.06, 720, 22, 58);
    this._crescent(x, gy - 34, Math.PI - 0.06, 720, 22, 58);
    this.juice({ shake: 16, hitstop: CONFIG.hitStop.big, zoom: CONFIG.juice.zoomBig, txt: "TEAR", x, y: gy - 130, big: true });
    try { if (typeof SFX !== "undefined") { SFX.boom(); SFX.slam(); } FX.explode(x, gy - 8, this.color, 1.9); FX.ring(x, gy - 4, 48, "#ffffff"); FX.ring(x, gy - 4, 28, this.color); FX.burst(x, gy - 10, 0, -1, 34, this.color); } catch { /* feedback is best-effort */ }
  },

  // =====================================================================
  //  THE ISOLATED COMBAT EXCHANGE (game.js calls this once per step)
  //  The host takes the player's blade through the NORMAL enemy loop — this
  //  handles only what that loop can't: the boss's own weapon vs the player,
  //  the blade CLASH, crescent deflects, and hazard contact.
  // =====================================================================
  updateCombat(dt, player, playerBlade) {
    // The shared boss-death theater retains the host for a short kill-cam. That pose is
    // visual-only: the Echo's isolated weapon loop must not keep hurting the player while
    // the normal enemy loop is advancing Enemy.updateDeath().
    if (!this.active || !this.host || this.host.dead || this.host.dying) return;
    const a = this.actor, mb = this.blade, B = CONFIG.blade;
    this.pb = playerBlade;   // perception cache

    // (0) THE SABER LOCK — a Star Wars blade duel. Two momentum blades meet tip-to-tip at
    // speed and BIND: they cross, sparks pour, the ground trembles, and a press-struggle
    // decides who's thrown back. Keep your blade fast to overpower it; let up and it breaks YOU.
    if (this.lock) { this._tickLock(dt, player, playerBlade); return; }
    if (this._clashCd <= 0 && playerBlade.state === "held" && mb.state === "held" &&
        playerBlade.tipSpeed > B.minHitSpeed * 1.05 && mb.tipSpeed > B.minHitSpeed * 0.65 &&
        Math.hypot(playerBlade.tipX - mb.tipX, playerBlade.tipY - mb.tipY) < 42) {
      this._enterLock((playerBlade.tipX + mb.tipX) / 2, (playerBlade.tipY + mb.tipY) / 2, player);
      return;
    }

    // (1) the boss's HELD blade vs the player — with per-move flavor (launch / spike / juggle)
    if (mb.state === "held" && mb.tipSpeed > B.minHitSpeed && !player.invulnerable &&
        this.segNear(mb.x, mb.y, mb.tipX, mb.tipY, player.x, player.y, player.hw + 10)) {
      const dmg = mb.damageAt() * 0.65;   // the Echo's blade bites, but doesn't shred (balance tune)
      if (dmg > 0) {
        const mv = this.mv;
        if (mv?.ph === "exec") {
          if (mv.id === "rend") { player.takeHit(dmg, mb.tipVX, mb.tipVY, a); player.vy = -720; this.juice({ txt: "LAUNCHED", x: player.x, y: player.y - 46, color: this.color, hitstop: CONFIG.hitStop.small, shake: 6 }); this._syncBump += 0.05; try { if (typeof SFX !== "undefined") SFX.updraft(); } catch { /* feedback is best-effort */ } if (this.phase >= 2) { this._answer = "juggle"; this._answerT = 0.28; } return; }
          if (mv.id === "slam") { player.takeHit(dmg * 1.4, 0, 1, a); player.vy = Math.max(player.vy, 520); this._syncBump += 0.05; return; }
          if (mv.id === "juggle") { player.takeHit(dmg, mb.tipVX, mb.tipVY, a); player.vy = Math.min(player.vy, -380); this._syncBump += 0.05; return; }
        }
        player.takeHit(dmg, mb.tipVX, mb.tipVY, a); this._syncBump += 0.05;
      }
    }

    // (2) the boss's THROWN blade vs the player — one hit per throw
    if ((mb.state === "flying" || mb.state === "returning") && !this._threwHit && !player.invulnerable &&
        this.segNear(mb.x, mb.y, mb.tipX, mb.tipY, player.x, player.y, player.hw + 12)) {
      player.takeHit(mb.throwDmg || 20, mb.vx, mb.vy, a); this._threwHit = true; this._syncBump += 0.05;
    }

    // (crescents are real projectiles now — the game's own loop handles their damage,
    //  parry, and deflect-back; nothing to do here)

    // (3) ground shockwaves vs the player (jump them) — the corner-slam rend hits wider + harder
    for (const w of this.waves) {
      if (!w.hit && !player.invulnerable && Math.abs(w.x - player.x) < (w.big ? 40 : 26) && player.y + player.hh > CONFIG.world.groundY - 44) {
        w.hit = true; player.takeHit((w.big ? 22 : 12) + this.phase * 4, w.vx, -0.4, a); player.vy = Math.min(player.vy, -420);
      }
    }
  },

  };
  return actions;
}

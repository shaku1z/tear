import type { BladePoint } from "./blade";
import type { PlayerPlatformPort } from "./player";
import { createMirrorActions } from "./mirror-actions";
import type {
  MirrorController, MirrorDependencies, MirrorMods, MirrorPlayerPort, MirrorProjectilePort,
} from "./mirror-contracts";

export * from "./mirror-contracts";

export function createMirrorTypes(dependencies: MirrorDependencies) {
  const {
  Blade, CONFIG, Enemy, FX, GAME_RANDOM, Player, Projectile, SFX, presentation,
  clamp, getWeapon, lerp,
  } = dependencies;
// ------- THE ECHO (reborn): a real momentum-blade boss that reads, mirrors, and answers you -------
// One boss, two layers:
//   MirrorHost (bottom of file) — a REAL Enemy in enemies[]: it carries the boss HP bar, takes
//     blade hits / statuses / knockback through every existing combat system, scales with
//     difficulty, and dies through the normal boss-death flow. The body.
//   Mirror (this object) — the brain: a real Player (aiInput) + real Blade (aimOverride) with a
//     full boss moveset (rising rend, power slam, juggles, blade throw + flash-step, crescent
//     rends), trick-mirroring taken from the classic Echo, ghost-echo replay, sync escalation,
//     and phase-driven looks (sealed silhouette -> torn cracks -> white-out final).
// Isolation contract: nothing in the enemy/boss loops knows this exists beyond the host being a
// normal enemy; game.js consumes Mirror.fxq for shake/floaters and calls Mirror.updateCombat.
const Mirror: MirrorController = {
  active: false,
  host: null,          // the MirrorHost enemy (HP source of truth, boss bar, statuses)
  actor: new Player(0, 0), // replaced atomically by attach()
  blade: new Blade(),      // replaced atomically by attach()
  facing: 1,
  color: "#b06cff",    // the tear-violet identity
  ai: { left: false, right: false, up: false, down: false, _dash: false, _jump: false },
  fxq: [],             // juice queue for game.js: {shake, flash, txt, x, y, big, color}
  sync: 0.35, read: { dist: 300, airborne: 0, aggression: 0, dashHeat: 0, closing: 0, pBladeSpeed: 0 },
  _state: "approach", _stateT: 0, _decideT: 0, _swingT: 0, _swingDir: 1, _swingBase: 0, _aimAng: -Math.PI / 2,
  _swingFrom: 0, _swingTo: 0, _swingKind: "",
  _dashCd: 0, _jumpCd: 0, _clashCd: 0, _syncBump: 0, lock: null, _air: null,
  _pDashPrev: 0, _pPrevX: 0, _pDashPrev2: 0, _pGroundPrev: true, _prevDist: 300,
  echoBuf: [], _echoClip: [], _echoPtr: 0, _echoCd: 6, mv: null, _moveCd: 2.2,
  waves: [], imgs: [], _recallT: 0, _fsPending: false, _threwHit: false,
  seenTrickT: 0, _answer: "", _answerT: 0, _lastAnswered: "", _phaseMark: 1,
  white: 0, _wtT: 5.5, _sparkT: 0, _stagger: 0, mods: {}, airBias: 0, parryWary: 0, _proj: [],

  // ---- tiny helpers ----
  segNear(ax, ay, bx, by, px, py, r) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) <= r;
  },
  _dirAng(a) { return this.facing > 0 ? a : Math.PI - a; },   // mirror an angle across facing
  juice(q) { this.fxq.push(q); },

  get phase() {   // 1 sealed -> 2 torn -> 3 final (same thresholds as the classic Echo)
    if (!this.host) return 1;
    const f = this.host.hp / this.host.maxHp;
    return f > 0.6 ? 1 : (f > 0.25 ? 2 : 3);
  },

  // ---- attach the brain to a freshly spawned host ----
  attach(host, mods) {
    this.host = host;
    const a = this.actor = new Player(host.x, host.y);
    a.maxHp = a.hp = 99999;                 // the actor never "dies" — the host's HP is the fight
    a.maxDashCharges = 2; a.dashCharges = 2;
    const ai = this.ai = { left: false, right: false, up: false, down: false, _dash: false, _jump: false };
    a.aiInput = {
      left: () => ai.left, right: () => ai.right, up: () => ai.up, down: () => ai.down,
      dashPressed: () => { const v = ai._dash; ai._dash = false; return v; },
      jumpPressed: () => { const v = ai._jump; ai._jump = false; return v; },
    };
    const b = this.blade = new Blade();
    // Echo mirrors the equipped silhouette and the already-active global handling
    // tune, but deliberately keeps the shared straight throw. Full Anchor/Bind/Circuit
    // states would let boss AI create impossible control loops against the player.
    const reflectedWeapon = typeof getWeapon === "function" ? getWeapon((mods?.weaponId) ?? "sword") : null;
    if (reflectedWeapon) { b.model = reflectedWeapon.model || "sword"; b.mirroredWeaponId = reflectedWeapon.id; }
    const aimOverride = b.aimOverridePoint();
    aimOverride.x = host.x; aimOverride.y = host.y - 120;
    b.lmbOverride = false;
    b.trailColor = "#b06cff"; b.glowColor = "#c98cff";
    b.freeRecall = true; b.hideThrowUI = true;
    b.lengthBonus = 30;                     // ~5 Long-Arms as the SEALED baseline (grows per phase)

    this.sync = 0.35;
    this.read = { dist: 300, airborne: 0, aggression: 0, dashHeat: 0, closing: 0, pBladeSpeed: 0 };
    this._state = "approach"; this._stateT = 0; this._decideT = 0;
    this._swingT = 0; this._swingDir = 1; this._swingBase = 0; this._aimAng = -Math.PI / 2;
    this._dashCd = 0; this._jumpCd = 0; this._clashCd = 0; this._syncBump = 0; this.lock = null;
    this._air = null;   // P3 aerial director state
    this._pDashPrev = 0; this._pPrevX = host.x; this._pDashPrev2 = 0; this._pGroundPrev = true; this._prevDist = 300;
    this.echoBuf = []; this._echoClip = []; this._echoPtr = 0; this._echoCd = 6;
    this.mv = null; this._moveCd = 2.2;     // committed-move director
    this.waves = []; this.imgs = [];   // crescents are real projectiles now (see _crescent)
    this._recallT = 0; this._fsPending = false; this._threwHit = false;
    this.seenTrickT = 0; this._answer = ""; this._answerT = 0; this._lastAnswered = "";
    this._phaseMark = 1; this.white = 0; this._wtT = 5.5; this._sparkT = 0; this._stagger = 0;
    this.mods = mods ?? {};
    this.airBias = (this.mods.airBonus || this.mods.aerialRave) ? 1 : 0;
    this.parryWary = (this.mods.parryGuard || this.mods.backlash || this.mods.backlashSurge || this.mods.parryStun) ? 1 : 0;
    this.active = true;
    return this;
  },

  _hasMove() { return this.mv !== null; },

  // =====================================================================
  //  PER-FRAME BRAIN (called by MirrorHost.update — the enemy loop drives it)
  // =====================================================================
  hostStep(dt, platforms, player, projectiles) {
    if (!this.active || !this.host) return;
    this._proj = projectiles;   // crescents are real projectiles pushed into the game's array
    if (this._clashCd > 0) this._clashCd -= dt;
    if (this._stagger > 0) this._stagger -= dt;
    this.sync = clamp(this.sync + dt * 0.016 + this._syncBump, 0.15, 1); this._syncBump = 0;
    this._updatePhase();
    this._whiteout(dt);

    // perception + echo capture always run
    this._updateRead(dt, player, this.pb ?? { tipSpeed: 0 });
    this._recordEcho(dt, player);
    this._watchTricks(player);

    // brain: lock > reeling > committed move > neutral
    const ai = this.ai;
    ai.left = ai.right = ai.up = ai.down = false;
    if (this.lock) {                                         // saber lock: lean into the bind, blade crossed
      const L = this.lock, hand = { x: this.actor.x, y: this.actor.y - this.actor.hh * 0.2 };
      this.actor.vx = lerp(this.actor.vx, (L.x - this.actor.x) * 2.6, clamp(9 * dt, 0, 1));
      this.actor.vy = lerp(this.actor.vy, 0, clamp(9 * dt, 0, 1));
      this._aimAng = Math.atan2(L.y - hand.y, L.x - hand.x);
      const aimOverride = this.blade.aimOverridePoint();
      aimOverride.x = hand.x + Math.cos(this._aimAng) * CONFIG.blade.aimRadius;
      aimOverride.y = hand.y + Math.sin(this._aimAng) * CONFIG.blade.aimRadius;
      this.facing = Math.sign(player.x - this.actor.x) || this.facing;
      this.actor.update(dt, platforms); this.actor.facing = this.facing; this.blade.update(dt, this.actor, platforms);
      this._updateWaves(dt);
      return;
    }
    if (this._stagger > 0) {
      this._aim(dt, player, false);                          // knocked silly: blade just trails
    } else if (this.phase >= 3) {                            // FINAL FORM: plays from the air, sword-first dives
      this._aerialBrain(dt, player);
      this.actor.facing = this.facing;
      this.blade.update(dt, this.actor, platforms);
      this._updateWaves(dt);
      for (const g of this.imgs) g.t -= dt; this.imgs = this.imgs.filter((g) => g.t > 0);
      return;                                                // the aerial director fully owns the body
    } else if (this.mv) {
      this._runMove(dt, player);
    } else {
      this._moveCd -= dt;
      this._answerT -= dt;
      if (this._answerT > 0 && this._answer && this._moveCd < 1.2) { /* answer pending, let it fire below */ }
      if (this._answer && this._answerT <= 0) { const m = this._answer; this._answer = ""; this._startMove(m, player); }
      else if (this._moveCd <= 0) { const pick = this._pickMove(player); if (pick) this._startMove(pick, player); }
      if (!this._hasMove()) { this._decide(dt, player); this._act(dt, player); }
    }

    // step the real body + blade
    this.actor.update(dt, platforms);
    this.actor.facing = this.facing;
    this.actor.x = clamp(this.actor.x, 40, CONFIG.view.w - 40);
    this.blade.update(dt, this.actor, platforms);

    // thrown-blade lifecycle (+ P3 flash-step to the embedded blade)
    if (this.blade.state !== "held") {
      this._recallT -= dt;
      if (this._fsPending && this.blade.state === "embedded") this._flashStep(player);
      else if (this._recallT <= 0 || this.blade.state === "embedded") this.blade.tryRecall(this.actor);
    }

    // dash afterimages (P2+) + P2 drag sparks
    if (this.phase >= 2) {
      if (this.actor.dashTimer > 0) this.imgs.push({ x: this.actor.x, y: this.actor.y, f: this.facing, t: 0.28 });
      this._sparkT -= dt;
      if (this._sparkT <= 0 && this.actor.onGround && !this.mv && this.blade.state === "held" && this.blade.tipY > CONFIG.world.groundY - 16) {
        this._sparkT = 0.09;
        try { FX.burst(this.blade.tipX, CONFIG.world.groundY - 2, -this.facing, -0.3, 2, "#c98cff"); } catch { /* feedback is best-effort */ }
      }
    }
    for (const g of this.imgs) g.t -= dt;
    this.imgs = this.imgs.filter((g) => g.t > 0);
    this._updateWaves(dt);
  },

  // ---- phase escalation: the release beats ----
  _updatePhase() {
    const ph = this.phase;
    if (ph <= this._phaseMark) return;
    this._phaseMark = ph;
    this.mv = null; this._moveCd = 1.1;
    this.blade.lengthBonus = ph === 2 ? 65 : 100;            // the blade GROWS with each tear
    this.sync = Math.max(this.sync, ph === 2 ? 0.55 : 0.75);
    // the reflection SHIFTS colour as it unseals: violet -> hot magenta -> pale spectre
    this.color = ph === 2 ? "#c94bff" : "#e6d3ff";
    this.blade.trailColor = this.color; this.blade.glowColor = ph === 3 ? "#ffffff" : this.color;
    const a = this.actor, h = this.host;
    if (!h) return;
    if (ph === 2) { h.spawnClone = true; this.juice({ txt: "THE REFLECTION SPLITS", x: h.x, y: h.y - 84, big: true }); }   // game spawns a real ReflectionEnemy
    if (ph === 3) { this._air = null; this._wtT = 2.2; this.juice({ txt: "FINAL REFLECTION", x: h.x, y: h.y - 84, big: true }); }   // the reflection self-dissolves at P3
    // the release BEAT: a deep slow-mo punch so each unseal lands like an event
    this.juice({ shake: ph === 3 ? 13 : 10, flash: ph === 3 ? 0.4 : 0.28, slowmo: 0.55, zoom: CONFIG.juice.zoomBig, hitstop: CONFIG.hitStop.big });
    try {
      FX.flash(a.x, a.y - a.hh, 90, "#f0e0ff"); FX.ring(a.x, a.y, 48, this.color); FX.ring(a.x, a.y, 28, "#ffffff");
      FX.burst(a.x, a.y, 0, -1, 34, this.color); FX.explode(a.x, a.y, this.color, 1.25);
    } catch { /* feedback is best-effort */ }
  },

  // ---- P3 white-out cycle: a blinding flash, then you track it by its blade ----
  _whiteout(dt) {
    if (this.phase < 3) { this.white = Math.max(0, this.white - dt * 2); return; }
    this._wtT -= dt;
    if (this._wtT <= 0) {
      if (this.white < 0.5) {   // flash on
        this.white = 1; this._wtT = 3.2;
        this.juice({ flash: 0.5 });
        try { FX.flash(this.actor.x, this.actor.y, 90, "#ffffff"); } catch { /* feedback is best-effort */ }
      } else { this.white = 0; this._wtT = 6.5; }
    }
  },

  // =====================================================================
  //  PERCEPTION
  // =====================================================================
  _updateRead(dt, player, playerBlade) {
    const R = this.read, a = this.actor, B = CONFIG.blade;
    const dist = Math.abs(player.x - a.x), kSlow = clamp(2.2 * dt, 0, 1), kFast = clamp(6 * dt, 0, 1);
    R.dist += (dist - R.dist) * kSlow;
    R.airborne += ((player.onGround ? 0 : 1) - R.airborne) * kSlow;
    const pvx = (player.x - this._pPrevX) / (dt || 0.016); this._pPrevX = player.x;
    R.closing += ((Math.sign(a.x - player.x) === Math.sign(pvx) && Math.abs(pvx) > 60 ? 1 : 0) - R.closing) * kFast;
    const swinging = (playerBlade.tipSpeed > B.minHitSpeed * 1.1 && dist < 200) ? 1 : 0;
    R.aggression += (swinging - R.aggression) * clamp(1.8 * dt, 0, 1);
    if (player.dashTimer > 0 && this._pDashPrev <= 0) R.dashHeat = Math.min(1, R.dashHeat + 0.34);
    this._pDashPrev = player.dashTimer;
    R.dashHeat *= Math.exp(-0.5 * dt);
    R.pBladeSpeed = playerBlade.tipSpeed;
  },

  _recordEcho(_dt, player) {
    const a = this.actor, dist = Math.abs(player.x - a.x);
    const closed = this._prevDist - dist; this._prevDist = dist;
    const adv = Math.abs(closed) < 0.4 ? 0 : Math.sign(closed);
    const dash = (player.dashTimer > 0 && this._pDashPrev2 <= 0) ? 1 : 0; this._pDashPrev2 = player.dashTimer;
    const jump = (!player.onGround && this._pGroundPrev) ? 1 : 0; this._pGroundPrev = player.onGround;
    const swing = this.read.pBladeSpeed > CONFIG.blade.minHitSpeed ? 1 : 0;
    this.echoBuf.push({ adv, dash, jump, swing });
    if (this.echoBuf.length > 130) this.echoBuf.shift();
  },

  // ---- THE ECHO's soul: watch your tricks and ANSWER in kind (faster if you repeat) ----
  _watchTricks(player) {
    if (player.lastTrickT <= this.seenTrickT) return;
    const k = player.lastTrickKind, repeat = k === this._lastAnswered;
    this.seenTrickT = player.lastTrickT; this._lastAnswered = k;
    const map: Record<string, string> = { slam: "slam", superslam: "slam", spike: "slam", updraft: "rend", launch: "rend", parry: "getsuga", deflect: "getsuga", throwHit: "throw" };
    this._answer = map[k] ?? "lunge";
    this._answerT = 0.62 * (repeat ? 0.45 : 1) * lerp(1.25, 0.7, this.sync);
  },

  // =====================================================================
  //  COMMITTED MOVES — the boss moveset (telegraph -> execute -> recover)
  // =====================================================================
  ...createMirrorActions(dependencies),

  draw(surface: unknown): void { presentation.drawMirror(surface, this); },
};

// ------- the HOST: a real Enemy so every existing boss system just works -------
// Blade hits, statuses, knockback, the segmented boss HP bar, difficulty scaling, kill credit,
// and the boss-death cinematic all flow through the normal enemy path. Its update() drives the
// Mirror brain and mirrors the actor's position; knockback is forwarded into the actor.
class MirrorHost extends Enemy {
  isMirrorBoss: boolean;
  epithet: string;
  phaseMarks: number[];
  phaseTag: string;
  override spawnClone: boolean;
  mode: string;
  _mods: MirrorMods | null;
  _live: boolean;

  constructor(x: number, y: number, mods?: MirrorMods | null) {
    // heavier presence than the old Echo, and knockback tuned so hits FEEL like they land
    super(x, y, Object.assign({}, CONFIG.echo, { knockbackTaken: 5.5, weight: 1.35 }));
    this.kind = "boss"; this.isBoss = true; this.isMirrorBoss = true;
    this.bossName = "THE ECHO"; this.color = "#b06cff";
    this.epithet = "YOUR REFLECTION"; this.phaseMarks = [0.60, 0.25]; this.phaseTag = "SEALED";
    this.spawnClone = false; this.mode = "mirror";
    this._mods = mods ?? null;
    this._live = false;   // set true by the game when actually fought (bestiary previews stay inert)
  }
  update(dt: number, platforms: readonly PlayerPlatformPort[], player: MirrorPlayerPort, projectiles: MirrorProjectilePort[]): void {
    this.tickTimers(dt);
    if (typeof Mirror === "undefined" || !this._live) return;
    if (Mirror.host !== this) Mirror.attach(this, this._mods);
    Mirror.hostStep(dt, platforms, player, projectiles);
    // the host IS the body: hitbox, contact damage, and the boss bar track the actor
    this.x = Mirror.actor.x; this.y = Mirror.actor.y;
    this.facing = Mirror.facing; this.onGround = Mirror.actor.onGround;
    this.vx = 0; this.vy = 0;   // impulses were forwarded to the actor in hit()
  }
  override hit(dmg: number, kx: number, ky: number): number {
    const pvx = this.vx, pvy = this.vy;
    const dealt = super.hit(dmg, kx, ky);   // damage, statuses, flash, kill-credit — the real pipeline
    if (Mirror.host === this) {
      Mirror.actor.vx += (this.vx - pvx); Mirror.actor.vy += (this.vy - pvy);   // knockback lands on the BODY
      Mirror._stagger = Math.max(Mirror._stagger || 0, 0.1);                    // it visibly reels
      Mirror._syncBump -= 0.02;
    }
    this.vx = pvx; this.vy = pvy;
    return dealt;   // preserve Enemy.hit()'s damage contract for shared boss feedback hooks
  }
  draw(surface: unknown): void {
    if (Mirror.host === this && Mirror.active) { Mirror.draw(surface); return; }
    presentation.drawHostFallback(surface, this);
  }
}

// ------- THE REFLECTION — a real Enemy (so it reacts to your hits like anything else) -------
// Spawned in phase 2 via the boss's spawnClone hook. A bright mirror-image of YOU that flees to
// a CORNER and unleashes fully-fleshed crescent patterns (fan / barrage / sweep). Because it
// extends Enemy, blade hits knock it around + flash it through the normal pipeline; a spring pulls
// it back to its corner so knockback reads. It self-dissolves when the boss reaches its final phase.
class ReflectionEnemy extends Enemy {
  _corner: BladePoint;
  _st: string;
  _patCd: number;
  _pat: string | null;
  _patN: number;
  _patT: number;
  _bob: number;
  _proj: MirrorProjectilePort[] | null = null;

  constructor(x: number, y: number) {
    super(x, y, Object.assign({}, CONFIG.echo, { hp: 200, w: 30, h: 46, knockbackTaken: 6, weight: 1.0, contactDmg: 14 }));
    this.kind = "reflection"; this.isBoss = false; this.bossName = null;
    this.color = "#c96bff";                       // bright + glowing (was barely visible before)
    this._corner = this._pickCorner(); this._st = "fly";
    this._patCd = 1.4; this._pat = null; this._patN = 0; this._patT = 0; this._bob = GAME_RANDOM.next() * 6.28;
  }
  _pickCorner(): BladePoint {
    const m = 150, gy = CONFIG.world.groundY, cs = [
      { x: m, y: 140 }, { x: CONFIG.view.w - m, y: 140 },
      { x: m, y: gy - 280 }, { x: CONFIG.view.w - m, y: gy - 280 },
    ];
    return cs[Math.floor(GAME_RANDOM.next() * cs.length)] ?? cs[0] ?? { x: m, y: 140 };
  }
  update(dt: number, _platforms: readonly PlayerPlatformPort[], player: MirrorPlayerPort, projectiles: MirrorProjectilePort[]): void {
    this.tickTimers(dt);
    this._proj = projectiles;   // its crescents are real projectiles too (parryable)
    if (typeof Mirror === "undefined" || !Mirror.active || (Mirror.host?.dead) || Mirror.phase >= 3) {
      this.dead = true; try { FX.death(this.x, this.y, 18, this.color); FX.burst(this.x, this.y, 0, -1, 14, "#e9d5ff"); if (typeof SFX !== "undefined") SFX.recall(); } catch { /* feedback is best-effort */ }
      return;
    }
    this.facing = Math.sign(player.x - this.x) || this.facing;
    this._bob += dt * 3;
    // spring toward the corner + integrate, so a hit visibly SHOVES it and it recovers
    const c = this._corner;
    this.vx += (c.x - this.x) * 6 * dt; this.vy += (c.y + Math.sin(this._bob) * 10 - this.y) * 6 * dt;
    this.vx *= Math.exp(-3.2 * dt); this.vy *= Math.exp(-3.2 * dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
    // patterns
    if (this._pat) { this._runPattern(dt, player); }
    else { this._patCd -= dt; if (this._patCd <= 0 && Math.abs(this.x - c.x) < 120) { this._pat = ["fan", "barrage", "sweep"][Math.floor(GAME_RANDOM.next() * 3)] ?? "fan"; this._patN = 0; this._patT = 0; this._patCd = 2.6 + GAME_RANDOM.next() * 1.2; if (GAME_RANDOM.next() < 0.4) this._corner = this._pickCorner(); } }
  }
  _shoot(ang: number, sp: number, dmg: number, r: number): void {
    if (this._proj && typeof Projectile !== "undefined") {
      const p = new Projectile(this.x, this.y, Math.cos(ang) * sp, Math.sin(ang) * sp);
      p.crescent = true; p.kind = "crescent"; p.tint = this.color; p.dmg = dmg; p.r = r; p.life = 2.8; p.deflectDmg = 30;
      this._proj.push(p);
    }
    try { if (typeof SFX !== "undefined") SFX.crescent(); FX.flash(this.x, this.y, 24, "#c98cff"); FX.burst(this.x, this.y, Math.cos(ang), Math.sin(ang), 6, this.color); } catch { /* feedback is best-effort */ }
  }
  _runPattern(dt: number, player: MirrorPlayerPort): void {   // QUALITY over quantity — few, big, FAST crescents
    this._patT -= dt; if (this._patT > 0) return;
    const toP = Math.atan2(player.y - this.y, player.x - this.x);
    if (this._pat === "fan") {                    // a clean 3-wide spread
      for (let i = 0; i < 3; i++) this._shoot(toP + (i - 1) * 0.26, 660, 15, 30);
      this.flash = 0.12; this._pat = null;
    } else if (this._pat === "barrage") {         // a few heavy aimed shots
      this._shoot(toP + (GAME_RANDOM.next() * 2 - 1) * 0.06, 780, 16, 28); this._patN++; this._patT = 0.26;
      if (this._patN >= 3) this._pat = null;
    } else {                                      // a short scything sweep
      this._shoot(toP - 0.42 + this._patN * 0.21, 680, 15, 28); this._patN++; this._patT = 0.16;
      if (this._patN >= 5) this._pat = null;
    }
  }
  get noBar(): boolean { return this._noBar ?? false; }
  get pattern(): string | null { return this._pat; }
  draw(surface: unknown): void {
    presentation.drawReflection(surface, this);
  }
}

return { Mirror, MirrorHost, ReflectionEnemy };
}

// ------- player: run, jump, dash -------
import type { CONFIG as GAME_CONFIG } from "../../config/game-config";
import type { VoidLane, VoidPlatform } from "../voidgen-contracts";

type GameConfig = typeof GAME_CONFIG;

export interface PlayerInputPort {
  right(): boolean;
  left(): boolean;
  up(): boolean;
  down(): boolean;
  dashPressed(): boolean;
  jumpPressed(): boolean;
  buzz?(duration: number): void;
}

export interface PlayerPlatformPort {
  x: number;
  y: number;
  w: number;
  h: number;
  floor?: boolean;
  oneway?: boolean;
}

export interface PlayerDamageSource {
  x?: number;
  dead?: boolean;
  mode?: string;
  bossId?: string;
  bossName?: string;
  sourceEnemy?: PlayerDamageSource;
  owner?: PlayerDamageSource;
  source?: PlayerDamageSource;
  outgoingDamageMult?(): number;
  constructor?: { name?: string };
}

export interface PlayerRenderSnapshot {
  readonly x: number;
  readonly y: number;
  readonly vy: number;
  readonly hw: number;
  readonly hh: number;
  readonly facing: number;
  readonly onGround: boolean;
  readonly iframe: number;
  readonly dashTimer: number;
  readonly cinematicGraceT: number;
}

export interface PlayerPresentationPort {
  draw(surface: unknown, player: PlayerRenderSnapshot): void;
}

export interface PlayerDependencies {
  CONFIG: GameConfig;
  FX: {
    burst(x: number, y: number, dx: number, dy: number, count: number, color: string): void;
    drip(x: number, y: number): void;
  };
  GFX: { low: boolean };
  Input: PlayerInputPort;
  presentation: PlayerPresentationPort;
  aabbOverlap: (ax: number, ay: number, ahw: number, ahh: number, bx: number, by: number, bhw: number, bhh: number) => boolean;
  clamp: (value: number, min: number, max: number) => number;
  len: (x: number, y: number) => number;
}

function createPlayer(dependencies: PlayerDependencies) {
  const { CONFIG, FX, GFX, Input, presentation, aabbOverlap, clamp, len } = dependencies;

class Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hw: number;
  hh: number;
  onGround: boolean;
  facing: number;
  hp: number;
  maxHp: number;
  oneHit: boolean;
  iframe: number;
  cinematicProtected: boolean;
  cinematicGraceT: number;
  coyote: number;
  jumpBuf: number;
  dashTimer: number;
  dashCd: number;
  dashX: number;
  dashY: number;
  maxDashCharges: number;
  dashCharges: number;
  dashEndT: number;
  dashMomentumMult: number;
  hardTurnStacks: number;
  afterimageDuration: number;
  afterimageSpeedMult: number;
  afterimageT: number;
  _wasGround: boolean;
  moveBoost: number;
  downBufferT: number;
  guardT: number;
  flowDR: number;
  shield: number;
  maxShield: number;
  airTime: number;
  rootT: number;
  slowMult: number;
  voidSlowT: number;
  voidTransferT: number;
  voidMajorWindow: boolean;
  rallyT: number;
  rallyPool: number;
  hazardT: number;
  airborneDmgMult: number;
  hazardDmgMult: number;
  secondBreathDuration: number;
  secondBreathT: number;
  secondBreathUsed: boolean;
  lastTrickKind: string;
  lastTrickT: number;
  tempoT: number;
  tempoStk: number;
  shopRevives: number;
  abilityRevives: number;
  aiInput?: PlayerInputPort;
  voidLane: VoidLane | null;
  supportPlatform: VoidPlatform | null;
  rallySource: PlayerDamageSource | null;
  tookHit = false;

  constructor(x: number, y: number) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.hw = CONFIG.player.w / 2;
    this.hh = CONFIG.player.h / 2;
    this.onGround = false;
    this.facing = 1;            // 1 right, -1 left
    this.hp = CONFIG.player.hp;
    this.maxHp = CONFIG.player.hp;
    this.oneHit = false;        // Hard difficulty: any hit kills
    this.iframe = 0;
    this.cinematicProtected = false;   // held while a blocking scene runs (a lock, not a timer)
    this.cinematicGraceT = 0;          // post-scene visible safety window

    this.coyote = 0;
    this.jumpBuf = 0;

    this.dashTimer = 0;         // >0 while dashing
    this.dashCd = 0;            // >0 while on cooldown
    // (dash invuln folded into the single `iframe` timer — see update()/invulnerable)
    this.dashX = 0; this.dashY = 0;
    this.maxDashCharges = 1;    // Air Dash raises this; charges refill on landing
    this.dashCharges = 1;
    this.dashEndT = 0;          // Slipstream: brief window after a dash ends
    this.dashMomentumMult = 1;  // Momentum Transfer: horizontal carry after dash
    this.hardTurnStacks = 0;    // Hard Turn: extra steering in the dash's final third
    this.afterimageDuration = 0;
    this.afterimageSpeedMult = 1;
    this.afterimageT = 0;
    this._wasGround = false;

    this.moveBoost = 1;         // set by the game (e.g. faster while blade is thrown)
    this.downBufferT = 0;       // brief buffer of "down held" so dash-down is forgiving

    // ---- resilience (earned survivability, set by abilities) ----
    this.guardT = 0;            // Riposte: damage-reduction window after a perfect parry
    this.flowDR = 1;            // Flow Guard: damage-taken mult, refreshed each frame by the game
    this.shield = 0;            // Aegis: stored one-hit absorb pips
    this.maxShield = 0;         // ...cap (0 until Aegis is owned)
    this.airTime = 0;           // Aerial Rave: seconds since last grounded
    this.rootT = 0;             // Chain Caster: snared in place (no move/jump/dash) for a bit
    this.slowMult = 1;          // Sludge: slowed while standing in a mud puddle (set by the game)
    this.voidSlowT = 0;         // Source void rescue: brief movement penalty after the geyser saves you
    this.voidLane = null; this.voidTransferT = 0; this.voidMajorWindow = false;
    this.supportPlatform = null; // live Void surface contract for lane-aware boss attacks
    this.rallyT = 0;            // Aldric Act I: seconds left to win recoverable health back
    this.rallyPool = 0;         // orange-chip health still available during the rally window
    this.rallySource = null;    // fight-scoped owner; never persists beyond this Player instance
    this.hazardT = 0;           // cooldown for sustained hazard-zone damage (Warden zones)
    this.airborneDmgMult = 1;   // Aerial Bracing
    this.hazardDmgMult = 1;     // Hazard Boots (applied only by tagged hazard callers)
    this.secondBreathDuration = 0;
    this.secondBreathT = 0;
    this.secondBreathUsed = false;
    this.lastTrickKind = "";    // last trick performed (The Echo mirrors it)
    this.lastTrickT = 0;        // ...and when (so the Echo can detect a NEW trick)
    this.tempoT = 0;            // Tempo: damage+haste buff window after a perfect parry
    this.tempoStk = 1;          // ...stacks (Tempo T2)
    // extra lives — three DISTINCT pools, consumed in this order on a killing blow:
    this.shopRevives = 0;       // 1) Second Wind (shop upgrade)
    this.abilityRevives = 0;    // 2) Last Stand (draftable ability)
    // 3) the CrazyGames rewarded-ad revive (handled by the continue flow)
  }

  // single source of truth for i-frames: dash, hit, shield-absorb, revives, and Backlash
  // all write the one `iframe` timer (via Math.max, so none can shorten another).
  // CINEMATIC SAFETY is a SEPARATE channel — never the hit iframe — so a scene can
  // never leak immunity or blink the player invisible (Pantheon VI P2):
  //   cinematicProtected — a lock (not a timer) held while a blocking scene runs
  //   cinematicGraceT    — a short visible safety window after the scene ends
  get invulnerable(): boolean { return this.iframe > 0 || this.cinematicProtected || this.cinematicGraceT > 0; }
  // count down the safety/hit timers WITHOUT running physics — used while a
  // blocking cinematic freezes the world, so a pre-scene hit iframe still expires
  // (and stops blinking) and the grace window drains on schedule.
  updateSafetyTimers(dt: number): void {
    if (this.iframe > 0) this.iframe = Math.max(0, this.iframe - dt);
    if (this.cinematicGraceT > 0) this.cinematicGraceT = Math.max(0, this.cinematicGraceT - dt);
  }

  update(dt: number, platforms: readonly PlayerPlatformPort[]): void {
    const P = CONFIG.player, D = CONFIG.dash;
    const IN = this.aiInput ?? Input;   // attract-mode drives a synthetic controller; real play reads Input

    // timers
    if (this.iframe > 0) this.iframe -= dt;
    if (this.cinematicGraceT > 0) this.cinematicGraceT = Math.max(0, this.cinematicGraceT - dt);
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.coyote > 0) this.coyote -= dt;
    if (this.jumpBuf > 0) this.jumpBuf -= dt;
    if (this.guardT > 0) this.guardT -= dt;
    if (this.rootT > 0) this.rootT -= dt;
    if (this.voidSlowT > 0) this.voidSlowT = Math.max(0, this.voidSlowT - dt);
    if (this.rallyT > 0) {
      this.rallyT = Math.max(0, this.rallyT - dt);
      if (this.rallyT <= 0 || this.rallyPool <= 0 || !this.rallySource || this.rallySource.dead) this._clearRally();
    } else if (this.rallyPool > 0 || this.rallySource) this._clearRally();
    if (this.dashEndT > 0) this.dashEndT -= dt;
    if (this.afterimageT > 0) this.afterimageT = Math.max(0, this.afterimageT - dt);
    if (this.secondBreathT > 0 && !this.oneHit && this.hp > 0) {
      this.secondBreathT = Math.max(0, this.secondBreathT - dt);
      this.heal(this.maxHp * 0.0125 * dt);
    }
    if (this.tempoT > 0) { this.tempoT -= dt; if (this.tempoT <= 0) this.tempoStk = 1; }
    const rooted = this.rootT > 0;

    const dirX = ((IN.right() ? 1 : 0) - (IN.left() ? 1 : 0)) * (rooted ? 0 : 1);
    if (dirX !== 0) this.facing = dirX;
    this.downBufferT = IN.down() ? 0.16 : Math.max(0, this.downBufferT - dt);
    const downHeld = IN.down() || this.downBufferT > 0;

    // ---- dash trigger (snared = no dash; uses a charge, refilled on landing) ----
    if (!rooted && IN.dashPressed() && this.dashCd <= 0 && this.dashTimer <= 0 && this.dashCharges > 0) {
      let ax = (IN.right() ? 1 : 0) - (IN.left() ? 1 : 0);
      const ay = (downHeld ? 1 : 0) - (IN.up() ? 1 : 0);
      // a down-dash takes priority over horizontal drift: "S + dash" goes (almost) straight
      // down instead of veering left/right because you happened to be moving
      if (ay > 0 && ax !== 0) ax *= 0.3;
      if (ax === 0 && ay === 0) ax = this.facing; // default: dash where you face
      const m = len(ax, ay) || 1;
      this.dashX = ax / m; this.dashY = ay / m;
      this.dashTimer = D.duration;
      this.iframe = Math.max(this.iframe, D.iframe);   // dash i-frames, into the shared timer (never shortens a longer active window)
      this.dashCharges--;
      this.dashCd = this.dashCharges > 0 ? 0.16 : D.cooldown;   // quick chain between charges; full cd when spent
    }

    if (this.dashTimer > 0) {
      // ---- dashing: burst; a DOWNWARD dash builds on your natural fall instead of
      // capping it (so it feeds Power Slams) — other directions are a fixed burst ----
      this.dashTimer -= dt;
      // ---- CURVE DASH: steer mid-dash — hold W/S (or A/D) to bend the burst that way.
      // The vector renormalizes, so it's a redirect (cut up to chase, cut down into a slam),
      // not a slowdown. W/S override the horizontal drift so a clean vertical cut is easy. ----
      let stx = (IN.right() ? 1 : 0) - (IN.left() ? 1 : 0);
      let sty = (downHeld ? 1 : 0) - (IN.up() ? 1 : 0);
      if (sty !== 0 && stx !== 0) stx *= 0.35;     // committing to a vertical cut quiets sideways drift
      if (!rooted && (stx !== 0 || sty !== 0)) {
        const sm = len(stx, sty) || 1; stx /= sm; sty /= sm;
        const finalThird = this.dashTimer <= D.duration / 3;
        const steerMult = finalThird ? 1 + this.hardTurnStacks * 0.10 : 1;
        const k = clamp(D.steer * steerMult * dt, 0, 1);
        this.dashX += (stx - this.dashX) * k;
        this.dashY += (sty - this.dashY) * k;
        const dm = len(this.dashX, this.dashY) || 1; this.dashX /= dm; this.dashY /= dm;
        this.facing = this.dashX >= 0 ? 1 : -1;
      }
      this.vx = this.dashX * D.speed;
      if (this.dashY > 0) {
        this.vy = Math.max(this.vy + CONFIG.world.gravity * dt, this.dashY * D.speed);
        if (this.vy > P.maxFall * 1.35) this.vy = P.maxFall * 1.35;
      } else {
        this.vy = this.dashY * D.speed;
      }
      if (this.dashTimer <= 0) {
        this.vx *= D.endSpeedKeep * this.dashMomentumMult;
        if (this.dashY <= 0) this.vy *= D.endSpeedKeep;   // preserve downward momentum into the slam
        this.dashEndT = 0.6;                              // Slipstream window opens as the dash ends
        if (this.afterimageDuration > 0) this.afterimageT = this.afterimageDuration;
      }
    } else {
      // ---- normal movement (mud slows your top speed + acceleration) ----
      const voidSlow = this.voidSlowT > 0 ? ((CONFIG.source.voidSlowMult) || 0.65) : 1;
      const moveSlow = this.slowMult * voidSlow;
      const accel = (this.onGround ? P.groundAccel : P.airAccel) * moveSlow;
      const top = P.moveSpeed * this.moveBoost * moveSlow;
      if (dirX !== 0) {
        this.vx += dirX * accel * dt;
        this.vx = clamp(this.vx, -top, top);
      } else if (this.onGround) {
        const f = P.friction * dt;
        if (Math.abs(this.vx) <= f) this.vx = 0;
        else this.vx -= Math.sign(this.vx) * f;
      }

      // jump (with coyote + buffer) — snared = grounded
      if (IN.jumpPressed() && !rooted) this.jumpBuf = P.jumpBuffer;
      if (this.jumpBuf > 0 && !rooted && (this.onGround || this.coyote > 0)) {
        this.vy = -P.jumpSpeed;
        this.onGround = false;
        this.coyote = 0;
        this.jumpBuf = 0;
      }

      // gravity
      this.vy += CONFIG.world.gravity * dt;
      if (this.vy > P.maxFall) this.vy = P.maxFall;
    }

    // ---- integrate + collide (axis separated) ----
    this.x += this.vx * dt;
    this._collideAxis(platforms, true, 0);
    const prevBottom = this.y + this.hh;   // bottom before the vertical move
    this.y += this.vy * dt;
    const wasOnGround = this.onGround;
    this.onGround = false;
    this._collideAxis(platforms, false, prevBottom);
    const grounded = this._groundedState();
    if (grounded || wasOnGround) this.coyote = P.coyoteTime;
    this.airTime = grounded ? 0 : this.airTime + dt;
    if (grounded && !this._wasGround) this.dashCharges = this.maxDashCharges;   // refill dashes on landing
    this._wasGround = grounded;

    // keep inside the arena horizontally
    this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
  }

  _collideAxis(platforms: readonly PlayerPlatformPort[], horizontal: boolean, prevBottom: number): void {
    for (const p of platforms) {
      if (horizontal && p.floor) continue;   // full-width floor never blocks horizontal movement
      const phw = p.w / 2, phh = p.h / 2;
      const pcx = p.x + phw, pcy = p.y + phh;
      if (!aabbOverlap(this.x, this.y, this.hw, this.hh, pcx, pcy, phw, phh)) continue;

      if (p.oneway) {
        // one-way: only land on top, when falling and arriving from above
        if (horizontal) continue;
        // intentionally going down (hold S, or a downward dash) -> pass through, keep momentum
        if ((this.aiInput ?? Input).down() || this.downBufferT > 0 || (this.dashTimer > 0 && (this.dashY > 0 || this.vy > 80))) continue;
        if (this.vy >= 0 && prevBottom <= p.y + 1.5) {
          this.y = p.y - this.hh; this.vy = 0; this.onGround = true;
        }
        continue;
      }

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

  _groundedState(): boolean { return this.onGround; }

  // returns: "hit" (HP lost) | "absorbed" (a shield pip ate it) | "" (invulnerable)
  takeDamage(dmg: number, fromX: number, source?: PlayerDamageSource | null): "hit" | "absorbed" | "" {
    if (this.invulnerable) return "";
    const damageSource = source && (source.sourceEnemy ?? (source.owner ?? source.source) ?? source);
    if (damageSource && typeof damageSource.outgoingDamageMult === "function") dmg *= damageSource.outgoingDamageMult();
    // Aegis: a stored pip absorbs the hit entirely (works even in one-hit mode)
    if (this.shield > 0) {
      this.shield--;
      this.iframe = CONFIG.player.hitIframe * 0.7;
      return "absorbed";
    }
    dmg *= CONFIG.player.dmgTakenMult * this.flowDR;          // Flow Guard
    if (!this.onGround) dmg *= this.airborneDmgMult;          // Aerial Bracing
    if (this.guardT > 0) dmg *= CONFIG.resilience.parryGuardMult;  // Riposte window
    const hpBefore = this.hp;
    this.hp = this.oneHit ? 0 : Math.max(0, this.hp - dmg);
    const actualLost = Math.max(0, hpBefore - this.hp);
    if (!this.oneHit && this.hp > 0 && this.hp < this.maxHp * 0.30 &&
        this.secondBreathDuration > 0 && !this.secondBreathUsed) {
      this.secondBreathUsed = true;
      this.secondBreathT = this.secondBreathDuration;
    }
    // Projectiles may pass their owning boss while contact damage passes the boss itself.
    // Accept both shapes so every existing two-argument caller remains valid.
    const rallyOwner = damageSource;
    const fromAldric = rallyOwner?.mode === "duel" &&
      (rallyOwner.bossId === "aldric" || rallyOwner.bossName === "THE BERSERKER KING" ||
       (rallyOwner.constructor?.name === "Aldric"));
    if (actualLost > 0 && fromAldric) this.beginRally(actualLost, rallyOwner);
    this.iframe = CONFIG.player.hitIframe;
    this.tookHit = true;   // consumed by the game for no-hit achievement tracking
    const dir = Math.sign(this.x - fromX) || 1;
    const knockback = CONFIG.player.knockbackMult;
    this.vx = dir * 380 * knockback;
    this.vy = -260 * knockback;
    // the hit reads on the body: a crimson spray away from the blow + a couple of drips
    try {
      FX.burst(this.x, this.y, dir, -0.5, 9, "#e23b3b");
      if (!GFX.low) { FX.drip(this.x, this.y + 4); FX.drip(this.x - dir * 6, this.y - 6); }
      Input.buzz?.(45);   // taking a hit lands in the hand hardest of all
    } catch { /* Optional feedback must never interrupt damage resolution. */ }
    return "hit";
  }

  // Aldric's Bloodborne-style rally: a fresh wound exposes only a configured fraction
  // as recoverable orange-chip health. Repeated duel hits may add to the same live pool,
  // but it can never exceed the player's currently missing HP.
  beginRally(actualLost: number, source: PlayerDamageSource | null | undefined): number {
    if (!(actualLost > 0) || !source) return 0;
    const A = CONFIG.aldric;
    const frac = Math.max(0, A.recoverableFrac);
    const recoverable = actualLost * frac;
    if (!(recoverable > 0)) { this._clearRally(); return 0; }
    const carry = this.rallyT > 0 && this.rallySource === source ? this.rallyPool : 0;
    this.rallyPool = Math.min(Math.max(0, this.maxHp - this.hp), carry + recoverable);
    this.rallyT = Math.max(0, A.rallyWindow);
    this.rallySource = this.rallyT > 0 && this.rallyPool > 0 ? source : null;
    if (!this.rallySource) this._clearRally();
    return this.rallyPool;
  }

  // Called by the fight's player-damage hooks after Aldric takes a direct counter-hit.
  // Returns the actual HP restored so callers can drive feedback without guessing.
  claimRally(damageDealt: number): number {
    if (this.rallyT <= 0 || this.rallyPool <= 0 || !this.rallySource || this.rallySource.dead || !(damageDealt > 0)) {
      if (this.rallyT <= 0 || this.rallyPool <= 0 || !this.rallySource || this.rallySource.dead) this._clearRally();
      return 0;
    }
    const A = CONFIG.aldric;
    const perDamage = Math.max(0, A.rallyHealPerDamage);
    const healed = Math.min(this.rallyPool, Math.max(0, this.maxHp - this.hp), damageDealt * perDamage);
    if (healed > 0) {
      this.hp += healed;
      this.rallyPool = Math.max(0, this.rallyPool - healed);
    }
    if (this.rallyPool <= 0.001 || this.hp >= this.maxHp) this._clearRally();
    return healed;
  }

  _clearRally(): void {
    this.rallyT = 0;
    this.rallyPool = 0;
    this.rallySource = null;
  }

  resetStagePassives(): void {
    this.secondBreathT = 0;
    this.secondBreathUsed = false;
  }

  // additive shim mirroring Enemy.takeHit so one symmetric collision loop can damage the
  // player the same way it damages an enemy — a thin translation into existing takeDamage().
  takeHit(dmg: number, kx: number, _ky: number, src?: PlayerDamageSource | null): "hit" | "absorbed" | "" {
    return this.takeDamage(dmg, src?.x ?? (this.x - (kx || 0)), src);
  }

  heal(n: number): void { this.hp = Math.min(this.maxHp, this.hp + n); }

  draw(surface: unknown): void { presentation.draw(surface, this); }
}

  return Player;
}

export { createPlayer };

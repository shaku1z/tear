import type {
  BladeDependencies, BladeEnemyPort, BladePlatformPort, BladePlayerPort, BladePoint,
  BladeWeaponPort, BladeChannels,
} from "./blade-contracts";

export function createBladeCore(dependencies: BladeDependencies) {
  const { CONFIG, Input, clamp, len, lerp, lerpAngle } = dependencies;

abstract class BladeCore {
  x: number; y: number; vx: number; vy: number; angle: number;
  tipX: number; tipY: number; prevTipX: number; prevTipY: number;
  tipSpeed: number; tipVX: number; tipVY: number; glowV: number; tetherFactor: number;
  trail: { hx: number; hy: number; tx: number; ty: number }[];
  aimX: number; aimY: number; reticleX: number; reticleY: number;
  state: string; pierced: Set<object>; throwDmg: number; flyTime: number;
  throwSizeMult: number; freeRecall: boolean; recallWindow: number; throwCooldownMult: number;
  embeddedNew: boolean; caughtNew: boolean; model: string; weapon: BladeWeaponPort | null;
  channelMods: BladeChannels; throwId: number; throwOrigin: BladePoint | null;
  throwResolved: boolean; impactResolved: boolean; secondaryActive: boolean; secondaryQueued: boolean;
  secondaryStartedNew: boolean; anchorTarget: BladeEnemyPort | null; anchorTerrain: boolean;
  linkT: number; linkBrokenNew: string | false; circuitEnergy: number; circuitEnergyMax: number;
  circuitOrbit: number; orbit: number; orbitDir: number; _orbitAngle: number | null;
  tension: number; _repeatHits: Map<object, number>; _lastHand: BladePoint | null;
  hostile: boolean; stolenBy: unknown;
  impactVX?: number | null; impactVY?: number | null; lengthBonus?: number; aimOverride?: BladePoint;
  lmbOverride?: boolean; throwGravity?: number; chainCollided?: Set<BladeEnemyPort>; circuitBounceCd?: number;
  circuitMaxLife?: number; finalFree?: boolean; redirectSpent?: boolean; releaseVX?: number;
  releaseVY?: number; restoredTrail?: boolean; retraceDone?: boolean;
  retraceReturn?: boolean; throwBaseDmg: number; glowColor?: string; trailColor?: string;
  hideThrowUI?: boolean; mirroredWeaponId?: string;

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
    this.throwBaseDmg = 0;
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
    this.secondaryQueued = false;
    this.secondaryStartedNew = false;
    this.anchorTarget = null;
    this.anchorTerrain = false;
    this.linkT = 0;
    this.linkBrokenNew = false;
    this.circuitEnergy = 0;
    this.circuitEnergyMax = 0;
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

  forceEmbed(): void {
    this.impactVX ??= this.vx;
    this.impactVY ??= this.vy;
    this.state = "embedded"; this.vx = 0; this.vy = 0;
  }

  claimImpact(): boolean {
    if (this.impactResolved) return false;
    this.impactResolved = true;
    return true;
  }

  // effective blade length (longer while thrown if the ability is owned).
  // lengthBonus is a per-instance additive override — the Mirror boss wields a much longer,
  // phase-growing blade without touching the global config or the player's blade.
  get curLength(): number {
    return (CONFIG.blade.length + (this.lengthBonus ?? 0)) * (this.state === "held" ? 1 : this.throwSizeMult);
  }

  // hand anchor follows the player
  handPos(player: BladePlayerPort): BladePoint {
    return {
      x: player.x + CONFIG.blade.handOffsetX,
      y: player.y + CONFIG.blade.handOffsetY,
    };
  }

  aimOverridePoint(): BladePoint {
    this.aimOverride ??= { x: this.aimX, y: this.aimY };
    return this.aimOverride;
  }

  /**
   * Samples the physical pointing device without consulting an authoritative
   * replay override. Recorded live runs call this before encoding their aim so
   * pointer-lock deltas are consumed exactly once by the fixed simulation.
   */
  captureDeviceAim(hand: BladePoint): BladePoint {
    const B = CONFIG.blade;
    if (Input.touchAim && Input.stickAim) {
      this.aimX = Input.stickAim.x * B.aimRadius;
      this.aimY = Input.stickAim.y * B.aimRadius;
    } else if (Input.locked || Input.touchAim) {
      const d = Input.consumeDelta();
      this.aimX += d.x * B.aimSensitivity;
      this.aimY += d.y * B.aimSensitivity;
    } else {
      this.aimX = Input.mouseX - hand.x;
      this.aimY = Input.mouseY - hand.y;
    }
    return { x: this.aimX, y: this.aimY };
  }

  // ---- aim / reticle (runs in every state so the throw direction stays current) ----
  _updateAim(hand: BladePoint, dt: number): void {
    const B = CONFIG.blade;
    if (this.aimOverride) {
      // attract-mode AI aims the blade at an absolute world point (else read the mouse)
      this.aimX = this.aimOverride.x - hand.x;
      this.aimY = this.aimOverride.y - hand.y;
    } else this.captureDeviceAim(hand);
    // hold left-click to ease the tether in close (exponential approach) for finer control.
    // lmbOverride lets an AI-driven second blade (the Mirror) control its own tether instead
    // of reading the human's mouse button (additive: undefined -> reads Input.lmb as before).
    const lmb = this.lmbOverride ?? Input.tetherHeld;
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

  _recomputeTip(dt: number): void {
    if (this.model === "ringblade") {
      this.prevTipX = this.tipX; this.prevTipY = this.tipY;
      this.tipX = this.x; this.tipY = this.y;
      this.tipVX = this.vx; this.tipVY = this.vy;
      this.tipSpeed = len(this.tipVX, this.tipVY);
      const target = clamp((this.tipSpeed - CONFIG.blade.minHitSpeed) / 3000, 0, 1);
      this.glowV = lerp(this.glowV, target, clamp(10 * dt, 0, 1));
      return;
    }
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

  _pushTrail(): void {
    if (this.model === "ringblade") {
      const motion = len(this.vx, this.vy), a = motion > 1 ? Math.atan2(this.vy, this.vx) + Math.PI / 2 : this.angle + Math.PI / 2;
      const r = 18 * (this.state === "held" ? 1 : this.throwSizeMult), px = Math.cos(a) * r, py = Math.sin(a) * r;
      this.trail.push({ hx: this.x - px, hy: this.y - py, tx: this.x + px, ty: this.y + py });
    } else this.trail.push({ hx: this.x, hy: this.y, tx: this.tipX, ty: this.tipY });
    if (this.trail.length > CONFIG.juice.trailSamples) this.trail.shift();
  }

  update(dt: number, player: BladePlayerPort, platforms: readonly BladePlatformPort[]): void {
    const hand = this.handPos(player);
    this._lastHand = hand;
    this._updateAim(hand, dt);

    if (this.state === "held") {
      this._updateHeld(dt, hand);
      this._updateWeaponMeters(dt, hand);
      if (this.weapon?.onHeldUpdate) this.weapon.onHeldUpdate({ blade: this, dt, player, platforms, hand });
    }
    else this._updateThrown(dt, player, platforms);
  }

  channel(name: string): number {
    const channels = this.weapon?.channels;
    const candidate: unknown = channels === undefined ? undefined : Reflect.get(channels, name);
    const base = typeof candidate === "number" ? candidate : 1;
    const modifier: unknown = Reflect.get(this.channelMods, name);
    return base * (typeof modifier === "number" ? modifier : 1);
  }

  recallRange(): number {
    if (this.freeRecall) return Infinity;
    return CONFIG.blade.throw.reclaimDistance * this.channel("remoteRange") + CONFIG.blade.throw.returnSpeed * this.recallWindow;
  }

  linkRange(): number {
    if (this.weapon?.id === "spear" && this.freeRecall) return Infinity;
    return CONFIG.blade.throw.reclaimDistance * this.channel("remoteRange") + CONFIG.blade.throw.returnSpeed * this.recallWindow;
  }

  _actionPoint(): BladePoint {
    if (this.anchorTarget && !this.anchorTarget.dead && !this.anchorTarget.dying) return { x: this.anchorTarget.x, y: this.anchorTarget.y };
    if (this.weapon && (this.weapon.id === "spear" || this.weapon.id === "chainblade")) return { x: this.tipX, y: this.tipY };
    return { x: this.x, y: this.y };
  }

  actionPoint(): BladePoint { return this._actionPoint(); }

  lastHand(): BladePoint | null { return this._lastHand; }

  actionRange(): number {
    const id = this.weapon?.id;
    if (id === "ringblade" && this.state === "circuiting") return Infinity;
    if (id === "spear" && ["flying", "embedded", "reeling"].includes(this.state)) return this.linkRange();
    if (id === "chainblade" && ["flying", "latched", "yanking"].includes(this.state)) return this.linkRange();
    return this.recallRange();
  }

  actionDistance(player: BladePlayerPort): number {
    const hand = this.handPos(player), point = this._actionPoint();
    return len(point.x - hand.x, point.y - hand.y);
  }

  _pointInRange(player: BladePlayerPort, point: BladePoint, range: number): boolean {
    if (!Number.isFinite(range)) return true;
    const hand = this.handPos(player);
    return len(point.x - hand.x, point.y - hand.y) <= range;
  }

  _linkInRange(player: BladePlayerPort): boolean { return this._pointInRange(player, this._actionPoint(), this.linkRange()); }

  _placeTipAt(tx: number, ty: number, hand: BladePoint): void {
    let dx = tx - hand.x, dy = ty - hand.y;
    const d = len(dx, dy);
    if (d < 1) { dx = Math.cos(this.angle); dy = Math.sin(this.angle); }
    else { dx /= d; dy /= d; }
    this.angle = Math.atan2(dy, dx);
    this.x = tx - dx * this.curLength;
    this.y = ty - dy * this.curLength;
  }

  _updateWeaponMeters(dt: number, hand: BladePoint): void {
    const chain = this.weapon?.id === "chainblade";
    const reach = Math.max(1, CONFIG.blade.maxReach * 1.25);
    const visibleDistance = chain ? len(this.tipX - hand.x, this.tipY - hand.y) : len(this.x - hand.x, this.y - hand.y);
    const effectiveExtension = chain ? Math.max(0, visibleDistance - this.curLength) : visibleDistance;
    this.tension = clamp(effectiveExtension / reach, 0, 1);
    if (this.weapon?.id !== "ringblade") { this.orbit = Math.max(0, this.orbit - dt); this._orbitAngle = null; return; }
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

  _updateHeld(dt: number, hand: BladePoint): void {
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

  abstract _updateThrown(dt: number, player: BladePlayerPort, platforms: readonly BladePlatformPort[]): void;
}

  return BladeCore;
}

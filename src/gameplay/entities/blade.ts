// ------- the momentum blade -------
import { createBladeCore } from "./blade-core";
import type {
  BladeActionResult, BladeDependencies, BladeEnemyPort, BladePlatformPort,
  BladePlayerPort,
} from "./blade-contracts";

export type {
  BladeActionResult, BladeChannels, BladeDependencies, BladeEnemyPort, BladeEntity,
  BladeInputPort, BladePlatformPort, BladePlayerPort, BladePoint, BladePresentationPort,
  BladeRenderSnapshot, BladeWeaponContext, BladeWeaponPort, GameConfig,
} from "./blade-contracts";

function createBlade(dependencies: BladeDependencies) {
  const BladeCore = createBladeCore(dependencies);
  const { CLOCK, CONFIG, presentation, clamp, len, lerp, lerpAngle } = dependencies;

class Blade extends BladeCore {
  _updateThrown(dt: number, player: BladePlayerPort, platforms: readonly BladePlatformPort[]): void {
    if (this.weapon?.updateThrown) {
      this.weapon.updateThrown({ blade: this, dt, player, platforms });
      return;
    }
    this._updateStandardThrown(dt, player, platforms, false);
  }

  _updateStandardThrown(dt: number, player: BladePlayerPort, platforms: readonly BladePlatformPort[], retrace: boolean): void {
    const B = CONFIG.blade, T = B.throw;

    if (this.state === "returning") {
      const hand = this.handPos(player);
      let target = hand;
      if ((this.retraceReturn || retrace) && this.throwOrigin && !this.retraceDone) target = this.throwOrigin;
      let dx = target.x - this.x, dy = target.y - this.y;
      const dd = len(dx, dy);
      if (target !== hand && dd < 30) {
        this.retraceDone = true;
        dx = hand.x - this.x; dy = hand.y - this.y;
      }
      const homeD = len(hand.x - this.x, hand.y - this.y);
      const returnSpeed = T.returnSpeed * this.channel("returnSpeed");
      if ((target === hand || this.retraceDone) && homeD <= Math.max(26, returnSpeed * dt)) {
        // reattach to the hand -> back to a normal held blade
        this.state = "held";
        this.hostile = false; this.stolenBy = null;
        this.x = hand.x; this.y = hand.y;
        this.vx = 0; this.vy = 0;
        this.anchorTarget = null; this.anchorTerrain = false; this.secondaryActive = false;
        this.secondaryQueued = false; this.secondaryStartedNew = false;
        this.linkBrokenNew = false;
        this.caughtNew = true;
        if (this.weapon?.onCatch) this.weapon.onCatch({ blade: this, player });
        this._recomputeTip(dt);
        return;
      }
      const travelD = len(dx, dy) || 1;
      this.angle = Math.atan2(dy, dx);
      this.vx = (dx / travelD) * returnSpeed;
      this.vy = (dy / travelD) * returnSpeed;
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
        this.impactVX = this.vx; this.impactVY = this.vy;
        this.state = "embedded";
        this.vx = 0; this.vy = 0;
        this.embeddedNew = true;   // game triggers the lob shockwave on this edge
      }
    } else { // embedded / a weapon-owned stationary state
      this.vx = 0; this.vy = 0;
      this._recomputeTip(dt);
    }
  }

  _launchStraight(): undefined { return undefined; }

  _launchBallistic(gravity: number): void { this.throwGravity = gravity || 0; }

  _updateBallisticThrown(dt: number, player: BladePlayerPort, platforms: readonly BladePlatformPort[]): void {
    if (this.state === "flying") {
      this.vy += (this.throwGravity ?? CONFIG.weapons.hammer.meteorGravity) * dt;
      this.angle = Math.atan2(this.vy, this.vx);
    }
    this._updateStandardThrown(dt, player, platforms, false);
  }

  _updateSpearThrown(dt: number, player: BladePlayerPort, platforms: readonly BladePlatformPort[]): void {
    if (this.state === "embedded" && this.secondaryQueued) {
      this.secondaryQueued = false;
      if (this._beginSpearReel(player) === "recalled") this.secondaryStartedNew = true;
    }
    if (this.state === "flying" || this.state === "embedded") {
      this.linkT -= dt;
      if (this.state === "flying" && (this.linkT <= 0 || !this._linkInRange(player))) this.state = "returning";
      if (this.state === "embedded" && this.linkT <= 0) {
        this.anchorTarget = null; this.anchorTerrain = false;
        this.state = "returning"; this.linkBrokenNew = "timeout";
      }
    }
    if (this.state === "reeling") {
      this.linkT -= dt;
      const target = this.anchorTarget;
      if (target && (target.dead || target.dying)) { this.anchorTarget = null; this.state = "returning"; this.linkBrokenNew = "target"; }
      else if (!this._linkInRange(player)) {
        this.anchorTarget = null; this.anchorTerrain = false;
        this.state = "returning"; this.linkBrokenNew = "range";
      }
      else {
        const W = CONFIG.weapons.spear;
        const reelSpeed = W.reelSpeed * this.channel("returnSpeed");
        const tx = target ? target.x : this.x, ty = target ? target.y : this.y;
        const dx = tx - player.x, dy = ty - player.y, d = len(dx, dy) || 1;
        const heavy = target && ((target.isBoss ?? target.weight >= W.heavyWeight) || target.anchored);
        if (target && !heavy) {
          const ex = player.x - target.x, ey = player.y - target.y, em = len(ex, ey) || 1;
          target.vx += ex / em * reelSpeed * dt * 3.2; target.vy += ey / em * reelSpeed * dt * 3.2;
          this._placeTipAt(target.x, target.y, this.handPos(player));
          if (em < 58) this.state = "returning";
        } else {
          player.vx = lerp(player.vx, dx / d * reelSpeed, clamp(7 * dt, 0, 1));
          player.vy = lerp(player.vy, dy / d * reelSpeed, clamp(7 * dt, 0, 1));
          if (target) this._placeTipAt(target.x, target.y, this.handPos(player));
          if (d < 54) this.state = "returning";
        }
        if (this.linkT <= 0) { this.state = "returning"; this.linkBrokenNew = "timeout"; }
        this._recomputeTip(dt); this._pushTrail();
        return;
      }
    }
    this._updateStandardThrown(dt, player, platforms, false);
  }

  _launchChain(): void {
    this.linkT = CONFIG.weapons.chainblade.bindDuration * this.channel("controlDuration");
  }

  _updateChainThrown(dt: number, player: BladePlayerPort, _platforms?: readonly BladePlatformPort[]): void {
    void _platforms;
    const hand = this.handPos(player), W = CONFIG.weapons.chainblade;
    if (this.state === "latched" && this.secondaryQueued) {
      this.secondaryQueued = false;
      if (this._beginYank(player) === "recalled") this.secondaryStartedNew = true;
    }
    if (this.state === "latched") {
      this.linkT -= dt;
      const rangeBroken = this.anchorTarget && !this._pointInRange(player, { x: this.anchorTarget.x, y: this.anchorTarget.y }, this.linkRange());
      if (!this.anchorTarget || this.anchorTarget.dead || this.anchorTarget.dying || this.linkT <= 0 || rangeBroken) {
        if (rangeBroken) this.linkBrokenNew = "range";
        else if (this.linkT <= 0) this.linkBrokenNew = "timeout";
        else if (this.anchorTarget && (this.anchorTarget.dead || this.anchorTarget.dying)) this.linkBrokenNew = "target";
        this.anchorTarget = null; this.state = "returning";
      } else {
        this._placeTipAt(this.anchorTarget.x, this.anchorTarget.y, hand);
        this._recomputeTip(dt); return;
      }
    }
    if (this.state === "yanking") {
      this.linkT -= dt;
      const e = this.anchorTarget;
      const rangeBroken = e && !this._pointInRange(player, { x: e.x, y: e.y }, this.linkRange());
      if (!e || e.dead || e.dying || rangeBroken) {
        if (rangeBroken) this.linkBrokenNew = "range";
        else if (e && (e.dead || e.dying)) this.linkBrokenNew = "target";
        this.anchorTarget = null; this.state = "returning";
      }
      else {
        const dx = player.x - e.x, dy = player.y - e.y, d = len(dx, dy) || 1;
        const yankSpeed = W.yankSpeed * this.channel("returnSpeed");
        const resist = e.isBoss ? W.bossTug : (e.weight > 2 ? 0.48 : 1);
        e.vx += dx / d * yankSpeed * resist * dt * 4; e.vy += dy / d * yankSpeed * resist * dt * 4;
        if (e.isBoss) { player.vx += -dx / d * yankSpeed * 0.18 * dt; player.vy += -dy / d * yankSpeed * 0.12 * dt; }
        this._placeTipAt(e.x, e.y, hand);
        this._recomputeTip(dt);
        if (d < 68 || this.linkT <= 0) {
          if (d < 68) {
            if (!e.isBoss && typeof e.stun === "number") e.stun = Math.max(e.stun, W.arrivalStun * (e.weight > 2 ? 0.55 : 1));
            if ((e.isBoss || e.weight > 2) && e.applyBreak) e.applyBreak(W.yankBreak);
          }
          else this.linkBrokenNew = "timeout";
          this.state = "returning"; this.anchorTarget = null;
        }
        return;
      }
    }
    if (this.state === "flying") {
      this.linkT -= dt;
      const d = len(this.tipX - hand.x, this.tipY - hand.y);
      if (d > this.linkRange() || this.linkT <= 0 || this.flyTime + dt >= CONFIG.blade.throw.maxLife) this.state = "returning";
    }
    this._updateStandardThrown(dt, player, [], false); // Chainblade never embeds in terrain.
  }

  _launchCircuit(): void {
    this.state = "circuiting";
    this.circuitOrbit = this.orbit;
    const rangeDuration = clamp(1 + (this.channelMods.remoteRange - 1) * 0.55, 1, 1.55);
    this.circuitEnergy = CONFIG.weapons.ringblade.circuitEnergy * this.channel("controlDuration") * rangeDuration * (0.75 + this.orbit * 0.5) + this.recallWindow;
    this.circuitEnergyMax = this.circuitEnergy;
    this.circuitMaxLife = CONFIG.blade.throw.maxLife * this.channel("controlDuration") * rangeDuration * 1.8 + this.recallWindow;
    const releaseVX = this.releaseVX ?? 0, releaseVY = this.releaseVY ?? 0;
    const releaseSpeed = len(releaseVX, releaseVY);
    if (releaseSpeed >= CONFIG.blade.minHitSpeed * 0.35) {
      const throwSpeed = len(this.vx, this.vy);
      const W = CONFIG.weapons.ringblade;
      const releaseQuality = clamp(releaseSpeed / (CONFIG.blade.minHitSpeed * 1.35), 0, 1);
      const tangentWeight = lerp(W.tangentMin, W.tangentMax, this.circuitOrbit) * releaseQuality;
      let bx = this.vx / (throwSpeed || 1) * (1 - tangentWeight) + releaseVX / releaseSpeed * tangentWeight;
      let by = this.vy / (throwSpeed || 1) * (1 - tangentWeight) + releaseVY / releaseSpeed * tangentWeight;
      const bm = len(bx, by) || 1; bx /= bm; by /= bm;
      this.vx = bx * throwSpeed;
      this.vy = by * throwSpeed;
      this.angle = Math.atan2(this.vy, this.vx);
    }
    this.orbit = 0;
  }

  _updateCircuit(dt: number, player: BladePlayerPort, platforms: readonly BladePlatformPort[]): void {
    if (this.state === "circuiting") {
      const W = CONFIG.weapons.ringblade;
      this.flyTime += dt; this.circuitEnergy -= dt;
      this.circuitBounceCd = Math.max(0, (this.circuitBounceCd ?? 0) - dt);
      const desired = Math.atan2(this.aimY, this.aimX); // remote stick/mouse direction, not a homing line back to the player
      const current = Math.atan2(this.vy, this.vx);
      const next = lerpAngle(current, desired, clamp(W.steer * this.channel("remoteRange") * dt, 0, 0.18));
      const sp = Math.max(CONFIG.blade.throw.speed, len(this.vx, this.vy));
      this.vx = Math.cos(next) * sp; this.vy = Math.sin(next) * sp;
      this.x += this.vx * dt; this.y += this.vy * dt; this.angle = next;
      if (this.circuitBounceCd <= 0 && this._circuitBounce(platforms)) { this.circuitEnergy -= W.bounceCost; this.circuitBounceCd = 0.08; }
      if (this.circuitEnergy <= 0 || this.flyTime >= (this.circuitMaxLife ?? 0)) this.state = "returning";
      this._recomputeTip(dt); this._pushTrail(); return;
    }
    this._updateStandardThrown(dt, player, platforms, false);
  }

  _circuitBounce(platforms: readonly BladePlatformPort[]): boolean {
    const V = CONFIG.view, r = Math.max(14, this.curLength * 0.28); let hit = false;
    if (this.x < r) { this.x = r; this.vx = Math.abs(this.vx); hit = true; }
    else if (this.x > V.w - r) { this.x = V.w - r; this.vx = -Math.abs(this.vx); hit = true; }
    if (this.y < r) { this.y = r; this.vy = Math.abs(this.vy); hit = true; }
    else if (this.y > CONFIG.world.groundY - r) { this.y = CONFIG.world.groundY - r; this.vy = -Math.abs(this.vy); hit = true; }
    for (const p of platforms) {
      if (p.oneway || p.floor) continue;
      if (this.x + r < p.x || this.x - r > p.x + p.w || this.y + r < p.y || this.y - r > p.y + p.h) continue;
      const dl = Math.abs((this.x + r) - p.x), dr = Math.abs((p.x + p.w) - (this.x - r));
      const dt = Math.abs((this.y + r) - p.y), db = Math.abs((p.y + p.h) - (this.y - r));
      if (Math.min(dl, dr) < Math.min(dt, db)) this.vx *= -1; else this.vy *= -1;
      hit = true; break;
    }
    if (hit) { this.angle = Math.atan2(this.vy, this.vx); this.vx *= 0.94; this.vy *= 0.94; }
    return hit;
  }

  _beginReturn(player: BladePlayerPort, opts: { retrace?: boolean } = {}): BladeActionResult {
    if (this.state === "held" || this.state === "returning" || this.secondaryActive) return "busy";
    if (!(this.hostile || this.stolenBy || this._pointInRange(player, { x: this.x, y: this.y }, this.recallRange()))) return "toofar";
    this.pierced = new Set(); this.hostile = false; this.stolenBy = null;
    this.secondaryActive = true; this.retraceReturn = !!(opts.retrace); this.retraceDone = false;
    this.state = "returning";
    return "recalled";
  }

  _beginSpearReel(player: BladePlayerPort): BladeActionResult {
    if (this.state === "flying") { this.secondaryQueued = true; return "queued"; }
    if (this.state === "reeling" || this.secondaryActive) return "busy";
    if (this.state !== "embedded") return this._beginReturn(player);
    if (this.anchorTarget && (this.anchorTarget.dead || this.anchorTarget.dying)) {
      this.anchorTarget = null; this.state = "returning"; this.linkBrokenNew = "target"; return "busy";
    }
    if (!this._linkInRange(player)) return "toofar";
    this.secondaryActive = true; this.pierced = new Set(); this.state = "reeling"; return "recalled";
  }

  _beginYank(player: BladePlayerPort): BladeActionResult {
    if (this.state === "yanking" || this.secondaryActive) return "busy";
    if (this.state === "flying") { this.secondaryQueued = true; return "queued"; }
    if (this.state === "latched" && this.anchorTarget) {
      if (this.anchorTarget.dead || this.anchorTarget.dying) {
        this.anchorTarget = null; this.state = "returning"; this.linkBrokenNew = "target"; return "busy";
      }
      if (!this._linkInRange(player)) return "toofar";
      this.secondaryActive = true; this.pierced = new Set(); this.chainCollided = new Set();
      this.linkT = Math.max(this.linkT, CONFIG.weapons.chainblade.yankMinDuration * this.channel("controlDuration"));
      this.state = "yanking"; return "recalled";
    }
    return this._beginReturn(player);
  }

  _beginCircuitReturn(player: BladePlayerPort): BladeActionResult {
    if (this.state === "returning" || this.secondaryActive) return "busy";
    if (this.state === "circuiting") { this.secondaryActive = true; this.orbit = this.circuitOrbit * 0.45; this.state = "returning"; this.vx *= -1; this.vy *= -1; return "recalled"; }
    return this._beginReturn(player);
  }

  // back the blade out of any wall it has driven its tip into, or off-screen; returns
  // true if it should embed now.
  _embedIfHit(platforms: readonly BladePlatformPort[]): boolean {
    const V = CONFIG.view, L = this.curLength;
    const inSolid = (tx: number, ty: number): boolean => {
      if (tx < 0 || tx > V.w || ty < 0 || ty > V.h) return true;
      for (const p of platforms) {
        if (tx >= p.x && tx <= p.x + p.w && ty >= p.y && ty <= p.y + p.h) return true;
      }
      return false;
    };
    if (!inSolid(this.tipX, this.tipY)) return false;

    // blade sinks in tip-first, up to the hilt: keep the travel orientation and slide
    // the hilt to the surface so most of the blade is buried (tip stays inside the wall).
    const m = len(this.vx, this.vy) || 1;
    const dx = this.vx / m, dy = this.vy / m;     // travel direction (into the wall)
    let g = 0;
    while (inSolid(this.x, this.y) && g < 80) { this.x -= dx * 3; this.y -= dy * 3; g++; } // if hilt is inside, back it out
    g = 0;
    while (g < 80) {                               // then advance the hilt up to the surface
      const nx = this.x + dx * 3, ny = this.y + dy * 3;
      if (inSolid(nx, ny)) break;
      this.x = nx; this.y = ny; g++;
    }
    this.tipX = this.x + Math.cos(this.angle) * L;
    this.tipY = this.y + Math.sin(this.angle) * L;
    return true;
  }

  // ---- actions ----
  throwBlade(): boolean {
    if (this.state !== "held") return false;
    const T = CONFIG.blade.throw;
    this.releaseVX = this.vx; this.releaseVY = this.vy;
    // throw toward the reticle (where you're aiming) — far more accurate than the
    // momentum-led blade angle while you're moving/jumping/dashing.
    let dirX = this.aimX, dirY = this.aimY;
    const am = len(dirX, dirY);
    if (am < 1) { dirX = Math.cos(this.angle); dirY = Math.sin(this.angle); }
    else { dirX /= am; dirY /= am; }
    this.angle = Math.atan2(dirY, dirX);   // blade points the way it's thrown
    const channelSpeed = this.channel("throwSpeed");
    const sp = clamp((T.speed + this.tipSpeed * T.speedFromSwing) * channelSpeed, T.speed * channelSpeed, T.maxSpeed * channelSpeed);
    this.vx = dirX * sp;
    this.vy = dirY * sp;
    this.throwDmg = (T.damage + sp * T.damageFromSpeed) * this.channel("throwPower");
    this.throwBaseDmg = this.throwDmg;   // Overdrive ramp is capped relative to this
    this.pierced = new Set();
    this.flyTime = 0;
    this.throwId++;
    this.throwOrigin = { x: this.x, y: this.y };
    this.throwResolved = false;
    this.impactResolved = false;
    this.secondaryActive = false;
    this.secondaryQueued = false; this.secondaryStartedNew = false;
    this.anchorTarget = null; this.anchorTerrain = false;
    this.linkBrokenNew = false;
    this.retraceReturn = false; this.retraceDone = false;
    this.redirectSpent = false;
    this.impactVX = null; this.impactVY = null;
    this._repeatHits.clear();
    this.hostile = false; this.stolenBy = null;
    this.state = "flying";
    if (this.weapon?.onThrowLaunch) this.weapon.onThrowLaunch({ blade: this });
    return true;
  }

  // recall if within tether range; returns "recalled" | "toofar"
  tryRecall(player: BladePlayerPort): BladeActionResult {
    if (this.state === "held" || this.state === "returning" || this.secondaryActive || this.secondaryQueued) return "busy";
    if (this.weapon?.onSecondaryThrowAction) {
      return this.weapon.onSecondaryThrowAction({ blade: this, player });
    }
    return this._beginReturn(player);
  }

  get thrown() { return ["flying", "returning", "embedded", "reeling", "latched", "yanking", "circuiting"].includes(this.state); }

  // how "clean" the swing is: 1 = a true perpendicular cut, ~0 = a straight poke/thrust.
  // (the perpendicular component of tip velocity relative to the blade's own axis)
  sliceQuality(): number {
    if (this.tipSpeed < 1) return 0;
    const perpX = -Math.sin(this.angle), perpY = Math.cos(this.angle);
    return clamp(Math.abs((this.tipVX * perpX + this.tipVY * perpY) / this.tipSpeed), 0, 1);
  }

  axialQuality(): number {
    if (this.tipSpeed < 1) return 0;
    const ax = Math.cos(this.angle), ay = Math.sin(this.angle);
    return clamp(Math.abs((this.tipVX * ax + this.tipVY * ay) / this.tipSpeed), 0, 1);
  }

  hitQuality(enemy?: object): number {
    void enemy;
    if (this.weapon?.qualityMetric) {
      return clamp(this.weapon.qualityMetric({ blade: this }), 0, 1);
    }
    return this.sliceQuality();
  }

  repeatScale(enemy: object): number {
    const W = CONFIG.weapons.ringblade, now = CLOCK.sim;
    const prev = this._repeatHits.get(enemy);
    if (prev == null || now - prev >= W.repeatWindow) return 1;
    const momentum = this.state === "held" ? this.orbit : this.circuitOrbit;
    return lerp(W.repeatFloor, 0.8, momentum);
  }

  thrownCollisionPad(): number {
    const pad = this.weapon?.throwCollisionPad ?? 4;
    return pad + (this.weapon?.id === "ringblade" ? 20 * this.throwSizeMult : 0);
  }

  heldCollisionSegment(player: BladePlayerPort): { x1: number; y1: number; x2: number; y2: number; pad: number } {
    if (this.weapon?.id === "chainblade") {
      const hand = this.handPos(player);
      return { x1: hand.x, y1: hand.y, x2: this.tipX, y2: this.tipY, pad: 5 };
    }
    if (this.weapon?.id === "ringblade") return { x1: this.x, y1: this.y, x2: this.x, y2: this.y, pad: 24 };
    return { x1: this.x, y1: this.y, x2: this.tipX, y2: this.tipY, pad: 4 };
  }

  thrownCollisionSegment(): { x1: number; y1: number; x2: number; y2: number; pad?: number } {
    if (this.weapon?.id === "ringblade") return { x1: this.x, y1: this.y, x2: this.x, y2: this.y };
    return { x1: this.x, y1: this.y, x2: this.tipX, y2: this.tipY };
  }

  recordHit(enemy: BladeEnemyPort): void {
    this._repeatHits.set(enemy, CLOCK.sim);
  }

  canHitThrownEnemy(enemy: BladeEnemyPort): boolean {
    if (this.weapon?.id === "hammer" && this.state === "returning" && this.pierced.size >= CONFIG.weapons.hammer.recallTargetCap) return false;
    if (this.weapon?.id === "ringblade") {
      const now = typeof CLOCK !== "undefined" ? CLOCK.sim : 0, prev = this._repeatHits.get(enemy);
      return prev == null || now - prev >= CONFIG.weapons.ringblade.repeatWindow * 0.62;
    }
    return !this.pierced.has(enemy);
  }

  // damage for a held swing (0 if below threshold or not held).
  // Skill shaping: a clean CUT beats a POKE, and a committed arm swing (the hilt
  // actually travelling) beats a wrist-flick of the tip. Style->damage is applied
  // by the combat loop (it needs the live trick multiplier).
  damageAt(): number {
    const B = CONFIG.blade, S = CONFIG.skill;
    if (this.state !== "held" || this.tipSpeed < B.minHitSpeed) return 0;
    let dmg = Math.min((this.tipSpeed - B.minHitSpeed) * B.damageScale, B.maxDamage);
    const quality = this.hitQuality();
    dmg *= lerp(S.pokeFloor, 1, quality);
    const commit = clamp(len(this.vx, this.vy) / S.commitRef, 0, 1);
    dmg *= lerp(S.commitFloor, 1, commit);
    if (this.weapon?.damageProfile) dmg *= this.weapon.damageProfile({ blade: this, quality, baseDamage: dmg });
    return dmg;
  }

  draw(surface: unknown, player: BladePlayerPort): void { presentation.draw(surface, this, player); }

}

  return Blade;
}

export { createBlade };

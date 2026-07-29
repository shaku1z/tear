// ------- the momentum blade -------
import { createBladeCore } from "./blade-core";
import type {
  BladeActionResult, BladeDependencies, BladeEnemyPort, BladePlatformPort, BladeWeaponEvent,
  BladePlayerPort,
} from "./blade-contracts";

export type {
  BladeActionResult, BladeChannels, BladeDependencies, BladeEnemyPort, BladeEntity,
  BladeInputPort, BladePlatformPort, BladePlayerPort, BladePoint, BladePresentationPort,
  BladeRenderSnapshot, BladeWeaponContext, BladeWeaponPort, GameConfig,
} from "./blade-contracts";

function createBlade(dependencies: BladeDependencies) {
  const BladeCore = createBladeCore(dependencies);
  const { CLOCK, CONFIG, Input, presentation, clamp, len, lerp } = dependencies;

class Blade extends BladeCore {
  reversal: {
    x: number; y: number; directionX: number; directionY: number;
    swingId: number; expiresAt: number; exited: boolean;
  } | null = null;

  override update(dt: number, player: BladePlayerPort, platforms: readonly BladePlatformPort[]): void {
    super.update(dt, player, platforms);
    this._updateReversalState();
    this._updateRiftlock(dt, player);
  }

  resetRiftlock(): void {
    this.riftChambers = CONFIG.weapons.riftlock.chambers;
    this.riftChamberCooldown = 0;
    this.riftFireCooldown = 0;
    this.riftBayonetSwingId = -1;
    this.weaponEvents.length = 0;
  }

  refillRiftChambers(amount: number): void {
    if (this.weapon?.id !== "riftlock") return;
    this.riftChambers = clamp(this.riftChambers + Math.max(0, Math.floor(amount)), 0, CONFIG.weapons.riftlock.chambers);
    if (this.riftChambers >= CONFIG.weapons.riftlock.chambers) this.riftChamberCooldown = 0;
  }

  claimRiftBayonet(): boolean {
    if (this.weapon?.id !== "riftlock" || this.riftBayonetSwingId === this.swingId) return false;
    this.riftBayonetSwingId = this.swingId;
    this.refillRiftChambers(CONFIG.weapons.riftlock.bayonetRefill);
    return true;
  }

  drainWeaponEvents(): readonly BladeWeaponEvent[] {
    const events = this.weaponEvents.slice();
    this.weaponEvents.length = 0;
    return events;
  }

  _updateRiftlock(dt: number, player: BladePlayerPort): void {
    if (this.weapon?.id !== "riftlock") return;
    this.riftFireCooldown = Math.max(0, this.riftFireCooldown - dt);
    if (this.riftChambers < CONFIG.weapons.riftlock.chambers) {
      this.riftChamberCooldown -= dt;
      if (this.riftChamberCooldown <= 0) {
        this.refillRiftChambers(1);
        if (this.riftChambers < CONFIG.weapons.riftlock.chambers) this.riftChamberCooldown = CONFIG.weapons.riftlock.chamberReform;
      }
    }
    if (Input.tetherHeld) this._fireRazorRound(player);
  }

  _fireRazorRound(player: BladePlayerPort): boolean {
    if (this.riftChambers <= 0 || this.riftFireCooldown > 0 || this.hostile) return false;
    const speed = CONFIG.weapons.riftlock.razorSpeed;
    const aimLength = len(this.aimX, this.aimY) || 1;
    const directionX = this.aimX / aimLength, directionY = this.aimY / aimLength;
    const remote = this.state !== "held";
    this.riftChambers -= 1;
    this.riftFireCooldown = remote ? CONFIG.weapons.riftlock.remoteShotCooldown : CONFIG.weapons.riftlock.razorCooldown;
    this.riftChamberCooldown = Math.max(this.riftChamberCooldown, CONFIG.weapons.riftlock.chamberReform);
    const recoil = CONFIG.weapons.riftlock.recoil;
    if (remote) { this.vx -= directionX * recoil; this.vy -= directionY * recoil; }
    else { this.vx -= directionX * recoil * 0.25; this.vy -= directionY * recoil * 0.25; player.vx -= directionX * recoil; player.vy -= directionY * recoil; }
    const attackId = this.claimAttack();
    this.weaponEvents.push(Object.freeze({
      type: "razorRound", x: this.tipX, y: this.tipY, vx: directionX * speed, vy: directionY * speed,
      damage: CONFIG.weapons.riftlock.razorDamage, attackId, throwId: this.throwId, remote,
    }));
    return true;
  }

  _updateReversalState(): void {
    const reversal = this.reversal;
    if (!reversal) return;
    if (CLOCK.sim > reversal.expiresAt) { this.reversal = null; return; }
    if (!reversal.exited && len(this.tipX - reversal.x, this.tipY - reversal.y) >= CONFIG.weapons.sword.reversalExitRadius) {
      reversal.exited = true;
    }
  }

  resolveReversal(): "armed" | "reversal" | null {
    const speed = len(this.tipVX, this.tipVY);
    if (speed < 1) return null;
    const directionX = this.tipVX / speed, directionY = this.tipVY / speed;
    const current = this.reversal;
    if (!current || CLOCK.sim > current.expiresAt) {
      this.reversal = {
        x: this.tipX, y: this.tipY, directionX, directionY, swingId: this.swingId,
        expiresAt: CLOCK.sim + CONFIG.weapons.sword.reversalWindow, exited: false,
      };
      return "armed";
    }
    const dot = current.directionX * directionX + current.directionY * directionY;
    if (!current.exited || current.swingId === this.swingId || dot > CONFIG.weapons.sword.reversalOppositeDot) return null;
    this.reversal = null;
    return "reversal";
  }

  heldDamageMultiplierAt(x: number, y: number): number {
    if (this.weapon?.id !== "greatsword") return 1;
    const dx = this.tipX - this.x, dy = this.tipY - this.y, lengthSquared = dx * dx + dy * dy || 1;
    const along = clamp(((x - this.x) * dx + (y - this.y) * dy) / lengthSquared, 0, 1);
    const edge = clamp(along / CONFIG.weapons.greatsword.weakNearHilt, 0, 1);
    return lerp(0.55, 1, edge);
  }

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
      let targetIsThreadcutWaypoint = false;
      if ((this.retraceReturn || retrace) && !this.retraceDone) {
        const routeTarget = this.threadcutRoute[this.threadcutIndex];
        if (routeTarget) {
          target = routeTarget;
          targetIsThreadcutWaypoint = true;
        } else if (this.throwOrigin) target = this.throwOrigin;
        else this.retraceDone = true;
      }
      const dx = target.x - this.x, dy = target.y - this.y;
      const dd = len(dx, dy);
      if (target !== hand && dd < 30) {
        if (targetIsThreadcutWaypoint) this.threadcutIndex -= 1;
        else this.retraceDone = true;
      }
      const homeD = len(hand.x - this.x, hand.y - this.y);
      const returnSpeed = T.returnSpeed * this.channel("returnSpeed");
      if ((target === hand || this.retraceDone) && homeD <= Math.max(26, returnSpeed * dt)) {
        // reattach to the hand -> back to a normal held blade
        this.state = "held";
        this.hostile = false; this.stolenBy = null;
        this.x = hand.x; this.y = hand.y;
        this.vx = 0; this.vy = 0;
        this.hookTarget = null; this.secondaryActive = false;
        this.secondaryQueued = false; this.secondaryStartedNew = false;
        this.linkBrokenNew = false;
        this.caughtNew = true;
        if (this.weapon?.onCatch) this.weapon.onCatch({ blade: this });
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

  _launchWheelCut(): void {
    this.wheelSpin = CONFIG.weapons.greatsword.wheelSpin;
  }

  _updateWheelCut(dt: number, player: BladePlayerPort, platforms: readonly BladePlatformPort[]): void {
    this._updateStandardThrown(dt, player, platforms, false);
    if (this.state === "flying" || this.state === "returning") {
      const spin = this.state === "returning" ? -CONFIG.weapons.greatsword.wheelReturnSpin : this.wheelSpin;
      this.angle += spin * dt;
      this._recomputeTip(dt);
    }
  }

  _launchHook(): void {
    this.linkT = CONFIG.weapons.chainblade.hookDuration * this.channel("controlDuration");
  }

  _updateHookThrown(dt: number, player: BladePlayerPort, _platforms?: readonly BladePlatformPort[]): void {
    void _platforms;
    const hand = this.handPos(player), W = CONFIG.weapons.chainblade;
    if (this.state === "hooked" && this.secondaryQueued) {
      this.secondaryQueued = false;
      if (this._releaseHook(player) === "recalled") this.secondaryStartedNew = true;
    }
    if (this.state === "hooked") {
      this.linkT -= dt;
      const e = this.hookTarget;
      const rangeBroken = e && !this._pointInRange(player, { x: e.x, y: e.y }, this.linkRange());
      if (!e || e.dead || e.dying || this.linkT <= 0 || rangeBroken) {
        if (rangeBroken) this.linkBrokenNew = "range";
        else if (this.linkT <= 0) this.linkBrokenNew = "timeout";
        else if (e && (e.dead || e.dying)) this.linkBrokenNew = "target";
        this.hookTarget = null; this.state = "returning";
      } else {
        const dx = e.x - hand.x, dy = e.y - hand.y;
        const distance = len(dx, dy) || 1;
        if (this.slingRadius <= 0) {
          this.slingRadius = clamp(distance, W.minRadius, W.maxRadius);
          this.slingAngle = Math.atan2(dy, dx);
        }
        const aimLength = len(this.aimX, this.aimY);
        const targetAngle = aimLength > 1 ? Math.atan2(this.aimY, this.aimX) : this.slingAngle;
        const angleDelta = Math.atan2(Math.sin(targetAngle - this.slingAngle), Math.cos(targetAngle - this.slingAngle));
        const desiredAngularVelocity = clamp(angleDelta * W.angularControl, -W.angularControl * 1.4, W.angularControl * 1.4);
        this.slingAngularVelocity = lerp(this.slingAngularVelocity, desiredAngularVelocity, clamp(W.angularControl * dt, 0, 1));
        this.slingAngle += this.slingAngularVelocity * dt;
        const aimRadius = clamp(aimLength, W.minRadius, W.maxRadius);
        this.slingRadius = Input.tetherHeld
          ? Math.max(W.minRadius, this.slingRadius - W.tightenRate * dt)
          : lerp(this.slingRadius, aimRadius, clamp(3 * dt, 0, 1));
        const tangentX = -Math.sin(this.slingAngle), tangentY = Math.cos(this.slingAngle);
        const desiredX = hand.x + Math.cos(this.slingAngle) * this.slingRadius;
        const desiredY = hand.y + Math.sin(this.slingAngle) * this.slingRadius;
        const resistance = e.isBoss ? W.bossTug : (e.weight > 2 ? 0.48 : 1);
        const follow = clamp(W.angularControl * dt * resistance, 0, 1);
        const targetVX = player.vx + tangentX * this.slingRadius * this.slingAngularVelocity + (desiredX - e.x) * W.angularControl;
        const targetVY = player.vy + tangentY * this.slingRadius * this.slingAngularVelocity + (desiredY - e.y) * W.angularControl;
        e.vx = lerp(e.vx, targetVX, follow);
        e.vy = lerp(e.vy, targetVY, follow);
        this.tension = clamp(1 - this.slingRadius / W.maxRadius, 0, 1);
        this._placeTipAt(e.x, e.y, hand);
        this._recomputeTip(dt); return;
      }
    }
    if (this.state === "flying") {
      this.linkT -= dt;
      const d = len(this.tipX - hand.x, this.tipY - hand.y);
      if (d > this.linkRange() || this.linkT <= 0 || this.flyTime + dt >= CONFIG.blade.throw.maxLife) this.state = "returning";
    }
    this._updateStandardThrown(dt, player, [], false); // Chainblade never embeds in terrain.
  }

  _launchLooseCannon(): void {
    this.looseCannonT = CONFIG.weapons.riftlock.looseCannonDuration * this.channel("controlDuration");
  }

  _updateLooseCannon(dt: number, player: BladePlayerPort, platforms: readonly BladePlatformPort[]): void {
    this.looseCannonT = Math.max(0, this.looseCannonT - dt);
    this._updateStandardThrown(dt, player, platforms, false);
    if (this.looseCannonT <= 0 && this.state === "flying") this.state = "returning";
  }

  _beginReturn(player: BladePlayerPort, opts: { retrace?: boolean } = {}): BladeActionResult {
    if (this.state === "held" || this.state === "returning" || this.secondaryActive) return "busy";
    if (!(this.hostile || this.stolenBy || this._pointInRange(player, { x: this.x, y: this.y }, this.recallRange()))) return "toofar";
    this.pierced = new Set(); this.hostile = false; this.stolenBy = null;
    this.secondaryActive = true; this.retraceReturn = !!(opts.retrace); this.retraceDone = false;
    this.threadcutIndex = this.retraceReturn ? this.threadcutRoute.length - 1 : -1;
    this.state = "returning";
    return "recalled";
  }

  _releaseHook(player: BladePlayerPort): BladeActionResult {
    if (this.secondaryActive) return "busy";
    if (this.state === "flying") { this.secondaryQueued = true; return "queued"; }
    if (this.state === "hooked" && this.hookTarget) {
      const e = this.hookTarget;
      if (e.dead || e.dying) {
        this.hookTarget = null; this.state = "returning"; this.linkBrokenNew = "target"; return "busy";
      }
      if (!this._linkInRange(player)) return "toofar";
      const W = CONFIG.weapons.chainblade;
      const direction = Math.sign(this.slingAngularVelocity) || 1;
      const tangentX = -Math.sin(this.slingAngle) * direction, tangentY = Math.cos(this.slingAngle) * direction;
      const resistance = e.isBoss ? W.bossTug : (e.weight > 2 ? 0.48 : 1);
      const releaseSpeed = Math.max(W.slingSpeed * this.channel("secondaryPower"), len(e.vx, e.vy));
      e.vx += tangentX * releaseSpeed * resistance;
      e.vy += tangentY * releaseSpeed * resistance;
      if (e.isBoss) { player.vx -= tangentX * releaseSpeed * 0.18; player.vy -= tangentY * releaseSpeed * 0.12; }
      else e.stun = Math.max(e.stun, W.releaseStun * (e.weight > 2 ? 0.55 : 1));
      if ((e.isBoss || e.weight > 2) && e.applyBreak) e.applyBreak(W.heavyBreak);
      this.pierced = new Set(); this.secondaryActive = true; this.hookTarget = null; this.state = "returning";
      return "recalled";
    }
    return this._beginReturn(player);
  }

  _beginBackblast(player: BladePlayerPort): BladeActionResult {
    const result = this._beginReturn(player);
    if (result === "recalled") {
      const speed = Math.max(CONFIG.weapons.riftlock.backblastSpeed, len(this.vx, this.vy));
      this.vx *= -1; this.vy *= -1;
      if (len(this.vx, this.vy) < 1) {
        const hand = this.handPos(player), dx = hand.x - this.x, dy = hand.y - this.y, distance = len(dx, dy) || 1;
        this.vx = dx / distance * speed; this.vy = dy / distance * speed;
      }
    }
    return result;
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
    this.claimAttack();
    this.throwOrigin = { x: this.x, y: this.y };
    this.throwResolved = false;
    this.impactResolved = false;
    this.secondaryActive = false;
    this.secondaryQueued = false; this.secondaryStartedNew = false;
    this.hookTarget = null;
    this.threadcutRoute = []; this.threadcutIndex = -1;
    this.slingRadius = 0; this.slingAngle = 0; this.slingAngularVelocity = 0;
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

  get thrown() { return ["flying", "returning", "embedded", "hooked"].includes(this.state); }

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
    void enemy;
    return 1;
  }

  thrownCollisionPad(): number {
    return this.weapon?.throwCollisionPad ?? 4;
  }

  heldCollisionSegment(player: BladePlayerPort): { x1: number; y1: number; x2: number; y2: number; pad: number } {
    if (this.weapon?.id === "chainblade") {
      const hand = this.handPos(player);
      return { x1: hand.x, y1: hand.y, x2: this.tipX, y2: this.tipY, pad: 5 };
    }
    const pad = this.weapon?.id === "greatsword" ? 11 : 4;
    return { x1: this.x, y1: this.y, x2: this.tipX, y2: this.tipY, pad };
  }

  thrownCollisionSegment(): { x1: number; y1: number; x2: number; y2: number; pad?: number } {
    return { x1: this.x, y1: this.y, x2: this.tipX, y2: this.tipY };
  }

  recordHit(enemy: BladeEnemyPort): void {
    this._repeatHits.set(enemy, CLOCK.sim);
    if (this.weapon?.id === "sword" && this.state === "flying") {
      const previous = this.threadcutRoute.reduce(
        (_previous, point) => point,
        { x: Number.NaN, y: Number.NaN },
      );
      if (previous.x !== enemy.x || previous.y !== enemy.y) {
        this.threadcutRoute.push({ x: enemy.x, y: enemy.y });
      }
    }
  }

  canHitThrownEnemy(enemy: BladeEnemyPort): boolean {
    if (this.weapon?.id === "hammer" && this.state === "returning" && this.pierced.size >= CONFIG.weapons.hammer.recallTargetCap) return false;
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

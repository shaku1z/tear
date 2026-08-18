// ------- the momentum blade -------
import { createBladeCore } from "./blade-core";
import { chainCollisionSegments, updateChainNodes } from "./blade-chain-runtime";
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
  reversals: {
    target: object;
    x: number; y: number; directionX: number; directionY: number;
    swingId: number; expiresAt: number; exited: boolean;
  }[] = [];

  override update(dt: number, player: BladePlayerPort, platforms: readonly BladePlatformPort[]): void {
    super.update(dt, player, platforms);
    this._updateReversalState();
    this._updateRiftlock(dt, player);
    this._updateChainNodes(dt, this.handPos(player));
  }

  resetRiftlock(): void {
    this.riftChambers = CONFIG.weapons.riftlock.chambers;
    this.riftChamberCooldown = 0;
    this.riftFireCooldown = 0;
    this.riftBayonetSwingId = -1;
    this.riftTriggerHeld = false;
    this.riftRecoilUntil = 0;
    this.riftRecoilHits.clear();
    this.backblastActive = false;
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

  claimRiftRecoilCut(target: object): boolean {
    if (this.weapon?.id !== "riftlock" || CLOCK.sim > this.riftRecoilUntil || this.riftRecoilHits.has(target)) return false;
    this.riftRecoilHits.add(target);
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
    const pressed = Input.tetherHeld && !this.riftTriggerHeld;
    this.riftTriggerHeld = Input.tetherHeld;
    if (pressed) this._fireRazorRound(player);
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
    if (remote) {
      this.vx -= directionX * recoil; this.vy -= directionY * recoil;
      if (this.state === "captured" && this.hookTarget) {
        const target = this.hookTarget;
        const massResponse = 1 / Math.sqrt(Math.max(0.5, target.weight || 1));
        const transfer = target.isBoss
          ? CONFIG.weapons.riftlock.captureBossTransfer
          : CONFIG.weapons.riftlock.captureRecoilTransfer * massResponse;
        target.vx -= directionX * recoil * transfer;
        target.vy -= directionY * recoil * transfer;
      }
    }
    else {
      this.vx -= directionX * recoil * 0.25; this.vy -= directionY * recoil * 0.25;
      player.vx -= directionX * recoil; player.vy -= directionY * recoil;
      this.riftRecoilUntil = CLOCK.sim + CONFIG.weapons.riftlock.recoilCutWindow;
      this.riftRecoilHits.clear();
    }
    const attackId = this.claimAttack();
    this.weaponEvents.push(Object.freeze({
      type: "razorRound", x: this.tipX, y: this.tipY, vx: directionX * speed, vy: directionY * speed,
      damage: CONFIG.weapons.riftlock.razorDamage * (remote ? this.channel("throwPower") : 1),
      attackId, throwId: this.throwId, remote, secondary: false,
    }));
    return true;
  }

  _updateReversalState(): void {
    if (!Array.isArray(this.reversals)) this.reversals = [];
    for (let index = this.reversals.length - 1; index >= 0; index--) {
      const reversal = this.reversals[index];
      if (!reversal) continue;
      if (CLOCK.sim > reversal.expiresAt) { this.reversals.splice(index, 1); continue; }
      const targetRadius = Number(Reflect.get(reversal.target, "radius")) || 0;
      const exitRadius = Math.max(CONFIG.weapons.sword.reversalExitRadius,
        targetRadius + CONFIG.weapons.sword.reversalExitPadding);
      if (!reversal.exited && len(this.tipX - reversal.x, this.tipY - reversal.y) >= exitRadius) {
        reversal.exited = true;
      }
    }
  }

  resolveReversal(target: object): "armed" | "reversal" | null {
    const speed = len(this.tipVX, this.tipVY);
    if (speed < 1) return null;
    const directionX = this.tipVX / speed, directionY = this.tipVY / speed;
    if (!Array.isArray(this.reversals)) this.reversals = [];
    const currentIndex = this.reversals.findIndex((entry) => entry.target === target);
    const current = this.reversals[currentIndex];
    if (!current || CLOCK.sim > current.expiresAt) {
      if (currentIndex >= 0) this.reversals.splice(currentIndex, 1);
      this.reversals.push({
        target, x: this.tipX, y: this.tipY, directionX, directionY, swingId: this.swingId,
        expiresAt: CLOCK.sim + CONFIG.weapons.sword.reversalWindow, exited: false,
      });
      return "armed";
    }
    const dot = current.directionX * directionX + current.directionY * directionY;
    if (!current.exited || current.swingId === this.swingId || dot > CONFIG.weapons.sword.reversalOppositeDot) return null;
    this.reversals.splice(currentIndex, 1);
    return "reversal";
  }

  primeReversal(target: object): boolean {
    if (this.weapon?.id !== "sword") return false;
    const existing = this.reversals.findIndex((entry) => entry.target === target);
    if (existing >= 0) this.reversals.splice(existing, 1);
    const speed = len(this.tipVX, this.tipVY);
    const directionX = speed > 0 ? this.tipVX / speed : Math.cos(this.angle);
    const directionY = speed > 0 ? this.tipVY / speed : Math.sin(this.angle);
    this.reversals.push({
      target, x: this.tipX, y: this.tipY, directionX, directionY,
      swingId: this.swingId, expiresAt: CLOCK.sim + CONFIG.weapons.sword.reversalWindow, exited: false,
    });
    return true;
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
      this.weapon.updateThrown({ blade: this, config: CONFIG, dt, player, platforms });
      return;
    }
    this._updateStandardThrown(dt, player, platforms, false);
  }

  _updateStandardThrown(dt: number, player: BladePlayerPort, platforms: readonly BladePlatformPort[], retrace: boolean,
    maximumLife = CONFIG.blade.throw.maxLife): void {
    const B = CONFIG.blade, T = B.throw;

    if (this.state === "returning") {
      const hand = this.handPos(player);
      let target = hand;
      let targetIsThreadcutWaypoint = false;
      if ((this.retraceReturn || retrace) && !this.retraceDone) {
        let routeTarget = this.threadcutRoute[this.threadcutIndex];
        while (routeTarget && (routeTarget.target.dead || routeTarget.target.dying)) {
          this.threadcutIndex -= 1;
          routeTarget = this.threadcutRoute[this.threadcutIndex];
        }
        if (routeTarget) {
          target = routeTarget.target;
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
      const returnSpeed = Math.max(T.returnSpeed * this.channel("returnSpeed"),
        this.backblastActive ? CONFIG.weapons.riftlock.backblastSpeed : 0);
      if ((target === hand || this.retraceDone) && homeD <= Math.max(26, returnSpeed * dt)) {
        // reattach to the hand -> back to a normal held blade
        this.state = "held";
        this.hostile = false; this.stolenBy = null;
        this.x = hand.x; this.y = hand.y;
        this.vx = 0; this.vy = 0;
        this.hookTarget = null; this.secondaryActive = false;
        this.secondaryQueued = false; this.secondaryStartedNew = false;
        this.linkBrokenNew = false;
        this.backblastActive = false;
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
      if (this.flyTime >= maximumLife || this._embedIfHit(platforms)) {
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
    const length = this.curLength;
    const centerX = this.x + Math.cos(this.angle) * length * 0.5;
    const centerY = this.y + Math.sin(this.angle) * length * 0.5;
    const previousX = this.x, previousY = this.y, previousAngle = this.angle;
    // Generic embedding assumes a straight, tip-first projectile and can move its
    // hilt hundreds of pixels while backing it out of a wall. Wheel Cut is a
    // center-pivoting body, so it owns a swept collision below.
    this._updateStandardThrown(dt, player, this.state === "flying" ? [] : platforms, false);
    if (this.state === "flying" || this.state === "returning") {
      const spin = this.state === "returning" ? 0 : this.wheelSpin;
      const translatedCenterX = centerX + (this.x - previousX);
      const translatedCenterY = centerY + (this.y - previousY);
      let nextAngle = previousAngle + spin * dt;
      if (this.state === "returning") {
        const targetAngle = Math.atan2(this.vy, this.vx) + Math.PI / 2;
        const delta = Math.atan2(Math.sin(targetAngle - previousAngle), Math.cos(targetAngle - previousAngle));
        nextAngle = previousAngle + delta * clamp(CONFIG.weapons.greatsword.wheelReturnAlign * dt, 0, 1);
      }
      if (this.state === "flying") {
        const steps = clamp(Math.ceil(Math.abs(spin * dt) * length / 10), 2, 10);
        let safeAmount = 0;
        for (let step = 1; step <= steps; step++) {
          const amount = step / steps;
          const sampleX = lerp(centerX, translatedCenterX, amount);
          const sampleY = lerp(centerY, translatedCenterY, amount);
          const sampleAngle = previousAngle + spin * dt * amount;
          if (this._wheelTouchesSolid(sampleX, sampleY, sampleAngle, length, platforms)) {
            const safeCenterX = lerp(centerX, translatedCenterX, safeAmount);
            const safeCenterY = lerp(centerY, translatedCenterY, safeAmount);
            this.angle = previousAngle + spin * dt * safeAmount;
            this.x = safeCenterX - Math.cos(this.angle) * length * 0.5;
            this.y = safeCenterY - Math.sin(this.angle) * length * 0.5;
            this._recomputeTip(dt);
            this.impactVX = this.vx; this.impactVY = this.vy;
            this.state = "embedded"; this.vx = 0; this.vy = 0; this.embeddedNew = true;
            return;
          }
          safeAmount = amount;
        }
      }
      this.angle = nextAngle;
      this.x = translatedCenterX - Math.cos(this.angle) * length * 0.5;
      this.y = translatedCenterY - Math.sin(this.angle) * length * 0.5;
      this._recomputeTip(dt);
    }
  }

  _wheelTouchesSolid(
    centerX: number, centerY: number, angle: number, length: number,
    platforms: readonly BladePlatformPort[],
  ): boolean {
    const half = length * 0.5;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const samples = Math.max(8, Math.ceil(length / 12));
    const pad = 8;
    for (let index = 0; index <= samples; index++) {
      const along = -half + length * index / samples;
      const x = centerX + cos * along, y = centerY + sin * along;
      if (x <= pad || x >= CONFIG.view.w - pad || y <= pad || y >= CONFIG.view.h - pad) return true;
      for (const platform of platforms) {
        if (x >= platform.x - pad && x <= platform.x + platform.w + pad
          && y >= platform.y - pad && y <= platform.y + platform.h + pad) return true;
      }
    }
    return false;
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
        this.slingAngularVelocity += angleDelta * W.angularAcceleration * dt;
        this.slingAngularVelocity *= Math.exp(-W.angularDamping * dt);
        this.slingAngularVelocity = clamp(this.slingAngularVelocity, -W.maxAngularSpeed, W.maxAngularSpeed);
        this.slingAngle += this.slingAngularVelocity * dt;
        const aimRadius = clamp(aimLength, W.minRadius, W.maxRadius);
        const priorRadius = this.slingRadius;
        this.slingRadius = Input.tetherHeld
          ? Math.max(W.minRadius, this.slingRadius - W.tightenRate * dt)
          : lerp(this.slingRadius, aimRadius, clamp(3 * dt, 0, 1));
        if (Input.tetherHeld && this.slingRadius < priorRadius && this.slingRadius > 0) {
          this.slingAngularVelocity = clamp(this.slingAngularVelocity * priorRadius / this.slingRadius,
            -W.maxAngularSpeed, W.maxAngularSpeed);
        }
        const tangentX = -Math.sin(this.slingAngle), tangentY = Math.cos(this.slingAngle);
        const desiredX = hand.x + Math.cos(this.slingAngle) * this.slingRadius;
        const desiredY = hand.y + Math.sin(this.slingAngle) * this.slingRadius;
        const resistance = this._chainMassResponse(e);
        const follow = 1 - Math.exp(-W.orbitFollow * resistance * dt);
        const targetVX = player.vx + tangentX * this.slingRadius * this.slingAngularVelocity + (desiredX - e.x) * W.orbitSpring;
        const targetVY = player.vy + tangentY * this.slingRadius * this.slingAngularVelocity + (desiredY - e.y) * W.orbitSpring;
        e.vx = lerp(e.vx, targetVX, follow);
        e.vy = lerp(e.vy, targetVY, follow);
        if (resistance < 0.6) {
          const desiredPlayerX = e.x - Math.cos(this.slingAngle) * this.slingRadius;
          const desiredPlayerY = e.y - Math.sin(this.slingAngle) * this.slingRadius;
          player.vx += clamp((desiredPlayerX - player.x) * W.anchorPull * dt, -W.anchorMaxSpeed, W.anchorMaxSpeed);
          player.vy += clamp((desiredPlayerY - player.y) * W.anchorPull * dt, -W.anchorMaxSpeed, W.anchorMaxSpeed);
        }
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
    if (this.state === "captured") {
      const target = this.hookTarget;
      this.linkT = Math.max(0, this.linkT - dt);
      if (!target || target.dead || target.dying || this.linkT <= 0 || this.looseCannonT <= 0) {
        this.hookTarget = null;
        this.state = "returning";
      } else {
        this._placeTipAt(target.x, target.y, this.handPos(player));
        this.vx = target.vx;
        this.vy = target.vy;
        this._recomputeTip(dt);
        this._pushTrail();
        return;
      }
    }
    this._updateStandardThrown(dt, player, platforms, false,
      CONFIG.weapons.riftlock.looseCannonDuration * this.channel("controlDuration"));
    if (this.looseCannonT <= 0 && this.state === "flying") this.state = "returning";
  }

  _beginReturn(player: BladePlayerPort, opts: { retrace?: boolean } = {}): BladeActionResult {
    if (this.state === "held" || this.state === "returning" || this.secondaryActive) return "busy";
    if (!(this.hostile || this.stolenBy || this._pointInRange(player, { x: this.x, y: this.y }, this.recallRange()))) return "toofar";
    this.pierced = new Set(); this.hostile = false; this.stolenBy = null;
    this.secondaryActive = true; this.retraceReturn = !!(opts.retrace); this.retraceDone = false;
    this.threadcutIndex = this.retraceReturn ? this.threadcutRoute.length - 1 : -1;
    if (this.state === "captured") this.hookTarget = null;
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
      const resistance = this._chainMassResponse(e);
      const knockbackTaken = Math.max(0.01, e.cfg?.knockbackTaken ?? W.knockbackReference);
      const knockbackResponse = clamp(Math.sqrt(knockbackTaken / W.knockbackReference), 0.35, 1.4);
      const orbitalSpeed = Math.abs(this.slingRadius * this.slingAngularVelocity) * W.releaseOrbitMult;
      const poweredSpeed = Math.max(W.slingSpeed * this.channel("secondaryPower"), orbitalSpeed);
      const releaseSpeed = clamp(poweredSpeed * resistance * knockbackResponse, 0, W.maxReleaseSpeed);
      e.vx = player.vx + e.vx * W.releaseMomentumCarry + tangentX * releaseSpeed;
      e.vy = player.vy + e.vy * W.releaseMomentumCarry + tangentY * releaseSpeed;
      if (e.isBoss) { player.vx -= tangentX * releaseSpeed * 0.18; player.vy -= tangentY * releaseSpeed * 0.12; }
      else e.stun = Math.max(e.stun, W.releaseStun * (e.weight > 2 ? 0.55 : 1));
      if ((e.isBoss || e.weight > 2) && e.applyBreak) e.applyBreak(W.heavyBreak);
      this.pierced = new Set(); this.secondaryActive = true; this.hookTarget = null; this.state = "returning";
      return "recalled";
    }
    return this._beginReturn(player);
  }

  _chainMassResponse(enemy: BladeEnemyPort): number {
    const response = 1 / Math.sqrt(Math.max(0.5, enemy.weight || 1));
    return enemy.isBoss ? Math.min(response, CONFIG.weapons.chainblade.bossTug) : clamp(response, 0.38, 1);
  }

  _beginBackblast(player: BladePlayerPort): BladeActionResult {
    const result = this._beginReturn(player);
    if (result === "recalled") {
      const hand = this.handPos(player), awayX = this.x - hand.x, awayY = this.y - hand.y;
      const distance = len(awayX, awayY) || 1;
      const attackId = this.claimAttack();
      this.weaponEvents.push(Object.freeze({
        type: "backblastRound", x: this.tipX, y: this.tipY,
        vx: awayX / distance * CONFIG.weapons.riftlock.razorSpeed,
        vy: awayY / distance * CONFIG.weapons.riftlock.razorSpeed,
        damage: CONFIG.weapons.riftlock.razorDamage * this.channel("secondaryPower"),
        attackId, throwId: this.throwId, remote: true, secondary: true,
      }));
      this.backblastActive = true;
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
    // Wheel Cut preserves the released pose and immediately begins rotating about
    // the blade's center. Snapping a long Greatsword to its travel vector makes the
    // visible weapon jump before the first flight step.
    if (this.weapon?.id !== "greatsword") this.angle = Math.atan2(dirY, dirX);
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
    this.backblastActive = false;
    this._repeatHits.clear();
    this.hostile = false; this.stolenBy = null;
    this.state = "flying";
    if (this.weapon?.onThrowLaunch) this.weapon.onThrowLaunch({ blade: this, config: CONFIG });
    return true;
  }

  // recall if within tether range; returns "recalled" | "toofar"
  tryRecall(player: BladePlayerPort): BladeActionResult {
    if (this.state === "held" || this.state === "returning" || this.secondaryActive || this.secondaryQueued) return "busy";
    if (this.weapon?.onSecondaryThrowAction) {
      return this.weapon.onSecondaryThrowAction({ blade: this, config: CONFIG, player });
    }
    return this._beginReturn(player);
  }

  get thrown() { return ["flying", "returning", "embedded", "hooked"].includes(this.state); }
  get preserveRedirectAngle() { return this.weapon?.id === "greatsword"; }

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
      return clamp(this.weapon.qualityMetric({ blade: this, config: CONFIG }), 0, 1);
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

  heldCollisionSegment(_player: BladePlayerPort): { x1: number; y1: number; x2: number; y2: number; pad: number } {
    void _player;
    if (this.weapon?.id === "chainblade") {
      const headLength = 28;
      return {
        x1: this.tipX - Math.cos(this.angle) * headLength,
        y1: this.tipY - Math.sin(this.angle) * headLength,
        x2: this.tipX, y2: this.tipY, pad: 7,
      };
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
      const previous = this.threadcutRoute.at(-1);
      if (previous?.target !== enemy) {
        this.threadcutRoute.push({ x: enemy.x, y: enemy.y, target: enemy });
      }
    }
  }

  canHitHeldEnemy(enemy: object): boolean {
    return this.weapon?.id !== "greatsword" || this._repeatHits.get(enemy) !== this.swingId;
  }

  recordHeldHit(enemy: object): void {
    if (this.weapon?.id === "greatsword") this._repeatHits.set(enemy, this.swingId);
  }

  applyHeldResistance(enemy: BladeEnemyPort): number {
    if (this.weapon?.id !== "greatsword") return 1;
    const W = CONFIG.weapons.greatsword;
    const retention = enemy.isBoss ? W.bossMomentumRetention
      : enemy.anchored || enemy.weight > 2.5 ? W.heavyMomentumRetention
      : enemy.weight > 1.25 ? W.mediumMomentumRetention
      : W.lightMomentumRetention;
    this.vx *= retention;
    this.vy *= retention;
    return retention;
  }

  chainCollisionSegments(): readonly { x1: number; y1: number; x2: number; y2: number; pad: number }[] { return chainCollisionSegments(this); }
  _updateChainNodes(dt: number, hand: { x: number; y: number }): void { updateChainNodes(this, dt, hand, CONFIG); }

  canHitThrownEnemy(enemy: BladeEnemyPort): boolean {
    if (this.weapon?.id === "hammer" && this.state === "returning" && this.pierced.size >= CONFIG.weapons.hammer.recallTargetCap) return false;
    return !this.pierced.has(enemy);
  }

  damageAt(): number {
    const B = CONFIG.blade, S = CONFIG.skill;
    if (this.state !== "held" || this.tipSpeed < B.minHitSpeed) return 0;
    let dmg = Math.min((this.tipSpeed - B.minHitSpeed) * B.damageScale, B.maxDamage);
    const quality = this.hitQuality();
    dmg *= lerp(S.pokeFloor, 1, quality);
    const commit = clamp(len(this.vx, this.vy) / S.commitRef, 0, 1);
    dmg *= lerp(S.commitFloor, 1, commit);
    if (this.weapon?.damageProfile) dmg *= this.weapon.damageProfile({ blade: this, config: CONFIG, quality, baseDamage: dmg });
    return dmg;
  }

  draw(surface: unknown, player: BladePlayerPort): void { presentation.draw(surface, this, player); }

}

  return Blade;
}

export { createBlade };

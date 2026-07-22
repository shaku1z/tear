import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";

export function createAirEnemyTypes(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor) {
  const { CONFIG, FX, GAME_RANDOM, Projectile, SFX, clamp, len, lerp } = dependencies;
  // ---- Aerial family: Flyer (angled swoop), Dive Bomber (telegraphed drop), Swooper (high dive) ----
  class Flyer extends Enemy {
    state: string; aimTimer: number; swoopT: number; warnT: number; diveX: number | null;
    declare cfg: typeof CONFIG.flyer;

    constructor(x: number, y: number) {
      super(x, y, CONFIG.flyer);
      this.color = CONFIG.colors.flyer;
      this.kind = "flyer";
      this.behavior = "swoop";
      this.state = "hover";
      this.aimTimer = this.cfg.swoopInterval * (0.5 + GAME_RANDOM.next() * 0.6);
      this.swoopT = 0;
      this.warnT = 0;
      this.diveX = null;
    }

    update(dt: number, _platforms: readonly EnemyPlatform[], player: EnemyPlayerPort) {
      this.tickTimers(dt);
      const C = this.cfg;
      if (this.behavior === "divebomb") this._divebomb(dt, player, C);
      else if (this.behavior === "highdive") this._highdive(dt, player, C);
      else this._swoop(dt, player, C);
      this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
      this.y = clamp(this.y, 40, CONFIG.world.groundY - this.hh);
      this.onGround = this.y >= CONFIG.world.groundY - this.hh - 1;
    }

    _swoop(dt: number, player: EnemyPlayerPort, C: typeof CONFIG.flyer) {
      if (this.state === "swoop") {
        this.swoopT -= dt; this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.swoopT <= 0) this.state = "recover";
      } else if (this.state === "recover") {
        // every dive ends by dropping to the ground for a brief, vulnerable stun
        this.vx = lerp(this.vx, 0, clamp(4 * dt, 0, 1));
        this.vy = lerp(this.vy, 560, clamp(5 * dt, 0, 1));
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.y >= CONFIG.world.groundY - this.hh - 2) {
          this.y = CONFIG.world.groundY - this.hh; this.stun = 0.7; this.state = "hover";
          this.aimTimer = C.swoopInterval; FX.burst(this.x, this.y + this.hh, 0, -1, 5, this.color);
        }
      } else {
        // hover to one side of the player so the dive comes in at an angle
        const tx = player.x + (this.x < player.x ? -130 : 130), ty = player.y - C.hoverY;
        const dx = tx - this.x, dy = ty - this.y, d = len(dx, dy) || 1;
        this.vx = lerp(this.vx, (dx / d) * this.speed, clamp(3 * dt, 0, 1));
        this.vy = lerp(this.vy, (dy / d) * this.speed, clamp(3 * dt, 0, 1));
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.aimTimer -= dt;
        if (this.aimTimer <= 0 && Math.abs(player.x - this.x) < 520) {
          this.state = "swoop"; this.swoopT = 0.45; this.aimTimer = C.swoopInterval;
          const m = len(player.x - this.x, player.y - this.y) || 1;
          this.vx = (player.x - this.x) / m * C.swoopSpeed;
          this.vy = (player.y - this.y) / m * C.swoopSpeed;
        }
      }
    }

    _divebomb(dt: number, player: EnemyPlayerPort, C: typeof CONFIG.flyer) {
      if (this.state === "warn") {
        this.diveX = this.diveX == null ? player.x : lerp(this.diveX, player.x, clamp(1.5 * dt, 0, 1));
        const ty = Math.max(120, player.y - 240);
        const dx = this.diveX - this.x, dy = ty - this.y, d = len(dx, dy) || 1;
        this.vx = lerp(this.vx, (dx / d) * this.speed * 1.2, clamp(4 * dt, 0, 1));
        this.vy = lerp(this.vy, (dy / d) * this.speed * 1.2, clamp(4 * dt, 0, 1));
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.warnT -= dt;
        if (this.warnT <= 0) { this.state = "dive"; this.vx = 0; this.vy = C.swoopSpeed * 1.55; }
      } else if (this.state === "dive") {
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.y >= CONFIG.world.groundY - this.hh - 2) {
          this.y = CONFIG.world.groundY - this.hh; this.stun = 0.85; this.state = "hover";
          this.aimTimer = C.swoopInterval * 1.2; this.diveX = null;
          FX.ring(this.x, this.y + this.hh, 13, CONFIG.colors.slam); FX.burst(this.x, this.y + this.hh, 0, -1, 7, this.color);
        }
      } else {
        const tx = player.x, ty = player.y - C.hoverY - 40;
        const dx = tx - this.x, dy = ty - this.y, d = len(dx, dy) || 1;
        this.vx = lerp(this.vx, (dx / d) * this.speed, clamp(3 * dt, 0, 1));
        this.vy = lerp(this.vy, (dy / d) * this.speed, clamp(3 * dt, 0, 1));
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.aimTimer -= dt;
        if (this.aimTimer <= 0) { this.state = "warn"; this.warnT = 1.1; this.diveX = player.x; }
      }
    }

    _highdive(dt: number, player: EnemyPlayerPort, C: typeof CONFIG.flyer) {
      if (this.state === "dive") {
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.y >= CONFIG.world.groundY - this.hh - 2 || this.x <= this.hw + 1 || this.x >= CONFIG.view.w - this.hw - 1) {
          this.state = "climb"; this.aimTimer = C.swoopInterval;
        }
      } else if (this.state === "climb") {
        this.vy = lerp(this.vy, -this.speed * 2.4, clamp(4 * dt, 0, 1));
        this.vx = lerp(this.vx, (player.x > this.x ? 1 : -1) * this.speed, clamp(2 * dt, 0, 1));
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.y <= 70) this.state = "hover";
      } else {
        this.y = lerp(this.y, 78, clamp(2 * dt, 0, 1));
        this.vx = lerp(this.vx, (player.x - this.x) * 0.6, clamp(2 * dt, 0, 1));
        this.x += this.vx * dt;
        this.aimTimer -= dt;
        if (this.aimTimer <= 0 && Math.abs(player.x - this.x) < 720) {
          this.state = "dive";
          const m = len(player.x - this.x, player.y - this.y) || 1;
          this.vx = (player.x - this.x) / m * C.swoopSpeed * 1.6;
          this.vy = (player.y - this.y) / m * C.swoopSpeed * 1.6;
        }
      }
    }
  }

  // ---- Hazard family: Bomber (arcing deflectable bombs), Juggler (3-bomb burst), Trapper (mines) ----
  class Bomber extends Enemy {
    lobTimer: number; mineTimer: number; bombsLeft: number; burstT: number;
    geoX = 0; wallRequest: { x: number } | null = null;
    declare cfg: typeof CONFIG.bomber;

    constructor(x: number, y: number) {
      super(x, y, CONFIG.bomber);
      this.color = CONFIG.colors.bomber;
      this.kind = "bomber";
      this.behavior = "lob";
      this.lobTimer = CONFIG.bomber.lobInterval * (0.5 + GAME_RANDOM.next() * 0.7);
      this.mineTimer = CONFIG.bomber.mineInterval * (0.6 + GAME_RANDOM.next() * 0.6);
      this.bombsLeft = 0;
      this.burstT = 0;
    }

    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      this.tickTimers(dt);
      const C = this.cfg;
      if (this.canClimb && this.atk !== "channel" && this.climbNav(player, platforms, dt)) {   // reposition up to a perched player — but never abandon a Geomancer wall-channel mid-cast (its timer would pause and the half-wall linger, then teleport-resume); matches Charger/Ranged holding position during a committed attack
        if (this.onGround) this.vx = lerp(this.vx, this.navDir * this.speed, clamp(7 * dt, 0, 1));
        this.integrate(dt, platforms);
        return;
      }
      if (this.behavior === "trap") this._trap(dt, player, projectiles, C);
      else if (this.behavior === "sludge") this._sludge(dt, player, projectiles, C);
      else if (this.behavior === "geo") this._geo(dt, player, projectiles, C);
      else this._lob(dt, player, projectiles, C);
      this.integrate(dt, platforms);
    }

    // Sludge: lobs a glob of mud that lands and leaves a slowing puddle
    _sludge(dt: number, player: EnemyPlayerPort, projectiles: EnemyProjectile[], C: typeof CONFIG.bomber) {
      this._kite(dt, player, C.standoff);
      this.lobTimer -= dt;
      if (this.lobTimer <= 0 && Math.abs(player.x - this.x) < 780) {
        const X = CONFIG.exotic, vx = clamp(player.x - this.x, -X.sludgeSpeed, X.sludgeSpeed);
        const p = new Projectile(this.x, this.y - this.hh, vx, -X.sludgeArc);
        this.ownProjectile(p); p.gravity = X.sludgeGravity; p.mud = true; p.r = X.sludgeR;
        projectiles.push(p);
        this.lobTimer = X.sludgeInterval / this.auraHaste;
      }
    }

    // Geomancer: channels, then raises a temporary wall that sections off the arena
    // (killing it during the channel stops the wall). The game spawns the wall from wallRequest.
    _geo(dt: number, player: EnemyPlayerPort, _projectiles: EnemyProjectile[], C: typeof CONFIG.bomber) {
      const X = CONFIG.exotic;
      if (this.atk === "channel") {
        this.vx = lerp(this.vx, 0, clamp(9 * dt, 0, 1)); this.atkT -= dt;
        if (this.atkT <= 0) { this.wallRequest = { x: this.geoX }; this.atk = "idle"; this.lobTimer = X.geoInterval; }
      } else {
        this._kite(dt, player, C.standoff);
        this.lobTimer -= dt;
        if (this.lobTimer <= 0 && Math.abs(player.x - this.x) < X.geoRange && this.onGround) {
          const dir = Math.sign(player.x - this.x) || 1;
          this.geoX = clamp(this.x + dir * 160, 60, CONFIG.view.w - 60);
          this.atk = "channel"; this.atkT = X.geoChannel; this.atkMax = X.geoChannel;
        }
      }
    }

    // hold a throwing distance from the player
    _kite(dt: number, player: EnemyPlayerPort, standoff: number) {
      const dx = player.x - this.x, dist = Math.abs(dx), away = (-Math.sign(dx)) || 1;
      let move = 0;
      if (dist < standoff * 0.7) move = away;
      else if (dist > standoff * 1.25) move = -away;
      this.vx = lerp(this.vx, move * this.speed, clamp(6 * dt, 0, 1));
    }

    _lobBomb(player: EnemyPlayerPort, projectiles: EnemyProjectile[], spread: number) {
      const C = this.cfg;
      const dx = player.x - this.x;
      const vx = clamp(dx * 1.05, -C.bombSpeed, C.bombSpeed) + (spread || 0);
      const p = new Projectile(this.x, this.y - this.hh, vx, -C.bombArc);
      this.ownProjectile(p); p.gravity = C.bombGravity; p.bomb = true; p.r = 12; p.dmg = C.blastDmg;
      projectiles.push(p);
    }

    _lob(dt: number, player: EnemyPlayerPort, projectiles: EnemyProjectile[], C: typeof CONFIG.bomber) {
      this._kite(dt, player, C.standoff);
      if (this.bombsLeft > 0) {                       // Juggler: rapid 3-bomb burst
        this.burstT -= dt;
        if (this.burstT <= 0) { this._lobBomb(player, projectiles, (this.bombsLeft - 2) * 60); this.bombsLeft--; this.burstT = 0.18; }
        if (this.bombsLeft === 0) this.lobTimer = C.lobInterval / this.auraHaste;
        return;
      }
      this.lobTimer -= dt;
      if (this.lobTimer <= 0 && Math.abs(player.x - this.x) < 760) {
        if (this.behavior === "juggle") { this.bombsLeft = 3; this.burstT = 0; }
        else { this._lobBomb(player, projectiles, 0); this.lobTimer = C.lobInterval / this.auraHaste; }
      }
    }

    _trap(dt: number, player: EnemyPlayerPort, projectiles: EnemyProjectile[], C: typeof CONFIG.bomber) {
      this._kite(dt, player, C.standoff * 0.65);
      this.mineTimer -= dt;
      if (this.mineTimer <= 0 && this.onGround) {
        const m = new Projectile(this.x, this.y, 0, 0);
        this.ownProjectile(m); m.mine = true; m.gravity = C.bombGravity; m.r = 11; m.armT = C.mineArm;
        projectiles.push(m);
        this.mineTimer = C.mineInterval / this.auraHaste;
      }
    }
  }

  // ---- Armored: shielded on the side it faces; needs a fast hit or a flank ----
  class Armored extends Enemy {
    guardSide: number; stompCd: number;
    declare cfg: typeof CONFIG.armored;

    constructor(x: number, y: number) { super(x, y, CONFIG.armored); this.guardSide = 1; this.color = CONFIG.colors.armored; this.kind = "armored"; this.stompCd = CONFIG.armored.stompCd * 0.6; }
    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      this.tickTimers(dt);
      this.guardSide = Math.sign(player.x - this.x) || 1;
      if (this.stompCd > 0) this.stompCd -= dt;
      const C = this.cfg;
      // enraged: chase onto platforms after a perched player
      if (this.enraged && this.canClimb && this.stun <= 0 && this.climbNav(player, platforms, dt)) {
        if (this.onGround) this.vx = lerp(this.vx, this.navDir * this.speed * 1.8, clamp(8 * dt, 0, 1));
        this.integrate(dt, platforms);
        return;
      }
      // shielded STOMP: a telegraphed ground pound sends shockwaves you must jump over
      if (!this.enraged && this.stun <= 0) {
        if (this.atk === "stompwind") {
          this.vx = lerp(this.vx, 0, clamp(10 * dt, 0, 1)); this.atkT -= dt;
          if (this.atkT <= 0) { this._stomp(projectiles, C); this.atk = "idle"; this.stompCd = C.stompCd; }
          this.integrate(dt, platforms); return;
        }
        if (this.onGround && this.stompCd <= 0 && Math.abs(player.x - this.x) < C.stompRange && Math.abs(player.y - this.y) < 130) {
          this.atk = "stompwind"; this.atkT = C.stompWindup; this.atkMax = C.stompWindup;
          this.integrate(dt, platforms); return;
        }
      }
      const sp = this.stun > 0 ? 0 : (this.enraged ? this.speed * 1.8 : this.speed);
      this.vx = lerp(this.vx, this.guardSide * sp, clamp((this.enraged ? 8 : 5) * dt, 0, 1));
      this.integrate(dt, platforms);
    }
    _stomp(projectiles: EnemyProjectile[], C: typeof CONFIG.armored) {
      const footY = this.y + this.hh;   // shock travels along whatever surface it's standing on
      for (const d of [-1, 1]) {
        const p = new Projectile(this.x + d * this.hw, footY - C.shockR, d * C.shockSpeed, 0);
        this.ownProjectile(p); p.setFamily("groundShock"); p.r = C.shockR; p.dmg = C.shockDmg; p.life = 1.6;
        projectiles.push(p);
      }
      FX.ring(this.x, footY, 14, CONFIG.colors.slam);
      FX.burst(this.x, footY, 0, -1, 9, CONFIG.colors.armored);
      SFX.slam?.();
    }
    // blocked if the hit lands on the guarded (player-facing) side below break speed.
    // Once enraged (shield broken) it no longer blocks anything.
    override blocks(hitFromX = this.x, tipSpeed = 0) {
      if (this.stun > 0 || this.enraged) return false;
      const side = Math.sign(hitFromX - this.x) || 1;
      return side === this.guardSide && tipSpeed < this.cfg.breakSpeed;
    }
    override damageTakenMult() { return this.enraged ? 1.15 : (this.onGround ? CONFIG.armored.groundDR : CONFIG.armored.airDR); }
  }

  return { Flyer, Bomber, Armored };
}

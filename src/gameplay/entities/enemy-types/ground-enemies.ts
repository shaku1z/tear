import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";

export function createGroundEnemyTypes(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor) {
  const { CONFIG, FX, GAME_RANDOM, Projectile, SFX, clamp, len, lerp } = dependencies;
  // ---- Melee family: Charger (bull-rush), Brawler (spacing + punch/feint), Stalker (reads your dash) ----
  class Charger extends Enemy {
    duelCd: number; duelReady: boolean;
    declare cfg: typeof CONFIG.enemy;

    constructor(x: number, y: number) { super(x, y, CONFIG.enemy); this.color = CONFIG.colors.charger; this.kind = "charger"; this.behavior = "bull"; this.duelCd = 0; this.duelReady = false; }

    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      this.tickTimers(dt);
      if (this.atkCd > 0) this.atkCd -= dt;
      this._animWeapon(dt);
      // a wound-up charge hits harder on contact (longer wind-up = more power)
      this.chargeMult = (this.behavior === "bull" && this.atk === "commit") ? (1 + this.chargePower) : 1;
      // Duelist parry recharge
      if (this.behavior === "duelist" && this.duelCd > 0) { this.duelCd -= dt; if (this.duelCd <= 0) this.duelReady = true; }

      // pathfind up to a perched player (never interrupt an in-progress charge)
      if (this.canClimb && this.atk !== "commit" && this.atk !== "swing" && this.climbNav(player, platforms, dt)) {
        if (this.onGround) this.vx = lerp(this.vx, this.navDir * this.speed * 1.1, clamp(7 * dt, 0, 1));
        this.atk = "idle";
        this.integrate(dt, platforms);
        return;
      }

      const E = CONFIG.enemy;
      const dx = player.x - this.x, dist = Math.abs(dx), dir = Math.sign(dx) || 1;

      if (this.behavior === "brawler" || this.behavior === "duelist") this._brawler(dt, player, dist, dir);
      else if (this.behavior === "stalker") this._stalker(dt, player, dist, dir, E);
      else if (this.behavior === "executioner") this._executioner(dt, player, dist, dir, projectiles);
      else if (this.behavior === "gravedigger") this._gravedigger(dt, player, dist, dir, projectiles);
      else this._bull(dt, player, dist, dir, E);

      const preVx = this.vx;
      this.integrate(dt, platforms);

      // a committed charge (bull / stalker) that slams a wall or the arena edge stuns
      // itself — that's the punish window the design wants.
      if (this.atk === "commit" && this.behavior !== "brawler") {
        const atEdge = this.x <= this.hw + 1 || this.x >= CONFIG.view.w - this.hw - 1;
        if ((this.vx === 0 && Math.abs(preVx) > 200) || atEdge) {
          this.stun = E.chargeStun; this.atk = "recover"; this.atkCd = E.chargeCd;
          FX.burst(this.x + this.atkDir * this.hw, this.y, this.atkDir, 0, 7, this.color);
        }
      }
    }

    _bull(dt: number, player: EnemyPlayerPort, dist: number, dir: number, E: typeof CONFIG.enemy) {
      switch (this.atk) {
        case "windup":
          this.vx = lerp(this.vx, 0, clamp(10 * dt, 0, 1));   // plant feet, telegraph
          this.atkDir = dir;                                   // can still adjust before committing
          this.atkT -= dt;
          if (this.atkT <= 0) {
            this.atk = "commit";
            this.atkT = E.chargeTime * (0.7 + this.chargePower);          // longer wind-up -> farther charge
            this.vx = this.atkDir * E.chargeSpeed * (0.9 + this.chargePower * 0.4);
          }
          break;
        case "commit":
          this.vx = this.atkDir * E.chargeSpeed * (0.9 + this.chargePower * 0.4);  // fixed line -> sidesteppable
          this.atkT -= dt;
          if (this.atkT <= 0) { this.atk = "recover"; this.atkCd = E.chargeCd / this.auraHaste; }   // Herald hastens
          break;
        case "recover":
          this.vx = lerp(this.vx, 0, clamp(6 * dt, 0, 1));
          if (this.atkCd <= 0) this.atk = "idle";
          break;
        default: // idle: stalk forward at a wary pace, then commit to a charge of varied power
          this.vx = lerp(this.vx, dir * this.speed, clamp(6 * dt, 0, 1));
          if (dist < E.chargeRange && this.atkCd <= 0 && Math.abs(player.y - this.y) < 150) {
            this.chargePower = GAME_RANDOM.next();
            this.atk = "windup"; this.atkT = E.chargeWindup * (0.6 + this.chargePower); this.atkMax = this.atkT; this.atkDir = dir;
          }
      }
    }

    _brawler(dt: number, player: EnemyPlayerPort, dist: number, dir: number) {
      const STAND = 130, LUNGE = 540;
      switch (this.atk) {
        case "windup":
          this.vx = lerp(this.vx, 0, clamp(12 * dt, 0, 1)); this.atkT -= dt;
          if (this.atkT <= 0) {
            if (this.feint) { this.atk = "recover"; this.atkCd = 0.7; this.vx = -this.atkDir * 280; } // bluff, hop back
            else { this.atk = "commit"; this.atkT = 0.2; this.vx = this.atkDir * LUNGE; }              // committed punch
          }
          break;
        case "commit":
          this.atkT -= dt;
          if (this.atkT <= 0) { this.atk = "recover"; this.atkCd = 0.9; }
          break;
        case "recover":
          this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1));
          if (this.atkCd <= 0) this.atk = "idle";
          break;
        default: { // hold spacing, then telegraph a punch (sometimes a feint)
          let move = 0;
          if (dist > STAND + 30) move = dir; else if (dist < STAND - 40) move = -dir;
          this.vx = lerp(this.vx, move * this.speed * 1.1, clamp(6 * dt, 0, 1));
          if (dist < STAND + 60 && this.atkCd <= 0 && Math.abs(player.y - this.y) < 110) {
            this.atk = "windup"; this.atkT = 0.4; this.atkDir = dir; this.feint = GAME_RANDOM.next() < 0.3;
          }
        }
      }
    }

    _stalker(dt: number, player: EnemyPlayerPort, dist: number, dir: number, E: typeof CONFIG.enemy) {
      if (this.evadeCd > 0) this.evadeCd -= dt;
      // read the dash: if the player dashes toward us up close, sidestep through it
      if (player.dashTimer > 0 && Math.sign(player.dashX) === dir && dist < 240 && this.evadeCd <= 0 && this.onGround) {
        this.vx = -dir * 740; this.vy = -560; this.evadeCd = 1.4; this.atk = "recover"; this.atkCd = 0.4;
        FX.burst(this.x, this.y, -dir, -1, 5, this.color);
        return;
      }
      const FAST = E.chargeSpeed * 0.95;
      switch (this.atk) {
        case "windup":
          this.vx = lerp(this.vx, 0, clamp(11 * dt, 0, 1)); this.atkDir = dir; this.atkT -= dt;
          if (this.atkT <= 0) { this.atk = "commit"; this.atkT = 0.4; this.vx = this.atkDir * FAST; }
          break;
        case "commit":
          this.vx = this.atkDir * FAST; this.atkT -= dt;
          if (this.atkT <= 0) { this.atk = "recover"; this.atkCd = 0.85; }
          break;
        case "recover":
          this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1));
          if (this.atkCd <= 0) this.atk = "idle";
          break;
        default:
          this.vx = lerp(this.vx, dir * this.speed, clamp(8 * dt, 0, 1));
          if (dist < 300 && this.atkCd <= 0) { this.atk = "windup"; this.atkT = 0.28; this.atkDir = dir; }
      }
    }

    // Executioner: a long overhead wind-up (huge punish window) then heavy shockwaves both ways
    _executioner(dt: number, player: EnemyPlayerPort, dist: number, dir: number, projectiles: EnemyProjectile[]) {
      const X = CONFIG.exotic;
      if (this.atk === "windup") {
        this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1)); this.atkDir = dir; this.atkT -= dt;
        if (this.atkT <= 0) {
          const footY = this.y + this.hh;
          for (const d of [-1, 1]) { const p = this.ownProjectile(new Projectile(this.x + d * this.hw, footY - X.exShockR, d * X.exShockSpeed, 0)); p.setFamily("groundShock"); p.r = X.exShockR; p.dmg = X.exShockDmg; p.life = 1.6; projectiles.push(p); }
          FX.ring(this.x, footY, 18, CONFIG.colors.slam); FX.burst(this.x, footY, 0, -1, 11, CONFIG.colors.charger);
          SFX.slam?.();
          this.atk = "recover"; this.atkCd = 1.5;
        }
      } else if (this.atk === "recover") {
        this.vx = lerp(this.vx, 0, clamp(6 * dt, 0, 1)); if (this.atkCd <= 0) this.atk = "idle";
      } else {
        this.vx = lerp(this.vx, dir * this.speed, clamp(5 * dt, 0, 1));
        if (dist < 360 && this.atkCd <= 0 && Math.abs(player.y - this.y) < 130) { this.atk = "windup"; this.atkT = X.exWindup; this.atkMax = X.exWindup; this.atkDir = dir; }
      }
    }

    // Gravedigger: a wide swing whose shock starts out at mid-range — so getting INSIDE (point-
    // blank) is the safe play, and staying at mid-range is where it hits
    _gravedigger(dt: number, player: EnemyPlayerPort, dist: number, dir: number, projectiles: EnemyProjectile[]) {
      const X = CONFIG.exotic;
      if (this.atk === "windup") {
        this.vx = lerp(this.vx, 0, clamp(7 * dt, 0, 1)); this.atkDir = dir; this.atkT -= dt;
        if (this.atkT <= 0) {
          const footY = this.y + this.hh, sx = this.x + this.atkDir * X.gravReach;
          const p = new Projectile(sx, footY - X.gravShockR, this.atkDir * X.gravShockSpeed, 0);
          this.ownProjectile(p); p.setFamily("groundShock"); p.r = X.gravShockR; p.dmg = X.gravDmg; p.life = 1.3; projectiles.push(p);
          FX.burst(sx, footY, 0, -1, 9, CONFIG.colors.charger);
          this.atk = "swing"; this.atkT = 0.25;
        }
      } else if (this.atk === "swing") {
        this.atkT -= dt; if (this.atkT <= 0) { this.atk = "recover"; this.atkCd = 1.5; }
      } else if (this.atk === "recover") {
        this.vx = lerp(this.vx, 0, clamp(5 * dt, 0, 1)); if (this.atkCd <= 0) this.atk = "idle";
      } else {
        this.vx = lerp(this.vx, dir * this.speed, clamp(4 * dt, 0, 1));
        if (dist < 330 && dist > 80 && this.atkCd <= 0 && Math.abs(player.y - this.y) < 120) { this.atk = "windup"; this.atkT = X.gravWindup; this.atkMax = X.gravWindup; this.atkDir = dir; }
      }
    }

    // swing the held weapon toward a target angle per attack state (cock back -> slam through)
    _animWeapon(dt: number) {
      let wt = -0.5, k = 9;                                // idle: held at the ready
      if (this.atk === "windup") { wt = -1.55; k = 11; }   // cock it back
      else if (this.atk === "commit" || this.atk === "strike" || this.atk === "swing") { wt = 0.78; k = 26; }  // slam through
      this.weaponPrevA = this.weaponA;
      this.weaponA = lerp(this.weaponA, wt, clamp(k * dt, 0, 1));
    }
  }

  // ---- Ranged: kites, telegraphs, fires ----
  class Ranged extends Enemy {
    state: string; aimTimer: number; windT: number; windMax = 0;
    declare cfg: typeof CONFIG.ranged;

    constructor(x: number, y: number) {
      super(x, y, CONFIG.ranged);
      this.color = CONFIG.colors.ranged;
      this.kind = "ranged";
      this.state = "kite";
      this.aimTimer = this.cfg.aimInterval * (0.4 + GAME_RANDOM.next() * 0.6);
      this.windT = 0;
    }
    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      this.tickTimers(dt);
      // reposition up to a perched player (hold fire while climbing)
      if (this.canClimb && this.state !== "windup" && this.climbNav(player, platforms, dt)) {
        if (this.onGround) this.vx = lerp(this.vx, this.navDir * this.speed, clamp(6 * dt, 0, 1));
        this.integrate(dt, platforms);
        return;
      }
      const C = this.cfg, b = this.behavior;
      const dx = player.x - this.x, dist = Math.abs(dx), away = (-Math.sign(dx)) || 1;

      if (this.state !== "windup") {
        // movement: Sentinel holds its ground; others kite to a preferred range
        if (b === "sentinel") {
          this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1));
        } else {
          let move = 0;
          if (dist < C.tooClose) move = away;
          else if (dist > C.preferredDist * 1.3) move = -away;
          this.vx = lerp(this.vx, move * this.speed, clamp(6 * dt, 0, 1));
        }
        this.aimTimer -= dt;
        if (this.aimTimer <= 0) {
          this.state = "windup";
          const base = b === "sentinel" ? C.windup * 1.5 : (b === "marksman" ? CONFIG.chargedShot.windup : C.windup);
          this.windT = base * this.fireRateMult / this.auraHaste; this.windMax = this.windT;   // Herald hastens
        }
      } else {
        // aiming: Rifleman keeps strafing (so it leads you); others plant to fire
        if (b === "rifleman") this.vx = lerp(this.vx, away * this.speed * 0.5, clamp(5 * dt, 0, 1));
        else this.vx = lerp(this.vx, 0, clamp(12 * dt, 0, 1));
        this.windT -= dt;
        if (this.windT <= 0) {
          this._fire(player, projectiles, C);
          this.state = "kite";
          this.aimTimer = C.aimInterval * this.fireRateMult * (b === "sentinel" ? 1.15 : 1) / this.auraHaste;
        }
      }
      this.integrate(dt, platforms);
    }

    _fire(player: EnemyPlayerPort, projectiles: EnemyProjectile[], C: typeof CONFIG.ranged) {
      const b = this.behavior;
      const dmg = CONFIG.proj.dmg * this.auraDmg;   // War Priest empowers shots
      if (this.volley > 1) {                       // Volley affix: wide spread
        const base = Math.atan2(player.y - this.y, player.x - this.x);
        for (let i = 0; i < this.volley; i++) {
          const a = base + (i - (this.volley - 1) / 2) * 0.22;
          const p = new Projectile(this.x, this.y, Math.cos(a) * C.projSpeed, Math.sin(a) * C.projSpeed);
          this.ownProjectile(p); p.dmg = dmg; p.tint = this.color; projectiles.push(p);
        }
        return;
      }
      if (b === "marksman") {                       // a long charge -> the fastest bolt in the game
        const CS = CONFIG.chargedShot;
        const dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
        const p = new Projectile(this.x, this.y, (dx / m) * CS.speed, (dy / m) * CS.speed);
        this.ownProjectile(p); p.r = CS.r; p.dmg = CS.dmg * this.auraDmg; p.charged = true; p.tint = this.color;
        projectiles.push(p);
        return;
      }
      if (b === "warlock") {                        // slow shot that curves once toward you
        const X = CONFIG.exotic, dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
        const p = new Projectile(this.x, this.y, (dx / m) * X.warlockSpeed, (dy / m) * X.warlockSpeed);
        this.ownProjectile(p); p.dmg = X.warlockDmg * this.auraDmg; p.curve = true; p.curveT = X.warlockCurveAt; p.r = 11; p.tint = this.color; p.kind = "orb";
        projectiles.push(p); return;
      }
      if (b === "chain") {                          // a shot that roots you in place on hit
        const X = CONFIG.exotic, dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
        const p = new Projectile(this.x, this.y, (dx / m) * X.chainSpeed, (dy / m) * X.chainSpeed);
        this.ownProjectile(p); p.dmg = X.chainDmg * this.auraDmg; p.root = X.chainRoot; p.r = X.chainR; p.tint = this.color;
        projectiles.push(p); return;
      }
      if (b === "sentinel") { this.fireAt(player, projectiles, C.projSpeed * 1.15); return; }  // single precise shot
      // Rifleman leads your movement; default Ranged just double-taps where you are
      const lead = b === "rifleman" ? 0.2 : 0;
      const sp = C.projSpeed * (b === "rifleman" ? 1.1 : 1);
      for (let i = 0; i < 2; i++) {
        const tx = player.x + player.vx * lead, ty = player.y + player.vy * lead * 0.5;
        const dx = tx - this.x, dy = ty - this.y;
        const a = Math.atan2(dy, dx) + (i - 0.5) * (b === "rifleman" ? 0.0 : 0.07);
        const p = new Projectile(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp);
        this.ownProjectile(p); p.dmg = dmg; p.tint = this.color; projectiles.push(p);
      }
    }
  }

  return { Charger, Ranged };
}

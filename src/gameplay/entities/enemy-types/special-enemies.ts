import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor, EnemyBaseInstance } from "./enemy-base";

export function createSpecialEnemyTypes(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor) {
  const { CONFIG, FX, GAME_RANDOM, Projectile, clamp, len, lerp } = dependencies;
  // ---- Boss: large, multi-phase ----
  class Boss extends Enemy {
    fireTimer: number;
    declare cfg: typeof CONFIG.boss;

    constructor(x: number, y: number) {
      super(x, y, CONFIG.boss);
      this.color = CONFIG.colors.boss;
      this.kind = "boss";
      this.isBoss = true;
      this.fireTimer = 2;
    }
    get phase() { const f = this.hp / this.maxHp; return f > 0.66 ? 1 : (f > 0.33 ? 2 : 3); }
    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      this.tickTimers(dt);
      const C = this.cfg, ph = this.phase;
      const dir = Math.sign(player.x - this.x) || 1;
      this.vx = lerp(this.vx, dir * C.speed * (1 + (ph - 1) * 0.4), clamp(4 * dt, 0, 1));
      this.integrate(dt, platforms);
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = C.fireBase / ph;
        const shots = ph === 1 ? 1 : (ph === 2 ? 3 : 5);
        const base = Math.atan2(player.y - this.y, player.x - this.x);
        for (let i = 0; i < shots; i++) {
          const a = base + (i - (shots - 1) / 2) * 0.24;
          projectiles.push(this.ownProjectile(new Projectile(this.x, this.y, Math.cos(a) * CONFIG.proj.speed, Math.sin(a) * CONFIG.proj.speed)));
        }
      }
    }
  }

  // ---- Support family: no real attack, they make every OTHER enemy worse (priority kills) ----
  // War Priest (damage-reduction aura), Herald (speed buff), Mender (heals allies), Anchor
  // (shields a tethered ally). The actual buff/heal/tether is applied by updateSupports() in
  // game.js (it has the enemy list); these classes handle movement + drawing the effect.
  class Support extends Enemy {
    supportType: string; range: number; links: EnemyBaseInstance[]; auraPulse: number;
    declare cfg: typeof CONFIG.support;

    constructor(x: number, y: number, type: "priest" | "herald" | "mender" | "anchor") {
      super(x, y, CONFIG.support);
      this.kind = "support";
      this.supportType = type;
      this.range = CONFIG.support.range;
      this.color = CONFIG.colors[type] || CONFIG.colors.priest;
      if (type === "anchor") { this.hp *= 0.55; this.maxHp *= 0.55; this.hpDisplay = this.hp; }  // fragile
      this.links = [];          // allies this support is currently affecting (set by updateSupports)
      this.auraPulse = GAME_RANDOM.next() * 6;
    }
    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort) {
      this.tickTimers(dt);
      this.auraPulse += dt;
      // hang back from the player at a protected distance
      const dx = player.x - this.x, dist = Math.abs(dx), away = (-Math.sign(dx)) || 1;
      const KEEP = CONFIG.support.keepAway;
      let move = 0;
      if (dist < KEEP) move = away;
      else if (dist > KEEP * 1.7) move = -away;
      this.vx = lerp(this.vx, move * this.speed, clamp(5 * dt, 0, 1));
      this.integrate(dt, platforms);
    }
  }

  // ---- Wraith (special): immune to direct blade hits; only a thrown blade or a deflected
  //      shot kills it. Forces you to orchestrate the arena instead of just swinging. ----
  class Wraith extends Enemy {
    phase: number;
    declare cfg: typeof CONFIG.wraith;

    constructor(x: number, y: number) {
      super(x, y, CONFIG.wraith);
      this.kind = "wraith";
      this.color = CONFIG.colors.wraith;
      this.immuneToBlade = true;
      this.phase = GAME_RANDOM.next() * 6;
    }
    update(dt: number, _platforms: readonly EnemyPlatform[], player: EnemyPlayerPort) {
      this.tickTimers(dt);
      this.phase += dt;
      const tx = player.x, ty = player.y - CONFIG.wraith.hoverY;
      const dx = tx - this.x, dy = ty - this.y, d = len(dx, dy) || 1;
      this.vx = lerp(this.vx, (dx / d) * this.speed, clamp(2.4 * dt, 0, 1));
      this.vy = lerp(this.vy, (dy / d) * this.speed, clamp(2.4 * dt, 0, 1));
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
      this.y = clamp(this.y, 50, CONFIG.world.groundY - this.hh);
      this.onGround = false;
    }
  }

  // ---- Chimera (special): adopts the attacks of the enemy types in its wave (often several)
  //      and cycles through them. The wind-up colors it to the move that's coming. ----
  class Chimera extends Enemy {
    copyT: number; moves: string[]; curMove: string;
    declare cfg: typeof CONFIG.chimera;

    constructor(x: number, y: number) {
      super(x, y, CONFIG.chimera);
      this.kind = "chimera";
      this.color = CONFIG.colors.chimera;
      this.atk = "idle"; this.atkT = 0;
      this.copyT = 1.4 + GAME_RANDOM.next();
      this.moves = ["charger"];   // overwritten at spawn from the wave roster
      this.curMove = "charger";
    }
    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      this.tickTimers(dt);
      const C = this.cfg, dir = Math.sign(player.x - this.x) || 1, dist = Math.abs(player.x - this.x), away = -dir;
      if (this.atk === "windup") {
        this.vx = lerp(this.vx, 0, clamp(10 * dt, 0, 1)); this.atkT -= dt;
        if (this.atkT <= 0) this._exec(player, projectiles, dir);
      } else if (this.atk === "strike") {
        this.atkT -= dt; if (this.atkT <= 0) { this.atk = "recover"; this.copyT = 1.3; }
      } else if (this.atk === "recover") {
        // recover drains copyT to ~0; RESET it on the handoff to idle, or the idle block below
        // sees copyT<=0 on the very next frame and re-attacks instantly — skipping the intended
        // wander/reposition beat (without this the Chimera just plants and attacks ~every 1.85s).
        this.vx = lerp(this.vx, 0, clamp(7 * dt, 0, 1)); this.copyT -= dt; if (this.copyT <= 0) { this.atk = "idle"; this.copyT = 0.9 + GAME_RANDOM.next() * 0.6; }   // idle reposition window (tunable)
      } else {
        let move = 0;
        if (dist > 380) move = dir; else if (dist < 210) move = away;
        this.vx = lerp(this.vx, move * this.speed, clamp(6 * dt, 0, 1));
        this.copyT -= dt;
        if (this.copyT <= 0 && dist < 660) {
          this.atk = "windup"; this.atkT = C.copyDelay;
          this.curMove = this.moves[Math.floor(GAME_RANDOM.next() * this.moves.length)] ?? "charger";
        }
      }
      this.integrate(dt, platforms);
    }
    _exec(player: EnemyPlayerPort, projectiles: EnemyProjectile[], dir: number) {
      const k = this.curMove;
      if (k === "ranged") {
        const dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1, sp = CONFIG.ranged.projSpeed;
        const p = this.ownProjectile(new Projectile(this.x, this.y, (dx / m) * sp, (dy / m) * sp)); p.dmg = CONFIG.proj.dmg * this.auraDmg;
        projectiles.push(p); this.atk = "recover"; this.copyT = 1.3;
      } else if (k === "bomber") {
        const B = CONFIG.bomber, vx = clamp((player.x - this.x) * 1.05, -B.bombSpeed, B.bombSpeed);
        const p = new Projectile(this.x, this.y - this.hh, vx, -B.bombArc);
        this.ownProjectile(p); p.gravity = B.bombGravity; p.bomb = true; p.r = 12; p.dmg = B.blastDmg;
        projectiles.push(p); this.atk = "recover"; this.copyT = 1.3;
      } else if (k === "armored") {
        const A = CONFIG.armored, footY = this.y + this.hh;
        for (const d of [-1, 1]) { const p = this.ownProjectile(new Projectile(this.x + d * this.hw, footY - A.shockR, d * A.shockSpeed, 0)); p.setFamily("groundShock"); p.r = A.shockR; p.dmg = A.shockDmg; p.life = 1.5; projectiles.push(p); }
        FX.ring(this.x, footY, 12, CONFIG.colors.slam); this.atk = "recover"; this.copyT = 1.4;
      } else if (k === "flyer") {
        this.atk = "strike"; this.atkT = 0.4; this.vx = dir * 600; this.vy = -540;   // leap-dive
      } else {  // charger / brawler / stalker -> a committed lunge
        this.atk = "strike"; this.atkT = 0.32; this.vx = dir * 740;
      }
    }
  }

  return { Boss, Support, Wraith, Chimera };
}

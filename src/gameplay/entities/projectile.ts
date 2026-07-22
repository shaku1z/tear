// ------- projectiles (enemy fire, deflectable) -------
import type { CONFIG as GAME_CONFIG } from "../../config/game-config";

type GameConfig = typeof GAME_CONFIG;

export interface ProjectileOwnerPort {
  x: number;
  y: number;
  dead?: boolean;
  dying?: boolean;
  onShieldEmbedded?(projectile: ProjectileEntity): void;
  onProjectileGroundImpact?(projectile: ProjectileEntity): void;
}

export interface ProjectileDependencies {
  CLOCK: { sim: number };
  CONFIG: GameConfig;
  FX: {
    burst(x: number, y: number, dx: number, dy: number, count: number, color: string): void;
    ring(x: number, y: number, radius: number, color?: string): void;
  };
  presentation: ProjectilePresentationPort;
  SFX: {
    sweeperBat?(perfect: boolean, style?: string): void;
    sweeperBounce?(style?: string, embedded?: boolean): void;
    sweeperClang?(style?: string, shattered?: boolean): void;
    wardenMortarWhistle?(falling: boolean): void;
  };
  clamp: (value: number, min: number, max: number) => number;
  len: (x: number, y: number) => number;
  lerp: (from: number, to: number, amount: number) => number;
}

export interface ProjectileRenderSnapshot {
  readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly r: number;
  readonly deflected: boolean; readonly perfect: boolean; readonly charged: boolean;
  readonly bomb: boolean; readonly mine: boolean; readonly armed: boolean; readonly shock: boolean;
  readonly root: number; readonly mud: boolean; readonly tint: string | null; readonly kind: string;
  readonly histCount: number; readonly sweeper: boolean; readonly crownfire: boolean;
  readonly integrity: number; readonly maxIntegrity: number; readonly sweeperState: string | null;
  readonly spinDir: number; readonly embedded: boolean; readonly sweeperStyle?: string;
  readonly crescent?: boolean; readonly quake?: boolean; readonly sourceStolen: unknown;
  trailPoint(index: number): Readonly<{ x: number; y: number }> | undefined;
}

export interface ProjectilePresentationPort {
  draw(surface: unknown, projectile: ProjectileRenderSnapshot): void;
}

export interface SweeperOptions {
  passes?: number;
  integrity?: number;
  maxLife?: number;
  embeddedLife?: number;
}

export const PROJECTILE_FAMILIES = Object.freeze([
  Object.freeze({ id: "ordinaryProjectile", counterplay: "deflect", unparryable: false }),
  Object.freeze({ id: "groundShock", counterplay: "jump", unparryable: true }),
  Object.freeze({ id: "sweeper", counterplay: "bat/return", unparryable: false }),
] as const);

export type ProjectileFamilyId = typeof PROJECTILE_FAMILIES[number]["id"];

export interface ProjectileEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dead: boolean;
}

function createProjectile(dependencies: ProjectileDependencies) {
  const { CONFIG, FX, SFX, presentation, clamp, len, lerp } = dependencies;

class Projectile {
  x: number; y: number; vx: number; vy: number; r: number;
  dead: boolean; deflected: boolean; perfect: boolean; deflectDmg: number;
  pierce: boolean; pierced: Set<unknown> | null; bounces: number; life: number;
  dmg: number | null; charged: boolean; gravity: number; bomb: boolean; mine: boolean;
  armed: boolean; armT: number; shock: boolean; curve: boolean; curveT: number; curved: boolean;
  root: number; mud: boolean; tint: string | null; kind: string;
  hist: ({ x: number; y: number } | undefined)[]; histHead: number; histCount: number;
  family: string; counterplay: string; unparryable: boolean; sweeper: boolean; crownfire: boolean;
  owner: ProjectileOwnerPort | null; sourceEnemy: ProjectileOwnerPort | null;
  landingX: number | null; landingY: number | null; landingT: number | null;
  surfacePlatformId: string | null; surfaceLeft: number | null; surfaceRight: number | null; surfaceY: number | null;
  maxCrossings: number; crossings: number; sweeperState: string | null; state: string | null;
  passesRemaining: number; integrity: number; maxIntegrity: number; maxLife: number;
  hitLatch: boolean; hitLatchT: number; onCountered: ((projectile: Projectile) => void) | null; spinDir: number;
  embeddedLife: number; groundImpact: boolean; whistleStage: number; sourceStolen: unknown;
  embedded: boolean; harmless: boolean; _embedNotified: boolean; _groundImpactDone: boolean;
  sweeperStyle?: string; bossAttack?: string; crescent?: boolean; quake?: boolean; shatterReason?: string;

  constructor(x: number, y: number, vx: number, vy: number) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.r = CONFIG.proj.r;
    this.dead = false;
    this.deflected = false;   // once deflected, it hurts enemies instead of the player
    this.perfect = false;     // perfect parry: homed + bonus damage
    this.deflectDmg = 28;     // damage dealt to enemies after a deflect
    this.pierce = false;      // ability: passes through enemies
    this.pierced = null;      // set of enemies already hit (when piercing)
    this.bounces = 0;         // ability: ricochets off walls this many times
    this.life = 6;            // seconds before it expires
    this.dmg = null;          // override damage to the player (null = CONFIG.proj.dmg)
    this.charged = false;     // Marksman's heavy shot: big, slow, very parryable
    this.gravity = 0;         // arcing projectiles (bombs) fall under gravity
    this.bomb = false;        // explodes (AoE) on impact instead of a direct hit
    this.mine = false;        // settles on the floor, arms, then detonates on proximity
    this.armed = false;
    this.armT = 0;
    this.shock = false;       // armored stomp ground wave (jump it; non-parryable)
    this.curve = false;       // Warlock: redirects once toward the player mid-flight
    this.curveT = 0;          // ...countdown to that adjustment
    this.curved = false;
    this.root = 0;            // Chain: roots the player for this many seconds on hit
    this.mud = false;         // Sludge: lands and leaves a slowing puddle
    this.tint = null;         // shot colour, set by the firing enemy (else default enemyShot)
    this.kind = "dart";       // visual shape: "dart" (oriented bolt) | "orb" (caster)
    this.hist = new Array<{ x: number; y: number } | undefined>(7); this.histHead = 0; this.histCount = 0;   // allocation-free fixed trail ring
    // Capability metadata. Legacy booleans remain as render/physics shims until
    // their dedicated phases migrate them, while collision code can reason about
    // an explicit family and counter contract now.
    this.family = "ordinaryProjectile";
    this.counterplay = "deflect";
    this.unparryable = false;
    this.sweeper = false;
    this.crownfire = false;   // Aldric's royal fire: white core + broad gold shock language
    // Optional boss-pattern metadata. Neutral defaults preserve every legacy projectile.
    this.owner = null;
    this.sourceEnemy = null;   // immutable attack source used by Sever after reflection
    this.landingX = null; this.landingY = null; this.landingT = null;
    this.surfacePlatformId = null; this.surfaceLeft = null; this.surfaceRight = null; this.surfaceY = null;
    this.maxCrossings = 0; this.crossings = 0;
    this.sweeperState = null; this.state = null;
    this.passesRemaining = 0; this.integrity = 0; this.maxIntegrity = 0; this.maxLife = 0;
    this.hitLatch = false; this.hitLatchT = 0; this.onCountered = null; this.spinDir = 1;
    this.embeddedLife = 0;
    this.groundImpact = false;
    this.whistleStage = -1; this.sourceStolen = null;
    this.embedded = false;    // inert sweeper lodged in an arena wall
    this.harmless = false;    // collision consumers can ignore an embedded prop
    this._embedNotified = false;
    this._groundImpactDone = false;
  }

  setFamily(family?: string): this {
    this.family = family ?? "ordinaryProjectile";
    if (this.family === "groundShock") {
      this.shock = true; this.sweeper = false;
      this.counterplay = "jump"; this.unparryable = true;
    } else if (this.family === "sweeper") {
      this.shock = false; this.sweeper = true;
      this.counterplay = "bat/return"; this.unparryable = false;
      // Safe defaults are intentionally finite: a missing creator field can never
      // resurrect the old 60-second infinite bounce.
      this.configureSweeper({ passes: 2, integrity: 4, maxLife: 5, embeddedLife: 0.8 });
    } else {
      this.shock = false; this.sweeper = false;
      this.counterplay = "deflect"; this.unparryable = false;
    }
    return this;
  }

  _setSweeperState(state: string): void {
    this.sweeperState = state; this.state = state;
    this.embedded = state === "embedded";
    this.harmless = state !== "hostile";
    this.spinDir = state === "returned" ? -1 : (state === "batted" ? -0.65 : 1);
  }

  clearTrail(): void { this.histHead = 0; this.histCount = 0; }
  pushTrail(x: number, y: number): void {
    const p = this.hist[this.histHead];
    if (p) { p.x = x; p.y = y; } else this.hist[this.histHead] = { x, y };
    this.histHead = (this.histHead + 1) % this.hist.length;
    this.histCount = Math.min(this.hist.length, this.histCount + 1);
  }
  trailPoint(i: number): { x: number; y: number } | undefined { return this.hist[(this.histHead - this.histCount + i + this.hist.length) % this.hist.length]; }

  configureSweeper(opts: SweeperOptions = {}): this {
    this.maxLife = Math.max(0.1, opts.maxLife ?? 5);
    this.life = this.maxLife;
    this.passesRemaining = Math.max(1, opts.passes == null ? 2 : opts.passes | 0);
    this.maxCrossings = this.passesRemaining; this.crossings = 0;
    this.integrity = Math.max(1, opts.integrity == null ? this.passesRemaining + 2 : opts.integrity | 0);
    this.maxIntegrity = this.integrity;
    this.embeddedLife = Math.max(0.1, opts.embeddedLife ?? 0.8);
    this.hitLatch = false; this.hitLatchT = 0; this.deflected = false; this.perfect = false;
    this.bounces = 0; this._embedNotified = false; this._setSweeperState("hostile");
    return this;
  }

  sweeperClang(): boolean {
    if (!this.sweeper || this.sweeperState !== "hostile" || this.hitLatch) return false;
    this.hitLatch = true; this.hitLatchT = 0.12; this.vx *= 0.62; this.vy *= 0.62;
    if (SFX.sweeperClang) SFX.sweeperClang(this.sweeperStyle, false);
    return true;
  }

  counterSweeper(kind: string, dirX: number, dirY: number, speed: number): boolean {
    if (!this.sweeper || this.sweeperState !== "hostile" || this.hitLatch) return false;
    const perfect = kind === "perfect", thrown = kind === "thrown";
    this.hitLatch = true; this.hitLatchT = 0.14;
    // A perfect return preserves the counter-object long enough to reach its
    // owner. Batting/Phase Step shear one tooth; a thrown blade shears two.
    this.integrity = Math.max(0, this.integrity - (perfect ? 0 : (thrown ? 2 : 1)));
    if (this.integrity <= 0) { this.shatterSweeper("counter"); return true; }
    let dx = dirX || 0, dy = dirY || 0;
    if (perfect && this.owner && !this.owner.dead && !this.owner.dying) { dx = this.owner.x - this.x; dy = this.owner.y - this.y; }
    const m = len(dx, dy) || 1, base = Math.max(len(this.vx, this.vy), speed || 0, CONFIG.proj.speed);
    const mult = perfect ? 1.18 : (thrown ? 0.92 : 1.02);
    this.vx = dx / m * base * mult; this.vy = dy / m * base * mult;
    this.deflected = true; this.perfect = perfect;
    this.counterplay = perfect ? "owner return" : (thrown ? "blade redirect" : kind === "phaseStep" ? "phase reflect" : "batted");
    this._setSweeperState(perfect ? "returned" : "batted");
    this.clearTrail();
    if (SFX.sweeperBat) SFX.sweeperBat(perfect, this.sweeperStyle);
    return true;
  }

  _embedSweeper(): void {
    this.vx = 0; this.vy = 0; this.passesRemaining = 0; this.crossings = this.maxCrossings;
    this._setSweeperState("embedded"); this.clearTrail();
    if (SFX.sweeperBounce) SFX.sweeperBounce(this.sweeperStyle, true);
    if (!this._embedNotified) {
      this._embedNotified = true;
      if (this.owner && typeof this.owner.onShieldEmbedded === "function") this.owner.onShieldEmbedded(this);
    }
  }

  shatterSweeper(reason?: string): void {
    if (this.dead) return;
    this.dead = true; this.harmless = true; this.hitLatch = true;
    if (typeof FX !== "undefined") { FX.ring(this.x, this.y, 8, this.sweeperStyle === "shard" ? "#6ef2ff" : "#ff8a32"); FX.burst(this.x, this.y, 0, -1, 9, this.sweeperStyle === "shard" ? "#d65cff" : "#ff8a32"); }
    if (SFX.sweeperClang) SFX.sweeperClang(this.sweeperStyle, true);
    this.shatterReason = reason ?? "";
  }

  update(dt: number): void {
    if (this.sweeper) {
      if (this.owner && (this.owner.dead || this.owner.dying)) { this.dead = true; this.harmless = true; return; }
      if (this.hitLatchT > 0) { this.hitLatchT = Math.max(0, this.hitLatchT - dt); if (this.hitLatchT <= 0) this.hitLatch = false; }
      if (this.sweeperState === "returned" && this.owner && !this.owner.dead && !this.owner.dying) {
        const dx = this.owner.x - this.x, dy = this.owner.y - this.y, m = len(dx, dy) || 1, sp = Math.max(CONFIG.proj.speed, len(this.vx, this.vy));
        const steer = clamp(3.5 * dt, 0, 1); this.vx = lerp(this.vx, dx / m * sp, steer); this.vy = lerp(this.vy, dy / m * sp, steer);
      }
    }
    if (this.embedded) {
      this.vx = 0; this.vy = 0;
      this.embeddedLife -= dt; this.life -= dt;
      if (this.embeddedLife <= 0 || this.life <= 0) this.dead = true;
      return;
    }

    if (this.landingT != null) this.landingT = Math.max(0, this.landingT - dt);
    if (this.gravity) this.vy += this.gravity * dt;   // bombs arc; mines fall to the floor
    if (this.bossAttack === "mortar") {
      if (this.whistleStage === 0) { this.whistleStage = 1; if (SFX.wardenMortarWhistle) SFX.wardenMortarWhistle(false); }
      else if (this.whistleStage === 1 && this.vy > 120) { this.whistleStage = 2; if (SFX.wardenMortarWhistle) SFX.wardenMortarWhistle(true); }
    }
    this.pushTrail(this.x, this.y);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; if (this.sweeper) this.harmless = true; return; }

    // A copied ground shock belongs to the surface that authored it. On the
    // two-storey Void route it cannot float across a gap or threaten the other
    // lane after its supporting platform ends.
    if (this.family === "groundShock" && this.surfacePlatformId) {
      this.y = (this.surfaceY ?? 0) - this.r;
      if (this.x + this.r < (this.surfaceLeft ?? 0) || this.x - this.r > (this.surfaceRight ?? 0)) this.dead = true;
      if (this.dead) return;
    }

    // Optional falling-hazard impact. Bombs/mines keep their legacy game-owned handling
    // unless their creator explicitly opts into groundImpact.
    if (this.gravity && this.groundImpact && !this._groundImpactDone && this.vy > 0 &&
        this.y + this.r >= (this.landingY ?? CONFIG.world.groundY)) {
      this.y = (this.landingY ?? CONFIG.world.groundY) - this.r;
      this.vx = 0; this.vy = 0; this.landingT = 0;
      this._groundImpactDone = true;
      if (this.owner && typeof this.owner.onProjectileGroundImpact === "function") this.owner.onProjectileGroundImpact(this);
      this.dead = true;
      return;
    }

    if (this.bounces > 0 || this.sweeper) {
      // ricochet off the play-area edges
      const r = this.r, W = CONFIG.view.w, top = 0, bottom = CONFIG.world.groundY;
      let hit = false;
      if (this.x < r) { this.x = r; this.vx = Math.abs(this.vx); hit = true; }
      else if (this.x > W - r) { this.x = W - r; this.vx = -Math.abs(this.vx); hit = true; }
      if (this.y < top + r) { this.y = top + r; this.vy = Math.abs(this.vy); hit = true; }
      else if (this.y > bottom - r) { this.y = bottom - r; this.vy = -Math.abs(this.vy); hit = true; }
      if (hit) {
        if (this.sweeper) {
          const col = this.sweeperStyle === "shard" ? "#6ef2ff" : "#ff8a32";
          FX.ring(this.x, this.y, 6, col);
          this.crossings++; this.passesRemaining = Math.max(0, this.passesRemaining - 1);
          this.integrity = Math.max(1, this.integrity - 1);   // a tooth/spoke visibly dies at every contact
          if (this.passesRemaining <= 0) this._embedSweeper();
          else if (SFX.sweeperBounce) SFX.sweeperBounce(this.sweeperStyle, false);
        }
        else { this.bounces--; this.vx *= 0.85; this.vy *= 0.85; FX.ring(this.x, this.y, 4); }
      }
      return;
    }

    const m = 40;
    if (this.x < -m || this.x > CONFIG.view.w + m || this.y < -m || this.y > CONFIG.view.h + m) {
      this.dead = true;
    }
  }

  // reflect along a direction (blade travel, or toward a target for a perfect parry)
  deflect(dirX: number, dirY: number, speed: number, perfect: boolean): void {
    const inSpeed = len(this.vx, this.vy) || CONFIG.proj.speed;   // the incoming shot's speed
    const m = len(dirX, dirY) || 1;
    const boost = perfect ? CONFIG.blade.deflectBoost * 1.6 : CONFIG.blade.deflectBoost;
    const s = Math.max(speed, CONFIG.proj.speed) * boost;
    this.vx = (dirX / m) * s;
    this.vy = (dirY / m) * s;
    this.deflected = true;
    this.perfect = perfect;
    // parry damage scales with BOTH the original shot's damage AND its speed — sending a
    // fast, heavy shot back is the big payoff; a slow pellet barely stings
    const orig = this.dmg ?? CONFIG.proj.dmg;
    const speedF = clamp(inSpeed / 600, 0.6, 2.2);
    this.deflectDmg = Math.round((orig * (perfect ? 2.6 : 1.8) + (perfect ? 10 : 8)) * (0.7 + 0.3 * speedF));
    this.life = 6;
  }

  draw(surface: unknown): void { presentation.draw(surface, this); }

}

  return Projectile;
}

export { createProjectile };

import type { EnemyDependencies, BossPresentationActor, EnemyConfig, EnemyDamageContext, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { BossRuntime } from "./boss-runtime";

export function createEnemyBase(dependencies: EnemyDependencies, bossRuntime: BossRuntime) {
  const { CLOCK, CONFIG, Clipper, GAME_RANDOM, Projectile, aabbOverlap, clamp, len, lerp } = dependencies;
  const { bossFeedback } = bossRuntime;
  class Enemy {
    cfg: EnemyConfig;
    x: number; y: number; vx: number; vy: number; hw: number; hh: number;
    hp: number; maxHp: number; hpDisplay: number; onGround: boolean; dead: boolean;
    hitCd: number; flash: number; stun: number; speedMult: number; contactDmg: number;
    elite: boolean; color: string; spawnT: number; dying: boolean; deathT: number; deathDur: number;
    _deathCause: string; weight: number; spiked: boolean; kind: string; variant: string;
    variantName: string; behavior: string; affixes: string[]; affixCount: number;
    fireRateMult: number; volley: number; contactReach: number; shield: number; maxShield: number;
    canJump: boolean; jumpCd: number; atk: string; atkT: number; atkCd: number; atkDir: number;
    feint: boolean; enraged: boolean; evadeCd: number; atkMax: number; weaponA: number;
    weaponPrevA: number; chargePower: number; chargeMult: number; canClimb: boolean; climber: boolean;
    climbApt: number; navDir: number; perchT: number; climbCommit: number; aliveT: number;
    auraDR: number; auraDmg: number; auraSpeed: number; auraHaste: number; tetherDR: number;
    anchored: boolean; buffs: string[]; immuneToBlade: boolean; bleedStacks: number; bleedT: number;
    burnT: number; burnDps: number; markT: number; slowStatus: number; _stFx: number;
    firstPlayerDamageAt: number | null; seamT: number; seamThrowId: number; breakPressure: number;
    breakT: number; driveT: number; boundT: number; severT: number; severMult: number;
    severTier: number; phaseDamageMult: number;
    isBoss?: boolean; isMiniBoss?: boolean; _noBar?: boolean;
    declare bossName: string; declare bossId: string; declare presentationId: string; declare epithet: string;
    declare phaseMarks: number[]; declare phaseTag: string; declare facing: number;
    declare batonA: number; declare batonAV: number; declare weaponAV: number;
    declare cinematicRequest: BossPresentationActor["cinematicRequest"];
    declare cinematicPose: string; declare cinematicColor: string; declare cinematicT: number;
    declare _perilUntil: number; declare _phaseFlashT: number;

    constructor(x: number, y: number, cfg: EnemyConfig) {
      this.cfg = cfg;
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.hw = cfg.w / 2;
      this.hh = cfg.h / 2;
      this.hp = cfg.hp;
      this.maxHp = cfg.hp;
      this.hpDisplay = cfg.hp;   // lagging bar for the drain effect
      this.onGround = false;
      this.dead = false;
      this.hitCd = 0;
      this.flash = 0;
      this.stun = 0;
      this.speedMult = 1;
      this.contactDmg = cfg.contactDmg;
      this.elite = false;
      this.color = "#000";
      this.spawnT = 0;       // >0 while materializing (telegraph + can't act)
      // Bosses linger for a short authored collapse instead of disappearing on the
      // lethal simulation tick. Ordinary enemies still die immediately.
      this.dying = false;
      this.deathT = 0;
      this.deathDur = (CONFIG.bossTheater.deathDur) || 0.9;
      this._deathCause = "";
      this.weight = cfg.weight ?? 1;   // resists launches (heavier = less pop)
      this.spiked = false;   // slammed downward while airborne -> ground-impact on landing
      // variant / affix state
      this.kind = "enemy";
      this.variant = "";       // distinct "evolution" within the family (variants.js)
      this.variantName = "";
      this.behavior = "";      // AI branch the family.update() switches on
      this.affixes = [];
      this.affixCount = 0;
      this.fireRateMult = 1; // <1 = shoots faster (Rapid)
      this.volley = 1;       // shots per attack (Volley)
      this.contactReach = 0; // extra contact range (Armed)
      this.shield = 0;       // absorbs damage before HP (Warded)
      this.maxShield = 0;
      this.canJump = false;  // some ground enemies can hop onto platforms
      this.jumpCd = 0;
      // generic melee attack state machine (bull charge / brawler punch / stalker)
      this.atk = "idle";     // idle | windup | commit | recover
      this.atkT = 0;         // timer within the current attack phase
      this.atkCd = 0;        // recovery before the next attack
      this.atkDir = 1;       // committed horizontal direction
      this.feint = false;    // this windup is a feint (brawler bluffs, then backs off)
      this.enraged = false;  // armored: shield broken -> faster & aggressive
      this.evadeCd = 0;      // stalker: cooldown between dash-reads
      this.atkMax = 0;       // duration of the current wind-up (for telegraph scaling)
      this.weaponA = -0.5;   // animated weapon angle (radians; -up, 0 forward, +down)
      this.weaponPrevA = -0.5;
      this.chargePower = 0;  // 0..1 roll: longer wind-up -> farther, harder charge
      this.chargeMult = 1;   // contact-damage multiplier applied during a committed charge
      // platform pathfinding
      this.canClimb = false; // family is capable of hopping platforms
      this.climber = false;  // ...and this individual actually does (rolled at spawn)
      this.climbApt = 0.5;   // aptitude 0..1: better climbers react sooner & hop more fluidly
      this.navDir = 1;       // suggested horizontal direction from climbNav
      this.perchT = 0;       // how long the player has been perched above & unreached
      this.climbCommit = 0;  // once it decides to climb, it commits for a stretch (anti-jitter)
      this.aliveT = 0;       // seconds alive — willingness to climb ramps with this
      // support auras (re-applied each frame by updateSupports in game.js)
      this.auraDR = 1;       // War Priest: incoming damage multiplier (<1 = protected)
      this.auraDmg = 1;      // War Priest: outgoing damage multiplier (>1 = empowered)
      this.auraSpeed = 1;    // Herald: movement-speed multiplier
      this.auraHaste = 1;    // Herald: attack-cadence multiplier (>1 = faster shots/attacks)
      this.tetherDR = 1;     // Anchor: shielded ally damage multiplier
      this.anchored = false; // Anchor: bonded ally can't be knocked back / launched
      this.buffs = [];       // which support types currently affect this enemy (for indicators)
      this.immuneToBlade = false;  // Wraith: direct blade hits pass through harmlessly
      // ---- status effects (from Special abilities) ----
      this.bleedStacks = 0; this.bleedT = 0;   // BLEED: stacking damage-over-time
      this.burnT = 0; this.burnDps = 0;         // BURN: flat damage-over-time
      this.markT = 0;                            // MARK: takes +damage from everything
      this.slowStatus = 1;                       // Cinder T2: chilled/slowed while burning
      this._stFx = 0;                            // throttle for status particles
      // Weapon/ability state. These fields are intentionally generic enemy state;
      // abilities and weapons communicate through events rather than bespoke subclasses.
      this.firstPlayerDamageAt = null;
      this.seamT = 0; this.seamThrowId = 0;
      this.breakPressure = 0; this.breakT = 0;
      this.driveT = 0; this.boundT = 0;
      this.severT = 0; this.severMult = 1; this.severTier = 0;
      this.phaseDamageMult = 1;
    }

    // ---- status effects ----
    applyBleed(stacks: number) { const S = CONFIG.status; this.firstPlayerDamageAt ??= CLOCK.sim; this.bleedStacks = Math.min(S.bleedMax, this.bleedStacks + stacks); this.bleedT = S.bleedDur; }
    applyBurn() { const S = CONFIG.status; this.firstPlayerDamageAt ??= CLOCK.sim; this.burnT = Math.max(this.burnT, S.burnDur); this.burnDps = Math.max(this.burnDps, S.burnDps); }
    applyMark() { this.markT = Math.max(this.markT, CONFIG.status.markDur); }
    applySeam(duration: number, throwId: number) { this.seamT = Math.max(this.seamT, duration || 0); this.seamThrowId = throwId || 0; }
    applyBreak(amount: number) {
      if (!(amount > 0)) return false;
      const threshold = this.isBoss ? CONFIG.weapons.hammer.bossBreakThreshold : CONFIG.weapons.hammer.breakThreshold;
      this.breakPressure += amount; this.breakT = 2.4;
      if (this.breakPressure < threshold) return false;
      this.breakPressure = 0;
      this.stun = Math.max(this.stun, this.isBoss ? 0.42 : 1.0);
      if (this.shield > 0) this.shield = Math.max(0, this.shield - threshold);
      if (this.cfg.breakSpeed && !this.enraged) this.enraged = true;
      return true;
    }
    applySever(tier: number) {
      tier = clamp(tier || 1, 1, 3);
      const S = CONFIG.sever;
      this.severTier = Math.max(this.severTier || 0, tier);
      this.severMult = (this.isBoss ? S.bossMult : S.normalMult)[this.severTier - 1] ?? 1;
      this.severT = Math.max(this.severT, this.isBoss ? S.bossDuration : S.normalDuration);
    }
    outgoingDamageMult() { return (this.severMult || 1) * (this.phaseDamageMult || 1); }
    bleedPool() { return this.bleedStacks * CONFIG.status.bleedDps * Math.max(this.bleedT, 0); }   // remaining bleed if it ran out
    detonateBleed() { const d = this.bleedPool(); this.bleedStacks = 0; this.bleedT = 0; return d > 0 ? this._dot(d) : 0; }
    _dot(dmg: number) {   // damage with no i-frame / knockback (used by DoTs + detonations)
      if (this.dead || this.dying) return 0;
      const context = { type: "status", aerial: false };
      if (this.blocksDamage(context)) return 0;
      dmg *= this.damageTakenMult(context);
      dmg = this.limitIncomingDamage(dmg, context);
      const before = this.hp;
      if (this.shield > 0) { this.shield -= dmg; if (this.shield < 0) { this.hp += this.shield; this.shield = 0; } }
      else this.hp -= dmg;
      if (this.hp <= 0) {
        if (this._deathLocked()) { this.hp = 1; }   // scripted-invulnerable boss phase (fake-death): DoTs can't kill either
        else this._beginDeath("skill");
      }
      return Math.max(0, before - Math.max(this.hp, 0));
    }
    // bosses override: true while in a scripted fake-death/kneel phase where NO damage path
    // (blade hit OR DoT) may be lethal — the fight must reach the scripted revival.
    _deathLocked() { return false; }
    onDeathStart(): void { return; }
    _beginDeath(cause = "") {
      if (this.dead || this.dying) return;
      if (this.isBoss && !this.isMiniBoss) {
        this.hp = 0; this.dying = true; this.deathT = this.deathDur;
        this._deathCause = cause || ""; this.contactDmg = 0; this.vx = 0; this.vy = 0;
        bossFeedback(this, "death");
        this.onDeathStart();
      } else {
        this.dead = true;
        if (this.isBoss) Clipper?.stop();
      }
    }
    updateDeath(dt: number) {
      if (!this.dying) return false;
      this.deathT = Math.max(0, this.deathT - dt);
      if (this.deathT <= 0) { this.dying = false; this.dead = true; return true; }
      return false;
    }
    get deathP() { return this.deathDur > 0 ? clamp(1 - this.deathT / this.deathDur, 0, 1) : 1; }
    // returns damage dealt this tick (so the loop can credit DoT kills)
    tickStatus(dt: number) {
      let dealt = 0;
      if (this.markT > 0) this.markT -= dt;
      if (this.bleedStacks > 0) {
        this.bleedT -= dt;
        if (this.bleedT <= 0) { this.bleedStacks = 0; this.bleedT = 0; }
        else { const d = this.bleedStacks * CONFIG.status.bleedDps * dt; this._dot(d); dealt += d; }
      }
      if (this.burnT > 0) { this.burnT -= dt; const d = this.burnDps * dt; this._dot(d); dealt += d; if (this.burnT <= 0) this.burnDps = 0; }
      return dealt;
    }

    get radius() { return Math.max(this.hw, this.hh); }
    get speed() { return this.cfg.speed * this.speedMult * this.auraSpeed * this.slowStatus; }
    blocks(incomingX?: number, tipSpeed?: number) { void incomingX; void tipSpeed; return false; }            // armored overrides
    blocksDamage(context?: EnemyDamageContext) { void context; return false; }      // bosses may gate non-melee damage too
    damageTakenMult(context?: EnemyDamageContext) { void context; return 1; }       // armored overrides (ground vs air)
    limitIncomingDamage(dmg: number, context?: EnemyDamageContext) { void context; return dmg; }   // authored bosses may protect a phase boundary
    // Optional authored contact gate. Most actors always deal body contact; stateful
    // bosses can close the gate without mutating their difficulty-scaled contactDmg.
    contactDamageEnabled() { return true; }
    contactDamageAmount() { return this.contactDmg; }
    onContactDamage() { /* empty */ }

    // turn this into a tougher elite variant
    makeElite() {
      const E = CONFIG.elite;
      this.elite = true;
      this.hp *= E.hpMult; this.maxHp *= E.hpMult;
      this.speedMult *= E.speedMult;
      this.contactDmg *= E.dmgMult;
      this.hw *= E.sizeMult; this.hh *= E.sizeMult;
    }

    integrate(dt: number, platforms: readonly EnemyPlatform[]) {
      this.vx = clamp(this.vx, -1200, 1200);   // safety: knockback can never fling across the map
      this.vy += CONFIG.world.gravity * dt;
      if (this.vy > CONFIG.player.maxFall) this.vy = CONFIG.player.maxFall;
      this.x += this.vx * dt;
      this._collideAxis(platforms, true, 0);
      const prevBottom = this.y + this.hh;
      this.y += this.vy * dt;
      this.onGround = false;
      this._collideAxis(platforms, false, prevBottom);
      this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
      if (this.y < this.hh) this.y = this.hh;   // never leave the top of the arena (stay killable)
      // hard floor: never sink below the floor surface (failsafe vs phasing through it)
      const floorTop = CONFIG.world.groundY - this.hh;
      if (this.y > floorTop) { this.y = floorTop; this.vy = 0; this.onGround = true; }
    }

    _collideAxis(platforms: readonly EnemyPlatform[], horizontal: boolean, prevBottom: number) {
      for (const p of platforms) {
        if (p.oneway) {
          // one-way: land only when actually crossing THIS platform's top from above
          // (must be above last frame AND at/through the top now) — prevents snapping
          // down onto a lower platform that merely overlaps in x.
          if (horizontal) continue;
          if (this.vy >= 0 && prevBottom <= p.y + 1.5 && this.y + this.hh >= p.y &&
              this.x + this.hw > p.x && this.x - this.hw < p.x + p.w) {
            this.y = p.y - this.hh; this.vy = 0; this.onGround = true;
          }
          continue;
        }
        if (horizontal && p.floor) continue;   // the full-width floor never blocks horizontal movement
        const phw = p.w / 2, phh = p.h / 2;
        const pcx = p.x + phw, pcy = p.y + phh;
        if (!aabbOverlap(this.x, this.y, this.hw, this.hh, pcx, pcy, phw, phh)) continue;
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

    // some grounded enemies hop toward the player when they're up on a platform
    maybeJump(player: EnemyPlayerPort, dt: number) {
      if (this.jumpCd > 0) this.jumpCd -= dt;
      if (!this.canJump || !this.onGround || this.jumpCd > 0) return;
      if (player.y < this.y - 90 && GAME_RANDOM.next() < 0.5) { this.vy = -1100; this.onGround = false; this.jumpCd = 1.8; }
    }

    // lightweight platform pathfinding: when the player is perched above, steer toward
    // the nearest reachable one-way platform and hop onto it, level-by-level. NOT every
    // enemy climbs, and the ones that do don't react instantly — they need the player to
    // stay perched for a "react delay" that shrinks the longer the enemy has been alive
    // (rookies stay grounded; lingering enemies get determined) and with its aptitude.
    // A commitment window stops per-frame jitter, so a player drifting across platforms
    // doesn't turn the whole arena into a jumping fest. Returns true while it's climbing.
    climbNav(player: EnemyPlayerPort, platforms: readonly EnemyPlatform[], dt: number) {
      if (this.jumpCd > 0) this.jumpCd -= dt;
      this.navDir = Math.sign(player.x - this.x) || 1;
      const feetY = this.y + this.hh, playerFeet = player.y + player.hh;
      const above = playerFeet <= this.y - 60;
      if (above) this.perchT += dt; else { this.perchT = 0; this.climbCommit = 0; }
      if (!this.canClimb || !this.climber || !above) return false;

      // willingness ramps with time alive; the perch delay before reacting shrinks with
      // age + aptitude (so freshly spawned enemies don't all leap the instant you hop up)
      const will = clamp(this.aliveT / 14, 0, 1);
      const reactDelay = lerp(2.4, 0.45, will * 0.6 + this.climbApt * 0.4);
      if (this.climbCommit <= 0 && this.perchT < reactDelay) return false;
      if (this.climbCommit <= 0) this.climbCommit = 1.6;     // commit a stretch (anti-jitter)
      this.climbCommit -= dt;

      const MAXJUMP = 300, TOL = 130;
      let best = null, bestDist = Infinity;
      for (const p of platforms) {
        if (!p.oneway) continue;
        if (p.y >= feetY - 30) continue;                 // must be above us
        if (feetY - p.y > MAXJUMP) continue;             // too high to reach in one hop
        if (p.y < playerFeet - 50) continue;             // don't climb above the player
        const d = Math.abs((p.x + p.w / 2) - this.x);
        if (d < bestDist) { bestDist = d; best = p; }
      }
      if (!best) return false;                            // nothing reachable -> gather underneath
      const center = best.x + best.w / 2;
      if (this.x > best.x - TOL && this.x < best.x + best.w + TOL) {
        this.navDir = Math.sign(center - this.x) || this.navDir;
        if (this.onGround && this.jumpCd <= 0) {          // aligned -> hop up (and across) onto it
          this.vy = -1250; this.onGround = false;
          this.jumpCd = lerp(1.5, 0.7, this.climbApt);    // clumsy climbers hesitate between hops
          this.vx += Math.sign(center - this.x) * 320;
        }
      } else {
        this.navDir = Math.sign(center - this.x) || 1;    // walk under it first
      }
      return true;
    }

    fireAt(player: EnemyPlayerPort, projectiles: EnemyProjectile[], speed: number) {
      const dx = player.x - this.x, dy = player.y - this.y;
      const m = len(dx, dy) || 1;
      const p = new Projectile(this.x, this.y, (dx / m) * speed, (dy / m) * speed);
      p.owner = this; p.sourceEnemy = this;
      p.dmg = CONFIG.proj.dmg * this.auraDmg;   // War Priest empowers shots
      p.tint = this.color; projectiles.push(p);
    }

    ownProjectile(p: EnemyProjectile) { p.owner = this; p.sourceEnemy = this; return p; }

    tickTimers(dt: number) {
      this.aliveT += dt;
      if (this.hitCd > 0) this.hitCd -= dt;
      if (this.flash > 0) this.flash -= dt;
      if (this.stun > 0) this.stun -= dt;
      if (this.seamT > 0) { this.seamT -= dt; if (this.seamT <= 0) { this.seamT = 0; this.seamThrowId = 0; } }
      if (this.breakT > 0) this.breakT -= dt; else this.breakPressure = Math.max(0, this.breakPressure - 30 * dt);
      if (this.driveT > 0) this.driveT -= dt;
      if (this.boundT > 0) this.boundT -= dt;
      if (this.severT > 0) { this.severT -= dt; if (this.severT <= 0) { this.severT = 0; this.severMult = 1; this.severTier = 0; } }
      if (this.hpDisplay > this.hp) this.hpDisplay += (this.hp - this.hpDisplay) * clamp(7 * dt, 0, 1);
    }

    hit(dmg: number, knockX: number, knockY: number, context?: EnemyDamageContext) {
      if (this.dead || this.dying) return 0;
      // Overrun foundation (Weapons WA1): stamp the first player-owned damage so a
      // fast follow-up kill can be recognised as a Clean Elimination on death.
      if ((context?.playerOwned !== false) && this.firstPlayerDamageAt == null) this.firstPlayerDamageAt = CLOCK.sim;
      this.hitCd = CONFIG.blade.enemyHitIframe;
      this.flash = 0.08;
      const before = this.hp;
      dmg *= this.auraDR * this.tetherDR;          // War Priest / Anchor protection
      if (this.markT > 0) dmg *= CONFIG.status.markMult;   // MARK: amplifies every hit
      dmg = this.limitIncomingDamage(dmg, { type: "hit" });
      if (this.shield > 0) {                       // Warded: shield absorbs first
        this.shield -= dmg;
        if (this.shield < 0) { this.hp += this.shield; this.shield = 0; }
      } else {
        this.hp -= dmg;
      }
      if (!this.anchored) {   // an Anchor's bonded ally is immovable until the Anchor dies
        const kb = dmg * this.cfg.knockbackTaken / this.weight;
        const m = len(knockX, knockY) || 1;
        this.vx += (knockX / m) * kb;
        this.vy += (knockY / m) * kb - 120 / this.weight;
      }
      if (this.hp <= 0) {
        if (this._deathLocked()) { this.hp = 1; }   // scripted-invulnerable boss phase: a blade hit can't kill here either
        else this._beginDeath();
      }
      return Math.max(0, before - Math.max(this.hp, 0));
    }

    // additive shim: a uniform damage entrypoint for a symmetric actor-vs-actor collision loop
    // (see Mirror). One-line alias into the existing hit() — no existing call site changes.
    takeHit(dmg: number, kx: number, ky: number, source?: unknown) { void source; this.hit(dmg, kx, ky); return this.dead ? "dead" : "hit"; }
  }

  return Enemy;
}

export type EnemyBaseConstructor = ReturnType<typeof createEnemyBase>;
export type EnemyBaseInstance = InstanceType<EnemyBaseConstructor>;

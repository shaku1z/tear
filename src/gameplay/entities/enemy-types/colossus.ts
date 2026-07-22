import type { EnemyDependencies, ArenaZone, EnemyDamageContext, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import type { BossRuntime } from "./boss-runtime";

export function createColossusType(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor, bossRuntime: BossRuntime) {
  const { CONFIG, FX, GAME_RANDOM, Projectile, SFX, clamp, lerp } = dependencies;
  const { bossFeedback, bossTransformation, perilPing } = bossRuntime;
  // ---- The Iron Colossus (Stage 2 boss): tank with a front shield -> thrown sweeping arm -> molten core ----
  class Colossus extends Enemy {
    blockStyle: string; state: string; stateT: number; pendingAtk: string; exposed: boolean;
    shielded: boolean; phaseMarker: number; zones: ArenaZone[]; zoneColor: string; crossT: number;
    ventT: number; ventX: number; coreOpenT: number; shieldEmbedT: number; sweeperPosture: number;
    shieldArmRuptured: boolean; panelIdx: number; panelStepT: number; meltdownCd: number;
    attackIdx: number; _playerRef: EnemyPlayerPort | null; chargeStop: boolean; smashTX: number;
    grabCd: number; plateKickT: number; servoCompression: number; introT = 0; campT = 0;
    campPlat: EnemyPlatform | null = null; pillarCd = 0; _plateFlashT = 0;
    _introBeat = false;
    declare cfg: typeof CONFIG.colossus;

    constructor(x: number, y: number) {
      super(x, y, CONFIG.colossus);
      this.color = CONFIG.colors.armored;
      this.kind = "boss"; this.isBoss = true; this.bossName = "IRON COLOSSUS";
      this.presentationId = "colossus";
      this.epithet = "THE CONTAINMENT ENGINE"; this.phaseMarks = [0.60, 0.25]; this.phaseTag = "SEALED";
      this.blockStyle = "plate";   // blocked hits CLANG off fortress plating (not an Armored reskin)
      this.state = "idle"; this.stateT = 0; this.atkT = 2.2; this.pendingAtk = "sweep";
      this.facing = 1; this.exposed = false; this.shielded = true;
      this.phaseMarker = 1;
      this.zones = []; this.zoneColor = CONFIG.colors.slam;   // phase-3 hot floor panels (reuses the boss-zone system)
      this.crossT = 0;
      this.ventT = 0; this.ventX = this.x; this.coreOpenT = 0; this.shieldEmbedT = 0;
      this.sweeperPosture = 0; this.shieldArmRuptured = false;
      this.panelIdx = -1; this.panelStepT = 0; this.meltdownCd = CONFIG.colossus.meltdownCd;
      this.attackIdx = 0; this._playerRef = null;
      this.chargeStop = false; this.smashTX = 0; this.grabCd = 0;   // bruiser kit
      this.plateKickT = 0; this.servoCompression = 0;
    }
    get phase() { const f = this.hp / this.maxHp; return f > 0.6 ? 1 : (f > 0.25 ? 2 : 3); }
    get guardSide() { return this.facing; }
    // phase-1 front shield: only an aerial hit (you striking from above) gets through
    override blocks() { return this.shielded && !this.exposed; }
    override blocksDamage(context?: EnemyDamageContext) { return this.shielded && !context?.aerial; }
    override damageTakenMult() { return this.coreOpenT > 0 ? CONFIG.colossus.coreOpenMult : (this.phase === 3 ? 1.35 : 1); }
    override tickTimers(dt: number) {
      super.tickTimers(dt);
      if (this.ventT > 0) this.ventT -= dt;
      if (this.coreOpenT > 0) this.coreOpenT -= dt;
      if (this.shieldEmbedT > 0) this.shieldEmbedT -= dt;
      if (this.plateKickT > 0) this.plateKickT = Math.max(0, this.plateKickT - dt);
      if (this._playerRef) this._applyVent(dt, this._playerRef);
    }
    _startVent() {
      this.ventT = CONFIG.colossus.ventDur;
      this.ventX = clamp(this.x - this.facing * (this.hw + 46), CONFIG.colossus.ventW / 2, CONFIG.view.w - CONFIG.colossus.ventW / 2);
    }
    _applyVent(dt: number, player: EnemyPlayerPort) {
      if (this.ventT <= 0) return;
      const C = CONFIG.colossus;
      if (Math.abs(player.x - this.ventX) <= C.ventW / 2 + player.hw && player.y < CONFIG.world.groundY && player.y > 80) {
        player.vy = Math.max(-1250, player.vy - C.ventLift * dt);
        player.onGround = false;
      }
    }

    _shock(projectiles: EnemyProjectile[], dir: number) {
      // QUAKES — the earthquake is HIS language alone now: taller, slower tremor
      // columns (see the quake draw in projectile.js), nothing like the old ripples
      const C = this.cfg, footY = this.y + this.hh;
      const p = new Projectile(this.x + dir * this.hw * 0.7, footY - C.shockR, dir * C.shockSpeed * (C.quakeSpeedMult || 0.78), 0);
      p.setFamily("groundShock"); p.quake = true; p.r = C.shockR * (C.quakeRMult || 1.25); p.dmg = C.shockDmg; p.life = 2.8;
      p.owner = this; p.tint = CONFIG.colors.armoredShield;
      projectiles.push(p);
      FX.shockwave(p.x, footY, 8, CONFIG.colors.armoredShield, 130, 4);   // the ground jolts at the epicentre
    }
    _throwShield(projectiles: EnemyProjectile[]) {
      const C = this.cfg;
      const active = projectiles.find((shot) => !shot.dead && shot.family === "sweeper" && shot.owner === this);
      if (active) return active;   // one counter-object per owner: no overlapping cheap lanes
      const p = new Projectile(this.x + this.facing * (this.hw + 12), this.y, this.facing * C.sweeperSpeed, 0);
      p.sweeperStyle = "saw"; p.setFamily("sweeper").configureSweeper({ passes: C.shieldCrossings, integrity: C.sweeperIntegrity,
        maxLife: C.sweeperMaxLife, embeddedLife: C.shieldEmbedDur });
      p.r = 22; p.dmg = C.sweeperDmg; p.owner = this; p.tint = "#ff8a32";
      p.onCountered = (shot: EnemyProjectile) => { this.onSweeperReturned(shot); };
      projectiles.push(p);
      FX.ring(this.x, this.y, 20, CONFIG.colors.armoredShield);
      return p;
    }
    _crossBurst(projectiles: EnemyProjectile[]) {
      const C = this.cfg;
      const directions: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
      for (const [dx, dy] of directions) {
        const p = new Projectile(this.x, this.y, dx * C.crossSpeed, dy * C.crossSpeed);
        p.dmg = C.crossDmg; p.r = 12; p.tint = CONFIG.colors.armoredShield; p.owner = this; projectiles.push(p);
      }
      FX.ring(this.x, this.y, 16, CONFIG.colors.boss);
    }
    _enterPhase(ph: number, projectiles: EnemyProjectile[]) {
      void projectiles;
      if (ph === 2) {
        this.shielded = false; this.phaseTag = "BREACHED"; this.crossT = 0.8;
        bossTransformation(this, { id: "colossus-breach", title: "THE SHIELD FALLS", pose: "colossusContainment",
          speaker: "FOUNDRY WARNING", line: "OUTER CONTAINMENT FAILED.", color: CONFIG.colors.armoredShield, sfx: "colossusServo", after: "throwShield" });
      }
      else if (ph === 3) {
        const C = this.cfg; this.zones = [];
        for (let i = 0; i < C.panelCount; i++) this.zones.push({ kind: "panel", x: 220 + i * (CONFIG.view.w - 440) / (C.panelCount - 1), w: CONFIG.warden.zoneW, on: false, arming: i === 0,
          dmg: CONFIG.warden.zoneTick, tickCd: CONFIG.warden.zoneTickCd });
        this.panelIdx = -1; this.panelStepT = 0.35; this.meltdownCd = C.meltdownCd * 0.65; this.phaseTag = "MELTDOWN";
        bossTransformation(this, { id: "colossus-meltdown", title: "THE CORE IGNITES", pose: "colossusCore",
          speaker: "FOUNDRY WARNING", line: "CORE CONTAINMENT: LOST.", color: CONFIG.colors.slam, sfx: "colossusServo" });
      }
    }

    _debris(projectiles: EnemyProjectile[]) {
      const C = this.cfg;
      for (const tx of [this.x - 170, this.x, this.x + 170]) {
        const x = clamp(tx, 55, CONFIG.view.w - 55), p = new Projectile(x, 32, 0, 50);
        p.gravity = C.debrisGravity; p.dmg = C.debrisDmg; p.r = 14; p.owner = this; p.tint = CONFIG.colors.armoredShield;
        p.landingX = x; p.landingY = CONFIG.world.groundY; p.landingT = 0.86; p.groundImpact = true; p.bossAttack = "debris";
        projectiles.push(p);
      }
    }
    _stagger(projectiles: EnemyProjectile[]) {
      const C = this.cfg;
      this.state = "recover"; this.stateT = C.staggerDur; this.stun = C.staggerDur;
      this.coreOpenT = C.coreOpenDur; this._startVent(); this._debris(projectiles);
      this.plateKickT = 0.5; bossFeedback(this, "stagger", { banner: "STAGGERED", color: CONFIG.colors.armoredShield });
      FX.shockwave(this.x, this.y + this.hh, 14, CONFIG.colors.armoredShield, 230, 6);
    }
    onShieldEmbedded() {
      this.shieldEmbedT = this.cfg.shieldEmbedDur; this.stun = Math.max(this.stun, this.cfg.shieldEmbedDur * 0.55);
      bossFeedback(this, "counter", { banner: "BREACH THE FORTRESS", color: CONFIG.colors.armoredShield, zoom: 0.04, quiet: true });
    }
    onSweeperReturned(p: EnemyProjectile) {
      const perfect = p.perfect;
      this.sweeperPosture = clamp(this.sweeperPosture + (perfect ? 0.75 : 0.45), 0, 1);
      this.shieldArmRuptured = true;
      this.state = "recover"; this.stateT = perfect ? 1.05 : 0.68;
      this.stun = Math.max(this.stun, this.stateT);
      if (perfect) this.coreOpenT = Math.max(this.coreOpenT, 1.8);
      this.plateKickT = perfect ? 0.48 : 0.3;
      bossFeedback(this, "counter", { banner: perfect ? "CORE EXPOSED" : "SHIELD ARM RUPTURED", color: perfect ? CONFIG.colors.perfect : "#ff8a32",
        priority: perfect ? 9 : 7, slowmo: perfect ? 0.42 : 0, zoom: perfect ? 0.09 : 0.045 });
      FX.shockwave(this.x, this.y, 12, perfect ? CONFIG.colors.perfect : "#ff8a32", perfect ? 260 : 180, 6);
    }
    onProjectileGroundImpact(p: EnemyProjectile) {
      const impactY = p.landingY ?? CONFIG.world.groundY;
      FX.explode(p.x, impactY, CONFIG.colors.armoredShield, 0.55);
      const pl = this._playerRef;
      if (pl && Math.abs(pl.x - p.x) < 64 + pl.hw && Math.abs(pl.y + pl.hh - impactY) < 100) pl.takeDamage(p.dmg ?? this.cfg.debrisDmg, p.x, this);
    }
    update(dt: number, platforms: EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      this.tickTimers(dt);
      const C = this.cfg, ph = this.phase;
      this._playerRef = player;
      this.facing = Math.sign(player.x - this.x) || this.facing;
      this.exposed = player.y < this.y - this.hh * 0.15;   // attacking from above
      if (ph !== this.phaseMarker) { this._enterPhase(ph, projectiles); this.phaseMarker = ph; }
      if (this.cinematicRequest) return;
      if (this.introT > 0) {
        const ip = 1 - this.introT / ((CONFIG.bossTheater.introDur) || 1.4);
        if (ip > 0.64 && !this._introBeat) { this._introBeat = true; this._shock(projectiles, 1); this._shock(projectiles, -1); }
        this.vx = 0; this.integrate(dt, platforms); return;
      }
      if (ph === 2) { this.crossT -= dt; if (this.crossT <= 0) { this._crossBurst(projectiles); this.crossT = C.crossCd; } }
      if (ph === 3) {
        this.panelStepT -= dt;
        if (this.panelStepT <= 0) {
          this.panelIdx = (this.panelIdx + 1) % this.zones.length;
          for (let i = 0; i < this.zones.length; i++) { const zone = this.zones[i]; if (!zone) continue; zone.on = i === this.panelIdx; zone.arming = i === (this.panelIdx + 1) % this.zones.length; }
          this.panelStepT = C.panelStep;
        }
        this.meltdownCd -= dt;
        if (this.meltdownCd <= 0 && this.state === "idle") {
          this.state = "meltdown"; this.stateT = C.meltdownWindup; this.meltdownCd = C.meltdownCd; perilPing(this);
        }
      }

      if (this.state === "meltdown") {
        this.stateT -= dt;
        const k = 1 - clamp(this.stateT / C.meltdownWindup, 0, 1), gy = CONFIG.world.groundY - this.hh;
        this.x = lerp(this.x, CONFIG.view.w / 2, clamp(5 * dt, 0, 1)); this.y = gy - Math.sin(k * Math.PI) * 220;
        this.onGround = false;
        if (this.stateT <= 0) {
          this.x = CONFIG.view.w / 2; this.y = gy; this._shock(projectiles, 1); this._shock(projectiles, -1);
          this._shock(projectiles, 1); this._shock(projectiles, -1);
          for (const z of this.zones) { z.on = true; z.arming = false; }
          FX.explode(this.x, this.y + this.hh, CONFIG.colors.slam, 1.6);
          this.plateKickT = 0.5; bossFeedback(this, "contact", { banner: "MELTDOWN SLAM", color: CONFIG.colors.slam, priority: 9, shake: 14, flash: 0.4, slowmo: 0.4, zoom: 0.08 });
          this.state = "recover"; this.stateT = 0.9;
        }
        return;
      }

      if (this.state === "charge") {                    // shoulder charge (no gravity)
        this.x += this.vx * dt;
        // SMART CHARGE: most charges STOP SHORT with a shoulder-check shock once
        // they blow past the player — only a charge baited into a WALL self-staggers
        if (this.chargeStop && Math.sign(player.x - this.x) !== Math.sign(this.vx)) {
          this.vx = 0; this._shock(projectiles, this.facing);
          FX.shockwave(this.x, this.y + this.hh, 10, CONFIG.colors.armoredShield, 200, 5);
          this.state = "recover"; this.stateT = 0.5; this.atkT = this.cfg.atkCd;
          return;
        }
        if (this.x <= this.hw + 4 || this.x >= CONFIG.view.w - this.hw - 4) { this.x = clamp(this.x, this.hw + 4, CONFIG.view.w - this.hw - 4); this._stagger(projectiles); }
        return;
      }
      if (this.state === "smashwind") {                 // OVERHEAD SMASH: rise, track the player's x, then plunge
        this.stateT -= dt;
        this.x = lerp(this.x, clamp(this.smashTX, this.hw, CONFIG.view.w - this.hw), clamp(3 * dt, 0, 1));
        this.y = lerp(this.y, CONFIG.world.groundY - this.hh - 170, clamp(5 * dt, 0, 1)); this.onGround = false;
        if (this.stateT <= 0) { this.state = "smash"; this.vy = 2600; }
        return;
      }
      if (this.state === "smash") {
        this.y += this.vy * dt; this.vy += 2600 * dt;
        if (this.y >= CONFIG.world.groundY - this.hh) {
          this.y = CONFIG.world.groundY - this.hh; this.onGround = true;
          this._shock(projectiles, 1); this._shock(projectiles, -1);
          if (Math.abs(player.x - this.x) < this.cfg.smashRange && player.y > this.y - 40 && !player.invulnerable) player.takeDamage(this.cfg.smashDmg, this.x, this);
          FX.shockwave(this.x, this.y + this.hh, 16, CONFIG.colors.slam, 300, 7);
          this.plateKickT = 0.45; bossFeedback(this, "contact", { shake: 12, slowmo: 0.36, zoom: 0.06 });
          this.state = "recover"; this.stateT = 0.7; this.atkT = this.cfg.atkCd;
        }
        return;
      }
      if (this.state === "grab") {                      // SEISMIC BACKHAND — the point-blank punish
        this.stateT -= dt;
        if (this.stateT <= 0) {
          if (Math.abs(player.x - this.x) < this.cfg.grabRange + player.hw && Math.abs(player.y - this.y) < this.hh && !player.invulnerable) {
            player.takeDamage(this.cfg.grabDmg, this.x, this);
            player.vx = (Math.sign(player.x - this.x) || 1) * this.cfg.grabKnock; player.vy = -360;
          }
          FX.burst(this.x + this.facing * this.hw, this.y, this.facing, -0.2, 10, CONFIG.colors.armoredShield);
          this.state = "recover"; this.stateT = 0.45; this.atkT = this.cfg.atkCd;
        }
        return;
      }
      if (this.state === "windup") {
        this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1)); this.stateT -= dt;
        if (this.stateT <= 0) this._fire(player, projectiles, C, ph);
      } else if (this.state === "recover") {
        this.vx = lerp(this.vx, 0, clamp(6 * dt, 0, 1)); this.stateT -= dt; if (this.stateT <= 0) this.state = "idle";
      } else {
        this.vx = lerp(this.vx, this.facing * C.speed * (1 + (ph - 1) * 0.3), clamp(2.5 * dt, 0, 1));
        // NO SHELTER — PILLAR QUAKE: camp the gantry and the fortress slams its
        // support out from under you (crack warning, then the perch gives way for a while)
        this.pillarCd = (this.pillarCd || 0) - dt;
        if (this.campT > C.campAfter && this.pillarCd <= 0 && this.campPlat?.arenaPlatId && (this.campPlat.arenaState === "stable" || this.campPlat.arenaState === "stressed")) {
          const pl = this.campPlat;
          pl.arenaFractureRequest = { color: CONFIG.colors.armoredShield, reason: "pillarQuake" };
          this.pillarCd = C.pillarCd; this.campT = 1.2;
          bossFeedback(this, "platformBreak", { banner: "PILLAR QUAKE", color: CONFIG.colors.armoredShield, priority: 7 });
          FX.shockwave(this.x, this.y + this.hh, 10, CONFIG.colors.armoredShield, 260, 5);
        }
        // SEISMIC BACKHAND: crowd the fortress and it swats you (reactive, off the rotation)
        if (this.state === "idle" && Math.abs(player.x - this.x) < C.grabRange && Math.abs(player.y - this.y) < this.hh && this.grabCd <= 0) {
          this.pendingAtk = "grab"; this.state = "grabwind"; this.stateT = C.grabWindup; this.grabCd = 3.0; perilPing(this);
        }
        this.grabCd = (this.grabCd || 0) - dt;
        this.atkT -= dt;
        if (this.atkT <= 0 && this.state === "idle") {
          // a bruiser's rhythm — charge is now just 1 option, not the whole fight;
          // P2 adds the saw, P3 the smash + meltdown
          const patterns = ph === 1 ? ["stomp", "smash", "sweep", "stomp", "charge"]
            : (ph === 2 ? ["stomp", "sweep", "smash", "charge", "stomp", "sweep"]
            : ["smash", "stomp", "charge", "sweep", "smash"]);
          this.pendingAtk = patterns[this.attackIdx++ % patterns.length] ?? "stomp";
          if (this.pendingAtk === "smash") { this.state = "smashwind"; this.stateT = C.smashWindup; this.smashTX = player.x; perilPing(this); }
          else { this.state = "windup"; this.stateT = this.pendingAtk === "charge" ? C.chargeWindup : C.windup; }
          if (this.pendingAtk === "charge") this.chargeStop = GAME_RANDOM.next() < C.chargeStopShort;   // most charges halt short
        }
        if (this.pendingAtk === "grab" && this.state === "grabwind") { this.stateT -= dt; if (this.stateT <= 0) { this.state = "grab"; this.stateT = 0.12; } }
      }
      this.integrate(dt, platforms);
    }
    _fire(_player: EnemyPlayerPort, projectiles: EnemyProjectile[], C: typeof CONFIG.colossus, ph: number) {
      const a = this.pendingAtk;
      if (a === "stomp") { this._shock(projectiles, 1); this._shock(projectiles, -1); this._startVent(); this.state = "idle"; this.atkT = C.atkCd / (1 + (ph - 1) * 0.25); }
      else if (a === "sweep") { this._shock(projectiles, this.facing); this.state = "idle"; this.atkT = C.atkCd / (1 + (ph - 1) * 0.25); }
      else { this.state = "charge"; this.vx = this.facing * C.chargeSpeed; }   // charges along its own (ground) level — telegraphed during wind-up, no teleport
      SFX.slam?.();
    }
  }

  return Colossus;
}

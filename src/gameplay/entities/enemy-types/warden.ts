import type { EnemyDependencies, ArenaZone, EnemyPlatform, EnemyPlayerPort, EnemyProjectile, Point } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import type { BossRuntime } from "./boss-runtime";

export function createWardenType(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor, bossRuntime: BossRuntime) {
  const { CONFIG, FX, GAME_RANDOM, Projectile, SFX, clamp, len, lerp } = dependencies;
  const { bossFeedback, bossTransformation, perilPing, springWeapon, wardstaffPose, weaponHullHitsTarget, weaponDebugGeometry } = bossRuntime;
  class Warden extends Enemy {
    state: string; stateT: number; pendingAtk: string; zones: ArenaZone[]; zoneShiftT: number;
    phaseMarker: number; onCeiling: boolean; ceilDropT: number; lungeT: number; batonPrevA: number;
    batonStrike: number; weaponHitSpent: boolean; guardMeter: number; guardDelayT: number;
    guardBrokenT: number; batonParryCd: number; searchlights: ArenaZone[]; cages: ArenaZone[];
    trails: ArenaZone[]; lockdownT: number; lockdownCd: number; mortarTargets: number[];
    trailDropT: number; _playerRef: EnemyPlayerPort | null; volleyCd: number; volleyTargetY: number;
    vaultCd: number; stringIdx: number; stringN: number; beatPh: string; beatHeavy: boolean;
    beatParried: boolean; mortarKickT: number; introT = 0; campT = 0;
    campPlat: EnemyPlatform | null = null; diveTX = 0; diveTY = 0; lungeWT = 0;
    _introBeat = false;
    debugGeometry: { a: Point; b: Point; radius: number }[] = [];
    declare cfg: typeof CONFIG.boss;

    constructor(x: number, y: number) {
      super(x, y, CONFIG.boss);
      this.color = CONFIG.colors.boss;
      this.kind = "boss"; this.isBoss = true; this.bossName = "THE WARDEN";
      this.presentationId = "warden";
      this.epithet = "KEEPER OF THE GROUNDS"; this.phaseMarks = [0.65, 0.30]; this.phaseTag = "ON DUTY";
      this.state = "idle"; this.stateT = 0;
      this.atkT = 1.8; this.pendingAtk = "baton";
      this.facing = 1;
      this.zones = [];              // phase-2 prohibited zones [{x}]
      this.zoneShiftT = 0;
      this.phaseMarker = 1;
      this.onCeiling = false;
      this.ceilDropT = 0;
      this.lungeT = CONFIG.warden.lungeCd;
      this.batonA = -0.6; this.batonPrevA = -0.6; this.batonAV = 0; this.batonStrike = 0;
      this.weaponHitSpent = false;
      this.guardMeter = 0; this.guardDelayT = 0; this.guardBrokenT = 0; this.batonParryCd = 0;
      this.searchlights = []; this.cages = []; this.trails = []; this.lockdownT = 0; this.lockdownCd = 0;
      this.mortarTargets = []; this.trailDropT = 0; this._playerRef = null;
      this.volleyCd = 0; this.volleyTargetY = 0;   // NO SHELTER: the skyward volley answers perch-campers
      this.vaultCd = 0;
      this.stringIdx = 0; this.stringN = 2; this.beatPh = "wind"; this.beatHeavy = false; this.beatParried = false;   // baton strings
      this.mortarKickT = 0;
    }
    get phase() { const f = this.hp / this.maxHp; return f > 0.65 ? 1 : (f > 0.30 ? 2 : 3); }
    override damageTakenMult() { return this.guardBrokenT > 0 ? CONFIG.warden.guardBreakMult : 1; }
    override tickTimers(dt: number) {
      super.tickTimers(dt);
      if (this.batonParryCd > 0) this.batonParryCd -= dt;
      if (this.mortarKickT > 0) this.mortarKickT = Math.max(0, this.mortarKickT - dt);
      if (this.guardBrokenT > 0) {
        this.guardBrokenT -= dt;
        this.guardMeter = 1;
        if (this.guardBrokenT <= 0) this.guardMeter = 0;
      } else if (this.guardDelayT > 0) this.guardDelayT -= dt;
      else if (this.guardMeter > 0) this.guardMeter = Math.max(0, this.guardMeter - CONFIG.warden.guardDecay * dt);
    }

    weaponGeometry(angle?: number | null, prevAngle?: number | null) { return wardstaffPose(this, angle ?? this.batonA, prevAngle ?? this.batonPrevA); }
    batonSegment() { return this.weaponGeometry().parryCapsule; }
    override contactDamageEnabled() { return this.state !== "string" && this.state !== "batonlunge" && this.state !== "lunge"; }
    parryBaton(perfect: boolean) {
      if (this.dying || this.batonParryCd > 0 || this.batonStrike <= 0 || this.beatHeavy) return false;
      this.beatParried = true;   // the string beat that was deflected does not land
      const Wc = CONFIG.warden;
      this.batonParryCd = 0.22; this.batonStrike = 0; this.guardDelayT = Wc.guardDecayDelay;
      this.batonPrevA = this.batonA; this.batonA -= perfect ? 0.30 : 0.20; this.batonAV = -11;
      this.guardMeter = Math.min(1, this.guardMeter + (perfect ? Wc.guardPerfect : Wc.guardParry));
      bossFeedback(this, "counter", { color: perfect ? CONFIG.colors.perfect : "#e0a326" });
      if (SFX.wardenLockClang) SFX.wardenLockClang();
      if (this.guardMeter >= 1) {
        this.guardBrokenT = Wc.guardBreakDur; this.stun = Math.max(this.stun, Wc.guardBreakDur);
        this.state = "idle"; this.vx = 0;
        bossFeedback(this, "stagger", { banner: "GUARD BROKEN", color: CONFIG.colors.charger });
        FX.ring(this.x, this.y, 18, "#e0a326"); FX.burst(this.x, this.y, 0, -1, 14, CONFIG.colors.charger);
        if (SFX.wardenGuardBreak) SFX.wardenGuardBreak();
      }
      return true;
    }

    _syncZones() { this.zones = this.searchlights.concat(this.cages, this.trails); }
    _startLockdown() {
      const Wc = CONFIG.warden;
      this.lockdownT = Wc.lockdownDur; this.lockdownCd = Wc.lockdownCd;
      this.cages = [
        { kind: "cage", x: Wc.cageW / 2, w: Wc.cageW, fullHeight: true, dmg: Wc.zoneTick, tickCd: Wc.zoneTickCd, on: true },
        { kind: "cage", x: CONFIG.view.w - Wc.cageW / 2, w: Wc.cageW, fullHeight: true, dmg: Wc.zoneTick, tickCd: Wc.zoneTickCd, on: true },
      ];
      bossFeedback(this, "windup", { banner: "LOCKDOWN", color: this.color, quiet: true });
      this._syncZones();
    }

    // animate the baton: raised on a wind-up, slammed through on the strike.
    // String beats alternate the raise height so the rhythm READS (high-low-high).
    _animBaton(dt: number) {
      let wt = -0.45, k = 9;
      if (this.batonStrike > 0) { this.batonStrike -= dt; wt = 0.85; k = 30; }
      else if (this.state === "string" && this.beatPh === "wind") { wt = this.stringIdx % 2 ? -1.05 : -1.65; k = 10; }
      else if (this.state === "windup") { wt = this.pendingAtk === "mortar" ? -1.7 : -1.45; k = 8; }
      else if (this.state === "lunge") { wt = 0.2; k = 14; }
      this.batonPrevA = this.batonA;
      springWeapon(this, "batonA", "batonAV", wt, dt, 210 + k * 3, 21);
      this.debugGeometry = weaponDebugGeometry(this.weaponGeometry());
    }

    _mortar(player: EnemyPlayerPort, projectiles: EnemyProjectile[], landY?: number | null) {
      const Wc = CONFIG.warden, v = Wc.mortarSpeed, g = Wc.mortarGravity;
      const t = (2 * v) / g;
      const targets = this.mortarTargets.length ? this.mortarTargets : [-1, 0, 1].map((i) => clamp(player.x + i * 180, 60, CONFIG.view.w - 60));
      for (const tx of targets) {
        const p = new Projectile(this.x, this.y - this.hh, (tx - this.x) / t, -v);
        p.gravity = g; p.dmg = Wc.mortarDmg; p.r = 11; p.owner = this; p.tint = this.color;
        p.landingX = tx; p.landingY = landY ?? CONFIG.world.groundY;   // volleys burst at PLATFORM height
        p.landingT = t; p.groundImpact = true; p.bossAttack = "mortar";
        p.whistleStage = 0;
        projectiles.push(p);
      }
      this.mortarTargets = [];
    }

    _enterPhase(ph: number, platforms: EnemyPlatform[]) {
      const Wc = CONFIG.warden;
      if (ph === 2) {
        this.phaseTag = "UNCHAINED";
        this.searchlights = [];
        for (let i = 0; i < Wc.zoneCount; i++) this.searchlights.push({ kind: "searchlight", x: 260 + i * (CONFIG.view.w - 520) / Math.max(1, Wc.zoneCount - 1),
          w: Wc.zoneW * 0.72, phase: i * 2.1, fullHeight: true, dmg: Wc.zoneTick, tickCd: Wc.zoneTickCd, on: true });
        this._startLockdown();
        bossTransformation(this, { id: "warden-unchained", title: "THE WARDEN UNCHAINS", pose: "wardenRule",
          line: "THE RULES ARE ALL THAT REMAIN.", color: this.color, sfx: "wardenLockdown" });
      } else if (ph === 3) {
        this.phaseTag = "NOTHING LEFT"; this.searchlights = []; this.cages = []; this.trails = []; this._syncZones();
        this.state = "fakedeath"; this.stateT = 2.2;   // The Fake: slump, then rise
        bossTransformation(this, { id: "warden-nothing-left", title: "NOTHING LEFT TO GUARD", pose: "wardenBreak",
          line: "THERE IS NOTHING LEFT TO GUARD.", color: CONFIG.colors.charger, sfx: "wardenLockdown", brief: true });
        // Phase violence enters the same readable fracture lifecycle as standing.
        // Miniboss arenas have no metadata, so this safely becomes a no-op.
        const ow = platforms.filter((p) => p.arenaPlatId && !p.floor && p.arenaState !== "warning");
        const selected = ow[Math.floor(GAME_RANDOM.next() * ow.length)];
        if (selected) selected.arenaFractureRequest = { color: CONFIG.colors.charger, reason: "wardenPhase" };
      }
    }

    override _deathLocked() { return this.phaseMarker < 3 || this.state === "fakedeath"; }   // a huge hit cannot skip the graduation finale
    update(dt: number, platforms: EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      this.tickTimers(dt);
      this._animBaton(dt);
      const Wc = CONFIG.warden, ph = this.phase;
      this._playerRef = player;
      this.facing = Math.sign(player.x - this.x) || this.facing;
      if (ph !== this.phaseMarker) { this._enterPhase(ph, platforms); this.phaseMarker = ph; }
      if (this.cinematicRequest) return;

      // Searchlights sweep instead of teleporting. Lockdown bars and burning dive seams
      // share the generic zone contract consumed by game.js.
      if (this.searchlights.length) {
        for (let i = 0; i < this.searchlights.length; i++) {
          const z = this.searchlights[i]; if (!z) continue;
          z.x = clamp(CONFIG.view.w * 0.5 + Math.sin(this.aliveT * (0.48 + i * 0.07) + (z.phase ?? 0)) * CONFIG.view.w * 0.34,
            z.w / 2, CONFIG.view.w - z.w / 2);
        }
      }
      if (this.lockdownT > 0) { this.lockdownT -= dt; if (this.lockdownT <= 0) this.cages = []; }
      else if (ph === 2) { this.lockdownCd -= dt; if (this.lockdownCd <= 0) this._startLockdown(); }
      for (const z of this.trails) z.life = (z.life ?? 0) - dt;
      this.trails = this.trails.filter((z) => (z.life ?? 0) > 0);
      this._syncZones();

      if (this.introT > 0) {
        const ip = 1 - this.introT / ((CONFIG.bossTheater.introDur) || 1.4);
        if (ip > 0.66 && !this._introBeat) { this._introBeat = true; FX.shockwave(this.x, this.y + this.hh, 10, this.color, 180, 4); }
        this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1)); this.integrate(dt, platforms); return;
      }

      if (this.state === "fakedeath") {
        this.vx = lerp(this.vx, 0, clamp(4 * dt, 0, 1)); this.integrate(dt, platforms);
        this.stateT -= dt;
        if (this.stateT <= 0) { this.onCeiling = true; this.state = "idle"; this.ceilDropT = Wc.ceilDropCd; this.lungeT = Wc.lungeCd; }
        return;
      }
      if (this.onCeiling) { this._ceiling(dt, player, projectiles, Wc); return; }

      // ---- grounded phases (1 & 2) ----
      const footY = this.y + this.hh, dist = Math.abs(player.x - this.x);
      const sp = CONFIG.boss.speed * (1 + (ph - 1) * 0.35);
      if (this.state === "batonlunge") {
        // SHIELD-BATON LUNGE — plant, then hop-strike forward to close on a kiter,
        // flowing straight into a string on arrival
        if (this.beatPh === "wind") {
          this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1)); this.stateT -= dt;
          if (this.stateT <= 0) { this.beatPh = "go"; this.vx = this.facing * Wc.lungeSpeed; this.vy = -420; this.onGround = false; this.batonStrike = 0.4; this.weaponHitSpent = false;
            if (SFX.wardenStaffWhoosh) SFX.wardenStaffWhoosh(); }
        } else {
          this.x += this.vx * dt; this.vx = lerp(this.vx, this.facing * Wc.lungeSpeed * 0.4, clamp(3 * dt, 0, 1));
          if (!this.weaponHitSpent && weaponHullHitsTarget(this.weaponGeometry(), player, 4)) {
            this.weaponHitSpent = true; if (!player.invulnerable) player.takeDamage(Wc.lungeDmg, this.x, this);
          }
          if (this.onGround || this.x <= this.hw + 4 || this.x >= CONFIG.view.w - this.hw - 4) {
            this.x = clamp(this.x, this.hw + 4, CONFIG.view.w - this.hw - 4);
            this.state = "string"; this.stringIdx = 0; this.stringN = ph >= 2 ? 3 : 2; this.beatPh = "wind"; this.stateT = Wc.stringWind; this.beatHeavy = false; this.beatParried = false;
          }
        }
        this.integrate(dt, platforms); return;
      }
      if (this.state === "string") {
        // BATON STRINGS — the posture duel. Each beat: a wind (glint), then an
        // OPEN deflect window (batonStrike), then the swing lands unless it was
        // parried inside the window. P2's finisher beat is unparryable (peril).
        this.vx = lerp(this.vx, this.facing * sp * 1.35, clamp(4 * dt, 0, 1));
        this.stateT -= dt;
        if (this.beatPh === "wind" && this.stateT <= 0) {
          this.beatPh = "open"; this.stateT = Wc.parryWin;
          this.batonStrike = Wc.parryWin + 0.05; this.beatParried = false;
          if (SFX.wardenStaffWhoosh) SFX.wardenStaffWhoosh();
        } else if (this.beatPh === "open" && this.stateT <= 0) {
          if (!this.beatParried && weaponHullHitsTarget(this.weaponGeometry(), player, 3) && !player.invulnerable) {
            player.takeDamage(Wc.stringDmg * (this.beatHeavy ? 1.5 : 1), this.x, this);
            FX.burst(player.x, player.y, this.facing, -0.3, 7, this.color);
            if (this.beatHeavy) { player.vx = this.facing * Wc.bashKnock * 0.85; player.vy = -280; }
          }
          this.stringIdx++;
          if (this.stringIdx >= this.stringN) {
            this.state = "idle"; this.beatHeavy = false;
            this.atkT = Wc.batonCd / (1 + (ph - 1) * 0.3);
          } else {
            this.beatPh = "wind"; this.stateT = Wc.stringWind * (0.8 + GAME_RANDOM.next() * 0.45);   // the rhythm varies — read it
            this.beatHeavy = this.stringIdx === this.stringN - 1 && ph >= 2;
            if (SFX.wardenStaffScrape) SFX.wardenStaffScrape();
            if (this.beatHeavy) perilPing(this);
          }
        }
      } else if (this.state === "windup") {
        this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1)); this.stateT -= dt;
        if (this.stateT <= 0) { this._fire(player, projectiles, footY, Wc); this.state = "idle"; this.atkT = Wc.batonCd / (1 + (ph - 1) * 0.3); }
      } else {
        this.vx = lerp(this.vx, this.facing * sp, clamp(3 * dt, 0, 1));
        this.atkT -= dt;
        this.volleyCd -= dt;
        this.vaultCd -= dt;
        // NO SHELTER: camp a perch too long and the volley comes for it — three
        // shells onto YOUR platform, reticles first
        if (this.campT > Wc.campAfter && this.volleyCd <= 0 && this.campPlat) {
          const pl = this.campPlat;
          this.pendingAtk = "volley"; this.state = "windup"; this.stateT = Wc.batonWindup * 1.25;
          this.mortarTargets = [-1, 0, 1].map((i) => clamp(pl.x + pl.w / 2 + i * Math.min(95, pl.w / 3), pl.x + 16, pl.x + pl.w - 16));
          this.volleyTargetY = pl.y;
          this.volleyCd = Wc.volleyCd; this.campT = 1.2;
          bossFeedback(this, "windup", { banner: "SKYWARD VOLLEY", color: this.color, quiet: true });
        }
        else if (this.atkT <= 0) {
          // his kit is MELEE + ARTILLERY now: in reach he opens a string; at mid
          // range he LUNGES to close on a kiter; far out the mortars arc in
          if (dist < Wc.stringRange) {
            this.state = "string"; this.stringIdx = 0; this.stringN = ph >= 2 ? 3 : 2;
            this.beatPh = "wind"; this.stateT = Wc.stringWind; this.beatHeavy = false; this.beatParried = false;
            if (SFX.wardenStaffScrape) SFX.wardenStaffScrape();
          } else if (dist < Wc.lungeRange && GAME_RANDOM.next() < 0.55) {
            this.state = "batonlunge"; this.beatPh = "wind"; this.stateT = Wc.lungeWind;
            this.facing = Math.sign(player.x - this.x) || this.facing;
            if (SFX.wardenStaffScrape) SFX.wardenStaffScrape();
          } else {
            this.pendingAtk = "mortar"; this.state = "windup"; this.stateT = Wc.batonWindup;
            this.mortarTargets = [-1, 0, 1].map((i) => clamp(player.x + i * 180, 60, CONFIG.view.w - 60));
          }
        }
        // Every grounded phase can vault; committed perch use makes it targeted,
        // while sparse footwork jumps keep the Warden from becoming floor-bound.
        const targetVault = this.campT > Wc.vaultPerchAfter ? this.campPlat : null;
        if (ph <= 2 && this.onGround && this.vaultCd <= 0 && (targetVault || GAME_RANDOM.next() < 0.36 * dt)) {
          this.vy = -1150; this.onGround = false;
          if (targetVault) this.vx = (targetVault.x + targetVault.w / 2 - this.x) * 1.1;
          this.vaultCd = Wc.vaultCd;
        }
      }
      this.integrate(dt, platforms);
    }

    // artillery only — his melee lives in the string state now (no ground waves)
    _fire(player: EnemyPlayerPort, projectiles: EnemyProjectile[], footY: number, wardenConfig: typeof CONFIG.warden) {
      void footY; void wardenConfig;
      if (this.pendingAtk === "volley") this._mortar(player, projectiles, this.volleyTargetY);
      else this._mortar(player, projectiles);
      this.batonStrike = 0.18;   // the launch gesture still snaps the baton (parry it for posture)
      this.mortarKickT = 0.2; this.batonAV += this.facing * 7;
      bossFeedback(this, "launch", { color: this.color });
    }

    onProjectileGroundImpact(p: EnemyProjectile) {
      const col = p.bossAttack === "mortar" ? this.color : CONFIG.colors.charger;
      const impactY = p.landingY ?? CONFIG.world.groundY;
      FX.explode(p.x, impactY, col, p.bossAttack === "mortar" ? 0.8 : 0.55);
      bossFeedback(this, "contact", { color: col });
      const pl = this._playerRef;
      if (pl && Math.abs(pl.x - p.x) < 62 + pl.hw && Math.abs(pl.y + pl.hh - impactY) < 95) pl.takeDamage(p.dmg ?? CONFIG.warden.debrisDmg, p.x, this);
    }

    _ceiling(dt: number, player: EnemyPlayerPort, projectiles: EnemyProjectile[], Wc: typeof CONFIG.warden) {
      this.onGround = false;
      if (this.state === "lungewind") {             // hang, lock onto a spot, telegraph the dive
        this.lungeWT -= dt;
        this.vx = lerp(this.vx, 0, clamp(6 * dt, 0, 1));
        this.x = clamp(this.x + this.vx * dt, this.hw, CONFIG.view.w - this.hw);
        if (this.lungeWT <= 0) {
          this.state = "lunge";
          this.weaponHitSpent = false;
          const m = len(this.diveTX - this.x, this.diveTY - this.y) || 1;
          this.vx = (this.diveTX - this.x) / m * Wc.lungeSpeed;
          this.vy = (this.diveTY - this.y) / m * Wc.lungeSpeed;
          if (SFX.wardenStaffWhoosh) SFX.wardenStaffWhoosh();
        }
        return;
      }
      if (this.state === "lunge") {                 // committed diagonal dive toward the locked spot
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (!this.weaponHitSpent && weaponHullHitsTarget(this.weaponGeometry(), player, 5)) {
          this.weaponHitSpent = true; if (!player.invulnerable) player.takeDamage(Wc.lungeDmg, this.x, this);
        }
        this.trailDropT -= dt;
        if (this.trailDropT <= 0) {
          this.trailDropT = 0.11;
          this.trails.push({ kind: "trail", x: this.x, w: 82, life: Wc.trailLife, maxLife: Wc.trailLife, dmg: Wc.zoneTick, tickCd: Wc.zoneTickCd, on: true });
          FX.ember(this.x, this.y, CONFIG.colors.charger);
        }
        const gy = CONFIG.world.groundY;
        if (this.x <= this.hw + 4 || this.x >= CONFIG.view.w - this.hw - 4 || this.y >= gy - this.hh) {
          this.y = Math.min(this.y, gy - this.hh); this.state = "idle"; this.lungeT = Wc.lungeCd;
        }
        return;
      }
      this.lungeT -= dt;
      if (this.lungeT <= 0) {                        // commit: lock the target now, dive after a readable wind-up
        this.state = "lungewind"; this.lungeWT = Wc.lungeWindup || 0.5;
        this.diveTX = clamp(player.x, this.hw, CONFIG.view.w - this.hw); this.diveTY = player.y;
        perilPing(this); this.trailDropT = 0;
        return;
      }
      // glide along the ceiling toward the player
      this.y = lerp(this.y, Wc.ceilingY, clamp(2.5 * dt, 0, 1));
      this.vx = lerp(this.vx, (player.x - this.x) * 1.1, clamp(1.5 * dt, 0, 1));
      this.x = clamp(this.x + this.vx * dt, this.hw, CONFIG.view.w - this.hw);
      this.ceilDropT -= dt;
      if (this.ceilDropT <= 0) {                    // marked ceiling debris: read the landing, then move
        for (const off of [-150, 0, 150]) {
          const tx = clamp(player.x + off, 50, CONFIG.view.w - 50);
          const p = new Projectile(tx, 36, 0, 80);
          p.gravity = Wc.debrisGravity; p.dmg = Wc.debrisDmg; p.r = 13; p.owner = this;
          p.tint = CONFIG.colors.charger; p.landingX = tx; p.landingY = CONFIG.world.groundY;
          p.landingT = 0.82; p.groundImpact = true; p.bossAttack = "debris"; projectiles.push(p);
        }
        this.ceilDropT = Wc.ceilDropCd;
      }
    }
  }

  return Warden;
}

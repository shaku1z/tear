import type { EnemyDependencies, ArenaZone, EnemyPlatform, EnemyPlayerPort, EnemyProjectile, Point } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import type { BossRuntime } from "./boss-runtime";
import type { ThroneFireRuntime } from "./throne-fire";

export function createAldricType(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor, bossRuntime: BossRuntime, throneFireRuntime: ThroneFireRuntime) {
  const { CONFIG, FX, Projectile, SFX, clamp, cosmeticRandom, lerp } = dependencies;
  const { bossFeedback, bossPhaseBeat, bossTransformation, perilPing, springWeapon, greatCleaverPose, weaponHullHitsTarget, weaponDebugGeometry } = bossRuntime;
  const { clearThroneFire, startThroneFire, tickThroneFire } = throneFireRuntime;
  interface CrownPose extends Point { rot: number }

  class Aldric extends Enemy {
    mode: string; state: string; stateT: number; zones: ArenaZone[]; zoneColor: string;
    zoneCycleT: number; spawnAdds: boolean; faked: boolean; reviveCap: number; chargeT: number;
    weaponHitSpent: boolean; weaponEmberT: number; weaponImpactT: number; weaponBuriedT: number;
    weaponReclaimT: number; fireZones: ArenaZone[]; seams: ArenaZone[]; firePattern: number;
    fireState: string; fireClock: number; fireWarnStep: number; kneelT: number; kneelStruck: boolean;
    anger: boolean; crownWorn: boolean; crown: (CrownPose & { vx: number; vy: number; state: string; heat: number; restPlatform?: EnemyPlatform | null }) | null;
    crownHeat: number; crownfireCd: number; chainLeft: number; ghostT: number; seamDropT: number;
    _playerRef: EnemyPlayerPort | null; witnessEarned: boolean; overheadCd: number; overTX: number;
    verticalCd: number; verticalTrackT: number; verticalIndex: number; verticalTarget: EnemyPlatform | null;
    verticalTargetX: number; verticalTargetY: number; verticalStartX: number; verticalStartY: number;
    verticalMaxT: number; verticalHitSpent: boolean; echoCaption = ""; introT = 0; aboveT = 0;
    campPlat: EnemyPlatform | null = null; debugGeometry: { a: Point; b: Point; radius: number }[] = [];
    declare cfg: typeof CONFIG.aldric;

    constructor(x: number, y: number) {
      super(x, y, CONFIG.aldric);
      this.color = CONFIG.colors.charger;
      this.kind = "boss"; this.isBoss = true; this.bossName = "ALDRIC";
      this.presentationId = "aldric";
      this.epithet = "THE BERSERKER KING"; this.phaseMarks = [0.65, 0.20]; this.phaseTag = "THE DUEL";
      this.mode = "duel"; this.state = "idle"; this.stateT = 0; this.atkT = 1.6; this.facing = 1;
      this.zones = []; this.zoneColor = CONFIG.colors.bomber; this.zoneCycleT = 0;
      this.spawnAdds = false; this.faked = false; this.reviveCap = 0; this.chargeT = 0;
      this.weaponA = -0.6; this.weaponPrevA = -0.6; this.weaponAV = 0;
      this.weaponHitSpent = false; this.weaponEmberT = 0; this.weaponImpactT = 0; this.weaponBuriedT = 0; this.weaponReclaimT = 0;
      this.fireZones = []; this.seams = []; this.firePattern = 0; this.fireState = "idle"; this.fireClock = 0; this.fireWarnStep = -1;
      this.kneelT = 0; this.kneelStruck = false; this.anger = false;
      this.crownWorn = true; this.crown = null; this.crownHeat = 0;
      this.crownfireCd = CONFIG.aldric.crownfireCd; this.chainLeft = 0; this.ghostT = 0; this.seamDropT = 0;
      this._playerRef = null; this.witnessEarned = false;
      this.overheadCd = CONFIG.aldric.overheadCd; this.overTX = 0;   // OVERHEAD CLEAVER
      this.verticalCd = CONFIG.aldric.verticalCdDuel * 0.55; this.verticalTrackT = 0; this.verticalIndex = 0;
      this.verticalTarget = null; this.verticalTargetX = x; this.verticalTargetY = y;
      this.verticalStartX = x; this.verticalStartY = y; this.verticalMaxT = 0; this.verticalHitSpent = false;
    }
    override damageTakenMult() { return this.mode === "frenzy" ? CONFIG.aldric.frenzyDmgTaken : (this.mode === "downed" ? CONFIG.aldric.downedDmgTaken : 1); }
    _buriedWeaponOrigin() { return { x: this.x + this.facing * 88, y: CONFIG.world.groundY - 44 }; }
    weaponGeometry(angle?: number | null, prevAngle?: number | null, origin?: Point | null) {
      let a = angle ?? this.weaponA, pa = prevAngle ?? this.weaponPrevA, o = origin;
      if (!o && this.mode === "downed") { o = this._buriedWeaponOrigin(); a = -1.36; pa = a; }
      else if (!o && this.weaponReclaimT > 0) {
        const k = clamp(1 - this.weaponReclaimT / 0.55, 0, 1), buried = this._buriedWeaponOrigin();
        const hand = { x: this.x + this.facing * this.hw * 0.08, y: this.y - 2 };
        o = { x: lerp(buried.x, hand.x, k), y: lerp(buried.y, hand.y, k) }; a = lerp(-1.36, a, k); pa = a;
      }
      return greatCleaverPose(this, a, pa, o);
    }
    override contactDamageEnabled() { return !["lunge", "overhead", "royalvault", "ascend", "thronefall"].includes(this.state); }
    // during the fake he can't be killed (hit OR DoT) — he always rises into the frenzy
    override _deathLocked() { return this.mode === "downed"; }
    override hit(dmg: number, knockX: number, knockY: number) {
      if (this.mode === "downed" && dmg > 0 && !this.kneelStruck) {
        this.kneelStruck = true; this.anger = true;
        this.reviveCap = this.maxHp * CONFIG.aldric.angerReviveFrac;
        this.kneelT = Math.min(this.kneelT, 2.2);
        bossFeedback(this, "counter", { banner: "THE KING REMEMBERS", color: CONFIG.colors.charger, quiet: true });
      }
      return super.hit(dmg, knockX, knockY);
    }

    _shock(projectiles: EnemyProjectile[], dir: number, fire: boolean) {
      const C = CONFIG.aldric, footY = this.y + this.hh;
      const p = new Projectile(this.x + dir * this.hw * 0.7, footY - C.shockR, dir * C.shockSpeed, 0);
      p.setFamily("groundShock"); p.r = C.shockR; p.dmg = C.shockDmg; p.life = 2.0; p.owner = this;
      p.tint = fire ? CONFIG.colors.bomber : CONFIG.colors.charger; p.crownfire = fire;
      projectiles.push(p);
    }
    _lightFire(preservePattern = false) { startThroneFire(this, preservePattern); }
    _syncZones() { this.zones = this.fireZones.concat(this.seams); }
    override onDeathStart() { clearThroneFire(this, true); this.seams = []; this._syncZones(); }

    _wornCrownPose() {
      const recoil = (this.state === "windup" || this.state === "chargewind" || this.state === "ascendwind") ? -this.facing * 7 : 0;
      const rise = ["royalvault", "ascend", "thronewind", "thronefall"].includes(this.state) ? -5 : 0;
      return { x: this.x + recoil, y: this.y - this.hh - 8 + rise, rot: clamp(this.vx / 1700, -0.16, 0.16) + this.weaponAV * 0.004 };
    }
    _verticalCooldown() {
      const C = CONFIG.aldric;
      const base = this.mode === "frenzy" ? C.verticalCdFrenzy : (this.mode === "fire" ? C.verticalCdFire : C.verticalCdDuel);
      return base * (this.crownWorn ? 1 : 0.76);
    }
    _chooseVerticalTarget(player: EnemyPlayerPort, platforms: readonly EnemyPlatform[]) {
      const feet = this.y + this.hh, playerFeet = player.y + player.hh;
      const playerPlat = player.supportPlatform ?? platforms.find((p) => p.oneway && Math.abs(playerFeet - p.y) < 9 &&
        player.x + player.hw > p.x && player.x - player.hw < p.x + p.w);
      let best = null, score = Infinity;
      for (const p of platforms) {
        if (!p.oneway || p.floor || p.materializationState === "gone" || p.arenaState === "warning" || p.arenaState === "reforming") continue;
        if (p.y >= feet - 24 || feet - p.y > 330) continue;
        const center = p.x + p.w / 2, occupied = p === playerPlat ? -420 : 0;
        const stress = (p.stress ?? 0) * 120, height = Math.abs(p.y - (player.y + player.hh));
        const s = Math.abs(center - player.x) * 0.65 + Math.abs(center - this.x) * 0.28 + height + stress + occupied;
        if (s < score) { score = s; best = p; }
      }
      return best;
    }
    _startVertical(kind: string, target: EnemyPlatform, player: EnemyPlayerPort) {
      const C = CONFIG.aldric;
      this.verticalTarget = target; this.verticalStartX = this.x; this.verticalStartY = this.y;
      this.verticalTargetX = clamp(player.x, target.x + this.hw + 10, target.x + target.w - this.hw - 10);
      this.verticalTargetY = target.y - this.hh; this.verticalHitSpent = false; this.vx = 0; this.vy = 0; this.onGround = false;
      const feral = this.crownWorn ? 1 : 0.78;
      if (kind === "vault") { this.state = "vaultwind"; this.stateT = C.vaultWindup * feral; this.echoCaption = "ROYAL VAULT"; }
      else if (kind === "ascend") { this.state = "ascendwind"; this.stateT = C.ascendWindup * feral; this.echoCaption = "CLEAVER ASCENSION"; }
      else { this.state = "thronewind"; this.stateT = C.thronefallWindup * feral; this.echoCaption = "THRONEFALL"; }
      this.verticalMaxT = this.stateT; this.verticalCd = this._verticalCooldown(); this.verticalTrackT = 0;
      perilPing(this); bossFeedback(this, "windup", { banner: this.echoCaption, color: CONFIG.colors.bomber, quiet: true });
    }
    _landVertical(kind: string, player: EnemyPlayerPort) {
      const C = CONFIG.aldric, p = this.verticalTarget;
      if (!p) return;
      this.x = clamp(this.verticalTargetX, p.x + this.hw, p.x + p.w - this.hw); this.y = p.y - this.hh;
      this.vx = 0; this.vy = 0; this.onGround = true;
      const hard = kind === "thronefall", range = hard ? C.thronefallRange : C.vaultRange;
      const dmg = (hard ? C.thronefallDmg : C.vaultDmg) * (this.crownWorn ? 1 : 1.12);
      if (Math.abs(player.x - this.x) < range + player.hw && Math.abs((player.y + player.hh) - p.y) < 130 && !player.invulnerable) player.takeDamage(dmg, this.x, this);
      if (p.arenaPlatId) {
        p.stress = Math.min(CONFIG.bossArena.standBeforeWarn, (p.stress ?? 0) + (hard ? CONFIG.bossArena.standBeforeWarn : C.vaultStress));
        p.stressDelay = CONFIG.bossArena.stressDrainDelay;
        if (hard) p.arenaFractureRequest = { reason: "thronefall", color: CONFIG.colors.bomber };
      }
      FX.shockwave(this.x, p.y, 12, CONFIG.colors.bomber, hard ? 300 : 205, hard ? 7 : 5);
      FX.burst(this.x, p.y, 0, -1, hard ? 14 : 8, CONFIG.colors.bomber);
      bossFeedback(this, "contact", { banner: hard ? "THRONEFALL" : "ROYAL IMPACT", color: CONFIG.colors.bomber, quiet: true, shake: hard ? 10 : 6 });
      this.weaponImpactT = hard ? 0.25 : 0.14; this.state = "recover";
      this.stateT = (hard ? C.thronefallRecover : C.vaultRecover) * (this.crownWorn ? 1 : 0.74);
    }
    _tickVertical(dt: number, _platforms: readonly EnemyPlatform[], player: EnemyPlayerPort) {
      const C = CONFIG.aldric, p = this.verticalTarget;
      if (!p) { this.state = "idle"; this.verticalCd = 0.5; return true; }
      if (this.state === "vaultwind" || this.state === "ascendwind" || this.state === "thronewind") {
        this.stateT -= dt;
        const k = 1 - clamp(this.stateT / (this.verticalMaxT || 1), 0, 1);
        if (this.state === "thronewind") {
          this.x = lerp(this.verticalStartX, this.verticalTargetX, k);
          this.y = lerp(this.verticalStartY, this.verticalTargetY - C.thronefallRise, k * k * (3 - 2 * k));
        }
        if (this.stateT <= 0) {
          if (this.state === "vaultwind") { this.state = "royalvault"; this.stateT = C.vaultFlight * (this.crownWorn ? 1 : 0.82); }
          else if (this.state === "ascendwind") { this.state = "ascend"; this.stateT = C.ascendFlight * (this.crownWorn ? 1 : 0.82); }
          else { this.state = "thronefall"; this.stateT = 1.2; this.vy = C.thronefallSpeed * (this.crownWorn ? 1 : 1.15); }
          this.verticalMaxT = this.stateT; bossFeedback(this, "launch", { quiet: true, color: CONFIG.colors.bomber });
        }
        return true;
      }
      if (this.state === "royalvault" || this.state === "ascend") {
        this.stateT -= dt;
        const k = 1 - clamp(this.stateT / (this.verticalMaxT || 1), 0, 1), smooth = k * k * (3 - 2 * k);
        const adjust = clamp(player.x - this.verticalTargetX, -C.vaultAdjust, C.vaultAdjust) * dt;
        this.verticalTargetX = clamp(this.verticalTargetX + adjust, p.x + this.hw + 8, p.x + p.w - this.hw - 8);
        this.x = lerp(this.verticalStartX, this.verticalTargetX, smooth);
        this.y = lerp(this.verticalStartY, this.verticalTargetY, smooth) - (this.state === "royalvault" ? Math.sin(k * Math.PI) * C.vaultArc : Math.sin(k * Math.PI) * 34);
        if (this.state === "ascend" && !this.verticalHitSpent && Math.abs(player.x - this.x) < C.ascendHalfW + player.hw && player.y < this.verticalStartY && player.y > this.verticalTargetY - 100) {
          this.verticalHitSpent = true; if (!player.invulnerable) player.takeDamage(C.ascendDmg, this.x, this);
        }
        if (this.stateT <= 0) {
          if (this.state === "ascend") {
            this.x = clamp(this.verticalTargetX, p.x + this.hw, p.x + p.w - this.hw); this.y = p.y - this.hh; this.vx = 0; this.vy = 0; this.onGround = true;
            p.stress = Math.min(CONFIG.bossArena.standBeforeWarn, (p.stress ?? 0) + C.vaultStress * 0.45); p.stressDelay = CONFIG.bossArena.stressDrainDelay;
            this.state = "recover"; this.stateT = C.ascendRecover; bossFeedback(this, "contact", { quiet: true, color: CONFIG.colors.bomber });
          } else this._landVertical("vault", player);
        }
        return true;
      }
      if (this.state === "thronefall") {
        this.stateT -= dt; this.y += this.vy * dt; this.vy += 1700 * dt;
        if (this.y + this.hh >= p.y || this.stateT <= 0) this._landVertical("thronefall", player);
        return true;
      }
      return false;
    }

    update(dt: number, platforms: EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      this.tickTimers(dt);
      const C = CONFIG.aldric;
      this._playerRef = player;
      this.facing = Math.sign(player.x - this.x) || this.facing;
      this._animWeapon(dt);
      const f = this.hp / this.maxHp;
      this.crownHeat = clamp((C.fireTier - f) / Math.max(0.01, C.fireTier - C.fakeTier), 0, 1);
      if (this.mode === "duel" && f < C.fireTier) {
        this.mode = "fire"; this.phaseTag = "THRONE BURNS"; this._lightFire();
        bossPhaseBeat(this, "THE THRONE BURNS", CONFIG.colors.bomber);
      }
      if (this.mode === "fire" && f < C.fakeTier && !this.faked) { this._enterDowned(); }
      if (this.cinematicRequest) return;
      tickThroneFire(this, dt);
      for (const z of this.seams) z.life = (z.life ?? 0) - dt;
      this.seams = this.seams.filter((z) => (z.life ?? 0) > 0); this._syncZones();
      if (this.crown) {
        const rest = this.crown.restPlatform;
        if (this.crown.state === "fallen" && rest && platforms.includes(rest)) {
          this.crown.y = rest.y - 10; this.crown.vx = 0; this.crown.vy = 0;
        } else {
          if (this.crown.state === "fallen" && rest && !platforms.includes(rest)) { this.crown.state = "airborne"; this.crown.restPlatform = null; }
          this.crown.vy += CONFIG.world.gravity * dt; this.crown.x += this.crown.vx * dt; this.crown.y += this.crown.vy * dt; this.crown.rot += this.crown.vx * dt * 0.018;
          const floor = CONFIG.world.groundY - 8;
          if (this.crown.y > floor) {
            this.crown.y = floor; this.crown.vy *= -0.25; this.crown.vx *= 0.86;
            if (Math.abs(this.crown.vy) < 55) { this.crown.vy = 0; this.crown.vx *= 0.72; this.crown.state = "fallen"; }
          }
        }
      }

      if (this.introT > 0) { this.vx = 0; this.integrate(dt, platforms); return; }

      if (this.mode === "downed") {   // the kneel: strike, or stand witness
        this.vx = lerp(this.vx, 0, clamp(6 * dt, 0, 1));
        const regen = C.regenRate * (this.kneelStruck ? C.angerRegenMult : 1);
        this.hp = Math.min(this.reviveCap, this.hp + this.maxHp * regen * dt);
        this.kneelT -= dt;
        this.integrate(dt, platforms);
        if (this.kneelT <= 0) this.revive(!this.kneelStruck);
        return;
      }

      if (["vaultwind", "royalvault", "ascendwind", "ascend", "thronewind", "thronefall"].includes(this.state)) {
        this._tickVertical(dt, platforms, player); return;
      }
      this.verticalCd -= dt;

      const spd = C.speed * (this.mode === "frenzy" ? 1.5 : (this.mode === "fire" ? 1.2 : 1));
      if (this.mode === "frenzy") {
        this.chargeT -= dt; this.crownfireCd -= dt; this.ghostT -= dt;
        if (this.ghostT <= 0) { this.ghostT = 0.11; FX.ghost(this.x, this.y, this.hw, this.hh, CONFIG.colors.bomber); }
        if (this.crownfireCd <= 0 && this.state === "idle") { this.state = "crownfire"; this.stateT = C.crownfireWindup; this.crownfireCd = C.crownfireCd; }
        else if (this.chargeT <= 0 && this.state === "idle") { this.state = "chargewind"; this.stateT = C.chargeWindup; this.chargeT = C.chargeCd / (this.anger ? 1.35 : 1); }
      }

      if (this.state === "crownfire") {
        this.stateT -= dt;
        const k = 1 - clamp(this.stateT / C.crownfireWindup, 0, 1), gy = CONFIG.world.groundY - this.hh;
        this.x = lerp(this.x, CONFIG.view.w / 2, clamp(6 * dt, 0, 1)); this.y = gy - Math.sin(k * Math.PI) * 190;
        if (this.stateT <= 0) {
          this.x = CONFIG.view.w / 2; this.y = gy; this._shock(projectiles, 1, true); this._shock(projectiles, -1, true);
          for (let i = 0; i < 7; i++) {
            const a = Math.PI + i / 6 * Math.PI, p = new Projectile(this.x, this.y - 35, Math.cos(a) * C.emberSpeed, Math.sin(a) * C.emberSpeed - 120);
            p.gravity = 520; p.dmg = C.emberDmg; p.r = 10; p.tint = CONFIG.colors.bomber; p.kind = "orb"; p.crownfire = true; p.owner = this; projectiles.push(p);
          }
          FX.explode(this.x, this.y + this.hh, CONFIG.colors.bomber, 1.35);
          bossFeedback(this, "contact", { banner: "CROWNFIRE", color: "#fff7d6", priority: 9, shake: 11, flash: 0.38, slowmo: 0.38, zoom: 0.065, cue: "aldricIgnite" });
          this.state = "recover"; this.stateT = 0.45;
        }
        return;
      }

      if (this.state === "chargewind") {            // plant, roar, telegraph the lane — then explode forward
        this.vx = lerp(this.vx, 0, clamp(9 * dt, 0, 1)); this.stateT -= dt;
        if (this.stateT <= 0) { this.state = "charge"; this.vx = this.facing * C.chargeSpeed; }
        this.integrate(dt, platforms);
        return;
      }
      if (this.state === "overheadwind") {          // OVERHEAD CLEAVER: rise, track the player, then plunge
        this.stateT -= dt;
        this.x = lerp(this.x, clamp(this.overTX, this.hw, CONFIG.view.w - this.hw), clamp(4 * dt, 0, 1));
        this.y = lerp(this.y, CONFIG.world.groundY - this.hh - 150, clamp(6 * dt, 0, 1)); this.onGround = false;
        if (this.stateT <= 0) { this.state = "overhead"; this.vy = 2500; }
        return;
      }
      if (this.state === "overhead") {
        this.y += this.vy * dt; this.vy += 2500 * dt;
        if (this.y >= CONFIG.world.groundY - this.hh) {
          this.y = CONFIG.world.groundY - this.hh; this.onGround = true;
          if (Math.abs(player.x - this.x) < C.overheadRange && !player.invulnerable) player.takeDamage(C.overheadDmg, this.x, this);
          this.seams.push({ kind: "seam", x: this.x, w: 110, life: C.seamLife, maxLife: C.seamLife, dir: this.facing, on: true, dmg: CONFIG.warden.zoneTick, tickCd: CONFIG.warden.zoneTickCd });
          FX.explode(this.x, this.y + this.hh, CONFIG.colors.bomber, 1.3); FX.shockwave(this.x, this.y + this.hh, 12, CONFIG.colors.bomber, 240, 6);
          bossFeedback(this, "contact", { banner: "OVERHEAD", color: CONFIG.colors.bomber, priority: 8, shake: 10, slowmo: 0.35, zoom: 0.05 });
          this.weaponImpactT = 0.24; this.weaponBuriedT = C.overheadRecover;
          this.state = "recover"; this.stateT = C.overheadRecover;
          if (SFX.aldricCleaverBury) SFX.aldricCleaverBury();
        }
        return;
      }
      if (this.state === "charge") {
        this.x += this.vx * dt;
        this.seamDropT -= dt;
        if (this.seamDropT <= 0) { this.seamDropT = 0.12; this.seams.push({ kind: "seam", x: this.x, w: 76, life: C.seamLife, maxLife: C.seamLife, dir: Math.sign(this.vx) || this.facing, on: true, dmg: CONFIG.warden.zoneTick, tickCd: CONFIG.warden.zoneTickCd }); }
        if (cosmeticRandom() < 16 * dt) FX.ember(this.x, CONFIG.world.groundY - 5, CONFIG.colors.bomber);
        if (this.x <= this.hw + 4 || this.x >= CONFIG.view.w - this.hw - 4) { this.state = "recover"; this.stateT = 0.7; }
        return;
      }
      if (this.state === "windup") {
        this.vx = lerp(this.vx, 0, clamp(9 * dt, 0, 1)); this.stateT -= dt;
        if (this.stateT <= 0) this._strike(player, projectiles);
      } else if (this.state === "lunge") {
        const bladePose = this.weaponGeometry();
        if (!this.weaponHitSpent && weaponHullHitsTarget(bladePose, player, 4)) {
          this.weaponHitSpent = true; if (!player.invulnerable) player.takeDamage(C.shockDmg, this.x, this);
        }
        this.weaponEmberT -= dt;
        if (this.mode !== "duel" && this.weaponEmberT <= 0) { this.weaponEmberT = 0.045; FX.ember(bladePose.tip.x, bladePose.tip.y, CONFIG.colors.bomber); }
        this.stateT -= dt; if (this.stateT <= 0) { this.state = "recover"; this.stateT = 0.35; }
      } else if (this.state === "recover") {
        this.vx = lerp(this.vx, 0, clamp(7 * dt, 0, 1)); this.stateT -= dt;
        if (this.stateT <= 0) {
          if (this.chainLeft > 0) { this.chainLeft--; this.state = "windup"; this.stateT = C.windup * 0.58; }
          else this.state = "idle";
        }
      } else {
        const dist = Math.abs(player.x - this.x);
        const duelDir = this.mode === "duel" && dist < 190 ? -this.facing : this.facing;
        this.vx = lerp(this.vx, duelDir * spd, clamp(4 * dt, 0, 1));
        this.overheadCd = (this.overheadCd || 0) - dt;
        const elevated = player.y + player.hh < this.y - 54 || !!this.campPlat;
        this.verticalTrackT = elevated ? this.verticalTrackT + dt : Math.max(0, this.verticalTrackT - dt * 1.8);
        const target = this.onGround && this.verticalCd <= 0 && this.verticalTrackT >= C.verticalResponse ? this._chooseVerticalTarget(player, platforms) : null;
        // OVERHEAD CLEAVER — a committed vertical slam (fire/frenzy), his kingliest
        // blow; complements the horizontal lunges + arcs
        if (target) {
          const direct = Math.abs(player.x - this.x) < C.ascendHalfW * 1.55;
          let kind = direct ? "ascend" : "vault";
          if (this.mode !== "duel" && !direct && this.verticalIndex % 3 === 2) kind = "thronefall";
          this.verticalIndex++; this._startVertical(kind, target, player); return;
        } else if (this.mode !== "duel" && this.overheadCd <= 0 && dist < 420 && this.onGround) {
          this.state = "overheadwind"; this.stateT = C.overheadWindup; this.overTX = player.x;
          this.overheadCd = C.overheadCd; perilPing(this);
        } else {
          this.atkT -= dt;
          if (this.atkT <= 0 && Math.abs(player.x - this.x) < 500) { this.state = "windup"; this.stateT = C.windup; }
        }
        // NO SHELTER: hover above the king and the pounce COMES — deterministic,
        // not a dice roll (tracks time-spent-above, leaps at the player)
        this.aboveT = (player.y < this.y - 60) ? (this.aboveT || 0) + dt : 0;
        if (this.onGround && this.aboveT > (C.pounceAfter || 1)) {
          this.vy = -1120; this.vx = (player.x - this.x) * 1.1; this.onGround = false; this.aboveT = 0;
        }
      }
      this.integrate(dt, platforms);
    }
    _strike(_player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      const C = CONFIG.aldric;
      // his kit is the CLEAVER now, not ground waves: in reach the lunge IS the
      // strike; out of reach he hurls burning CLEAVER ARCS (crescents — parry
      // food, i.e. rally fuel)
      if (Math.abs(this._playerRef ? this._playerRef.x - this.x : 999) > 235) {
        this._arc(projectiles, this.mode === "frenzy" ? 2 : 1);
      }
      this.state = "lunge"; this.stateT = 0.25; this.vx = this.facing * C.lungeSpeed; this.weaponHitSpent = false;
      if (this.mode === "fire" && this.chainLeft <= 0) this.chainLeft = 1;
      if (this.mode === "frenzy" && this.chainLeft <= 0) this.chainLeft = this.anger ? 2 : 1;
      this.atkT = C.atkCd / (this.mode === "frenzy" ? 1.7 : (this.mode === "fire" ? 1.25 : 1));
      if (SFX.aldricCleaverWhoosh) SFX.aldricCleaverWhoosh();
    }
    // a burning crescent thrown along the lunge line — arcs with gravity, fully
    // parryable/deflectable through the game's own projectile loop
    _arc(projectiles: EnemyProjectile[], n: number) {
      const C = CONFIG.aldric;
      for (let i = 0; i < n; i++) {
        const p = new Projectile(this.x + this.facing * 34, this.y - 24 - i * 16,
          this.facing * C.arcSpeed * (1 - i * 0.12), -C.arcRise - i * 70);
        p.crescent = true; p.kind = "crescent"; p.tint = CONFIG.colors.bomber;
        p.dmg = C.arcDmg; p.r = 24; p.gravity = C.arcGravity; p.deflectDmg = 30; p.owner = this;
        projectiles.push(p);
      }
      FX.ring(this.x + this.facing * 28, this.y - 20, 10, CONFIG.colors.bomber);
      try { SFX.crescent(); } catch { /* audio feedback is best-effort */ }   // the cleaver tears the air
    }
    _enterDowned() {
      const C = CONFIG.aldric;
      const crownPose = this._wornCrownPose();
      this.mode = "downed"; this.state = "idle"; this.spawnAdds = false; this.kneelT = C.kneelDur; this.kneelStruck = false; this.anger = false;
      this.weaponReclaimT = 0; this.weaponBuriedT = 0; this.weaponAV = 0;
      this.reviveCap = this.maxHp * C.witnessReviveFrac; this.vx = 0; this.seams = []; clearThroneFire(this, true); this._syncZones();
      this.crownWorn = false;
      this.crown = { x: crownPose.x, y: crownPose.y, vx: this.facing * 330, vy: -420, rot: crownPose.rot, state: "airborne", heat: this.crownHeat };
      this.phaseTag = "THE KNEEL";
      bossTransformation(this, { id: "aldric-crownfall", title: "THE CROWN FALLS", pose: "aldricCrownfall",
        line: "A THRONE IS ONLY WOOD.", color: CONFIG.colors.bomber, sfx: "aldricIgnite", crownFall: true });
    }
    revive(witnessed = false) {
      this.mode = "frenzy"; this.faked = true; this.state = "idle"; this.atkT = 0.35; this.phaseTag = witnessed ? "WITNESSED" : "FRENZY";
      this.weaponReclaimT = 0.55; this.weaponAV = 0;
      this.chargeT = CONFIG.aldric.chargeCd * 0.45; this.crownfireCd = CONFIG.aldric.crownfireCd * 0.55;
      if (witnessed) { this.witnessEarned = true; this.hp = Math.min(this.hp, this.maxHp * CONFIG.aldric.witnessReviveFrac); }
      else { this.anger = true; this.hp = Math.max(this.hp, this.maxHp * CONFIG.aldric.angerReviveFrac); this.contactDmg *= CONFIG.aldric.angerDamageMult; }
      this._lightFire(true);
      bossTransformation(this, { id: witnessed ? "aldric-witnessed" : "aldric-angered",
        title: witnessed ? "THE LAST CROWN RISES" : "THE BEAST AWAKES", pose: "aldricFeral",
        line: witnessed ? "A KING NEEDS NO THRONE." : "YOU CHOSE THE BEAST.", color: CONFIG.colors.bomber,
        sfx: "aldricIgnite", brief: true, firstVertical: true });
    }
    _animWeapon(dt: number) {
      let wt = -0.6, k = 9;
      if (this.state === "overheadwind" || this.state === "thronewind") { wt = -2.1; k = 12; }   // cleaver raised straight overhead
      else if (this.state === "overhead" || this.state === "thronefall") { wt = 1.4; k = 34; }   // driven down on the plunge
      else if (this.state === "windup" || this.state === "chargewind" || this.state === "ascendwind") { wt = -1.5; k = 11; }
      else if (this.state === "lunge" || this.state === "charge" || this.state === "ascend") { wt = 0.8; k = 28; }
      else if (this.state === "vaultwind") { wt = -0.2; k = 15; }
      else if (this.state === "royalvault") { wt = 0.25; k = 20; }
      else if (this.state === "recover" && this.weaponBuriedT > 0) { wt = 1.28; k = 18; }
      if (this.weaponImpactT > 0) { this.weaponImpactT = Math.max(0, this.weaponImpactT - dt); wt += Math.sin(this.weaponImpactT * 95) * this.weaponImpactT * 0.32; }
      if (this.weaponBuriedT > 0) this.weaponBuriedT = Math.max(0, this.weaponBuriedT - dt);
      if (this.weaponReclaimT > 0) this.weaponReclaimT = Math.max(0, this.weaponReclaimT - dt);
      this.weaponPrevA = this.weaponA; springWeapon(this, "weaponA", "weaponAV", wt, dt, 190 + k * 4, 18);
      this.debugGeometry = weaponDebugGeometry(this.weaponGeometry());
    }
  }

  return Aldric;
}

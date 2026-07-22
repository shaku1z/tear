import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import type { BossRuntime } from "./boss-runtime";

export function createEchoEnemyTypes(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor, bossRuntime: BossRuntime) {
  const { CONFIG, FX, GAME_RANDOM, Projectile, clamp, len, lerp } = dependencies;
  const { bossFeedback, bossTransformation } = bossRuntime;
  // ---- The Echo (Stage 4 boss): your own silhouette — mirrors your last trick -> splits -> goes invisible ----
  class Echo extends Enemy {
    isClone: boolean; mode: string; state: string; stateT: number; seenTrickT: number;
    copyKind: string; copyT: number; lastCopied: string; phaseMarker: number; spawnClone: boolean;
    whiteFlash: number; invisT: number; lungeCd: number; echoJumpCd: number; copyOffset: number;
    harmonyLockT: number; edgeTrail: { x: number; y: number; t: number }[]; aimT = 0;
    diveTX = 0; diveTY = 0; introT = 0;
    declare cfg: typeof CONFIG.echo;

    constructor(x: number, y: number, isClone = false) {
      super(x, y, CONFIG.echo);
      this.color = "#000";
      this.kind = "boss"; this.isBoss = !isClone; this.bossName = "THE ECHO";
      this.presentationId = "echo";
      this.isClone = isClone;
      this.mode = "mirror"; this.state = "idle"; this.stateT = 0; this.facing = 1;
      this.seenTrickT = 0; this.copyKind = "hit"; this.copyT = -1; this.lastCopied = "";
      this.phaseMarker = 1; this.spawnClone = false;
      this.whiteFlash = 0; this.invisT = CONFIG.echo.invisCycle; this.lungeCd = 1.3;
      this.echoJumpCd = 0;
      this.copyOffset = isClone ? 1.7 : 1;   // the clone mirrors on a longer, offset delay
      this.harmonyLockT = 0; this.edgeTrail = [];
      if (isClone) { this.hp *= 0.5; this.maxHp = this.hp; this.hpDisplay = this.hp; }
    }
    get phase() { const f = this.hp / this.maxHp; return f > 0.6 ? 1 : (f > 0.25 ? 2 : 3); }
    _shock(projectiles: EnemyProjectile[], dir: number) {
      const C = CONFIG.echo, footY = this.y + this.hh;
      const p = new Projectile(this.x + dir * this.hw, footY - 12, dir * C.shockSpeed, 0);
      this.ownProjectile(p); p.setFamily("groundShock"); p.r = 14; p.dmg = C.shockDmg; p.life = 1.6; projectiles.push(p);
    }
    _shot(player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      const C = CONFIG.echo, dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
      const p = this.ownProjectile(new Projectile(this.x, this.y, (dx / m) * C.projSpeed, (dy / m) * C.projSpeed)); p.dmg = C.projDmg; p.r = 10; p.tint = this.color; projectiles.push(p);
    }
    _scheduleFrom(player: EnemyPlayerPort) {   // a new trick from the player queues a copy (faster if you repeat yourself)
      if (player.lastTrickT > this.seenTrickT) {
        const repeat = player.lastTrickKind === this.lastCopied;
        this.seenTrickT = player.lastTrickT; this.copyKind = player.lastTrickKind;
        this.copyT = CONFIG.echo.copyDelay * this.copyOffset * (repeat ? 0.5 : 1);
        if (repeat && !this.isClone) {
          this.harmonyLockT = 0.75;
          FX.ring(CONFIG.view.w / 2, CONFIG.world.groundY - 4, 18, CONFIG.colors.eye);
          bossFeedback(this, "windup", { quiet: true, priority: 4 });
        }
      }
    }
    _doCopy(player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      const k = this.copyKind, dir = Math.sign(player.x - this.x) || this.facing;
      this.lastCopied = k;
      if (k === "throwHit" || k === "parry" || k === "deflect") { this._shot(player, projectiles); this.state = "recover"; this.stateT = 0.4; }
      else if (k === "slam" || k === "superslam" || k === "spike") { this._shock(projectiles, 1); this._shock(projectiles, -1); this.state = "recover"; this.stateT = 0.5; }
      else if (k === "updraft" || k === "launch") { this.state = "lunge"; this.stateT = 0.3; this.vx = dir * 560; this.vy = -720; }
      else { this.state = "lunge"; this.stateT = 0.24; this.vx = dir * 920; }   // hit / default melee dash
      if (!this.isClone) bossFeedback(this, "launch", { quiet: true });
    }
    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      this.tickTimers(dt);
      if (this.harmonyLockT > 0) this.harmonyLockT = Math.max(0, this.harmonyLockT - dt);
      this.edgeTrail.push({ x: this.x, y: this.y, t: 0.2 }); if (this.edgeTrail.length > 5) this.edgeTrail.shift();
      for (const g of this.edgeTrail) g.t -= dt; this.edgeTrail = this.edgeTrail.filter((g) => g.t > 0);
      this.facing = Math.sign(player.x - this.x) || this.facing;
      if (!this.isClone) {
        const ph = this.phase;
        if (ph !== this.phaseMarker) {
          if (ph === 2) this.spawnClone = true;
          if (ph === 3) this.mode = "invert";
          this.phaseMarker = ph;
          bossTransformation(this, { id: ph === 2 ? "echo-second-voice" : "echo-inverted",
            title: ph === 2 ? "A SECOND VOICE" : "HARMONY INVERTED", pose: "echoMirror",
            line: ph === 2 ? "I REMEMBER WHEN THAT MOVE WAS MINE." : "NOW REMEMBER IT BACKWARDS.",
            color: CONFIG.colors.eye, sfx: "echoResonance", brief: ph === 3 });
        }
      }
      if (this.cinematicRequest) return;
      if (this.mode === "invert") { this._invert(dt, player, projectiles); return; }

      // ---- mirror mode (phases 1-2) ----
      this._scheduleFrom(player);
      if (this.copyT > 0) { this.copyT -= dt; if (this.copyT <= 0) this._doCopy(player, projectiles); }
      if (this.state === "lunge") { this.stateT -= dt; if (this.stateT <= 0) { this.state = "recover"; this.stateT = 0.3; } }
      else if (this.state === "recover") { this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1)); this.stateT -= dt; if (this.stateT <= 0) this.state = "idle"; }
      else { const targetX = player.x - this.facing * (this.isClone ? 260 : 200); this.vx = lerp(this.vx, (targetX - this.x) * 2, clamp(3 * dt, 0, 1)); }
      this.echoJumpCd -= dt;
      if (this.onGround && this.echoJumpCd <= 0 && player.y + player.hh < this.y - 55) {
        const feet = this.y + this.hh;
        const target = platforms.filter((p) => p.oneway && p.y < feet - 24 && feet - p.y <= 320)
          .sort((a, b) => Math.abs((a.x + a.w / 2) - player.x) - Math.abs((b.x + b.w / 2) - player.x))[0];
        if (target) {
          this.vy = -CONFIG.echo.jumpV; this.vx += clamp((target.x + target.w / 2 - this.x) * 1.45, -620, 620);
          this.onGround = false; this.echoJumpCd = CONFIG.echo.jumpCd;
        }
      }
      this.integrate(dt, platforms);
    }
    _invert(dt: number, player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      void projectiles;
      const C = CONFIG.echo;
      this.invisT -= dt;
      if (this.invisT <= 0) {
        if (this.whiteFlash < 0.5) { this.whiteFlash = 1; this.invisT = C.invisDur; }   // blinding white-out -> nearly invisible
        else { this.whiteFlash = 0; this.invisT = C.invisCycle; }
      }
      if (this.state === "aim") {                  // lock a spot + flash a line, THEN dive (so it never just appears on you)
        this.aimT -= dt;
        this.vx = lerp(this.vx, 0, clamp(7 * dt, 0, 1)); this.vy = lerp(this.vy, 0, clamp(7 * dt, 0, 1));
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.aimT <= 0) {
          this.state = "lunge"; this.stateT = 0.34;
          const m = len(this.diveTX - this.x, this.diveTY - this.y) || 1;
          this.vx = (this.diveTX - this.x) / m * C.lungeSpeed; this.vy = (this.diveTY - this.y) / m * C.lungeSpeed;
        }
      } else if (this.state === "lunge") {
        this.x += this.vx * dt; this.y += this.vy * dt; this.stateT -= dt;
        if (this.stateT <= 0) { this.state = "idle"; this.lungeCd = 0.9 + GAME_RANDOM.next() * 0.6; }
      } else {
        const tx = player.x, ty = player.y - 90;   // drift above/around you, then commit a dive
        this.vx = lerp(this.vx, (tx - this.x) * 1.6, clamp(2 * dt, 0, 1));
        this.vy = lerp(this.vy, (ty - this.y) * 1.6, clamp(2 * dt, 0, 1));
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.lungeCd -= dt;
        if (this.lungeCd <= 0 && Math.abs(player.x - this.x) < 820) {
          this.state = "aim"; this.aimT = 0.32; this.diveTX = player.x; this.diveTY = player.y;
        }
      }
      this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
      this.y = clamp(this.y, 50, CONFIG.world.groundY - this.hh);
      this.onGround = false;
    }
  }

  // Void-run utility add: a launchable air target and a restrained lane-pressure
  // pass. It remains a juggle foothold, but the thin captured-line tell prevents an
  // upper route from becoming permanent shelter.
  class VoidWisp extends Enemy {
    noScore: boolean; isVoidWisp: boolean; baseY: number; life: number; voidLane: string;
    passState: string; passCd: number; passT: number; passY: number; passContactSpent: boolean;

    constructor(x: number, y: number) {
      super(x, y, { w: 38, h: 38, hp: 85, speed: 105, contactDmg: CONFIG.source.voidWispDmg, knockbackTaken: 14, weight: 0.65 });
      this.kind = "wisp"; this.color = CONFIG.colors.perfect; this.noScore = true; this.isVoidWisp = true;
      this.baseY = y; this.life = 9; this.voidLane = "upper";
      this.passState = "hover"; this.passCd = 0.9; this.passT = 0; this.passY = y; this.passContactSpent = true;
    }
    override contactDamageEnabled() { return this.passState === "pass" && !this.passContactSpent; }
    override onContactDamage() { if (this.passState === "pass") this.passContactSpent = true; }
    update(dt: number, _platforms: readonly EnemyPlatform[], player: EnemyPlayerPort) {
      this.tickTimers(dt); this.life -= dt;
      const C = CONFIG.source;
      if (this.passState === "tell") {
        this.passT -= dt;
        this.vx = lerp(this.vx, 0, clamp(9 * dt, 0, 1));
        this.vy = lerp(this.vy, (this.passY - this.y) * 2.5, clamp(4 * dt, 0, 1));
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.passT <= 0) {
          this.passState = "pass"; this.passT = C.voidWispPassTime; this.passContactSpent = false;
          this.vx = -C.voidWispPassSpeed; this.vy = (this.passY - this.y) / Math.max(0.25, C.voidWispPassTime * 0.45);
        }
      } else if (this.passState === "pass") {
        this.passT -= dt; this.x += this.vx * dt; this.y += this.vy * dt;
        this.vy = lerp(this.vy, (this.passY - this.y) * 4.2, clamp(5 * dt, 0, 1));
        if (this.passT <= 0) { this.passState = "hover"; this.passCd = 1.4; this.passContactSpent = true; this.baseY = this.y; }
      } else {
        this.passCd -= dt;
        this.vx = lerp(this.vx, -C.scrollSpeed * 0.42, clamp(1.6 * dt, 0, 1));
        this.vy += CONFIG.world.gravity * 0.22 * dt;
        this.vy = lerp(this.vy, (this.baseY + Math.sin(this.aliveT * 2.2) * 55 - this.y) * 2.1, clamp(1.3 * dt, 0, 1));
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.passCd <= 0 && player.voidLane === this.voidLane && player.voidTransferT <= 0) {
          this.passState = "tell"; this.passT = C.voidWispTell; this.passY = player.y; this.passContactSpent = true;
        }
      }
      if (this.x < -80 || this.life <= 0) this.dead = true;
    }
  }

  return { Echo, VoidWisp };
}

import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor, EnemyBaseInstance } from "./enemy-base";
import type { BossRuntime } from "./boss-runtime";
import { createSourceCore } from "./source-core";
import type { ThroneFireRuntime } from "./throne-fire";

export function createSourceType(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor, bossRuntime: BossRuntime, throneFireRuntime: ThroneFireRuntime) {
  const { CONFIG, FX, GAME_RANDOM, Projectile, clamp, len, lerp } = dependencies;
  const { bossFeedback, bossPhaseBeat, bossTransformation, perilPing } = bossRuntime;
  const { clearThroneFire, startThroneFire, tickThroneFire } = throneFireRuntime;
  const SourceCore = createSourceCore(dependencies, Enemy, bossRuntime);
  class Source extends SourceCore {
    override _deathLocked() { return this.mode === "downed"; }   // the kneel cannot be a kill

        _shot(player: EnemyPlayerPort, projectiles: EnemyProjectile[], tint: string, motif = "echo") {
          const C = CONFIG.source, dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1;
          const drift = this.mode === "void" ? -C.scrollSpeed * 0.32 : 0;
          const p = new Projectile(this.x, this.y, (dx / m) * C.shockSpeed + drift, (dy / m) * C.shockSpeed);
          p.dmg = this._voidDmg(C.shockDmg); p.r = 11; p.tint = tint || this.color; p.owner = this; p.sourceStolen = motif || "echo"; projectiles.push(p);
        }
        _shock(projectiles: EnemyProjectile[], dir: number, footY: number | null, tint: string, surface?: EnemyPlatform | null) {
          const C = CONFIG.source, surfaceY = surface ? surface.y : (footY ?? CONFIG.world.groundY);
          const fy = surfaceY - C.shockR;
          const sx = surface ? clamp(this.x + dir * this.hw, surface.x + C.shockR, surface.x + surface.w - C.shockR) : this.x + dir * this.hw;
          const p = new Projectile(sx, fy, dir * C.shockSpeed, 0);
          p.setFamily("groundShock"); p.r = C.shockR; p.dmg = this._voidDmg(C.shockDmg); p.life = 2.0; p.owner = this; p.tint = tint || CONFIG.colors.boss; projectiles.push(p);
          if (surface) {
            p.surfacePlatformId = surface.platformId ?? surface.id ?? null; p.surfaceLeft = surface.x; p.surfaceRight = surface.x + surface.w; p.surfaceY = surface.y;
          }
        }
        _sweeper(projectiles: EnemyProjectile[], tint: string) {
          void tint;
          const C = CONFIG.source;
          const active = projectiles.find((shot) => !shot.dead && shot.family === "sweeper" && shot.owner === this);
          if (active) return active;
          const p = new Projectile(this.x, Math.min(CONFIG.world.groundY - 24, this.y + 90), -C.sweeperSpeed, 0);
          p.sweeperStyle = "shard"; p.setFamily("sweeper").configureSweeper({ passes: C.sweeperCrossings, integrity: C.sweeperIntegrity,
            maxLife: C.sweeperMaxLife, embeddedLife: C.sweeperEmbedDur });
          p.r = 22; p.dmg = this._voidDmg(C.sweeperDmg); p.owner = this; p.tint = "#6ef2ff";
          p.onCountered = (shot: EnemyProjectile) => { this.onSweeperReturned(shot); }; projectiles.push(p);
          FX.ring(this.x, this.y, 18, this.color);
          return p;
        }
        onSweeperReturned(p: EnemyProjectile) {
          const perfect = p.perfect;
          // A returned memory does not become generic damage: it breaks the copied
          // sequence itself and buys a readable gap before the next stolen move.
          this.copyT = -1; this._burstN = 0;
          this.atkT = Math.max(this.atkT, CONFIG.source.cycleCd * (perfect ? 1.6 : 1.25));
          this.stun = Math.max(this.stun, perfect ? 0.55 : 0.32); this.breachRipple = 1;
          this.echoCaption = perfect ? "MEMORY COLLAPSED" : "MEMORY FRACTURES"; this.captionT = perfect ? 1.7 : 1.2;
          FX.ring(this.x, this.y, perfect ? 30 : 20, "#6ef2ff"); FX.burst(this.x, this.y, 0, -1, perfect ? 15 : 9, "#d65cff");
          bossFeedback(this, perfect ? "stagger" : "counter", { banner: perfect ? "MEMORY COLLAPSED" : "MEMORY FRACTURED", color: perfect ? "#ffffff" : "#6ef2ff",
            priority: perfect ? 9 : 7, slowmo: perfect ? 0.38 : 0, zoom: perfect ? 0.08 : 0.035, quiet: !perfect });
        }
        _cross(projectiles: EnemyProjectile[], motif: string) {
          const C = CONFIG.source;
          const directions: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
          for (const [dx, dy] of directions) {
            const p = new Projectile(this.x, this.y, dx * C.crossSpeed, dy * C.crossSpeed); p.dmg = this._voidDmg(C.crossDmg); p.r = 11; p.tint = this.color; p.owner = this; p.sourceStolen = motif || "source"; projectiles.push(p);
          }
          FX.ring(this.x, this.y, 16, this.color);
        }
        _lightFire() {
          if (this.mode !== "cycle" || this.collapsing || this.voidDelayT > 0) return;
          if (!this.fireZones.length) startThroneFire(this, false);
        }
        // Echo-style mirror: copy the player's last trick as a void attack
        _scheduleFrom(player: EnemyPlayerPort) {
          if (player.lastTrickT > this.seenTrickT) {
            const repeat = player.lastTrickKind === this.lastCopied;
            this.seenTrickT = player.lastTrickT; this.copyKind = player.lastTrickKind;
            this.copyT = CONFIG.source.copyDelay * (repeat ? 0.5 : 1);
          }
        }
        _doCopy(player: EnemyPlayerPort, projectiles: EnemyProjectile[], platforms: readonly EnemyPlatform[]) {
          const k = this.copyKind, groundCopy = k === "slam" || k === "superslam" || k === "spike";
          if (groundCopy) {
            let support = player.supportPlatform ?? null;
            if (!support && this.mode === "void") support = platforms.find((p) => p.void && p.oneway &&
              Math.abs(player.y + player.hh - p.y) < 8 && player.x + player.hw > p.x && player.x - player.hw < p.x + p.w) ?? null;
            if (this.mode === "void" && !support) { this.copyT = 0.12; return false; }
            this.lastCopied = k;
            this._shock(projectiles, 1, support ? support.y : null, this.color, support);
            this._shock(projectiles, -1, support ? support.y : null, this.color, support);
          } else { this.lastCopied = k; this._shot(player, projectiles, this.color); }
          const label = ({ superslam: "SLAM", throwHit: "THROW", updraft: "UPDRAFT", launch: "LAUNCH" })[k] ?? (k || "CUT").toUpperCase();
          this.echoCaption = "IT LEARNED YOUR " + label; this.captionT = 1.4;
          FX.ring(this.x, this.y, 13, this.color);
          return true;
        }
        _cast(projectiles: EnemyProjectile[], count: number) {
          const picks = ["warden", "colossus", "aldric"];
          for (let i = 0; i < count; i++) {
            const m = picks[(this.castIdx++) % picks.length];
            if (m === "warden") {
              // quotes the NEW kit: the baton string's rhythm as a three-count burst
              this._burstN = 3; this._burstT = 0; this._burstMotif = "warden";
              this.echoCaption = "ECHO OF THE WARDEN…";
            } else if (m === "colossus") {
              this._sweeper(projectiles, CONFIG.colors.armoredShield); this.echoCaption = "ECHO OF THE COLOSSUS…";
            } else {
              // over the void there's no ground for the fire checkerboard — the Aldric
              // echo becomes a downward shard fan instead
              if (this.mode === "void") this._cross(projectiles, "aldric");
              else this._lightFire();
              this.echoCaption = "ECHO OF ALDRIC…";
            }
            this.captionT = 1.25;
          }
          if (this.mode === "void") this._cross(projectiles, "source");
          FX.ring(this.x, this.y, 20, this.color);
        }
        // RIFT DASH — a telegraphed flash-charge along a line locked to the player.
        // A chromatic blink (afterimages), not a slow slide. In the void it charges
        // along the horizontal lane so it shares the arena with the conveyor.
        _startDash(player: EnemyPlayerPort) {
          const C = CONFIG.source;
          this.dashState = "wind"; this.dashT = C.dashWindup;
          if (this.mode === "void") { this.dashTX = -1; this.dashTY = 0; }   // sweep leftward across the lane
          else { const dx = player.x - this.x, dy = player.y - this.y, m = len(dx, dy) || 1; this.dashTX = dx / m; this.dashTY = dy / m; }
          perilPing(this);
          this.echoCaption = "IT LUNGES"; this.captionT = 1.0;
        }
        _tickDash(dt: number, player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
          void projectiles;
          const C = CONFIG.source;
          if (this.dashState === "wind") {
            this.dashT -= dt; this.vx = lerp(this.vx, 0, clamp(6 * dt, 0, 1)); this.vy = lerp(this.vy, 0, clamp(6 * dt, 0, 1));
            if (this.dashT <= 0) {
              this.dashState = "dash"; this.dashT = 0.34;
              this.dashDX = this.dashTX * C.dashSpeed; this.dashDY = this.dashTY * C.dashSpeed;
              bossFeedback(this, "launch", { quiet: true });
            }
          } else if (this.dashState === "dash") {
            this.dashT -= dt;
            // chromatic afterimages trail the blink
            this.dashGhosts.push({ x: this.x, y: this.y, t: 0.24 });
            this.x += this.dashDX * dt; this.y += this.dashDY * dt;
            const contact = len(player.x - this.x, player.y - this.y) < this.hw + player.hw + 8;
            if (contact && !player.invulnerable) { player.takeDamage(this._voidDmg(C.dashDmg), this.x, this); FX.burst(player.x, player.y, this.dashTX, this.dashTY, 8, this.color); }
            // the charge stops AT the arena edge — it flashes across, never off the map
            const hitEdge = this.x <= this.hw || this.x >= CONFIG.view.w - this.hw || this.y <= 80 || this.y >= CONFIG.world.groundY - this.hh;
            this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw); this.y = clamp(this.y, 80, CONFIG.world.groundY - this.hh);
            if (this.dashT <= 0 || hitEdge) { this.dashState = "idle"; this.dashCd = C.dashCd; }
          }
          for (const g of this.dashGhosts) g.t -= dt;
          this.dashGhosts = this.dashGhosts.filter((g) => g.t > 0);
        }
        // RIFT COLLAPSE — teleport above the player, then drop a converging ring of shards
        _startCollapse(player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
          void projectiles;
          const C = CONFIG.source;
          this.collapseState = "wind"; this.collapseWT = C.collapseWindup;
          this.x = clamp(player.x, this.hw, CONFIG.view.w - this.hw); this.y = clamp(player.y - 230, 90, 360);
          FX.ring(this.x, this.y, 22, this.color); this.echoCaption = "RIFT COLLAPSE"; this.captionT = 1.1;
        }
        _tickCollapse(dt: number, _player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
          const C = CONFIG.source;
          if (this.collapseState !== "wind") return;
          this.collapseWT -= dt;
          if (this.collapseWT <= 0) {
            this.collapseState = "idle"; this.riftCollapseCd = C.riftCollapseCd;
            for (let i = 0; i < 10; i++) {
              const a = i / 10 * Math.PI * 2 - Math.PI / 2;
              const p = new Projectile(this.x + Math.cos(a) * 150, this.y + Math.sin(a) * 90, -Math.cos(a) * C.collapseSpeed, -Math.sin(a) * C.collapseSpeed * 0.6 + 260);
              p.dmg = this._voidDmg(C.collapseDmg); p.r = 11; p.tint = this.color; p.owner = this; projectiles.push(p);
            }
            bossFeedback(this, "launch", { shake: 6, flash: 0.18, zoom: 0.035 });
          }
        }
        _hover(dt: number, player: EnemyPlayerPort) {
          const C = CONFIG.source;
          this.predatorDecisionT -= dt; this.predatorEngageT += dt;
          if (this.predatorDecisionT <= 0) {
            this.predatorDecisionT = C.predatorDecisionMin + GAME_RANDOM.next() * (C.predatorDecisionMax - C.predatorDecisionMin);
            // Ordinary steering owns one side of the duel. Only the telegraphed breach
            // is allowed to cross the player; after that pass, the new physical side
            // naturally becomes the next orbit side.
            this.predatorSide = Math.sign(this.x - player.x) || this.predatorSide;
            const close = this.predatorEngageT > C.predatorForceBreach * 0.55 || GAME_RANDOM.next() < 0.56;
            this.predatorDist = close
              ? C.predatorCloseMin + GAME_RANDOM.next() * (C.predatorCloseMax - C.predatorCloseMin)
              : C.predatorStalkMin + GAME_RANDOM.next() * (C.predatorStalkMax - C.predatorStalkMin);
            this.predatorY = C.predatorYMin + GAME_RANDOM.next() * (C.predatorYMax - C.predatorYMin);
          }
          const tx = this.mode === "void" ? CONFIG.view.w * 0.80 : player.x + this.predatorSide * this.predatorDist;
          const ty = this.mode === "void" ? clamp(player.y + this.predatorY, 120, CONFIG.world.groundY - 230) : clamp(player.y + this.predatorY, 90, CONFIG.world.groundY - 150);
          this.vx = lerp(this.vx, (tx - this.x) * 1.65, clamp(2.8 * dt, 0, 1));
          this.vy = lerp(this.vy, (ty - this.y) * 1.55, clamp(2.6 * dt, 0, 1));
          this.x += this.vx * dt; this.y += this.vy * dt;
          this._applyBreachNudge(dt);
          this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
          this.y = clamp(this.y, 70, CONFIG.world.groundY - this.hh);
          this.onGround = false;
        }
        _enterPhase(ph: number) {
          const C = CONFIG.source;
          this._cancelSoftBreach(C.breachIntervalMin);
          if (ph === 2) {
            // THE VOID RUN begins at the halfway mark: the whole floor shatters fast,
            // then the platform stream replaces the world — the fight's centerpiece.
            this.mode = "collapse"; this.collapsing = true; this.collapseT = 0.05;
            this.voidDelayT = C.voidDelay; this.requestVoidCinematic = true; this.phaseTag = "WORLD UNMAKES";
            clearThroneFire(this, true);   // no ground fire once the floor is going
            bossPhaseBeat(this, "THE WORLD UNMAKES", this.color);
          } else if (ph === 3) {
            // THE KNEEL, on the void: the conveyor freezes mid-air while it gathers
            // itself — then TRUE FORM thaws the stream, faster.
            this.mode = "downed"; this.downT = C.kneelDur; this.freezeVoid = true;
            this.depthPlane = "foreground"; this.depthState = "idle";
            this.beamState = "idle"; this.phaseTag = "IT REMEMBERS";
            bossPhaseBeat(this, "IT REMEMBERS EVERY BLADE", this.color);
          }
        }
        revive() {
          const C = CONFIG.source;
          this.mode = "void"; this.downT = -1; this.thawVoid = true; this.phaseTag = "TRUE FORM";
          this.depthPlane = "rear"; this.depthState = "rearIdle"; this.depthCd = C.depthFirstDelay * 0.55;
          this.color = CONFIG.colors.perfect; this.castIdx = 0; this.atkT = 0.35; this.beamCd = C.beamCd * 0.55;
          bossTransformation(this, { id: "source-true-form", title: "TRUE FORM", pose: "sourceTrue",
            line: "EVERY BLADE RETURNS TO ME.", color: CONFIG.colors.perfect, sfx: "sourceCross" });
        }
        tryCatchBlade(blade: { returning: boolean; held: boolean; x: number; y: number; vx: number; vy: number; state: string; hostile: boolean; stolenBy: EnemyBaseInstance | null; pierced: Set<EnemyBaseInstance> | null; flyTime: number }, player: EnemyPlayerPort) {
          if (this.mode !== "void" || this.bladeCaught || blade.state !== "flying" || blade.hostile) return false;
          this.bladeCaught = true; blade.hostile = true; blade.stolenBy = this; blade.pierced = new Set([this]); blade.flyTime = 0;
          const dx = player.x - blade.x, dy = player.y - blade.y, m = len(dx, dy) || 1;
          blade.vx = dx / m * CONFIG.source.stolenBladeSpeed; blade.vy = dy / m * CONFIG.source.stolenBladeSpeed;
          this.echoCaption = "IT TOOK YOUR BLADE"; this.captionT = 1.8;
          bossFeedback(this, "counter", { banner: "IT TOOK YOUR BLADE", color: CONFIG.colors.perfect, priority: 8, slowmo: 0.35, zoom: 0.06 });
          return true;
        }
        override onDeathStart() { this.freezeVoid = true; this.beamState = "idle"; this.depthPlane = "foreground"; this.depthState = "idle"; this.siphon = null; clearThroneFire(this, true); }

        update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
          this.tickTimers(dt);
          this.facing = Math.sign(player.x - this.x) || this.facing;
          const C = CONFIG.source, ph = this.phase;
          if (this.breachRepelGraceT > 0) this.breachRepelGraceT = Math.max(0, this.breachRepelGraceT - dt);
          if (this.breachRipple > 0) this.breachRipple = Math.max(0, this.breachRipple - dt * 3.2);
          if (this.captionT > 0) this.captionT -= dt;
          while (this.phaseMarker < ph) { this.phaseMarker++; this._enterPhase(this.phaseMarker); }
          this._tickSiphon(dt, player);
          if (this.introT > 0) { this.vx = lerp(this.vx, 0, clamp(5 * dt, 0, 1)); this.vy = lerp(this.vy, 0, clamp(5 * dt, 0, 1)); return; }

          // The cinematic director owns the collapse clock, player safety and exact
          // hand-off. Source simulation is held here so it cannot cast through speech.
          if (this.mode === "collapse") {
            this.vx = lerp(this.vx, 0, clamp(5 * dt, 0, 1)); this.vy = lerp(this.vy, 0, clamp(5 * dt, 0, 1));
            return;
          }

          // THE KNEEL: it gathers itself over the frozen stream — no attacks, then TRUE FORM
          if (this.mode === "downed") {
            this.downT -= dt;
            this.vx = lerp(this.vx, (CONFIG.view.w / 2 - this.x) * 1.1, clamp(2 * dt, 0, 1));
            this.vy = lerp(this.vy, (250 - this.y) * 1.1, clamp(2 * dt, 0, 1));
            this.x += this.vx * dt; this.y += this.vy * dt;
            if (this.downT <= 0) this.revive();
            return;
          }
          // Rear-plane combat owns the Void Run's cadence. Its foreground breach is
          // the reward window; legacy casts cannot overlap a depth tell or obscure it.
          if (this._tickDepth(dt, platforms, player, projectiles)) return;
          tickThroneFire(this, dt);
          this._scheduleFrom(player);
          const voidTransferBusy = this.mode === "void" && (player.voidTransferT > 0 || !player.supportPlatform);
          // A learned move may queue during a crossover, but it cannot fire over the
          // captured locomotion. Its timer resumes once follow steering returns.
          if (this.copyT > 0 && this.breachState === "follow" && !voidTransferBusy) { this.copyT -= dt; if (this.copyT <= 0) this._doCopy(player, projectiles, platforms); }
          // the Warden-echo burst: three shots on the baton string's beat
          if (this._burstN > 0 && this.breachState === "follow" && !voidTransferBusy) {
            this._burstT -= dt;
            if (this._burstT <= 0) { this._shot(player, projectiles, CONFIG.colors.boss, this._burstMotif || "warden"); this._burstN--; this._burstT = 0.18; }
          }

          // (platform crack ticking/splicing is GENERIC now — game.js runs it; this
          // boss only SETS crackT on its victims)
          if (this.collapsing) {
            this.collapseT -= dt;
            if (this.collapseT <= 0) {
              this.collapseT = C.platformCollapseCd;
              const ow = platforms.filter((p) => p.oneway && !((p.crackT ?? 0) > 0));
              const pl = ow[Math.floor(GAME_RANDOM.next() * ow.length)];
              if (pl) { pl.crackT = C.crackWarn; pl.crackMax = C.crackWarn; pl.crackColor = this.color; }
            }
          }

          if (this.mode === "void") {
            if (this.beamState === "idle") {
              this.beamCd -= dt;
              if (this.beamCd <= 0 && !voidTransferBusy && player.voidMajorWindow) { this.beamState = "tell"; this.beamT = C.beamWarn; this.beamX = CONFIG.view.w - 70; perilPing(this); }
            } else if (this.beamState === "tell") {
              this.beamT -= dt;
              if (this.beamT <= 0) { this.beamState = "sweep"; this.beamT = C.beamSweep; }
            } else {
              this.beamT -= dt;
              const k = 1 - clamp(this.beamT / C.beamSweep, 0, 1);
              this.beamX = lerp(CONFIG.view.w + C.beamW, -C.beamW, k);
              if (Math.abs(player.x - this.beamX) < C.beamW / 2 + player.hw) player.takeDamage(this._voidDmg(C.beamDmg), this.beamX, this);
              if (this.beamT <= 0) { this.beamState = "idle"; this.beamCd = C.beamCd; }
            }
          }

          // A soft crossover/recoil owns movement and suppresses the copied cast bag.
          // Revalidate the captured Void lane every tick: a route transfer, rescue, or
          // disappearing support that starts after commitment is still protected.
          if (this.breachState !== "follow") {
            const voidRouteLost = this.mode === "void" && (!player.supportPlatform ||
              player.voidTransferT > 0 || player.voidSlowT > 0 ||
              (this.breachLane && player.voidLane !== this.breachLane));
            if (voidRouteLost) {
              if (this.breachState === "recoil" && player.voidLane === this.breachLane &&
                  !player.voidSlowT) {
                // A successful repel remains earned, but does not move the Source
                // through a forced connector while the player is unsupported.
                this.vx = 0; this.vy = 0;
              } else {
                this._cancelSoftBreach(this._rollBreachCd());
              }
              return;
            }
            this._tickSoftBreach(dt); return;
          }

          // physical moves run their own state machines (they suppress the hover/cast)
          if (this.dashState !== "idle") { this._tickDash(dt, player, projectiles); return; }
          if (this.collapseState !== "idle") { this._tickCollapse(dt, player, projectiles); this._hover(dt, player); return; }
          this.dashCd -= dt; this.riftCollapseCd -= dt;

          // Cooldown is sampled once per completed cycle. If the player is too far
          // away, the ready breach waits instead of rerolling or timing out off-screen.
          const breachRange = len(player.x - this.x, player.y - this.y);
          if (!this._softBreachBlocked(player) && breachRange <= C.breachStartRange) {
            this.breachCd -= dt;
            if (this.predatorEngageT >= C.predatorForceBreach) this.breachCd = 0;
            if (this.breachCd <= 0) { this._startSoftBreach(player); this._tickSoftBreach(dt); return; }
          }

          this._hover(dt, player);
          this.atkT -= dt;
          if (this.atkT <= 0 && !voidTransferBusy) {
            this.atkT = C.cycleCd / (this.mode === "void" ? 1.9 : (this.collapsing ? 1.35 : 1));
            // MOVE BAG: weave the physical moves between ranged casts so the rift isn't
            // a pure projectile turret. Dash/collapse fire when off cooldown; otherwise
            // it casts (roughly halving the pure-projectile ratio).
            if (this.dashCd <= 0 && (this.mode === "void" || GAME_RANDOM.next() < 0.7)) this._startDash(player);
            else if (this.riftCollapseCd <= 0 && GAME_RANDOM.next() < 0.6) this._startCollapse(player, projectiles);
            else this._cast(projectiles, this.mode === "void" ? 2 : 1);
          }
        }
  }
  return Source;
}

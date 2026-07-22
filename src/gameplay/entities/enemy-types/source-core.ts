import type { ArenaZone, EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import type { BossRuntime } from "./boss-runtime";

export function createSourceCore(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor, bossRuntime: BossRuntime) {
  const { CLOCK, CONFIG, FX, GAME_RANDOM, Projectile, SFX, clamp, len, lerp, segSegmentDist } = dependencies;
  const { bossFeedback, perilPing } = bossRuntime;
  class SourceCore extends Enemy {
    mode: string; zones: ArenaZone[]; fireZones: ArenaZone[]; zoneColor: string; zoneCycleT: number;
        firePattern: number; fireState: string; fireClock: number; fireWarnStep: number; castIdx: number;
        collapsing: boolean; collapseT: number; phaseMarker: number; requestVoid: boolean;
        requestVoidCinematic: boolean; freezeVoid: boolean; thawVoid: boolean; voidDelayT: number;
        downT: number; seenTrickT: number; copyKind: string; copyT: number; lastCopied: string;
        copyOffset: number; echoCaption: string; captionT: number; bladeCaught: boolean;
        beamState: string; beamT: number; beamCd: number; beamX: number; dashState: string;
        dashT: number; dashCd: number; dashTX: number; dashTY: number; dashDX: number; dashDY: number;
        dashGhosts: { x: number; y: number; t: number }[]; collapseState: string; collapseWT: number;
        riftCollapseCd: number; _burstN: number; _burstT: number; breachState: string; breachCd: number;
        breachT: number; breachMaxT: number; breachSpeed: number; breachDX: number; breachDY: number;
        breachCommitX: number; breachCommitY: number; breachDestX: number; breachDestY: number;
        breachStartX: number; breachStartY: number; breachLane: string | null; breachContactSpent: boolean;
        breachRepelGraceT: number; breachRecoilVX: number; breachRecoilVY: number; breachNudgeVX: number;
        breachNudgeVY: number; breachRipple: number; predatorDecisionT: number; predatorEngageT: number;
        predatorSide: number; predatorDist: number; predatorY: number; voidFormAwake: boolean;
        depthState: string; depthPlane: string; depthKind: string; depthT: number; depthMaxT: number;
        depthCd: number; depthTargetX: number; depthTargetY: number; depthAttackIndex: number;
        rearX: number; rearY: number; formScale: number; siphonFalls: number; siphonHealed: number;
        siphon: { t: number; maxT: number; amount: number; healed: number; x: number; y: number } | null;
        seams: ArenaZone[] = []; introT = 0; _burstMotif = "warden";
        declare cfg: typeof CONFIG.source;

        constructor(x: number, y: number) {
          super(x, y, CONFIG.source);
          this.color = "#8b3bd6"; this.kind = "boss"; this.isBoss = true; this.bossName = "THE SOURCE";
          this._noBar = true;   // the final boss speaks through the authored HUD, never a second head bar
          this.presentationId = "source";
          this.epithet = "THE TEAR ITSELF"; this.phaseMarks = [CONFIG.source.voidTier, CONFIG.source.fakeTier]; this.phaseTag = "THE CYCLE";
          this.mode = "cycle"; this.atkT = 2.2; this.castIdx = 0; this.facing = 1;
          this.zones = []; this.fireZones = []; this.zoneColor = CONFIG.colors.bomber; this.zoneCycleT = 0;
          this.firePattern = 0; this.fireState = "idle"; this.fireClock = 0; this.fireWarnStep = -1;
          this.collapsing = false; this.collapseT = 0; this.phaseMarker = 1; this.requestVoid = false; this.requestVoidCinematic = false; this.freezeVoid = false;
          this.thawVoid = false; this.voidDelayT = -1; this.downT = -1;   // phase-2 shatter countdown + the kneel clock
          this.seenTrickT = 0; this.copyKind = "hit"; this.copyT = -1; this.lastCopied = ""; this.copyOffset = 1;
          this.echoCaption = ""; this.captionT = 0; this.bladeCaught = false;
          this.beamState = "idle"; this.beamT = 0; this.beamCd = CONFIG.source.beamCd; this.beamX = CONFIG.view.w + 100;
          // physical kit: a flash-charge and a converging shard drop
          this.dashState = "idle"; this.dashT = 0; this.dashCd = CONFIG.source.dashCd; this.dashTX = 0; this.dashTY = 0; this.dashDX = 0; this.dashDY = 0; this.dashGhosts = [];
          this.collapseState = "idle"; this.collapseWT = 0; this.riftCollapseCd = CONFIG.source.riftCollapseCd;
          this._burstN = 0; this._burstT = 0;
          // SOFT BREACH locomotion is deliberately separate from RIFT DASH. Its line
          // is captured once, and recoil owns movement long enough for a blade counter
          // to create real space instead of being erased by the normal hover steering.
          this.breachState = "follow"; this.breachCd = this._rollBreachCd();
          this.breachT = 0; this.breachMaxT = 0; this.breachSpeed = 0;
          this.breachDX = 1; this.breachDY = 0;
          this.breachCommitX = x; this.breachCommitY = y;
          this.breachDestX = x; this.breachDestY = y;
          this.breachStartX = x; this.breachStartY = y;
          this.breachLane = null;
          this.breachContactSpent = false; this.breachRepelGraceT = 0;
          this.breachRecoilVX = 0; this.breachRecoilVY = 0;
          this.breachNudgeVX = 0; this.breachNudgeVY = 0; this.breachRipple = 0;
          // PREDATORY ORBIT: ordinary locomotion changes side, height and reach instead
          // of converging on one forever-safe point just above the player's blade.
          this.predatorDecisionT = 0; this.predatorEngageT = 0;
          this.predatorSide = GAME_RANDOM.next() < 0.5 ? -1 : 1;
          this.predatorDist = CONFIG.source.predatorStalkMin;
          this.predatorY = CONFIG.source.predatorYMin;
          this.formScale = 1; this.voidFormAwake = false;
          // The Void Run is not a flat sprite swap. The Source withdraws behind the
          // route, manifests an attack on the play plane, then breaches forward into
          // a guaranteed damage window.
          this.depthPlane = "foreground"; this.depthState = "idle";
          this.depthT = 0; this.depthMaxT = 0; this.depthCd = CONFIG.source.depthFirstDelay;
          this.depthKind = "hand"; this.depthAttackIndex = 0;
          this.depthTargetX = x; this.depthTargetY = y;
          this.rearX = x; this.rearY = 210;
          // A fall can feed the Source only through this authored, severable tether.
          this.siphon = null; this.siphonFalls = 0; this.siphonHealed = 0;
        }
        get phase() {
          const f = this.hp / this.maxHp, C = CONFIG.source;
          const fromHp = f > C.voidTier ? 1 : (f > C.fakeTier ? 2 : 3);
          return Math.max(this.phaseMarker || 1, fromHp);   // siphon healing never reopens a completed phase
        }
        override damageTakenMult() { return this.mode === "downed" ? 0.3 : (this.mode === "void" ? CONFIG.source.voidDamageTaken : 1); }
        override blocksDamage() { return this.depthPlane === "rear"; }
        override blocks() { return this.depthPlane === "rear"; }
        _voidDmg(dmg: number) { return this.mode === "void" ? dmg * CONFIG.source.voidDamageMult : dmg; }
        _awakenVoidForm() {
          if (this.voidFormAwake) return;
          this.voidFormAwake = true;
          this.weight = this.cfg.weight * CONFIG.source.voidWeightMult;
          this.phaseTag = "THE VOID RUN";
        }
        beginVoidRun() {
          this.mode = "void"; this.collapsing = false; this.voidDelayT = -1;
          this.requestVoid = false; this.requestVoidCinematic = false; this._awakenVoidForm();
          this.depthPlane = "rear"; this.depthState = "rearIdle"; this.depthCd = CONFIG.source.depthFirstDelay;
          this._cancelSoftBreach(CONFIG.source.breachIntervalMin);
          bossFeedback(this, "phaseTransition", { banner: "THE VOID RUN", color: this.color, zoom: 0.06 });
        }
        // Preserve the authored phase turns against a single late-run burst without
        // deleting the player's damage: part of the overflow crosses the line, capped
        // far above the next phase gate so every form still gets to act.
        override limitIncomingDamage(dmg: number) {
          const C = CONFIG.source, gate = this.phase === 1 ? C.voidTier : (this.phase === 2 ? C.fakeTier : 0);
          const gateHp = this.maxHp * gate;
          if (gate > 0 && this.mode !== "downed" && this.hp > gateHp && this.hp - dmg < gateHp) {
            const toGate = this.hp - gateHp, overflow = Math.max(0, dmg - toGate);
            dmg = toGate + Math.min(overflow * C.phaseOverflowCarry, this.maxHp * C.phaseOverflowCap);
          }
          return dmg;
        }

        _rollDepthCd() {
          const C = CONFIG.source, trueForm = this.phaseMarker >= 3;
          const lo = C.depthCycleMin * (trueForm ? 0.74 : 1), hi = C.depthCycleMax * (trueForm ? 0.78 : 1);
          return lo + GAME_RANDOM.next() * (hi - lo);
        }
        _depthSurface(player: EnemyPlayerPort, platforms: readonly EnemyPlatform[]) {
          if (player.supportPlatform) return player.supportPlatform;
          let best = null, score = Infinity;
          for (const p of platforms) {
            if (!p.oneway || p.materializationState === "gone") continue;
            const inside = player.x >= p.x - 24 && player.x <= p.x + p.w + 24;
            const s = Math.abs((p.x + p.w / 2) - player.x) + Math.abs(p.y - (player.y + player.hh)) * (inside ? 0.25 : 1.5);
            if (s < score) { score = s; best = p; }
          }
          return best;
        }
        _startDepthAttack(player: EnemyPlayerPort, platforms: readonly EnemyPlatform[]) {
          const C = CONFIG.source, surface = this._depthSurface(player, platforms);
          this.depthKind = ["hand", "spear", "maw"][this.depthAttackIndex++ % 3] ?? "hand";
          this.depthTargetX = clamp(player.x, 70, CONFIG.view.w - 70);
          this.depthTargetY = surface ? surface.y : clamp(player.y + player.hh, 170, CONFIG.world.groundY);
          if (this.depthKind === "maw") this.depthTargetX = clamp(this.depthTargetX + (this.depthTargetX < CONFIG.view.w / 2 ? 78 : -78), C.depthMawW / 2, CONFIG.view.w - C.depthMawW / 2);
          this.depthState = "rearTell"; this.depthT = C.depthTell; this.depthMaxT = this.depthT;
          this.echoCaption = this.depthKind === "hand" ? "ABYSSAL HAND" : (this.depthKind === "spear" ? "PARALLAX SPEAR" : "HORIZON MAW");
          this.captionT = C.depthTell + 0.35; perilPing(this); bossFeedback(this, "windup", { quiet: true });
          try { SFX.sourceDepthPrepare(this.depthKind); } catch { /* audio feedback is best-effort */ }
        }
        _manifestDepth() {
          const C = CONFIG.source;
          this.depthPlane = "breach"; this.depthState = "exposed"; this.depthT = C.depthExpose; this.depthMaxT = this.depthT;
          this.x = clamp(this.depthTargetX, this.hw + 18, CONFIG.view.w - this.hw - 18);
          this.y = clamp(this.depthTargetY - 150, 105, CONFIG.world.groundY - this.hh - 20);
          this.vx = 0; this.vy = 0; this.breachRipple = 1;
          bossFeedback(this, "counter", { quiet: true, color: CONFIG.colors.perfect });
        }
        _strikeDepth(player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
          const C = CONFIG.source;
          try { SFX.sourceDepthSnap(this.depthKind); } catch { /* audio feedback is best-effort */ }
          if (this.depthKind === "spear") {
            const dx = this.depthTargetX - this.rearX, dy = this.depthTargetY - this.rearY, m = len(dx, dy) || 1;
            const p = new Projectile(this.rearX, this.rearY, dx / m * C.depthSpearSpeed, dy / m * C.depthSpearSpeed);
            p.r = C.depthSpearR; p.dmg = this._voidDmg(C.depthSpearDmg); p.tint = CONFIG.colors.perfect; p.owner = this;
            p.sourceStolen = "depth"; p.depthManifestation = true; projectiles.push(p);
          } else {
            const half = (this.depthKind === "hand" ? C.depthHandW : C.depthMawW) / 2;
            const vertical = this.depthKind === "hand" ? 180 : 105;
            if (Math.abs(player.x - this.depthTargetX) <= half + player.hw && Math.abs((player.y + player.hh) - this.depthTargetY) <= vertical) {
              player.takeDamage(this._voidDmg(this.depthKind === "hand" ? C.depthHandDmg : C.depthMawDmg), this.depthTargetX, this);
            }
          }
          FX.shockwave(this.depthTargetX, this.depthTargetY, 16, CONFIG.colors.perfect, this.depthKind === "maw" ? 330 : 220, 5);
          bossFeedback(this, "contact", { quiet: true, color: CONFIG.colors.perfect });
        }
        _tickDepth(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
          if (this.mode !== "void") return false;
          this.rearX = lerp(this.rearX, clamp(CONFIG.view.w * 0.72 + (player.x - CONFIG.view.w / 2) * 0.14, 260, CONFIG.view.w - 190), clamp(1.8 * dt, 0, 1));
          this.rearY = lerp(this.rearY, 205 + Math.sin(CLOCK.sim * 0.72) * 28, clamp(1.6 * dt, 0, 1));
          if (this.depthState === "rearIdle") {
            this.depthPlane = "rear"; this.x = this.rearX; this.y = this.rearY; this.vx = 0; this.vy = 0;
            this.depthCd -= dt;
            if (this.depthCd <= 0 && player.supportPlatform && player.voidTransferT <= 0) this._startDepthAttack(player, platforms);
            return true;
          }
          if (this.depthState === "rearTell") {
            this.depthPlane = "rear"; this.x = this.rearX; this.y = this.rearY; this.depthT -= dt;
            if (this.depthT <= 0) {
              this.depthState = "rearStrike"; this.depthT = CONFIG.source.depthStrike; this.depthMaxT = this.depthT;
              this._strikeDepth(player, projectiles);
            }
            return true;
          }
          if (this.depthState === "rearStrike") {
            this.depthPlane = "rear"; this.x = this.rearX; this.y = this.rearY; this.depthT -= dt;
            if (this.depthT <= 0) this._manifestDepth();
            return true;
          }
          if (this.depthState === "exposed") {
            this.depthPlane = "breach"; this.depthT -= dt;
            this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1)); this.vy = lerp(this.vy, 0, clamp(8 * dt, 0, 1));
            if (this.depthT <= 0) {
              this.depthPlane = "rear"; this.depthState = "rearIdle"; this.depthCd = this._rollDepthCd();
              this.rearX = this.x; this.rearY = this.y;
            }
            return true;
          }
          this.depthState = "rearIdle"; this.depthPlane = "rear"; this.depthCd = this._rollDepthCd();
          return true;
        }

        _healCeiling() {
          const C = CONFIG.source;
          if (this.phaseMarker >= 3) return this.maxHp * C.fakeTier;
          if (this.phaseMarker >= 2) return this.maxHp * C.voidTier;
          return this.maxHp;
        }
        _receiveSiphonHeal(amount: number) {
          const C = CONFIG.source, encounterLeft = Math.max(0, this.maxHp * C.siphonTotalCap - this.siphonHealed);
          const room = Math.max(0, this._healCeiling() - this.hp), actual = Math.min(amount, encounterLeft, room);
          if (actual > 0) { this.hp += actual; this.hpDisplay = Math.max(this.hpDisplay, this.hp); this.siphonHealed += actual; }
          return actual;
        }
        startVoidSiphon(player: EnemyPlayerPort) {
          if (this.dead || this.dying || this.mode !== "void") return 0;
          const C = CONFIG.source, diminish = [C.siphonDiminish1, C.siphonDiminish2, C.siphonDiminish3, C.siphonDiminish4][Math.min(this.siphonFalls, 3)] ?? C.siphonDiminish4;
          this.siphonFalls++;
          const immediate = this._receiveSiphonHeal(this.maxHp * C.siphonImmediateFrac * diminish);
          const channel = Math.min(this.maxHp * C.siphonChannelFrac * diminish, Math.max(0, this.maxHp * C.siphonTotalCap - this.siphonHealed));
          this.siphon = { t: C.siphonDuration, maxT: C.siphonDuration, amount: channel, healed: 0, x: player.x, y: player.y };
          this.echoCaption = "THE ABYSS FEEDS"; this.captionT = 1.2;
          bossFeedback(this, "windup", { banner: "SEVER THE TETHER", color: CONFIG.colors.perfect, priority: 7 });
          return immediate;
        }
        _tickSiphon(dt: number, player: EnemyPlayerPort) {
          if (!this.siphon) return;
          const s = this.siphon; s.x = player.x; s.y = player.y - 8; s.t -= dt;
          const want = Math.min(s.amount, s.healed + s.amount * dt / s.maxT);
          const healed = this._receiveSiphonHeal(Math.max(0, want - s.healed)); s.healed += healed;
          if (s.t <= 0 || s.healed >= s.amount - 0.01 || this.dead || this.dying) this.siphon = null;
        }
        trySeverSiphon(blade: { x: number; y: number; tipX: number; tipY: number; tipSpeed: number }) {
          if (!this.siphon || blade.tipSpeed < CONFIG.source.siphonCutSpeed) return false;
          const ex = this.depthPlane === "rear" ? this.rearX : this.x, ey = this.depthPlane === "rear" ? this.rearY : this.y;
          if (segSegmentDist(blade.x, blade.y, blade.tipX, blade.tipY, this.siphon.x, this.siphon.y, ex, ey) > CONFIG.source.siphonCutRadius) return false;
          this.siphon = null; this.echoCaption = "HUNGER SEVERED"; this.captionT = 1.1; this.breachRipple = 1;
          bossFeedback(this, "counter", { banner: "SIPHON SEVERED", color: CONFIG.colors.perfect, priority: 8 });
          return true;
        }

        _rollBreachCd() {
          const C = CONFIG.source;
          return C.breachIntervalMin + GAME_RANDOM.next() * (C.breachIntervalMax - C.breachIntervalMin);
        }
        _softBreachBlocked(player: EnemyPlayerPort) {
          const locomotionMode = this.mode === "cycle" || this.mode === "void";
          const voidTransfer = this.mode === "void" && (!player.voidLane || !player.supportPlatform || player.voidTransferT > 0);
          return !locomotionMode || voidTransfer || this.collapsing || this.voidDelayT > 0 ||
            this.beamState !== "idle" || this.dashState !== "idle" || this.collapseState !== "idle" ||
            this.introT > 0 || this.dead || this.dying || this.breachRepelGraceT > 0 ||
            player.voidSlowT > 0;   // a rescue/forced connector is never a breach window
        }
        _cancelSoftBreach(extraCd = 0) {
          if (this.breachState !== "follow") {
            this.breachState = "follow"; this.breachT = 0; this.breachContactSpent = true;
            this.breachRecoilVX = 0; this.breachRecoilVY = 0;
          }
          this.breachLane = null;
          this.breachCd = Math.max(this.breachCd, extraCd || 0);
        }
        _startSoftBreach(player: EnemyPlayerPort) {
          const C = CONFIG.source;
          let dx = player.x - this.x, dy = player.y - this.y; const d = len(dx, dy) || 1;
          dx /= d; dy /= d;
          const beyond = C.breachPassMin + GAME_RANDOM.next() * (C.breachPassMax - C.breachPassMin);
          this.breachSpeed = C.breachSpeedMin + GAME_RANDOM.next() * (C.breachSpeedMax - C.breachSpeedMin);
          this.breachDX = dx; this.breachDY = dy;
          this.breachCommitX = player.x; this.breachCommitY = player.y;
          this.breachLane = this.mode === "void" ? (player.voidLane ?? null) : null;
          // the breach passes THROUGH the player and beyond — but the Source must never
          // leave the arena, so the destination is clamped on-screen (a breach toward a
          // near wall simply stops at it instead of flying off the map and dying)
          this.breachDestX = clamp(player.x + dx * beyond, this.hw, CONFIG.view.w - this.hw);
          this.breachDestY = clamp(player.y + dy * beyond, 60, CONFIG.world.groundY - this.hh);
          this.breachStartX = this.x; this.breachStartY = this.y;
          this.breachState = "tell";
          this.breachT = C.breachTellMin + GAME_RANDOM.next() * (C.breachTellMax - C.breachTellMin);
          this.breachMaxT = this.breachT;
          this.breachContactSpent = false; this.vx = 0; this.vy = 0;
          this.predatorEngageT = 0;
          FX.ring(this.x, this.y, 12, this.color);
          bossFeedback(this, "windup", { quiet: true });
        }
        _finishSoftBreach() {
          this.breachState = "follow"; this.breachT = 0; this.breachContactSpent = true;
          this.breachRecoilVX = 0; this.breachRecoilVY = 0;
          this.breachLane = null;
          this.breachCd = this._rollBreachCd();
          this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
          this.y = clamp(this.y, 70, CONFIG.world.groundY - this.hh);
        }
        _applyBreachNudge(dt: number) {
          if (Math.abs(this.breachNudgeVX) + Math.abs(this.breachNudgeVY) < 0.1) {
            this.breachNudgeVX = 0; this.breachNudgeVY = 0; return;
          }
          this.x += this.breachNudgeVX * dt; this.y += this.breachNudgeVY * dt;
          const damp = Math.exp(-16 * dt);
          this.breachNudgeVX *= damp; this.breachNudgeVY *= damp;
        }
        _tickSoftBreach(dt: number) {
          const C = CONFIG.source;
          if (this.breachState === "tell") {
            this.breachT -= dt;
            this.vx = lerp(this.vx, 0, clamp(10 * dt, 0, 1)); this.vy = lerp(this.vy, 0, clamp(10 * dt, 0, 1));
            this._applyBreachNudge(dt);
            if (this.breachT <= 0) {
              const travel = len(this.breachDestX - this.x, this.breachDestY - this.y);
              this.breachState = "drift";
              this.breachT = Math.min(C.breachMaxDur, travel / this.breachSpeed + 1 / 60);
              this.breachMaxT = this.breachT;
            }
            return;
          }
          if (this.breachState === "drift") {
            this.breachT -= dt;
            this.vx = this.breachDX * this.breachSpeed; this.vy = this.breachDY * this.breachSpeed;
            this.x += this.vx * dt; this.y += this.vy * dt; this._applyBreachNudge(dt);
            this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw); this.y = clamp(this.y, 60, CONFIG.world.groundY - this.hh);
            const remain = (this.breachDestX - this.x) * this.breachDX + (this.breachDestY - this.y) * this.breachDY;
            if (remain <= 0 || this.breachT <= 0) this._finishSoftBreach();
            return;
          }
          if (this.breachState === "recoil") {
            this.breachT -= dt;
            this.x += this.breachRecoilVX * dt; this.y += this.breachRecoilVY * dt; this._applyBreachNudge(dt);
            const damp = Math.exp(-C.breachRecoilDrag * dt);
            this.breachRecoilVX *= damp; this.breachRecoilVY *= damp;
            this.vx = this.breachRecoilVX; this.vy = this.breachRecoilVY;
            this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);   // recoil stays fully on-screen — the Source never leaves the arena
            this.y = clamp(this.y, 50, CONFIG.world.groundY - this.hh);
            if (this.breachT <= 0) this._finishSoftBreach();
          }
        }

        override contactDamageEnabled() {
          if (this.depthPlane === "rear" || this.depthState === "exposed") return false;
          if (this.breachState === "tell" || this.breachState === "recoil") return false;
          if (this.breachState === "drift") return !this.breachContactSpent;
          return true;
        }
        override contactDamageAmount() { return this._voidDmg(this.breachState === "drift" ? CONFIG.source.breachDmg : this.contactDmg); }
        override onContactDamage() { if (this.breachState === "drift") this.breachContactSpent = true; }

        onBladeImpulse(hit: { held: boolean; tipSpeed?: number; tipVX?: number; tipVY?: number;
          player?: Readonly<{ voidLane?: string | null }> }) {
          if (!hit.held) return { handled: false };
          const C = CONFIG.source, speed = hit.tipSpeed ?? len(hit.tipVX ?? 0, hit.tipVY ?? 0);
          const m = len(hit.tipVX ?? 0, hit.tipVY ?? 0) || 1;
          const nx = (hit.tipVX ?? 0) / m, ny = (hit.tipVY ?? 0) / m;
          // Authored attacks retain authority: a body hit may deal damage, but cannot
          // cancel the high-threat dash/collapse, a beam, the kneel, or the Void Run.
          const locomotionMode = this.mode === "cycle" || this.mode === "void";
          const immune = !locomotionMode || this.collapsing || this.voidDelayT > 0 ||
            this.beamState !== "idle" || this.dashState !== "idle" || this.collapseState !== "idle" ||
            this.introT > 0 || this.dead || this.dying;
          if (immune) return { handled: true, immune: true };

          if (speed >= C.breachRepelMinSpeed && this.breachRepelGraceT <= 0 && this.breachState !== "recoil") {
            const k = clamp((speed - C.breachRepelMinSpeed) / 2600, 0, 1);
            const force = lerp(C.breachRepelVMin, C.breachRepelVMax, k);
            this.breachState = "recoil";
            this.breachT = C.breachSteerLockMin + GAME_RANDOM.next() * (C.breachSteerLockMax - C.breachSteerLockMin);
            this.breachMaxT = this.breachT;
            this.breachDX = nx; this.breachDY = ny;
            this.breachLane = this.mode === "void" && hit.player ? (hit.player.voidLane ?? null) : null;
            this.breachRecoilVX = nx * force; this.breachRecoilVY = ny * force;
            this.breachContactSpent = true; this.breachRepelGraceT = C.breachRepelGrace; this.breachRipple = 1;
            FX.burst(this.x, this.y, nx, ny, 10, this.color); FX.ring(this.x, this.y, 16, CONFIG.colors.perfect);
            bossFeedback(this, "counter", { color: CONFIG.colors.perfect, quiet: true });
            return { handled: true, repelled: true, force };
          }

          // Weak or grace-window cuts only add a capped physical nudge. They never
          // reset a tell/recoil timer, so rapid taps cannot hold the boss indefinitely.
          let weakNX = nx, weakNY = ny;
          if (this.breachState === "tell" || this.breachState === "drift") {
            // Keep the authored crossover line through the captured player point. A
            // weak graze may advance/retard it, but only a committed cut can knock it
            // off that line and cancel the breach outright.
            const along = nx * this.breachDX + ny * this.breachDY;
            weakNX = this.breachDX * along; weakNY = this.breachDY * along;
          }
          this.breachNudgeVX += weakNX * C.breachWeakNudge; this.breachNudgeVY += weakNY * C.breachWeakNudge;
          const nm = len(this.breachNudgeVX, this.breachNudgeVY);
          if (nm > C.breachWeakNudgeCap) {
            this.breachNudgeVX *= C.breachWeakNudgeCap / nm; this.breachNudgeVY *= C.breachWeakNudgeCap / nm;
          }
          return { handled: true, nudged: true };
        }
  }
  return SourceCore;
}

export type SourceCoreConstructor = ReturnType<typeof createSourceCore>;

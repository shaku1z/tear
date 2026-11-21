import { BOSS_BODY_CONTACT, type BossBodyContactRow } from "../../boss-body-contact";
import {
  practicePhaseEntryHealth,
  type BossPracticeActorEntry,
  type PracticeBossPhase,
} from "../../../training/boss-phase-practice-runtime";
import type {
  ArenaZone,
  EnemyDependencies,
  EnemyPlatform,
  EnemyPlayerPort,
  EnemyProjectile,
} from "../../enemy-contracts";
import type { MoveEndReason } from "../../move-lifetime";
import type { EnemyBaseConstructor } from "../enemy-base";
import type { BossRuntime } from "../boss-runtime";
import { ROOTBOUND_REBUILD_DEFINITION } from "../../../run/boss-definitions";
import { ROOTBOUND_BODY, ROOTBOUND_CADENCE, ROOTBOUND_MOVES } from "./rootbound-moves";
import { BRAMBLE_ROWS_TICKS, RootboundZones } from "./rootbound-zones";

/**
 * The new Rootbound (plans/active/VERDANT_PALE_REBUILD.md, 2.1): a body with a move table, built the way
 * Aldric, the Colossus and the Echo are. It walks at the player, burrows to them, vaults up to them and
 * crowds them back. From Phase II it swings twice and plants its vine to drive a Root Seam, lights Bramble
 * Rows and Mends when the player stands back; in Phase III it is faster and Spring Surges from the arena's
 * centre. Every move is a `state`; lengths are ticks, counted one per
 * update (`stateT` is what is left, `stateLen` the whole). Each phase change is a move of its own (Uproot,
 * Last Bloom), so nothing stops the fight.
 *
 * Engineering channel only (Boss Test) until the switch slice replaces the old Rootbound with it.
 */

/** Under the floor: no body to hit, touch or push against. */
const UNDER_STATES: ReadonlySet<string> = new Set(["burrow", "resurface", "uprootunder", "bloomunder"]);
/**
 * Open: it takes more damage (a parried swing or a cut vine, a Surface Strike's, a Thorn Burst's and a Spring
 * Surge's recovery, kneeling through its Bramble Rows, and a broken Mend).
 */
const OPEN_STATES: ReadonlySet<string> = new Set([
  "staggered",
  "split",
  "burstrecover",
  "bramble",
  "mendsplit",
  "springslam",
]);
/** The phase changes: moves of their own, which the practice runtime waits out. */
const CHANGE_STATES: ReadonlySet<string> = new Set(["uprootsink", "uprootunder", "bloomsink", "bloomunder"]);
/** The swings the vine can be parried in, the first and Phase II's second. */
const SWING_STATES: ReadonlySet<string> = new Set(["swing", "swing2"]);
/** One second of ticks, for the per-second rates. */
const TICKS_PER_SECOND = 120;
/** What it does at rest: walking at the player or stepping back to keep its reach. */
const REST_STATES: ReadonlySet<string> = new Set(["idle", "walk"]);

export function createRootboundRebuildType(
  dependencies: EnemyDependencies,
  Enemy: EnemyBaseConstructor,
  bossRuntime: BossRuntime,
) {
  const { CONFIG, FX, Projectile, clamp, segPointDist } = dependencies;
  const { bossFeedback, bossPhaseBeat, perilPing, stressArenaPlatform } = bossRuntime;
  const M = ROOTBOUND_MOVES;
  const LEAF = CONFIG.colors.rootbinder;

  class RootboundRebuild extends Enemy {
    state = "idle";
    /** Ticks left in the state, and its whole length, for the poses. */
    stateT = 0;
    stateLen = 1;
    introT = 0;
    /** The phase it has entered (its committed phase), as opposed to the phase its health is in. */
    enteredPhase = 1;
    /** Ticks until it may attack again. */
    attackT: number = ROOTBOUND_CADENCE.firstAttack;
    burrowCd: number = M.burrow.cooldown;
    vaultCd = 0;
    burstCd = 0;
    /** Ticks the player has stood above it, and crowded it. */
    aboveT = 0;
    crowdT = 0;
    /** True once the swing in progress has hit, or been parried. */
    hitSpent = false;
    /** Where Canopy Vault lands, and where it left from. */
    vaultTarget: EnemyPlatform | null = null;
    vaultFromX = 0;
    vaultFromY = 0;
    vaultToX = 0;
    vaultToY = 0;
    /** The parry window of the vine, while it swings. */
    batonStrike = 0;
    brambleCd = 0;
    springCd = 0;
    /** Where Spring Surge left from. */
    springFromX = 0;
    /** Ticks since the player last hurt it, and its health a tick ago, for Mend. */
    quietT = 0;
    lastHp = 0;
    /** The health it entered Phase II with: Mend never heals above it. */
    phaseTwoHp = 0;
    /** Surface Strikes left in the Burrow in progress, and the radius of the Thorn Burst in progress. */
    surfacesLeft = 0;
    ringRadius: number = M.thornBurst.radius;
    /** True while the rise in progress is Last Bloom's, which ends in a Thorn Burst ring, not the column. */
    blooming = false;
    /** Where the planted vine's root is in the floor. */
    rootX = 0;
    readonly field = new RootboundZones(CONFIG.view.w);
    /** What the world damages through and the shared zone renderer draws. */
    zones: ArenaZone[] = [];
    zoneColor = LEAF;

    override bodyContact: BossBodyContactRow | null = BOSS_BODY_CONTACT["rootbound-rebuild"];

    constructor(x: number, y: number) {
      super(x, y, { ...ROOTBOUND_BODY });
      this.kind = ROOTBOUND_REBUILD_DEFINITION.id;
      this.bossId = ROOTBOUND_REBUILD_DEFINITION.id;
      this.bossName = "THE ROOTBOUND";
      this.epithet = "KEEPER OF THE LAST MERCY";
      // The Verdant boss's feedback, music and banners; only its body and moves are new.
      this.presentationId = "rootbound";
      this.phaseMarks = [...ROOTBOUND_REBUILD_DEFINITION.phaseMarks];
      this.phaseTag = "THE KEEPER";
      this.isBoss = true;
      this.color = CONFIG.colors.boss;
      this.facing = -1;
      this.lastHp = this.hp;
    }

    get phase(): number {
      const fraction = this.maxHp > 0 ? this.hp / this.maxHp : 0;
      const [second, third] = ROOTBOUND_REBUILD_DEFINITION.phaseMarks;
      return fraction <= third ? 3 : fraction <= second ? 2 : 1;
    }

    /** Practice requests cross an authored threshold; the update makes the change, as in a fight. */
    requestPracticePhase(phase: 2 | 3): boolean {
      const entry = this.practicePhaseEntry();
      if (!entry.ready || entry.targetPhase !== entry.phase || phase !== entry.phase + 1 || this.dying || this.hp <= 0)
        return false;
      this.hp = this.maxHp * practicePhaseEntryHealth(ROOTBOUND_REBUILD_DEFINITION.phaseMarks, phase);
      this.hpDisplay = this.hp;
      return true;
    }

    practicePhaseEntry(): BossPracticeActorEntry {
      const uprooting = CHANGE_STATES.has(this.state);
      return Object.freeze({
        phase: this.enteredPhase as PracticeBossPhase,
        targetPhase: this.phase as PracticeBossPhase,
        ready: this.introT <= 0 && !uprooting,
        stage: this.introT > 0 ? "opening" : uprooting ? "transition" : "combat",
      });
    }

    /** How far through the state it is, 0 to 1. */
    progress(): number {
      return clamp(1 - this.stateT / Math.max(1, this.stateLen), 0, 1);
    }

    /** True while it is under the floor. */
    get hidden(): boolean {
      return UNDER_STATES.has(this.state);
    }

    exposed(): boolean {
      return OPEN_STATES.has(this.state);
    }

    override bodyContactLabel(): string {
      return this.state;
    }

    /** Under the floor, or still coming up through it, there is no body to push against. */
    override bodyBlocks(): boolean {
      return super.bodyBlocks() && !this.hidden && this.state !== "rise";
    }

    override blocksDamage(): boolean {
      return this.introT > 0 || this.hidden;
    }

    override limitIncomingDamage(damage: number): number {
      return this.introT > 0 || this.hidden ? 0 : damage;
    }

    override damageTakenMult(): number {
      return this.exposed() ? ROOTBOUND_CADENCE.openDamageTaken : 1;
    }

    /** The vine, from the shoulder to its tip, while it can be parried. */
    batonSegment() {
      const a = this.vineShoulder(),
        b = this.vineTip();
      return { a, b, x1: a.x, y1: a.y, x2: b.x, y2: b.y, radius: 10 };
    }

    /** A held-blade parry of the swinging vine: the swing does not land, and it staggers, open. */
    parryBaton(): boolean {
      if (this.dying || !SWING_STATES.has(this.state) || this.hitSpent) return false;
      this.hitSpent = true;
      this.batonStrike = 0;
      this.go("staggered", M.vineSwing.stagger);
      bossFeedback(this, "stagger", { banner: "PARRIED", color: LEAF, quiet: true });
      return true;
    }

    /** The planted vine's root, which one blade hit cuts, held or thrown; null while nothing is planted. */
    cutPoint(): { x: number; y: number; r: number } | null {
      if (this.dying || this.state !== "planted") return null;
      return { x: this.rootX, y: CONFIG.world.groundY - M.rootSeam.root / 2, r: M.rootSeam.root };
    }

    /** A blade cut the planted vine: the seam ends this tick, and it staggers, open. */
    cutPart(): boolean {
      if (this.cutPoint() === null) return false;
      this.field.endSeam();
      this.zones = this.field.list;
      this.go("staggered", M.vineSwing.stagger);
      bossFeedback(this, "stagger", { banner: "CUT", color: LEAF, quiet: true });
      return true;
    }

    /** Its seam and rows end with the move: on the phase-change tick and when death starts. */
    override endMoveZones(reason: MoveEndReason): void {
      void reason;
      this.field.clear();
      this.zones = this.field.list;
    }

    vineShoulder() {
      return { x: this.x + this.facing * this.hw * 0.5, y: this.y - this.hh * 0.3 };
    }

    /** The vine's angle from the facing direction: drawn back and up in the coil, swept down through the swing. */
    vineAngle(): number {
      const k = this.progress();
      if (this.state === "swingwind" || this.state === "swing2wind") return -1.25 * k;
      if (SWING_STATES.has(this.state)) return -1.25 + 1.65 * k;
      return 0.4;
    }

    vineTip() {
      const s = this.vineShoulder(),
        a = this.vineAngle();
      return { x: s.x + this.facing * Math.cos(a) * M.vineSwing.reach, y: s.y + Math.sin(a) * M.vineSwing.reach };
    }

    go(state: string, ticks: number): void {
      this.state = state;
      this.stateT = ticks;
      this.stateLen = Math.max(1, ticks);
    }

    update(dt: number, platforms: EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      this.tickTimers(dt);
      if (this.introT > 0) {
        this.vx = 0;
        this.integrate(dt, platforms);
        return;
      }
      this.enterPhases();
      this.quietT = this.hp < this.lastHp ? 0 : this.quietT + 1;
      if (REST_STATES.has(this.state)) this.rest(dt, platforms, player);
      else this.move(dt, platforms, player, projectiles);
      this.field.step(dt);
      this.zones = this.field.list;
      this.lastHp = this.hp;
      this.batonStrike = SWING_STATES.has(this.state) && !this.hitSpent ? 1 : 0;
      this.immuneToBlade = this.hidden;
      this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
    }

    /**
     * The phase changes on the tick its health crosses the mark: into Phase II with Uproot, into Phase III with
     * Last Bloom. Health that crosses both at once enters Phase II first; the next mark ends Uproot (the phase
     * change ends the move in progress) and starts Last Bloom.
     */
    enterPhases(): void {
      if (this.phase <= this.enteredPhase || CHANGE_STATES.has(this.state)) return;
      const change = this.enteredPhase < 2 ? M.uproot : M.lastBloom;
      this.phaseTag = change.banner;
      bossPhaseBeat(this, change.banner, LEAF);
      this.vx = 0;
      if (this.enteredPhase < 2) this.phaseTwoHp = this.hp;
      this.go(this.enteredPhase < 2 ? "uprootsink" : "bloomsink", change.sink);
      this.enteredPhase += 1;
    }

    /** A per-phase entry of a three-entry list. */
    byPhase<T>(list: readonly [T, T, T]): T {
      return list[Math.min(3, Math.max(1, this.enteredPhase)) - 1] as T;
    }

    /** Walking at the player, or stepping back inside its spacing, until a move is chosen. */
    rest(dt: number, platforms: EnemyPlatform[], player: EnemyPlayerPort): void {
      this.facing = Math.sign(player.x - this.x) || this.facing;
      const dx = Math.abs(player.x - this.x);
      const feet = this.y + this.hh,
        playerFeet = player.y + player.hh;
      const level = Math.abs(playerFeet - feet) < ROOTBOUND_CADENCE.level;
      const dir = dx < ROOTBOUND_CADENCE.spacing ? -this.facing : this.facing;
      this.vx = (dir * this.speed * this.byPhase(ROOTBOUND_CADENCE.walkSpeeds)) / ROOTBOUND_BODY.speed;
      this.state = Math.abs(this.vx) > 1 ? "walk" : "idle";
      this.attackT -= 1;
      this.burrowCd -= 1;
      this.vaultCd -= 1;
      this.burstCd -= 1;
      this.brambleCd -= 1;
      this.springCd -= 1;
      this.aboveT = playerFeet < feet - M.canopyVault.above ? this.aboveT + 1 : Math.max(0, this.aboveT - 2);
      this.crowdT = dx < M.thornBurst.crowd && Math.abs(player.y - this.y) < this.hh + 60 ? this.crowdT + 1 : 0;
      this.integrate(dt, platforms);
      if (!this.onGround) return;
      const target =
        this.aboveT >= M.canopyVault.track && this.vaultCd <= 0 ? this.vaultTargetFor(player, platforms) : null;
      if (target !== null) {
        this.startVault(target, player);
        return;
      }
      if (this.crowdT >= M.thornBurst.track && this.burstCd <= 0) {
        this.startBurst();
        return;
      }
      if (this.enteredPhase === 2 && this.quietT >= M.mend.quiet && dx > M.mend.far && this.hp < this.phaseTwoHp) {
        this.startMend();
        return;
      }
      if (this.attackT > 0) return;
      if (this.enteredPhase >= 3 && this.springCd <= 0) {
        this.startSpring();
        return;
      }
      const onFloor = playerFeet >= CONFIG.world.groundY - 8;
      if (this.enteredPhase >= 2 && this.brambleCd <= 0 && onFloor) {
        this.startBramble();
        return;
      }
      if (dx > M.burrow.farRange || this.burrowCd <= 0) {
        this.startBurrow();
        return;
      }
      if (dx <= M.vineSwing.range && level) {
        this.startSwing();
        return;
      }
      if (dx >= M.seedThrow.minRange) this.startThrow();
    }

    /** A move's windup in ticks, scaled for the phase it has entered. */
    windup(ticks: number): number {
      return Math.round(ticks * this.byPhase(ROOTBOUND_CADENCE.windupScales));
    }

    attacked(): void {
      this.attackT = this.byPhase(ROOTBOUND_CADENCE.attackCooldowns);
      this.vx = 0;
    }

    startSwing(): void {
      this.attacked();
      this.hitSpent = false;
      this.go("swingwind", this.windup(M.vineSwing.windup));
      bossFeedback(this, "windup", { quiet: true });
    }

    startThrow(): void {
      this.attacked();
      this.go("throwwind", this.windup(M.seedThrow.windup));
      bossFeedback(this, "windup", { quiet: true });
    }

    startBurrow(): void {
      this.attacked();
      this.burrowCd = M.burrow.cooldown;
      this.surfacesLeft = this.byPhase(ROOTBOUND_CADENCE.surfaces);
      this.go("sink", this.windup(M.burrow.sink));
    }

    startBramble(): void {
      this.attacked();
      this.brambleCd = M.brambleRows.cooldown;
      this.go("bramblewind", this.windup(M.brambleRows.windup));
      bossFeedback(this, "windup", { quiet: true });
    }

    startSpring(): void {
      this.attacked();
      this.springCd = M.springSurge.cooldown;
      this.springFromX = this.x;
      this.go("springwind", M.springSurge.windup);
      perilPing(this);
      bossFeedback(this, "windup", { quiet: true });
    }

    startMend(): void {
      this.vx = 0;
      this.quietT = 0;
      this.go("mendwind", M.mend.windup);
    }

    startBurst(): void {
      this.attacked();
      this.ringRadius = M.thornBurst.radius;
      this.burstCd = M.thornBurst.cooldown;
      this.crowdT = 0;
      this.hitSpent = false;
      this.go("swell", this.windup(M.thornBurst.windup));
      perilPing(this);
    }

    startVault(target: EnemyPlatform, player: EnemyPlayerPort): void {
      this.attacked();
      this.vaultCd = M.canopyVault.cooldowns[Math.min(3, this.enteredPhase) - 1] ?? M.canopyVault.cooldowns[0];
      this.aboveT = 0;
      this.vaultTarget = target;
      this.vaultFromX = this.x;
      this.vaultFromY = this.y;
      this.vaultToX = clamp(player.x, target.x + this.hw + 10, target.x + target.w - this.hw - 10);
      this.vaultToY = target.y - this.hh;
      this.go("vaultwind", this.windup(M.canopyVault.windup));
      perilPing(this);
      bossFeedback(this, "windup", { quiet: true });
    }

    /** The platform it vaults to: the one the player stands on or nearest them, within a leap, never the floor. */
    vaultTargetFor(player: EnemyPlayerPort, platforms: readonly EnemyPlatform[]): EnemyPlatform | null {
      const feet = this.y + this.hh;
      let best: EnemyPlatform | null = null,
        score = Infinity;
      for (const p of platforms) {
        if (!p.oneway || p.floor || p.materializationState === "gone") continue;
        if (p.arenaState === "warning" || p.arenaState === "reforming") continue;
        if (p.y >= feet - 24 || feet - p.y > 330) continue;
        const center = p.x + p.w / 2;
        const s =
          Math.abs(center - player.x) +
          Math.abs(p.y - (player.y + player.hh)) +
          (p === player.supportPlatform ? -420 : 0);
        if (s < score) {
          score = s;
          best = p;
        }
      }
      return best;
    }

    /** One tick of the move in progress. */
    move(dt: number, platforms: EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]): void {
      this.stateT -= 1;
      const done = this.stateT <= 0;
      switch (this.state) {
        case "swingwind":
          this.vx = 0;
          if (done) this.go("swing", M.vineSwing.hit);
          break;
        case "swing":
          this.swingHits(player);
          if (done && this.enteredPhase >= 2) this.startSecondSwing(player);
          else if (done) this.go("swingrecover", M.vineSwing.recover);
          break;
        case "throwwind":
          this.vx = 0;
          if (done) {
            this.throwPod(player, projectiles);
            this.go("throwrecover", M.seedThrow.recover);
          }
          break;
        case "sink":
        case "uprootsink":
        case "bloomsink":
          this.vx = 0;
          if (done) this.goUnder();
          break;
        case "burrow":
        case "resurface":
        case "uprootunder":
        case "bloomunder": {
          const to = this.state === "bloomunder" ? CONFIG.view.w / 2 : player.x;
          this.vx = 0;
          this.x += clamp(to - this.x, -M.burrow.speed * dt, M.burrow.speed * dt);
          const arrived = this.state === "burrow" && Math.abs(player.x - this.x) < 6;
          if (done || arrived) this.surface();
          break;
        }
        case "rise":
          this.vx = 0;
          if (done && this.blooming) this.bloom();
          else if (done) this.go("surface", M.surfaceStrike.hit);
          break;
        case "surface":
          this.columnHits(player);
          if (done) this.afterSurface();
          break;
        case "vaultwind":
          if (done) this.go("vault", M.canopyVault.flight);
          break;
        case "vault":
          this.vaultFlight(player);
          if (done) this.land(player);
          return;
        case "springwind":
          this.springFlight();
          if (done) this.springSlam(projectiles);
          return;
        case "swell":
          this.vx = 0;
          if (done) {
            this.go("burst", M.thornBurst.hit);
            FX.shockwave(this.x, this.y, 10, LEAF, this.ringRadius, 5);
          }
          break;
        case "burst":
          this.ringHits(player);
          if (done) this.go("burstrecover", M.thornBurst.recover);
          break;
        default:
          if (!this.movePhaseTwo(done, player)) {
            // swingrecover, throwrecover, split, vaultrecover, burstrecover, staggered, planted, bramblerecover,
            // mendsplit, springslam
            this.vx = 0;
            if (done) this.go("idle", 0);
          }
      }
      if (this.hidden) {
        this.y = CONFIG.world.groundY - this.hh;
        this.vy = 0;
        this.onGround = true;
      } else this.integrate(dt, platforms);
    }

    /** One tick of a Phase II move, if one is in progress; false otherwise. */
    movePhaseTwo(done: boolean, player: EnemyPlayerPort): boolean {
      switch (this.state) {
        case "swing2wind":
          this.vx = 0;
          if (done) this.go("swing2", M.secondSwing.hit);
          return true;
        case "swing2":
          this.swingHits(player);
          if (done) this.plant();
          return true;
        case "bramblewind":
          this.vx = 0;
          if (done) {
            this.field.startRows(player.x, this.x);
            this.go("bramble", BRAMBLE_ROWS_TICKS);
          }
          return true;
        case "bramble":
          this.vx = 0;
          if (done) this.go("bramblerecover", M.brambleRows.recover);
          return true;
        case "mendwind":
        case "mend":
          this.vx = 0;
          this.mendTick(done);
          return true;
        default:
          return false;
      }
    }

    /** Phase II on: a second sweep straight after the first, toward where the player is now. */
    startSecondSwing(player: EnemyPlayerPort): void {
      this.facing = Math.sign(player.x - this.x) || this.facing;
      this.hitSpent = false;
      this.go("swing2wind", this.windup(M.secondSwing.windup));
      bossFeedback(this, "windup", { quiet: true });
    }

    /** The last swing's vine stays in the floor and drives a Root Seam in the swing's direction. */
    plant(): void {
      const tip = this.vineTip();
      this.rootX = clamp(tip.x, 0, CONFIG.view.w);
      this.field.startSeam(this.rootX, this.facing);
      this.go("planted", M.rootSeam.planted);
    }

    /** Mend: any hit ends it and it splits, open; otherwise it heals, never above its Phase II health. */
    mendTick(done: boolean): void {
      if (this.hp < this.lastHp) {
        this.go("mendsplit", M.mend.broken);
        return;
      }
      if (this.state === "mendwind") {
        if (done) this.go("mend", M.mend.most);
        return;
      }
      this.hp = Math.min(this.phaseTwoHp, this.hp + (this.maxHp * M.mend.perSecond) / TICKS_PER_SECOND);
      if (done) this.go("idle", 0);
    }

    /** Under the floor: a Burrow toward the player, Uproot toward them, Last Bloom toward the centre. */
    goUnder(): void {
      if (this.state === "sink") this.go("burrow", M.burrow.maxUnder);
      else if (this.state === "uprootsink") this.go("uprootunder", M.uproot.under);
      else this.go("bloomunder", M.lastBloom.under);
    }

    /** After a Surface Strike: under again while the Burrow has surfaces left, else the open split. */
    afterSurface(): void {
      this.surfacesLeft -= 1;
      if (this.surfacesLeft > 0) this.go("resurface", this.byPhase(ROOTBOUND_CADENCE.resurfaceUnder));
      else this.go("split", M.surfaceStrike.recover);
    }

    /** Last Bloom comes up at the centre in a Thorn Burst ring. */
    bloom(): void {
      this.blooming = false;
      this.ringRadius = M.lastBloom.radius;
      this.hitSpent = false;
      this.go("burst", M.thornBurst.hit);
      FX.shockwave(this.x, this.y, 10, LEAF, this.ringRadius, 5);
    }

    /** The end of every Burrow and of each phase change: the mound swells, then the column or the ring. */
    surface(): void {
      this.facing = this.facing || 1;
      this.hitSpent = false;
      this.blooming = this.state === "bloomunder";
      // Last Bloom's rise is the phase change's, not a Phase III windup.
      this.go("rise", this.blooming ? M.surfaceStrike.windup : this.windup(M.surfaceStrike.windup));
      perilPing(this);
      bossFeedback(this, "windup", { quiet: true });
    }

    swingHits(player: EnemyPlayerPort): void {
      if (this.hitSpent || player.invulnerable) return;
      const s = this.vineShoulder(),
        t = this.vineTip();
      const near = segPointDist(s.x, s.y, t.x, t.y, player.x, player.y);
      if (near.dist > Math.max(player.hw, player.hh) + 10) return;
      this.hitSpent = true;
      player.takeDamage(M.vineSwing.damage, this.x, this);
      bossFeedback(this, "contact", { quiet: true });
    }

    columnHits(player: EnemyPlayerPort): void {
      if (this.hitSpent) return;
      const ground = CONFIG.world.groundY;
      const inside =
        Math.abs(player.x - this.x) < M.surfaceStrike.width / 2 + player.hw &&
        player.y + player.hh > ground - M.surfaceStrike.height;
      if (this.stateT === M.surfaceStrike.hit - 1) {
        FX.burst(this.x, ground, 0, -1, 12, LEAF);
        bossFeedback(this, "launch", { quiet: true });
      }
      if (!inside || player.invulnerable) return;
      this.hitSpent = true;
      player.takeDamage(M.surfaceStrike.damage, this.x, this);
    }

    ringHits(player: EnemyPlayerPort): void {
      if (this.hitSpent || player.invulnerable) return;
      const reach = this.ringRadius + Math.max(player.hw, player.hh);
      if (Math.hypot(player.x - this.x, player.y - this.y) > reach) return;
      this.hitSpent = true;
      player.takeDamage(M.thornBurst.damage, this.x, this);
    }

    throwPod(player: EnemyPlayerPort, projectiles: EnemyProjectile[]): void {
      const T = M.seedThrow.flight,
        g = M.seedThrow.gravity;
      const fromX = this.x + this.facing * this.hw * 0.6,
        fromY = this.y - this.hh * 0.5;
      const p = new Projectile(fromX, fromY, (player.x - fromX) / T, (player.y - fromY - 0.5 * g * T * T) / T);
      p.gravity = g;
      p.dmg = M.seedThrow.damage;
      p.r = M.seedThrow.radius;
      p.kind = "orb";
      p.tint = LEAF;
      p.deflectDmg = M.seedThrow.deflectDamage;
      p.life = T * 2;
      p.owner = this;
      projectiles.push(p);
      bossFeedback(this, "launch", { quiet: true });
    }

    /** Spring Surge's windup: up and over to the arena's centre, down on its last tick. */
    springFlight(): void {
      const k = this.progress(),
        smooth = k * k * (3 - 2 * k);
      this.x = this.springFromX + (CONFIG.view.w / 2 - this.springFromX) * smooth;
      this.y = CONFIG.world.groundY - this.hh - Math.sin(k * Math.PI) * M.springSurge.rise;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
    }

    /** Spring Surge lands: a root wave each way along the floor, and the seed pods arcing out. Open after. */
    springSlam(projectiles: EnemyProjectile[]): void {
      const S = M.springSurge,
        foot = CONFIG.world.groundY;
      this.x = CONFIG.view.w / 2;
      this.y = foot - this.hh;
      this.onGround = true;
      for (const dir of [-1, 1]) {
        const wave = new Projectile(this.x + dir * this.hw * 0.7, foot - S.waveRadius, dir * S.waveSpeed, 0);
        wave.setFamily("groundShock");
        wave.r = S.waveRadius;
        wave.dmg = S.waveDamage;
        wave.life = S.waveLife;
        wave.owner = this;
        wave.tint = LEAF;
        projectiles.push(wave);
      }
      for (let index = 0; index < S.pods; index += 1) {
        const angle = Math.PI + ((index + 0.5) / S.pods) * Math.PI;
        const pod = new Projectile(this.x, this.y - this.hh * 0.4, Math.cos(angle) * S.podSpeed, 0);
        pod.vy = Math.sin(angle) * S.podSpeed - S.podLift;
        pod.gravity = S.podGravity;
        pod.dmg = S.podDamage;
        pod.r = S.podRadius;
        pod.kind = "orb";
        pod.tint = LEAF;
        pod.deflectDmg = S.deflectDamage;
        pod.life = 2;
        pod.owner = this;
        projectiles.push(pod);
      }
      FX.burst(this.x, foot, 0, -1, 14, LEAF);
      bossFeedback(this, "contact", { quiet: true });
      this.go("springslam", S.recover);
    }

    vaultFlight(player: EnemyPlayerPort): void {
      const target = this.vaultTarget;
      if (target === null) {
        this.go("idle", 0);
        return;
      }
      const k = this.progress(),
        smooth = k * k * (3 - 2 * k);
      this.vaultToX = clamp(
        this.vaultToX + clamp(player.x - this.vaultToX, -1.5, 1.5),
        target.x + this.hw + 8,
        target.x + target.w - this.hw - 8,
      );
      this.x = this.vaultFromX + (this.vaultToX - this.vaultFromX) * smooth;
      this.y = this.vaultFromY + (this.vaultToY - this.vaultFromY) * smooth - Math.sin(k * Math.PI) * M.canopyVault.arc;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
    }

    land(player: EnemyPlayerPort): void {
      const target = this.vaultTarget;
      this.vaultTarget = null;
      if (target === null) {
        this.go("idle", 0);
        return;
      }
      this.x = this.vaultToX;
      this.y = target.y - this.hh;
      this.onGround = true;
      if (
        Math.abs(player.x - this.x) < M.canopyVault.range + player.hw &&
        Math.abs(player.y + player.hh - target.y) < 130 &&
        !player.invulnerable
      )
        player.takeDamage(M.canopyVault.damage, this.x, this);
      if (target.arenaPlatId) stressArenaPlatform(target, M.canopyVault.stress);
      FX.shockwave(this.x, target.y, 12, LEAF, M.canopyVault.range * 1.4, 5);
      bossFeedback(this, "contact", { quiet: true });
      this.go("vaultrecover", M.canopyVault.recover);
    }
  }

  return RootboundRebuild;
}

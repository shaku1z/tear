import { BOSS_BODY_CONTACT, type BossBodyContactRow } from "../../boss-body-contact";
import {
  practicePhaseEntryHealth,
  type BossPracticeActorEntry,
  type PracticeBossPhase,
} from "../../../training/boss-phase-practice-runtime";
import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../../enemy-contracts";
import type { EnemyBaseConstructor } from "../enemy-base";
import type { BossRuntime } from "../boss-runtime";
import { ROOTBOUND_REBUILD_DEFINITION } from "../../../run/boss-definitions";
import { ROOTBOUND_CADENCE, ROOTBOUND_MOVES } from "./rootbound-moves";

/**
 * The new Rootbound (plans/active/VERDANT_PALE_REBUILD.md, 2.1): a body with a move table, built the way
 * Aldric, the Colossus and the Echo are. It walks at the player, burrows to them, vaults up to them and
 * crowds them back. Every move is a `state`; lengths are ticks, counted one per update (`stateT` is what is
 * left, `stateLen` the whole). The phase change is a move of its own (Uproot), so nothing stops the fight.
 *
 * Engineering channel only (Boss Test) until the switch slice replaces the old Rootbound with it.
 */

/** Under the floor: no body to hit, touch or push against. */
const UNDER_STATES: ReadonlySet<string> = new Set(["burrow", "uprootunder"]);
/** Open: it takes more damage (a parried swing, a Surface Strike's and a Thorn Burst's recovery). */
const OPEN_STATES: ReadonlySet<string> = new Set(["staggered", "split", "burstrecover"]);
/** The change into Phase II: its own move, which the practice runtime waits out. */
const UPROOT_STATES: ReadonlySet<string> = new Set(["uprootsink", "uprootunder"]);
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

    override bodyContact: BossBodyContactRow | null = BOSS_BODY_CONTACT["rootbound-rebuild"];
    declare cfg: typeof CONFIG.rootbound;

    constructor(x: number, y: number) {
      super(x, y, CONFIG.rootbound);
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
      const uprooting = UPROOT_STATES.has(this.state);
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
      if (this.dying || this.state !== "swing" || this.hitSpent) return false;
      this.hitSpent = true;
      this.batonStrike = 0;
      this.go("staggered", M.vineSwing.stagger);
      bossFeedback(this, "stagger", { banner: "PARRIED", color: LEAF, quiet: true });
      return true;
    }

    vineShoulder() {
      return { x: this.x + this.facing * this.hw * 0.5, y: this.y - this.hh * 0.3 };
    }

    /** The vine's angle from the facing direction: drawn back and up in the coil, swept down through the swing. */
    vineAngle(): number {
      const k = this.progress();
      if (this.state === "swingwind") return -1.25 * k;
      if (this.state === "swing") return -1.25 + 1.65 * k;
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
      if (REST_STATES.has(this.state)) this.rest(dt, platforms, player);
      else this.move(dt, platforms, player, projectiles);
      this.batonStrike = this.state === "swing" && !this.hitSpent ? 1 : 0;
      this.immuneToBlade = this.hidden;
      this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
    }

    /** The phase changes on the tick its health crosses the mark; the change into Phase II is Uproot. */
    enterPhases(): void {
      const phase = this.phase;
      if (phase <= this.enteredPhase) return;
      if (this.enteredPhase < 2) {
        this.phaseTag = M.uproot.banner;
        bossPhaseBeat(this, M.uproot.banner, LEAF);
        this.vx = 0;
        this.go("uprootsink", M.uproot.sink);
      }
      this.enteredPhase = phase;
    }

    /** Walking at the player, or stepping back inside its spacing, until a move is chosen. */
    rest(dt: number, platforms: EnemyPlatform[], player: EnemyPlayerPort): void {
      this.facing = Math.sign(player.x - this.x) || this.facing;
      const dx = Math.abs(player.x - this.x);
      const feet = this.y + this.hh,
        playerFeet = player.y + player.hh;
      const level = Math.abs(playerFeet - feet) < ROOTBOUND_CADENCE.level;
      const dir = dx < ROOTBOUND_CADENCE.spacing ? -this.facing : this.facing;
      this.vx = dir * this.speed;
      this.state = Math.abs(this.vx) > 1 ? "walk" : "idle";
      this.attackT -= 1;
      this.burrowCd -= 1;
      this.vaultCd -= 1;
      this.burstCd -= 1;
      this.aboveT = playerFeet < feet - M.canopyVault.above ? this.aboveT + 1 : Math.max(0, this.aboveT - 2);
      this.crowdT = dx < M.thornBurst.crowd && Math.abs(player.y - this.y) < this.hh + 60 ? this.crowdT + 1 : 0;
      this.integrate(dt, platforms);
      if (!this.onGround) return;
      const target = this.aboveT >= M.canopyVault.track && this.vaultCd <= 0 ? this.vaultTargetFor(player, platforms) : null;
      if (target !== null) return this.startVault(target, player);
      if (this.crowdT >= M.thornBurst.track && this.burstCd <= 0) return this.startBurst();
      if (this.attackT > 0) return;
      if (dx > M.burrow.farRange || this.burrowCd <= 0) return this.startBurrow();
      if (dx <= M.vineSwing.range && level) return this.startSwing();
      if (dx >= M.seedThrow.minRange) return this.startThrow();
    }

    attacked(): void {
      this.attackT = ROOTBOUND_CADENCE.attackCooldown;
      this.vx = 0;
    }

    startSwing(): void {
      this.attacked();
      this.hitSpent = false;
      this.go("swingwind", M.vineSwing.windup);
      bossFeedback(this, "windup", { quiet: true });
    }

    startThrow(): void {
      this.attacked();
      this.go("throwwind", M.seedThrow.windup);
      bossFeedback(this, "windup", { quiet: true });
    }

    startBurrow(): void {
      this.attacked();
      this.burrowCd = M.burrow.cooldown;
      this.go("sink", M.burrow.sink);
    }

    startBurst(): void {
      this.attacked();
      this.burstCd = M.thornBurst.cooldown;
      this.crowdT = 0;
      this.hitSpent = false;
      this.go("swell", M.thornBurst.windup);
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
      this.go("vaultwind", M.canopyVault.windup);
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
        const s = Math.abs(center - player.x) + Math.abs(p.y - (player.y + player.hh)) + (p === player.supportPlatform ? -420 : 0);
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
          if (done) this.go("swingrecover", M.vineSwing.recover);
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
          this.vx = 0;
          if (done && this.state === "sink") this.go("burrow", M.burrow.maxUnder);
          else if (done) this.go("uprootunder", M.uproot.under);
          break;
        case "burrow":
        case "uprootunder": {
          const gap = player.x - this.x;
          this.vx = 0;
          this.x += clamp(gap, -M.burrow.speed * dt, M.burrow.speed * dt);
          const arrived = this.state === "burrow" && Math.abs(player.x - this.x) < 6;
          if (done || arrived) this.surface();
          break;
        }
        case "rise":
          this.vx = 0;
          if (done) this.go("surface", M.surfaceStrike.hit);
          break;
        case "surface":
          this.columnHits(player);
          if (done) this.go("split", M.surfaceStrike.recover);
          break;
        case "vaultwind":
          if (done) this.go("vault", M.canopyVault.flight);
          break;
        case "vault":
          this.vaultFlight(player);
          if (done) this.land(player);
          return;
        case "swell":
          this.vx = 0;
          if (done) {
            this.go("burst", M.thornBurst.hit);
            FX.shockwave(this.x, this.y, 10, LEAF, M.thornBurst.radius, 5);
          }
          break;
        case "burst":
          this.ringHits(player);
          if (done) this.go("burstrecover", M.thornBurst.recover);
          break;
        default:
          // swingrecover, throwrecover, split, vaultrecover, burstrecover, staggered
          this.vx = 0;
          if (done) this.go("idle", 0);
      }
      if (this.hidden) {
        this.y = CONFIG.world.groundY - this.hh;
        this.vy = 0;
        this.onGround = true;
      } else this.integrate(dt, platforms);
    }

    /** The end of every Burrow and of Uproot: the mound swells under the player, the column comes. */
    surface(): void {
      this.facing = this.facing || 1;
      this.go("rise", M.surfaceStrike.windup);
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
      const reach = M.thornBurst.radius + Math.max(player.hw, player.hh);
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

    vaultFlight(player: EnemyPlayerPort): void {
      const target = this.vaultTarget;
      if (target === null) return this.go("idle", 0);
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
      if (target === null) return this.go("idle", 0);
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

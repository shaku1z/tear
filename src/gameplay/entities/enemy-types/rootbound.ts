import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import { ROOTBOUND_PROVISIONAL_DEFINITION } from "../../run/boss-definitions";
import type { BossEncounterCleanupReason } from "../../run/boss-encounter";

export const ROOTBOUND_PHASE_ONE_ATTACK_ORDER = Object.freeze([
  "vine-sweep", "seed-arc", "rootline", "canopy-step",
] as const);
export type RootboundPhaseOneAttack = typeof ROOTBOUND_PHASE_ONE_ATTACK_ORDER[number];
export const ROOTBOUND_PHASE_ONE_CADENCE = Object.freeze({ openingDelay: 0.9, recovery: 0.55 });
export const ROOTBOUND_VINE_SWEEP = Object.freeze({
  windup: 0.65,
  active: 0.14,
  followThrough: 0.22,
  reach: 360,
  halfHeight: 72,
  damage: 18,
});
export type RootboundVineSweepStage = "windup" | "active" | "follow-through";
export const ROOTBOUND_SEED_ARC = Object.freeze({
  windup: 0.55,
  release: 0.3,
  launchSpeed: 560,
  gravity: 820,
  spread: 140,
  damage: 16,
  radius: 12,
});
export type RootboundSeedArcStage = "windup" | "release";
export const ROOTBOUND_ROOTLINE = Object.freeze({ windup: 0.7, active: 0.24, cleanup: 0.18, width: 430, height: 104, damage: 20 });
export type RootboundRootlineStage = "warning" | "active" | "cleanup";

/** Factory-safe Rootbound shell. C11-C13 own the authored attack phases. */
export function createRootboundType(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor) {
  const { CONFIG, Projectile } = dependencies;
  class Rootbound extends Enemy {
    declare cfg: typeof CONFIG.boss;
    introT = 0;
    phaseMarker = 1;
    override phaseTag = "KEEPER OF SPRING";
    state: "intro" | "idle" | "recover" = "idle";
    stateT: number = ROOTBOUND_PHASE_ONE_CADENCE.openingDelay;
    override facing = 1;
    override readonly phaseMarks: [number, number] = [
      ROOTBOUND_PROVISIONAL_DEFINITION.phaseMarks[0],
      ROOTBOUND_PROVISIONAL_DEFINITION.phaseMarks[1],
    ];
    readonly availableAttacks: readonly string[] = Object.freeze(["vine-sweep", "seed-arc", "rootline"]);
    readonly phaseOneAttackOrder = ROOTBOUND_PHASE_ONE_ATTACK_ORDER;
    pendingAttack: RootboundPhaseOneAttack | null = null;
    attackIndex = 0;
    vineSweepStage: RootboundVineSweepStage | null = null;
    vineSweepT = 0;
    vineSweepHitSpent = false;
    vineSweepFacing = 1;
    seedArcStage: RootboundSeedArcStage | null = null;
    seedArcT = 0;
    rootlineStage: RootboundRootlineStage | null = null;
    rootlineT = 0;
    rootlineFacing = 1;
    cleanupReason: BossEncounterCleanupReason | null = null;

    constructor(x: number, y: number) {
      super(x, y, CONFIG.boss);
      this.kind = "rootbound";
      this.bossId = ROOTBOUND_PROVISIONAL_DEFINITION.id;
      this.bossName = "THE ROOTBOUND";
      this.epithet = "KEEPER OF THE LAST MERCY";
      this.openingLine = "YOU DO NOT HAVE TO DIE HERE.";
      this.presentationId = ROOTBOUND_PROVISIONAL_DEFINITION.id;
      this.isBoss = true;
      this.color = CONFIG.colors.boss;
      this.atk = "unavailable";
    }

    get phase(): number {
      const fraction = this.maxHp > 0 ? this.hp / this.maxHp : 0;
      const fromHp = fraction > this.phaseMarks[0] ? 1 : fraction > this.phaseMarks[1] ? 2 : 3;
      return Math.max(this.phaseMarker, fromHp);
    }

    override blocks(): boolean {
      return this.introT > 0;
    }

    override blocksDamage(): boolean {
      return this.introT > 0;
    }

    override limitIncomingDamage(damage: number): number {
      return this.introT > 0 ? 0 : damage;
    }

    override contactDamageEnabled(): boolean {
      return this.introT <= 0 && this.state === "idle" && this.pendingAttack === null;
    }

    selectNextPhaseOneAttack(): RootboundPhaseOneAttack | null {
      if (this.phase !== 1 || this.introT > 0 || this.state !== "idle" || this.pendingAttack !== null) return null;
      const selected = this.phaseOneAttackOrder[this.attackIndex % this.phaseOneAttackOrder.length];
      if (selected === undefined) throw new RangeError("Rootbound Phase I attack order is empty");
      this.attackIndex += 1;
      this.pendingAttack = selected;
      this.stateT = 0;
      return selected;
    }

    completePhaseOneAttack(): void {
      if (this.pendingAttack === null) return;
      this.pendingAttack = null;
      this.state = "recover";
      this.stateT = ROOTBOUND_PHASE_ONE_CADENCE.recovery;
      this.atk = "unavailable";
    }

    vineSweepGeometry(): Readonly<{ x: number; y: number; hw: number; hh: number; facing: number }> {
      return Object.freeze({
        x: this.x + this.vineSweepFacing * (this.hw + ROOTBOUND_VINE_SWEEP.reach) / 2,
        y: this.y + this.hh - ROOTBOUND_VINE_SWEEP.halfHeight,
        hw: (ROOTBOUND_VINE_SWEEP.reach - this.hw) / 2,
        hh: ROOTBOUND_VINE_SWEEP.halfHeight,
        facing: this.vineSweepFacing,
      });
    }

    private beginVineSweep(): void {
      this.vineSweepStage = "windup";
      this.vineSweepT = ROOTBOUND_VINE_SWEEP.windup;
      this.vineSweepHitSpent = false;
      this.vineSweepFacing = this.facing;
      this.atk = "vine-sweep:windup";
    }

    private updateVineSweep(dt: number, player: EnemyPlayerPort): void {
      if (this.vineSweepStage === null) this.beginVineSweep();
      this.vineSweepT = Math.max(0, this.vineSweepT - dt);
      if (this.vineSweepStage === "windup" && this.vineSweepT <= 0) {
        this.vineSweepStage = "active";
        this.vineSweepT = ROOTBOUND_VINE_SWEEP.active;
        this.atk = "vine-sweep:active";
      } else if (this.vineSweepStage === "active") {
        const geometry = this.vineSweepGeometry();
        if (!this.vineSweepHitSpent && !player.invulnerable && dependencies.aabbOverlap(
          geometry.x, geometry.y, geometry.hw, geometry.hh,
          player.x, player.y, player.hw, player.hh,
        )) {
          this.vineSweepHitSpent = true;
          player.takeDamage(ROOTBOUND_VINE_SWEEP.damage, this.x, this);
        }
        if (this.vineSweepT <= 0) {
          this.vineSweepStage = "follow-through";
          this.vineSweepT = ROOTBOUND_VINE_SWEEP.followThrough;
          this.atk = "vine-sweep:follow-through";
        }
      } else if (this.vineSweepStage === "follow-through" && this.vineSweepT <= 0) {
        this.vineSweepStage = null;
        this.completePhaseOneAttack();
      }
    }

    private beginSeedArc(): void {
      this.seedArcStage = "windup";
      this.seedArcT = ROOTBOUND_SEED_ARC.windup;
      this.atk = "seed-arc:windup";
    }

    private releaseSeedArc(player: EnemyPlayerPort, projectiles: EnemyProjectile[]): void {
      const flightT = 2 * ROOTBOUND_SEED_ARC.launchSpeed / ROOTBOUND_SEED_ARC.gravity;
      for (const offset of [-ROOTBOUND_SEED_ARC.spread, 0, ROOTBOUND_SEED_ARC.spread]) {
        const startX = this.x + this.facing * this.hw * 0.45;
        const startY = this.y - this.hh * 0.62;
        const landingX = dependencies.clamp(player.x + offset, 80, CONFIG.view.w - 80);
        const seed = new Projectile(startX, startY, (landingX - startX) / flightT, -ROOTBOUND_SEED_ARC.launchSpeed);
        seed.setFamily("ordinaryProjectile");
        seed.kind = "orb";
        seed.tint = "#89b95d";
        seed.r = ROOTBOUND_SEED_ARC.radius;
        seed.dmg = ROOTBOUND_SEED_ARC.damage;
        seed.gravity = ROOTBOUND_SEED_ARC.gravity;
        seed.life = flightT + 0.4;
        seed.owner = this;
        seed.sourceEnemy = this;
        seed.landingX = landingX;
        seed.landingY = CONFIG.world.groundY;
        seed.landingT = flightT;
        seed.groundImpact = true;
        seed.bossAttack = "seed-arc";
        projectiles.push(seed);
      }
      this.seedArcStage = "release";
      this.seedArcT = ROOTBOUND_SEED_ARC.release;
      this.atk = "seed-arc:release";
    }

    private updateSeedArc(dt: number, player: EnemyPlayerPort, projectiles: EnemyProjectile[]): void {
      if (this.seedArcStage === null) this.beginSeedArc();
      this.seedArcT = Math.max(0, this.seedArcT - dt);
      if (this.seedArcStage === "windup" && this.seedArcT <= 0) this.releaseSeedArc(player, projectiles);
      else if (this.seedArcStage === "release" && this.seedArcT <= 0) {
        this.seedArcStage = null;
        this.completePhaseOneAttack();
      }
    }

    rootlineGeometry(): Readonly<{ x: number; y: number; w: number; h: number }> {
      return Object.freeze({
        x: this.rootlineFacing > 0 ? this.x + this.hw : this.x - this.hw - ROOTBOUND_ROOTLINE.width,
        y: CONFIG.world.groundY - ROOTBOUND_ROOTLINE.height,
        w: ROOTBOUND_ROOTLINE.width,
        h: ROOTBOUND_ROOTLINE.height,
      });
    }

    private beginRootline(): void {
      this.rootlineStage = "warning";
      this.rootlineT = ROOTBOUND_ROOTLINE.windup;
      this.rootlineFacing = this.facing;
      this.atk = "rootline:warning";
    }

    private updateRootline(dt: number): void {
      if (this.rootlineStage === null) this.beginRootline();
      this.rootlineT = Math.max(0, this.rootlineT - dt);
      if (this.rootlineStage === "warning" && this.rootlineT <= 0) {
        this.rootlineStage = "active";
        this.rootlineT = ROOTBOUND_ROOTLINE.active;
        this.atk = "rootline:active";
      } else if (this.rootlineStage === "active" && this.rootlineT <= 0) {
        this.rootlineStage = "cleanup";
        this.rootlineT = ROOTBOUND_ROOTLINE.cleanup;
        this.atk = "rootline:cleanup";
      } else if (this.rootlineStage === "cleanup" && this.rootlineT <= 0) {
        this.rootlineStage = null;
        this.completePhaseOneAttack();
      }
    }

    cleanupEncounter(reason: BossEncounterCleanupReason): void {
      if (this.cleanupReason !== null) return;
      this.cleanupReason = reason;
      this.introT = 0;
      this.state = "recover";
      this.stateT = 0;
      this.vx = 0;
      this.vy = 0;
      this.atk = "unavailable";
      this.pendingAttack = null;
      this.vineSweepStage = null;
      this.vineSweepT = 0;
      this.vineSweepHitSpent = false;
      this.vineSweepFacing = this.facing;
      this.seedArcStage = null;
      this.seedArcT = 0;
      this.rootlineStage = null;
      this.rootlineT = 0;
      this.cinematicRequest = null;
      this.cinematicPose = "";
      this.cinematicT = 0;
    }

    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]): void {
      void projectiles;
      this.tickTimers(dt);
      const nextPhase = this.maxHp > 0 && this.hp / this.maxHp > this.phaseMarks[0]
        ? 1
        : this.maxHp > 0 && this.hp / this.maxHp > this.phaseMarks[1] ? 2 : 3;
      if (nextPhase > this.phaseMarker) {
        this.phaseMarker = nextPhase;
        this.phaseTag = nextPhase === 2 ? "THE GARDEN REMEMBERS" : "NOTHING HERE DIES";
      }
      this.facing = Math.sign(player.x - this.x) || this.facing;
      this.vx = 0;
      if (this.introT > 0) {
        this.state = "intro";
        this.stateT = this.introT;
        this.integrate(dt, platforms);
        return;
      }
      if (this.state === "intro") {
        this.state = "recover";
        this.stateT = 0.35;
      } else if (this.pendingAttack === "vine-sweep") {
        this.updateVineSweep(dt, player);
      } else if (this.pendingAttack === "seed-arc") {
        this.updateSeedArc(dt, player, projectiles);
      } else if (this.pendingAttack === "rootline") {
        this.updateRootline(dt);
      } else if (this.stun <= 0 && this.pendingAttack === null) {
        this.stateT = Math.max(0, this.stateT - dt);
        if (this.stateT <= 0) {
          if (this.state === "idle") this.selectNextPhaseOneAttack();
          else {
            this.state = "idle";
            this.stateT = ROOTBOUND_PHASE_ONE_CADENCE.openingDelay;
          }
        }
      }
      this.integrate(dt, platforms);
    }
  }
  return Rootbound;
}

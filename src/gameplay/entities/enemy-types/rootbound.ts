import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import { ROOTBOUND_PROVISIONAL_DEFINITION } from "../../run/boss-definitions";
import type { BossEncounterCleanupReason } from "../../run/boss-encounter";
import { GRAFT_ANCHOR_TYPES, type GraftAnchorPlacementRequest } from "../../environment/graft-anchor";

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
export const ROOTBOUND_CANOPY_STEP = Object.freeze({ telegraph: 0.55, travel: 0.48, settle: 0.24 });
export type RootboundCanopyStepStage = "telegraph" | "travel" | "settle";

export const ROOTBOUND_GRAFT_ANCHOR_GEOMETRY = Object.freeze({ width: 54, height: 90 });

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
    readonly availableAttacks: readonly string[] = Object.freeze(["vine-sweep", "seed-arc", "rootline", "canopy-step"]);
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
    rootlineCleanupReason: "natural-expiry" | "stage-transition" | null = null;
    canopyStepStage: RootboundCanopyStepStage | null = null;
    canopyStepT = 0;
    canopyStepIndex = 0;
    canopyStepStart: Readonly<{ x: number; y: number }> = Object.freeze({ x: 0, y: 0 });
    canopyDestination: Readonly<{ x: number; y: number; platformId: string }> | null = null;
    cleanupReason: BossEncounterCleanupReason | null = null;
    phaseOneExited = false;

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
      return !this.attackCommitProtected() && this.state === "idle" && this.pendingAttack === null;
    }

    attackCommitProtected(): boolean {
      return this.introT > 0 || this.state === "intro" || this.cinematicT > 0 || this.cinematicRequest !== null;
    }

    selectNextPhaseOneAttack(): RootboundPhaseOneAttack | null {
      if (this.phase !== 1 || this.attackCommitProtected() || this.state !== "idle" || this.pendingAttack !== null) return null;
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

    graftAnchorPlacements(): readonly GraftAnchorPlacementRequest[] {
      if (this.phase !== 2) return Object.freeze([]);
      const y = CONFIG.world.groundY - ROOTBOUND_GRAFT_ANCHOR_GEOMETRY.height;
      return Object.freeze(GRAFT_ANCHOR_TYPES.map((graftType, index) => Object.freeze({
        graftType,
        geometry: Object.freeze({
          x: CONFIG.view.w * (0.2 + index * 0.3) - ROOTBOUND_GRAFT_ANCHOR_GEOMETRY.width / 2,
          y,
          w: ROOTBOUND_GRAFT_ANCHOR_GEOMETRY.width,
          h: ROOTBOUND_GRAFT_ANCHOR_GEOMETRY.height,
        }),
      })));
    }

    private beginRootline(): void {
      this.rootlineStage = "warning";
      this.rootlineT = ROOTBOUND_ROOTLINE.windup;
      this.rootlineFacing = this.facing;
      this.rootlineCleanupReason = null;
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
        this.rootlineStage = null; this.rootlineCleanupReason = "natural-expiry";
        this.completePhaseOneAttack();
      }
    }

    private selectCanopyDestination(platforms: readonly EnemyPlatform[]): Readonly<{ x: number; y: number; platformId: string }> | null {
      const destinations = platforms.filter((platform) => platform.oneway && platform.arenaPlatId !== undefined
        && platform.arenaState !== "broken" && platform.arenaState !== "warning" && platform.w >= this.hw * 2)
        .map((platform) => Object.freeze({ x: platform.x + platform.w / 2, y: platform.y - this.hh, platformId: platform.arenaPlatId ?? "" }))
        .filter((destination) => Math.abs(destination.x - this.x) > this.hw || Math.abs(destination.y - this.y) > 8);
      if (destinations.length === 0) return null;
      const destination = destinations[this.canopyStepIndex % destinations.length];
      this.canopyStepIndex += 1;
      return destination ?? null;
    }

    private beginCanopyStep(platforms: readonly EnemyPlatform[]): void {
      this.canopyDestination = this.selectCanopyDestination(platforms);
      if (this.canopyDestination === null) { this.completePhaseOneAttack(); return; }
      this.canopyStepStart = Object.freeze({ x: this.x, y: this.y });
      this.canopyStepStage = "telegraph";
      this.canopyStepT = ROOTBOUND_CANOPY_STEP.telegraph;
      this.atk = "canopy-step:telegraph";
    }

    private updateCanopyStep(dt: number, platforms: readonly EnemyPlatform[]): void {
      if (this.canopyStepStage === null) this.beginCanopyStep(platforms);
      if (this.canopyStepStage === null || this.canopyDestination === null) return;
      this.canopyStepT = Math.max(0, this.canopyStepT - dt);
      if (this.canopyStepStage === "telegraph" && this.canopyStepT <= 0) {
        this.canopyStepStage = "travel";
        this.canopyStepT = ROOTBOUND_CANOPY_STEP.travel;
        this.atk = "canopy-step:travel";
      } else if (this.canopyStepStage === "travel") {
        const progress = dependencies.clamp(1 - this.canopyStepT / ROOTBOUND_CANOPY_STEP.travel, 0, 1);
        const eased = progress * progress * (3 - 2 * progress);
        this.x = dependencies.lerp(this.canopyStepStart.x, this.canopyDestination.x, eased);
        this.y = dependencies.lerp(this.canopyStepStart.y, this.canopyDestination.y, eased) - Math.sin(progress * Math.PI) * 64;
        this.vx = 0; this.vy = 0; this.onGround = false;
        if (this.canopyStepT <= 0) {
          this.x = this.canopyDestination.x; this.y = this.canopyDestination.y; this.onGround = true;
          this.canopyStepStage = "settle"; this.canopyStepT = ROOTBOUND_CANOPY_STEP.settle; this.atk = "canopy-step:settle";
        }
      } else if (this.canopyStepStage === "settle" && this.canopyStepT <= 0) {
        this.canopyStepStage = null; this.canopyDestination = null; this.completePhaseOneAttack();
      }
    }

    private exitPhaseOne(projectiles: EnemyProjectile[]): void {
      if (this.phaseOneExited) return;
      this.phaseOneExited = true;
      if (this.canopyDestination !== null && this.canopyStepStage === "travel") {
        this.x = this.canopyDestination.x; this.y = this.canopyDestination.y; this.onGround = true;
      }
      this.pendingAttack = null;
      this.vineSweepStage = null; this.vineSweepT = 0; this.vineSweepHitSpent = false;
      this.seedArcStage = null; this.seedArcT = 0;
      if (this.rootlineStage !== null) this.rootlineCleanupReason = "stage-transition";
      this.rootlineStage = null; this.rootlineT = 0;
      this.canopyStepStage = null; this.canopyStepT = 0; this.canopyDestination = null;
      for (const projectile of projectiles) if (projectile.owner === this && projectile.bossAttack === "seed-arc" && !projectile.dead) {
        projectile.dead = true; projectile.shatterReason = "phase-transition";
      }
      this.atk = "unavailable"; this.state = "recover"; this.stateT = ROOTBOUND_PHASE_ONE_CADENCE.recovery;
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
      this.rootlineCleanupReason = "stage-transition";
      this.canopyStepStage = null;
      this.canopyStepT = 0;
      this.canopyDestination = null;
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
        if (this.phaseMarker === 1) this.exitPhaseOne(projectiles);
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
      if (this.cinematicT > 0 || this.cinematicRequest !== null) {
        this.atk = "unavailable";
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
      } else if (this.pendingAttack === "canopy-step") {
        this.updateCanopyStep(dt, platforms);
      } else if (this.stun <= 0) {
        this.stateT = Math.max(0, this.stateT - dt);
        if (this.stateT <= 0) {
          if (this.state === "idle") this.selectNextPhaseOneAttack();
          else {
            this.state = "idle";
            this.stateT = ROOTBOUND_PHASE_ONE_CADENCE.openingDelay;
          }
        }
      }
      if (this.canopyStepStage !== "travel") this.integrate(dt, platforms);
    }
  }
  return Rootbound;
}

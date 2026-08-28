import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import { ROOTBOUND_PROVISIONAL_DEFINITION } from "../../run/boss-definitions";
import type { BossEncounterCleanupReason } from "../../run/boss-encounter";
import { GRAFT_ANCHOR_TYPES, ROOTBOUND_NO_GRAFT_EFFECTS, type GraftAnchorPlacementRequest, type RootboundGraftEffects } from "../../environment/graft-anchor";
import { ROOTBOUND_BLOOM_PATTERN_IDS, type RootboundBloomPatternId } from "../../environment/bloom-well";
import type { RootCagePlacementRequest } from "../../environment/root-cage";
import { advanceRootboundRegrowth, beginRootboundRegrowth, createRootboundRegrowthState, resolveRootboundRegrowthOutcome, type RootboundRegrowthState } from "../../environment/regrowth-link";
import type { BossRuntime } from "./boss-runtime";

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
export const ROOTBOUND_MEMORY_CHOIR = Object.freeze({
  maxManifestations: 3,
  warning: 0.65,
  echoStagger: 0.12,
  active: 0.18,
  afterimage: 0.3,
  width: 180,
  height: 120,
  damage: 14,
});
export type RootboundMemoryChoirStage = "warning" | "active" | "afterimage";
export const ROOTBOUND_PHASE_TWO_ATTACK_ORDER = Object.freeze(["memory-choir", "root-cage", "bloom-shift"] as const);
export type RootboundPhaseTwoAttack = typeof ROOTBOUND_PHASE_TWO_ATTACK_ORDER[number];
export const ROOTBOUND_PHASE_TWO_CADENCE = Object.freeze({ openingDelay: 0.85, recovery: 0.7 });
export interface RootboundMemoryChoirManifestation {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly activationDelay: number;
  readonly hitSpent: boolean;
}

/** Factory-safe Rootbound shell. C11-C13 own the authored attack phases. */
export function createRootboundType(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor, bossRuntime: BossRuntime) {
  const { CONFIG, Projectile } = dependencies;
  const { bossTransformation } = bossRuntime;
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
    graftDamageTakenMultiplier = ROOTBOUND_NO_GRAFT_EFFECTS.incomingDamageMultiplier;
    graftCadenceMultiplier = ROOTBOUND_NO_GRAFT_EFFECTS.cadenceMultiplier;
    activeGraftTypes = ROOTBOUND_NO_GRAFT_EFFECTS.activeTypes;
    bloomPatternIndex = 0;
    memoryChoirStage: RootboundMemoryChoirStage | null = null;
    memoryChoirT = 0;
    memoryChoirElapsed = 0;
    memoryChoirManifestations: readonly RootboundMemoryChoirManifestation[] = Object.freeze([]);
    rootCageSequence = 0;
    rootCageRequest: RootCagePlacementRequest | null = null;
    readonly phaseTwoAttackOrder = ROOTBOUND_PHASE_TWO_ATTACK_ORDER;
    phaseTwoAttackIndex = 0;
    phaseTwoPendingAttack: RootboundPhaseTwoAttack | null = null;
    finalPhaseTwoGraftTypes = ROOTBOUND_NO_GRAFT_EFFECTS.activeTypes;
    regrowthState: RootboundRegrowthState = createRootboundRegrowthState();

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
      return this.introT > 0 ? 0 : damage * this.graftDamageTakenMultiplier;
    }

    applyGraftEffects(effects: RootboundGraftEffects): void {
      this.graftDamageTakenMultiplier = effects.incomingDamageMultiplier;
      this.graftCadenceMultiplier = effects.cadenceMultiplier;
      this.activeGraftTypes = effects.activeTypes;
    }

    recoverGraftHealth(fraction: number): number {
      if (!Number.isFinite(fraction) || fraction < 0) throw new RangeError("Rootbound Graft recovery must be finite and non-negative");
      if (this.dead || this.dying || this.hp <= 0 || this.maxHp <= 0) return 0;
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * fraction);
      return (this.hp - before) / this.maxHp;
    }

    beginRegrowth(startTick: number, connectionIds: readonly string[]): boolean {
      if (this.phaseMarker !== 3 || this.phase !== 3 || this.attackCommitProtected() || this.cleanupReason !== null || this.regrowthState.useCount !== 0) return false;
      this.regrowthState = beginRootboundRegrowth(this.regrowthState, startTick, connectionIds);
      this.state = "idle";
      this.stateT = 0;
      this.atk = "regrowth:channeling";
      return true;
    }

    advanceRegrowth(tick: number, activeConnectionIds: ReadonlySet<string>, bossChannelBroken = false): RootboundRegrowthState {
      const next = advanceRootboundRegrowth(this.regrowthState, tick, activeConnectionIds, bossChannelBroken);
      this.regrowthState = next;
      if (next.phase === "channeling") this.atk = "regrowth:channeling";
      else if (next.phase === "resolved") {
        if (next.resolvedHealFraction === null) {
          const recoverable = this.maxHp > 0 ? Math.max(0, (this.maxHp - this.hp) / this.maxHp) : 0;
          const outcome = resolveRootboundRegrowthOutcome(next, recoverable);
          this.regrowthState = outcome.state;
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * outcome.resolvedHealFraction);
          this.state = "recover";
          this.stateT = outcome.recoverySeconds;
        }
        this.atk = `regrowth:${this.regrowthState.interruptClassification ?? "resolved"}`;
      }
      return this.regrowthState;
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

    bossBloomPattern(): RootboundBloomPatternId | null {
      if (this.phase !== 2) return null;
      return ROOTBOUND_BLOOM_PATTERN_IDS[this.bloomPatternIndex % ROOTBOUND_BLOOM_PATTERN_IDS.length] ?? null;
    }

    selectNextPhaseTwoAttack(playerX: number): RootboundPhaseTwoAttack | null {
      if (this.phase !== 2 || this.attackCommitProtected() || this.state !== "idle" || this.phaseTwoPendingAttack !== null) return null;
      const selected = this.phaseTwoAttackOrder[this.phaseTwoAttackIndex % this.phaseTwoAttackOrder.length];
      if (selected === undefined) throw new RangeError("Rootbound Phase II attack order is empty");
      this.phaseTwoAttackIndex += 1;
      this.phaseTwoPendingAttack = selected;
      this.stateT = 0;
      if (selected === "memory-choir") this.startMemoryChoir();
      else if (selected === "root-cage") this.startRootCage(playerX);
      else {
        this.bloomPatternIndex = (this.bloomPatternIndex + 1) % ROOTBOUND_BLOOM_PATTERN_IDS.length;
        this.atk = "bloom-shift:warning";
        this.completePhaseTwoAttack();
      }
      return selected;
    }

    private completePhaseTwoAttack(): void {
      this.phaseTwoPendingAttack = null;
      this.state = "recover";
      this.stateT = ROOTBOUND_PHASE_TWO_CADENCE.recovery / this.graftCadenceMultiplier;
      this.atk = "unavailable";
    }

    startRootCage(centerX: number): boolean {
      if (this.phase !== 2 || this.attackCommitProtected() || this.rootCageRequest !== null || !Number.isFinite(centerX)) return false;
      this.rootCageSequence += 1;
      this.rootCageRequest = Object.freeze({
        sequence: this.rootCageSequence,
        centerX,
        arenaWidth: CONFIG.view.w,
        groundY: CONFIG.world.groundY,
      });
      this.atk = "root-cage:warning";
      return true;
    }

    rootCagePlacement(): RootCagePlacementRequest | null {
      return this.phase === 2 ? this.rootCageRequest : null;
    }

    completeRootCage(): void {
      this.rootCageRequest = null;
      if (this.phase === 2 && this.phaseTwoPendingAttack === "root-cage") this.completePhaseTwoAttack();
      else if (this.atk.startsWith("root-cage:")) this.atk = "unavailable";
    }

    startMemoryChoir(): boolean {
      if (this.phase !== 2 || this.attackCommitProtected() || this.memoryChoirStage !== null) return false;
      this.memoryChoirStage = "warning";
      this.memoryChoirT = ROOTBOUND_MEMORY_CHOIR.warning;
      this.memoryChoirElapsed = 0;
      this.memoryChoirManifestations = Object.freeze(Array.from({ length: ROOTBOUND_MEMORY_CHOIR.maxManifestations }, (_, index) => Object.freeze({
        id: `memory-choir:${String(index + 1)}`,
        x: CONFIG.view.w * (0.25 + index * 0.25) - ROOTBOUND_MEMORY_CHOIR.width / 2,
        y: CONFIG.world.groundY - ROOTBOUND_MEMORY_CHOIR.height,
        w: ROOTBOUND_MEMORY_CHOIR.width,
        h: ROOTBOUND_MEMORY_CHOIR.height,
        activationDelay: index * ROOTBOUND_MEMORY_CHOIR.echoStagger,
        hitSpent: false,
      })));
      this.atk = "memory-choir:warning";
      return true;
    }

    memoryChoirManifestationActive(manifestation: RootboundMemoryChoirManifestation): boolean {
      return this.memoryChoirStage === "active" && this.memoryChoirElapsed >= manifestation.activationDelay
        && this.memoryChoirElapsed < manifestation.activationDelay + ROOTBOUND_MEMORY_CHOIR.active;
    }

    private cancelMemoryChoir(): void {
      this.memoryChoirStage = null;
      this.memoryChoirT = 0;
      this.memoryChoirElapsed = 0;
      this.memoryChoirManifestations = Object.freeze([]);
      if (this.atk.startsWith("memory-choir:")) this.atk = "unavailable";
    }

    private updateMemoryChoir(dt: number, player: EnemyPlayerPort): void {
      if (this.memoryChoirStage === null) return;
      this.memoryChoirT = Math.max(0, this.memoryChoirT - dt);
      if (this.memoryChoirStage === "warning") {
        if (this.memoryChoirT <= 0) {
          this.memoryChoirStage = "active";
          this.memoryChoirElapsed = 0;
          this.memoryChoirT = ROOTBOUND_MEMORY_CHOIR.active + ROOTBOUND_MEMORY_CHOIR.echoStagger * (ROOTBOUND_MEMORY_CHOIR.maxManifestations - 1);
          this.atk = "memory-choir:active";
        }
        return;
      }
      if (this.memoryChoirStage === "active") {
        this.memoryChoirElapsed += dt;
        this.memoryChoirManifestations = Object.freeze(this.memoryChoirManifestations.map((manifestation) => {
          if (manifestation.hitSpent || !this.memoryChoirManifestationActive(manifestation) || player.invulnerable
            || !dependencies.aabbOverlap(manifestation.x + manifestation.w / 2, manifestation.y + manifestation.h / 2,
              manifestation.w / 2, manifestation.h / 2, player.x, player.y, player.hw, player.hh)) return manifestation;
          player.takeDamage(ROOTBOUND_MEMORY_CHOIR.damage, manifestation.x + manifestation.w / 2, this);
          return Object.freeze({ ...manifestation, hitSpent: true });
        }));
        if (this.memoryChoirT <= 0) {
          this.memoryChoirStage = "afterimage";
          this.memoryChoirT = ROOTBOUND_MEMORY_CHOIR.afterimage;
          this.atk = "memory-choir:afterimage";
        }
        return;
      }
      if (this.memoryChoirT <= 0) {
        this.cancelMemoryChoir();
        this.completePhaseTwoAttack();
      }
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
      this.applyGraftEffects(ROOTBOUND_NO_GRAFT_EFFECTS);
      this.cancelMemoryChoir();
      this.completeRootCage();
      this.phaseTwoPendingAttack = null;
    }

    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]): void {
      void projectiles;
      this.tickTimers(dt);
      const nextPhase = this.maxHp > 0 && this.hp / this.maxHp > this.phaseMarks[0]
        ? 1
        : this.maxHp > 0 && this.hp / this.maxHp > this.phaseMarks[1] ? 2 : 3;
      if (nextPhase > this.phaseMarker) {
        if (this.phaseMarker === 1) this.exitPhaseOne(projectiles);
        else if (this.phaseMarker === 2) {
          this.finalPhaseTwoGraftTypes = Object.freeze([...this.activeGraftTypes]);
          this.cancelMemoryChoir(); this.completeRootCage(); this.phaseTwoPendingAttack = null;
          this.state = "recover"; this.stateT = ROOTBOUND_PHASE_TWO_CADENCE.recovery;
          bossTransformation(this, { id: "rootbound-nothing-here-dies", title: "NOTHING HERE DIES", pose: "rootboundRegrowth",
            line: "THE GARDEN WILL REMEMBER YOU.", color: this.color, sfx: "rootboundRegrowth" });
        }
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
      } else if (this.memoryChoirStage !== null) {
        this.updateMemoryChoir(dt, player);
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
          if (this.state === "idle") {
            if (this.phase === 1) this.selectNextPhaseOneAttack();
            else if (this.phase === 2) this.selectNextPhaseTwoAttack(player.x);
          }
          else {
            this.state = "idle";
            this.stateT = (this.phase === 2 ? ROOTBOUND_PHASE_TWO_CADENCE.openingDelay / this.graftCadenceMultiplier : ROOTBOUND_PHASE_ONE_CADENCE.openingDelay);
          }
        }
      }
      if (this.canopyStepStage !== "travel") this.integrate(dt, platforms);
    }
  }
  return Rootbound;
}

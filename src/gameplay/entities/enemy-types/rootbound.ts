import { practicePhaseEntryHealth, type BossPracticeActorEntry } from "../../training/boss-phase-practice-runtime";
import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import { ROOTBOUND_DEFINITION } from "../../run/boss-definitions";
import type { BossEncounterCleanupReason } from "../../run/boss-encounter";
import {
  GRAFT_ANCHOR_TYPES,
  ROOTBOUND_NO_GRAFT_EFFECTS,
  type GraftAnchorPlacementRequest,
  type RootboundGraftEffects,
} from "../../environment/graft-anchor";
import { ROOTBOUND_BLOOM_PATTERN_IDS, type RootboundBloomPatternId } from "../../environment/bloom-well";
import type { RootCagePlacementRequest } from "../../environment/root-cage";
import {
  advanceRootboundRegrowth,
  beginRootboundRegrowth,
  createRootboundRegrowthState,
  resolveRootboundRegrowthOutcome,
  type RootboundRegrowthState,
} from "../../environment/regrowth-link";
import type { BossRuntime } from "./boss-runtime";
import {
  ROOTBOUND_BLOOM_SHIFT,
  ROOTBOUND_ENCOUNTER,
  ROOTBOUND_GRAFT_ANCHOR_GEOMETRY,
  ROOTBOUND_LAST_SPRING,
  ROOTBOUND_MEMORY_CHOIR,
  ROOTBOUND_PHASE_ONE_CADENCE,
  ROOTBOUND_PHASE_THREE_CADENCE,
  ROOTBOUND_PHASE_TWO_ATTACK_ORDER,
  ROOTBOUND_PHASE_TWO_CADENCE,
  type RootboundLastSpringStage,
  type RootboundMemoryChoirManifestation,
  type RootboundMemoryChoirStage,
  type RootboundPhaseTwoAttack,
} from "./rootbound-tuning";
import type { BatonSegment } from "../../combat/held-blade-collision-contracts";
import { bossAttackSecondsToTicks } from "../boss-attacks";
import {
  advanceBossAttack,
  bossAttackDamageTaken,
  bossAttackHit,
  bossAttackMotion,
  bossAttackParryable,
  bossAttackPose,
  bossAttackTells,
  bossHitTouches,
  createBossAttackRunnerState,
  markBossAttackLanded,
  parryBossAttack,
  type BossAttackContext,
  type BossAttackPose,
  type BossAttackRunnerState,
} from "../boss-attack-runner";
import type { BossTell } from "../boss-tells";
import { ROOTBOUND_MOVES, type RootboundPhase } from "./rootbound-moves";
import { rootboundTells } from "./rootbound-tells";
export * from "./rootbound-tuning";

/** Phase III plays this many moves between Last Springs, and opens with one. */
export const ROOTBOUND_MOVES_PER_LAST_SPRING = 3;

type Box = Readonly<{ x: number; y: number; hw: number; hh: number }>;

/** The Rootbound: Keeper of Spring (moves), The Garden Remembers (Grafts), Nothing Here Dies (Regrowth). */
export function createRootboundType(
  dependencies: EnemyDependencies,
  Enemy: EnemyBaseConstructor,
  bossRuntime: BossRuntime,
) {
  const { CONFIG } = dependencies;
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
      ROOTBOUND_DEFINITION.phaseMarks[0],
      ROOTBOUND_DEFINITION.phaseMarks[1],
    ];
    readonly availableAttacks: readonly string[] = Object.freeze(ROOTBOUND_MOVES.attacks.map((move) => move.id));
    contactGraceT = 0;
    /** The shared runner's state for the move table, and the boss's own tick count (one per update). */
    moveState: BossAttackRunnerState = createBossAttackRunnerState(
      bossAttackSecondsToTicks(ROOTBOUND_PHASE_ONE_CADENCE.openingDelay),
    );
    moveTick = 0;
    moveTarget: Box = Object.freeze({ x: 0, y: 0, hw: 0, hh: 0 });
    movesSinceLastSpring = ROOTBOUND_MOVES_PER_LAST_SPRING;
    /** True while a move moves the boss itself (the body does not fall or slide on its own). */
    moveCarries = false;
    /** True while burrowed: out of sight, untouchable and harmless to touch. */
    hidden = false;
    batonStrike = 0;
    cleanupReason: BossEncounterCleanupReason | null = null;
    phaseOneExited = false;
    graftDamageTakenMultiplier = ROOTBOUND_NO_GRAFT_EFFECTS.incomingDamageMultiplier;
    graftCadenceMultiplier = ROOTBOUND_NO_GRAFT_EFFECTS.cadenceMultiplier;
    activeGraftTypes = ROOTBOUND_NO_GRAFT_EFFECTS.activeTypes;
    bloomPatternIndex = 0;
    bloomShiftT = 0;
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
    /** Grafts the stage has planted for this boss. A cut Graft leaves the stage and is not planted again. */
    plantedGraftTypes: readonly string[] = Object.freeze([]);
    /** The Well pattern the stage last planted for this boss; a new selection is planted once. */
    plantedBloomPattern: RootboundBloomPatternId | null = null;
    regrowthState: RootboundRegrowthState = createRootboundRegrowthState();
    regrowthDamageTaken = 0;
    lastSpringStage: RootboundLastSpringStage | null = null;
    lastSpringT = 0;
    lastSpringUseCount = 0;
    lastSpringHitSpent = false;

    constructor(x: number, y: number) {
      super(x, y, CONFIG.boss);
      this.kind = "rootbound";
      this.bossId = ROOTBOUND_DEFINITION.id;
      this.bossName = "THE ROOTBOUND";
      this.epithet = "KEEPER OF THE LAST MERCY";
      this.openingLine = "YOU DO NOT HAVE TO DIE HERE.";
      this.presentationId = ROOTBOUND_DEFINITION.id;
      this.isBoss = true;
      this.color = CONFIG.colors.boss;
      this.atk = "unavailable";
    }

    /** Practice requests cross an authored threshold; normal update owns every transition effect. */
    requestPracticePhase(phase: 2 | 3): boolean {
      const entry = this.practicePhaseEntry();
      if (
        !entry.ready ||
        entry.targetPhase !== entry.phase ||
        phase !== entry.phase + 1 ||
        this.dead ||
        this.dying ||
        this.hp <= 0
      )
        return false;
      this.hp = this.maxHp * practicePhaseEntryHealth(this.phaseMarks, phase);
      this.hpDisplay = this.hp;
      return true;
    }
    practicePhaseEntry(): BossPracticeActorEntry {
      const phase = this.phaseMarker === 3 ? 3 : this.phaseMarker === 2 ? 2 : 1;
      return Object.freeze({
        phase,
        targetPhase: this.phase === 3 ? 3 : this.phase === 2 ? 2 : 1,
        ready:
          (phase !== 2 || GRAFT_ANCHOR_TYPES.every((type) => this.activeGraftTypes.includes(type))) &&
          (phase !== 3 || this.regrowthState.phase !== "idle") &&
          this.introT <= 0 &&
          this.cinematicT <= 0 &&
          this.cinematicRequest === null,
        stage:
          this.introT > 0
            ? "opening"
            : this.cinematicRequest !== null || this.cinematicT > 0
              ? "transition"
              : phase === 3
                ? "regrowth"
                : phase === 2
                  ? "graft-baseline"
                  : "combat",
      });
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
      return this.introT > 0 || this.hidden;
    }

    /** Nothing here dies: the Rootbound cannot fall before Phase III, nor while Regrowth channels. */
    override _deathLocked(): boolean {
      return this.phaseMarker < 3 || this.regrowthState.phase === "channeling";
    }

    /** Phase I damage stops short of Phase III, so burst damage cannot skip the Graft phase. */
    override limitIncomingDamage(damage: number): number {
      if (this.introT > 0) return 0;
      let dealt = damage * this.graftDamageTakenMultiplier * bossAttackDamageTaken(ROOTBOUND_MOVES, this.moveState);
      if (this.phaseMarker === 1) dealt = Math.min(dealt, Math.max(0, this.hp - (this.maxHp * this.phaseMarks[1] + 1)));
      if (this.regrowthState.phase === "channeling") this.regrowthDamageTaken += dealt;
      return dealt;
    }

    applyGraftEffects(effects: RootboundGraftEffects): void {
      this.graftDamageTakenMultiplier = effects.incomingDamageMultiplier;
      this.graftCadenceMultiplier = effects.cadenceMultiplier;
      this.activeGraftTypes = effects.activeTypes;
    }

    recoverGraftHealth(fraction: number): number {
      if (!Number.isFinite(fraction) || fraction < 0)
        throw new RangeError("Rootbound Graft recovery must be finite and non-negative");
      if (this.dead || this.dying || this.hp <= 0 || this.maxHp <= 0) return 0;
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * fraction);
      return (this.hp - before) / this.maxHp;
    }

    beginRegrowth(startTick: number, connectionIds: readonly string[]): boolean {
      if (
        this.phaseMarker !== 3 ||
        this.phase !== 3 ||
        this.attackCommitProtected() ||
        this.cleanupReason !== null ||
        this.regrowthState.useCount !== 0
      )
        return false;
      this.regrowthState = beginRootboundRegrowth(this.regrowthState, startTick, connectionIds);
      this.regrowthDamageTaken = 0;
      this.state = "idle";
      this.stateT = 0;
      this.atk = "regrowth:channeling";
      return true;
    }

    /** True once hits on the channeling boss reach the authored break fraction of its health. */
    regrowthChannelBroken(): boolean {
      return this.regrowthDamageTaken >= this.maxHp * ROOTBOUND_ENCOUNTER.regrowthBreakFraction;
    }

    advanceRegrowth(
      tick: number,
      activeConnectionIds: ReadonlySet<string>,
      bossChannelBroken = false,
    ): RootboundRegrowthState {
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
      return (
        !this.attackCommitProtected() &&
        this.contactGraceT <= 0 &&
        this.state === "idle" &&
        this.moveState.run === null &&
        !this.hidden &&
        (this.lastSpringStage === null || this.lastSpringStage === "complete")
      );
    }

    attackCommitProtected(): boolean {
      return this.introT > 0 || this.state === "intro" || this.cinematicT > 0 || this.cinematicRequest !== null;
    }

    /** True when the move table drives the boss: Phase I, and Phase III once Regrowth has resolved. */
    playsMoves(): boolean {
      return this.phase === 1 || (this.phase === 3 && this.regrowthState.phase === "resolved");
    }

    moveContext(target: Box): BossAttackContext<RootboundPhase> {
      return {
        tick: this.moveTick,
        phase: this.phase === 3 ? 3 : 1,
        boss: { x: this.x, y: this.y, hw: this.hw, hh: this.hh },
        target,
        arena: { width: CONFIG.view.w, groundY: CONFIG.world.groundY },
        random: dependencies.GAME_RANDOM,
      };
    }

    tells(): readonly BossTell[] {
      return Object.freeze([
        ...bossAttackTells(ROOTBOUND_MOVES, this.moveState, this.moveContext(this.moveTarget)),
        ...rootboundTells(this),
      ]);
    }

    /** The move being played, for the renderer: move, stage, progress and where it reaches. */
    movePose(): BossAttackPose | null {
      return bossAttackPose(ROOTBOUND_MOVES, this.moveState, this.moveContext(this.moveTarget));
    }

    /** The vine the player can parry while a parryable move is about to land: from the hand to its reach. */
    batonSegment(): BatonSegment {
      const hit = bossAttackHit(ROOTBOUND_MOVES, this.moveState, this.moveContext(this.moveTarget));
      const reach = hit?.area.kind === "box" ? hit.area.hw * 2 : 260;
      const y = this.y + 19;
      const a = Object.freeze({ x: this.x + this.facing * this.hw, y });
      const b = Object.freeze({ x: a.x + this.facing * reach, y });
      return { a, b, x1: a.x, y1: a.y, x2: b.x, y2: b.y, radius: 24 };
    }

    /** A parried Vine Lash skips to the table's parry exposure; that open window is the reward. */
    parryBaton(): boolean {
      const next = parryBossAttack(ROOTBOUND_MOVES, this.moveState, this.moveTick);
      if (next === this.moveState) return false;
      this.moveState = next;
      this.batonStrike = 0;
      return true;
    }

    /** Advances the move table one tick: motion, the strike and the parry window. */
    private updateMoves(player: EnemyPlayerPort): void {
      this.moveTick += 1;
      this.moveTarget = Object.freeze({ x: player.x, y: player.y, hw: player.hw, hh: player.hh });
      const context = this.moveContext(this.moveTarget);
      const result = advanceBossAttack(ROOTBOUND_MOVES, this.moveState, context);
      this.moveState = result.state;
      for (const event of result.events) if (event.type === "finished") this.movesSinceLastSpring += 1;
      const motion = bossAttackMotion(ROOTBOUND_MOVES, this.moveState, context);
      this.moveCarries = motion !== null;
      this.hidden = motion?.hidden ?? false;
      if (motion !== null) {
        this.x = motion.x;
        this.y = motion.y;
        this.vy = 0;
      }
      const hit = bossAttackHit(ROOTBOUND_MOVES, this.moveState, this.moveContext(this.moveTarget));
      if (hit !== null && !player.invulnerable && bossHitTouches(hit.area, player)) {
        this.moveState = markBossAttackLanded(this.moveState);
        player.takeDamage(hit.damage, this.x, this);
      }
      this.batonStrike = bossAttackParryable(ROOTBOUND_MOVES, this.moveState, this.moveTick) ? 1 : 0;
      const run = this.moveState.run;
      if (run !== null) this.facing = run.facing;
      this.atk = run === null ? "unavailable" : `${run.attackId}:${run.stage}`;
    }

    /** Ends any move in progress, without a strike; the next move waits `delaySeconds`. */
    private resetMoves(delaySeconds: number): void {
      this.moveState = createBossAttackRunnerState(this.moveTick + bossAttackSecondsToTicks(delaySeconds));
      this.moveCarries = false;
      this.hidden = false;
      this.batonStrike = 0;
    }

    graftAnchorPlacements(): readonly GraftAnchorPlacementRequest[] {
      if (this.phase !== 2) return Object.freeze([]);
      const y = CONFIG.world.groundY - ROOTBOUND_GRAFT_ANCHOR_GEOMETRY.height;
      return Object.freeze(
        GRAFT_ANCHOR_TYPES.map((graftType, index) =>
          Object.freeze({
            graftType,
            geometry: Object.freeze({
              x: CONFIG.view.w * (0.2 + index * 0.3) - ROOTBOUND_GRAFT_ANCHOR_GEOMETRY.width / 2,
              y,
              w: ROOTBOUND_GRAFT_ANCHOR_GEOMETRY.width,
              h: ROOTBOUND_GRAFT_ANCHOR_GEOMETRY.height,
            }),
          }),
        ),
      );
    }

    acknowledgeGraftPlanted(graftType: string): void {
      this.plantedGraftTypes = Object.freeze([...this.plantedGraftTypes, graftType]);
    }

    acknowledgeBloomPattern(patternId: RootboundBloomPatternId | null): void {
      this.plantedBloomPattern = patternId;
    }

    bossBloomPattern(): RootboundBloomPatternId | null {
      if (this.phase === 3 && this.lastSpringStage !== null && this.lastSpringStage !== "complete")
        return "last-spring";
      if (this.phase !== 2) return null;
      return ROOTBOUND_BLOOM_PATTERN_IDS[this.bloomPatternIndex % ROOTBOUND_BLOOM_PATTERN_IDS.length] ?? null;
    }

    startLastSpring(): boolean {
      if (
        this.phaseMarker !== 3 ||
        this.regrowthState.phase !== "resolved" ||
        this.attackCommitProtected() ||
        this.cleanupReason !== null ||
        this.state !== "idle" ||
        (this.lastSpringStage !== null && this.lastSpringStage !== "complete")
      )
        return false;
      this.lastSpringUseCount += 1;
      this.lastSpringStage = "warning";
      this.lastSpringT = ROOTBOUND_LAST_SPRING.warning;
      this.lastSpringHitSpent = false;
      this.atk = "last-spring:warning";
      return true;
    }

    /** The floor band Last Spring's commit strikes, as centre and half extents. */
    lastSpringBand(): Readonly<{ x: number; y: number; hw: number; hh: number }> {
      return Object.freeze({ x: CONFIG.view.w / 2, y: CONFIG.world.groundY - 65, hw: CONFIG.view.w * 0.4, hh: 65 });
    }

    private updateLastSpring(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort): void {
      if (this.lastSpringStage === null || this.lastSpringStage === "complete") return;
      this.lastSpringT = Math.max(0, this.lastSpringT - dt);
      if (this.lastSpringStage === "warning" && this.lastSpringT <= 0) {
        const fracture = platforms.find(
          (platform) =>
            platform.oneway &&
            platform.arenaPlatId !== undefined &&
            (platform.arenaState === "stable" || platform.arenaState === "stressed"),
        );
        if (fracture !== undefined)
          fracture.arenaFractureRequest = { reason: "rootbound-last-spring", color: "#e4c95a" };
        this.lastSpringStage = "bloom";
        this.lastSpringT = ROOTBOUND_LAST_SPRING.bloom;
        this.atk = "last-spring:bloom";
      } else if (this.lastSpringStage === "bloom" && this.lastSpringT <= 0) {
        this.lastSpringStage = "commit";
        this.lastSpringT = ROOTBOUND_LAST_SPRING.commit;
        this.atk = "last-spring:commit";
      } else if (this.lastSpringStage === "commit") {
        const band = this.lastSpringBand();
        if (
          !this.lastSpringHitSpent &&
          !player.invulnerable &&
          dependencies.aabbOverlap(band.x, band.y, band.hw, band.hh, player.x, player.y, player.hw, player.hh)
        ) {
          this.lastSpringHitSpent = true;
          player.takeDamage(ROOTBOUND_LAST_SPRING.damage, this.x, this);
        }
        if (this.lastSpringT <= 0) {
          this.lastSpringStage = "punish";
          this.lastSpringT = ROOTBOUND_LAST_SPRING.punish;
          this.atk = "last-spring:punish";
        }
      } else if (this.lastSpringStage === "punish" && this.lastSpringT <= 0) {
        this.lastSpringStage = "complete";
        this.lastSpringT = 0;
        this.state = "recover";
        this.stateT = 0.6;
        this.atk = "unavailable";
      }
    }

    selectNextPhaseTwoAttack(playerX: number): RootboundPhaseTwoAttack | null {
      if (
        this.phase !== 2 ||
        this.attackCommitProtected() ||
        this.state !== "idle" ||
        this.phaseTwoPendingAttack !== null
      )
        return null;
      const selected = this.phaseTwoAttackOrder[this.phaseTwoAttackIndex % this.phaseTwoAttackOrder.length];
      if (selected === undefined) throw new RangeError("Rootbound Phase II attack order is empty");
      this.phaseTwoAttackIndex += 1;
      this.phaseTwoPendingAttack = selected;
      this.stateT = 0;
      if (selected === "memory-choir") this.startMemoryChoir();
      else if (selected === "root-cage") this.startRootCage(playerX);
      else {
        this.bloomPatternIndex = (this.bloomPatternIndex + 1) % ROOTBOUND_BLOOM_PATTERN_IDS.length;
        this.bloomShiftT = ROOTBOUND_BLOOM_SHIFT.warning;
        this.atk = "bloom-shift:warning";
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
      if (
        this.phase !== 2 ||
        this.attackCommitProtected() ||
        this.rootCageRequest !== null ||
        !Number.isFinite(centerX)
      )
        return false;
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
      this.memoryChoirManifestations = Object.freeze(
        Array.from({ length: ROOTBOUND_MEMORY_CHOIR.maxManifestations }, (_, index) =>
          Object.freeze({
            id: `memory-choir:${String(index + 1)}`,
            x: CONFIG.view.w * (0.25 + index * 0.25) - ROOTBOUND_MEMORY_CHOIR.width / 2,
            y: CONFIG.world.groundY - ROOTBOUND_MEMORY_CHOIR.height,
            w: ROOTBOUND_MEMORY_CHOIR.width,
            h: ROOTBOUND_MEMORY_CHOIR.height,
            activationDelay: index * ROOTBOUND_MEMORY_CHOIR.echoStagger,
            hitSpent: false,
          }),
        ),
      );
      this.atk = "memory-choir:warning";
      return true;
    }

    memoryChoirManifestationActive(manifestation: RootboundMemoryChoirManifestation): boolean {
      return (
        this.memoryChoirStage === "active" &&
        this.memoryChoirElapsed >= manifestation.activationDelay &&
        this.memoryChoirElapsed < manifestation.activationDelay + ROOTBOUND_MEMORY_CHOIR.active
      );
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
          this.memoryChoirT =
            ROOTBOUND_MEMORY_CHOIR.active +
            ROOTBOUND_MEMORY_CHOIR.echoStagger * (ROOTBOUND_MEMORY_CHOIR.maxManifestations - 1);
          this.atk = "memory-choir:active";
        }
        return;
      }
      if (this.memoryChoirStage === "active") {
        this.memoryChoirElapsed += dt;
        this.memoryChoirManifestations = Object.freeze(
          this.memoryChoirManifestations.map((manifestation) => {
            if (
              manifestation.hitSpent ||
              !this.memoryChoirManifestationActive(manifestation) ||
              player.invulnerable ||
              !dependencies.aabbOverlap(
                manifestation.x + manifestation.w / 2,
                manifestation.y + manifestation.h / 2,
                manifestation.w / 2,
                manifestation.h / 2,
                player.x,
                player.y,
                player.hw,
                player.hh,
              )
            )
              return manifestation;
            player.takeDamage(ROOTBOUND_MEMORY_CHOIR.damage, manifestation.x + manifestation.w / 2, this);
            return Object.freeze({ ...manifestation, hitSpent: true });
          }),
        );
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

    private updateBloomShift(dt: number): void {
      this.bloomShiftT = Math.max(0, this.bloomShiftT - dt);
      if (this.bloomShiftT <= 0) this.completePhaseTwoAttack();
    }

    private exitPhaseOne(): void {
      if (this.phaseOneExited) return;
      this.phaseOneExited = true;
      this.resetMoves(0);
      this.atk = "unavailable";
      this.state = "recover";
      this.stateT = ROOTBOUND_PHASE_ONE_CADENCE.recovery;
      bossTransformation(this, {
        id: "rootbound-garden-remembers",
        title: "THE GARDEN REMEMBERS",
        pose: "rootboundGraft",
        line: "STAY. EVERYONE ELSE STAYED.",
        color: this.color,
        sfx: "slam",
      });
    }

    private exitPhaseTwo(): void {
      this.finalPhaseTwoGraftTypes = Object.freeze([...this.activeGraftTypes]);
      this.cancelMemoryChoir();
      this.completeRootCage();
      this.phaseTwoPendingAttack = null;
      this.bloomShiftT = 0;
      this.resetMoves(ROOTBOUND_PHASE_THREE_CADENCE.openingDelay);
      this.movesSinceLastSpring = ROOTBOUND_MOVES_PER_LAST_SPRING;
      this.state = "recover";
      this.stateT = ROOTBOUND_PHASE_TWO_CADENCE.recovery;
      bossTransformation(this, {
        id: "rootbound-nothing-here-dies",
        title: "NOTHING HERE DIES",
        pose: "rootboundRegrowth",
        line: "THE GARDEN WILL REMEMBER YOU.",
        color: this.color,
        sfx: "boom",
      });
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
      this.resetMoves(0);
      this.cinematicRequest = null;
      this.cinematicPose = "";
      this.cinematicT = 0;
      this.applyGraftEffects(ROOTBOUND_NO_GRAFT_EFFECTS);
      this.cancelMemoryChoir();
      this.completeRootCage();
      this.phaseTwoPendingAttack = null;
      this.bloomShiftT = 0;
      if (this.regrowthState.phase === "channeling") {
        const interrupted = advanceRootboundRegrowth(
          this.regrowthState,
          this.regrowthState.startTick ?? 0,
          new Set(),
          true,
        );
        this.regrowthState = resolveRootboundRegrowthOutcome(interrupted, 0).state;
      }
      this.lastSpringStage = null;
      this.lastSpringT = 0;
      this.lastSpringHitSpent = false;
    }

    private selectIdleAttack(player: EnemyPlayerPort): void {
      if (this.phase === 2) this.selectNextPhaseTwoAttack(player.x);
    }

    /** Phase III between moves: after every few moves the keeper calls a Last Spring. */
    private startDueLastSpring(): boolean {
      if (this.phase !== 3 || this.moveState.run !== null) return false;
      if (this.movesSinceLastSpring < ROOTBOUND_MOVES_PER_LAST_SPRING || !this.startLastSpring()) return false;
      this.movesSinceLastSpring = 0;
      return true;
    }

    private openingDelay(): number {
      if (this.phase === 2) return ROOTBOUND_PHASE_TWO_CADENCE.openingDelay / this.graftCadenceMultiplier;
      return this.phase === 3 ? ROOTBOUND_PHASE_THREE_CADENCE.openingDelay : ROOTBOUND_PHASE_ONE_CADENCE.openingDelay;
    }

    private updateAttacks(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort): void {
      this.moveCarries = false;
      if (this.memoryChoirStage !== null) this.updateMemoryChoir(dt, player);
      else if (this.phaseTwoPendingAttack === "bloom-shift") this.updateBloomShift(dt);
      else if (this.lastSpringStage !== null && this.lastSpringStage !== "complete")
        this.updateLastSpring(dt, platforms, player);
      else if (this.playsMoves()) {
        // A recovery (after the intro, Regrowth or Last Spring) runs out before the next move.
        if (this.state !== "idle") {
          this.stateT = Math.max(0, this.stateT - dt);
          if (this.stateT <= 0) this.state = "idle";
        } else if (this.stun <= 0 && !this.attackCommitProtected() && !this.startDueLastSpring())
          this.updateMoves(player);
      } else if (this.stun <= 0) {
        this.stateT = Math.max(0, this.stateT - dt);
        if (this.stateT > 0) return;
        if (this.state === "idle") this.selectIdleAttack(player);
        else {
          this.state = "idle";
          this.stateT = this.openingDelay();
        }
      }
    }

    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort): void {
      this.tickTimers(dt);
      const fraction = this.maxHp > 0 ? this.hp / this.maxHp : 0;
      const nextPhase = fraction > this.phaseMarks[0] ? 1 : fraction > this.phaseMarks[1] ? 2 : 3;
      // Hits cross one threshold at a time (limitIncomingDamage); a direct health set may cross both.
      while (nextPhase > this.phaseMarker) {
        if (this.phaseMarker === 1) this.exitPhaseOne();
        else this.exitPhaseTwo();
        this.phaseMarker += 1;
        this.phaseTag = this.phaseMarker === 2 ? "THE GARDEN REMEMBERS" : "NOTHING HERE DIES";
      }
      this.facing = Math.sign(player.x - this.x) || this.facing;
      this.vx = 0;
      this.contactGraceT = Math.max(0, this.contactGraceT - dt);
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
        this.contactGraceT = ROOTBOUND_ENCOUNTER.openingContactGrace;
      } else this.updateAttacks(dt, platforms, player);
      if (!this.moveCarries) this.integrate(dt, platforms);
    }
  }
  return Rootbound;
}

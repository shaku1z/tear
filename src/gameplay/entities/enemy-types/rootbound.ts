import { practicePhaseEntryHealth, type BossPracticeActorEntry } from "../../training/boss-phase-practice-runtime";
import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import { ROOTBOUND_DEFINITION } from "../../run/boss-definitions";
import type { BossEncounterCleanupReason } from "../../run/boss-encounter";
import {
  GRAFT_ANCHOR_TYPES,
  ROOTBOUND_NO_GRAFT_EFFECTS,
  type GraftAnchorPlacementRequest,
  type GraftAnchorType,
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
  ROOTBOUND_ENCOUNTER,
  ROOTBOUND_GRAFT_ANCHOR_GEOMETRY,
  ROOTBOUND_GRAFTS,
  ROOTBOUND_HEALING,
  ROOTBOUND_PHASE_ONE_CADENCE,
  ROOTBOUND_PHASE_THREE_CADENCE,
  ROOTBOUND_PHASE_TWO_CADENCE,
} from "./rootbound-tuning";
import type { BatonSegment } from "../../combat/held-blade-collision-contracts";
import { bossAttackSecondsToTicks } from "../boss-attacks";
import {
  advanceBossAttack,
  bossAttackDamageTaken,
  bossAttackExposed,
  bossAttackHit,
  bossAttackMotion,
  bossAttackStatus,
  bossAttackPose,
  bossAttackTells,
  bossAttackThreatens,
  bossHitTouches,
  createBossAttackRunnerState,
  exposeBossAttack,
  markBossAttackLanded,
  openBossPhase,
  parryBossAttack,
  type BossAttackContext,
  type BossAttackPose,
  type BossAttackRunnerState,
} from "../boss-attack-runner";
import type { BossTell } from "../boss-tells";
import { ROOTBOUND_MOVES, type RootboundPhase, type RootboundPlace } from "./rootbound-moves";
export * from "./rootbound-tuning";

interface MutableBox {
  x: number;
  y: number;
  hw: number;
  hh: number;
}
type MoveContext = {
  -readonly [Key in keyof BossAttackContext<RootboundPhase>]: BossAttackContext<RootboundPhase>[Key];
};
interface MoveScratch {
  readonly box: MutableBox;
  readonly target: MutableBox;
  readonly blocked: Set<string>;
  readonly context: MoveContext;
}
const NO_TELLS: readonly BossTell[] = Object.freeze([]);
const NO_GRAFT_REQUESTS: readonly GraftAnchorPlacementRequest[] = Object.freeze([]);

/** The Rootbound: Keeper of Spring (moves), The Garden Remembers (Grafts), Nothing Here Dies (Regrowth). */
export function createRootboundType(
  dependencies: EnemyDependencies,
  Enemy: EnemyBaseConstructor,
  bossRuntime: BossRuntime,
) {
  const { CONFIG } = dependencies;
  const { bossTransformation } = bossRuntime;
  // The boss and the player as the runner sees them: one set of objects per boss, reused every tick. Kept
  // off the boss itself, so a saved and restored boss never carries a copy of them (or of the random source).
  const scratchByBoss = new WeakMap<object, MoveScratch>();
  const scratchOf = (boss: object): MoveScratch => {
    let scratch = scratchByBoss.get(boss);
    if (scratch === undefined) {
      const box: MutableBox = { x: 0, y: 0, hw: 0, hh: 0 };
      const target: MutableBox = { x: 0, y: 0, hw: 0, hh: 0 };
      const blocked = new Set<string>();
      const arena = { width: CONFIG.view.w, groundY: CONFIG.world.groundY };
      const context: MoveContext = {
        tick: 0,
        phase: 1,
        boss: box,
        target,
        arena,
        random: dependencies.GAME_RANDOM,
        blocked,
      };
      scratch = { box, target, blocked, context };
      scratchByBoss.set(boss, scratch);
    }
    return scratch;
  };
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
    /** `blocked`: moves that may not start now (a Graft with nowhere to go, a cage already standing). */
    private get scratch(): MoveScratch {
      return scratchOf(this);
    }
    private tellsFor: BossAttackRunnerState | null = null;
    private tellsUpdate = -1;
    private tellsCache: readonly BossTell[] = NO_TELLS;
    private updates = 0;
    /** True while a move moves the boss itself (the body does not fall or slide on its own). */
    moveCarries = false;
    /** True while burrowed: out of sight, untouchable and harmless to touch. */
    hidden = false;
    batonStrike = 0;
    cleanupReason: BossEncounterCleanupReason | null = null;
    phaseOneExited = false;
    graftDamageTakenMultiplier = ROOTBOUND_NO_GRAFT_EFFECTS.incomingDamageMultiplier;
    graftGapMultiplier = ROOTBOUND_NO_GRAFT_EFFECTS.gapMultiplier;
    graftHeals = ROOTBOUND_NO_GRAFT_EFFECTS.heals;
    activeGraftTypes = ROOTBOUND_NO_GRAFT_EFFECTS.activeTypes;
    /** Grafts asked of the stage and not cut since: standing, or about to be planted. */
    graftRequests: readonly GraftAnchorPlacementRequest[] = Object.freeze([]);
    /** The requested Grafts the stage has planted. */
    plantedGraftTypes: readonly string[] = Object.freeze([]);
    /** True once all three Grafts stood together; cutting the last of them then uproots the keeper. */
    fullGrove = false;
    /** The move tick before which no Graft is planted (after a cut). */
    graftRegrowTick = 0;
    /** Seconds since the player last hit the keeper, and the share of full health healed in Phase II. */
    quietT = 0;
    healedFraction = 0;
    /** The health the keeper entered Phase II with: Mercy never heals above it. */
    phaseTwoEntryHp: number | null = null;
    bloomPatternIndex = 0;
    rootCageSequence = 0;
    rootCageRequest: RootCagePlacementRequest | null = null;
    finalPhaseTwoGraftTypes = ROOTBOUND_NO_GRAFT_EFFECTS.activeTypes;
    /** The Well pattern the stage last planted for this boss; a new selection is planted once. */
    plantedBloomPattern: RootboundBloomPatternId | null = null;
    regrowthState: RootboundRegrowthState = createRootboundRegrowthState();
    regrowthDamageTaken = 0;
    /** True once the Regrowth move has asked the stage for its links. */
    regrowthCalled = false;
    /** The health the keeper entered Phase III with: Regrowth never heals above it. */
    phaseThreeEntryHp: number | null = null;
    lastSpringUseCount = 0;

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
          (phase !== 2 || this.activeGraftTypes.length > 0) &&
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
      let dealt =
        damage *
        this.graftDamageTakenMultiplier *
        bossAttackDamageTaken(ROOTBOUND_MOVES, this.moveState, this.moveTick);
      if (this.phaseMarker === 1) dealt = Math.min(dealt, Math.max(0, this.hp - (this.maxHp * this.phaseMarks[1] + 1)));
      if (this.regrowthState.phase === "channeling") this.regrowthDamageTaken += dealt;
      // Any hit restarts the wait before the keeper may heal.
      if (dealt > 0) this.quietT = 0;
      return dealt;
    }

    applyGraftEffects(effects: RootboundGraftEffects): void {
      this.graftDamageTakenMultiplier = effects.incomingDamageMultiplier;
      this.graftGapMultiplier = effects.gapMultiplier;
      this.graftHeals = effects.heals;
      this.activeGraftTypes = effects.activeTypes;
      if (effects.activeTypes.length === GRAFT_ANCHOR_TYPES.length) this.fullGrove = true;
    }

    /** True while the keeper is open: a punish stage, a parry, or a cut Graft or cage. */
    exposed(): boolean {
      return bossAttackExposed(this.moveState, this.moveTick);
    }

    /** Opens the keeper for `seconds`: the move in progress ends without striking. */
    private expose(seconds: number): void {
      this.moveState = exposeBossAttack(
        ROOTBOUND_MOVES,
        this.moveState,
        this.moveTick,
        bossAttackSecondsToTicks(seconds),
      );
      this.syncMoves(true);
    }

    /**
     * Sets the body's flags from the runner state. Called after every change to that state. `label` also
     * writes the state's name (`atk`), which only a tick or a forced exposure does.
     */
    private syncMoves(label: boolean): void {
      const status = bossAttackStatus(ROOTBOUND_MOVES, this.moveState, this.moveContext());
      this.moveCarries = status.carries;
      this.hidden = status.hidden;
      this.batonStrike = status.parryable ? 1 : 0;
      if (label) this.atk = status.label ?? (status.exposed ? "exposed" : "unavailable");
    }

    /** The player cut a Graft: it stops helping, none is planted for a while, and the keeper is opened. */
    graftSevered(graftType: string): void {
      if (this.phase !== 2 || this.cleanupReason !== null) return;
      if (!this.graftRequests.some((request) => request.graftType === graftType)) return;
      this.graftRequests = Object.freeze(this.graftRequests.filter((request) => request.graftType !== graftType));
      this.plantedGraftTypes = Object.freeze(this.plantedGraftTypes.filter((planted) => planted !== graftType));
      this.graftRegrowTick = this.moveTick + bossAttackSecondsToTicks(ROOTBOUND_GRAFTS.regrow);
      const uprooted = this.fullGrove && this.graftRequests.length === 0;
      if (uprooted) this.fullGrove = false;
      this.expose(uprooted ? ROOTBOUND_GRAFTS.uprootedExposed : ROOTBOUND_GRAFTS.cutExposed);
    }

    /** A Graft restored into the fight (TearBench state restore): the keeper takes it as planted. */
    adoptGraft(graftType: GraftAnchorType, geometry: GraftAnchorPlacementRequest["geometry"]): boolean {
      if (this.phase !== 2 || this.cleanupReason !== null) return false;
      // The fight resumes part-way through Phase II: its opening planting is not owed.
      this.moveState = openBossPhase(this.moveState, this.phase);
      if (this.graftRequests.some((request) => request.graftType === graftType)) return true;
      this.graftRequests = Object.freeze([...this.graftRequests, Object.freeze({ graftType, geometry })]);
      this.plantedGraftTypes = Object.freeze([...this.plantedGraftTypes, graftType]);
      return true;
    }

    /** The player cut a Root Cage wall: the keeper is opened. */
    cageSevered(): void {
      if (this.phase === 2 && this.cleanupReason === null) this.expose(ROOTBOUND_GRAFTS.cutExposed);
    }

    /** Mercy heals only an unpressed keeper, by the rules of `ROOTBOUND_HEALING`. */
    private updateHealing(dt: number): void {
      // The wait counts only time the player was free to attack: not while a strike is coming or a cage holds.
      if (!bossAttackThreatens(ROOTBOUND_MOVES, this.moveState) && this.rootCageRequest === null) this.quietT += dt;
      if (
        this.phase !== 2 ||
        !this.graftHeals ||
        this.quietT < ROOTBOUND_HEALING.quietSeconds ||
        this.dead ||
        this.dying ||
        this.hp <= 0
      )
        return;
      const amount = Math.min(
        this.maxHp * ROOTBOUND_HEALING.perSecond * dt,
        this.maxHp * (ROOTBOUND_HEALING.phaseTwoCap - this.healedFraction),
        (this.phaseTwoEntryHp ?? this.maxHp * this.phaseMarks[0]) - this.hp,
      );
      if (!(amount > 0)) return;
      this.hp += amount;
      this.healedFraction += amount / this.maxHp;
    }
    beginRegrowth(startTick: number, connectionIds: readonly string[]): boolean {
      if (
        this.phaseMarker !== 3 ||
        this.phase !== 3 ||
        this.attackCommitProtected() ||
        this.cleanupReason !== null ||
        !this.regrowthCalled ||
        this.regrowthState.useCount !== 0
      )
        return false;
      this.regrowthState = beginRootboundRegrowth(this.regrowthState, startTick, connectionIds);
      this.regrowthDamageTaken = 0;
      return true;
    }

    /** True once hits on the channeling boss reach the authored break fraction of its health. */
    regrowthChannelBroken(): boolean {
      return this.regrowthDamageTaken >= this.maxHp * ROOTBOUND_HEALING.regrowthBreak;
    }

    advanceRegrowth(
      tick: number,
      activeConnectionIds: ReadonlySet<string>,
      bossChannelBroken = false,
    ): RootboundRegrowthState {
      const next = advanceRootboundRegrowth(this.regrowthState, tick, activeConnectionIds, bossChannelBroken);
      this.regrowthState = next;
      if (next.phase !== "resolved" || next.resolvedHealFraction !== null || this.maxHp <= 0) return next;
      // A broken channel heals nothing and opens the keeper; one that ran its course heals for the links left.
      const ceiling = this.phaseThreeEntryHp ?? this.maxHp * this.phaseMarks[1];
      const recoverable = Math.max(0, (ceiling - this.hp) / this.maxHp);
      const outcome = resolveRootboundRegrowthOutcome(next, ROOTBOUND_HEALING.regrowthMax, recoverable);
      this.regrowthState = outcome.state;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * outcome.resolvedHealFraction);
      if (next.interruptClassification === "full-interrupt") this.expose(ROOTBOUND_HEALING.regrowthBrokenExposed);
      return this.regrowthState;
    }

    override contactDamageEnabled(): boolean {
      return (
        !this.attackCommitProtected() &&
        this.contactGraceT <= 0 &&
        this.state === "idle" &&
        this.moveState.run === null &&
        !this.exposed() &&
        !this.hidden
      );
    }

    attackCommitProtected(): boolean {
      return this.introT > 0 || this.state === "intro" || this.cinematicT > 0 || this.cinematicRequest !== null;
    }

    /** The one move context, brought up to date with the boss. `updateMoves` sets the target once a tick. */
    private moveContext(): BossAttackContext<RootboundPhase> {
      const phase = this.phase;
      this.scratch.context.tick = this.moveTick;
      // A Haste Graft shortens the pause after each move, and so does the last phase.
      this.scratch.context.gapMultiplier =
        Math.min(1, this.graftGapMultiplier) * (phase === 3 ? ROOTBOUND_PHASE_THREE_CADENCE.gapMultiplier : 1);
      this.scratch.context.phase = phase === 3 ? 3 : phase === 2 ? 2 : 1;
      this.scratch.box.x = this.x;
      this.scratch.box.y = this.y;
      this.scratch.box.hw = this.hw;
      this.scratch.box.hh = this.hh;
      return this.scratch.context;
    }

    /** The marks to draw now. Built once per update and move state, then handed out again. */
    tells(): readonly BossTell[] {
      if (this.tellsUpdate === this.updates && this.tellsFor === this.moveState) return this.tellsCache;
      this.tellsCache = bossAttackTells(ROOTBOUND_MOVES, this.moveState, this.moveContext());
      this.tellsUpdate = this.updates;
      this.tellsFor = this.moveState;
      return this.tellsCache;
    }

    /** The move being played, for the renderer: move, stage, progress and where it reaches. */
    movePose(): BossAttackPose | null {
      return bossAttackPose(ROOTBOUND_MOVES, this.moveState, this.moveContext());
    }

    /** The vine the player can parry while a parryable move is about to land: from the hand to its reach. */
    batonSegment(): BatonSegment {
      const hit = bossAttackHit(ROOTBOUND_MOVES, this.moveState, this.moveContext());
      const reach = hit?.area.kind === "box" ? hit.area.hw * 2 : 260;
      const y = this.y + 19;
      const a = Object.freeze({ x: this.x + this.facing * this.hw, y });
      const b = Object.freeze({ x: a.x + this.facing * reach, y });
      return { a, b, x1: a.x, y1: a.y, x2: b.x, y2: b.y, radius: 24 };
    }

    /** A parried Vine Lash skips to the parry exposure of the table; that open window is the reward. */
    parryBaton(): boolean {
      const next = parryBossAttack(ROOTBOUND_MOVES, this.moveState, this.moveTick);
      if (next === this.moveState) return false;
      this.moveState = next;
      this.syncMoves(false);
      return true;
    }

    /** Which moves may not start now. Changes the one set in place. */
    private refreshBlockedMoves(): void {
      const blocked = this.scratch.blocked;
      blocked.clear();
      if (this.graftRequests.length >= GRAFT_ANCHOR_TYPES.length || this.moveTick < this.graftRegrowTick)
        blocked.add("plant-graft");
      if (this.rootCageRequest !== null) blocked.add("root-cage");
    }

    /** Advances the move table one tick: motion, the strike, the parry window and what the move places. */
    private updateMoves(platforms: readonly EnemyPlatform[], player: EnemyPlayerPort): void {
      this.moveTick += 1;
      this.scratch.target.x = player.x;
      this.scratch.target.y = player.y;
      this.scratch.target.hw = player.hw;
      this.scratch.target.hh = player.hh;
      this.refreshBlockedMoves();
      const result = advanceBossAttack(ROOTBOUND_MOVES, this.moveState, this.moveContext());
      this.moveState = result.state;
      for (const event of result.events) {
        if (event.type === "place") this.place(event.object, platforms);
      }
      const motion = bossAttackMotion(ROOTBOUND_MOVES, this.moveState, this.scratch.context);
      if (motion !== null) {
        this.x = motion.x;
        this.y = motion.y;
        this.vy = 0;
      }
      const hit = bossAttackHit(ROOTBOUND_MOVES, this.moveState, this.moveContext());
      if (hit !== null && !player.invulnerable && bossHitTouches(hit.area, player)) {
        this.moveState = markBossAttackLanded(this.moveState);
        player.takeDamage(hit.damage, this.x, this);
      }
      const run = this.moveState.run;
      if (run !== null) this.facing = run.facing;
      this.syncMoves(true);
    }

    /**
     * What a move asks of the stage: a Graft, a Root Cage, the next Bloom Well pattern, Regrowth's links, or
     * Last Spring's fracture of a perch (the player sees which one will not hold through the whole tell).
     */
    private place(object: RootboundPlace, platforms: readonly EnemyPlatform[]): void {
      if (object === "regrowth") this.regrowthCalled = true;
      else if (object === "spring") this.callLastSpring(platforms);
      else if (object === "bloom")
        this.bloomPatternIndex = (this.bloomPatternIndex + 1) % ROOTBOUND_BLOOM_PATTERN_IDS.length;
      else if (object === "cage") this.startRootCage(this.moveState.run?.target.x ?? this.scratch.target.x);
      else this.requestGraft(platforms);
    }

    /** Ends any move in progress, without a strike; the next move waits `delaySeconds`. */
    private resetMoves(delaySeconds: number): void {
      this.moveState = createBossAttackRunnerState(this.moveTick + bossAttackSecondsToTicks(delaySeconds));
      this.syncMoves(false);
    }

    /** Asks the stage for the next Graft the keeper does not have, on its perch. */
    private requestGraft(platforms: readonly EnemyPlatform[]): void {
      const index = GRAFT_ANCHOR_TYPES.findIndex(
        (type) => !this.graftRequests.some((request) => request.graftType === type),
      );
      const graftType = GRAFT_ANCHOR_TYPES[index];
      if (graftType === undefined) return;
      this.graftRequests = Object.freeze([
        ...this.graftRequests,
        Object.freeze({ graftType, geometry: this.graftPerch(index, platforms) }),
      ]);
    }

    /**
     * Where Graft `index` (0 left, 1 middle, 2 right) stands: on a platform when the arena has enough of
     * them, otherwise on the floor at a fifth, half and four fifths of the arena.
     */
    private graftPerch(index: number, platforms: readonly EnemyPlatform[]): GraftAnchorPlacementRequest["geometry"] {
      const { width, height } = ROOTBOUND_GRAFT_ANCHOR_GEOMETRY;
      const perches = platforms
        .filter(
          (platform) =>
            platform.oneway === true &&
            platform.floor !== true &&
            platform.void !== true &&
            platform.y < CONFIG.world.groundY - 40 &&
            (platform.arenaState === undefined ||
              platform.arenaState === "stable" ||
              platform.arenaState === "stressed"),
        )
        .sort((a, b) => a.x - b.x);
      const last = perches.length - 1;
      const slots =
        last >= 2 ? [0, Math.floor(last / 2), last] : last === 1 ? [0, -1, 1] : last === 0 ? [-1, 0, -1] : [];
      const perch = perches[slots[index] ?? -1];
      const centre = perch === undefined ? CONFIG.view.w * (0.2 + index * 0.3) : perch.x + perch.w / 2;
      const top = perch === undefined ? CONFIG.world.groundY : perch.y;
      return Object.freeze({ x: centre - width / 2, y: top - height, w: width, h: height });
    }

    graftAnchorPlacements(): readonly GraftAnchorPlacementRequest[] {
      return this.phase === 2 ? this.graftRequests : NO_GRAFT_REQUESTS;
    }
    acknowledgeGraftPlanted(graftType: string): void {
      this.plantedGraftTypes = Object.freeze([...this.plantedGraftTypes, graftType]);
    }

    acknowledgeBloomPattern(patternId: RootboundBloomPatternId | null): void {
      this.plantedBloomPattern = patternId;
    }

    bossBloomPattern(): RootboundBloomPatternId | null {
      if (this.phase === 3 && this.moveState.run?.attackId === "last-spring") return "last-spring";
      if (this.phase !== 2) return null;
      return ROOTBOUND_BLOOM_PATTERN_IDS[this.bloomPatternIndex % ROOTBOUND_BLOOM_PATTERN_IDS.length] ?? null;
    }

    /** Last Spring's tell begins: count it, and start a perch fracturing under the keeper's bloom. */
    private callLastSpring(platforms: readonly EnemyPlatform[]): void {
      this.lastSpringUseCount += 1;
      const fracture = platforms.find(
        (platform) =>
          platform.oneway &&
          platform.arenaPlatId !== undefined &&
          (platform.arenaState === "stable" || platform.arenaState === "stressed"),
      );
      if (fracture !== undefined) fracture.arenaFractureRequest = { reason: "rootbound-last-spring", color: "#e4c95a" };
    }

    /** Raises a Root Cage around `centerX`. False when one already stands or the phase is not Phase II. */
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
      return true;
    }

    rootCagePlacement(): RootCagePlacementRequest | null {
      return this.phase === 2 ? this.rootCageRequest : null;
    }

    /** The stage reports the cage gone (cut, timed out or cleaned up); another may be raised. */
    completeRootCage(): void {
      this.rootCageRequest = null;
    }

    private exitPhaseOne(): void {
      if (this.phaseOneExited) return;
      this.phaseOneExited = true;
      this.resetMoves(ROOTBOUND_PHASE_TWO_CADENCE.openingDelay);
      this.phaseTwoEntryHp = this.hp;
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

    /** Phase II is over: its Grafts and cage go (the stage removes what is no longer requested). */
    private endGarden(): void {
      this.graftRequests = NO_GRAFT_REQUESTS;
      this.plantedGraftTypes = Object.freeze([]);
      this.fullGrove = false;
      this.rootCageRequest = null;
      this.scratch.blocked.clear();
    }

    private exitPhaseTwo(): void {
      this.finalPhaseTwoGraftTypes = Object.freeze([...this.activeGraftTypes]);
      this.endGarden();
      this.resetMoves(ROOTBOUND_PHASE_THREE_CADENCE.openingDelay);
      this.phaseThreeEntryHp = this.hp;
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
      this.endGarden();
      if (this.regrowthState.phase === "channeling") {
        const interrupted = advanceRootboundRegrowth(
          this.regrowthState,
          this.regrowthState.startTick ?? 0,
          new Set(),
          true,
        );
        this.regrowthState = resolveRootboundRegrowthOutcome(interrupted, 0, 0).state;
      }
    }

    private updateAttacks(platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, dt: number): void {
      this.moveCarries = false;
      // A recovery (after the intro or a phase change) runs out before the next move.
      if (this.state !== "idle") {
        this.stateT = Math.max(0, this.stateT - dt);
        if (this.stateT <= 0) this.state = "idle";
      } else if (this.stun <= 0 && !this.attackCommitProtected()) this.updateMoves(platforms, player);
    }

    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort): void {
      this.updates += 1;
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
      } else {
        this.updateHealing(dt);
        this.updateAttacks(platforms, player, dt);
      }
      if (!this.moveCarries) this.integrate(dt, platforms);
    }
  }
  return Rootbound;
}

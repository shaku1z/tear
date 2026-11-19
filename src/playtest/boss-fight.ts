import { buildWatchChoiceScore } from "../agents/watch-build-choice";
import { bossDefinition } from "../gameplay/run/boss-definitions";
import type { BossId } from "../gameplay/run/content-director";
import type { RunDifficulty } from "../gameplay/run/session";
import { isPracticeBossId, isPracticeBossPhase } from "../gameplay/training/boss-phase-practice-runtime";
import type { WeaponId } from "../gameplay/weapon-selection";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION, type TearScenarioV1 } from "../tearbench/contracts";
import { requireProductionHeadlessScenario } from "../tearbench/production-headless-scenario";
import { TEAR_SIMULATION_TICKS_PER_SECOND } from "../tearbench/simulation-profile";
import { createProductionHeadlessEnvironment } from "../tearbench/production-headless-environment";
import { createObjectCounter, readCuttableObjects, type ObjectCount } from "./boss-objects";
import { BOSS_PLAYER_IDS, createBossPlayer, type BossPlayerId } from "./boss-player";
import { boxOverlaps, readBoss, readPlayerBox, trainingResets, type BossView, type PlayerBox } from "./boss-view";

export interface BossFightRequest {
  readonly boss: BossId;
  readonly difficulty: RunDifficulty;
  readonly weapon: WeaponId;
  readonly seed: string;
  readonly player: BossPlayerId;
  /**
   * Start at this phase through the game's Playground boss practice, which brings the boss there by its own
   * transitions. The game offers it for the bosses and phases its practice runtime accepts, with Sword on Normal
   * only. Without it the fight starts at Phase I in boss-only mode.
   */
  readonly phase?: number;
  /** The fight is stopped and reported as a time limit after this many simulation ticks. */
  readonly maxTicks: number;
}

export type BossFightEnd = "boss defeated" | "player defeated" | "time limit" | "broken";

export interface AttributedHits {
  readonly hits: number;
  readonly damage: number;
}

export interface BossPhaseResult {
  readonly phase: number;
  readonly ticks: number;
  readonly damageDealt: number;
  readonly bossHealed: number;
  readonly damageTaken: number;
  readonly hitsTaken: number;
  /** Ticks in which the boss reported itself exposed. */
  readonly exposedTicks: number;
  /**
   * Damage to the player by the move it is attributed to. The game has no event that names the source
   * of damage, so each loss of health is attributed to a damaging tell that was active on the player
   * at that tick, else to the body of the boss when they touch, else to "unmarked".
   */
  readonly hitsBy: Readonly<Record<string, AttributedHits>>;
  /** What stood on the stage for a weapon to cut (Grafts, cage walls, roots), by name. Empty for most bosses. */
  readonly objects: Readonly<Record<string, Readonly<ObjectCount>>>;
}

export interface BossFightResult extends BossFightRequest {
  readonly end: BossFightEnd;
  readonly reason?: string;
  readonly ticks: number;
  readonly bossMaxHp: number;
  readonly bossHpLeft: number;
  readonly limitedTellData: boolean;
  /** Ticks the game took to bring the boss to the chosen phase, before the fight; not counted in any phase. */
  readonly setupTicks: number;
  /** Ticks spent in phase-change cinematics; not counted in any phase. */
  readonly cinematicTicks: number;
  /** The last loss of health when the player was defeated: what it is attributed to and what the boss was doing. */
  readonly killingHit?: Readonly<{ source: string; damage: number; bossDoing: string }>;
  readonly phases: readonly BossPhaseResult[];
}

export const UNMARKED_HIT = "unmarked";
export const BODY_HIT = "boss body";
/** How long the game may take to bring a boss to a chosen phase before the fight counts as broken. */
const PRACTICE_SETUP_LIMIT_TICKS = 60 * TEAR_SIMULATION_TICKS_PER_SECOND;
/** How far outside a tell a hit may land and still be attributed to it: the area is drawn, the hit is a shape. */
const ATTRIBUTION_MARGIN_PIXELS = 12;

interface MutablePhase {
  phase: number;
  ticks: number;
  damageDealt: number;
  bossHealed: number;
  damageTaken: number;
  hitsTaken: number;
  exposedTicks: number;
  hitsBy: Record<string, { hits: number; damage: number }>;
  objects: Record<string, ObjectCount>;
}

/**
 * The scenario for a fight, admitted by the headless environment's own check. An unknown boss, weapon or
 * difficulty is refused here, by name, before any fight starts.
 */
export function bossFightScenario(request: BossFightRequest): TearScenarioV1 {
  if (!BOSS_PLAYER_IDS.includes(request.player))
    throw new RangeError(`no player "${request.player}"; the players are ${BOSS_PLAYER_IDS.join(", ")}`);
  if (request.phase !== undefined) {
    const phases = bossPhaseCount(request.boss);
    if (!Number.isInteger(request.phase) || request.phase < 1 || request.phase > phases)
      throw new RangeError(`${request.boss} has phases 1 to ${String(phases)}, not ${String(request.phase)}`);
    if (!isPracticeBossId(request.boss) || !isPracticeBossPhase(request.phase))
      throw new RangeError(`${request.boss} has no phase practice in the game`);
    if (request.weapon !== "sword" || request.difficulty !== "normal")
      throw new RangeError("a chosen phase uses the game's boss practice, which runs only with Sword on Normal");
  }
  const start =
    request.phase === undefined
      ? { mode: "bossonly", difficulty: request.difficulty, weapon: request.weapon, boss: request.boss }
      : { mode: "tutorial", difficulty: request.difficulty, weapon: request.weapon };
  return requireProductionHeadlessScenario({
    format: TEAR_CONTRACT_FORMAT,
    kind: "scenario",
    schemaVersion: TEAR_CONTRACT_VERSION,
    id: `playtest-boss-${request.boss}-${String(request.phase ?? 1)}-${request.difficulty}-${request.weapon}-${request.seed}`,
    version: 1,
    description: "Playtest boss fight",
    stateClass: "recorded-canonical",
    executionClass: "engineering",
    seed: request.seed,
    start,
    // The run also holds the time the game takes to bring the boss to a chosen phase; the fight has its own limit.
    maxTicks: request.maxTicks + (request.phase === undefined ? 0 : PRACTICE_SETUP_LIMIT_TICKS),
    assertions: ["runtime.finite-state"],
    tags: ["playtest"],
  });
}

/** How many phases the boss has, from its definition: one more than its phase marks. */
export function bossPhaseCount(boss: BossId): number {
  return bossDefinition(boss).phaseMarks.length + 1;
}

/** The move a loss of health is attributed to, from the tells seen just before and just after the step. */
export function attributeHit(player: PlayerBox, before: BossView | null, after: BossView | null): string {
  for (const view of [before, after]) {
    const tell = view?.tells.find(
      (candidate) =>
        candidate.damaging && candidate.stage === "active" && boxOverlaps(player, candidate, ATTRIBUTION_MARGIN_PIXELS),
    );
    if (tell !== undefined) return tell.attackId;
  }
  const body = after ?? before;
  return body !== null && boxOverlaps(player, body, ATTRIBUTION_MARGIN_PIXELS) ? BODY_HIT : UNMARKED_HIT;
}

function emptyPhase(phase: number): MutablePhase {
  return {
    phase,
    ticks: 0,
    damageDealt: 0,
    bossHealed: 0,
    damageTaken: 0,
    hitsTaken: 0,
    exposedTicks: 0,
    hitsBy: {},
    objects: {},
  };
}

/**
 * For a fight at a chosen phase: the game brings the boss there and the player waits, as it would watching the
 * transition. Returns the ticks that took and whether the boss got there in time; at once for a Phase I fight.
 */
function bringToChosenPhase(
  environment: ReturnType<typeof createProductionHeadlessEnvironment>,
  request: BossFightRequest,
): Readonly<{ setupTicks: number; reached: boolean }> {
  if (!isPracticeBossId(request.boss) || !isPracticeBossPhase(request.phase)) return { setupTicks: 0, reached: true };
  const practice = environment.practiceBoss(request.boss, request.phase);
  let setupTicks = 0;
  while (practice() !== "active" && setupTicks < PRACTICE_SETUP_LIMIT_TICKS) {
    environment.step([]);
    setupTicks += 1;
  }
  return { setupTicks, reached: practice() === "active" };
}

/** Plays one boss fight on the real game, headless, and measures it phase by phase. */
export function playBossFight(request: BossFightRequest): BossFightResult {
  const environment = createProductionHeadlessEnvironment();
  try {
    environment.reset(bossFightScenario(request));
    const { setupTicks, reached } = bringToChosenPhase(environment, request);
    if (!reached) return brokenFight(request, setupTicks, `the boss did not reach phase ${String(request.phase)}`);
    const player = createBossPlayer(request.player);
    const phases: MutablePhase[] = [];
    const phaseRow = (phase: number): MutablePhase => {
      const last = phases.at(-1);
      if (last?.phase === phase) return last;
      const next = emptyPhase(phase);
      phases.push(next);
      return next;
    };
    let ticks = 0;
    let end: BossFightEnd | undefined;
    let reason: string | undefined;
    let seenBoss: BossView | null = null;
    let limitedTellData = false;
    let cinematicTicks = 0;
    let lastHit: BossFightResult["killingHit"];
    const countObjects = createObjectCounter();
    while (end === undefined) {
      const state = environment.policyObservation();
      const rawUi = environment.policyUiObservation();
      const ui = {
        ...rawUi,
        choices: rawUi.choices.map((choice) => ({
          ...choice,
          score: buildWatchChoiceScore(choice.id, request.weapon),
        })),
      };
      const before = readBoss(environment.world());
      if (before !== null && before.id !== request.boss) {
        end = "broken";
        reason = `asked for ${request.boss}, the game started ${before.id}`;
        break;
      }
      const box = readPlayerBox(environment.world());
      const hpBefore = state.player.hp;
      const resetsBefore = trainingResets(environment.world());
      if (environment.cinematicActive()) cinematicTicks += 1;
      const step = environment.step(player.decide({ state, ui }, before, box));
      ticks += 1;
      const after = readBoss(environment.world());
      const boxAfter = readPlayerBox(environment.world());
      const stateAfter = environment.policyObservation();
      const observed = stateAfter.player;
      // Playground practice restores a defeated player instead of ending the run; the game reports it, and it
      // counts as the defeat it is.
      const reset = trainingResets(environment.world()) > resetsBefore;
      const hpAfter = reset ? 0 : observed.hp;
      if (before !== null && !environment.cinematicActive()) {
        seenBoss = after ?? before;
        limitedTellData ||= before.limitedTellData;
        const row = phaseRow(before.phase);
        row.ticks += 1;
        countObjects(row.objects, readCuttableObjects(stateAfter));
        if (before.tells.some((tell) => tell.stage === "exposed")) row.exposedTicks += 1;
        const bossChange = (after === null ? 0 : after.hp) - before.hp;
        if (bossChange < 0) row.damageDealt += -bossChange;
        else if (after !== null && after.phase === before.phase) row.bossHealed += bossChange;
        if (hpAfter < hpBefore) {
          const lost = hpBefore - hpAfter;
          const source = attributeHit(boxAfter ?? box ?? { x: 0, y: 0, hw: 0, hh: 0 }, before, after);
          const entry = (row.hitsBy[source] ??= { hits: 0, damage: 0 });
          entry.hits += 1;
          entry.damage += lost;
          row.hitsTaken += 1;
          row.damageTaken += lost;
          lastHit = { source, damage: lost, bossDoing: before.doing };
        }
        if (after === null || after.dead) end = "boss defeated";
        else if (player.phaseTicks !== undefined && row.ticks >= player.phaseTicks) {
          end = "time limit";
          reason = `the ${player.id} player plays ${String(secondsOf(player.phaseTicks))} s of a phase`;
        }
      }
      if (end === undefined && (hpAfter <= 0 || step.terminated)) end = hpAfter <= 0 ? "player defeated" : "broken";
      if (end === "player defeated" && reset) reason = "the Playground restored the player; the fight stops there";
      if (end === "broken" && reason === undefined) reason = "the run ended without a defeat on either side";
      if (end === undefined && (step.truncated || ticks >= request.maxTicks)) {
        const screen = environment.policyUiObservation().screen;
        end = screen === "playing" && seenBoss !== null ? "time limit" : "broken";
        if (end === "broken")
          reason = seenBoss === null ? "no boss appeared" : `the fight stopped on the ${screen} screen`;
      }
    }
    return {
      ...request,
      end,
      ...(reason === undefined ? {} : { reason }),
      ticks,
      bossMaxHp: seenBoss?.maxHp ?? 0,
      bossHpLeft: end === "boss defeated" ? 0 : (seenBoss?.hp ?? 0),
      limitedTellData,
      setupTicks,
      cinematicTicks,
      ...(end === "player defeated" && lastHit !== undefined ? { killingHit: lastHit } : {}),
      phases,
    };
  } finally {
    environment.dispose();
  }
}

function brokenFight(request: BossFightRequest, setupTicks: number, reason: string): BossFightResult {
  return {
    ...request,
    end: "broken",
    reason,
    ticks: 0,
    bossMaxHp: 0,
    bossHpLeft: 0,
    limitedTellData: false,
    setupTicks,
    cinematicTicks: 0,
    phases: [],
  };
}

export const secondsOf = (ticks: number): number => ticks / TEAR_SIMULATION_TICKS_PER_SECOND;

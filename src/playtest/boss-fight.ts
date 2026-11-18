import { buildWatchChoiceScore } from "../agents/watch-build-choice";
import type { BossId } from "../gameplay/run/content-director";
import type { RunDifficulty } from "../gameplay/run/session";
import type { WeaponId } from "../gameplay/weapon-selection";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION, type TearScenarioV1 } from "../tearbench/contracts";
import { requireProductionHeadlessScenario } from "../tearbench/production-headless-scenario";
import { TEAR_SIMULATION_TICKS_PER_SECOND } from "../tearbench/simulation-profile";
import { createProductionHeadlessEnvironment } from "../tearbench/production-headless-environment";
import { createBossPlayer, type BossPlayerId } from "./boss-player";
import { boxOverlaps, readBoss, readPlayerBox, type BossView, type PlayerBox } from "./boss-view";

export interface BossFightRequest {
  readonly boss: BossId;
  readonly difficulty: RunDifficulty;
  readonly weapon: WeaponId;
  readonly seed: string;
  readonly player: BossPlayerId;
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
}

export interface BossFightResult extends BossFightRequest {
  readonly end: BossFightEnd;
  readonly reason?: string;
  readonly ticks: number;
  readonly bossMaxHp: number;
  readonly bossHpLeft: number;
  readonly limitedTellData: boolean;
  /** Ticks spent in phase-change cinematics; not counted in any phase. */
  readonly cinematicTicks: number;
  /** The last loss of health when the player was defeated: what it is attributed to and what the boss was doing. */
  readonly killingHit?: Readonly<{ source: string; damage: number; bossDoing: string }>;
  readonly phases: readonly BossPhaseResult[];
}

export const UNMARKED_HIT = "unmarked";
export const BODY_HIT = "boss body";
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
}

/**
 * The scenario for a fight, admitted by the headless environment's own check. An unknown boss, weapon or
 * difficulty is refused here, by name, before any fight starts.
 */
export function bossFightScenario(request: BossFightRequest): TearScenarioV1 {
  return requireProductionHeadlessScenario({
    format: TEAR_CONTRACT_FORMAT,
    kind: "scenario",
    schemaVersion: TEAR_CONTRACT_VERSION,
    id: `playtest-boss-${request.boss}-${request.difficulty}-${request.weapon}-${request.seed}`,
    version: 1,
    description: "Playtest boss fight",
    stateClass: "recorded-canonical",
    executionClass: "engineering",
    seed: request.seed,
    start: { mode: "bossonly", difficulty: request.difficulty, weapon: request.weapon, boss: request.boss },
    maxTicks: request.maxTicks,
    assertions: ["runtime.finite-state"],
    tags: ["playtest"],
  });
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

/** Plays one boss fight on the real game, headless, and measures it phase by phase. */
export function playBossFight(request: BossFightRequest): BossFightResult {
  const environment = createProductionHeadlessEnvironment();
  try {
    environment.reset(bossFightScenario(request));
    const player = createBossPlayer(request.player);
    const phases: MutablePhase[] = [];
    const phaseRow = (phase: number): MutablePhase => {
      const last = phases.at(-1);
      if (last?.phase === phase) return last;
      const next = {
        phase,
        ticks: 0,
        damageDealt: 0,
        bossHealed: 0,
        damageTaken: 0,
        hitsTaken: 0,
        exposedTicks: 0,
        hitsBy: {},
      };
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
      if (environment.cinematicActive()) cinematicTicks += 1;
      const step = environment.step(player.decide({ state, ui }, before, box));
      ticks += 1;
      const after = readBoss(environment.world());
      const boxAfter = readPlayerBox(environment.world());
      const hpAfter = environment.policyObservation().player.hp;
      if (before !== null && !environment.cinematicActive()) {
        seenBoss = after ?? before;
        limitedTellData ||= before.limitedTellData;
        const row = phaseRow(before.phase);
        row.ticks += 1;
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
      }
      if (end === undefined && (hpAfter <= 0 || step.terminated)) end = hpAfter <= 0 ? "player defeated" : "broken";
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
      cinematicTicks,
      ...(end === "player defeated" && lastHit !== undefined ? { killingHit: lastHit } : {}),
      phases,
    };
  } finally {
    environment.dispose();
  }
}

export const secondsOf = (ticks: number): number => ticks / TEAR_SIMULATION_TICKS_PER_SECOND;

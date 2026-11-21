import { ENEMY_IDENTITY_IDS, PUBLISHED_ENEMY_IDENTITY_IDS, type EnemyKind } from "../gameplay/run/content-director";
import type { RunDifficulty } from "../gameplay/run/session";
import type { WeaponId } from "../gameplay/weapon-selection";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION } from "../gameplay/snapshot/snapshot-contract";
import type { TearScenarioV1 } from "../tearbench/contracts";
import { agentView, type AttributedHits } from "./boss-fight";
import { BOSS_PLAYER_IDS, type BossPlayer, type BossPlayerId } from "./boss-player";
import { createSeededPlayer } from "./player-variation";
import { readPlayerBox, trainingResets } from "./boss-view";
import { createProductionHeadlessEnvironment } from "./headless/production-headless-environment";
import { requireProductionHeadlessScenario } from "./headless/production-headless-scenario";
import { attributeWaveHit, copyActors, kindOf } from "./wave-play";

export interface EnemyRequest {
  readonly enemy: EnemyKind;
  /** How many of the kind the player meets at once. */
  readonly count: number;
  readonly difficulty: RunDifficulty;
  readonly weapon: WeaponId;
  readonly seed: string;
  readonly player: BossPlayerId;
  /** The meeting is stopped and reported as a time limit after this many simulation ticks. */
  readonly maxTicks: number;
}

/**
 * "stalled": the player paused the game, which the scripted player does when nothing has changed for 15 seconds:
 * no health lost on either side and no enemy arrived or fell.
 */
export type EnemyEnd = "cleared" | "player defeated" | "stalled" | "time limit" | "broken";

export interface EnemyResult extends EnemyRequest {
  readonly end: EnemyEnd;
  readonly reason?: string;
  readonly ticks: number;
  /** Health of the enemies as they arrived, summed. */
  readonly enemyHealth: number;
  /** Health the enemies had left at the end, summed. */
  readonly enemyHealthLeft: number;
  /** Every kind that was in play, with how many: more than was asked for when an enemy calls others. */
  readonly inPlay: Readonly<Record<string, number>>;
  readonly damageTaken: number;
  readonly hitsTaken: number;
  /** Damage to the player by what it is attributed to, as in a wave (`attributeWaveHit`). */
  readonly hitsBy: Readonly<Record<string, AttributedHits>>;
}

/** The kinds an `enemies` report plays when none is named: every enemy the published game has. */
export const REPORT_ENEMIES: readonly EnemyKind[] = PUBLISHED_ENEMY_IDENTITY_IDS;
/** The most of one kind a meeting may hold. */
export const ENEMY_COUNT_LIMIT = 12;

interface EnemyActor {
  readonly kind?: string;
  readonly supportType?: string;
  readonly hp: number;
  readonly maxHp?: number;
  readonly dead?: boolean;
  readonly dying?: boolean;
}

/** The scenario for a meeting, admitted by the headless environment's own check, which refuses a wrong id by name. */
export function enemyScenario(request: EnemyRequest): TearScenarioV1 {
  if (!BOSS_PLAYER_IDS.includes(request.player))
    throw new RangeError(`no player "${request.player}"; the players are ${BOSS_PLAYER_IDS.join(", ")}`);
  if (!ENEMY_IDENTITY_IDS.includes(request.enemy))
    throw new RangeError(`no enemy "${request.enemy}"; the enemies are ${ENEMY_IDENTITY_IDS.join(", ")}`);
  if (!Number.isInteger(request.count) || request.count < 1 || request.count > ENEMY_COUNT_LIMIT)
    throw new RangeError(`a meeting holds 1 to ${String(ENEMY_COUNT_LIMIT)} enemies, not ${String(request.count)}`);
  return requireProductionHeadlessScenario({
    format: TEAR_CONTRACT_FORMAT,
    kind: "scenario",
    schemaVersion: TEAR_CONTRACT_VERSION,
    id: `playtest-enemy-${request.enemy}-${String(request.count)}-${request.difficulty}-${request.weapon}-${request.seed}`,
    version: 1,
    description: "Playtest enemy meeting",
    stateClass: "recorded-canonical",
    executionClass: "engineering",
    seed: request.seed,
    // The Playground is the game's own empty arena: no wave, no spawn queue, nothing but what is put in it.
    start: { mode: "playground", difficulty: request.difficulty, weapon: request.weapon },
    maxTicks: request.maxTicks,
    assertions: ["runtime.finite-state"],
    tags: ["playtest"],
  });
}

/**
 * Plays the player against enemies of one kind on the real game, headless, and measures the meeting. The
 * enemies are put in play by the game's own spawner, at wave 1 strength, and the player has no upgrades.
 */
export function playEnemy(
  request: EnemyRequest,
  player: BossPlayer = createSeededPlayer(request.player, request.seed),
): EnemyResult {
  const environment = createProductionHeadlessEnvironment();
  try {
    environment.reset(enemyScenario(request));
    for (let placed = 0; placed < request.count; placed += 1) environment.spawnEnemy(request.enemy);
    const world = environment.world();
    const actors = (): readonly EnemyActor[] => world.enemies();
    const living = (): readonly EnemyActor[] => actors().filter((enemy) => enemy.dead !== true && !enemy.dying);
    const health = new Map<EnemyActor, number>();
    const inPlay: Record<string, number> = {};
    const hitsBy: Record<string, { hits: number; damage: number }> = {};
    let enemyHealth = 0;
    let ticks = 0;
    let damageTaken = 0;
    let hitsTaken = 0;
    let end: EnemyEnd | undefined;
    let reason: string | undefined;
    const note = (): void => {
      for (const enemy of actors()) {
        if (!health.has(enemy)) {
          const kind = kindOf(enemy);
          inPlay[kind] = (inPlay[kind] ?? 0) + 1;
          enemyHealth += enemy.maxHp ?? enemy.hp;
        }
        health.set(enemy, Math.max(0, enemy.hp));
      }
    };
    note();
    if (living().length === 0) {
      end = "broken";
      reason = `the game put no ${request.enemy} in play`;
    }
    while (end === undefined) {
      const view = agentView(environment, request.weapon);
      const box = readPlayerBox(world);
      const hpBefore = view.state.player.hp;
      const resetsBefore = trainingResets(world);
      const before = copyActors(world);
      const step = environment.step(player.decide(view, null, box));
      ticks += 1;
      note();
      // The Playground restores a defeated player instead of ending the run; the game reports it, and it counts
      // as the defeat it is.
      const reset = trainingResets(world) > resetsBefore;
      const after = environment.policyObservation().player;
      const hpAfter = reset ? 0 : after.hp;
      if (hpAfter < hpBefore) {
        const source = attributeWaveHit(
          box ?? { x: after.x, y: after.y, hw: 0, hh: 0 },
          before.projectiles,
          before.enemies,
        );
        const entry = (hitsBy[source] ??= { hits: 0, damage: 0 });
        entry.hits += 1;
        entry.damage += hpBefore - hpAfter;
        hitsTaken += 1;
        damageTaken += hpBefore - hpAfter;
      }
      if (hpAfter <= 0) end = "player defeated";
      else if (living().length === 0) end = "cleared";
      else if (step.terminated) {
        end = "broken";
        reason = "the Playground ended with enemies in play and the player alive";
      } else if (environment.policyUiObservation().screen === "paused") end = "stalled";
      else if (step.truncated || ticks >= request.maxTicks) end = "time limit";
    }
    const gone = (enemy: EnemyActor): boolean =>
      enemy.dead === true || enemy.dying === true || !actors().includes(enemy);
    return {
      ...request,
      end,
      ...(reason === undefined ? {} : { reason }),
      ticks,
      enemyHealth,
      enemyHealthLeft: [...health].reduce((total, [enemy, hp]) => total + (gone(enemy) ? 0 : hp), 0),
      inPlay,
      damageTaken,
      hitsTaken,
      hitsBy,
    };
  } finally {
    environment.dispose();
  }
}

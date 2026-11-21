/**
 * The determinism corpus: 15 headless streams (every weapon × melee, throw and boss) and the scripted,
 * observation-driven players that play them: a fixed-cadence script for the waves, and the boss playtest's
 * tell-avoiding player (src/playtest/boss-player.ts, used unchanged) for the boss streams. `pnpm test:determinism` pins their hash streams
 * (tests/unit/canonical-hash-stream.test.ts); the replay round trip records and verifies the same runs
 * (tests/unit/replay-round-trip.test.ts).
 */
import type { GameAction } from "../../src/input/game-action";
import { WEAPON_IDS, type WeaponId } from "../../src/gameplay/weapon-selection";
import type { TearObservationV1, TearScenarioV1 } from "../../src/tearbench/contracts";
import type { ProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";
import { agentView } from "../../src/playtest/boss-fight";
import { createBossPlayer } from "../../src/playtest/boss-player";
import { readBoss, readPlayerBox } from "../../src/playtest/boss-view";

const SPIN_PER_TICK = 30_000;
const AIM_TURNS = 1_000_000;
const AXIS = 1_000;
const REWARD_SCREENS: Readonly<Record<string, "draft-choice" | "reserve-choice" | "tier-up-choice">> = Object.freeze({
  draft: "draft-choice",
  reserve: "reserve-choice",
  tierup: "tier-up-choice",
});

export const PLANS = Object.freeze({
  melee: Object.freeze({ mode: "endless", ticks: 2_160, throws: false }),
  throw: Object.freeze({ mode: "endless", ticks: 2_160, throws: true }),
  boss: Object.freeze({ mode: "bossonly", ticks: 2_160 }),
});

/**
 * The boss streams' seeds, `hash-stream:<weapon>:boss` then `…:boss:1` to `…:boss:9`: each stream takes the
 * first on which the tell-avoiding player survives the whole horizon. The boss arrival plays in 42
 * simulation ticks, as in live play (it used to run 168 full-speed ticks headless, a free window on a boss
 * that could not yet attack), and a boss stream lasts 18 s, so not every seed survives and few reach a
 * later phase. Measured over the ten seeds when the arrival moved onto the simulation clock (survived /
 * reached Phase II): sword 8 / 2, hammer 8 / 0, greatsword 10 / 0, chainblade 10 / 2, riftlock 5 / 4. The
 * "a boss reaches a later phase" fact rests on riftlock. Per-weapon Phase II is not covered here
 * (docs/PITFALLS.md).
 */
const BOSS_SEED_INDEX: Readonly<Record<WeaponId, number>> = Object.freeze({
  sword: 0,
  hammer: 1,
  greatsword: 0,
  chainblade: 0,
  riftlock: 2,
});

function bossSeed(weapon: WeaponId): string {
  const index = BOSS_SEED_INDEX[weapon];
  return index === 0 ? `hash-stream:${weapon}:boss` : `hash-stream:${weapon}:boss:${String(index)}`;
}
export type PlanId = keyof typeof PLANS;

export interface StreamSpec {
  readonly id: string;
  readonly weapon: WeaponId;
  readonly plan: PlanId;
  readonly seed: string;
  readonly mode: string;
  readonly difficulty: "easy";
  readonly ticks: number;
}

export const SPECS: readonly StreamSpec[] = WEAPON_IDS.flatMap((weapon) =>
  (Object.keys(PLANS) as PlanId[]).map((plan) => ({
    id: `${weapon}/${plan}`,
    weapon,
    plan,
    // The wave streams were re-drawn when a first wave gained its opening grace (three seconds longer, so
    // their horizon grew by the same).
    seed: plan === "boss" ? bossSeed(weapon) : `hash-stream:${weapon}:${plan}:grace`,
    mode: PLANS[plan].mode,
    difficulty: "easy" as const,
    ticks: PLANS[plan].ticks,
  })),
);

export function scenarioContract(spec: StreamSpec): TearScenarioV1 {
  return {
    format: "tear-contract",
    kind: "scenario",
    schemaVersion: 1,
    id: `hash-stream-${spec.weapon}-${spec.plan}`,
    version: 1,
    description: "Golden authoritative hash stream",
    stateClass: "recorded-canonical",
    executionClass: "training",
    seed: spec.seed,
    start: { mode: spec.mode, difficulty: spec.difficulty, weapon: spec.weapon },
    maxTicks: spec.ticks,
    assertions: ["runtime.finite-state"],
    tags: ["determinism", "hash-stream"],
  } as TearScenarioV1;
}

function nearestActor(observation: TearObservationV1) {
  let nearest: TearObservationV1["entities"][number] | undefined;
  for (const entity of observation.entities) {
    if (entity.kind === "projectile") continue;
    if (nearest === undefined || Math.abs(entity.x - observation.player.x) < Math.abs(nearest.x - observation.player.x))
      nearest = entity;
  }
  return nearest;
}

/** Keeps a spinning blade at reach, hops and dashes on a fixed cadence, and optionally throws then recalls. */
function combatActions(observation: TearObservationV1, plan: Exclude<PlanId, "boss">, tick: number): GameAction[] {
  const target = nearestActor(observation);
  const offset = target === undefined ? 0 : target.x - observation.player.x;
  const toward = offset > 0 ? AXIS : -AXIS,
    distance = Math.abs(offset);
  const actions: GameAction[] = [
    { type: "move", x: target === undefined ? 0 : distance > 150 ? toward : distance < 80 ? -toward : 0, y: 0 },
    { type: "aim", turn: (tick * SPIN_PER_TICK) % AIM_TURNS, magnitude: AXIS },
  ];
  if (tick % 120 === 0) actions.push({ type: "jump", phase: "pressed" });
  if (tick % 120 === 12) actions.push({ type: "jump", phase: "released" });
  if (tick % 150 === 75 && target !== undefined)
    actions.push({ type: "dash", x: distance < 120 ? -toward : toward, y: 0 });
  if (PLANS[plan].throws) actions.push(...throwCycle(tick % 200, target !== undefined));
  return actions;
}

/** Throw toward the fight, then recall; each press is released so the next one is a fresh edge. */
function throwCycle(phase: number, engaged: boolean): GameAction[] {
  if (phase === 100 && engaged) return [{ type: "weapon", intent: "throw", phase: "pressed" }];
  if (phase === 104) return [{ type: "weapon", intent: "throw", phase: "released" }];
  if (phase === 140) return [{ type: "weapon", intent: "recall", phase: "pressed" }];
  if (phase === 144) return [{ type: "weapon", intent: "recall", phase: "released" }];
  return [];
}

/** The first offered choice on a reward screen, or undefined when no reward screen is open. */
export function rewardActions(environment: ProductionHeadlessEnvironment): GameAction[] | undefined {
  const ui = environment.policyUiObservation(),
    type = REWARD_SCREENS[ui.screen];
  if (type === undefined) return undefined;
  const choice = ui.choices[0];
  return choice === undefined ? [] : [{ type, choiceId: choice.id }];
}

/** One stream's player: the actions for a tick. `observe` sees each fight observation it decides from. */
export type CorpusPlayer = (
  environment: ProductionHeadlessEnvironment,
  tick: number,
  observe?: (observation: TearObservationV1) => void,
) => GameAction[];

/**
 * A fresh player for one stream. In the waves, reward screens take the first offered choice and the
 * observed fight decides the combat inputs. In a boss stream, the tell-avoiding boss player decides
 * everything, its own screens included, from what the boss playtest shows it.
 */
export function createCorpusPlayer(spec: StreamSpec): CorpusPlayer {
  const plan = spec.plan;
  if (plan === "boss") {
    const player = createBossPlayer("avoids-tells");
    return (environment, _tick, observe = () => undefined) => {
      const view = agentView(environment, spec.weapon);
      if (rewardActions(environment) === undefined) observe(view.state);
      return [...player.decide(view, readBoss(environment.world()), readPlayerBox(environment.world()))];
    };
  }
  return (environment, tick, observe = () => undefined) => {
    const reward = rewardActions(environment);
    if (reward !== undefined) return reward;
    const observation = environment.policyObservation();
    observe(observation);
    return combatActions(observation, plan, tick);
  };
}

/**
 * The determinism corpus: 15 headless streams (every weapon × melee, throw and boss) and the scripted,
 * observation-driven policy that plays them. `pnpm test:determinism` pins their hash streams
 * (tests/unit/canonical-hash-stream.test.ts); the replay round trip records and verifies the same runs
 * (tests/unit/replay-round-trip.test.ts).
 */
import type { GameAction } from "../../src/input/game-action";
import { WEAPON_IDS, type WeaponId } from "../../src/gameplay/weapon-selection";
import type { TearObservationV1, TearScenarioV1 } from "../../src/tearbench/contracts";
import type { ProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";

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
  boss: Object.freeze({ mode: "bossonly", ticks: 2_160, throws: true }),
});
export type PlanId = keyof typeof PLANS;

/**
 * The boss each boss stream fights, named rather than drawn: the run start draws Boss Rush order from
 * the run's random streams, so a change to what the start draws first would otherwise move a stream to
 * another boss and change what the corpus covers.
 */
const STREAM_BOSSES: Readonly<Record<WeaponId, string>> = Object.freeze({
  sword: "source",
  hammer: "warden",
  greatsword: "aldric",
  chainblade: "echo",
  riftlock: "aldric",
});

export interface StreamSpec {
  readonly id: string;
  readonly weapon: WeaponId;
  readonly plan: PlanId;
  readonly seed: string;
  readonly mode: string;
  /** The boss a boss stream fights; absent for the wave streams. */
  readonly boss?: string;
  readonly difficulty: "easy";
  readonly ticks: number;
}

export const SPECS: readonly StreamSpec[] = WEAPON_IDS.flatMap((weapon) =>
  (Object.keys(PLANS) as PlanId[]).map((plan) => ({
    id: `${weapon}/${plan}`,
    weapon,
    plan,
    // The wave streams were re-drawn when a first wave gained its opening grace (three seconds longer, so
    // their horizon grew by the same); a boss wave has no grace, so the boss streams keep their first seed.
    seed: plan === "boss" ? `hash-stream:${weapon}:${plan}` : `hash-stream:${weapon}:${plan}:grace`,
    mode: PLANS[plan].mode,
    ...(plan === "boss" ? { boss: STREAM_BOSSES[weapon] } : {}),
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
    start: {
      mode: spec.mode,
      difficulty: spec.difficulty,
      weapon: spec.weapon,
      ...(spec.boss === undefined ? {} : { boss: spec.boss }),
    },
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
function combatActions(observation: TearObservationV1, plan: PlanId, tick: number): GameAction[] {
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

/**
 * Reward screens take the first offered choice; otherwise the observed fight decides the combat inputs.
 * `observe` sees each fight observation the policy decides from.
 */
export function corpusActions(
  environment: ProductionHeadlessEnvironment,
  plan: PlanId,
  tick: number,
  observe: (observation: TearObservationV1) => void = () => undefined,
): GameAction[] {
  const reward = rewardActions(environment);
  if (reward !== undefined) return reward;
  const observation = environment.policyObservation();
  observe(observation);
  return combatActions(observation, plan, tick);
}

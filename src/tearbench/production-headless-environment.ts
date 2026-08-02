import type { CommandEnvelope } from "../domain/envelopes";
import { normalizeGameAction, type GameAction } from "../input/game-action";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import { stableVerificationHash } from "../replay/hash";
import { createProductionCombatSimulation } from "./production-combat-simulation";
import { projectProductionReplayCanonicalState } from "./production-replay-composition";
import { createProductionReplayWorld, type ProductionReplayWorld } from "./production-world-factory";
import type { TearScenarioV1 } from "./contracts";
import {
  TearHeadlessEnvironmentPool,
  type TearHeadlessEnvironment,
  type TearHeadlessEpisode,
  type TearHeadlessJob,
  type TearHeadlessTransition,
} from "./headless";
import { validateTearContract } from "./validation";

type ProductionHeadlessCore = Readonly<{
  replay: ProductionReplayWorld;
  simulation: ReturnType<typeof createProductionCombatSimulation<CanonicalGameplayState>>;
  scenario: TearScenarioV1;
}>;

function requireNaturalScenario(value: TearScenarioV1): TearScenarioV1 {
  if (value.stateClass !== "recorded-canonical") {
    throw new RangeError("production headless runs require recorded-canonical natural openings");
  }
  if (value.start.stage !== undefined || (value.start.wave !== undefined && value.start.wave !== 1)
    || value.start.boss !== undefined || value.start.bossPhase !== undefined) {
    throw new RangeError("production headless runs require a natural opening; use State Forge for surgical state");
  }
  return value;
}

/**
 * DOM-free C30 adapter over the same production world/combat composition used
 * by C29 replay. It owns neither a browser scheduler nor an alternate model.
 */
export function createProductionHeadlessEnvironment(): TearHeadlessEnvironment<
  TearScenarioV1,
  CanonicalGameplayState,
  GameAction
> {
  let core: ProductionHeadlessCore | null = null;
  let nextCommandId = 0;

  const requireCore = (): ProductionHeadlessCore => {
    if (core === null) throw new Error("production headless environment must be reset before stepping");
    return core;
  };
  const observation = (value: ProductionHeadlessCore): CanonicalGameplayState =>
    projectProductionReplayCanonicalState(
      value.replay,
      value.simulation.simulationRuntime.scheduler.tick,
      value.simulation.simulationRuntime.input,
    );

  return Object.freeze({
    reset(source: TearScenarioV1): CanonicalGameplayState {
      const validated = validateTearContract(source);
      if (!validated.ok || validated.value.kind !== "scenario") {
        throw new TypeError(`invalid headless scenario: ${validated.ok ? "wrong contract kind"
          : validated.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
      }
      const scenario = requireNaturalScenario(validated.value);
      const replay = createProductionReplayWorld({
        seed: scenario.seed,
        mode: scenario.start.mode,
        weaponId: scenario.start.weapon,
      });
      const simulation = createProductionCombatSimulation<CanonicalGameplayState>(replay, {
        snapshot: (tick, input) => projectProductionReplayCanonicalState(replay, tick, input),
      });
      simulation.simulationRuntime.reset(0);
      core = Object.freeze({ replay, simulation, scenario });
      nextCommandId = 0;
      return observation(core);
    },
    step(actions: readonly GameAction[]): TearHeadlessTransition<CanonicalGameplayState> {
      const current = requireCore();
      const tick = current.simulation.simulationRuntime.scheduler.tick + 1;
      const envelopes: CommandEnvelope<GameAction>[] = actions.map((action) => {
        const normalized = normalizeGameAction(action);
        if (!normalized.ok) throw new TypeError(`invalid headless action: ${normalized.reason}`);
        return Object.freeze({ kind: "command" as const, id: ++nextCommandId, tick, command: normalized.action });
      });
      const result = current.simulation.simulationRuntime.advanceOne(envelopes);
      const lifecycle = current.replay.world.lifecycle.snapshot();
      const terminated = lifecycle.phase === "terminated";
      const truncated = result.tick >= current.scenario.maxTicks;
      return Object.freeze({
        observation: result.state,
        terminated,
        truncated,
        metrics: Object.freeze({
          tick: result.tick,
          livingEnemies: current.replay.world.state.enemies().filter((enemy) => !enemy.dead).length,
        }),
        ...(terminated || truncated ? { artifact: Object.freeze({
          kind: "production-headless-terminal", tick: result.tick,
          semanticHash: stableVerificationHash(result.state), terminated, truncated,
        }) } : {}),
      });
    },
    dispose(): void {
      core = null;
      nextCommandId = 0;
    },
  });
}

export type ProductionHeadlessEpisode = TearHeadlessEpisode<TearScenarioV1, CanonicalGameplayState>;
export type ProductionHeadlessJob = TearHeadlessJob<TearScenarioV1>;

/**
 * Fresh production worlds for bounded C30 episode scheduling. This is a pool
 * of DOM-free composition roots, not a worker-process implementation.
 */
export function createProductionHeadlessEpisodePool(
  size: number,
): TearHeadlessEnvironmentPool<TearScenarioV1, CanonicalGameplayState, GameAction> {
  return new TearHeadlessEnvironmentPool(size, createProductionHeadlessEnvironment);
}

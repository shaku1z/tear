import type { AuthoritativeInputState } from "../gameplay/runtime/authoritative-input";
import { createTearCombatSimulation } from "../gameplay/runtime/tear-combat-simulation";
import type { ProductionReplayWorld } from "./production-world-factory";
import { createProductionCombatPhases, type ProductionCombatPhaseOptions } from "./production-combat-phases";

export interface ProductionCombatSimulationOptions<State> extends ProductionCombatPhaseOptions {
  snapshot(tick: number, input: AuthoritativeInputState): State;
}

/**
 * Creates the sole authoritative scheduler used by a source-owned production
 * replay world. It deliberately wraps the same fixed-step combat composition
 * as live play rather than reconstructing a replay-only game loop.
 */
export function createProductionCombatSimulation<State>(
  replay: ProductionReplayWorld,
  options: ProductionCombatSimulationOptions<State>,
) {
  const phases = createProductionCombatPhases(replay, { ...options, deferCombatRuntime: true });
  replay.world.context.environment.setEventPort(options.gameplayEvents);
  const core = createTearCombatSimulation<State>({
    ...(options.gameplayEvents === undefined ? {} : { gameplayEvents: options.gameplayEvents }),
    environment: replay.world.context.environment,
    combatEntities: phases.combatEntities,
    kill: phases.kill,
    createCombat: ({ combatEntities, resolveKill }) => {
      phases.installCombat(combatEntities, resolveKill as never,
        (enemy) => combatEntities.id(enemy, "enemy"));
      return {
        opening: phases.opening,
        collision: phases.collision,
        advanceClock: (seconds) => { replay.clock.sim += seconds; },
        captureProtection: () => undefined,
        applyProtection: () => undefined,
      };
    },
    authoritative: {
      actionPort: replay.input.actionPort,
      snapshot: (tick, input) => options.snapshot(tick, input),
    },
  });
  replay.world.context.environment.setAvailableActorIdsSource(() => new Set(["player", "blade",
    ...replay.world.state.enemies().map((enemy) => core.combatEntityRuntime.id(enemy, "enemy"))]));
  return Object.freeze({ ...core, outward: phases.outward, opening: phases.opening, collision: phases.collision });
}

import { liveTutorialCoachFrame } from "../app/training/tutorial-coach-frame";
import type { AuthoritativeInputState } from "../gameplay/runtime/authoritative-input";
import { createTearCombatSimulation } from "../gameplay/runtime/tear-combat-simulation";
import type { DeferredCanonicalState } from "../gameplay/runtime/authoritative-step";
import type { ProductionReplayWorld } from "./production-world-factory";
import { createProductionCombatPhases, type ProductionCombatPhaseOptions } from "./production-combat-phases";
import { bindBiomeActors } from "../gameplay/environment/biome-actors/bind-biome-actors";

export interface ProductionCombatSimulationOptions<State> extends ProductionCombatPhaseOptions {
  snapshot(tick: number, input: AuthoritativeInputState): State | DeferredCanonicalState<State>;
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
      phases.installCombat(combatEntities, resolveKill as never, (enemy) => combatEntities.id(enemy, "enemy"));
      return {
        opening: phases.opening,
        collision: phases.collision,
        advanceClock: (seconds) => {
          replay.clock.sim += seconds;
        },
        captureProtection: () => undefined,
        applyProtection: () => undefined,
      };
    },
    authoritative: {
      actionPort: {
        apply(input, tick, actions) {
          replay.tutorial.captureCoachCommands(actions.map((entry) => entry.command));
          replay.input.actionPort.apply(input, tick, actions);
        },
      },
      afterWorldStep: (tick, input) => {
        replay.tutorial.afterWorldStep(
          liveTutorialCoachFrame(
            replay.tutorial,
            tick,
            replay.world.state,
            core.combatEntityRuntime,
            replay.stage.index,
          ),
          input.snapshot(),
        );
      },
      snapshot: (tick, input) => options.snapshot(tick, input),
    },
  });
  // The same registration path live play uses, so replayed biome actors match the recorded run.
  bindBiomeActors({
    environment: replay.world.context.environment,
    config: replay.configuration.value,
    player: () => replay.world.state.player() as never,
    blade: () => replay.world.state.blade() as never,
    enemies: () => replay.world.state.enemies(),
    projectiles: () => replay.world.state.projectiles(),
    entityId: (entity, prefix) => core.combatEntityRuntime.id(entity, prefix),
  });
  replay.world.context.environment.setAvailableActorIdsSource(
    () =>
      new Set([
        "player",
        "blade",
        ...replay.world.state.enemies().map((enemy) => core.combatEntityRuntime.id(enemy, "enemy")),
        ...replay.world.state.projectiles().map((projectile) => core.combatEntityRuntime.id(projectile, "projectile")),
      ]),
  );
  return Object.freeze({
    ...core,
    outward: phases.outward,
    opening: phases.opening,
    collision: phases.collision,
    combatEntities: phases.combatEntities,
  });
}

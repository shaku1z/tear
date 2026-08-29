import type { AuthoritativeInputState } from "../gameplay/runtime/authoritative-input";
import { createTearCombatSimulation } from "../gameplay/runtime/tear-combat-simulation";
import type { ProductionReplayWorld } from "./production-world-factory";
import { createProductionCombatPhases, type ProductionCombatPhaseOptions } from "./production-combat-phases";
import { bindLiveAuroraTrackActors } from "../app/live-aurora-track-wiring";

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
  const config = replay.configuration.value;
  bindLiveAuroraTrackActors(replay.world.context.environment,
    () => replay.world.state.player() as never, () => replay.world.state.blade() as never,
    () => replay.world.state.enemies(), () => replay.world.state.projectiles(),
    (enemy) => core.combatEntityRuntime.id(enemy, "enemy"),
    (projectile) => core.combatEntityRuntime.id(projectile, "projectile"),
    { playerAcceleration: config.player.groundAccel, playerMaximumSpeed: config.player.moveSpeed,
      bladeAcceleration: config.blade.throw.speed, bladeMaximumSpeed: config.blade.throw.maxSpeed,
      projectileAcceleration: config.proj.speed, projectileMaximumSpeed: config.chargedShot.speed });
  replay.world.context.environment.setAvailableActorIdsSource(() => new Set(["player", "blade",
    ...replay.world.state.enemies().map((enemy) => core.combatEntityRuntime.id(enemy, "enemy")),
    ...replay.world.state.projectiles().map((projectile) => core.combatEntityRuntime.id(projectile, "projectile"))]));
  return Object.freeze({ ...core, outward: phases.outward, opening: phases.opening, collision: phases.collision });
}

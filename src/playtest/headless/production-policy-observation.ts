import { CONFIG } from "../../config/game-config";
import type { TearObservationV1 } from "../../tearbench/contracts";
import { projectLiveTearObservation } from "../../tearbench/live-runtime-environment";
import { canonicalObservationActions } from "../../tearbench/observation-identity";
import type { ProductionReplayWorld } from "../../app/world/detached/world-factory";

type LiveObservationSource = Parameters<typeof projectLiveTearObservation>[0];

/**
 * What a scripted player is given each tick. There is one projection of a world into an observation, the live one,
 * and this hands it the headless world: a headless player decides from exactly what the Watch Agent's player
 * decides from in the browser (the walls, the platforms, what each enemy is doing).
 */
export function projectProductionPolicyObservation(
  replay: ProductionReplayWorld,
  tick: number,
  screen: string,
  /** The world's own name for an enemy, the same for as long as the enemy lives. */
  actorId: (enemy: object) => string,
): TearObservationV1 {
  const state = replay.world.state;
  const run = state.run() as { mode: string } | null;
  if (run === null || state.player() === undefined || state.blade() === undefined) {
    throw new Error("production policy observation requires an active source world");
  }
  const source = {
    state,
    stage: () => ({ name: "", index: replay.stage.index }),
    lifecycle: () => replay.world.lifecycle.snapshot(),
    screen: () => screen,
    width: CONFIG.view.w,
    height: CONFIG.view.h,
    actorId,
    choiceIds: () => [],
    platforms: () => replay.stage.platforms,
    availableGameActions: () => canonicalObservationActions(screen, run.mode, false),
    environment: () => replay.world.context.environment,
  };
  return projectLiveTearObservation(source as unknown as LiveObservationSource, tick, "A");
}

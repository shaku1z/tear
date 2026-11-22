import { GFX, THEME } from "../../src/config/game-config";
import { createLiveCombatActions } from "../../src/app/combat/combat-actions";
import type { createProductionReplayWorld } from "../../src/app/world/detached/world-factory";
import { STAGES } from "../../src/gameplay/stages";
import { aabbOverlap } from "../../src/domain/geometry";

/**
 * The live combat action hosts over a production replay world, for tests that compare a live host
 * with the detached one built from the same world.
 */
export function liveActions(replay: ReturnType<typeof createProductionReplayWorld>) {
  // The real emission callbacks are exercised. Unrelated device and
  // persistence ports remain inert; entity and FX factories are production.
  const noop = () => undefined,
    functions = new Proxy<Record<string, () => void>>({}, { get: () => noop });
  const context = {
    releaseCamera: noop,
    dependencies: {
      ...replay.dependencies,
      STAGES,
      aabbOverlap,
      GFX,
      THEME,
      profileStatsPersistence: { add: noop, max: noop },
      Backdrop: { bloom: noop, flare: noop },
      Input: { buzz: noop },
      CG: { happytime: noop },
    },
    live: {
      player: () => replay.world.state.player(),
      blade: () => replay.world.state.blade(),
      run: () => replay.world.state.run(),
      enemies: () => replay.world.state.enemies(),
      projectiles: () => replay.world.state.projectiles(),
    },
    ports: { functions, achievement: {}, stage: { platforms: [], index: 0, current: STAGES[0] } },
  } as unknown as Parameters<typeof createLiveCombatActions>[0];
  return createLiveCombatActions(context);
}

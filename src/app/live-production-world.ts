import type { TearWorldConfiguration } from "../gameplay/runtime/tear-world-configuration";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import {
  createLiveWorldComposition,
  type LiveWorldComposition,
  type LiveWorldMirrors,
} from "./live-world-composition";
import { createLiveWorldSessionState, type LiveWorldSessionState } from "./live-world-session-state";

export interface LiveProductionWorldOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly configuration: TearWorldConfiguration<GameRuntimeDependencies["CONFIG"]>;
  readonly mirrors?: LiveWorldMirrors;
}

export interface LiveProductionWorld {
  readonly session: LiveWorldSessionState;
  readonly world: LiveWorldComposition;
}

/**
 * Creates the one live session and its world together. The legacy runtime has
 * many configuration consumers, so split references would be a torn world
 * rather than an alternate supported construction mode.
 */
export function createLiveProductionWorld(options: LiveProductionWorldOptions): LiveProductionWorld {
  if (options.dependencies.CONFIG !== options.configuration.value) {
    throw new Error("Live production world requires dependencies.CONFIG to be the world configuration value");
  }
  const session = createLiveWorldSessionState();
  const world = createLiveWorldComposition({
    dependencies: options.dependencies, configuration: options.configuration, session,
    ...(options.mirrors === undefined ? {} : { mirrors: options.mirrors }),
  });
  return Object.freeze({ session, world });
}

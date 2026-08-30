import { RunLifecycleController } from "../run/lifecycle";
import { createTearWorldContext, type TearWorldContext } from "./tear-world-context";
import { createTearWorldTransientState, type TearWorldTransientState } from "./tear-world-transient-state";
import { createEnvironmentRuntime } from "../environment/environment-runtime";
import type { EnvironmentClearReason, EnvironmentRuntimeState } from "../environment/environment-contracts";

/**
 * The portable construction core for one production world. Outward adapters
 * select state, entities, services, and cinematics before this joins them;
 * this module owns the lifecycle and transient records they must all share.
 */
export interface TearWorldComposition<State, Entities, Services, Cinema, Environment extends EnvironmentRuntimeState = EnvironmentRuntimeState> {
  readonly state: State;
  readonly entities: Entities;
  readonly lifecycle: RunLifecycleController;
  readonly environment: Environment;
  readonly resetEnvironment: (reason: EnvironmentClearReason) => void;
  readonly dispose: () => void;
  readonly context: TearWorldContext<
    State,
    Entities,
    RunLifecycleController,
    Services,
    TearWorldTransientState,
    Cinema,
    Environment
  >;
}

export interface TearWorldCompositionOptions<State, Entities, Services, Cinema> {
  readonly state: State;
  readonly entities: Entities;
  readonly services: Services;
  readonly cinema: Cinema;
  /** Stable caller-owned identity used for deterministic environment IDs. */
  readonly worldId: string;
  readonly environment?: EnvironmentRuntimeState;
}

/** Creates one lifecycle and one transient record for a fully assembled world. */
export function createTearWorldComposition<State, Entities, Services, Cinema, Environment extends EnvironmentRuntimeState = EnvironmentRuntimeState>(
  options: TearWorldCompositionOptions<State, Entities, Services, Cinema> & { readonly environment?: Environment },
): TearWorldComposition<State, Entities, Services, Cinema, Environment> {
  const lifecycle = new RunLifecycleController();
  const transient = createTearWorldTransientState();
  const environment = options.environment ?? createEnvironmentRuntime({ stageId: "unknown", worldId: options.worldId });
  const context = createTearWorldContext(
    options.state, options.entities, lifecycle, options.services, transient, options.cinema, environment,
  );
  const resetEnvironment = (reason: EnvironmentClearReason): void => { environment.clear(reason); };
  return Object.freeze({ state: options.state, entities: options.entities, lifecycle, environment, context,
    resetEnvironment,
    dispose: () => { environment.clear("disposal"); },
  }) as TearWorldComposition<State, Entities, Services, Cinema, Environment>;
}

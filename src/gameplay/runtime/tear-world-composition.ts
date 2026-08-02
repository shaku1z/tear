import { RunLifecycleController } from "../run/lifecycle";
import { createTearWorldContext, type TearWorldContext } from "./tear-world-context";
import { createTearWorldTransientState, type TearWorldTransientState } from "./tear-world-transient-state";

/**
 * The portable construction core for one production world. Outward adapters
 * select state, entities, services, and cinematics before this joins them;
 * this module owns the lifecycle and transient records they must all share.
 */
export interface TearWorldComposition<State, Entities, Services, Cinema> {
  readonly state: State;
  readonly entities: Entities;
  readonly lifecycle: RunLifecycleController;
  readonly context: TearWorldContext<
    State,
    Entities,
    RunLifecycleController,
    Services,
    TearWorldTransientState,
    Cinema
  >;
}

export interface TearWorldCompositionOptions<State, Entities, Services, Cinema> {
  readonly state: State;
  readonly entities: Entities;
  readonly services: Services;
  readonly cinema: Cinema;
}

/** Creates one lifecycle and one transient record for a fully assembled world. */
export function createTearWorldComposition<State, Entities, Services, Cinema>(
  options: TearWorldCompositionOptions<State, Entities, Services, Cinema>,
): TearWorldComposition<State, Entities, Services, Cinema> {
  const lifecycle = new RunLifecycleController();
  const transient = createTearWorldTransientState();
  const context = createTearWorldContext(
    options.state, options.entities, lifecycle, options.services, transient, options.cinema,
  );
  return Object.freeze({ state: options.state, entities: options.entities, lifecycle, context });
}

import type { LiveCombatRuntimeOptions } from "../gameplay/combat/live-combat-runtime";
import { createLiveCombatAdapters, type LiveCombatAdapterContext } from "./live-combat-adapter-context";
import { createLiveCombatCoordinatorOptions, createLiveCombatFrameOptions,
  type LiveCombatCoordinatorContext, type LiveCombatFrameContext } from "./live-combat-frame-context";
import { createLiveCombatHost, type LiveCombatHostFactoryOptions,
  type LiveCombatHostRuntimeApi } from "./live-combat-host-factory";
import type { RuntimeFrameDriver } from "./runtime-frame-driver";

type CombatLifecycleOptions = Pick<LiveCombatRuntimeOptions,
  "advanceClock" | "captureProtection" | "applyProtection">;

export interface LiveCombatCompositionOptions<State> {
  readonly frameDriver: RuntimeFrameDriver;
  readonly adapters: LiveCombatAdapterContext;
  readonly lifecycle: CombatLifecycleOptions;
  readonly frame: LiveCombatFrameContext;
  readonly coordinator: LiveCombatCoordinatorContext;
  readonly authoritative: LiveCombatHostFactoryOptions<State>["authoritative"];
}

/**
 * Composes the legacy-facing adapters with the strict fixed-step combat host.
 * All runtime-dependent values stay behind getters or callbacks so this can be
 * constructed before the combat, kill, and frame runtimes have been assigned.
 */
export function createLiveCombatComposition<State>(
  options: LiveCombatCompositionOptions<State>,
): LiveCombatHostRuntimeApi<State> {
  const adapters = createLiveCombatAdapters(options.adapters);

  const host: LiveCombatHostRuntimeApi<State> = createLiveCombatHost<State>({
    frameDriver: options.frameDriver,
    combatEntities: adapters.entities,
    kill: adapters.kill,
    createCombat: () => ({
      opening: adapters.opening,
      get collision() { return adapters.collisionFor(host.combatEntityRuntime); },
      ...options.lifecycle,
    }),
    authoritative: options.authoritative,
    createFrame: (api) => createLiveCombatFrameOptions(options.frame, api),
    createCoordinator: ({ simulation, frameRuntime }) =>
      createLiveCombatCoordinatorOptions(options.coordinator, simulation, frameRuntime),
  });
  return host;
}

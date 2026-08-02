import type { RandomSource } from "../domain/random";
import type { RunLifecycleController } from "../gameplay/run/lifecycle";
import type { TearWorldContext, TearWorldServices } from "../gameplay/runtime/tear-world-context";
import type { TearWorldTransientState } from "../gameplay/runtime/tear-world-transient-state";
import type { RunRandomStreamName, RunRandomStreamsSnapshot } from "../simulation/run-random";
import type { LiveGameHostState } from "./live-game-host-state";
import type { LiveWorldEntityConstructionPort } from "./live-world-entity-factory";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { TearWorldConfiguration } from "../gameplay/runtime/tear-world-configuration";

/** Narrow live adapter dependencies; this is deliberately not GameRuntimeDependencies. */
export interface LiveWorldContextDependencies {
  readonly CLOCK: { sim: number };
  readonly GAME_RANDOM: { reset(seed: number | string): void };
  readonly GAME_RANDOM_STREAMS: {
    stream(name: RunRandomStreamName): RandomSource;
    snapshot(): RunRandomStreamsSnapshot;
    restore(snapshot: RunRandomStreamsSnapshot): void;
  };
  readonly FX: { reset(): void; readonly list: readonly unknown[] };
  readonly Backdrop: { resetFx(): void };
  readonly Mirror: { active: boolean; host: unknown };
  readonly BOSSFX: { readonly q: { length: number } };
}

export type LiveWorldServices = TearWorldServices<
  RunRandomStreamsSnapshot,
  RunRandomStreamName,
  RandomSource,
  GameRuntimeDependencies["CONFIG"]
>;

export type LiveWorldCinema = InstanceType<GameRuntimeDependencies["Cinematics"]["Director"]>;

export type LiveWorldContext = TearWorldContext<
  LiveGameHostState,
  LiveWorldEntityConstructionPort,
  RunLifecycleController,
  LiveWorldServices,
  TearWorldTransientState,
  LiveWorldCinema
>;

export interface LiveWorldServicesOptions {
  readonly dependencies: LiveWorldContextDependencies;
  readonly configuration: TearWorldConfiguration<GameRuntimeDependencies["CONFIG"]>;
}

/**
 * The one live adapter for singleton-backed world services. It makes their
 * current ownership explicit without pretending the legacy constructors are
 * already safe to instantiate as concurrent detached worlds.
 */
export function createLiveWorldServices(options: LiveWorldServicesOptions): LiveWorldServices {
  const d = options.dependencies;
  const services: LiveWorldServices = {
    configuration: options.configuration,
    random: Object.freeze({
      resetRun: (seed) => { d.GAME_RANDOM.reset(seed); },
      stream: (name) => d.GAME_RANDOM_STREAMS.stream(name),
      snapshot: () => d.GAME_RANDOM_STREAMS.snapshot(),
      restore: (snapshot) => { d.GAME_RANDOM_STREAMS.restore(snapshot); },
    }),
    clock: Object.freeze({
      seconds: () => d.CLOCK.sim,
      set: (seconds) => { d.CLOCK.sim = seconds; },
      reset: () => { d.CLOCK.sim = 0; },
      advance: (seconds) => { d.CLOCK.sim += seconds; },
    }),
    effects: Object.freeze({
      resetWorld: () => { d.FX.reset(); d.Backdrop.resetFx(); },
      count: () => d.FX.list.length,
    }),
    mirror: Object.freeze({ reset: () => { d.Mirror.active = false; d.Mirror.host = null; } }),
    bossFeedback: Object.freeze({ clear: () => { d.BOSSFX.q.length = 0; } }),
  };
  return Object.freeze(services);
}

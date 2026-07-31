import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";
import type { FrameAdvance } from "../simulation/fixed-step";
import type { AuthoritativeInputState } from "../gameplay/runtime/authoritative-input";
import type { TearGameplayEventPort } from "../gameplay/runtime/gameplay-events";
import {
  TearSimulationRuntime,
  type TearSimulationAdvanceLifecycle,
  type TearSimulationExactAdvance,
} from "../gameplay/runtime/tear-simulation-runtime";

/** A hydrated codec world needs only its authoritative starting tick to run. */
export interface TearHydratedWorld {
  readonly tick: number;
}

/**
 * Host-owned world behavior around the portable canonical simulation. This is
 * deliberately narrower than a live combat host: the port receives neither
 * DOM, presentation, persistence, nor a concrete app-world type.
 */
export interface TearHydratedWorldRuntimePort<World extends TearHydratedWorld, State> {
  /** Projects sealed canonical input onto the current world for one tick. */
  applyCanonicalInput(world: World, input: AuthoritativeInputState, tick: number): void;
  /** Advances the actual hydrated world by exactly one fixed simulation step. */
  step(world: World, seconds: number): void;
  /** Returns the deterministic verification state for the just-completed tick. */
  snapshot(world: World, tick: number, input: AuthoritativeInputState): State;
}

export interface TearHydratedWorldRuntimeOptions {
  readonly events?: TearGameplayEventPort;
  readonly ticksPerSecond?: number;
  readonly maxCatchUpSteps?: number;
}

function assertStartingTick(world: TearHydratedWorld): void {
  if (!Number.isSafeInteger(world.tick) || world.tick < 0) {
    throw new RangeError("a hydrated world requires a non-negative safe starting tick");
  }
}

/**
 * Runs an already hydrated codec world through the same canonical action,
 * fixed-step, snapshot, hash, and lifecycle path used by live gameplay.
 *
 * This is a portable composition shell, not a full replay/headless combat
 * claim. Hosts still provide the actual world step and any outward effects.
 */
export class TearHydratedWorldRuntime<World extends TearHydratedWorld, State> {
  #world: World;
  readonly simulation: TearSimulationRuntime<State>;

  constructor(
    world: World,
    port: TearHydratedWorldRuntimePort<World, State>,
    options: TearHydratedWorldRuntimeOptions = {},
  ) {
    assertStartingTick(world);
    this.#world = world;
    this.simulation = new TearSimulationRuntime<State>({
      actionPort: {
        apply: (input, tick, actions) => {
          // The shell owns input state transition so every detached host gets
          // the same held/edge semantics before it projects input onto actors.
          input.beginTick(tick, actions);
          port.applyCanonicalInput(this.#world, input, tick);
        },
      },
      step: (seconds) => { port.step(this.#world, seconds); },
      snapshot: (tick, input) => port.snapshot(this.#world, tick, input),
      ...(options.events === undefined ? {} : { events: options.events }),
      ...(options.ticksPerSecond === undefined ? {} : { ticksPerSecond: options.ticksPerSecond }),
      ...(options.maxCatchUpSteps === undefined ? {} : { maxCatchUpSteps: options.maxCatchUpSteps }),
    });
    this.simulation.reset(world.tick);
  }

  world(): World { return this.#world; }

  /** Atomically selects a fully staged world and clears input/step history. */
  replace(world: World): void {
    assertStartingTick(world);
    this.#world = world;
    this.simulation.reset(world.tick);
  }

  advance(
    elapsedMilliseconds: number,
    actionsForTick: (tick: number) => readonly CommandEnvelope<GameAction>[],
    lifecycle: TearSimulationAdvanceLifecycle = {},
  ): FrameAdvance {
    return this.simulation.advance(elapsedMilliseconds, actionsForTick, lifecycle);
  }

  advanceExact(
    actions: readonly CommandEnvelope<GameAction>[],
    lifecycle: TearSimulationAdvanceLifecycle = {},
  ): TearSimulationExactAdvance<State> {
    return this.simulation.advanceExact(() => actions, lifecycle);
  }

  advanceOne(actions: readonly CommandEnvelope<GameAction>[]): State {
    return this.simulation.advanceOne(actions).state;
  }
}

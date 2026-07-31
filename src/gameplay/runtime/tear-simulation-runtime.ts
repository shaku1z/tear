import type { CommandEnvelope } from "../../domain/envelopes";
import type { GameAction } from "../../input/game-action";
import { FixedStepScheduler, type FrameAdvance } from "../../simulation/fixed-step";
import { TearGameplayEventBus, type TearGameplayEventPort } from "./gameplay-events";
import { AuthoritativeInputState } from "./authoritative-input";
import { AuthoritativeStepController, type AuthoritativeStepResult } from "./authoritative-step";

/**
 * Inward-facing action bridge. Browser, replay, and headless adapters can
 * implement this without exposing their world representation to callers.
 */
export interface TearSimulationActionPort {
  apply(input: AuthoritativeInputState, tick: number, actions: readonly CommandEnvelope<GameAction>[]): void;
}

export interface TearSimulationRuntimeOptions<State> {
  readonly actionPort: TearSimulationActionPort;
  /** The actual gameplay tick; it must not depend on DOM, presentation, or storage. */
  step(seconds: number): void;
  snapshot(tick: number, input: AuthoritativeInputState): State;
  readonly events?: TearGameplayEventPort;
  readonly ticksPerSecond?: number;
  readonly maxCatchUpSteps?: number;
}

export type TearSimulationActionsForTick = (tick: number) => readonly CommandEnvelope<GameAction>[];

/**
 * Host-only lifecycle hooks around a canonical tick.  They deliberately
 * surround the one shared authoritative step rather than exposing a second
 * browser-only stepping route.  Replay/headless callers can omit them.
 */
export interface TearSimulationAdvanceLifecycle {
  /** Returning false consumes the scheduler tick without mutating simulation state. */
  shouldStep?(tick: number): boolean;
  /** Runs immediately before command capture/application for an executed tick. */
  beforeStep?(tick: number): void;
  /** Runs only after the authoritative step completed for an executed tick. */
  afterStep?(tick: number): void;
  /** Runs after every attempted executed tick, including an exceptional one. */
  cleanupStep?(tick: number): void;
}

export interface TearSimulationExactAdvance<State> {
  readonly tick: number;
  readonly steps: 0 | 1;
  readonly result: AuthoritativeStepResult<State> | null;
}

/**
 * Reusable deterministic fixed-step composition. It owns canonical action
 * application, authoritative snapshot hashing, the tick clock, and the typed
 * gameplay-event capability. The live browser host is one adapter around this
 * core; replay and headless hosts can use the same class without DOM APIs.
 */
export class TearSimulationRuntime<State> {
  readonly #scheduler: FixedStepScheduler;
  readonly #input = new AuthoritativeInputState();
  readonly #events: TearGameplayEventPort;
  readonly #authoritativeStep: AuthoritativeStepController<State>;

  constructor(options: TearSimulationRuntimeOptions<State>) {
    this.#scheduler = new FixedStepScheduler({
      ticksPerSecond: options.ticksPerSecond ?? 120,
      maxCatchUpSteps: options.maxCatchUpSteps ?? 12,
    });
    this.#events = options.events ?? new TearGameplayEventBus(() => this.#scheduler.tick);
    this.#authoritativeStep = new AuthoritativeStepController<State>({
      applyActions: (tick, actions) => { options.actionPort.apply(this.#input, tick, actions); },
      step: (seconds) => { options.step(seconds); },
      snapshot: (tick) => options.snapshot(tick, this.#input),
    });
  }

  get scheduler(): FixedStepScheduler { return this.#scheduler; }
  get input(): AuthoritativeInputState { return this.#input; }
  get events(): TearGameplayEventPort { return this.#events; }
  get authoritativeStep(): AuthoritativeStepController<State> { return this.#authoritativeStep; }
  get lastResult(): AuthoritativeStepResult<State> | null { return this.#authoritativeStep.lastResult; }
  get stepSeconds(): number { return this.#scheduler.stepMilliseconds / 1_000; }

  #executeTick(tick: number, seconds: number, actionsForTick: TearSimulationActionsForTick,
    lifecycle: TearSimulationAdvanceLifecycle): AuthoritativeStepResult<State> | null {
    if (lifecycle.shouldStep?.(tick) === false) return null;
    try {
      lifecycle.beforeStep?.(tick);
      const result = this.#authoritativeStep.execute(tick, seconds, actionsForTick(tick));
      lifecycle.afterStep?.(tick);
      return result;
    } finally {
      lifecycle.cleanupStep?.(tick);
    }
  }

  /** Advances one or more deterministic ticks at a render-independent elapsed time. */
  advance(elapsedMilliseconds: number, actionsForTick: TearSimulationActionsForTick,
    lifecycle: TearSimulationAdvanceLifecycle = {}): FrameAdvance {
    return this.#scheduler.advance(elapsedMilliseconds, (seconds, tick) => {
      this.#executeTick(tick, seconds, actionsForTick, lifecycle);
    });
  }

  /**
   * Executes one scheduler-owned tick with the same lifecycle/action path as
   * render-driven live simulation, while intentionally bypassing render-time
   * hit-stop and time scaling for deterministic tooling.
   */
  advanceExact(actionsForTick: TearSimulationActionsForTick,
    lifecycle: TearSimulationAdvanceLifecycle = {}): TearSimulationExactAdvance<State> {
    const tick = this.#scheduler.tick + 1;
    // FixedStepScheduler owns the visible clock. Set it before simulation so
    // events emitted from gameplay receive the same authoritative tick.
    this.#scheduler.reset(tick);
    const result = this.#executeTick(tick, this.stepSeconds, actionsForTick, lifecycle);
    return Object.freeze({ tick, steps: result === null ? 0 : 1, result });
  }

  /** Executes exactly one canonical tick for replay, tests, and headless hosts. */
  advanceOne(actions: readonly CommandEnvelope<GameAction>[]): AuthoritativeStepResult<State> {
    const result = this.advanceExact(() => actions).result;
    if (result === null) throw new Error("unconditional exact simulation tick was unexpectedly skipped");
    return result;
  }

  reset(tick = 0): void {
    this.#scheduler.reset(tick);
    this.#input.reset();
    this.#authoritativeStep.reset();
  }
}

import type { CommandEnvelope } from "../../domain/envelopes";
import type { GameAction } from "../../input/game-action";
import { stableVerificationHash } from "../../replay/hash";
import type { EnvironmentStepPort } from "../environment/environment-runtime";

export interface AuthoritativeStepResult<State> {
  readonly tick: number;
  readonly state: State;
  readonly stateHash: string;
}

/**
 * Canonical state whose inputs were captured, by value or by immutable
 * reference, at the end of its tick. The projection runs at most once, on the
 * first read, and every reader shares that one result; a tick nobody reads
 * pays only for the capture.
 */
export class DeferredCanonicalState<State> {
  #project: (() => State) | undefined;
  #state: State | undefined;

  constructor(project: () => State) {
    this.#project = project;
  }

  get state(): State {
    const project = this.#project;
    if (project !== undefined) {
      this.#state = project();
      this.#project = undefined;
    }
    return this.#state as State;
  }
}

export interface AuthoritativeStepDependencies<State> {
  readonly applyActions: (tick: number, actions: readonly CommandEnvelope<GameAction>[]) => void;
  readonly step: (seconds: number) => void;
  /** Host work that must observe the completed world before its canonical capture (the tutorial coach). */
  readonly afterWorldStep?: (tick: number) => void;
  /** Captures the verification state; a deferred capture is projected only when read. */
  readonly snapshot: (tick: number) => State | DeferredCanonicalState<State>;
  readonly environment?: EnvironmentStepPort;
}

/** Owns the invariant action application -> simulation -> after-world step -> canonical verification state. */
export class AuthoritativeStepController<State> {
  readonly #dependencies: AuthoritativeStepDependencies<State>;
  #lastTick = -1;
  #lastResult: AuthoritativeStepResult<State> | null = null;

  constructor(dependencies: AuthoritativeStepDependencies<State>) { this.#dependencies = dependencies; }

  execute(tick: number, seconds: number, actions: readonly CommandEnvelope<GameAction>[]): AuthoritativeStepResult<State> {
    if (!Number.isSafeInteger(tick) || tick <= this.#lastTick) throw new RangeError("authoritative ticks must increase exactly once");
    if (!(seconds > 0) || !Number.isFinite(seconds)) throw new RangeError("step duration must be finite and positive");
    this.#dependencies.applyActions(tick, actions);
    if (this.#dependencies.environment === undefined) this.#dependencies.step(seconds);
    else this.#dependencies.environment.step(tick, seconds, () => { this.#dependencies.step(seconds); });
    this.#dependencies.afterWorldStep?.(tick);
    const captured = this.#dependencies.snapshot(tick);
    const canonical = captured instanceof DeferredCanonicalState ? captured : new DeferredCanonicalState(() => captured);
    let cachedStateHash: string | undefined;
    const result = Object.freeze({
      tick,
      get state(): State {
        return canonical.state;
      },
      get stateHash(): string {
        cachedStateHash ??= stableVerificationHash(canonical.state);
        return cachedStateHash;
      },
    });
    this.#lastTick = tick; this.#lastResult = result;
    return result;
  }

  get lastResult(): AuthoritativeStepResult<State> | null { return this.#lastResult; }

  reset(): void { this.#lastTick = -1; this.#lastResult = null; }
}

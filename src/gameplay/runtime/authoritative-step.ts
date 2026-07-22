import type { CommandEnvelope } from "../../domain/envelopes";
import type { GameAction } from "../../input/game-action";
import { stableVerificationHash } from "../../replay/hash";

export interface AuthoritativeStepResult<State> {
  readonly tick: number;
  readonly state: State;
  readonly stateHash: string;
}

export interface AuthoritativeStepDependencies<State> {
  readonly applyActions: (tick: number, actions: readonly CommandEnvelope<GameAction>[]) => void;
  readonly step: (seconds: number) => void;
  readonly snapshot: (tick: number) => State;
}

/** Owns the invariant action application -> simulation -> canonical verification state. */
export class AuthoritativeStepController<State> {
  readonly #dependencies: AuthoritativeStepDependencies<State>;
  #lastTick = -1;
  #lastResult: AuthoritativeStepResult<State> | null = null;

  constructor(dependencies: AuthoritativeStepDependencies<State>) { this.#dependencies = dependencies; }

  execute(tick: number, seconds: number, actions: readonly CommandEnvelope<GameAction>[]): AuthoritativeStepResult<State> {
    if (!Number.isSafeInteger(tick) || tick <= this.#lastTick) throw new RangeError("authoritative ticks must increase exactly once");
    if (!(seconds > 0) || !Number.isFinite(seconds)) throw new RangeError("step duration must be finite and positive");
    this.#dependencies.applyActions(tick, actions);
    this.#dependencies.step(seconds);
    const state = this.#dependencies.snapshot(tick);
    const result = Object.freeze({ tick, state, stateHash: stableVerificationHash(state) });
    this.#lastTick = tick; this.#lastResult = result;
    return result;
  }

  get lastResult(): AuthoritativeStepResult<State> | null { return this.#lastResult; }

  reset(): void { this.#lastTick = -1; this.#lastResult = null; }
}

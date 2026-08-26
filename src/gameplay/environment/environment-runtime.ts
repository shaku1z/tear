import { EnvironmentState, createEnvironmentState } from "./environment-state";
import type { EnvironmentClearReason, EnvironmentRuntimeConfiguration, EnvironmentRuntimeState } from "./environment-contracts";

/** The only phases an environment may own inside one authoritative tick. */
export type EnvironmentStepPhase = "pre-step" | "active-fields" | "collision-resolution" | "post-commit";

export interface EnvironmentStepContext {
  readonly tick: number;
  readonly seconds: number;
  readonly phase: EnvironmentStepPhase;
  readonly environment: EnvironmentRuntimeState;
}

export interface EnvironmentStepHooks {
  readonly preStep?: (context: EnvironmentStepContext) => void;
  readonly activeFields?: (context: EnvironmentStepContext) => void;
  readonly resolveCollisions?: (context: EnvironmentStepContext) => void;
  readonly postCommit?: (context: EnvironmentStepContext) => void;
}

/** Fixed-step port consumed by the authoritative simulation controller. */
export interface EnvironmentStepPort {
  step(tick: number, seconds: number, gameplayStep: () => void): void;
  clear(reason: EnvironmentClearReason): void;
}

/** Collection owner plus the bounded fixed-step phase seam. */
export class EnvironmentRuntime extends EnvironmentState implements EnvironmentStepPort {
  readonly #hooks: EnvironmentStepHooks;
  #phaseLog: EnvironmentStepPhase[] = [];

  constructor(stageId = "unknown", worldId: string, configuration?: Partial<EnvironmentRuntimeConfiguration>, hooks: EnvironmentStepHooks = {}) {
    super(stageId, worldId, configuration); this.#hooks = hooks;
  }

  get phaseLog(): readonly EnvironmentStepPhase[] { return this.#phaseLog; }
  clearPhaseLog(): void { this.#phaseLog = []; }

  #run(phase: EnvironmentStepPhase, tick: number, seconds: number, callback: ((context: EnvironmentStepContext) => void) | undefined): void {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("environment tick must be a non-negative safe integer");
    if (!(seconds > 0) || !Number.isFinite(seconds)) throw new RangeError("environment step duration must be finite and positive");
    this.#phaseLog.push(phase);
    callback?.({ tick, seconds, phase, environment: this });
  }

  /** Executes the four environment-owned phases exactly once in canonical order. */
  step(tick: number, seconds: number, gameplayStep: () => void): void {
    if (typeof gameplayStep !== "function") throw new TypeError("environment gameplay step is required");
    this.clearPhaseLog(); this.#run("pre-step", tick, seconds, this.#hooks.preStep); gameplayStep();
    this.#run("active-fields", tick, seconds, this.#hooks.activeFields);
    this.#run("collision-resolution", tick, seconds, this.#hooks.resolveCollisions);
    this.#run("post-commit", tick, seconds, this.#hooks.postCommit);
  }
}

export function createEnvironmentRuntime(options: Readonly<{
  readonly stageId?: string;
  readonly worldId?: string;
  readonly configuration?: Partial<EnvironmentRuntimeConfiguration>;
  readonly hooks?: EnvironmentStepHooks;
}> = {}): EnvironmentRuntime {
  if (options.worldId === undefined) throw new TypeError("environment world identity is required");
  return new EnvironmentRuntime(options.stageId ?? "unknown", options.worldId, options.configuration, options.hooks);
}

export { createEnvironmentState };

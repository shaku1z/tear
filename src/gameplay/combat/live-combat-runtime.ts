import { runLiveOpeningPhase, type LiveOpeningPhaseHost } from "./live-opening-phase";
import { runLiveCollisionPhase, type LiveCollisionPhaseHost } from "./live-collision-phase";

export interface LiveCombatRuntimeOptions {
  readonly opening: LiveOpeningPhaseHost;
  readonly collision: LiveCollisionPhaseHost;
  advanceClock(dt: number): void;
  captureProtection(): void;
  applyProtection(): void;
}

/** The sole fixed-tick entry point for live combat simulation. */
export class LiveCombatRuntime {
  readonly #options: LiveCombatRuntimeOptions;

  constructor(options: LiveCombatRuntimeOptions) { this.#options = options; }

  step(dt: number): void {
    this.#options.advanceClock(dt);
    this.#options.captureProtection();
    const opening = runLiveOpeningPhase(this.#options.opening, dt);
    this.#options.applyProtection();
    if (!opening.blocked) runLiveCollisionPhase(this.#options.collision, dt);
  }
}

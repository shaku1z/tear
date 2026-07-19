export interface FixedStepOptions {
  readonly ticksPerSecond?: number;
  readonly maxCatchUpSteps?: number;
}

export interface FrameAdvance {
  readonly steps: number;
  readonly tick: number;
  readonly alpha: number;
  readonly droppedMilliseconds: number;
}

export class FixedStepScheduler {
  readonly stepMilliseconds: number;
  readonly maxCatchUpSteps: number;
  #accumulatorSteps = 0;
  #tick = 0;

  constructor(options: FixedStepOptions = {}) {
    const ticksPerSecond = options.ticksPerSecond ?? 60;
    const maxCatchUpSteps = options.maxCatchUpSteps ?? 8;
    if (!Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0) throw new RangeError("ticksPerSecond must be positive");
    if (!Number.isSafeInteger(maxCatchUpSteps) || maxCatchUpSteps < 1) throw new RangeError("maxCatchUpSteps must be a positive integer");
    this.stepMilliseconds = 1000 / ticksPerSecond;
    this.maxCatchUpSteps = maxCatchUpSteps;
  }

  get tick(): number {
    return this.#tick;
  }

  get simulationSeconds(): number {
    return this.#tick * this.stepMilliseconds / 1000;
  }

  advance(elapsedMilliseconds: number, step: (seconds: number, tick: number) => void): FrameAdvance {
    if (!Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds < 0) {
      throw new RangeError("elapsedMilliseconds must be finite and non-negative");
    }
    const maxElapsed = this.stepMilliseconds * this.maxCatchUpSteps;
    const accepted = Math.min(elapsedMilliseconds, maxElapsed);
    const droppedMilliseconds = elapsedMilliseconds - accepted;
    this.#accumulatorSteps += accepted / this.stepMilliseconds;

    let steps = 0;
    while (this.#accumulatorSteps + 1e-9 >= 1 && steps < this.maxCatchUpSteps) {
      this.#accumulatorSteps = Math.max(0, this.#accumulatorSteps - 1);
      this.#tick += 1;
      steps += 1;
      step(this.stepMilliseconds / 1000, this.#tick);
    }

    return Object.freeze({
      steps,
      tick: this.#tick,
      alpha: Math.min(1, Math.max(0, this.#accumulatorSteps)),
      droppedMilliseconds,
    });
  }

  reset(tick = 0): void {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("tick must be a non-negative safe integer");
    this.#tick = tick;
    this.#accumulatorSteps = 0;
  }
}

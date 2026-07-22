export interface AnimationFrameSource {
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
}

export interface RuntimeFrame {
  readonly timestampMs: number;
  readonly deltaSeconds: number;
}

export type RuntimeFrameCallback = (frame: RuntimeFrame) => void;

export class RuntimeFrameDriver {
  readonly #source: AnimationFrameSource;
  readonly #maximumDeltaSeconds: number;
  #handle: number | null = null;
  #previousTimestamp: number | null = null;

  constructor(source: AnimationFrameSource, maximumDeltaSeconds = 0.1) {
    if (!(maximumDeltaSeconds > 0) || !Number.isFinite(maximumDeltaSeconds)) {
      throw new RangeError("maximum frame delta must be finite and positive");
    }
    this.#source = source;
    this.#maximumDeltaSeconds = maximumDeltaSeconds;
  }

  get running(): boolean { return this.#handle !== null; }

  start(callback: RuntimeFrameCallback): void {
    if (this.running) return;
    const step: FrameRequestCallback = (timestampMs) => {
      const previous = this.#previousTimestamp;
      this.#previousTimestamp = timestampMs;
      const rawDelta = previous === null ? 0 : Math.max(0, (timestampMs - previous) / 1_000);
      callback(Object.freeze({
        timestampMs,
        deltaSeconds: Math.min(rawDelta, this.#maximumDeltaSeconds),
      }));
      if (this.#handle !== null) this.#handle = this.#source.requestAnimationFrame(step);
    };
    this.#handle = this.#source.requestAnimationFrame(step);
  }

  stop(): void {
    if (this.#handle !== null) this.#source.cancelAnimationFrame(this.#handle);
    this.#handle = null;
    this.#previousTimestamp = null;
  }
}

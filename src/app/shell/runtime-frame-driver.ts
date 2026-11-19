export interface AnimationFrameSource {
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
}

export interface RuntimeFrame {
  readonly timestampMs: number;
  readonly deltaSeconds: number;
  /** Unclamped requestAnimationFrame interval used only for pacing diagnostics. */
  readonly intervalSeconds: number;
}

export type RuntimeFrameCallback = (frame: RuntimeFrame) => void;

/** Receives the error a frame threw, after the loop has stopped. */
export type RuntimeFrameFaultHandler = (error: unknown) => void;

export class RuntimeFrameDriver {
  readonly #source: AnimationFrameSource;
  readonly #onFault: RuntimeFrameFaultHandler;
  readonly #maximumDeltaSeconds: number;
  #handle: number | null = null;
  #previousTimestamp: number | null = null;

  /**
   * A frame that throws stops the loop and goes to `onFault`: nothing draws or advances after it,
   * and the handler decides what the player sees. A driver cannot be made without a handler, so
   * no loop fails silently.
   */
  constructor(source: AnimationFrameSource, onFault: RuntimeFrameFaultHandler, maximumDeltaSeconds = 0.1) {
    if (!(maximumDeltaSeconds > 0) || !Number.isFinite(maximumDeltaSeconds)) {
      throw new RangeError("maximum frame delta must be finite and positive");
    }
    this.#source = source;
    this.#onFault = onFault;
    this.#maximumDeltaSeconds = maximumDeltaSeconds;
  }

  get running(): boolean {
    return this.#handle !== null;
  }

  start(callback: RuntimeFrameCallback): void {
    if (this.running) return;
    const step: FrameRequestCallback = (timestampMs) => {
      const previous = this.#previousTimestamp;
      this.#previousTimestamp = timestampMs;
      const rawDelta = previous === null ? 0 : Math.max(0, (timestampMs - previous) / 1_000);
      try {
        callback(
          Object.freeze({
            timestampMs,
            deltaSeconds: Math.min(rawDelta, this.#maximumDeltaSeconds),
            intervalSeconds: rawDelta,
          }),
        );
      } catch (error) {
        this.stop();
        this.#onFault(error);
        return;
      }
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

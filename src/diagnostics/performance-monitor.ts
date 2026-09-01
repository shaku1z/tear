export type TimingKind = "simulation" | "render" | "frame" | "frameInterval" | "outsideFrameWork";

export interface TimingSummary {
  readonly samples: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

export interface PerformanceDiagnosticsSnapshot {
  readonly simulation: TimingSummary;
  readonly render: TimingSummary;
  readonly frame: TimingSummary;
  readonly frameInterval: TimingSummary;
  /** Time between animation frames not spent in the preceding measured JS frame callback. */
  readonly outsideFrameWork: TimingSummary;
  readonly longTasks: number;
  readonly gauges: Readonly<Record<string, number>>;
}

function percentile(sorted: Float64Array, sampleCount: number, fraction: number): number {
  if (sampleCount === 0) return 0;
  const index = Math.min(sampleCount - 1, Math.ceil(sampleCount * fraction) - 1);
  return sorted[index] ?? 0;
}

class SampleRing {
  readonly #values: Float64Array;
  readonly #sortedScratch: Float64Array;
  #cursor = 0;
  #size = 0;
  #observedMaxMs = 0;

  constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError("capacity must be a positive integer");
    this.#values = new Float64Array(capacity);
    this.#sortedScratch = new Float64Array(capacity);
  }

  push(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.#values[this.#cursor] = value;
    this.#cursor = (this.#cursor + 1) % this.#values.length;
    this.#size = Math.min(this.#size + 1, this.#values.length);
    this.#observedMaxMs = Math.max(this.#observedMaxMs, value);
  }

  clear(): void {
    this.#cursor = 0;
    this.#size = 0;
    this.#observedMaxMs = 0;
  }

  summary(): TimingSummary {
    // Diagnostics may be sampled repeatedly by the browser performance gate.
    // Reuse fixed storage so observation does not allocate and sort a fresh
    // JavaScript array for every timing kind on every poll.
    for (let index = 0; index < this.#size; index++) this.#sortedScratch[index] = this.#values[index] ?? 0;
    this.#sortedScratch.fill(Number.POSITIVE_INFINITY, this.#size);
    this.#sortedScratch.sort();
    return Object.freeze({
      samples: this.#size,
      p50Ms: percentile(this.#sortedScratch, this.#size, 0.5),
      p95Ms: percentile(this.#sortedScratch, this.#size, 0.95),
      p99Ms: percentile(this.#sortedScratch, this.#size, 0.99),
      // Percentiles intentionally use the recent bounded ring. The maximum is
      // retained for the complete post-reset observation window so a rare
      // hitch cannot disappear merely because a soak exceeded ring capacity.
      maxMs: this.#observedMaxMs,
    });
  }
}

/** Allocation-bounded runtime telemetry used only by diagnostics and CI scenarios. */
export class PerformanceMonitor {
  readonly #timings: Record<TimingKind, SampleRing>;
  readonly #gauges = new Map<string, number>();
  #longTasks = 0;

  constructor(capacity = 600) {
    this.#timings = {
      simulation: new SampleRing(capacity),
      render: new SampleRing(capacity),
      frame: new SampleRing(capacity),
      frameInterval: new SampleRing(capacity),
      outsideFrameWork: new SampleRing(capacity),
    };
  }

  record(kind: TimingKind, durationMs: number): void {
    this.#timings[kind].push(durationMs);
    if (kind === "frame" && durationMs > 50) this.#longTasks += 1;
  }

  gauge(name: string, value: number): void {
    if (name.length === 0 || !Number.isFinite(value)) return;
    this.#gauges.set(name, value);
  }

  /** Clears percentile windows while retaining long-task and gauge history. */
  resetTimingSamples(): void {
    for (const timing of Object.values(this.#timings)) timing.clear();
  }

  snapshot(): PerformanceDiagnosticsSnapshot {
    return Object.freeze({
      simulation: this.#timings.simulation.summary(),
      render: this.#timings.render.summary(),
      frame: this.#timings.frame.summary(),
      frameInterval: this.#timings.frameInterval.summary(),
      outsideFrameWork: this.#timings.outsideFrameWork.summary(),
      longTasks: this.#longTasks,
      gauges: Object.freeze(Object.fromEntries([...this.#gauges].sort(([left], [right]) => left.localeCompare(right)))),
    });
  }
}

export type TimingKind = "simulation" | "render" | "frame";

export interface TimingSummary {
  readonly samples: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

export interface PerformanceDiagnosticsSnapshot {
  readonly simulation: TimingSummary;
  readonly render: TimingSummary;
  readonly frame: TimingSummary;
  readonly longTasks: number;
  readonly gauges: Readonly<Record<string, number>>;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

class SampleRing {
  readonly #values: Float64Array;
  #cursor = 0;
  #size = 0;

  constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError("capacity must be a positive integer");
    this.#values = new Float64Array(capacity);
  }

  push(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.#values[this.#cursor] = value;
    this.#cursor = (this.#cursor + 1) % this.#values.length;
    this.#size = Math.min(this.#size + 1, this.#values.length);
  }

  summary(): TimingSummary {
    const sorted = Array.from(this.#values.subarray(0, this.#size)).sort((left, right) => left - right);
    return Object.freeze({
      samples: sorted.length,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      maxMs: sorted.at(-1) ?? 0,
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

  snapshot(): PerformanceDiagnosticsSnapshot {
    return Object.freeze({
      simulation: this.#timings.simulation.summary(),
      render: this.#timings.render.summary(),
      frame: this.#timings.frame.summary(),
      longTasks: this.#longTasks,
      gauges: Object.freeze(Object.fromEntries([...this.#gauges].sort(([left], [right]) => left.localeCompare(right)))),
    });
  }
}

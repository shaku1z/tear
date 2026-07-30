import type { TearExecutionClass, TearObservationClass } from "./contracts";

export type TearObservationChannel = "pixel" | "semantic-ui" | "structured-state" | "events";

export interface TearObservationChannelConfiguration {
  readonly executionClass: TearExecutionClass;
  readonly observationClass: TearObservationClass;
  readonly enabled: Readonly<Record<TearObservationChannel, boolean>>;
}

export interface TearObservationAccessRecord {
  readonly channel: TearObservationChannel;
  readonly tick: number;
  readonly purpose: string;
}

export interface TearObservationSession {
  readonly configuration: TearObservationChannelConfiguration;
  read(channel: TearObservationChannel, tick: number, purpose: string): void;
  records(): readonly TearObservationAccessRecord[];
}

export interface TearVisualParitySample {
  readonly name: string;
  readonly pixel: Readonly<{ screen: string; controls: readonly string[]; confidence: number }>;
  readonly semanticUi?: Readonly<{ screen: string; controls: readonly string[] }>;
  readonly structured?: Readonly<{ screen: string; controls: readonly string[] }>;
  readonly events?: Readonly<{ screen: string; controls: readonly string[] }>;
}

export interface TearVisualParityResult {
  readonly name: string;
  readonly passed: boolean;
  readonly mismatches: readonly string[];
}

function copyEnabled(value: Readonly<Record<TearObservationChannel, boolean>>): Readonly<Record<TearObservationChannel, boolean>> {
  return Object.freeze({ pixel: value.pixel, "semantic-ui": value["semantic-ui"], "structured-state": value["structured-state"], events: value.events });
}

/** Channels are explicitly independent. A Class-C session is constructed with
 * pixels alone; callers cannot silently add structured state later. */
export function createTearObservationSession(configuration: TearObservationChannelConfiguration): TearObservationSession {
  const enabled = copyEnabled(configuration.enabled);
  if (configuration.executionClass === "black-box") {
    if (configuration.observationClass !== "pixel-only") throw new TypeError("black-box certification requires pixel-only observation");
    if (!enabled.pixel || enabled["semantic-ui"] || enabled["structured-state"] || enabled.events) {
      throw new TypeError("black-box observation sessions permit pixels only");
    }
  }
  const frozenConfiguration = Object.freeze({ executionClass: configuration.executionClass, observationClass: configuration.observationClass, enabled });
  const access: TearObservationAccessRecord[] = [];
  return Object.freeze({
    configuration: frozenConfiguration,
    read(channel: TearObservationChannel, tick: number, purpose: string): void {
      if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("observation tick must be a non-negative safe integer");
      if (purpose.trim().length === 0) throw new TypeError("observation reads require an auditable purpose");
      if (!enabled[channel]) throw new Error(`disabled observation channel read: ${channel}`);
      access.push(Object.freeze({ channel, tick, purpose }));
    },
    records: () => Object.freeze([...access]),
  });
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Test-build-only parity measurement. It compares independently collected
 * reports after a run; a Class-C policy must never receive these oracle values. */
export function compareTearVisualParity(sample: TearVisualParitySample): TearVisualParityResult {
  const mismatches: string[] = [];
  const compare = (name: string, value: Readonly<{ screen: string; controls: readonly string[] }> | undefined): void => {
    if (value === undefined) return;
    if (value.screen !== sample.pixel.screen) mismatches.push(`${name}.screen`);
    if (!sameList(value.controls, sample.pixel.controls)) mismatches.push(`${name}.controls`);
  };
  compare("semantic-ui", sample.semanticUi); compare("structured-state", sample.structured); compare("events", sample.events);
  if (sample.pixel.confidence < 0.5) mismatches.push("pixel.confidence");
  return Object.freeze({ name: sample.name, passed: mismatches.length === 0, mismatches: Object.freeze(mismatches) });
}

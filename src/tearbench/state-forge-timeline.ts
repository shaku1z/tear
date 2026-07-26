import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import type { TearCausalEventV1, TearSnapshotV1 } from "./contracts";
import { TearCheckpointBank, type TearCheckpointArchiveV1 } from "./tearsdl";

export interface TearTimelineDeltaV1 {
  readonly id: string;
  readonly parentId: string;
  readonly tick: number;
  readonly statePatch: Readonly<Record<string, unknown>>;
  readonly actions: readonly CommandEnvelope<GameAction>[];
  readonly events: readonly TearCausalEventV1[];
}

export interface TearTimelineArchiveV2 {
  readonly format: "tear-state-timeline";
  readonly schemaVersion: 2;
  readonly cadenceTicks: number;
  readonly checkpoints: TearCheckpointArchiveV1;
  readonly deltas: readonly TearTimelineDeltaV1[];
}

export interface TearCounterfactualRuntime {
  restore(state: Readonly<Record<string, unknown>>): void;
  step(actions: readonly CommandEnvelope<GameAction>[]): void;
  stateHash(): string;
  captureState(): Readonly<Record<string, unknown>>;
}

export interface TearCounterfactualResult {
  readonly sourceId: string;
  readonly ticks: number;
  readonly finalHash: string;
  readonly finalState: Readonly<Record<string, unknown>>;
  readonly actionHash: string;
}

function positiveCadence(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError("checkpoint cadence must be a positive integer");
  return value;
}

function cloneDelta(delta: TearTimelineDeltaV1): TearTimelineDeltaV1 {
  return Object.freeze({
    id: delta.id,
    parentId: delta.parentId,
    tick: delta.tick,
    statePatch: Object.freeze(structuredClone(delta.statePatch)),
    actions: Object.freeze(structuredClone(delta.actions)),
    events: Object.freeze(structuredClone(delta.events)),
  });
}

export class TearStateTimeline {
  readonly #bank = new TearCheckpointBank();
  readonly #deltas = new Map<string, TearTimelineDeltaV1>();
  readonly cadenceTicks: number;

  constructor(cadenceTicks = 120) {
    this.cadenceTicks = positiveCadence(cadenceTicks);
  }

  checkpoint(snapshot: TearSnapshotV1): void {
    this.#bank.addSnapshot(snapshot);
  }

  delta(delta: TearTimelineDeltaV1): void {
    if (this.#deltas.has(delta.id)) throw new TypeError(`timeline delta already exists: ${delta.id}`);
    if (!Number.isSafeInteger(delta.tick) || delta.tick < 0) throw new RangeError("timeline tick must be non-negative");
    this.#bank.fork(delta.parentId, delta.id, delta.tick, delta.statePatch);
    this.#deltas.set(delta.id, cloneDelta(delta));
  }

  materialize(id: string): Readonly<Record<string, unknown>> {
    return this.#bank.materialize(id);
  }

  timeTravel(id: string, runtime: TearCounterfactualRuntime): string {
    runtime.restore(this.materialize(id));
    return runtime.stateHash();
  }

  counterfactual(
    id: string,
    actionBatches: readonly (readonly CommandEnvelope<GameAction>[])[],
    runtime: TearCounterfactualRuntime,
  ): TearCounterfactualResult {
    runtime.restore(this.materialize(id));
    for (const actions of actionBatches) runtime.step(actions);
    return Object.freeze({
      sourceId: id,
      ticks: actionBatches.length,
      finalHash: runtime.stateHash(),
      finalState: Object.freeze(structuredClone(runtime.captureState())),
      actionHash: stableVerificationHash(actionBatches),
    });
  }

  export(): TearTimelineArchiveV2 {
    return Object.freeze({
      format: "tear-state-timeline",
      schemaVersion: 2,
      cadenceTicks: this.cadenceTicks,
      checkpoints: this.#bank.export(),
      deltas: Object.freeze([...this.#deltas.values()].map(cloneDelta)),
    });
  }

  import(archive: TearTimelineArchiveV2): void {
    if (archive.cadenceTicks !== this.cadenceTicks) throw new TypeError("timeline cadence does not match");
    const candidate = new TearStateTimeline(this.cadenceTicks);
    candidate.#bank.import(archive.checkpoints);
    for (const delta of archive.deltas) {
      const materialized = candidate.#bank.materialize(delta.id);
      if (stableVerificationHash(materialized) !== stableVerificationHash(thisMaterialize(archive.checkpoints, delta.id))) {
        throw new TypeError(`timeline delta ${delta.id} does not match checkpoint state`);
      }
      candidate.#deltas.set(delta.id, cloneDelta(delta));
    }
    this.#bank.import(candidate.#bank.export());
    this.#deltas.clear();
    for (const delta of candidate.#deltas.values()) this.#deltas.set(delta.id, delta);
  }
}

function thisMaterialize(archive: TearCheckpointArchiveV1, id: string): Readonly<Record<string, unknown>> {
  const bank = new TearCheckpointBank();
  bank.import(archive);
  return bank.materialize(id);
}

export function migrateTimelineArchive(
  archive: TearCheckpointArchiveV1 | TearTimelineArchiveV2,
  cadenceTicks = 120,
): TearTimelineArchiveV2 {
  if ("format" in archive && archive.format === "tear-state-timeline") {
    return structuredClone(archive);
  }
  return Object.freeze({
    format: "tear-state-timeline",
    schemaVersion: 2,
    cadenceTicks: positiveCadence(cadenceTicks),
    checkpoints: structuredClone(archive),
    deltas: Object.freeze(archive.deltas.map((delta) => Object.freeze({
      ...structuredClone(delta),
      actions: Object.freeze([]),
      events: Object.freeze([]),
    }))),
  });
}

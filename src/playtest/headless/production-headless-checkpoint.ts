import { isRecord } from "../../domain/records";
import type { CommandEnvelope } from "../../domain/envelopes";
import { stableVerificationHash } from "../../domain/hash";
import { AIM_MAGNITUDE_SCALE, normalizeGameAction, type GameAction } from "../../input/game-action";
import type { AuthoritativeInputSnapshot } from "../../gameplay/runtime/authoritative-input";
import type { TearCausalEventV1, TearScenarioV1 } from "../../tearbench/contracts";
import type { TearSnapshotV1 } from "../../gameplay/snapshot/snapshot-contract";
import { requireProductionReplayBootstrap as requireBootstrap } from "../../tearbench/production-replay-bootstrap-check";
import type { ProductionReplayBootstrap } from "../../gameplay/snapshot/snapshot-contract";
import { productionRunSeed } from "../../app/world/detached/world-factory";
import { validateTearContract } from "../../tearbench/validation";
import { requireProductionHeadlessScenario } from "./production-headless-scenario";

/**
 * An in-memory source keyframe for one interrupted C30 episode. It is not a
 * worker message, durable job record, or storage format; callers explicitly
 * retain and pass it to a fresh environment in the same process.
 */
export interface ProductionHeadlessCheckpoint {
  readonly format: "tearbench-production-headless-checkpoint";
  readonly schemaVersion: 2;
  readonly scenario: TearScenarioV1;
  /** Original run-start identity; this alone does not attest a complete source trace. */
  readonly bootstrap: ProductionReplayBootstrap;
  readonly checkpoint: Readonly<{
    tick: number;
    semanticHash: string;
    nextCommandId: number;
  }>;
  readonly snapshot: TearSnapshotV1;
  readonly input: AuthoritativeInputSnapshot & Readonly<{ aimMagnitude: number }>;
  readonly actions: readonly CommandEnvelope<GameAction>[];
  readonly delivery: Readonly<{
    nextSequence: number;
    pendingEvents: readonly TearCausalEventV1[];
    /** Complete checkpoint integrity binding, not provenance authority. */
    hash: string;
  }>;
}

/** Expected lifecycle pressure, distinct from malformed or incompatible checkpoint data. */
export class ProductionCheckpointUnavailableError extends RangeError {
  override name = "ProductionCheckpointUnavailableError";
}

/** Bind a retained checkpoint to the admitted original schedule, without replaying its prefix. */
export function validateProductionHeadlessCheckpointRequest(
  value: unknown,
  sourceScenario: unknown,
  batches: readonly Readonly<{ tick: number; actions: readonly unknown[] }>[],
): ProductionHeadlessCheckpoint {
  const checkpoint = validateProductionHeadlessCheckpoint(value),
    scenario = requireProductionHeadlessScenario(sourceScenario);
  if (stableVerificationHash(scenario) !== stableVerificationHash(checkpoint.scenario)) {
    throw new TypeError("checkpoint scenario differs from admitted request");
  }
  const ticks = new Set<number>(),
    actions: CommandEnvelope<GameAction>[] = [];
  for (const batch of [...batches].sort((a, b) => a.tick - b.tick)) {
    if (!Number.isSafeInteger(batch.tick) || batch.tick < 1 || ticks.has(batch.tick) || !Array.isArray(batch.actions)) {
      throw new TypeError("invalid admitted checkpoint action schedule");
    }
    ticks.add(batch.tick);
    for (const action of batch.actions) {
      const normalized = normalizeGameAction(action);
      if (!normalized.ok) throw new TypeError(`invalid admitted checkpoint action: ${normalized.reason}`);
      if (batch.tick <= checkpoint.checkpoint.tick)
        actions.push(
          Object.freeze({
            kind: "command",
            id: actions.length + 1,
            tick: batch.tick,
            command: normalized.action,
          }),
        );
    }
  }
  if (stableVerificationHash(actions) !== stableVerificationHash(checkpoint.actions)) {
    throw new TypeError("checkpoint action prefix differs from admitted request");
  }
  return checkpoint;
}

export function cloneActions(actions: readonly CommandEnvelope<GameAction>[]): readonly CommandEnvelope<GameAction>[] {
  return Object.freeze(
    actions.map((entry) =>
      Object.freeze({
        kind: entry.kind,
        id: entry.id,
        tick: entry.tick,
        command: Object.freeze({ ...entry.command }),
      }),
    ),
  );
}

export function validateProductionHeadlessCheckpoint(value: unknown): ProductionHeadlessCheckpoint {
  if (!isRecord(value) || value.format !== "tearbench-production-headless-checkpoint" || value.schemaVersion !== 2) {
    throw new TypeError("production headless checkpoint format is invalid");
  }
  const scenario = requireProductionHeadlessScenario(value.scenario);
  const bootstrap = requireBootstrap(value.bootstrap);
  const snapshot = validateTearContract(value.snapshot);
  if (!snapshot.ok || snapshot.value.kind !== "snapshot") {
    throw new TypeError(
      `invalid production headless checkpoint snapshot: ${
        snapshot.ok
          ? "wrong contract kind"
          : snapshot.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")
      }`,
    );
  }
  if (snapshot.value.stateClass !== "recorded-canonical") {
    throw new RangeError("production headless checkpoints require recorded-canonical source state");
  }
  if (!isRecord(value.checkpoint) || !isRecord(value.input) || !Array.isArray(value.actions)) {
    throw new TypeError("production headless checkpoint coordinate is invalid");
  }
  const checkpoint = value.checkpoint;
  const input = value.input;
  const checkpointTick = checkpoint.tick;
  const nextCommandId = checkpoint.nextCommandId;
  const semanticHash = checkpoint.semanticHash;
  const inputTick = input.tick;
  const moveX = input.moveX;
  const moveY = input.moveY;
  const aimTurn = input.aimTurn;
  const aimMagnitude = input.aimMagnitude;
  const primaryHeld = input.primaryHeld;
  if (
    typeof checkpointTick !== "number" ||
    !Number.isSafeInteger(checkpointTick) ||
    checkpointTick < 0 ||
    typeof inputTick !== "number" ||
    !Number.isSafeInteger(inputTick) ||
    inputTick < 0 ||
    checkpointTick !== snapshot.value.tick ||
    checkpointTick !== inputTick ||
    typeof nextCommandId !== "number" ||
    !Number.isSafeInteger(nextCommandId) ||
    nextCommandId < 0 ||
    typeof semanticHash !== "string" ||
    !/^[a-f0-9]{16}$/u.test(semanticHash) ||
    typeof moveX !== "number" ||
    !Number.isFinite(moveX) ||
    typeof moveY !== "number" ||
    !Number.isFinite(moveY) ||
    typeof aimTurn !== "number" ||
    !Number.isFinite(aimTurn) ||
    typeof aimMagnitude !== "number" ||
    !Number.isSafeInteger(aimMagnitude) ||
    aimMagnitude < 0 ||
    aimMagnitude > AIM_MAGNITUDE_SCALE ||
    typeof primaryHeld !== "boolean"
  ) {
    throw new TypeError("production headless checkpoint coordinate is invalid");
  }
  const validCheckpoint = Object.freeze({
    tick: checkpointTick,
    nextCommandId,
    semanticHash,
  });
  const validInput = Object.freeze({
    tick: inputTick,
    moveX,
    moveY,
    aimTurn,
    aimMagnitude,
    primaryHeld,
  });
  const run = snapshot.value.state["tear.run.v1"];
  const blade = snapshot.value.state["tear.blade.v1"];
  if (
    !isRecord(run) ||
    !isRecord(blade) ||
    run.mode !== scenario.start.mode ||
    run.difficulty !== scenario.start.difficulty ||
    blade.weaponId !== scenario.start.weapon ||
    String(run.runSeed) !== snapshot.value.seed ||
    run.runSeed !== productionRunSeed(scenario.seed)
  ) {
    throw new RangeError("production headless checkpoint does not match its natural scenario");
  }
  let previousId = 0,
    previousTick = 0;
  const actions: CommandEnvelope<GameAction>[] = [];
  for (const entry of value.actions) {
    if (!isRecord(entry)) throw new TypeError("production headless checkpoint action trace is invalid");
    const id = entry.id;
    const tick = entry.tick;
    if (
      entry.kind !== "command" ||
      typeof id !== "number" ||
      !Number.isSafeInteger(id) ||
      id !== previousId + 1 ||
      typeof tick !== "number" ||
      !Number.isSafeInteger(tick) ||
      tick < 1 ||
      tick < previousTick ||
      tick > validCheckpoint.tick
    ) {
      throw new TypeError("production headless checkpoint action trace is invalid");
    }
    const normalized = normalizeGameAction(entry.command);
    if (!normalized.ok) throw new TypeError(`invalid checkpoint action: ${normalized.reason}`);
    const actionId = id;
    const actionTick = tick;
    actions.push(Object.freeze({ kind: "command", id: actionId, tick: actionTick, command: normalized.action }));
    previousId = actionId;
    previousTick = actionTick;
  }
  if (previousId !== validCheckpoint.nextCommandId) {
    throw new TypeError("production headless checkpoint command sequence is incomplete");
  }
  if (
    !isRecord(value.delivery) ||
    !Number.isSafeInteger(value.delivery.nextSequence) ||
    Number(value.delivery.nextSequence) < 0 ||
    !Array.isArray(value.delivery.pendingEvents) ||
    typeof value.delivery.hash !== "string"
  ) {
    throw new TypeError("production headless checkpoint delivery frontier is required");
  }
  const nextSequence = Number(value.delivery.nextSequence),
    pendingEvents: TearCausalEventV1[] = [];
  let pendingTick = 0;
  for (const [index, raw] of value.delivery.pendingEvents.entries()) {
    const result = validateTearContract(raw);
    const sequence = nextSequence - value.delivery.pendingEvents.length + index;
    if (
      !result.ok ||
      result.value.kind !== "event" ||
      result.value.source !== "engine" ||
      sequence < 0 ||
      result.value.sequence !== sequence ||
      result.value.tick < pendingTick ||
      result.value.tick > checkpointTick ||
      result.value.id !== `headless:${String(result.value.tick)}:${String(sequence)}`
    ) {
      throw new TypeError("production headless checkpoint pending event frontier is invalid");
    }
    pendingEvents.push(Object.freeze(structuredClone(result.value)));
    pendingTick = result.value.tick;
  }
  const valid = {
    format: "tearbench-production-headless-checkpoint",
    schemaVersion: 2,
    scenario,
    snapshot: snapshot.value,
    bootstrap,
    input: validInput,
    checkpoint: validCheckpoint,
    actions: cloneActions(actions),
  } as const;
  const delivery = Object.freeze({
    nextSequence,
    pendingEvents: Object.freeze(pendingEvents),
    hash: value.delivery.hash,
  });
  if (delivery.hash !== stableVerificationHash({ ...valid, delivery: { nextSequence, pendingEvents } })) {
    throw new TypeError("production headless checkpoint delivery integrity binding is invalid");
  }
  if (checkpointTick >= scenario.maxTicks) throw new RangeError("production headless checkpoint exhausted its horizon");
  return Object.freeze({ ...valid, delivery });
}

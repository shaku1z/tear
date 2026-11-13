import { createHash } from "node:crypto";
import { canonicalJson } from "./tearbench-task-receipts.mjs";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const digest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
function requireValue(ok, message) {
  if (!ok) {
    const error = new TypeError(message);
    error.code = "invalid-record";
    throw error;
  }
}

export const checkpointDigest = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");

/** Finite application policy, not a host memory/throughput guarantee. */
export function validateCheckpointPolicy(value, limits) {
  requireValue(
    exact(value, ["intervalTicks", "maxBytes"]) &&
      integer(value.intervalTicks) &&
      value.intervalTicks >= 1 &&
      value.intervalTicks <= 120 &&
      integer(value.maxBytes) &&
      value.maxBytes > 0 &&
      value.maxBytes <= Math.min(limits.maxRequestBytes, limits.maxResultBytes),
    "invalid checkpoint policy",
  );
  return { ...value };
}

export const checkpointOrigin = (record) =>
  record.checkpoint === null
    ? { digest: null, generation: 0, tick: 0 }
    : {
        digest: record.checkpoint.digest,
        generation: record.checkpoint.value.generation,
        tick: record.checkpoint.value.checkpoint.checkpoint.tick,
      };

/** Pure durable envelope validation; the production runtime additionally validates the complete native checkpoint. */
export function validateDurableCheckpoint(value, record) {
  requireValue(
    exact(value, [
      "format",
      "schemaVersion",
      "requestId",
      "requestDigest",
      "executionDigest",
      "generation",
      "previousDigest",
      "attempt",
      "checkpoint",
      "nativeTerminalEvents",
    ]) &&
      value.format === "tearbench-durable-headless-checkpoint" &&
      value.schemaVersion === 1 &&
      value.requestId === record.job.id &&
      value.requestDigest === record.requestDigest &&
      value.executionDigest === checkpointDigest(record.input.binding) &&
      integer(value.generation) &&
      value.generation > 0 &&
      (value.previousDigest === null || digest(value.previousDigest)),
    "invalid checkpoint identity",
  );
  const attempt = record.job.attempts[value.attempt?.ordinal - 1];
  requireValue(
    exact(value.attempt, ["ordinal", "token", "owner", "claimRevision"]) &&
      attempt !== undefined &&
      value.attempt.token === attempt.token &&
      value.attempt.owner === attempt.owner &&
      value.attempt.ordinal === attempt.ordinal &&
      value.attempt.claimRevision === attempt.claimRevision &&
      value.generation > attempt.origin.generation &&
      (value.generation !== attempt.origin.generation + 1 || value.previousDigest === attempt.origin.digest),
    "invalid checkpoint attempt binding",
  );
  const cp = value.checkpoint,
    tick = cp?.checkpoint?.tick;
  requireValue(
    cp?.format === "tearbench-production-headless-checkpoint" &&
      cp.schemaVersion === 2 &&
      integer(tick) &&
      tick > attempt.origin.tick &&
      tick < record.input.request.scenario.maxTicks &&
      checkpointDigest(cp.scenario) === checkpointDigest(record.input.request.scenario) &&
      cp.snapshot?.tick === tick &&
      cp.input?.tick === tick &&
      integer(cp.input?.aimMagnitude) &&
      cp.input.aimMagnitude <= 1000 &&
      integer(cp.checkpoint.nextCommandId) &&
      typeof cp.checkpoint.semanticHash === "string" &&
      /^[a-f0-9]{16}$/u.test(cp.checkpoint.semanticHash) &&
      Array.isArray(cp.actions),
    "invalid checkpoint coordinate",
  );
  let commandId = 0,
    commandTick = 0;
  for (const entry of cp.actions) {
    requireValue(
      entry?.kind === "command" &&
        entry.id === ++commandId &&
        integer(entry.tick) &&
        entry.tick >= 1 &&
        entry.tick >= commandTick &&
        entry.tick <= tick &&
        object(entry.command),
      "invalid checkpoint commands",
    );
    commandTick = entry.tick;
  }
  const count = record.input.request.actions
    .filter((entry) => entry.tick <= tick)
    .reduce((total, entry) => total + entry.actions.length, 0);
  requireValue(
    commandId === cp.checkpoint.nextCommandId && commandId === count,
    "incomplete checkpoint command frontier",
  );
  requireValue(
    integer(cp.delivery?.nextSequence) &&
      Array.isArray(cp.delivery.pendingEvents) &&
      cp.delivery.pendingEvents.length <= cp.delivery.nextSequence &&
      typeof cp.delivery.hash === "string",
    "invalid checkpoint delivery",
  );
  const deliveredThrough = cp.delivery.nextSequence - cp.delivery.pendingEvents.length - 1;
  let pendingTick = 0;
  for (const [index, event] of cp.delivery.pendingEvents.entries()) {
    const sequence = deliveredThrough + 1 + index;
    requireValue(
      event?.sequence === sequence &&
        integer(event.tick) &&
        event.tick >= pendingTick &&
        event.tick <= tick &&
        event.id === `headless:${event.tick}:${sequence}` &&
        event.kind === "event" &&
        event.source === "engine",
      "invalid pending fact",
    );
    pendingTick = event.tick;
  }
  requireValue(Array.isArray(value.nativeTerminalEvents), "missing delivered native terminal facts");
  let sequence = -1;
  for (const event of value.nativeTerminalEvents) {
    requireValue(
      event?.format === "tear-contract" &&
        event.schemaVersion === 1 &&
        event.kind === "event" &&
        ["run.completed", "run.defeated", "run.abandoned"].includes(event.type) &&
        event.source === "engine" &&
        event.phase === "post-simulation-commit" &&
        object(event.payload) &&
        integer(event.sequence) &&
        event.sequence > sequence &&
        event.sequence <= deliveredThrough &&
        integer(event.tick) &&
        event.tick <= tick &&
        event.id === `headless:${event.tick}:${event.sequence}`,
      "invalid delivered terminal fact",
    );
    sequence = event.sequence;
  }
  return value;
}

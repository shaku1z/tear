import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import { createGameplayCausalEvent } from "../tearbench/gameplay-causal-events";
import type { TearCausalEventV1 } from "../tearbench/contracts";

/** Converts a native gameplay fact into an independent validated V3 event. */
export function createLiveGhostCausalEvent(event: TearGameplayEvent, sequence: number): TearCausalEventV1 {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new RangeError("Ghost causal event sequence must be positive");
  return createGameplayCausalEvent(event, sequence, `ghost-live-${String(sequence)}`);
}

/** Stable reference used by later V3 keyframes to cite the sealed opening event. */
export function ghostLiveBootstrapEventId(sessionId: string): string {
  return `ghost-live-bootstrap-${sessionId.replace(/[^a-zA-Z0-9._-]/gu, "-")}`.slice(0, 256);
}

/** Captures the V3 sidecar opening without misrepresenting sparse legacy context as a full run.started event. */
export function createLiveGhostBootstrapEvent(
  sessionId: string,
  provenance: Readonly<Record<string, unknown>>,
): TearCausalEventV1 {
  return Object.freeze({
    format: "tear-contract", kind: "event", schemaVersion: 1,
    id: ghostLiveBootstrapEventId(sessionId),
    type: "system.checkpoint", tick: 0, phase: "pre-simulation", sequence: 0, source: "engine",
    payload: Object.freeze({ boundary: "v3-sidecar-opened", provenance: structuredClone(provenance) }),
  });
}

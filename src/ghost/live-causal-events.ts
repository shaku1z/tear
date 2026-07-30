import type { LiveGhostEngineEvent } from "../replay/legacy-compat";
import type { TearCausalEventV1 } from "../tearbench/contracts";
import type { TearEventId, TearWithinTickPhase } from "../tearbench/registries";

interface MappedLiveEvent {
  readonly type: TearEventId;
  readonly phase: TearWithinTickPhase;
  readonly actorId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

function mapLegacyEvent(event: LiveGhostEngineEvent): MappedLiveEvent {
  switch (event.kind) {
    case "stage": return { type: "stage.entered", phase: "wave-draft-and-state-transitions", payload: { stage: event.stage } };
    case "wave": return {
      type: event.event === "start" ? "wave.started" : event.event === "cleared" || event.event === "clear" ? "wave.cleared" : "wave.spawn-completed",
      phase: "wave-draft-and-state-transitions", payload: { wave: event.wave, marker: event.event },
    };
    case "spawn": return {
      type: "enemy.spawned", phase: "wave-draft-and-state-transitions", actorId: `enemy-${String(event.actorId)}`,
      payload: { actorKind: event.actorKind },
    };
    case "death": return {
      type: "enemy.defeated", phase: "deaths-and-rewards", actorId: `enemy-${String(event.actorId)}`,
      payload: { cause: event.cause },
    };
    case "effect": return {
      type: event.effect === "stolenBlade" ? "blade.stolen" : event.effect === "revive" ? "player.revived"
        : event.effect === "bossKill" ? "boss.defeated" : "system.checkpoint",
      phase: "post-simulation-commit", payload: { effect: event.effect, x: event.x, y: event.y },
    };
  }
}

/** Converts the Ghost 2 observer feed into an independent validated V3 event. */
export function createLiveGhostCausalEvent(event: LiveGhostEngineEvent, sequence: number): TearCausalEventV1 {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new RangeError("Ghost causal event sequence must be positive");
  const mapped = mapLegacyEvent(event);
  return Object.freeze({
    format: "tear-contract", kind: "event", schemaVersion: 1,
    id: `ghost-live-${String(sequence)}`, type: mapped.type, tick: event.tick, phase: mapped.phase, sequence,
    source: "engine", ...(mapped.actorId === undefined ? {} : { actorId: mapped.actorId }), payload: mapped.payload,
  });
}

/** Captures the V3 sidecar opening without misrepresenting sparse legacy context as a full run.started event. */
export function createLiveGhostBootstrapEvent(
  sessionId: string,
  provenance: Readonly<Record<string, unknown>>,
): TearCausalEventV1 {
  return Object.freeze({
    format: "tear-contract", kind: "event", schemaVersion: 1,
    id: `ghost-live-bootstrap-${sessionId.replace(/[^a-zA-Z0-9._-]/gu, "-")}`.slice(0, 256),
    type: "system.checkpoint", tick: 0, phase: "pre-simulation", sequence: 0, source: "engine",
    payload: Object.freeze({ boundary: "v3-sidecar-opened", provenance: structuredClone(provenance) }),
  });
}

import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import type { TearCausalEventV1 } from "../tearbench/contracts";
import type { TearEventId, TearWithinTickPhase } from "../tearbench/registries";

interface MappedLiveEvent {
  readonly type: TearEventId;
  readonly phase: TearWithinTickPhase;
  readonly actorId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

function mapGameplayEvent(event: TearGameplayEvent): MappedLiveEvent {
  switch (event.kind) {
    case "run": return {
      type: event.transition === "started" ? "run.started" : event.transition === "paused" ? "run.paused"
        : event.transition === "resumed" ? "run.resumed" : event.transition === "completed" ? "run.completed"
          : event.transition === "defeated" ? "run.defeated" : "run.abandoned",
      phase: event.transition === "started" || event.transition === "resumed" ? "pre-simulation" : "post-simulation-commit",
      payload: {
        runId: event.runId, mode: event.mode, difficulty: event.difficulty, weapon: event.weaponId, wave: event.wave,
        score: event.score, runTimeSeconds: event.runTimeSeconds,
        ...(event.reason === undefined ? {} : { reason: event.reason }),
      },
    };
    case "stage": return { type: "stage.entered", phase: "wave-draft-and-state-transitions", payload: { stage: event.stage } };
    case "wave": return {
      type: event.event === "start" ? "wave.started" : event.event === "cleared" || event.event === "clear" ? "wave.cleared" : "wave.spawn-completed",
      phase: "wave-draft-and-state-transitions", payload: { wave: event.wave, marker: event.event },
    };
    case "spawn": return {
      type: "enemy.spawned", phase: "wave-draft-and-state-transitions", actorId: event.actorId,
      payload: {
        actorKind: event.actorKind, x: event.x, y: event.y,
        ...(event.variantName === undefined ? {} : { variantName: event.variantName }),
        ...(event.bossId === undefined ? {} : { bossId: event.bossId }),
      },
    };
    case "death": return {
      type: "enemy.defeated", phase: "deaths-and-rewards", actorId: event.actorId,
      payload: { cause: event.cause },
    };
    case "loadout": return {
      type: event.tier > 1 ? "tier.selected" : "draft.selected",
      phase: "wave-draft-and-state-transitions",
      payload: { choiceId: event.choiceId, tier: event.tier, wave: event.wave },
    };
    case "effect": return {
      type: event.effect === "stolenBlade" ? "blade.stolen" : event.effect === "revive" ? "player.revived"
        : event.effect === "bossKill" ? "boss.defeated" : "system.checkpoint",
      phase: "post-simulation-commit", payload: { effect: event.effect, x: event.x, y: event.y },
    };
  }
}

/** Converts a native gameplay fact into an independent validated V3 event. */
export function createLiveGhostCausalEvent(event: TearGameplayEvent, sequence: number): TearCausalEventV1 {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new RangeError("Ghost causal event sequence must be positive");
  const mapped = mapGameplayEvent(event);
  return Object.freeze({
    format: "tear-contract", kind: "event", schemaVersion: 1,
    id: `ghost-live-${String(sequence)}`, type: mapped.type, tick: event.tick, phase: mapped.phase, sequence,
    source: "engine", ...(mapped.actorId === undefined ? {} : { actorId: mapped.actorId }), payload: mapped.payload,
  });
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

import type { TearCausalEventV1 } from "../tearbench/contracts";
import type { GhostReadCapsule } from "./capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import { createGhostProductionReplaySession, type GhostVerifiedProductionReplaySession } from "./production-replay-session";
import { alignGhostsBySemanticEvent } from "./theater";

export const MIN_GHOST_COMPARISON_RUNS = 2;
export const MAX_GHOST_COMPARISON_RUNS = 9;

export interface GhostProductionComparisonRun {
  readonly sourceId: string;
  readonly sourceRootHash: string;
}

export interface GhostProductionComparisonOccurrence {
  readonly eventType: TearCausalEventV1["type"];
  /** Zero-based internally so the player view can label it as occurrence one, two, and so on. */
  readonly occurrence: number;
  readonly runs: readonly Readonly<{
    sourceId: string;
    tick: number | null;
    semanticHash: string | null;
  }>[];
}

export interface GhostProductionReplayComparison {
  readonly runs: readonly GhostProductionComparisonRun[];
  readonly occurrences: readonly GhostProductionComparisonOccurrence[];
}

interface ComparisonSource {
  readonly session: GhostVerifiedProductionReplaySession;
  readonly envelope: ReturnType<typeof mapGhostCapsuleToReplayEnvelope>;
}

/**
 * Builds a read-only semantic comparison from independently verified V3
 * capsules. The player Vault selects from two through nine sources. Each
 * displayed tick is reconstructed through that capsule's own source-owned
 * production composition; this never compares Canvas, PCM, haptic, or device
 * output.
 */
export function createGhostProductionReplayComparison(
  capsules: readonly GhostReadCapsule[],
): GhostProductionReplayComparison {
  if (capsules.length < MIN_GHOST_COMPARISON_RUNS || capsules.length > MAX_GHOST_COMPARISON_RUNS) {
    throw new RangeError(`Ghost comparison requires ${String(MIN_GHOST_COMPARISON_RUNS)}-${String(MAX_GHOST_COMPARISON_RUNS)} verified capsules`);
  }
  const sources: readonly ComparisonSource[] = Object.freeze(capsules.map((capsule) => Object.freeze({
    session: createGhostProductionReplaySession(capsule), envelope: mapGhostCapsuleToReplayEnvelope(capsule),
  })));
  const ids = sources.map((source) => source.session.sourceId);
  if (new Set(ids).size !== ids.length) throw new TypeError("Ghost comparison requires distinct source capsules");
  const runs = Object.freeze(sources.map((source) => Object.freeze({
    sourceId: source.session.sourceId, sourceRootHash: source.session.sourceRootHash,
  })));
  const eventTypes = [...new Set(sources.flatMap((source) => source.envelope.ghost.events.map((event) => event.type)))].sort();
  const occurrences = Object.freeze(eventTypes.flatMap((eventType) => alignGhostsBySemanticEvent(
    sources.map((source) => source.envelope.ghost), eventType,
  ).map((alignment) => Object.freeze({
    eventType,
    occurrence: alignment.occurrence,
    runs: Object.freeze(sources.map((source) => {
      const tick = alignment.ticksByGhost[source.session.sourceId] ?? null;
      return Object.freeze({ sourceId: source.session.sourceId, tick,
        semanticHash: tick === null ? null : source.session.seek(tick).semanticHash });
    })),
  }))));
  if (occurrences.length === 0) throw new RangeError("Ghost comparison requires recorded semantic events");
  return Object.freeze({ runs, occurrences });
}

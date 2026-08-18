import type { GhostReadCapsule } from "./capsule-reader";
import type { GhostVerifiedProductionReplaySession } from "./production-replay-session";
import { createStudioEdl, type GhostStudioEditDecisionList } from "./player-experiences";

export interface GhostStudioCutListTheaterProjection {
  readonly available: boolean;
  readonly edl?: GhostStudioEditDecisionList;
  readonly unavailable?: string;
}

/**
 * Creates one immutable local EDL from the already-open verified Theater
 * source. This deliberately has no Vault write or media-rendering dependency:
 * Studio may describe a cut, but it cannot alter the durable capsule.
 */
export function createGhostStudioCutListFromTheater(
  capsule: GhostReadCapsule,
  session: GhostVerifiedProductionReplaySession,
  currentTick: number,
): GhostStudioCutListTheaterProjection {
  if (capsule.manifest.schemaVersion !== 2 || capsule.manifest.status !== "complete") {
    return Object.freeze({ available: false, unavailable: "Studio requires a complete current V3 capsule." });
  }
  if (capsule.manifest.id !== session.sourceId || capsule.manifest.rootIntegrity !== session.sourceCapsuleRootIntegrity) {
    return Object.freeze({ available: false, unavailable: "Theater source custody no longer matches this verified replay." });
  }
  if (!Number.isSafeInteger(currentTick) || !session.verifiedReceiptTicks.includes(currentTick)) {
    return Object.freeze({ available: false, unavailable: "Studio requires the current verified replay checkpoint." });
  }
  const priorCheckpoint = [...session.verifiedReceiptTicks].reverse().find((tick) => tick < currentTick) ?? 0;
  const edl = createStudioEdl({
    id: `theater-cut-${session.sourceId}-${String(priorCheckpoint)}-${String(currentTick)}`,
    sourceGhostId: session.sourceId,
    sourceRootHash: session.sourceRootHash,
    aspectRatio: "16:9",
    clips: [Object.freeze({ id: "verified-theater-window", sourceFromTick: priorCheckpoint, sourceToTick: currentTick,
      outputOrder: 0, speed: 1, camera: "source" as const })],
    title: "Verified Theater Cut List",
    credits: "LOCAL EDL ONLY",
  });
  return Object.freeze({ available: true, edl });
}

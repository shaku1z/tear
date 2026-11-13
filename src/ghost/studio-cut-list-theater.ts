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
 * Replay Editor may describe a cut, but it cannot alter the durable capsule.
 */
export function createGhostStudioCutListFromTheater(
  capsule: GhostReadCapsule,
  session: GhostVerifiedProductionReplaySession,
  currentTick: number,
  fromTick?: number,
  speed: 0.25 | 0.5 | 1 | 2 | 4 = 1,
): GhostStudioCutListTheaterProjection {
  if (capsule.manifest.schemaVersion !== 2 || capsule.manifest.status !== "complete") {
    return Object.freeze({ available: false, unavailable: "Replay Editor requires a complete current V3 capsule." });
  }
  if (
    capsule.manifest.id !== session.sourceId ||
    capsule.manifest.rootIntegrity !== session.sourceCapsuleRootIntegrity
  ) {
    return Object.freeze({
      available: false,
      unavailable: "Theater source custody no longer matches this verified replay.",
    });
  }
  if (!Number.isSafeInteger(currentTick) || !session.verifiedReceiptTicks.includes(currentTick)) {
    return Object.freeze({
      available: false,
      unavailable: "Replay Editor requires the current verified replay checkpoint.",
    });
  }
  const priorCheckpoint =
    fromTick ?? [...session.verifiedReceiptTicks].reverse().find((tick) => tick < currentTick) ?? 0;
  if (!session.verifiedReceiptTicks.includes(priorCheckpoint) || priorCheckpoint >= currentTick)
    return Object.freeze({
      available: false,
      unavailable: "Mark an earlier verified IN checkpoint, then seek a later OUT checkpoint.",
    });
  const edl = createStudioEdl({
    id: `theater-cut-${session.sourceId}-${String(priorCheckpoint)}-${String(currentTick)}`,
    sourceGhostId: session.sourceId,
    sourceRootHash: session.sourceRootHash,
    aspectRatio: "16:9",
    clips: [
      Object.freeze({
        id: "verified-theater-window",
        sourceFromTick: priorCheckpoint,
        sourceToTick: currentTick,
        outputOrder: 0,
        speed,
        camera: "player-follow" as const,
      }),
    ],
    title: "Verified Theater Cut List",
    credits: "RECONSTRUCTED PLAYER-FOLLOW · SIMULATION TIME",
  });
  return Object.freeze({ available: true, edl });
}

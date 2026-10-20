import { ghostRecordingFirstTick, requireGhostForkPermit, type GhostForkPermit } from "./fork-origin";
import { createProductionGhostReplayComposition, type ProductionGhostReplayCompositionOptions } from "../tearbench/production-replay-composition";
import type { GhostReadCapsule } from "./capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import { readGhostAuthoritativeReceipt } from "./authoritative-receipt";
import { verifyGhostCapsuleProductionReplay } from "./production-replay-verification";
import { issueGhostRecordedOpeningPermit, readGhostReplayRunContext } from "./replay-admission";
import { readGhostApplicationClockSchedule } from "./application-frame-events";
import { createPracticeFromHere, GhostProductionReplayWorld, type GhostPracticeChild, type GhostPracticeMode, type GhostSeekResult, type GhostReplayRenderView } from "./replay-world";

export interface GhostVerifiedReplayRenderView extends GhostReplayRenderView {
  readonly sourceId: string; readonly sourceRootHash: string; readonly sourceCapsuleRootIntegrity: string; readonly semanticHash: string;
}
export interface GhostVerifiedProductionReplaySession {
  readonly sourceId: string;
  /** Immutable Vault manifest identity observed when this session was opened. */
  readonly sourceCapsuleRootIntegrity: string;
  readonly sourceRootHash: string;
  readonly firstTick?: number;
  readonly lastTick?: number;
  readonly verifiedReceiptTicks: readonly number[];
  seek(tick: number): GhostSeekResult;
  renderFrame?(tick: number): GhostVerifiedReplayRenderView;
  forkPractice(tick: number, mode: GhostPracticeMode): GhostPracticeChild;
}

/**
 * Opens a verified V3 capsule as a read-only replay source. It owns neither
 * Vault writes nor player/profile state; forks are immutable practice children
 * that retain their source root hash and cannot become ranked/leaderboard runs.
 */
export function createGhostProductionReplaySession(
  capsule: GhostReadCapsule,
  presentation: Pick<ProductionGhostReplayCompositionOptions, "presentation" | "renderView"> = {},
  forkPermit?: GhostForkPermit,
): GhostVerifiedProductionReplaySession {
  if (!Number.isSafeInteger(capsule.maxTick) || capsule.maxTick < 0) throw new RangeError("production replay source range is invalid");
  const forkOrigin = requireGhostForkPermit(capsule, forkPermit), firstTick = ghostRecordingFirstTick(capsule);
  const verification = verifyGhostCapsuleProductionReplay(capsule, forkPermit);
  if (verification.status !== "verified") {
    throw new TypeError(`production replay requires verified authoritative receipts (${verification.status})`);
  }
  const mapped = mapGhostCapsuleToReplayEnvelope(capsule);
  const receipts = capsule.tracks.results.flatMap((entry) => {
    const receipt = readGhostAuthoritativeReceipt(entry.value);
    return receipt?.tick === entry.tick ? [receipt] : [];
  });
  const verifiedReceiptTicks = new Set(verification.comparisons.filter((comparison) => comparison.equal).map((comparison) => comparison.tick));
  const inputs = new Map(receipts.map((receipt) => [receipt.tick, receipt.input]));
  const maxTick = forkOrigin === undefined ? capsule.maxTick : receipts.reduce((last, receipt) => Math.max(last, receipt.tick), firstTick);
  const openingPermit = issueGhostRecordedOpeningPermit(capsule);
  const context = readGhostReplayRunContext(capsule.manifest.provenance);
  const applicationClock = readGhostApplicationClockSchedule(capsule, context?.run.id ?? "", context?.simulation.applicationFrames !== undefined);
  const composition = createProductionGhostReplayComposition({
    ...presentation,
    ...(forkOrigin === undefined ? {} : { forkOrigin }),
    seed: mapped.ghost.snapshots[0]?.seed ?? "unknown",
    inputSnapshots: inputs,
    requireRecordedApplicationFrames: true,
    ...(applicationClock === undefined ? {} : { applicationClock }),
    ...(openingPermit === undefined ? {} : { openingPermit }),
  });
  const checkpointAt = (tick: number) => mapped.ghost.snapshots.find((snapshot) => snapshot.tick === tick);
  const seek = (tick: number): GhostSeekResult => {
    if (!Number.isSafeInteger(tick) || tick < firstTick || tick > maxTick) throw new RangeError("production replay seek is outside the recorded source range");
    return new GhostProductionReplayWorld(mapped.ghost, composition).seek(tick);
  };
  return Object.freeze({
    firstTick, lastTick: maxTick, sourceId: mapped.ghost.id,
    sourceCapsuleRootIntegrity: capsule.manifest.rootIntegrity,
    sourceRootHash: mapped.ghost.rootHash,
    verifiedReceiptTicks: Object.freeze([...verifiedReceiptTicks].sort((left, right) => left - right)),
    seek,
    ...(presentation.renderView === undefined ? {} : { renderFrame(tick: number): GhostVerifiedReplayRenderView {
      if (!Number.isSafeInteger(tick) || tick < firstTick || tick > maxTick) throw new RangeError("render tick is outside the recorded source range");
      const world = new GhostProductionReplayWorld(mapped.ghost, composition), result = world.seek(tick);
      if (result.correction !== undefined) throw new TypeError("corrected replay states cannot become media frames");
      return Object.freeze({ ...world.renderView(), sourceId: mapped.ghost.id, sourceRootHash: mapped.ghost.rootHash,
        sourceCapsuleRootIntegrity: capsule.manifest.rootIntegrity, semanticHash: result.semanticHash });
    } }),
    forkPractice(tick: number, mode: GhostPracticeMode): GhostPracticeChild {
      const snapshot = checkpointAt(tick);
      if (snapshot === undefined || !verifiedReceiptTicks.has(tick)) {
        throw new RangeError("practice forks require a verified recorded checkpoint");
      }
      const result = seek(tick);
      if (result.semanticHash !== receipts.find((receipt) => receipt.tick === tick)?.stateHash) {
        throw new TypeError("practice checkpoint no longer matches its verified authoritative receipt");
      }
      return createPracticeFromHere(mapped.ghost, snapshot, mode);
    },
  });
}

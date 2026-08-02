import { createProductionGhostReplayComposition } from "../tearbench/production-replay-composition";
import type { GhostReadCapsule } from "./capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import { readGhostAuthoritativeReceipt } from "./authoritative-receipt";
import { verifyGhostCapsuleProductionReplay } from "./production-replay-verification";
import { createPracticeFromHere, GhostProductionReplayWorld, type GhostPracticeChild, type GhostPracticeMode, type GhostSeekResult } from "./replay-world";

export interface GhostVerifiedProductionReplaySession {
  readonly sourceId: string;
  readonly sourceRootHash: string;
  readonly verifiedReceiptTicks: readonly number[];
  seek(tick: number): GhostSeekResult;
  forkPractice(tick: number, mode: GhostPracticeMode): GhostPracticeChild;
}

/**
 * Opens a verified V3 capsule as a read-only replay source. It owns neither
 * Vault writes nor player/profile state; forks are immutable practice children
 * that retain their source root hash and cannot become ranked/leaderboard runs.
 */
export function createGhostProductionReplaySession(
  capsule: GhostReadCapsule,
): GhostVerifiedProductionReplaySession {
  const verification = verifyGhostCapsuleProductionReplay(capsule);
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
  const composition = createProductionGhostReplayComposition({
    seed: mapped.ghost.snapshots[0]?.seed ?? "unknown",
    inputSnapshots: inputs,
  });
  const checkpointAt = (tick: number) => mapped.ghost.snapshots.find((snapshot) => snapshot.tick === tick);
  const seek = (tick: number): GhostSeekResult => new GhostProductionReplayWorld(mapped.ghost, composition).seek(tick);
  return Object.freeze({
    sourceId: mapped.ghost.id,
    sourceRootHash: mapped.ghost.rootHash,
    verifiedReceiptTicks: Object.freeze([...verifiedReceiptTicks].sort((left, right) => left - right)),
    seek,
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

import { createProductionGhostReplayComposition } from "../tearbench/production-replay-composition";
import type { GhostReadCapsule } from "./capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import { readGhostAuthoritativeReceipt } from "./authoritative-receipt";
import { GhostProductionReplayWorld } from "./replay-world";

export interface GhostProductionReceiptComparison {
  readonly tick: number;
  readonly snapshotId?: string;
  readonly expectedHash: string;
  readonly actualHash?: string;
  readonly equal: boolean;
  readonly reason?: string;
}

export interface GhostProductionReplayVerification {
  readonly status: "verified" | "mismatch" | "unavailable";
  readonly comparisons: readonly GhostProductionReceiptComparison[];
  readonly mappingIssues: readonly string[];
}

/**
 * Verifies durable V3 receipt bytes only after they are rebuilt through the
 * source-owned production replay composition. It does not promote capsule
 * trust, mutate custody, or substitute a visual/presentation result.
 */
export function verifyGhostCapsuleProductionReplay(
  capsule: GhostReadCapsule,
): GhostProductionReplayVerification {
  const mapped = mapGhostCapsuleToReplayEnvelope(capsule);
  const receipts = capsule.tracks.results.flatMap((entry) => {
    const receipt = readGhostAuthoritativeReceipt(entry.value);
    return receipt?.tick === entry.tick ? [receipt] : [];
  });
  const mappingIssues = Object.freeze(mapped.issues.map((issue) => `${issue.track}@${String(issue.tick)}: ${issue.reason}`));
  if (receipts.length === 0 || mapped.ghost.snapshots.length === 0) {
    return Object.freeze({ status: "unavailable", comparisons: Object.freeze([]), mappingIssues });
  }
  const inputs = new Map(receipts.map((receipt) => [receipt.tick, receipt.input]));
  const composition = createProductionGhostReplayComposition({ seed: mapped.ghost.snapshots[0]?.seed ?? "unknown", inputSnapshots: inputs });
  const comparisons: GhostProductionReceiptComparison[] = [];
  for (const receipt of receipts) {
    const snapshot = mapped.ghost.snapshots.find((candidate) => candidate.tick === receipt.tick);
    if (snapshot === undefined) {
      comparisons.push(Object.freeze({ tick: receipt.tick, expectedHash: receipt.stateHash, equal: false,
        reason: "receipt has no same-tick recorded-canonical State Forge snapshot" }));
      continue;
    }
    try {
      const result = new GhostProductionReplayWorld(mapped.ghost, composition).seek(receipt.tick);
      comparisons.push(Object.freeze({ tick: receipt.tick, snapshotId: snapshot.id, expectedHash: receipt.stateHash,
        actualHash: result.semanticHash, equal: result.semanticHash === receipt.stateHash }));
    } catch (error) {
      comparisons.push(Object.freeze({ tick: receipt.tick, snapshotId: snapshot.id, expectedHash: receipt.stateHash,
        equal: false, reason: error instanceof Error ? error.message : String(error) }));
    }
  }
  return Object.freeze({
    status: comparisons.every((comparison) => comparison.equal) ? "verified" : "mismatch",
    comparisons: Object.freeze(comparisons),
    mappingIssues,
  });
}

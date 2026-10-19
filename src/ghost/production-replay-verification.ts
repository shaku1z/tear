import { createProductionGhostReplayComposition } from "../tearbench/production-replay-composition";
import type { GhostReadCapsule } from "./capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import { readGhostAuthoritativeReceipt } from "./authoritative-receipt";
import { GhostProductionReplayWorld } from "./replay-world";
import { issueGhostRecordedOpeningPermit } from "./replay-admission";
import { createGhostV3 } from "./truth-kernel";
import { stableVerificationHash } from "../replay/hash";

export interface GhostProductionReceiptComparison {
  readonly tick: number;
  readonly snapshotId?: string;
  readonly expectedHash: string;
  readonly actualHash?: string;
  readonly equal: boolean;
  readonly reason?: string;
}

export interface GhostOpeningContinuationVerification extends GhostProductionReplayVerification {
  readonly comparisons: readonly (GhostProductionReceiptComparison & { readonly inputEqual?: boolean })[];
  readonly continuation: Readonly<{ kind: "opening-only-derived-in-memory"; sourceRootIntegrity: string;
    sourceAnchorId: string | undefined; steps: number; laterKeyframesUsed: false; derivedRootHash?: string }>;
}

/** Disclosed in-memory opening-only execution; never replaces or edits archive keyframes. */
export function verifyGhostCapsuleOpeningContinuation(capsule: GhostReadCapsule): GhostOpeningContinuationVerification {
  const mapped = mapGhostCapsuleToReplayEnvelope(capsule), targets = [60, 120, 180];
  const receipts = capsule.tracks.results.flatMap((entry) => {
    const receipt = readGhostAuthoritativeReceipt(entry.value); return receipt?.tick === entry.tick ? [receipt] : [];
  });
  const anchor = mapped.ghost.snapshots.find((snapshot) => snapshot.tick === 0);
  const comparisons: (GhostProductionReceiptComparison & { readonly inputEqual?: boolean })[] = [];
  let steps = 0;
  const evidence = () => Object.freeze({ kind: "opening-only-derived-in-memory" as const, sourceRootIntegrity: capsule.manifest.rootIntegrity,
    sourceAnchorId: anchor?.id, steps, laterKeyframesUsed: false as const });
  if (mapped.issues.length > 0) return Object.freeze({ status: "unavailable", comparisons: Object.freeze([]), continuation: evidence(),
    mappingIssues: Object.freeze(mapped.issues.map((issue) => `${issue.track}@${String(issue.tick)}: ${issue.reason}`)) });
  try {
    const permit = issueGhostRecordedOpeningPermit(capsule);
    if (permit === undefined || anchor === undefined || mapped.issues.length !== 0
      || targets.some((tick) => receipts.filter((receipt) => receipt.tick === tick).length !== 1)) {
      return Object.freeze({ status: "unavailable" as const, comparisons, continuation: evidence(), mappingIssues: ["opening continuation requires admitted anchor, valid command/event mapping, and unique60/120/180 receipts"] });
    }
    const derived = createGhostV3({ ...mapped.ghost, snapshots: [anchor] });
    const composition = createProductionGhostReplayComposition({ seed: anchor.seed, openingPermit: permit });
    const replay = new GhostProductionReplayWorld(derived, { create(snapshot) {
      const session = composition.create(snapshot);
      return Object.freeze({ ...session, afterReplayAdvance() {
        steps++;
        const tick = session.simulation.scheduler.tick;
        if (!targets.includes(tick)) return;
        const expected = receipts.find((receipt) => receipt.tick === tick);
        if (expected === undefined) throw new Error("opening receipt disappeared");
        const actualHash = stableVerificationHash(session.semanticProjection()), inputEqual = stableVerificationHash(session.simulation.input.snapshot()) === stableVerificationHash(expected.input);
        comparisons.push(Object.freeze({ tick, expectedHash: expected.stateHash, actualHash, inputEqual, equal: inputEqual && actualHash === expected.stateHash }));
      } });
    } });
    replay.seek(180);
    return Object.freeze({ status: comparisons.length === 3 && comparisons.every((entry) => entry.equal) && steps === 180 ? "verified" as const : "mismatch" as const,
      comparisons: Object.freeze(comparisons), continuation: Object.freeze({ ...evidence(), derivedRootHash: derived.rootHash }), mappingIssues: Object.freeze([]) });
  } catch (error) {
    return Object.freeze({ status: "mismatch" as const, comparisons: Object.freeze(comparisons), continuation: evidence(),
      mappingIssues: Object.freeze([error instanceof Error ? error.message : String(error)]) });
  }
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
  if (mappingIssues.length > 0) return Object.freeze({ status: "mismatch", comparisons: Object.freeze([]), mappingIssues });
  const inputs = new Map(receipts.map((receipt) => [receipt.tick, receipt.input]));
  let openingPermit;
  try { openingPermit = issueGhostRecordedOpeningPermit(capsule); }
  catch (error) { return Object.freeze({ status: "mismatch", comparisons: Object.freeze([]),
    mappingIssues: Object.freeze([...mappingIssues, error instanceof Error ? error.message : String(error)]) }); }
  const composition = createProductionGhostReplayComposition({ seed: mapped.ghost.snapshots[0]?.seed ?? "unknown", inputSnapshots: inputs,
    ...(openingPermit === undefined ? {} : { openingPermit }) });
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

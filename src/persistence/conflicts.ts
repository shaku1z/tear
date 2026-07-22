export interface ConflictMetadata {
  readonly revision: number;
  readonly updatedAtMs: number;
  readonly writerId: string;
}

export type ConflictReason = "same" | "higher-revision" | "newer-write" | "writer-tiebreak";

export interface ConflictResolution<T> {
  readonly winner: T;
  readonly loser: T;
  readonly source: "local" | "remote";
  readonly reason: ConflictReason;
}

/** Deterministic adapter policy kept separate from schema validation and domain-specific merging. */
export function resolveEnvelopeConflict<T extends ConflictMetadata>(local: T, remote: T): ConflictResolution<T> {
  if (local.revision !== remote.revision) {
    return local.revision > remote.revision
      ? { winner: local, loser: remote, source: "local", reason: "higher-revision" }
      : { winner: remote, loser: local, source: "remote", reason: "higher-revision" };
  }
  if (local.updatedAtMs !== remote.updatedAtMs) {
    return local.updatedAtMs > remote.updatedAtMs
      ? { winner: local, loser: remote, source: "local", reason: "newer-write" }
      : { winner: remote, loser: local, source: "remote", reason: "newer-write" };
  }
  if (local.writerId === remote.writerId) return { winner: local, loser: remote, source: "local", reason: "same" };
  return local.writerId.localeCompare(remote.writerId) >= 0
    ? { winner: local, loser: remote, source: "local", reason: "writer-tiebreak" }
    : { winner: remote, loser: local, source: "remote", reason: "writer-tiebreak" };
}

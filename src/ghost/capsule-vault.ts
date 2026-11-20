import { isObject, isRecord } from "../domain/records";
import { stableVerificationHash } from "../domain/hash";
import { decodeGhostChunkPayload } from "./capsule-codec";
import {
  prepareForensicGhostImport,
  prepareGhostCapsuleImport,
  commitGhostCapsuleImport,
  ghostRootIntegrity,
  parseGhostCapsuleManifest,
  type GhostCapsuleImportPlan,
  type GhostImportBaseline,
} from "./capsule-import-plan";
import { ghostPortableArchiveData, type PreparedGhostPortableArchive } from "./capsule-paired-archive";
import { readGhostColdRestoreCompletion, type GhostColdRestoreCompletion } from "./cold-restore-job";
import { reviseGhostCapsuleManifest, type TearGhostManifest } from "./capsule-contract";
import {
  ghostCapsuleProtectionKey,
  parseGhostCapsuleProtection,
  prepareGhostCapsuleSourceGuards,
} from "./capsule-protection";

export * from "./capsule-contract";
export * from "./capsule-protection";

export * from "./capsule-vault-backend";
import type {
  TearGhostChunkIndexEntry,
  GhostVaultBackend,
  GhostVaultWrite,
  GhostVaultGuard,
} from "./capsule-vault-backend";

export interface GhostVaultImportLimits {
  readonly maxEncodedBytes: number;
  readonly maxChunks: number;
  readonly maxChunkBytes: number;
  readonly maxExpansionRatio: number;
}

const DEFAULT_IMPORT_LIMITS: GhostVaultImportLimits = Object.freeze({
  maxEncodedBytes: 64 * 1024 * 1024,
  maxChunks: 20_000,
  maxChunkBytes: 8 * 1024 * 1024,
  maxExpansionRatio: 100,
});

const GHOST_MANIFEST_MUTATION_EPOCH_KEY = "ghost-manifest-mutation-epoch:v1";

interface GhostMutationEpoch {
  readonly raw: string | undefined;
  readonly next: string;
}

function isOptimisticConflict(error: unknown): boolean {
  return error instanceof Error && /(?:no longer matches|conditional write)/u.test(error.message);
}

function parseMutationEpoch(raw: string | undefined): number {
  if (raw === undefined) return 0;
  if (!/^\d+$/u.test(raw)) throw new TypeError("invalid Ghost manifest mutation epoch");
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new RangeError("Ghost manifest mutation epoch exceeds safe integer range");
  return value;
}

export { ghostRootIntegrity, parseGhostCapsuleManifest } from "./capsule-import-plan";

export class GhostLocalVault {
  readonly #backend: GhostVaultBackend;
  readonly #importOwner = Object.freeze({});

  constructor(backend: GhostVaultBackend) {
    this.#backend = backend;
  }

  backend(): GhostVaultBackend {
    return this.#backend;
  }

  async prepareCapsuleImport(
    archive: PreparedGhostPortableArchive,
    baseline?: GhostImportBaseline,
  ): Promise<GhostCapsuleImportPlan> {
    return prepareGhostCapsuleImport(this.#backend, this.#importOwner, ghostPortableArchiveData(archive), baseline);
  }

  async commitCapsuleImport(
    plan: GhostCapsuleImportPlan,
    completion: GhostColdRestoreCompletion,
  ): Promise<"imported" | "existing-exact"> {
    return commitGhostCapsuleImport(
      this.#backend,
      this.#importOwner,
      plan,
      readGhostColdRestoreCompletion(completion),
      (build) => this.#commitMutation(build, true),
    );
  }

  #manifestWrites(manifest: TearGhostManifest): readonly GhostVaultWrite[] {
    // Every schema-v2 write re-validates the hash-bound contract. This guards
    // against an internal caller spreading a manifest and forgetting to reissue
    // its integrity record after a legitimate lifecycle transition.
    const durable = parseGhostCapsuleManifest(manifest);
    return Object.freeze([
      { store: "manifests", key: durable.id, value: JSON.stringify(durable) },
      {
        store: "indexes",
        key: `manifest:${durable.id}`,
        value: JSON.stringify({
          status: durable.status,
          createdAt: durable.createdAt,
          chunks: durable.chunks.length,
        }),
      },
    ]);
  }

  async #mutationEpoch(): Promise<GhostMutationEpoch> {
    const raw = await this.#backend.get("indexes", GHOST_MANIFEST_MUTATION_EPOCH_KEY);
    const current = parseMutationEpoch(raw);
    if (current === Number.MAX_SAFE_INTEGER) throw new RangeError("Ghost manifest mutation epoch exhausted");
    return Object.freeze({ raw, next: String(current + 1) });
  }

  #epochGuard(epoch: GhostMutationEpoch): GhostVaultGuard {
    return Object.freeze({
      store: "indexes",
      key: GHOST_MANIFEST_MUTATION_EPOCH_KEY,
      ...(epoch.raw === undefined ? {} : { expected: epoch.raw }),
    });
  }

  #epochWrite(epoch: GhostMutationEpoch): GhostVaultWrite {
    return Object.freeze({ store: "indexes", key: GHOST_MANIFEST_MUTATION_EPOCH_KEY, value: epoch.next });
  }

  /**
   * Manifest creation/update/removal all advance one durable epoch.  A global
   * epoch is intentionally small: it serializes the reference scan against
   * every public manifest mutation without requiring an untrusted caller to
   * supply a complete chunk catalog.  Short retries preserve independent
   * recorder progress when unrelated mutations happen at the same time.
   */
  async #commitMutation(
    build: (
      epoch: GhostMutationEpoch,
    ) => Promise<
      { readonly guards: readonly GhostVaultGuard[]; readonly writes: readonly GhostVaultWrite[] } | undefined
    >,
    rejectGuardDrift = false,
  ): Promise<boolean> {
    let lastConflict: unknown;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const epoch = await this.#mutationEpoch();
      const plan = await build(epoch);
      if (plan === undefined) return false;
      try {
        await this.#backend.commitIfMatches(
          Object.freeze([this.#epochGuard(epoch), ...plan.guards]),
          Object.freeze([...plan.writes, this.#epochWrite(epoch)]),
        );
        return true;
      } catch (error) {
        if (!isOptimisticConflict(error)) throw error;
        if (rejectGuardDrift)
          for (const guard of plan.guards) {
            if ((await this.#backend.get(guard.store, guard.key)) !== guard.expected) throw error;
          }
        lastConflict = error;
      }
    }
    throw lastConflict instanceof Error ? lastConflict : new Error("Ghost manifest mutation remained contended");
  }

  async #commitRecordingMutation(
    sessionId: string,
    leaseId: string,
    build: (
      epoch: GhostMutationEpoch,
    ) => Promise<{ readonly guards: readonly GhostVaultGuard[]; readonly writes: readonly GhostVaultWrite[] }>,
  ): Promise<void> {
    let lastConflict: unknown;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const epoch = await this.#mutationEpoch();
      const plan = await build(epoch);
      try {
        await this.#backend.commitWhileJournalMatches(
          sessionId,
          leaseId,
          Object.freeze([...plan.writes, this.#epochWrite(epoch)]),
          Object.freeze([this.#epochGuard(epoch), ...plan.guards]),
        );
        return;
      } catch (error) {
        if (!isOptimisticConflict(error)) throw error;
        lastConflict = error;
      }
    }
    throw lastConflict instanceof Error ? lastConflict : new Error("Ghost recording mutation remained contended");
  }

  async putManifest(manifest: TearGhostManifest): Promise<void> {
    const durable = parseGhostCapsuleManifest(manifest);
    await this.#commitMutation(async () => {
      const previous = await this.#backend.get("manifests", durable.id);
      const chunkGuards: GhostVaultGuard[] = [];
      for (const chunk of durable.chunks) {
        const encoded = await this.#backend.get("chunks", chunk.id);
        if (encoded === undefined) throw new RangeError(`chunk is missing before manifest commit: ${chunk.id}`);
        if (stableVerificationHash(encoded) !== chunk.checksum) {
          throw new TypeError(`chunk checksum mismatch before manifest commit: ${chunk.id}`);
        }
        chunkGuards.push({ store: "chunks", key: chunk.id, expected: encoded });
      }
      return Object.freeze({
        guards: Object.freeze([
          { store: "manifests" as const, key: durable.id, ...(previous === undefined ? {} : { expected: previous }) },
          ...chunkGuards,
        ]),
        writes: this.#manifestWrites(durable),
      });
    });
  }

  /**
   * Atomically records a repair child, its immutable parent link, and forensic
   * copies of the bad source bytes.  The parent manifest and source chunks are
   * deliberately not changed: a repair is a new custody record, never a
   * destructive "fix" of the original evidence.
   */
  async createRepairChild(
    parentId: string,
    child: TearGhostManifest,
    corruptChunkIds: readonly string[],
    repairedAt: string,
  ): Promise<void> {
    if (child.lineage?.parentId !== parentId) {
      throw new TypeError("repair child must declare its repaired-from parent");
    }
    await this.#commitMutation(async () => {
      const parentRaw = await this.#backend.get("manifests", parentId);
      if (parentRaw === undefined) throw new RangeError(`manifest does not exist: ${parentId}`);
      const childRaw = await this.#backend.get("manifests", child.id);
      if (childRaw !== undefined) throw new RangeError(`repair child already exists: ${child.id}`);
      // Read the parent and child existence in the same epoch-guarded commit.
      // A parent removal that wins first advances the epoch; a child creation
      // that wins first makes the removal's reference scan fail its epoch CAS.
      const quarantined = await Promise.all(
        corruptChunkIds.map(async (chunkId) =>
          Object.freeze({
            chunkId,
            encoded: await this.#backend.get("chunks", chunkId),
          }),
        ),
      );
      const chunkGuards: GhostVaultGuard[] = [];
      for (const chunk of child.chunks) {
        const encoded = await this.#backend.get("chunks", chunk.id);
        if (encoded === undefined || stableVerificationHash(encoded) !== chunk.checksum)
          throw new RangeError("repair source chunk changed");
        chunkGuards.push({ store: "chunks", key: chunk.id, expected: encoded });
      }
      return Object.freeze({
        guards: Object.freeze([
          { store: "manifests" as const, key: parentId, expected: parentRaw },
          { store: "manifests" as const, key: child.id },
          ...chunkGuards,
          ...quarantined.map(({ chunkId, encoded }) => ({
            store: "chunks" as const,
            key: chunkId,
            ...(encoded === undefined ? {} : { expected: encoded }),
          })),
        ]),
        writes: Object.freeze([
          ...this.#manifestWrites(child),
          {
            store: "lineage" as const,
            key: `repair:${child.id}`,
            value: JSON.stringify({
              format: "tearghost-lineage",
              schemaVersion: 1,
              id: `repair:${child.id}`,
              parentId,
              childId: child.id,
              relation: "repair",
              createdAt: repairedAt,
            }),
          },
          ...quarantined.flatMap(({ chunkId, encoded }) =>
            encoded === undefined
              ? []
              : [
                  {
                    store: "quarantine" as const,
                    key: `repair:${child.id}:${chunkId}`,
                    value: JSON.stringify({
                      parentId,
                      childId: child.id,
                      chunkId,
                      encoded,
                      quarantinedAt: repairedAt,
                    }),
                  },
                ],
          ),
        ]),
      });
    });
  }

  async getManifest(id: string): Promise<TearGhostManifest | undefined> {
    const value = await this.#backend.get("manifests", id);
    return value === undefined ? undefined : parseGhostCapsuleManifest(JSON.parse(value) as unknown);
  }

  /**
   * Prepares one atomic source-capsule removal. A caller may append its own
   * durable tombstone to these writes, so source deletion and its authorization
   * record cannot diverge. Repair children prevent destructive parent removal.
   */
  async prepareCapsuleRemoval(
    id: string,
    releasingOwner?: string,
  ): Promise<{
    readonly guards: readonly GhostVaultGuard[];
    readonly writes: readonly GhostVaultWrite[];
  }> {
    // Capture the mutation epoch before reading any references.  A manifest
    // created during the scan must invalidate this plan rather than becoming
    // invisible to a late epoch read.
    const epoch = await this.#mutationEpoch();
    const manifestRaw = await this.#backend.get("manifests", id);
    if (manifestRaw === undefined) throw new RangeError(`manifest does not exist: ${id}`);
    const manifest = parseGhostCapsuleManifest(JSON.parse(manifestRaw));
    const protectionKey = ghostCapsuleProtectionKey(id);
    const protectionRaw = await this.#backend.get("analysis", protectionKey);
    if (protectionRaw !== undefined) {
      const protection = parseGhostCapsuleProtection(protectionRaw, id);
      if (
        protection.rootIntegrity !== manifest.rootIntegrity ||
        releasingOwner === undefined ||
        protection.owners.length !== 1 ||
        protection.owners[0] !== releasingOwner
      ) {
        throw new RangeError("cannot remove a protected source capsule");
      }
    }
    const manifestKeys = await this.#backend.keys("manifests");
    const manifestEntries = await Promise.all(
      manifestKeys.map(async (candidate) =>
        Object.freeze({
          id: candidate,
          raw: await this.#backend.get("manifests", candidate),
        }),
      ),
    );
    const manifests = manifestEntries.map(({ raw }) =>
      raw === undefined ? undefined : parseGhostCapsuleManifest(JSON.parse(raw)),
    );
    if (
      manifests.some(
        (candidate) => candidate !== undefined && candidate.id !== id && candidate.lineage?.parentId === id,
      )
    ) {
      throw new RangeError("cannot remove a capsule with retained repair children");
    }
    const retainedChunkIds = new Set(
      manifests
        .filter((candidate): candidate is TearGhostManifest => candidate !== undefined && candidate.id !== id)
        .flatMap((candidate) => candidate.chunks.map((chunk) => chunk.id)),
    );
    const assetKeys = (await this.#backend.keys("assets")).filter((key) => key.startsWith(`${id}:`));
    const writes: readonly GhostVaultWrite[] = Object.freeze([
      ...manifest.chunks
        .filter((chunk) => !retainedChunkIds.has(chunk.id))
        .map((chunk) => Object.freeze({ store: "chunks" as const, key: chunk.id })),
      Object.freeze({ store: "manifests" as const, key: id }),
      Object.freeze({ store: "indexes" as const, key: `manifest:${id}` }),
      Object.freeze({ store: "journals" as const, key: id }),
      ...assetKeys.map((key) => Object.freeze({ store: "assets" as const, key })),
      Object.freeze({ store: "analysis" as const, key: protectionKey }),
      this.#epochWrite(epoch),
    ]);
    return Object.freeze({
      guards: Object.freeze([
        { store: "manifests" as const, key: id, expected: manifestRaw },
        {
          store: "analysis" as const,
          key: protectionKey,
          ...(protectionRaw === undefined ? {} : { expected: protectionRaw }),
        },
        this.#epochGuard(epoch),
        ...manifestEntries
          .filter(({ id: candidate }) => candidate !== id)
          .flatMap(({ id: candidate, raw }) =>
            raw === undefined ? [] : [{ store: "manifests" as const, key: candidate, expected: raw }],
          ),
      ]),
      writes,
    });
  }

  async removeCapsule(id: string): Promise<void> {
    let lastConflict: unknown;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const removal = await this.prepareCapsuleRemoval(id);
      try {
        await this.#backend.commitIfMatches(removal.guards, removal.writes);
        return;
      } catch (error) {
        if (!isOptimisticConflict(error)) throw error;
        lastConflict = error;
      }
    }
    throw lastConflict instanceof Error ? lastConflict : new Error("Ghost capsule removal remained contended");
  }

  /**
   * Atomically exposes newly encoded recording chunks and their recovery state in one transaction.
   * Chunks commit in recording order: `chunks` must continue the manifest's sequence with no gap, and the
   * journal names the last of them. Either every chunk of the batch is durable or none is, so a failed batch
   * fails the recording exactly as one failed chunk write does.
   */
  async commitRecordingChunks(
    manifest: TearGhostManifest,
    chunks: readonly GhostSealedChunk[],
    leaseId: string,
  ): Promise<void> {
    const last = chunks.at(-1);
    if (last === undefined) throw new RangeError("a recording commit needs at least one chunk");
    const first = chunks[0]?.entry.sequence ?? 0;
    for (const [offset, { entry, encoded }] of chunks.entries()) {
      if (stableVerificationHash(encoded) !== entry.checksum)
        throw new TypeError(`chunk checksum mismatch before commit: ${entry.id}`);
      if (
        manifest.chunks[entry.sequence]?.id !== entry.id ||
        manifest.chunks[entry.sequence]?.checksum !== entry.checksum
      )
        throw new TypeError(`recording manifest does not include committed chunk: ${entry.id}`);
      if (entry.sequence !== first + offset)
        throw new RangeError(`recording chunks must commit in recording order: ${entry.id}`);
    }
    await this.#commitRecordingMutation(manifest.id, leaseId, async () => {
      const previous = await this.#backend.get("manifests", manifest.id);
      if (previous === undefined) throw new RangeError(`manifest does not exist: ${manifest.id}`);
      const guards: GhostVaultGuard[] = [{ store: "manifests", key: manifest.id, expected: previous }];
      for (const { entry, encoded } of chunks) {
        const previousChunk = await this.#backend.get("chunks", entry.id);
        if (previousChunk !== undefined && previousChunk !== encoded)
          throw new RangeError("recording chunk id conflicts with stored evidence");
        guards.push({
          store: "chunks",
          key: entry.id,
          ...(previousChunk === undefined ? {} : { expected: previousChunk }),
        });
      }
      return Object.freeze({
        guards: Object.freeze(guards),
        writes: Object.freeze([
          ...chunks.map(({ entry, encoded }) => ({ store: "chunks" as const, key: entry.id, value: encoded })),
          {
            store: "journals" as const,
            key: manifest.id,
            value: JSON.stringify({
              sessionId: manifest.id,
              leaseId,
              lastChunkId: last.entry.id,
              committedSequence: last.entry.sequence,
            }),
          },
          ...this.#manifestWrites(manifest),
          ...chunks.flatMap(({ entry, thumbnail }) =>
            thumbnail === undefined
              ? []
              : [
                  {
                    store: "assets" as const,
                    key: `${manifest.id}:thumbnail:${String(entry.sequence)}`,
                    value: thumbnail,
                  },
                ],
          ),
        ]),
      });
    });
  }

  /** Starts a recoverable session without exposing a manifest with no journal. */
  async beginSession(manifest: TearGhostManifest, leaseId: string): Promise<void> {
    if (manifest.status !== "recording") throw new TypeError("only a recording manifest can begin a session");
    await this.#commitMutation(async () => {
      const existingManifest = await this.#backend.get("manifests", manifest.id);
      if (existingManifest !== undefined) throw new RangeError(`recording session already exists: ${manifest.id}`);
      const existingJournal = await this.#backend.get("journals", manifest.id);
      if (existingJournal !== undefined) throw new RangeError(`recording journal already exists: ${manifest.id}`);
      return Object.freeze({
        guards: Object.freeze([
          { store: "manifests" as const, key: manifest.id },
          { store: "journals" as const, key: manifest.id },
        ]),
        writes: Object.freeze([
          ...this.#manifestWrites(manifest),
          {
            store: "journals" as const,
            key: manifest.id,
            value: JSON.stringify({ sessionId: manifest.id, leaseId, committedSequence: -1 }),
          },
        ]),
      });
    });
  }

  async readChunk(entry: TearGhostChunkIndexEntry): Promise<unknown> {
    const encoded = await this.#backend.get("chunks", entry.id);
    if (encoded === undefined) throw new RangeError(`chunk is missing: ${entry.id}`);
    if (stableVerificationHash(encoded) !== entry.checksum) throw new TypeError(`chunk checksum mismatch: ${entry.id}`);
    return decodeGhostChunkPayload(entry.encoding, encoded, entry.uncompressedBytes);
  }

  async completeSession(manifest: TearGhostManifest, leaseId: string): Promise<void> {
    await this.#commitRecordingMutation(manifest.id, leaseId, async () => {
      const previous = await this.#backend.get("manifests", manifest.id);
      if (previous === undefined) throw new RangeError(`manifest does not exist: ${manifest.id}`);
      const sourceGuards = await prepareGhostCapsuleSourceGuards(this.#backend, manifest.id, manifest.rootIntegrity);
      return Object.freeze({
        guards: Object.freeze([{ store: "manifests" as const, key: manifest.id, expected: previous }, ...sourceGuards]),
        writes: Object.freeze([...this.#manifestWrites(manifest), { store: "journals" as const, key: manifest.id }]),
      });
    });
  }

  async recoverIncompleteSessions(): Promise<readonly TearGhostManifest[]> {
    const recovered: TearGhostManifest[] = [];
    for (const id of await this.#backend.keys("journals")) {
      if ((await this.#backend.get("manifests", id)) === undefined) continue;
      const committed = await this.#commitMutation(async () => {
        const manifestRaw = await this.#backend.get("manifests", id);
        const journalRaw = await this.#backend.get("journals", id);
        if (manifestRaw === undefined || journalRaw === undefined) {
          // Completion, removal, or another recovery may win after enumeration
          // (including during a conflict retry). Leave that terminal state alone
          // and continue recovering the remaining sessions.
          return undefined;
        }
        const manifest = parseGhostCapsuleManifest(JSON.parse(manifestRaw));
        let status: "recovered" | "quarantined" = "recovered";
        let reason: string | undefined;
        const chunkGuards: GhostVaultGuard[] = [];
        for (const chunk of manifest.chunks) {
          const raw = await this.#backend.get("chunks", chunk.id);
          chunkGuards.push({ store: "chunks", key: chunk.id, ...(raw === undefined ? {} : { expected: raw }) });
        }
        try {
          if (ghostRootIntegrity(manifest.chunks) !== manifest.rootIntegrity) {
            throw new TypeError("recording manifest root integrity mismatch");
          }
          for (const entry of manifest.chunks) await this.readChunk(entry);
        } catch (error) {
          status = "quarantined";
          reason = error instanceof Error ? error.message : String(error);
        }
        const next = reviseGhostCapsuleManifest(manifest, { status });
        return Object.freeze({
          guards: Object.freeze([
            { store: "manifests" as const, key: id, expected: manifestRaw },
            { store: "journals" as const, key: id, expected: journalRaw },
            ...chunkGuards,
          ]),
          writes: Object.freeze([
            ...this.#manifestWrites(next),
            ...(reason === undefined
              ? []
              : [
                  {
                    store: "quarantine" as const,
                    key: `recovery:${id}`,
                    value: JSON.stringify({
                      capsuleId: id,
                      reason,
                      recoveredAt: new Date().toISOString(),
                    }),
                  },
                ]),
            // A recovery attempt has reached a terminal durable state. Keeping
            // the journal would repeatedly mutate the same manifest on startup.
            { store: "journals" as const, key: id },
          ]),
        });
      });
      if (!committed) continue;
      const recoveredManifest = await this.getManifest(id);
      if (recoveredManifest !== undefined) recovered.push(recoveredManifest);
    }
    return Object.freeze(recovered);
  }

  async exportCapsule(id: string): Promise<string> {
    const manifest = await this.getManifest(id);
    if (manifest === undefined) throw new RangeError(`manifest does not exist: ${id}`);
    const chunks: Record<string, string> = {};
    for (const entry of manifest.chunks) {
      const encoded = await this.#backend.get("chunks", entry.id);
      if (encoded !== undefined) chunks[entry.id] = encoded;
    }
    return JSON.stringify({ manifest, chunks });
  }

  async importCapsule(
    encodedCapsule: string,
    limits: GhostVaultImportLimits = DEFAULT_IMPORT_LIMITS,
  ): Promise<TearGhostManifest> {
    const bytes = new TextEncoder().encode(encodedCapsule).byteLength;
    if (bytes > limits.maxEncodedBytes) throw new RangeError("capsule exceeds encoded byte limit");
    const parsed: unknown = JSON.parse(encodedCapsule);
    if (!isObject(parsed) || !("manifest" in parsed) || !("chunks" in parsed)) {
      throw new TypeError("capsule must contain manifest and chunks");
    }
    const root = parsed as Record<string, unknown>;
    const manifest = parseGhostCapsuleManifest(root.manifest);
    if (!isRecord(root.chunks)) throw new TypeError("capsule chunks must be an object");
    const chunks = root.chunks;
    if (manifest.chunks.length > limits.maxChunks) throw new RangeError("capsule exceeds chunk-count limit");
    if (ghostRootIntegrity(manifest.chunks) !== manifest.rootIntegrity)
      throw new TypeError("capsule root integrity mismatch");
    for (const entry of manifest.chunks) {
      const encoded = chunks[entry.id];
      if (typeof encoded !== "string") throw new TypeError(`capsule chunk is missing: ${entry.id}`);
      if (
        entry.compressedBytes > limits.maxChunkBytes ||
        entry.uncompressedBytes > limits.maxChunkBytes * limits.maxExpansionRatio
      ) {
        throw new RangeError(`capsule chunk exceeds expansion limits: ${entry.id}`);
      }
      const ratio = entry.uncompressedBytes / Math.max(1, entry.compressedBytes);
      if (ratio > limits.maxExpansionRatio)
        throw new RangeError(`capsule chunk expansion ratio is unsafe: ${entry.id}`);
      if (stableVerificationHash(encoded) !== entry.checksum)
        throw new TypeError(`capsule chunk checksum mismatch: ${entry.id}`);
      // Decode before committing untrusted bytes. The declared uncompressed
      // size is also the hard streaming ceiling, so dishonest metadata cannot
      // turn a small compressed import into an unbounded allocation.
      await decodeGhostChunkPayload(entry.encoding, encoded, entry.uncompressedBytes);
    }
    await this.#commitMutation(
      () => prepareForensicGhostImport(this.#backend, manifest, chunks, this.#manifestWrites(manifest)),
      true,
    );
    return manifest;
  }

  async enforceQuota(
    maxBytes: number,
    retention: Readonly<Record<string, "pinned" | "standard" | "temporary">>,
  ): Promise<readonly string[]> {
    const manifests = await this.#backend.keys("manifests");
    const candidates: Readonly<{ id: string; tier: string; createdAt: string }>[] = [];
    const chunkBytes = new Map<string, number>();
    for (const id of manifests) {
      const manifest = await this.getManifest(id);
      if (manifest === undefined) continue;
      for (const chunk of manifest.chunks) {
        if (!chunkBytes.has(chunk.id)) chunkBytes.set(chunk.id, chunk.compressedBytes);
      }
      candidates.push({ id, tier: retention[id] ?? "standard", createdAt: manifest.createdAt });
    }
    let total = [...chunkBytes.values()].reduce((sum, bytes) => sum + bytes, 0);
    const removed: string[] = [];
    for (const candidate of [...candidates].sort(
      (left, right) =>
        (left.tier === "temporary" ? 0 : left.tier === "standard" ? 1 : 2) -
          (right.tier === "temporary" ? 0 : right.tier === "standard" ? 1 : 2) ||
        left.createdAt.localeCompare(right.createdAt),
    )) {
      if (total <= maxBytes) break;
      if (candidate.tier === "pinned") continue;
      if ((await this.#backend.get("analysis", ghostCapsuleProtectionKey(candidate.id))) !== undefined) continue;
      let removedBytes = 0;
      let committed = false;
      for (let attempt = 0; attempt < 8 && !committed; attempt += 1) {
        try {
          const removal = await this.prepareCapsuleRemoval(candidate.id);
          const reclaimed = removal.writes
            .filter((write) => write.store === "chunks")
            .reduce((sum, write) => sum + (chunkBytes.get(write.key) ?? 0), 0);
          await this.#backend.commitIfMatches(removal.guards, removal.writes);
          removedBytes = reclaimed;
          committed = true;
        } catch (error) {
          if (isOptimisticConflict(error)) continue;
          // A protection record acquired after the initial candidate scan is
          // an authorization race, not a candidate that merely disappeared.
          // Surface it so the caller cannot report quota maintenance as a
          // successful no-op after accepted custody has won the fence.
          if (error instanceof RangeError && error.message.includes("protected source capsule")) throw error;
          if (error instanceof RangeError) break;
          throw error;
        }
      }
      if (!committed) continue;
      total -= removedBytes;
      removed.push(candidate.id);
    }
    return Object.freeze(removed);
  }
}

/** One encoded chunk waiting to be committed: its index entry, its encoded bytes and an optional thumbnail. */
export interface GhostSealedChunk {
  readonly entry: TearGhostChunkIndexEntry;
  readonly encoded: string;
  readonly thumbnail?: string;
}

export function capsuleDebugJson(manifest: TearGhostManifest): string {
  return JSON.stringify(manifest, null, 2);
}

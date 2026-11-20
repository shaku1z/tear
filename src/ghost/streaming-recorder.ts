import { stableVerificationHash } from "../domain/hash";
import { createGhostCapsuleManifestV2, type TearGhostManifest } from "./capsule-contract";
import { ghostRootIntegrity } from "./capsule-import-plan";
import type { GhostLocalVault, GhostSealedChunk } from "./capsule-vault";
import {
  createInlineGhostEncoderWorker,
  type GhostChunkKind,
  type GhostEncoderWorkerPort,
  type TearGhostChunkIndexEntry,
} from "./capsule-vault-backend";
import type { GhostRecordingProfileId } from "./recording-profiles";

/**
 * Writes one recording into the local vault as it is played: entries become chunks (one replay track each),
 * and chunks commit in recording order through `GhostLocalVault.commitRecordingChunks`.
 */
export interface GhostRecorderEntry {
  readonly kind: GhostChunkKind;
  readonly tick: number;
  readonly value: unknown;
}

export interface GhostRecorderOptions {
  readonly sessionId: string;
  readonly createdAt: string;
  readonly chunkEntries: number;
  readonly maxPendingWrites: number;
  readonly vault: GhostLocalVault;
  readonly worker?: GhostEncoderWorkerPort;
  readonly recordingProfile?: GhostRecordingProfileId;
  readonly provenance?: Readonly<Record<string, unknown>>;
  readonly leaseId?: string;
}

export class GhostStreamingRecorder {
  readonly #options: GhostRecorderOptions;
  readonly #leaseId: string;
  readonly #worker: GhostEncoderWorkerPort;
  readonly #buffer: GhostRecorderEntry[] = [];
  readonly #chunks: TearGhostChunkIndexEntry[] = [];
  readonly #downgrades: string[] = [];
  #pendingWrites = 0;
  #maxBufferedEntries = 0;
  #presentation: "full" | "reduced" | "dropped" = "full";

  constructor(options: GhostRecorderOptions) {
    if (!Number.isSafeInteger(options.chunkEntries) || options.chunkEntries < 1)
      throw new RangeError("chunkEntries must be positive");
    this.#options = options;
    this.#leaseId =
      options.leaseId ?? stableVerificationHash({ sessionId: options.sessionId, createdAt: options.createdAt });
    this.#worker = options.worker ?? createInlineGhostEncoderWorker();
  }

  get maxBufferedEntries(): number {
    return this.#maxBufferedEntries;
  }
  get pendingWrites(): number {
    return this.#pendingWrites;
  }

  async start(): Promise<void> {
    const manifest = this.#manifest("recording");
    await this.#options.vault.beginSession(manifest, this.#leaseId);
  }

  async append(entry: GhostRecorderEntry): Promise<void> {
    await this.appendAll([entry]);
  }

  /**
   * Appends entries in order and commits every chunk they complete in one transaction, so a caller that hands
   * over everything waiting is limited by one write per call, not one per chunk. The chunks are the same ones
   * one-by-one appends would produce: the same boundaries, sequence numbers and bytes.
   */
  async appendAll(entries: readonly GhostRecorderEntry[]): Promise<void> {
    const sealed: GhostSealedChunk[] = [];
    for (const entry of entries) {
      if (this.#pendingWrites >= this.#options.maxPendingWrites && entry.kind === "presentation") {
        this.#presentation = "dropped";
        if (!this.#downgrades.includes("presentation dropped under encoder backpressure")) {
          this.#downgrades.push("presentation dropped under encoder backpressure");
        }
        continue;
      }
      // Each chunk is one named replay track. Besides making random access
      // explicit, this prevents a terminal result or keyframe from being hidden
      // inside an undifferentiated events chunk.
      if (this.#buffer.length > 0 && this.#buffer[0]?.kind !== entry.kind) sealed.push(await this.#seal(sealed));
      this.#buffer.push(Object.freeze(structuredClone(entry)));
      this.#maxBufferedEntries = Math.max(this.#maxBufferedEntries, this.#buffer.length);
      if (this.#buffer.length >= this.#options.chunkEntries) sealed.push(await this.#seal(sealed));
    }
    await this.#commit(sealed);
  }

  async flush(): Promise<void> {
    const sealed: GhostSealedChunk[] = [];
    while (this.#buffer.length > 0) sealed.push(await this.#seal(sealed));
    await this.#commit(sealed);
  }

  /** Encodes the next chunk from the buffer; `sealed` holds the chunks of this call that precede it. */
  async #seal(sealed: readonly GhostSealedChunk[]): Promise<GhostSealedChunk> {
    const entries = this.#buffer.splice(0, this.#options.chunkEntries);
    const sequence = this.#chunks.length + sealed.length;
    this.#pendingWrites += 1;
    try {
      const encoded = await this.#worker.encode(
        entries,
        entries.some((entry) => entry.kind === "presentation"),
      );
      const kinds = new Set(entries.map((entry) => entry.kind));
      const kind = kinds.size === 1 ? (entries[0]?.kind ?? "events") : "events";
      const index: TearGhostChunkIndexEntry = Object.freeze({
        id: `${this.#options.sessionId}:chunk:${String(sequence)}`,
        kind,
        sequence,
        fromTick: Math.min(...entries.map((entry) => entry.tick)),
        toTick: Math.max(...entries.map((entry) => entry.tick)),
        encoding: encoded.encoding,
        compressedBytes: encoded.compressedBytes,
        uncompressedBytes: encoded.uncompressedBytes,
        checksum: encoded.checksum,
      });
      return Object.freeze({
        entry: index,
        encoded: encoded.encoded,
        ...(encoded.thumbnail === undefined ? {} : { thumbnail: encoded.thumbnail }),
      });
    } finally {
      this.#pendingWrites -= 1;
    }
  }

  /** Commits sealed chunks in recording order in one transaction; none is listed as committed unless all are. */
  async #commit(sealed: readonly GhostSealedChunk[]): Promise<void> {
    if (sealed.length === 0) return;
    const nextChunks = Object.freeze([...this.#chunks, ...sealed.map(({ entry }) => entry)]);
    this.#pendingWrites += 1;
    try {
      await this.#options.vault.commitRecordingChunks(
        this.#manifest("recording", undefined, nextChunks),
        sealed,
        this.#leaseId,
      );
    } finally {
      this.#pendingWrites -= 1;
    }
    this.#chunks.push(...sealed.map(({ entry }) => entry));
  }

  async finalize(completedAt: string): Promise<TearGhostManifest> {
    await this.flush();
    const manifest = this.#manifest("complete", completedAt);
    await this.#options.vault.completeSession(manifest, this.#leaseId);
    return manifest;
  }

  #manifest(
    status: TearGhostManifest["status"],
    completedAt?: string,
    chunkOverride?: readonly TearGhostChunkIndexEntry[],
  ): TearGhostManifest {
    const chunks = Object.freeze([...(chunkOverride ?? this.#chunks)]);
    return createGhostCapsuleManifestV2({
      id: this.#options.sessionId,
      status,
      createdAt: this.#options.createdAt,
      recordingProfile: this.#options.recordingProfile ?? "forensic-qa",
      ...(this.#options.provenance === undefined
        ? {}
        : { provenance: Object.freeze(structuredClone(this.#options.provenance)) }),
      ...(completedAt === undefined ? {} : { completedAt }),
      chunks,
      rootIntegrity: ghostRootIntegrity(chunks),
      fidelity: Object.freeze({
        presentation: this.#presentation,
        downgrades: Object.freeze([...this.#downgrades]),
      }),
    });
  }
}

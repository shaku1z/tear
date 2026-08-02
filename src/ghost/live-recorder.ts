import {
  createBrowserGhostEncoderWorker,
  GhostLocalVault,
  GhostStreamingRecorder,
  type GhostChunkKind,
  type GhostEncoderWorkerPort,
  type TearGhostManifest,
  type GhostVaultWrite,
} from "./capsule-vault";
import { createIndexedDbGhostVaultBackend } from "./indexeddb-vault-backend";
import { createLiveGhostBootstrapEvent } from "./live-causal-events";
import { ghostRecordingProfile, type GhostRecordingProfileId } from "./recording-profiles";

export interface GhostLiveRecorderStart {
  readonly sessionId: string;
  readonly createdAt: string;
  readonly provenance: Readonly<Record<string, unknown>>;
}

export interface GhostLiveRecorderOptions {
  readonly createVault: () => Promise<GhostLocalVault>;
  readonly now: () => string;
  readonly chunkEntries?: number;
  readonly maxPendingWrites?: number;
  /** Maximum entries held before/during an asynchronous durable flush. */
  readonly maxStagingEntries?: number;
  readonly worker?: GhostEncoderWorkerPort;
  readonly recordingProfile?: GhostRecordingProfileId;
}

/**
 * Optional construction hooks for a browser-side recorder. Production callers
 * use the defaults; the commit hook exists so browser evidence can exercise a
 * real IndexedDB Vault's asynchronous fault path without changing gameplay.
 */
export interface BrowserGhostLiveRecorderOptions {
  readonly chunkEntries?: number;
  readonly maxPendingWrites?: number;
  readonly beforeCommit?: (operations: readonly GhostVaultWrite[]) => void | Promise<void>;
}

interface LiveGhostCaptureSession {
  readonly id: string;
  readonly sequence: number;
  readonly input: GhostLiveRecorderStart;
  recorder: GhostStreamingRecorder | null;
  opening: Promise<void> | null;
  flushing: Promise<void> | null;
  pending: Readonly<{ kind: GhostChunkKind; tick: number; value: unknown }>[];
  lastRecordedTick: number;
  failure: string | null;
}

/**
 * Production-side bridge for the first V3 capture spine. It deliberately
 * observes a run without owning input, simulation, or Ghost 2 playback.
 * Entries received before IndexedDB opens remain ordered in a bounded startup
 * queue, then stream through the normal capsule recorder.
 */
export class GhostLiveRecorder {
  readonly #options: Required<Pick<GhostLiveRecorderOptions, "now">>
    & Readonly<Pick<GhostLiveRecorderOptions, "createVault">>
    & Readonly<{ chunkEntries: number; maxPendingWrites: number; maxStagingEntries: number; keyframeIntervalTicks: number; worker?: GhostEncoderWorkerPort; recordingProfile: GhostRecordingProfileId }>;
  #activeSession: LiveGhostCaptureSession | null = null;
  #failure: string | null = null;
  #lastManifest: TearGhostManifest | null = null;
  #vaultPromise: Promise<GhostLocalVault> | null = null;
  #nextSequence = 0;
  #lastCompletedSequence = 0;
  #lastFailureSequence = 0;

  constructor(options: GhostLiveRecorderOptions) {
    const profile = ghostRecordingProfile(options.recordingProfile ?? "coaching");
    const maxStagingEntries = options.maxStagingEntries
      ?? Math.max(profile.chunkEntries, profile.chunkEntries * profile.maxPendingWrites * 2);
    if (!Number.isSafeInteger(maxStagingEntries) || maxStagingEntries < 1) {
      throw new RangeError("Ghost V3 staging capacity must be a positive safe integer");
    }
    this.#options = Object.freeze({
      createVault: options.createVault,
      now: options.now,
      chunkEntries: options.chunkEntries ?? profile.chunkEntries,
      maxPendingWrites: options.maxPendingWrites ?? profile.maxPendingWrites,
      maxStagingEntries,
      keyframeIntervalTicks: profile.keyframeIntervalTicks,
      recordingProfile: profile.id as GhostRecordingProfileId,
      ...(options.worker === undefined ? {} : { worker: options.worker }),
    });
  }

  get active(): boolean { return this.#activeSession !== null; }
  get keyframeIntervalTicks(): number { return this.#options.keyframeIntervalTicks; }
  get maxStagingEntries(): number { return this.#options.maxStagingEntries; }
  get failure(): string | null { return this.#failure; }
  get lastManifest(): TearGhostManifest | null { return this.#lastManifest; }

  start(input: GhostLiveRecorderStart): void {
    if (this.active) throw new Error("Ghost V3 recorder session is already active");
    const session: LiveGhostCaptureSession = {
      id: input.sessionId,
      sequence: ++this.#nextSequence,
      input,
      recorder: null,
      opening: null,
      flushing: null,
      pending: [],
      lastRecordedTick: 0,
      failure: null,
    };
    this.#activeSession = session;
    this.#failure = null;
    this.#enqueue(session, "events", 0, createLiveGhostBootstrapEvent(input.sessionId, input.provenance));
    session.opening = this.#open(session);
  }

  record(kind: GhostChunkKind, tick: number, value: unknown): void {
    const session = this.#activeSession;
    if (session === null || this.#hasFailed(session)) return;
    this.#enqueue(session, kind, tick, value);
  }

  #enqueue(session: LiveGhostCaptureSession, kind: GhostChunkKind, tick: number, value: unknown): void {
    if (session.failure !== null) return;
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("Ghost V3 entries require a non-negative integer tick");
    if (session.pending.length >= this.#options.maxStagingEntries) {
      this.#fail(session, new Error(`Ghost V3 staging capacity exceeded (${String(this.#options.maxStagingEntries)} entries)`));
      return;
    }
    session.lastRecordedTick = Math.max(session.lastRecordedTick, tick);
    session.pending.push(Object.freeze({ kind, tick, value: structuredClone(value) }));
    void this.#flush(session);
  }

  async finish(result: Readonly<Record<string, unknown>> = {}): Promise<TearGhostManifest | null> {
    const session = this.#activeSession;
    if (session === null) return null;
    // Relinquish live ownership synchronously. Ghost 2 can start a replacement
    // run during the same call stack that stopped this one; the old capsule may
    // finish its IndexedDB writes independently without stealing new-run input.
    this.#activeSession = null;
    try {
      this.#enqueue(session, "results", session.lastRecordedTick, result);
      await session.opening;
      if (this.#hasFailed(session)) return null;
      await this.#flush(session);
      if (this.#hasFailed(session)) return null;
      let manifest: TearGhostManifest | null = null;
      try {
        manifest = session.recorder === null ? null : await session.recorder.finalize(this.#options.now());
      } catch (error) {
        this.#fail(session, error);
        return null;
      }
      if (manifest !== null && session.sequence >= this.#lastCompletedSequence) {
        this.#lastCompletedSequence = session.sequence;
        this.#lastManifest = manifest;
      }
      return manifest;
    } finally {
      session.pending = [];
      this.#surfaceFailure(session);
    }
  }

  async #open(session: LiveGhostCaptureSession): Promise<void> {
    try {
      const recorder = new GhostStreamingRecorder({
        sessionId: session.input.sessionId,
        createdAt: session.input.createdAt,
        chunkEntries: this.#options.chunkEntries,
        maxPendingWrites: this.#options.maxPendingWrites,
        vault: await this.#openRecoveredVault(),
        ...(this.#options.worker === undefined ? {} : { worker: this.#options.worker }),
        recordingProfile: this.#options.recordingProfile,
        provenance: session.input.provenance,
      });
      await recorder.start();
      session.recorder = recorder;
      await this.#flush(session);
    } catch (error) {
      this.#fail(session, error);
    }
  }

  /** A new live capture never writes ahead of a recoverable prior browser session. */
  async #openRecoveredVault(): Promise<GhostLocalVault> {
    if (this.#vaultPromise === null) {
      this.#vaultPromise = this.#options.createVault().then(async (vault) => {
        await vault.recoverIncompleteSessions();
        return vault;
      });
    }
    return this.#vaultPromise;
  }

  #isNewestSession(session: LiveGhostCaptureSession): boolean {
    return this.#activeSession === null || session.sequence >= this.#activeSession.sequence;
  }

  async #flush(session: LiveGhostCaptureSession): Promise<void> {
    if (session.recorder === null || session.failure !== null) return;
    if (session.flushing !== null) return session.flushing;
    session.flushing = this.#flushQueued(session).catch((error: unknown) => { this.#fail(session, error); });
    try {
      await session.flushing;
    } finally {
      session.flushing = null;
    }
    if (!this.#hasFailed(session) && session.pending.length > 0) await this.#flush(session);
  }

  #hasFailed(session: LiveGhostCaptureSession): boolean {
    return session.failure !== null;
  }

  async #flushQueued(session: LiveGhostCaptureSession): Promise<void> {
    const recorder = session.recorder;
    if (recorder === null) return;
    while (session.pending.length > 0) {
      const entry = session.pending.shift();
      if (entry !== undefined) await recorder.append(entry);
    }
  }

  #fail(session: LiveGhostCaptureSession, error: unknown): void {
    if (session.failure !== null) return;
    session.failure = error instanceof Error ? error.message : String(error);
    this.#surfaceFailure(session);
    // The recording journal remains durable and recoverable/quarantinable on
    // the next open, but no later entry may make a failed capture look whole.
    session.pending = [];
  }

  #surfaceFailure(session: LiveGhostCaptureSession): void {
    if (session.failure === null || session.sequence < this.#lastFailureSequence
      || session.sequence < this.#lastCompletedSequence || !this.#isNewestSession(session)) return;
    this.#lastFailureSequence = session.sequence;
    this.#failure = `session ${session.id}: ${session.failure}`;
  }

}

/** Browser construction remains explicit so unsupported storage never affects play. */
export function createBrowserGhostLiveRecorder(
  factory: IDBFactory | undefined,
  options: BrowserGhostLiveRecorderOptions = {},
): GhostLiveRecorder | null {
  if (factory === undefined) return null;
  const worker = createBrowserGhostEncoderWorker();
  const beforeCommit = options.beforeCommit;
  return new GhostLiveRecorder({
    createVault: async () => {
      const backend = await createIndexedDbGhostVaultBackend(factory);
      if (beforeCommit === undefined) return new GhostLocalVault(backend);
      return new GhostLocalVault(Object.freeze({
        ...backend,
        commit: async (operations: readonly GhostVaultWrite[]): Promise<void> => {
          await beforeCommit(operations);
          await backend.commit(operations);
        },
        commitWhileJournalMatches: async (sessionId: string, leaseId: string, operations: readonly GhostVaultWrite[]): Promise<void> => {
          await beforeCommit(operations);
          await backend.commitWhileJournalMatches(sessionId, leaseId, operations);
        },
      }));
    },
    now: () => new Date().toISOString(),
    ...(options.chunkEntries === undefined ? {} : { chunkEntries: options.chunkEntries }),
    ...(options.maxPendingWrites === undefined ? {} : { maxPendingWrites: options.maxPendingWrites }),
    ...(worker === undefined ? {} : { worker }),
  });
}

import { readGhostForkOrigin } from "./fork-origin";
import { readGhostFinaleCompanion } from "./finale-companion";
import {
  createBrowserGhostEncoderWorker,
  GhostLocalVault,
  type GhostChunkKind,
  type GhostEncoderWorkerPort,
  type TearGhostManifest,
  type GhostVaultWrite,
  type GhostVaultGuard,
} from "./capsule-vault";
import { createIndexedDbGhostVaultBackend } from "./indexeddb-vault-backend";
import { GhostStreamingRecorder } from "./streaming-recorder";
import { createLiveGhostBootstrapEvent, createLiveGhostForkBootstrapEvent } from "./live-causal-events";
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
  /** Local post-finalize observer. Failures are isolated from the completed capture. */
  readonly onFinalized?: (manifest: TearGhostManifest, vault: GhostLocalVault) => void | Promise<void>;
}

/**
 * Optional construction hooks for a browser-side recorder. Production callers
 * use the defaults; the commit hook exists so browser evidence can exercise a
 * real IndexedDB Vault's asynchronous fault path without changing gameplay.
 */
export interface BrowserGhostLiveRecorderOptions {
  readonly chunkEntries?: number;
  readonly maxPendingWrites?: number;
  /** Test-build evidence may select an existing capture profile; production never reads this option. */
  readonly recordingProfile?: GhostRecordingProfileId;
  readonly beforeCommit?: (operations: readonly GhostVaultWrite[]) => void | Promise<void>;
  readonly onFinalized?: GhostLiveRecorderOptions["onFinalized"];
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
  readonly #options: Required<Pick<GhostLiveRecorderOptions, "now">> &
    Readonly<Pick<GhostLiveRecorderOptions, "createVault">> &
    Readonly<{
      chunkEntries: number;
      maxPendingWrites: number;
      maxStagingEntries: number;
      keyframeIntervalTicks: number;
      worker?: GhostEncoderWorkerPort;
      recordingProfile: GhostRecordingProfileId;
      onFinalized?: GhostLiveRecorderOptions["onFinalized"];
    }>;
  #activeSession: LiveGhostCaptureSession | null = null;
  #failure: string | null = null;
  #lastManifest: TearGhostManifest | null = null;
  #vaultPromise: Promise<GhostLocalVault> | null = null;
  #nextSequence = 0;
  #lastCompletedSequence = 0;
  #lastFailureSequence = 0;
  readonly #finalizing = new Map<LiveGhostCaptureSession, Promise<TearGhostManifest | null>>();

  constructor(options: GhostLiveRecorderOptions) {
    const profile = ghostRecordingProfile(options.recordingProfile ?? "coaching");
    const maxStagingEntries =
      options.maxStagingEntries ?? Math.max(profile.chunkEntries, profile.chunkEntries * profile.maxPendingWrites * 2);
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
      ...(options.onFinalized === undefined ? {} : { onFinalized: options.onFinalized }),
      ...(options.worker === undefined ? {} : { worker: options.worker }),
    });
  }

  get active(): boolean {
    return this.#activeSession !== null;
  }
  get activeSessionId(): string {
    if (this.#activeSession === null) throw new Error("Ghost V3 recorder has no active session");
    return this.#activeSession.id;
  }
  get keyframeIntervalTicks(): number {
    return this.#options.keyframeIntervalTicks;
  }
  get maxStagingEntries(): number {
    return this.#options.maxStagingEntries;
  }
  get failure(): string | null {
    return this.#failure;
  }
  get lastManifest(): TearGhostManifest | null {
    return this.#lastManifest;
  }

  /** Retain the interrupted journal/bytes; a replacement cannot turn it into a completed capture. */
  interrupt(reason: string): void {
    const session = this.#activeSession;
    this.#activeSession = null;
    if (session !== null) this.#fail(session, new Error(reason));
  }

  start(input: GhostLiveRecorderStart): void {
    if (this.active) throw new Error("Ghost V3 recorder session is already active");
    const origin = readGhostForkOrigin(input.provenance);
    const finale = readGhostFinaleCompanion(input.provenance);
    const session: LiveGhostCaptureSession = {
      id: input.sessionId,
      sequence: ++this.#nextSequence,
      input,
      recorder: null,
      opening: null,
      flushing: null,
      pending: [],
      lastRecordedTick: finale?.origin.tick ?? origin?.checkpoint.tick ?? 0,
      failure: null,
    };
    this.#activeSession = session;
    this.#failure = null;
    const bootstrap =
      finale === undefined
        ? origin === undefined
          ? createLiveGhostBootstrapEvent(input.sessionId, input.provenance)
          : createLiveGhostForkBootstrapEvent(input.sessionId, input.provenance)
        : {
            format: "tear-contract",
            kind: "event",
            schemaVersion: 1,
            type: "system.checkpoint",
            tick: finale.origin.tick,
            sequence: 0,
            source: "engine",
            phase: "post-simulation-commit",
            id: `finale-open-${input.sessionId}`,
            payload: { boundary: "v3-finale-sidecar-opened", provenance: input.provenance },
          };
    this.#enqueue(session, "events", session.lastRecordedTick, bootstrap);
    session.opening = this.#open(session);
  }

  record(kind: GhostChunkKind, tick: number, value: unknown): void {
    const session = this.#activeSession;
    if (session === null || this.#hasFailed(session)) return;
    this.#enqueue(session, kind, tick, value);
  }

  #enqueue(session: LiveGhostCaptureSession, kind: GhostChunkKind, tick: number, value: unknown): void {
    if (session.failure !== null) return;
    if (!Number.isSafeInteger(tick) || tick < 0)
      throw new RangeError("Ghost V3 entries require a non-negative integer tick");
    if (session.pending.length >= this.#options.maxStagingEntries) {
      this.#fail(
        session,
        new Error(`Ghost V3 staging capacity exceeded (${String(this.#options.maxStagingEntries)} entries)`),
      );
      return;
    }
    session.lastRecordedTick = Math.max(session.lastRecordedTick, tick);
    session.pending.push(Object.freeze({ kind, tick, value: structuredClone(value) }));
    void this.#flush(session);
  }

  /** Wait for this call's accepted work, without sealing a partial encoder chunk or starting/finalizing a session. */
  async drain(): Promise<void> {
    const session = this.#activeSession;
    const finalizing =
      session === null ? [...this.#finalizing].filter(([owner]) => owner.sequence === this.#nextSequence) : [];
    if (session === null && finalizing.length === 0 && this.#failure !== null) throw new Error(this.#failure);
    if (session !== null) {
      await session.opening;
      await this.#flush(session);
      if (session.failure !== null) throw new Error(`session ${session.id}: ${session.failure}`);
    }
    for (const [finishing, promise] of finalizing) {
      await promise;
      if (finishing.failure !== null) throw new Error(`session ${finishing.id}: ${finishing.failure}`);
    }
  }

  finish(
    result: Readonly<Record<string, unknown>> = {},
    tail?: Promise<readonly Readonly<{ kind: GhostChunkKind; tick: number; value: unknown }>[]>,
  ): Promise<TearGhostManifest | null> {
    const session = this.#activeSession;
    if (session === null) return Promise.resolve(null);
    // Relinquish live ownership synchronously; a replacement may start while
    // this original session's already-started finalization settles independently.
    this.#activeSession = null;
    const finalizing = this.#finish(session, result, tail);
    this.#finalizing.set(session, finalizing);
    void finalizing.then(
      () => {
        this.#finalizing.delete(session);
      },
      () => {
        this.#finalizing.delete(session);
      },
    );
    return finalizing;
  }

  async #finish(
    session: LiveGhostCaptureSession,
    result: Readonly<Record<string, unknown>>,
    tail?: Promise<readonly Readonly<{ kind: GhostChunkKind; tick: number; value: unknown }>[]>,
  ): Promise<TearGhostManifest | null> {
    try {
      for (const entry of (await tail) ?? []) this.#enqueue(session, entry.kind, entry.tick, entry.value);
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
        try {
          await this.#options.onFinalized?.(manifest, await this.#openRecoveredVault());
        } catch (error) {
          console.warn("Ghost V3 finalized observer failed; capture remains complete", error);
        }
      }
      return manifest;
    } catch (error) {
      this.#fail(session, error);
      return null;
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

  /**
   * Resolves once every accepted entry is written. One write loop owns the queue, and `flushing` is cleared
   * in the same step that finds the queue empty, so a caller is never handed a loop that has already ended.
   */
  async #flush(session: LiveGhostCaptureSession): Promise<void> {
    if (session.recorder === null || session.failure !== null) return;
    if (session.flushing === null) {
      if (session.pending.length === 0) return;
      session.flushing = this.#flushQueued(session);
    }
    await session.flushing;
  }

  #hasFailed(session: LiveGhostCaptureSession): boolean {
    return session.failure !== null;
  }

  async #flushQueued(session: LiveGhostCaptureSession): Promise<void> {
    try {
      // Reaching the first append takes a turn, so `flushing` is always assigned before it is cleared.
      await Promise.resolve();
      const recorder = session.recorder;
      // Everything waiting goes to the recorder at once, so one write commits every chunk it completes.
      // Entries that arrive during that write wait for the next round; the order never changes.
      while (recorder !== null && session.pending.length > 0) await recorder.appendAll(session.pending.splice(0));
    } catch (error) {
      this.#fail(session, error);
    } finally {
      session.flushing = null;
    }
  }

  #fail(session: LiveGhostCaptureSession, error: unknown): void {
    if (session.failure !== null) return;
    // Browser storage errors such as QuotaExceededError commonly carry an
    // empty message. Preserve their platform-defined name so a real durable
    // failure remains actionable instead of surfacing as a blank diagnostic.
    session.failure = error instanceof Error ? error.message || error.name : String(error);
    this.#surfaceFailure(session);
    // The recording journal remains durable and recoverable/quarantinable on
    // the next open, but no later entry may make a failed capture look whole.
    session.pending = [];
  }

  #surfaceFailure(session: LiveGhostCaptureSession): void {
    if (
      session.failure === null ||
      session.sequence < this.#lastFailureSequence ||
      session.sequence < this.#lastCompletedSequence ||
      !this.#isNewestSession(session)
    )
      return;
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
      return new GhostLocalVault(
        Object.freeze({
          ...backend,
          commit: async (operations: readonly GhostVaultWrite[]): Promise<void> => {
            await beforeCommit(operations);
            await backend.commit(operations);
          },
          commitIfMatches: async (
            guards: readonly GhostVaultGuard[],
            operations: readonly GhostVaultWrite[],
          ): Promise<void> => {
            await beforeCommit(operations);
            await backend.commitIfMatches(guards, operations);
          },
          commitWhileJournalMatches: async (
            sessionId: string,
            leaseId: string,
            operations: readonly GhostVaultWrite[],
            guards?: readonly GhostVaultGuard[],
          ): Promise<void> => {
            await beforeCommit(operations);
            await backend.commitWhileJournalMatches(sessionId, leaseId, operations, guards);
          },
        }),
      );
    },
    now: () => new Date().toISOString(),
    ...(options.chunkEntries === undefined ? {} : { chunkEntries: options.chunkEntries }),
    ...(options.maxPendingWrites === undefined ? {} : { maxPendingWrites: options.maxPendingWrites }),
    ...(options.recordingProfile === undefined ? {} : { recordingProfile: options.recordingProfile }),
    ...(options.onFinalized === undefined ? {} : { onFinalized: options.onFinalized }),
    ...(worker === undefined ? {} : { worker }),
  });
}

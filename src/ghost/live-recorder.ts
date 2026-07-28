import {
  createBrowserGhostEncoderWorker,
  createIndexedDbGhostVaultBackend,
  GhostLocalVault,
  GhostStreamingRecorder,
  type GhostChunkKind,
  type GhostEncoderWorkerPort,
  type TearGhostManifest,
} from "./capsule-vault";
import { GhostCapsuleReader, type GhostReadCapsule } from "./capsule-reader";
import { mapGhostCapsuleToReplayEnvelope, type GhostCapsuleReplayMapping } from "./capsule-replay-envelope";
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
  readonly worker?: GhostEncoderWorkerPort;
  readonly recordingProfile?: GhostRecordingProfileId;
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
    & Readonly<{ chunkEntries: number; maxPendingWrites: number; keyframeIntervalTicks: number; worker?: GhostEncoderWorkerPort; recordingProfile: GhostRecordingProfileId }>;
  #activeSession: LiveGhostCaptureSession | null = null;
  #failure: string | null = null;
  #lastManifest: TearGhostManifest | null = null;
  #vaultPromise: Promise<GhostLocalVault> | null = null;
  #nextSequence = 0;
  #lastCompletedSequence = 0;
  #lastFailureSequence = 0;

  constructor(options: GhostLiveRecorderOptions) {
    const profile = ghostRecordingProfile(options.recordingProfile ?? "coaching");
    this.#options = Object.freeze({
      createVault: options.createVault,
      now: options.now,
      chunkEntries: options.chunkEntries ?? profile.chunkEntries,
      maxPendingWrites: options.maxPendingWrites ?? profile.maxPendingWrites,
      keyframeIntervalTicks: profile.keyframeIntervalTicks,
      recordingProfile: profile.id as GhostRecordingProfileId,
      ...(options.worker === undefined ? {} : { worker: options.worker }),
    });
  }

  get active(): boolean { return this.#activeSession !== null; }
  get keyframeIntervalTicks(): number { return this.#options.keyframeIntervalTicks; }
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
    if (session === null) return;
    this.#enqueue(session, kind, tick, value);
  }

  #enqueue(session: LiveGhostCaptureSession, kind: GhostChunkKind, tick: number, value: unknown): void {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("Ghost V3 entries require a non-negative integer tick");
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
      await this.#flush(session);
      const manifest = session.recorder === null ? null : await session.recorder.finalize(this.#options.now());
      if (manifest !== null && session.sequence >= this.#lastCompletedSequence) {
        this.#lastCompletedSequence = session.sequence;
        this.#lastManifest = manifest;
      }
      return manifest;
    } finally {
      session.pending = [];
      if (session.failure !== null && session.sequence >= this.#lastFailureSequence
        && session.sequence >= this.#lastCompletedSequence
        && this.#isNewestSession(session)) {
        this.#lastFailureSequence = session.sequence;
        this.#failure = `session ${session.id}: ${session.failure}`;
      }
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
      });
      await recorder.start();
      session.recorder = recorder;
      await this.#flush(session);
    } catch (error) {
      session.failure = error instanceof Error ? error.message : String(error);
      session.pending = [];
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
    if (session.recorder === null) return;
    if (session.flushing !== null) return session.flushing;
    session.flushing = this.#flushQueued(session);
    try {
      await session.flushing;
    } finally {
      session.flushing = null;
    }
    if (session.pending.length > 0) await this.#flush(session);
  }

  async #flushQueued(session: LiveGhostCaptureSession): Promise<void> {
    const recorder = session.recorder;
    if (recorder === null) return;
    while (session.pending.length > 0) {
      const entry = session.pending.shift();
      if (entry !== undefined) await recorder.append(entry);
    }
  }

}

/** Browser construction remains explicit so unsupported storage never affects play. */
export function createBrowserGhostLiveRecorder(factory: IDBFactory | undefined): GhostLiveRecorder | null {
  if (factory === undefined) return null;
  const worker = createBrowserGhostEncoderWorker();
  return new GhostLiveRecorder({
    createVault: async () => new GhostLocalVault(await createIndexedDbGhostVaultBackend(factory)),
    now: () => new Date().toISOString(),
    ...(worker === undefined ? {} : { worker }),
  });
}

/** Reopens browser storage instead of trusting an in-memory recorder reference. */
export async function listBrowserGhostCapsuleManifests(factory: IDBFactory | undefined): Promise<readonly TearGhostManifest[]> {
  if (factory === undefined) return Object.freeze([]);
  const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(factory));
  const ids = await vault.backend().keys("manifests");
  const manifests = await Promise.all(ids.map((id) => vault.getManifest(id)));
  return Object.freeze(manifests.filter((manifest): manifest is TearGhostManifest => manifest !== undefined));
}

/** Test and tooling entry point that decodes the persisted capsule through the normal reader. */
export async function readBrowserGhostCapsule(
  factory: IDBFactory | undefined,
  id: string,
): Promise<GhostReadCapsule | undefined> {
  if (factory === undefined) return undefined;
  return new GhostCapsuleReader(new GhostLocalVault(await createIndexedDbGhostVaultBackend(factory))).read(id);
}

/** Reopens a persisted capsule and maps only strict V3 truth tracks for tooling. */
export async function readBrowserGhostCapsuleReplay(
  factory: IDBFactory | undefined,
  id: string,
): Promise<GhostCapsuleReplayMapping | undefined> {
  const capsule = await readBrowserGhostCapsule(factory, id);
  return capsule === undefined ? undefined : mapGhostCapsuleToReplayEnvelope(capsule);
}

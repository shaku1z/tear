import type { AudioGraphContext, AudioNodePort, TemporaryMuteReason } from "./mixer";
import type {
  MusicBackend,
  MusicBackendHost,
  MusicContextSnapshot,
  MusicEvent,
  MusicReplayMetadata,
  MusicRunSessionMetadata,
} from "./music-contracts";

export type TearScoreQuality = "low" | "balanced" | "high";

export interface TearScoreInitializeOptions {
  readonly audioContext: AudioGraphContext;
  readonly outputNode: AudioNodePort;
  readonly quality: TearScoreQuality;
}

/**
 * Compile-time boundary for the separately versioned TearScore package. Keeping this
 * local prevents its implementation types and Tone from leaking into the game domain.
 */
export interface TearScoreClient {
  readonly engineVersion: string;
  initialize(options: TearScoreInitializeOptions): Promise<void>;
  start(): Promise<void>;
  beginRun(metadata: MusicRunSessionMetadata): Promise<void>;
  updateContext(snapshot: MusicContextSnapshot): void;
  emitEvent(event: MusicEvent): void;
  endRun(): Promise<void>;
  setMuteReason(reason: TemporaryMuteReason, muted: boolean): void;
  replayMetadata(): MusicReplayMetadata;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  dispose(): Promise<void>;
}

export class TearScoreMusicBackend implements MusicBackend {
  readonly #client: TearScoreClient;
  readonly #quality: TearScoreQuality;

  constructor(client: TearScoreClient, quality: TearScoreQuality = "balanced") {
    this.#client = client;
    this.#quality = quality;
  }

  get id(): string {
    return `tear-score@${this.#client.engineVersion}`;
  }

  async initialize(host: MusicBackendHost): Promise<void> {
    await this.#client.initialize({
      audioContext: host.context,
      outputNode: host.output,
      quality: this.#quality,
    });
    await this.#client.start();
  }

  beginRun(metadata: MusicRunSessionMetadata): Promise<void> {
    return this.#client.beginRun(metadata);
  }

  updateContext(snapshot: MusicContextSnapshot): void {
    this.#client.updateContext(snapshot);
  }

  emitEvent(event: MusicEvent): void {
    this.#client.emitEvent(event);
  }

  endRun(): Promise<void> {
    return this.#client.endRun();
  }

  setMuteReason(reason: TemporaryMuteReason, muted: boolean): void {
    this.#client.setMuteReason(reason, muted);
  }

  replayMetadata(): MusicReplayMetadata { return this.#client.replayMetadata(); }

  resume(): Promise<void> {
    return this.#client.resume();
  }

  suspend(): Promise<void> {
    return this.#client.suspend();
  }

  dispose(): Promise<void> {
    return this.#client.dispose();
  }
}

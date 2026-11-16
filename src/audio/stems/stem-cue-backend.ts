import { unwrapBrowserAudioContext, unwrapBrowserAudioNode } from "../browser-audio";
import type { TemporaryMuteReason } from "../mixer";
import type {
  MusicBackend,
  MusicBackendHost,
  MusicContextSnapshot,
  MusicEvent,
  MusicReplayMetadata,
  MusicRunSessionMetadata,
} from "../music-contracts";
import { applyMusicMode } from "../music-mode";
import { StemCuePlayer } from "./StemCuePlayer";
import { assertValidStemCue } from "./validate";
import { tierFromSnapshot } from "./tier-from-snapshot";
import { WebAudioStemBackend } from "./web-audio-backend";
import type { StemCueManifest, Tier } from "./types";

/**
 * A `MusicBackend` that plays a recorded adaptive stem cue and drives its tier
 * from the same game snapshots the procedural engine consumes. Mutually
 * exclusive with the procedural backend (one is installed at a time).
 */
export class StemCueMusicBackend implements MusicBackend {
  readonly id: string;
  readonly #player = new StemCuePlayer();
  readonly #cue: StemCueManifest;
  readonly #baseUrl: string;
  readonly #muteReasons = new Set<TemporaryMuteReason>();
  #master: GainNode | null = null;
  /** Pre-gameplay (menu) plays the complete arrangement. */
  #tier: Tier = 4;

  constructor(cue: StemCueManifest, baseUrl: string) {
    assertValidStemCue(cue);
    this.#cue = cue;
    this.#baseUrl = baseUrl;
    this.id = `stem-cue@${cue.id}`;
  }

  async initialize(host: MusicBackendHost): Promise<void> {
    const context = unwrapBrowserAudioContext(host.context);
    const output = unwrapBrowserAudioNode(host.output);
    // A master gain lets mute reasons duck the whole cue without touching tiers.
    const master = context.createGain();
    master.gain.value = this.#muteReasons.size > 0 ? 0 : 1;
    master.connect(output);
    this.#master = master;

    const backend = new WebAudioStemBackend(context, master, this.#baseUrl);
    await this.#player.load(this.#cue, backend);
    this.#player.start({ leadSeconds: 0.15 });
  }

  beginRun(_metadata: MusicRunSessionMetadata): Promise<void> {
    void _metadata;
    return Promise.resolve();
  }

  updateContext(snapshot: MusicContextSnapshot): void {
    const requested = tierFromSnapshot(snapshot);
    // Pause always uses the plain adaptive reading, whatever the music mode is.
    const tier = snapshot.scene === "paused" ? requested : applyMusicMode(requested);
    if (tier === this.#tier) return;
    this.#tier = tier;
    this.#player.setTier(tier, { transitionBars: 1 });
  }

  emitEvent(_event: MusicEvent): void {
    void _event;
  }

  endRun(): Promise<void> {
    return Promise.resolve();
  }

  setMuteReason(reason: TemporaryMuteReason, muted: boolean): void {
    if (muted) this.#muteReasons.add(reason);
    else this.#muteReasons.delete(reason);
    if (this.#master) this.#master.gain.value = this.#muteReasons.size > 0 ? 0 : 1;
  }

  replayMetadata(): MusicReplayMetadata {
    return { enabled: false, reason: "not-recorded" };
  }

  resume(): Promise<void> {
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): Promise<void> {
    this.#player.unload();
    this.#master?.disconnect();
    this.#master = null;
    return Promise.resolve();
  }
}

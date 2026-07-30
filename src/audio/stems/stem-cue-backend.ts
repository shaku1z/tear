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
import {
  clearFoundryPreviewProbe,
  createFoundryPreviewProbe,
  type FoundryPreviewRequest,
} from "../foundry-preview";
import { StemCuePlayer } from "./StemCuePlayer";
import { assertValidStemCue } from "./validate";
import { tierFromSnapshot } from "./tier-from-snapshot";
import { WebAudioStemBackend } from "./web-audio-backend";
import type { StemCueManifest, Tier } from "./types";

type FoundryPreviewGainReason =
  | "foundry-fixed-tier"
  | "foundry-adaptive"
  | "foundry-full"
  | "foundry-calm"
  | "foundry-dynamic"
  | "foundry-pause";

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
  readonly #preview: FoundryPreviewRequest | null;
  readonly #muteReasons = new Set<TemporaryMuteReason>();
  #master: GainNode | null = null;
  #publishPreview:
    | ((
        scene: MusicContextSnapshot["scene"],
        tier?: Tier,
        gainReason?: FoundryPreviewGainReason,
      ) => void)
    | null = null;
  /** Pre-gameplay (menu) plays the complete arrangement. */
  #tier: Tier = 4;

  constructor(
    cue: StemCueManifest,
    baseUrl: string,
    preview: FoundryPreviewRequest | null = null,
  ) {
    assertValidStemCue(cue);
    this.#cue = cue;
    this.#baseUrl = baseUrl;
    this.#preview = preview;
    if (preview)
      this.#tier =
        preview.mode === "full"
          ? 4
          : preview.mode === "calm"
            ? 0
            : preview.fixedTier;
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
    const decodeStartedAt = performance.now();
    await this.#player.load(this.#cue, backend);
    const decodeLoadMs = performance.now() - decodeStartedAt;
    this.#player.start({ leadSeconds: 0.15 });
    if (this.#preview) {
      this.#player.setTier(this.#tier);
      this.#publishPreview = createFoundryPreviewProbe(
        this.#preview,
        this.#cue,
        context,
        decodeLoadMs,
      );
      this.#publishPreview(
        this.#preview.scenarioScene ?? "main-menu",
        this.#tier,
        this.#previewGainReason(),
      );
    }
  }

  beginRun(_metadata: MusicRunSessionMetadata): Promise<void> {
    void _metadata;
    return Promise.resolve();
  }

  updateContext(snapshot: MusicContextSnapshot): void {
    if (this.#preview) {
      const effective = {
        ...snapshot,
        ...(this.#preview.scenarioScene
          ? {
              scene: this.#preview.scenarioScene,
              bossActive: this.#preview.scenarioScene === "boss",
              bossId:
                this.#preview.scenarioScene === "boss"
                  ? snapshot.bossId ?? "foundry-preview"
                  : snapshot.bossId,
              bossPhase:
                this.#preview.bossPhase ?? snapshot.bossPhase,
            }
          : {}),
      } as MusicContextSnapshot;
      const tier = this.#previewTier(effective);
      if (tier !== this.#tier) {
        this.#tier = tier;
        this.#player.setTier(tier, { transitionBars: 1 });
      }
      this.#publishPreview?.(
        effective.scene,
        tier,
        this.#previewGainReason(effective.scene),
      );
      return;
    }
    const requested = tierFromSnapshot(snapshot);
    // Pause always uses the plain adaptive reading, whatever the music mode is.
    const tier = snapshot.scene === "paused" ? requested : applyMusicMode(requested);
    if (tier === this.#tier) return;
    this.#tier = tier;
    this.#player.setTier(tier, { transitionBars: 1 });
  }

  #previewTier(snapshot?: MusicContextSnapshot): Tier {
    const preview = this.#preview;
    if (!preview) return this.#tier;
    const scene = snapshot?.scene ?? preview.scenarioScene ?? "main-menu";
    const effectiveSnapshot = snapshot ?? {
      schemaVersion: 1,
      sequence: 0,
      timeMs: 0,
      scene,
      modeId: "foundry",
      difficultyId: "foundry",
      biomeId: "menu",
      stageId: "foundry",
      wave: 0,
      totalWaves: 0,
      bossActive: scene === "boss",
      bossId: scene === "boss" ? "foundry-preview" : null,
      bossPhase: preview.bossPhase ?? null,
      playerHealthRatio: 1,
      comboRankId: "NONE",
      playerMoving: false,
    } satisfies MusicContextSnapshot;
    // Pause deliberately follows the normal adaptive pause behavior regardless
    // of Full, Calm, or Fixed preview mode, matching player-facing settings.
    if (scene === "paused") return tierFromSnapshot(effectiveSnapshot);
    if (preview.mode === "full") return 4;
    if (preview.mode === "calm") return 0;
    if (preview.mode === "adaptive") return tierFromSnapshot(effectiveSnapshot);
    if (preview.mode === "dynamic")
      return applyMusicMode(tierFromSnapshot(effectiveSnapshot));
    return preview.fixedTier;
  }

  #previewGainReason(
    scene = this.#preview?.scenarioScene ?? "main-menu",
  ): FoundryPreviewGainReason {
    if (scene === "paused") return "foundry-pause";
    switch (this.#preview?.mode) {
      case "adaptive":
        return "foundry-adaptive";
      case "full":
        return "foundry-full";
      case "calm":
        return "foundry-calm";
      case "dynamic":
        return "foundry-dynamic";
      default:
        return "foundry-fixed-tier";
    }
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
    if (this.#preview) clearFoundryPreviewProbe();
    this.#publishPreview = null;
    this.#master?.disconnect();
    this.#master = null;
    return Promise.resolve();
  }
}

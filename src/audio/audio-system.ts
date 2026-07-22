import {
  HierarchicalAudioMixer,
  normalizeAudioMixerSettings,
  type AudioCategory,
  type AudioGraphContext,
  type AudioMixerSettings,
  type AudioSettingsStore,
  type GainNodePort,
  type SfxRoute,
  type TemporaryMuteReason,
} from "./mixer";
import type {
  MusicBackend,
  MusicContextSnapshot,
  MusicEvent,
  MusicReplayMetadata,
  MusicRunSessionMetadata,
} from "./music-contracts";
import type { AudioEffectsBackend } from "./effects-contracts";

export type AudioSystemState =
  | "awaiting-user-activation"
  | "starting"
  | "running"
  | "suspending"
  | "suspended"
  | "disposing"
  | "disposed"
  | "error";

export interface AudioContextFactory {
  create(): AudioGraphContext;
}

export interface AudioSystemOptions {
  readonly contextFactory: AudioContextFactory;
  readonly settingsStore: AudioSettingsStore | null;
  readonly initialSettings: Partial<AudioMixerSettings> | undefined;
  readonly primaryMusicBackend: MusicBackend | null;
  readonly fallbackMusicBackend: MusicBackend | null;
  readonly effectsBackend?: AudioEffectsBackend;
  readonly gainRampSeconds: number;
}

export interface AudioSystemResourceSnapshot {
  readonly contexts: number;
  readonly mixerNodes: number;
  readonly effectsBackendNodes: number;
  readonly temporaryMuteReasons: readonly TemporaryMuteReason[];
}

export class AudioSystem {
  readonly #options: AudioSystemOptions;
  readonly #muteReasons = new Set<TemporaryMuteReason>();
  #state: AudioSystemState = "awaiting-user-activation";
  #context: AudioGraphContext | null = null;
  #mixer: HierarchicalAudioMixer | null = null;
  #musicBackend: MusicBackend | null = null;
  #effectsBackend: AudioEffectsBackend | null = null;
  #currentRun: MusicRunSessionMetadata | null = null;
  #activation: Promise<void> | null = null;
  #suspension: Promise<void> | null = null;
  #resumption: Promise<void> | null = null;
  #disposal: Promise<void> | null = null;
  #settings: AudioMixerSettings;

  constructor(options: AudioSystemOptions) {
    this.#options = options;
    this.#settings = normalizeAudioMixerSettings(
      options.settingsStore?.load() ?? options.initialSettings,
    );
  }

  get state(): AudioSystemState {
    return this.#state;
  }

  get settings(): AudioMixerSettings {
    return this.#mixer?.settings ?? this.#settings;
  }

  get activeMusicBackendId(): string | null {
    return this.#musicBackend?.id ?? null;
  }

  musicReplayMetadata(): MusicReplayMetadata {
    return this.#musicBackend?.replayMetadata() ?? { enabled: false, reason: "disabled" };
  }

  debugResourceSnapshot(): AudioSystemResourceSnapshot {
    return Object.freeze({
      contexts: this.#context === null ? 0 : 1,
      mixerNodes: this.#mixer === null ? 0 : 8,
      effectsBackendNodes: this.#effectsBackend?.debugResourceSnapshot?.().graphNodes ?? 0,
      temporaryMuteReasons: Object.freeze([...this.#muteReasons].sort()),
    });
  }

  /** Must be called directly from the host's user-activation handler. */
  activateFromUserGesture(): Promise<void> {
    this.#assertNotDisposed();
    if (this.#state === "running") return Promise.resolve();
    if (this.#state === "suspended") return this.resume();
    if (this.#activation !== null) return this.#activation;
    if (this.#resumption !== null) return this.#resumption;
    if (this.#state === "error") {
      throw new Error("Audio system is in an error state; dispose it before creating a replacement");
    }

    // Context creation is deliberately synchronous before the first await.
    this.#context = this.#options.contextFactory.create();
    this.#mixer = new HierarchicalAudioMixer(
      this.#context,
      this.#settings,
      this.#options.settingsStore,
      this.#options.gainRampSeconds,
    );
    for (const reason of this.#muteReasons) this.#mixer.setTemporaryMute(reason, true);
    this.#state = "starting";
    this.#activation = this.#start();
    return this.#activation;
  }

  async #start(): Promise<void> {
    try {
      const context = this.#requireContext();
      let effectsInitialization = Promise.resolve();
      if (this.#options.effectsBackend !== undefined) {
        this.#effectsBackend = this.#options.effectsBackend;
        effectsInitialization = this.#options.effectsBackend.initialize({
          context,
          sfxOutput: (route) => this.#requireMixer().sfxBus(route),
          interfaceOutput: this.#requireMixer().categoryBus("interface"),
        });
      }
      await context.resume();
      await effectsInitialization;
      await this.#selectMusicBackend();
      this.#state = "running";
    } catch (error) {
      this.#state = "error";
      throw error;
    } finally {
      this.#activation = null;
    }
  }

  setVolume(category: AudioCategory, value: number): void {
    if (this.#mixer !== null) {
      this.#mixer.setVolume(category, value);
      this.#settings = this.#mixer.settings;
      return;
    }
    this.#assertNotDisposed();
    const volumeKey = `${category}Volume` as keyof AudioMixerSettings;
    this.#settings = normalizeAudioMixerSettings({ ...this.#settings, [volumeKey]: value });
    this.#options.settingsStore?.save(this.#settings);
  }

  setMuted(category: AudioCategory, muted: boolean): void {
    if (this.#mixer !== null) {
      this.#mixer.setMuted(category, muted);
      this.#settings = this.#mixer.settings;
      return;
    }
    this.#assertNotDisposed();
    const mutedKey = `${category}Muted` as keyof AudioMixerSettings;
    this.#settings = normalizeAudioMixerSettings({ ...this.#settings, [mutedKey]: muted });
    this.#options.settingsStore?.save(this.#settings);
  }

  setTemporaryMute(reason: TemporaryMuteReason, muted: boolean): void {
    this.#assertNotDisposed();
    const changed = muted ? !this.#muteReasons.has(reason) : this.#muteReasons.has(reason);
    if (!changed) return;
    if (muted) this.#muteReasons.add(reason);
    else this.#muteReasons.delete(reason);
    this.#mixer?.setTemporaryMute(reason, muted);
    this.#musicBackend?.setMuteReason(reason, muted);
  }

  sfxBus(route: SfxRoute): GainNodePort {
    return this.#requireMixer().sfxBus(route);
  }

  interfaceBus(): GainNodePort {
    return this.#requireMixer().categoryBus("interface");
  }

  async beginMusicRun(metadata: MusicRunSessionMetadata): Promise<void> {
    this.#assertRunning();
    if (this.#currentRun !== null) await this.endMusicRun();
    try {
      await this.#musicBackend?.beginRun(metadata);
    } catch (error) {
      const failed = this.#musicBackend;
      await failed?.dispose().catch(() => undefined);
      this.#musicBackend = null;
      const fallback = this.#options.fallbackMusicBackend;
      if (fallback === null || fallback === failed) throw error;
      try {
        await fallback.initialize({
          context: this.#requireContext(),
          output: this.#requireMixer().categoryBus("music"),
        });
        for (const reason of this.#muteReasons) fallback.setMuteReason(reason, true);
        await fallback.beginRun(metadata);
        this.#musicBackend = fallback;
      } catch (fallbackError) {
        await fallback.dispose().catch(() => undefined);
        throw fallbackError;
      }
    }
    this.#currentRun = metadata;
  }

  updateMusicContext(snapshot: MusicContextSnapshot): void {
    this.#assertRunning();
    if (this.#currentRun === null) throw new Error("No music run is active");
    this.#musicBackend?.updateContext(snapshot);
  }

  emitMusicEvent(event: MusicEvent): void {
    this.#assertRunning();
    if (this.#currentRun === null) throw new Error("No music run is active");
    this.#musicBackend?.emitEvent(event);
  }

  async endMusicRun(): Promise<void> {
    if (this.#currentRun === null) return;
    await this.#musicBackend?.endRun();
    this.#currentRun = null;
  }

  suspend(): Promise<void> {
    this.#assertNotDisposed();
    if (this.#state === "suspended") return Promise.resolve();
    if (this.#suspension !== null) return this.#suspension;
    if (this.#state !== "running") {
      return Promise.reject(new Error(`Cannot suspend audio while ${this.#state}`));
    }
    this.#state = "suspending";
    this.#suspension = this.#suspendActive();
    return this.#suspension;
  }

  async #suspendActive(): Promise<void> {
    try {
      await this.#musicBackend?.suspend();
      await this.#requireContext().suspend();
      this.#state = "suspended";
    } catch (error) {
      this.#state = "error";
      throw error;
    } finally {
      this.#suspension = null;
    }
  }

  resume(): Promise<void> {
    this.#assertNotDisposed();
    if (this.#state === "running") return Promise.resolve();
    if (this.#resumption !== null) return this.#resumption;
    if (this.#state !== "suspended") {
      return Promise.reject(new Error(`Cannot resume audio while ${this.#state}`));
    }
    this.#state = "starting";
    this.#resumption = this.#resumeActive();
    return this.#resumption;
  }

  async #resumeActive(): Promise<void> {
    try {
      await this.#requireContext().resume();
      await this.#musicBackend?.resume();
      this.#state = "running";
    } catch (error) {
      this.#state = "error";
      throw error;
    } finally {
      this.#resumption = null;
    }
  }

  dispose(): Promise<void> {
    if (this.#disposal !== null) return this.#disposal;
    if (this.#state === "disposed") return Promise.resolve();
    this.#state = "disposing";
    this.#disposal = this.#disposeOwnedResources();
    return this.#disposal;
  }

  async #disposeOwnedResources(): Promise<void> {
    let firstError: unknown;
    try {
      const pendingLifecycle = this.#activation ?? this.#suspension ?? this.#resumption;
      await pendingLifecycle?.catch((error: unknown) => {
        firstError = error;
      });
      await this.endMusicRun().catch((error: unknown) => {
        firstError ??= error;
      });
      await this.#musicBackend?.dispose().catch((error: unknown) => {
        firstError ??= error;
      });
      this.#musicBackend = null;
      await this.#effectsBackend?.dispose().catch((error: unknown) => {
        firstError ??= error;
      });
      this.#effectsBackend = null;
      this.#mixer?.dispose();
      this.#mixer = null;
      if (this.#context !== null && this.#context.state !== "closed") {
        await this.#context.close().catch((error: unknown) => {
          firstError ??= error;
        });
      }
      this.#context = null;
      this.#state = "disposed";
      if (firstError !== undefined) {
        throw firstError instanceof Error
          ? firstError
          : new Error("A non-Error value was thrown during audio cleanup", { cause: firstError });
      }
    } finally {
      this.#disposal = null;
    }
  }

  async #selectMusicBackend(): Promise<void> {
    const context = this.#requireContext();
    const mixer = this.#requireMixer();
    const candidates = [
      this.#options.primaryMusicBackend,
      this.#options.fallbackMusicBackend,
    ].filter((backend): backend is MusicBackend => backend !== null);

    let lastError: unknown;
    for (const backend of candidates) {
      try {
        await backend.initialize({ context, output: mixer.categoryBus("music") });
        for (const reason of this.#muteReasons) backend.setMuteReason(reason, true);
        this.#musicBackend = backend;
        return;
      } catch (error) {
        lastError = error;
        await backend.dispose().catch(() => undefined);
      }
    }
    if (candidates.length > 0) throw lastError;
  }

  #requireContext(): AudioGraphContext {
    if (this.#context === null) throw new Error("Audio has not been activated");
    return this.#context;
  }

  #requireMixer(): HierarchicalAudioMixer {
    if (this.#mixer === null) throw new Error("Audio has not been activated");
    return this.#mixer;
  }

  #assertRunning(): void {
    if (this.#state !== "running") throw new Error(`Audio is not running (${this.#state})`);
  }

  #assertNotDisposed(): void {
    if (this.#state === "disposed" || this.#state === "disposing") {
      throw new Error("Audio system has been disposed");
    }
  }
}

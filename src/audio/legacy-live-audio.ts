import { AudioSystem } from "./audio-system";
import {
  createBrowserAudioContextFactory,
  unwrapBrowserAudioContext,
  unwrapBrowserAudioNode,
} from "./browser-audio";
import type { AudioEffectsBackend, AudioEffectsBackendHost } from "./effects-contracts";
import type {
  AudioCategory,
  AudioMixerSettings,
  AudioSettingsStore,
  SfxRoute,
  TemporaryMuteReason,
} from "./mixer";
import type {
  MusicBackend,
  MusicBackendHost,
  MusicContextSnapshot,
  MusicEvent,
  MusicReplayMetadata,
  MusicRunSessionMetadata,
} from "./music-contracts";
import { createInstalledPrimaryMusicBackend } from "./music-backend-registry";
import { migrateAudioSettings } from "../persistence/audio-settings";
import type { LegacySynthContract } from "./legacy-synth-contracts";
import { capturedAudioContext } from "./audio-context-handoff";

const LEGACY_SETTINGS_KEY = "tear_settings";

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function readLocalSettings(storage: Storage): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(storage.getItem(LEGACY_SETTINGS_KEY) ?? "{}");
    return objectRecord(value);
  } catch {
    return {};
  }
}

class VolatileStorage implements Storage {
  readonly #values = new Map<string, string>();
  get length(): number { return this.#values.size; }
  clear(): void { this.#values.clear(); }
  getItem(key: string): string | null { return this.#values.get(key) ?? null; }
  key(index: number): string | null { return [...this.#values.keys()][index] ?? null; }
  removeItem(key: string): void { this.#values.delete(key); }
  setItem(key: string, value: string): void { this.#values.set(key, value); }
}

function resolveStorage(browserWindow: Window): Storage {
  try {
    return browserWindow.localStorage;
  } catch {
    return new VolatileStorage();
  }
}

function configureConditioner(context: AudioContext): {
  readonly compressor: DynamicsCompressorNode;
  readonly air: BiquadFilterNode;
} {
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 8;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.12;
  const air = context.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 3800;
  air.gain.value = 5;
  compressor.connect(air);
  return { compressor, air };
}

export class LegacyAudioSettingsStore implements AudioSettingsStore {
  readonly #storage: Storage;

  constructor(storage: Storage) {
    this.#storage = storage;
  }

  load(): Partial<AudioMixerSettings> {
    const record = readLocalSettings(this.#storage);
    return migrateAudioSettings(record.audio ?? record);
  }

  save(settings: AudioMixerSettings): void {
    try {
      const record = readLocalSettings(this.#storage);
      Object.assign(record, settings, {
        vol: settings.masterVolume,
        music: !settings.musicMuted,
        audioSchemaVersion: 2,
      });
      this.#storage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify(record));
    } catch {
      // Storage can be unavailable in privacy modes; audio remains session-local.
    }
  }
}

class LegacySynthEffectsBackend implements AudioEffectsBackend {
  readonly #synth: LegacySynthContract;
  readonly #nodes: AudioNode[] = [];

  constructor(synth: LegacySynthContract) {
    this.#synth = synth;
  }

  initialize(host: AudioEffectsBackendHost): Promise<void> {
    const context = unwrapBrowserAudioContext(host.context);
    const routes: readonly SfxRoute[] = ["weapons", "enemies", "player", "environment"];
    const effectsInputs = {} as Record<SfxRoute, GainNode>;
    for (const route of routes) {
      const input = context.createGain();
      const conditioner = configureConditioner(context);
      input.connect(conditioner.compressor);
      conditioner.air.connect(unwrapBrowserAudioNode(host.sfxOutput(route)));
      effectsInputs[route] = input;
      this.#nodes.push(input, conditioner.compressor, conditioner.air);
    }
    const interfaceInput = context.createGain();
    const interfaceConditioner = configureConditioner(context);
    interfaceInput.connect(interfaceConditioner.compressor);
    interfaceConditioner.air.connect(unwrapBrowserAudioNode(host.interfaceOutput));
    this.#nodes.push(interfaceInput, interfaceConditioner.compressor, interfaceConditioner.air);
    this.#synth._bindEffects({
      context,
      effectsInputs,
      interfaceInput,
    });
    return Promise.resolve();
  }

  dispose(): Promise<void> {
    this.#synth._disposeEffects();
    for (const node of this.#nodes) node.disconnect();
    this.#nodes.length = 0;
    return Promise.resolve();
  }

  debugResourceSnapshot(): Readonly<{ readonly graphNodes: number }> {
    return Object.freeze({ graphNodes: this.#nodes.length });
  }
}

class LegacySynthMusicBackend implements MusicBackend {
  readonly id = "legacy-synth";
  readonly #synth: LegacySynthContract;
  #nodes: AudioNode[] = [];

  constructor(synth: LegacySynthContract) {
    this.#synth = synth;
  }

  initialize(host: MusicBackendHost): Promise<void> {
    const context = unwrapBrowserAudioContext(host.context);
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 16000;
    filter.Q.value = 0.35;
    const conditioner = configureConditioner(context);
    gain.connect(filter);
    filter.connect(conditioner.compressor);
    conditioner.air.connect(unwrapBrowserAudioNode(host.output));
    this.#nodes = [gain, filter, conditioner.compressor, conditioner.air];
    this.#synth._bindLegacyMusic({ gain, filter });
    this.#synth._startMusic();
    return Promise.resolve();
  }

  beginRun(metadata: MusicRunSessionMetadata): Promise<void> { void metadata; return Promise.resolve(); }
  updateContext(snapshot: MusicContextSnapshot): void { void snapshot; return undefined; }
  emitEvent(event: MusicEvent): void { void event; return undefined; }
  endRun(): Promise<void> { return Promise.resolve(); }
  setMuteReason(reason: TemporaryMuteReason, muted: boolean): void {
    void reason;
    void muted;
    return undefined;
  }
  replayMetadata(): MusicReplayMetadata { return { enabled: false, reason: "fallback" }; }
  resume(): Promise<void> { return Promise.resolve(); }
  suspend(): Promise<void> { return Promise.resolve(); }

  dispose(): Promise<void> {
    this.#synth._stopMusic();
    for (const node of this.#nodes) node.disconnect();
    this.#nodes = [];
    return Promise.resolve();
  }
}

export interface LegacyAudioCompatibility {
  readonly system: AudioSystem;
  activate(): void;
  dispose(): void;
  migrateSettings(
    settings: Record<string, unknown>,
    audioSource?: Record<string, unknown>,
  ): Record<string, unknown>;
  applySettings(settings: Record<string, unknown>): void;
  setVolume(category: AudioCategory, value: number): void;
  setMuted(category: AudioCategory, muted: boolean): void;
  setTemporaryMute(reason: TemporaryMuteReason, muted: boolean): void;
  beginMusicRun(metadata: MusicRunSessionMetadata): void;
  updateMusicContext(snapshot: MusicContextSnapshot): void;
  emitMusicEvent(event: MusicEvent): void;
  endMusicRun(): void;
  musicReplayMetadata(): MusicReplayMetadata;
  activeMusicRun(): MusicRunSessionMetadata | null;
}

function synchronizeLegacyFields(synth: LegacySynthContract, settings: AudioMixerSettings): void {
  synth.vol = settings.masterVolume;
  synth.musicVol = settings.musicVolume;
  synth.musicOn = !settings.musicMuted;
}

export function createLegacyAudioCompatibility(
  synth: LegacySynthContract,
  browserWindow: Window = window,
): LegacyAudioCompatibility {
  const storage = resolveStorage(browserWindow);
  const settingsStore = new LegacyAudioSettingsStore(storage);
  const system = new AudioSystem({
    contextFactory: createBrowserAudioContextFactory(browserWindow, capturedAudioContext),
    settingsStore,
    initialSettings: undefined,
    effectsBackend: new LegacySynthEffectsBackend(synth),
    primaryMusicBackend: createInstalledPrimaryMusicBackend(),
    fallbackMusicBackend: new LegacySynthMusicBackend(synth),
    gainRampSeconds: 0.02,
  });
  synchronizeLegacyFields(synth, system.settings);
  let disposed = false;
  let activation: Promise<void> | null = null;
  let pendingRun: MusicRunSessionMetadata | null = null;
  let pendingSnapshot: MusicContextSnapshot | null = null;
  const pendingEvents: MusicEvent[] = [];
  let runStarted = false;
  let flushScheduled = false;
  let endRequested = false;

  const report = (error: unknown) => {
    console.warn("Tear audio could not start", error);
  };
  const scheduleFlush = () => {
    if (disposed || flushScheduled) return;
    flushScheduled = true;
    const ready = activation ?? (system.state === "running" ? Promise.resolve() : null);
    if (ready === null) {
      flushScheduled = false;
      return;
    }
    void ready.then(async () => {
      if (disposed || pendingRun === null || system.state !== "running") return;
      if (!runStarted) {
        const startingRun = pendingRun;
        await system.beginMusicRun(startingRun);
        if (pendingRun !== startingRun) return;
        runStarted = true;
      }
      if (pendingSnapshot !== null) {
        const snapshot = pendingSnapshot;
        pendingSnapshot = null;
        system.updateMusicContext(snapshot);
      }
      while (pendingEvents.length > 0) {
        const event = pendingEvents.shift();
        if (event !== undefined) system.emitMusicEvent(event);
      }
      if (endRequested) {
        await system.endMusicRun();
        pendingRun = null;
        runStarted = false;
        endRequested = false;
      }
    }).catch(report).finally(() => {
      flushScheduled = false;
      if (!disposed && pendingRun !== null && (pendingSnapshot !== null || pendingEvents.length > 0)) {
        scheduleFlush();
      }
    });
  };

  return {
    system,
    activate() {
      if (disposed) return;
      try {
        activation = system.activateFromUserGesture();
        void activation.then(scheduleFlush).catch(report);
      } catch (error) {
        report(error);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      void system.dispose().catch((error: unknown) => {
        console.warn("Tear audio cleanup failed", error);
      });
    },
    migrateSettings(settings, audioSource = settings) {
      const source = audioSource === settings ? settings : audioSource.audio ?? audioSource;
      const audio = migrateAudioSettings(source);
      return Object.assign(settings, audio, {
        vol: audio.masterVolume,
        music: !audio.musicMuted,
      });
    },
    applySettings(settings) {
      if (disposed) return;
      const audio = migrateAudioSettings(settings);
      system.setVolume("master", audio.masterVolume);
      system.setVolume("music", audio.musicVolume);
      system.setVolume("sfx", audio.sfxVolume);
      system.setVolume("interface", audio.interfaceVolume);
      system.setMuted("master", audio.masterMuted);
      system.setMuted("music", audio.musicMuted);
      system.setMuted("sfx", audio.sfxMuted);
      system.setMuted("interface", audio.interfaceMuted);
      synchronizeLegacyFields(synth, system.settings);
      Object.assign(settings, system.settings, {
        vol: system.settings.masterVolume,
        music: !system.settings.musicMuted,
      });
    },
    setVolume(category, value) {
      if (disposed) return;
      system.setVolume(category, value);
      synchronizeLegacyFields(synth, system.settings);
    },
    setMuted(category, muted) {
      if (disposed) return;
      system.setMuted(category, muted);
      synchronizeLegacyFields(synth, system.settings);
    },
    setTemporaryMute(reason, muted) {
      if (disposed) return;
      system.setTemporaryMute(reason, muted);
    },
    beginMusicRun(metadata) {
      if (disposed) return;
      pendingRun = metadata;
      pendingSnapshot = null;
      pendingEvents.length = 0;
      runStarted = false;
      endRequested = false;
      // startRun originates in a user action, so this also covers a run selected
      // before the global pointer listener's asynchronous startup has settled.
      this.activate();
      scheduleFlush();
    },
    updateMusicContext(snapshot) {
      if (disposed || pendingRun === null) return;
      pendingSnapshot = snapshot;
      scheduleFlush();
    },
    emitMusicEvent(event) {
      if (disposed || pendingRun === null) return;
      pendingEvents.push(event);
      scheduleFlush();
    },
    endMusicRun() {
      if (disposed || pendingRun === null) return;
      endRequested = true;
      scheduleFlush();
    },
    musicReplayMetadata() { return system.musicReplayMetadata(); },
    activeMusicRun() { return pendingRun; },
  };
}

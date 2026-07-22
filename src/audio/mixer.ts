export type AudioCategory = "master" | "music" | "sfx" | "interface";
export type SfxRoute = "weapons" | "enemies" | "player" | "environment";
export type TemporaryMuteReason =
  | "ad"
  | "portal"
  | "visibility"
  | "platform-suspend"
  | "system";

export interface AudioMixerSettings {
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly interfaceVolume: number;
  readonly masterMuted: boolean;
  readonly musicMuted: boolean;
  readonly sfxMuted: boolean;
  readonly interfaceMuted: boolean;
}

export const DEFAULT_AUDIO_MIXER_SETTINGS: AudioMixerSettings = Object.freeze({
  masterVolume: 0.6,
  musicVolume: 0.5,
  sfxVolume: 1,
  interfaceVolume: 1,
  masterMuted: false,
  musicMuted: false,
  sfxMuted: false,
  interfaceMuted: false,
});

export interface AudioNodePort {
  connect(destination: AudioNodePort): void;
  disconnect(): void;
}

export interface GainParamPort {
  readonly value: number;
  cancelScheduledValues(time: number): void;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
}

export interface GainNodePort extends AudioNodePort {
  readonly gain: GainParamPort;
}

export type AudioContextState = "suspended" | "running" | "closed";

export interface AudioGraphContext {
  readonly currentTime: number;
  readonly destination: AudioNodePort;
  readonly state: AudioContextState;
  createGain(label: string): GainNodePort;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

export interface AudioSettingsStore {
  load(): Partial<AudioMixerSettings> | undefined;
  save(settings: AudioMixerSettings): void;
}

const VOLUME_KEYS: Record<AudioCategory, keyof AudioMixerSettings> = {
  master: "masterVolume",
  music: "musicVolume",
  sfx: "sfxVolume",
  interface: "interfaceVolume",
};

const MUTED_KEYS: Record<AudioCategory, keyof AudioMixerSettings> = {
  master: "masterMuted",
  music: "musicMuted",
  sfx: "sfxMuted",
  interface: "interfaceMuted",
};

export function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function normalizeAudioMixerSettings(
  candidate: Partial<AudioMixerSettings> | undefined,
): AudioMixerSettings {
  const value = candidate ?? {};
  return Object.freeze({
    masterVolume: clampVolume(value.masterVolume ?? DEFAULT_AUDIO_MIXER_SETTINGS.masterVolume),
    musicVolume: clampVolume(value.musicVolume ?? DEFAULT_AUDIO_MIXER_SETTINGS.musicVolume),
    sfxVolume: clampVolume(value.sfxVolume ?? DEFAULT_AUDIO_MIXER_SETTINGS.sfxVolume),
    interfaceVolume: clampVolume(
      value.interfaceVolume ?? DEFAULT_AUDIO_MIXER_SETTINGS.interfaceVolume,
    ),
    masterMuted: value.masterMuted ?? DEFAULT_AUDIO_MIXER_SETTINGS.masterMuted,
    musicMuted: value.musicMuted ?? DEFAULT_AUDIO_MIXER_SETTINGS.musicMuted,
    sfxMuted: value.sfxMuted ?? DEFAULT_AUDIO_MIXER_SETTINGS.sfxMuted,
    interfaceMuted: value.interfaceMuted ?? DEFAULT_AUDIO_MIXER_SETTINGS.interfaceMuted,
  });
}

export function effectiveGain(
  category: Exclude<AudioCategory, "master">,
  settings: AudioMixerSettings,
  temporaryMuteReasons: ReadonlySet<TemporaryMuteReason> = new Set(),
): number {
  if (temporaryMuteReasons.size > 0 || settings.masterMuted) return 0;
  const master = clampVolume(settings.masterVolume);
  switch (category) {
    case "music":
      return settings.musicMuted ? 0 : master * clampVolume(settings.musicVolume);
    case "sfx":
      return settings.sfxMuted ? 0 : master * clampVolume(settings.sfxVolume);
    case "interface":
      return settings.interfaceMuted ? 0 : master * clampVolume(settings.interfaceVolume);
  }
}

/** Schedules every audible gain change as a short ramp to avoid clicks and pops. */
export function rampGain(
  gain: GainParamPort,
  target: number,
  now: number,
  durationSeconds: number,
): void {
  const safeTarget = clampVolume(target);
  const safeDuration = Math.max(0.001, durationSeconds);
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(clampVolume(gain.value), now);
  gain.linearRampToValueAtTime(safeTarget, now + safeDuration);
}

export class HierarchicalAudioMixer {
  readonly #context: AudioGraphContext;
  readonly #rampSeconds: number;
  readonly #settingsStore: AudioSettingsStore | null;
  readonly #temporaryMuteReasons = new Set<TemporaryMuteReason>();
  readonly #categoryBuses: Record<AudioCategory, GainNodePort>;
  readonly #sfxBuses: Record<SfxRoute, GainNodePort>;
  #settings: AudioMixerSettings;
  #disposed = false;

  constructor(
    context: AudioGraphContext,
    initialSettings: Partial<AudioMixerSettings> | undefined,
    settingsStore: AudioSettingsStore | null = null,
    rampSeconds = 0.015,
  ) {
    this.#context = context;
    this.#settingsStore = settingsStore;
    this.#rampSeconds = Math.max(0.001, rampSeconds);
    this.#settings = normalizeAudioMixerSettings(initialSettings);

    this.#categoryBuses = {
      master: context.createGain("master"),
      music: context.createGain("music"),
      sfx: context.createGain("sfx"),
      interface: context.createGain("interface"),
    };
    this.#sfxBuses = {
      weapons: context.createGain("sfx.weapons"),
      enemies: context.createGain("sfx.enemies"),
      player: context.createGain("sfx.player"),
      environment: context.createGain("sfx.environment"),
    };

    this.#categoryBuses.master.connect(context.destination);
    this.#categoryBuses.music.connect(this.#categoryBuses.master);
    this.#categoryBuses.sfx.connect(this.#categoryBuses.master);
    this.#categoryBuses.interface.connect(this.#categoryBuses.master);
    for (const node of Object.values(this.#sfxBuses)) node.connect(this.#categoryBuses.sfx);
    this.#applySettings();
    for (const node of Object.values(this.#sfxBuses)) this.#schedule(node, 1);
  }

  get settings(): AudioMixerSettings {
    return this.#settings;
  }

  get temporaryMuteReasons(): ReadonlySet<TemporaryMuteReason> {
    return this.#temporaryMuteReasons;
  }

  categoryBus(category: Exclude<AudioCategory, "master">): GainNodePort {
    this.#assertActive();
    return this.#categoryBuses[category];
  }

  sfxBus(route: SfxRoute): GainNodePort {
    this.#assertActive();
    return this.#sfxBuses[route];
  }

  setVolume(category: AudioCategory, value: number): void {
    this.#assertActive();
    const key = VOLUME_KEYS[category];
    this.#settings = normalizeAudioMixerSettings({ ...this.#settings, [key]: value });
    this.#settingsStore?.save(this.#settings);
    this.#applySettings();
  }

  setMuted(category: AudioCategory, muted: boolean): void {
    this.#assertActive();
    const key = MUTED_KEYS[category];
    this.#settings = normalizeAudioMixerSettings({ ...this.#settings, [key]: muted });
    this.#settingsStore?.save(this.#settings);
    this.#applySettings();
  }

  setTemporaryMute(reason: TemporaryMuteReason, muted: boolean): void {
    this.#assertActive();
    if (muted) this.#temporaryMuteReasons.add(reason);
    else this.#temporaryMuteReasons.delete(reason);
    this.#applyMaster();
  }

  setSfxRouteGain(route: SfxRoute, gain: number): void {
    this.#assertActive();
    this.#schedule(this.#sfxBuses[route], gain);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const node of [...Object.values(this.#sfxBuses), ...Object.values(this.#categoryBuses)]) {
      node.disconnect();
    }
  }

  #applySettings(): void {
    this.#applyMaster();
    this.#schedule(
      this.#categoryBuses.music,
      this.#settings.musicMuted ? 0 : this.#settings.musicVolume,
    );
    this.#schedule(
      this.#categoryBuses.sfx,
      this.#settings.sfxMuted ? 0 : this.#settings.sfxVolume,
    );
    this.#schedule(
      this.#categoryBuses.interface,
      this.#settings.interfaceMuted ? 0 : this.#settings.interfaceVolume,
    );
  }

  #applyMaster(): void {
    this.#schedule(
      this.#categoryBuses.master,
      this.#settings.masterMuted || this.#temporaryMuteReasons.size > 0
        ? 0
        : this.#settings.masterVolume,
    );
  }

  #schedule(node: GainNodePort, target: number): void {
    rampGain(node.gain, target, this.#context.currentTime, this.#rampSeconds);
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("Audio mixer has been disposed");
  }
}

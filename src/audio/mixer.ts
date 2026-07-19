export type AudioCategory = "master" | "music" | "sfx" | "interface";
export type TemporaryMuteReason = "ad" | "portal" | "visibility" | "platform-suspend" | "system";

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

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function effectiveGain(
  category: Exclude<AudioCategory, "master">,
  settings: AudioMixerSettings,
  temporaryMuteReasons: ReadonlySet<TemporaryMuteReason> = new Set(),
): number {
  if (temporaryMuteReasons.size > 0 || settings.masterMuted) return 0;
  const master = clampVolume(settings.masterVolume);
  switch (category) {
    case "music": return settings.musicMuted ? 0 : master * clampVolume(settings.musicVolume);
    case "sfx": return settings.sfxMuted ? 0 : master * clampVolume(settings.sfxVolume);
    case "interface": return settings.interfaceMuted ? 0 : master * clampVolume(settings.interfaceVolume);
  }
}

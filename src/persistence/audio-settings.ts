import { DEFAULT_AUDIO_MIXER_SETTINGS, type AudioMixerSettings } from "../audio/mixer";

export const AUDIO_SETTINGS_SCHEMA_VERSION = 2;

export interface PersistedAudioSettingsV2 extends AudioMixerSettings {
  readonly schemaVersion: typeof AUDIO_SETTINGS_SCHEMA_VERSION;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function volume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Migrates both Tear's legacy `{ vol, music }` settings and the v2 mixer record. */
export function migrateAudioSettings(value: unknown): PersistedAudioSettingsV2 {
  const source = record(value);
  const legacyMaster = volume(source.vol, DEFAULT_AUDIO_MIXER_SETTINGS.masterVolume);
  const legacyMusicOn = flag(source.music, true);
  return Object.freeze({
    schemaVersion: AUDIO_SETTINGS_SCHEMA_VERSION,
    masterVolume: volume(source.masterVolume, legacyMaster),
    musicVolume: volume(source.musicVolume, DEFAULT_AUDIO_MIXER_SETTINGS.musicVolume),
    sfxVolume: volume(source.sfxVolume, DEFAULT_AUDIO_MIXER_SETTINGS.sfxVolume),
    interfaceVolume: volume(source.interfaceVolume, DEFAULT_AUDIO_MIXER_SETTINGS.interfaceVolume),
    masterMuted: flag(source.masterMuted, DEFAULT_AUDIO_MIXER_SETTINGS.masterMuted),
    musicMuted: flag(source.musicMuted, !legacyMusicOn),
    sfxMuted: flag(source.sfxMuted, DEFAULT_AUDIO_MIXER_SETTINGS.sfxMuted),
    interfaceMuted: flag(source.interfaceMuted, DEFAULT_AUDIO_MIXER_SETTINGS.interfaceMuted),
  });
}

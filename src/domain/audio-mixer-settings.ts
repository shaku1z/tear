/** The saved audio mixer record and its defaults; shared by the mixer (audio) and settings storage (persistence). */
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

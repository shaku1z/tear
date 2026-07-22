const DEFAULT_DIALOGUE_VOICE = [392, "sine", 0.025] as const;
const DIALOGUE_VOICES: Readonly<Record<string, readonly [number, OscillatorType, number]>> = {
  warden: [185, "square", 0.035],
  colossus: [78, "sawtooth", 0.05],
  aldric: [246, "triangle", 0.05],
  echo: [660, "sine", 0.04],
  source: [92, "triangle", 0.05],
  chapter: DEFAULT_DIALOGUE_VOICE,
};

export function dialogueVoice(identity: string): readonly [number, OscillatorType, number] {
  return DIALOGUE_VOICES[identity] ?? DEFAULT_DIALOGUE_VOICE;
}

export function legacyNumberDefault(value: number | undefined, fallback: number): number {
  if (!value) return fallback;
  return value;
}

export function legacyMuteReason(reason: string | undefined): string {
  return reason === undefined || reason.length === 0 ? "default" : reason;
}

import type { StemCueManifest, Tier } from "./types";

/** Below this dB floor a stem is treated as fully silent (linear gain 0). */
export const SILENCE_DB = -60;

export function dbToGain(db: number): number {
  if (db <= SILENCE_DB) return 0;
  return 10 ** (db / 20);
}

export function gainToDb(gain: number): number {
  if (gain <= 0) return SILENCE_DB;
  return 20 * Math.log10(gain);
}

/**
 * Resolve a tier into a target *linear* gain per stem. Stems absent from the
 * tier mix are silent (0). The static per-stem `gainDb` trim is folded in so the
 * caller can drive one bus gain per stem.
 *
 * This is the heart of "tiers via gain, not restart": the player only ramps
 * these values; it never stops or re-seeks a voice.
 */
export function planTierGains(
  cue: StemCueManifest,
  tier: Tier,
): Record<string, number> {
  const mix = cue.tiers[tier] ?? {};
  const out: Record<string, number> = {};
  for (const stem of cue.stems) {
    const tierDb = mix[stem.id];
    out[stem.id] = tierDb === undefined ? 0 : dbToGain(tierDb + stem.gainDb);
  }
  return out;
}

/** Seconds per bar for this cue, used to quantize tier/section transitions. */
export function secondsPerBar(cue: StemCueManifest): number {
  const [beatsPerBar] = [cue.grid.beatsPerBar];
  return (60 / cue.tempo) * beatsPerBar;
}

/** Loop length in seconds derived from the canonical integer frames. */
export function loopSeconds(cue: StemCueManifest): {
  startSeconds: number;
  endSeconds: number;
  lengthSeconds: number;
} {
  const startSeconds = cue.loop.startFrame / cue.sourceSampleRate;
  const endSeconds = cue.loop.endFrame / cue.sourceSampleRate;
  return { startSeconds, endSeconds, lengthSeconds: endSeconds - startSeconds };
}

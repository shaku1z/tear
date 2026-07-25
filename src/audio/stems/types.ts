/**
 * Recorded adaptive stem-cue format for TearScore.
 *
 * A cue is a set of phase-aligned recorded stems sharing one musical grid and
 * one loop boundary. Gameplay intensity is expressed as a *tier* (0..4) that
 * maps to a per-stem gain balance. Tiers change by ramping bus gains — stems are
 * never stopped, restarted, or re-seeked, which preserves phase alignment.
 *
 * The canonical loop/intro/outro boundaries are integer *source sample frames*,
 * not rounded seconds, so a browser AudioContext that resamples the asset still
 * gets a stable sample-aligned boundary (convert with `frame / sourceSampleRate`).
 */

export type LoopMode = "hard" | "crossfade" | "tail-overlap";

/** Recommended role vocabulary; any string is accepted so cues can group freely. */
export type StemRole =
  | "bed"
  | "bass"
  | "rhythm"
  | "motif"
  | "apex"
  | "texture"
  | (string & {});

export type Tier = 0 | 1 | 2 | 3 | 4;

export interface StemSource {
  /** Relative asset URL. */
  readonly url: string;
  /** Full MIME + codec string, e.g. `audio/webm; codecs="opus"`. */
  readonly mime: string;
}

export interface StemAsset {
  readonly id: string;
  readonly role: StemRole;
  readonly channels: 1 | 2;
  /** Static trim applied on top of tier gain. */
  readonly gainDb: number;
  /** Codec alternatives; the loader picks the first the browser can play. */
  readonly sources: readonly StemSource[];
  /** Per-stem seam behaviour (drums=hard, pads=crossfade, reverb=tail-overlap). */
  readonly seamMode?: LoopMode;
  readonly crossfadeFrames?: number;
}

export interface CueRegion {
  readonly startFrame: number;
  readonly endFrame: number;
}

export interface LoopRegion extends CueRegion {
  readonly mode: LoopMode;
  readonly crossfadeFrames?: number;
}

export interface CueGrid {
  readonly downbeatFrame: number;
  readonly beatsPerBar: number;
  readonly barsPerLoop: number;
  /**
   * Bar length derived from the loop itself (`loopLength / barsPerLoop`) rather
   * than from the display tempo, so the phrase grid provably matches the audio.
   */
  readonly secondsPerBar?: number;
  /** Full-precision tempo implied by `secondsPerBar`; `tempo` is the rounded one. */
  readonly approvedBpm?: number;
  /**
   * False when the loop is not a whole number of bars, so no honest phrase
   * boundary exists. Such cues still loop; they just swap immediately.
   */
  readonly barQuantizedCompatible?: boolean;
}

/** Per-tier balance: stem id -> gain in dB (absent stem = silent at that tier). */
export type TierMix = Record<string, number>;

export interface StemCueManifest {
  readonly format: "tear-score-stem-cue";
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  readonly tempo: number;
  readonly timeSignature: readonly [number, number];
  readonly sourceSampleRate: number;
  readonly key?: string;
  readonly grid: CueGrid;
  readonly loop: LoopRegion;
  readonly intro?: CueRegion;
  readonly outro?: CueRegion;
  readonly stems: readonly StemAsset[];
  readonly tiers: Readonly<Record<Tier, TierMix>>;
  readonly transitions?: {
    readonly bossEntry?: string;
    readonly bossPhase?: string;
    readonly victory?: string;
    readonly defeat?: string;
  };
  readonly provenance: {
    readonly owner: string;
    readonly license: string;
    readonly sourceProject?: string;
    readonly sourceSha256?: string;
  };
}

export interface CueValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

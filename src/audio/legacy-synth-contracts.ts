import type {
  MusicContextSnapshot,
  MusicEvent,
  MusicRunSessionMetadata,
} from "./music-contracts";
import type { SfxRoute } from "./mixer";

export interface LegacyEffectsGraph {
  readonly context: AudioContext;
  readonly effectsInputs: Readonly<Record<SfxRoute, GainNode>>;
  readonly interfaceInput: AudioNode;
}

export interface LegacyMusicGraph {
  readonly gain: GainNode;
  readonly filter: BiquadFilterNode;
}

export interface LegacyOscillatorOptions {
  readonly type?: OscillatorType;
  readonly slideTo?: number;
  readonly vol?: number;
  readonly attack?: number;
  readonly dest?: AudioNode;
}

export interface LegacyNoiseOptions {
  readonly type?: BiquadFilterType;
  readonly freq?: number;
  readonly q?: number;
  readonly vol?: number;
  readonly dest?: AudioNode;
}

/** Narrow host contract consumed by the legacy fallback sequencer. */
export interface LegacyMusicSynthHost {
  context(): AudioContext | null;
  output(): AudioNode | null;
  voidMix(): number;
  oscillator(frequency: number, duration: number, time: number, options: LegacyOscillatorOptions): void;
  noise(duration: number, time: number, options: LegacyNoiseOptions): void;
  trackSource(source: AudioScheduledSourceNode, connectedNodes: readonly AudioNode[]): boolean;
}

/** Explicit compatibility contract required by AudioSystem and the game facade. */
export interface LegacySynthContract {
  vol: number;
  musicVol: number;
  musicOn: boolean;
  muted: boolean;
  _musicDuck: number;
  _bindEffects(graph: LegacyEffectsGraph): void;
  _disposeEffects(): void;
  _bindLegacyMusic(graph: LegacyMusicGraph): void;
  _startMusic(): void;
  _stopMusic(): void;
}

export interface LegacyMusicBridge {
  beginMusicRun(metadata: MusicRunSessionMetadata): void;
  updateMusicContext(snapshot: MusicContextSnapshot): void;
  emitMusicEvent(event: MusicEvent): void;
  endMusicRun(): void;
}

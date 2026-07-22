import type { AudioGraphContext, AudioNodePort, SfxRoute } from "./mixer";

export interface AudioEffectsBackendHost {
  readonly context: AudioGraphContext;
  readonly sfxOutput: (route: SfxRoute) => AudioNodePort;
  readonly interfaceOutput: AudioNodePort;
}

/** Owns cue synthesis/routing while AudioSystem remains the sole context owner. */
export interface AudioEffectsBackend {
  initialize(host: AudioEffectsBackendHost): Promise<void>;
  dispose(): Promise<void>;
  debugResourceSnapshot?(): Readonly<{ readonly graphNodes: number }>;
}

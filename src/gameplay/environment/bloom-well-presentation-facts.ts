import type { EnvironmentGeometry } from "./environment-contracts";
import type { BloomWellState } from "./bloom-well";

export interface BloomWellPresentationOptions {
  readonly highContrast?: boolean;
  readonly reducedMotion?: boolean;
  readonly lowGraphics?: boolean;
  readonly audioEnabled?: boolean;
}

export interface BloomWellPresentationFacts {
  readonly id: string;
  readonly state: BloomWellState["state"];
  readonly geometry: EnvironmentGeometry;
  readonly boundaryVisible: boolean;
  readonly highContrast: boolean;
  readonly lowGraphics: boolean;
  readonly motionScale: number;
  readonly audioIndependent: boolean;
  readonly audioEnabled: boolean;
}

/** Renderer/audio-neutral facts; accessibility settings never remove the gameplay boundary. */
export function projectBloomWellPresentation(
  state: Pick<BloomWellState, "id" | "state" | "geometry">,
  options: BloomWellPresentationOptions = {},
): BloomWellPresentationFacts {
  return Object.freeze({
    id: state.id, state: state.state, geometry: state.geometry, boundaryVisible: true,
    highContrast: options.highContrast === true, lowGraphics: options.lowGraphics === true,
    motionScale: options.reducedMotion === true ? 0 : 1,
    audioIndependent: true, audioEnabled: options.audioEnabled !== false,
  });
}

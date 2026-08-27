import type { EnvironmentCombatObjectState, EnvironmentGeometry } from "./environment-contracts";
import type { RootbinderPhase } from "../entities/rootbinder-runtime";

export interface RootbinderPresentationOptions {
  readonly highContrast?: boolean;
  readonly reducedMotion?: boolean;
  readonly lowGraphics?: boolean;
  readonly audioEnabled?: boolean;
}

export interface RootbinderPresentationFacts {
  readonly sourceNode: { readonly x: number; readonly y: number; readonly color: "gold" };
  readonly state: RootbinderPhase;
  readonly warningGeometry: readonly EnvironmentGeometry[];
  readonly activeSegments: readonly EnvironmentGeometry[];
  readonly severFeedback: readonly string[];
  readonly boundaryVisible: boolean;
  readonly highContrast: boolean;
  readonly lowGraphics: boolean;
  readonly motionScale: number;
  readonly audioIndependent: boolean;
  readonly audioEnabled: boolean;
}

/** Renderer/audio-neutral Rootbinder facts; accessibility settings never hide gameplay geometry. */
export function projectRootbinderPresentation(
  source: Readonly<{ x: number; y: number; state: RootbinderPhase }>,
  segments: readonly EnvironmentCombatObjectState[],
  options: RootbinderPresentationOptions = {},
): RootbinderPresentationFacts {
  const warningGeometry: EnvironmentGeometry[] = [];
  const activeSegments: EnvironmentGeometry[] = [];
  const severFeedback: string[] = [];
  for (const segment of segments) {
    if (segment.state === "warning") warningGeometry.push(segment.geometry);
    if (segment.state === "active") activeSegments.push(segment.geometry);
    if (segment.state === "destroyed" || segment.state === "expired") severFeedback.push(segment.id);
  }
  return Object.freeze({
    sourceNode: Object.freeze({ x: source.x, y: source.y, color: "gold" as const }),
    state: source.state,
    warningGeometry: Object.freeze(warningGeometry),
    activeSegments: Object.freeze(activeSegments),
    severFeedback: Object.freeze(severFeedback),
    boundaryVisible: true,
    highContrast: options.highContrast === true,
    lowGraphics: options.lowGraphics === true,
    motionScale: options.reducedMotion === true ? 0 : 1,
    audioIndependent: true,
    audioEnabled: options.audioEnabled !== false,
  });
}

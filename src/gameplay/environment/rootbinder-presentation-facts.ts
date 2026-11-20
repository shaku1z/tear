import type { EnvironmentCombatObjectState, EnvironmentGeometry } from "./environment-contracts";
import { rootbinderStandsStill, rootbinderWindup, type RootbinderState } from "../entities/rootbinder-runtime";

export interface RootbinderPresentationOptions {
  readonly highContrast?: boolean;
  readonly reducedMotion?: boolean;
  readonly lowGraphics?: boolean;
  readonly audioEnabled?: boolean;
}

export interface RootbinderPresentationFacts {
  readonly sourceNode: { readonly x: number; readonly y: number; readonly color: "gold" };
  /** It stands in the ground: winding up, planted or uprooted. */
  readonly planted: boolean;
  /** How far through its plant wind-up it is, 0 to 1; the warning that roots are coming. */
  readonly windup: number;
  /** Its roots were cut or it took a heavy hit: it is stunned where it stands. */
  readonly uprooted: boolean;
  /** One line per live root, from the Rootbinder to the ally it holds. */
  readonly roots: readonly EnvironmentGeometry[];
  readonly highContrast: boolean;
  readonly lowGraphics: boolean;
  readonly motionScale: number;
  readonly audioIndependent: boolean;
  readonly audioEnabled: boolean;
}

/** Renderer/audio-neutral Rootbinder facts; accessibility settings never hide gameplay geometry. */
export function projectRootbinderPresentation(
  source: Readonly<{ x: number; y: number; state: RootbinderState }>,
  links: readonly EnvironmentCombatObjectState[],
  options: RootbinderPresentationOptions = {},
): RootbinderPresentationFacts {
  return Object.freeze({
    sourceNode: Object.freeze({ x: source.x, y: source.y, color: "gold" as const }),
    planted: rootbinderStandsStill(source.state.state),
    windup: rootbinderWindup(source.state),
    uprooted: source.state.state === "uprooted",
    roots: Object.freeze(links.filter((link) => link.state === "active").map((link) => link.geometry)),
    highContrast: options.highContrast === true,
    lowGraphics: options.lowGraphics === true,
    motionScale: options.reducedMotion === true ? 0 : 1,
    audioIndependent: true,
    audioEnabled: options.audioEnabled !== false,
  });
}

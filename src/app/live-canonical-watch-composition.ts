import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import type { TearSimulationWorldView } from "../simulation/runtime-world-port";

export interface LiveCanonicalWatchCompositionInput {
  readonly state: TearSimulationWorldView;
  readonly screen: () => string;
  readonly canonicalGameplayState: () => CanonicalGameplayState | null;
}

/**
 * Production-owned source contract for strict C32 V3 Watch inference.  It
 * exposes the exact C30/C27A post-step snapshot and action routing vocabulary
 * without passing through a TearBench observation projection.
 */
export function createLiveCanonicalWatchComposition(input: LiveCanonicalWatchCompositionInput): Readonly<{
  canonicalGameplayState: () => CanonicalGameplayState | null;
  availableGameActions: () => readonly GameAction["type"][];
}> {
  return Object.freeze({
    canonicalGameplayState: input.canonicalGameplayState,
    availableGameActions: () => {
      const run = input.state.run(), screen = input.screen();
      if (run === null) return Object.freeze(["interact", "confirm", "cancel"] as const);
      if (screen === "playing") return Object.freeze([
        "move", "aim", "weapon", "jump", "dash",
        ...(run.mode === "playground" ? ["ability" as const] : []), "pause",
      ] as const);
      if (screen === "draft") return Object.freeze(["draft-choice"] as const);
      if (screen === "reserve") return Object.freeze(["reserve-choice", "cancel"] as const);
      if (screen === "tierup") return Object.freeze(["tier-up-choice"] as const);
      if (screen === "paused") return Object.freeze(["confirm", "cancel", "pause"] as const);
      return Object.freeze(["interact", "confirm", "cancel"] as const);
    },
  });
}

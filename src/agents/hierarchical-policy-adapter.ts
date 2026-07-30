import {
  TearHierarchicalAgentOrchestrator,
  type TearHierarchicalObservation,
  type TearStructuredAgentIntent,
} from "../tearbench/scripted-agent-hierarchy";
import type {
  TearAgentDecision,
  TearAgentObservation,
  TearAgentProfileId,
} from "./contracts";
import { TearAgentOrchestrator } from "./scripted-policy";

export interface TearLiveHierarchicalDecision extends TearAgentDecision {
  readonly structuredIntent: TearStructuredAgentIntent;
}

function operationalObservation(
  observation: TearAgentObservation,
): TearHierarchicalObservation {
  const screen = observation.ui?.screen ?? "playing";
  return Object.freeze({
    ...observation,
    signals: Object.freeze({
      loading: screen === "loading",
      focused: true,
      deviceConnected: true,
      terminal: screen === "win" || screen === "gameover",
      progressToken: [
        screen,
        observation.state.run.wave,
        observation.state.run.score,
        Math.round(observation.state.player.hp),
        observation.state.entities.length,
      ].join(":"),
    }),
  });
}

/**
 * Action-authoritative live boundary. Every hierarchy layer observes the real
 * operational decision, finalizes the exact batch returned to the runtime, and
 * may replace it only for fatal invariant/watchdog recovery.
 */
export class TearLiveHierarchicalPolicy {
  readonly #control: TearAgentOrchestrator;
  readonly #hierarchy: TearHierarchicalAgentOrchestrator;

  constructor(profile: TearAgentProfileId = "competent") {
    this.#control = new TearAgentOrchestrator(profile);
    this.#hierarchy = new TearHierarchicalAgentOrchestrator(profile);
  }

  get memory() {
    return this.#hierarchy.memory;
  }

  decide(observation: TearAgentObservation): TearLiveHierarchicalDecision {
    const control = this.#control.decide(observation);
    const hierarchy = this.#hierarchy.decide(operationalObservation(observation), control);
    return Object.freeze({
      ...control,
      actions: hierarchy.actions,
      structuredIntent: hierarchy.intent,
    });
  }
}

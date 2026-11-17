import type { TearGameplayEvent, TearGameplayEventBus } from "../../gameplay/runtime/gameplay-events";
import { createLiveGhostCausalEvent } from "../../ghost/live-causal-events";
import type { GhostLiveRecorder } from "../../ghost/live-recorder";
import { executeEnvironmentTelemetryIntents } from "../../gameplay/progression/environment-telemetry";
import { verdantTelemetryIntents } from "../../gameplay/progression/verdant-telemetry";
import { paleTelemetryIntents } from "../../gameplay/progression/pale-telemetry";
import type { ProfileStatsPersistence } from "../progress/profile-stats-persistence";

type GameplayEventObserver = (event: TearGameplayEvent) => void;

/** Run-event observers that are constructed after the subscription is installed. */
export interface LiveGameplayEventObservers {
  readonly challenge: GameplayEventObserver;
  readonly chase: GameplayEventObserver;
}

export interface LiveGameplayEventFanOutOptions {
  readonly events: TearGameplayEventBus;
  readonly career: Readonly<{ observe: GameplayEventObserver }>;
  readonly recorder: GhostLiveRecorder | null;
  readonly nextEventSequence: () => number;
  /** Whether the event may advance persistent biome telemetry. */
  readonly recordsTelemetry: () => boolean;
  readonly profileStats: ProfileStatsPersistence;
}

export interface LiveGameplayEventFanOut {
  readonly bind: (observers: Partial<LiveGameplayEventObservers>) => void;
}

/**
 * Installs the live runtime's one gameplay-event subscription. Observers run in
 * a fixed order: ghost challenge, ghost chase, career, the Ghost V3 causal
 * stream, then biome telemetry.
 */
export function subscribeLiveGameplayEventFanOut(options: LiveGameplayEventFanOutOptions): LiveGameplayEventFanOut {
  const { career, recorder } = options;
  let observeChallengeEvent: GameplayEventObserver = () => undefined;
  let observeChaseEvent: GameplayEventObserver = () => undefined;
  options.events.subscribe((event) => {
    observeChallengeEvent(event);
    observeChaseEvent(event);
    career.observe(event);
    recorder?.record("events", event.tick, createLiveGhostCausalEvent(event, options.nextEventSequence()));
    if (options.recordsTelemetry()) {
      executeEnvironmentTelemetryIntents(
        [...verdantTelemetryIntents(event), ...paleTelemetryIntents(event)],
        options.profileStats,
      );
    }
  });
  return Object.freeze({
    bind(observers: Partial<LiveGameplayEventObservers>): void {
      if (observers.challenge !== undefined) observeChallengeEvent = observers.challenge;
      if (observers.chase !== undefined) observeChaseEvent = observers.chase;
    },
  });
}

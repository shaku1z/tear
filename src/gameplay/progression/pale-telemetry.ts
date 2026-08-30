import type { TearGameplayEvent } from "../runtime/gameplay-events";
import type { EnvironmentTelemetryIntent } from "./environment-telemetry";

/** Pale-owned mapping from authored runtime facts to generic profile intents. */
export function paleTelemetryIntents(event: TearGameplayEvent): readonly EnvironmentTelemetryIntent[] {
  if (event.kind === "stage" && event.transition === "entered" && event.stageId === "pale-traverse") {
    return Object.freeze([{ type: "profile-max", stat: "paleEntered", value: 1 }]);
  }
  if (event.kind === "environment" && event.event === "field-started" && event.objectKind === "aurora-track") {
    return Object.freeze([{ type: "profile-add", stat: "auroraTracksActivated", amount: 1 }]);
  }
  return Object.freeze([]);
}

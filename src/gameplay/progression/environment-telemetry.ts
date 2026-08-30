import type { TearGameplayEvent } from "../runtime/gameplay-events";

export type EnvironmentTelemetryIntent =
  | Readonly<{ type: "profile-add"; stat: string; amount: number }>
  | Readonly<{ type: "profile-max"; stat: string; value: number }>;

/** Biome-neutral dispatch point; each sibling telemetry adapter owns its vocabulary. */
export function executeEnvironmentTelemetryIntents(
  intents: readonly EnvironmentTelemetryIntent[],
  port: Readonly<{ add(stat: string, amount: number): void; max(stat: string, value: number): void }>,
): void {
  for (const intent of intents) {
    if (intent.type === "profile-add") port.add(intent.stat, intent.amount);
    else port.max(intent.stat, intent.value);
  }
}

export function paleTelemetryIntents(event: TearGameplayEvent): readonly EnvironmentTelemetryIntent[] {
  if (event.kind === "stage" && event.transition === "entered" && event.stageId === "pale-traverse") {
    return Object.freeze([{ type: "profile-max", stat: "paleEntered", value: 1 }]);
  }
  if (event.kind === "environment" && event.event === "field-started" && event.objectKind === "aurora-track") {
    return Object.freeze([{ type: "profile-add", stat: "auroraTracksActivated", amount: 1 }]);
  }
  return Object.freeze([]);
}

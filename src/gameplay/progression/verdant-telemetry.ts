import type { TearGameplayEvent } from "../runtime/gameplay-events";

export type VerdantTelemetryIntent =
  | Readonly<{ type: "profile-add"; stat: string; amount: number }>
  | Readonly<{ type: "profile-max"; stat: string; value: number }>;

/** Maps only authoritative gameplay facts; presentation state never contributes telemetry. */
export function verdantTelemetryIntents(event: TearGameplayEvent): readonly VerdantTelemetryIntent[] {
  if (event.kind === "stage" && event.transition === "entered" && event.stageId === "verdant-sanctum") {
    return Object.freeze([{ type: "profile-max", stat: "verdantEntered", value: 1 }]);
  }
  if (event.kind !== "environment") return Object.freeze([]);
  if (event.event === "field-started" && event.objectKind === "bloom-well") {
    return Object.freeze([{ type: "profile-add", stat: "bloomWellsActivated", amount: 1 }]);
  }
  if (event.event !== "combat-object-destroyed") return Object.freeze([]);
  if (event.objectKind === "root-link") {
    return Object.freeze([{ type: "profile-add", stat: "rootLinksSevered", amount: 1 }]);
  }
  if (event.objectKind === "graft-anchor") {
    return Object.freeze([{ type: "profile-add", stat: "graftsDestroyed", amount: 1 }]);
  }
  return Object.freeze([]);
}

export function executeVerdantTelemetryIntents(
  intents: readonly VerdantTelemetryIntent[],
  port: Readonly<{ add(stat: string, amount: number): void; max(stat: string, value: number): void }>,
): void {
  for (const intent of intents) {
    if (intent.type === "profile-add") port.add(intent.stat, intent.amount);
    else port.max(intent.stat, intent.value);
  }
}

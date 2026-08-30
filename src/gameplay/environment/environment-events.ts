import type { EnvironmentObjectCategory } from "./environment-contracts";
import type { EnvironmentObjectKind } from "./environment-object-kinds";
import type { TearGameplayEventPort } from "../runtime/gameplay-events";

export type EnvironmentEventName = "field-started" | "field-resolved" | "combat-object-link-created" | "combat-object-damaged" | "combat-object-destroyed" | "object-cleaned";

export interface EnvironmentEventInput {
  readonly event: EnvironmentEventName;
  readonly objectId: string;
  readonly category: EnvironmentObjectCategory;
  readonly objectKind: EnvironmentObjectKind;
  readonly integrity?: number;
  readonly reason?: string;
}

export const ENVIRONMENT_EVENT_PHASES: Readonly<Record<EnvironmentEventName, "projectiles-and-hazards" | "collision-and-damage" | "deaths-and-rewards" | "post-simulation-commit">> = Object.freeze({
  "field-started": "projectiles-and-hazards", "field-resolved": "deaths-and-rewards",
  "combat-object-link-created": "collision-and-damage", "combat-object-damaged": "collision-and-damage", "combat-object-destroyed": "deaths-and-rewards",
  "object-cleaned": "post-simulation-commit",
});

/** Synchronous source-owned publisher; event-bus arrival order is the within-tick order. */
export function publishEnvironmentEvent(events: TearGameplayEventPort, input: EnvironmentEventInput, tick?: number): void {
  const event = { kind: "environment" as const, event: input.event, objectId: input.objectId, category: input.category,
    objectKind: input.objectKind, ...(input.integrity === undefined ? {} : { integrity: input.integrity }),
    ...(input.reason === undefined ? {} : { reason: input.reason }) };
  if (tick === undefined) events.emit(event);
  else events.publish({ ...event, tick });
}

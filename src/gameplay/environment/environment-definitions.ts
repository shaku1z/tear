import type { EnvironmentObjectCategory, EnvironmentObjectKind } from "./environment-contracts";

export interface EnvironmentObjectDefinition {
  readonly kind: EnvironmentObjectKind;
  readonly category: EnvironmentObjectCategory;
  readonly behavior: "generic-field" | "generic-combat-object" | "data-only-route";
  readonly counterplayTags: readonly EnvironmentCounterplayTag[];
  readonly grantsEnemyRewards: false;
  readonly ordinaryEnemyProcEligible: false;
}

export type EnvironmentCounterplayTag = "cut" | "break" | "projectile-cut";

export function isEnvironmentObjectKind(value: unknown): value is EnvironmentObjectKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ENVIRONMENT_OBJECT_DEFINITIONS, value);
}

/** Source-owned environment metadata. It declares capabilities, not biome behavior. */
export const ENVIRONMENT_OBJECT_DEFINITIONS: Readonly<Record<EnvironmentObjectKind, EnvironmentObjectDefinition>> = Object.freeze({
  "bloom-well": Object.freeze({ kind: "bloom-well", category: "field", behavior: "generic-field", counterplayTags: [] as const, grantsEnemyRewards: false, ordinaryEnemyProcEligible: false }),
  "rootline": Object.freeze({ kind: "rootline", category: "field", behavior: "generic-field", counterplayTags: [] as const, grantsEnemyRewards: false, ordinaryEnemyProcEligible: false }),
  "root-link": Object.freeze({ kind: "root-link", category: "combat-object", behavior: "generic-combat-object", counterplayTags: ["cut", "break", "projectile-cut"] as const, grantsEnemyRewards: false, ordinaryEnemyProcEligible: false }),
  "graft-anchor": Object.freeze({ kind: "graft-anchor", category: "combat-object", behavior: "generic-combat-object", counterplayTags: ["cut", "break", "projectile-cut"] as const, grantsEnemyRewards: false, ordinaryEnemyProcEligible: false }),
  "regrowth-link": Object.freeze({ kind: "regrowth-link", category: "route", behavior: "data-only-route", counterplayTags: [] as const, grantsEnemyRewards: false, ordinaryEnemyProcEligible: false }),
});

export const ENVIRONMENT_FIELD_KIND_IDS = Object.freeze(
  Object.values(ENVIRONMENT_OBJECT_DEFINITIONS).filter((entry) => entry.category === "field").map((entry) => entry.kind),
);
export const ENVIRONMENT_COMBAT_OBJECT_KIND_IDS = Object.freeze(
  Object.values(ENVIRONMENT_OBJECT_DEFINITIONS).filter((entry) => entry.category === "combat-object").map((entry) => entry.kind),
);
export const ENVIRONMENT_ROUTE_KIND_IDS = Object.freeze(
  Object.values(ENVIRONMENT_OBJECT_DEFINITIONS).filter((entry) => entry.category === "route").map((entry) => entry.kind),
);

export function environmentObjectDefinition(kind: EnvironmentObjectKind): EnvironmentObjectDefinition {
  return ENVIRONMENT_OBJECT_DEFINITIONS[kind];
}

export function assertEnvironmentObjectCategory(category: EnvironmentObjectCategory, kind: unknown): EnvironmentObjectDefinition {
  if (!isEnvironmentObjectKind(kind)) throw new TypeError(`environment ${category} kind is not source-owned`);
  const definition = environmentObjectDefinition(kind);
  if (definition.category !== category) throw new TypeError(`environment kind ${kind} is not approved for ${category} collection`);
  return definition;
}

export function assertEnvironmentCombatCapabilities(
  kind: unknown,
  counterplayTags: readonly string[],
  procEligible: unknown,
): void {
  const definition = assertEnvironmentObjectCategory("combat-object", kind);
  if (procEligible !== false) throw new TypeError("environment combat objects cannot be ordinary-proc eligible");
  if (new Set(counterplayTags).size !== counterplayTags.length) throw new TypeError("environment counterplay tags must be unique");
  const allowed = new Set(definition.counterplayTags);
  if (counterplayTags.some((tag) => !allowed.has(tag as EnvironmentCounterplayTag))) {
    throw new TypeError(`environment counterplay tag is not allowed for ${definition.kind}`);
  }
}

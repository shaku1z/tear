import type { EnvironmentObjectCategory } from "./environment-contracts";
import type { EnvironmentObjectKind } from "./environment-object-kinds";

export interface EnvironmentObjectDefinition {
  readonly kind: EnvironmentObjectKind;
  readonly category: EnvironmentObjectCategory;
  readonly behavior: "generic-field" | "generic-combat-object" | "data-only-route";
  readonly counterplayTags: readonly EnvironmentCounterplayTag[];
  /**
   * How an object of this kind ends. Every kind ends; once ended it fades and the environment runtime
   * removes it. `tests/unit/stage-object-lifetime-rules.test.ts` sees each kind end and leave.
   */
  readonly endsWhen: readonly EnvironmentObjectEnding[];
  readonly grantsEnemyRewards: false;
  readonly ordinaryEnemyProcEligible: false;
}

export type EnvironmentCounterplayTag = "cut" | "break" | "projectile-cut";

/**
 * `own-timer`: its authored lifecycle runs out. `cut`: the player destroys it. `owner-done`: the actor
 * that placed it finishes with it or is gone. `stage-ends`: the stage changes or clears.
 */
export type EnvironmentObjectEnding = "own-timer" | "cut" | "owner-done" | "stage-ends";

export function isEnvironmentObjectKind(value: unknown): value is EnvironmentObjectKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ENVIRONMENT_OBJECT_DEFINITIONS, value);
}

/** Source-owned environment metadata. It declares capabilities, not biome behavior. */
export const ENVIRONMENT_OBJECT_DEFINITIONS: Readonly<Record<EnvironmentObjectKind, EnvironmentObjectDefinition>> =
  Object.freeze({
    "bloom-well": Object.freeze({
      kind: "bloom-well",
      category: "field",
      behavior: "generic-field",
      counterplayTags: [] as const,
      endsWhen: ["own-timer", "owner-done", "stage-ends"] as const,
      grantsEnemyRewards: false,
      ordinaryEnemyProcEligible: false,
    }),
    "aurora-track": Object.freeze({
      kind: "aurora-track",
      category: "field",
      behavior: "generic-field",
      counterplayTags: [] as const,
      endsWhen: ["own-timer", "owner-done", "stage-ends"] as const,
      grantsEnemyRewards: false,
      ordinaryEnemyProcEligible: false,
    }),
    "root-link": Object.freeze({
      kind: "root-link",
      category: "combat-object",
      behavior: "generic-combat-object",
      counterplayTags: ["cut", "break", "projectile-cut"] as const,
      endsWhen: ["cut", "owner-done", "stage-ends"] as const,
      grantsEnemyRewards: false,
      ordinaryEnemyProcEligible: false,
    }),
    "graft-anchor": Object.freeze({
      kind: "graft-anchor",
      category: "combat-object",
      behavior: "generic-combat-object",
      counterplayTags: ["cut", "break", "projectile-cut"] as const,
      endsWhen: ["cut", "owner-done", "stage-ends"] as const,
      grantsEnemyRewards: false,
      ordinaryEnemyProcEligible: false,
    }),
    "regrowth-link": Object.freeze({
      kind: "regrowth-link",
      category: "route",
      behavior: "data-only-route",
      counterplayTags: [] as const,
      endsWhen: ["owner-done", "stage-ends"] as const,
      grantsEnemyRewards: false,
      ordinaryEnemyProcEligible: false,
    }),
    "ghost-track": Object.freeze({
      kind: "ghost-track",
      category: "route",
      behavior: "data-only-route",
      counterplayTags: [] as const,
      endsWhen: ["own-timer", "owner-done", "stage-ends"] as const,
      grantsEnemyRewards: false,
      ordinaryEnemyProcEligible: false,
    }),
  });

export const ENVIRONMENT_FIELD_KIND_IDS = Object.freeze(
  Object.values(ENVIRONMENT_OBJECT_DEFINITIONS)
    .filter((entry) => entry.category === "field")
    .map((entry) => entry.kind),
);
export const ENVIRONMENT_COMBAT_OBJECT_KIND_IDS = Object.freeze(
  Object.values(ENVIRONMENT_OBJECT_DEFINITIONS)
    .filter((entry) => entry.category === "combat-object")
    .map((entry) => entry.kind),
);
export const ENVIRONMENT_ROUTE_KIND_IDS = Object.freeze(
  Object.values(ENVIRONMENT_OBJECT_DEFINITIONS)
    .filter((entry) => entry.category === "route")
    .map((entry) => entry.kind),
);

export function environmentObjectDefinition(kind: EnvironmentObjectKind): EnvironmentObjectDefinition {
  return ENVIRONMENT_OBJECT_DEFINITIONS[kind];
}

export function assertEnvironmentObjectCategory(
  category: EnvironmentObjectCategory,
  kind: unknown,
): EnvironmentObjectDefinition {
  if (!isEnvironmentObjectKind(kind)) throw new TypeError(`environment ${category} kind is not source-owned`);
  const definition = environmentObjectDefinition(kind);
  if (definition.category !== category)
    throw new TypeError(`environment kind ${kind} is not approved for ${category} collection`);
  return definition;
}

export function assertEnvironmentCombatCapabilities(
  kind: unknown,
  counterplayTags: readonly string[],
  procEligible: unknown,
): void {
  const definition = assertEnvironmentObjectCategory("combat-object", kind);
  if (procEligible !== false) throw new TypeError("environment combat objects cannot be ordinary-proc eligible");
  if (new Set(counterplayTags).size !== counterplayTags.length)
    throw new TypeError("environment counterplay tags must be unique");
  const allowed = new Set(definition.counterplayTags);
  if (counterplayTags.some((tag) => !allowed.has(tag as EnvironmentCounterplayTag))) {
    throw new TypeError(`environment counterplay tag is not allowed for ${definition.kind}`);
  }
}

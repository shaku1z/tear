/**
 * Stable identities for world-owned environment objects.
 *
 * This is the production authority for field/combat-object kind IDs. Runtime
 * behavior and object state belong to later environment modules; consumers must
 * import these IDs rather than maintaining a second registry.
 */
export const ENVIRONMENT_OBJECT_KIND_IDS = Object.freeze([
  "bloom-well", "root-link", "graft-anchor", "regrowth-link",
] as const);

export type EnvironmentObjectKind = typeof ENVIRONMENT_OBJECT_KIND_IDS[number];

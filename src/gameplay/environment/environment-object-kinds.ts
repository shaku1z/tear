/** Authored environment content identities; the shared state contract consumes only this stable type. */
export const ENVIRONMENT_OBJECT_KIND_IDS = Object.freeze([
  "bloom-well", "aurora-track", "rootline", "root-link", "graft-anchor", "regrowth-link", "ghost-track",
] as const);

export type EnvironmentObjectKind = typeof ENVIRONMENT_OBJECT_KIND_IDS[number];

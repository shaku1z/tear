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

/** Gameplay-only categories owned by the environment runtime. */
export type EnvironmentObjectCategory = "field" | "combat-object" | "route";

export type EnvironmentObjectState = "scheduled" | "warning" | "active" | "cooldown" | "dormant" | "destroyed" | "expired";

export type EnvironmentClearReason =
  | "new-run"
  | "retry"
  | "stage-transition"
  | "natural-expiry"
  | "boss-encounter-replacement"
  | "boss-terminal"
  | "defeat"
  | "abandon"
  | "tutorial-reset"
  | "restore"
  | "replay-seek"
  | "disposal";

export interface EnvironmentPoint { readonly x: number; readonly y: number; }

/** JSON-safe authored geometry; presentation coordinates do not belong here. */
export interface EnvironmentGeometry {
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
  readonly radius?: number;
  readonly points?: readonly EnvironmentPoint[];
}

export interface EnvironmentSchedule {
  readonly startTick: number;
  readonly endTick?: number;
  readonly intervalTicks?: number;
}

export interface EnvironmentEligibility {
  readonly player: boolean;
  readonly enemies: boolean;
  readonly bosses: boolean;
}

export interface EnvironmentForcePolicy {
  readonly x: number;
  readonly y: number;
  readonly magnitude: number;
}

export interface EnvironmentFieldState {
  readonly id: string;
  readonly factoryId?: string;
  readonly kind: EnvironmentObjectKind;
  readonly geometry: EnvironmentGeometry;
  readonly state: EnvironmentObjectState;
  readonly stateTick: number;
  readonly timer: number;
  readonly ownerId: string | null;
  readonly schedule: EnvironmentSchedule | null;
  readonly eligibility: EnvironmentEligibility;
  readonly force: EnvironmentForcePolicy | null;
  readonly cleanupReason: EnvironmentClearReason | null;
  readonly patternId?: string;
}

export interface EnvironmentCombatObjectState {
  readonly id: string;
  readonly factoryId?: string;
  readonly kind: EnvironmentObjectKind;
  readonly ownerId: string | null;
  readonly targetId: string | null;
  readonly geometry: EnvironmentGeometry;
  readonly integrity: number;
  readonly maxIntegrity: number;
  readonly counterplayTags: readonly string[];
  readonly procEligible: boolean;
  readonly damageDedupeId: string;
  readonly state: EnvironmentObjectState;
  readonly stateTick: number;
  readonly cleanupReason: EnvironmentClearReason | null;
  readonly patternId?: string;
}

export interface EnvironmentRouteState {
  readonly id: string;
  readonly factoryId?: string;
  readonly kind: EnvironmentObjectKind;
  readonly points: readonly EnvironmentPoint[];
  readonly state: EnvironmentObjectState;
  readonly stateTick: number;
  readonly ownerId: string | null;
  readonly cleanupReason: EnvironmentClearReason | null;
}

export interface EnvironmentSnapshot {
  readonly worldId?: string;
  readonly stageId: string;
  readonly fields: readonly EnvironmentFieldState[];
  readonly combatObjects: readonly EnvironmentCombatObjectState[];
  readonly routes: readonly EnvironmentRouteState[];
}

export interface EnvironmentRuntimeConfiguration {
  readonly maxFields: number;
  readonly maxCombatObjects: number;
  readonly maxRoutes: number;
}

export interface EnvironmentSimulationView extends EnvironmentSnapshot {
  readonly worldId: string;
  readonly revision: number;
  readonly lastClearReason: EnvironmentClearReason | null;
}

/** Narrow source-owned collection/runtime contract shared by live and detached worlds. */
export interface EnvironmentRuntimeState {
  readonly worldId: string;
  readonly stageId: string;
  readonly revision: number;
  readonly lastClearReason: EnvironmentClearReason | null;
  readonly configuration: EnvironmentRuntimeConfiguration;
  fields(): readonly EnvironmentFieldState[];
  combatObjects(): readonly EnvironmentCombatObjectState[];
  routes(): readonly EnvironmentRouteState[];
  snapshot(): EnvironmentSnapshot;
  simulationView(): EnvironmentSimulationView;
  replace(snapshot: EnvironmentSnapshot): void;
  clear(reason: EnvironmentClearReason): void;
  setStage(stageId: string, reason?: EnvironmentClearReason): void;
  addField(value: Omit<EnvironmentFieldState, "id"> & { readonly id?: string }): string;
  addCombatObject(value: Omit<EnvironmentCombatObjectState, "id"> & { readonly id?: string }): string;
  addRoute(value: Omit<EnvironmentRouteState, "id"> & { readonly id?: string }): string;
  updateField(id: string, patch: Partial<Omit<EnvironmentFieldState, "id">>): void;
  updateCombatObject(id: string, patch: Partial<Omit<EnvironmentCombatObjectState, "id">>): void;
  updateRoute(id: string, patch: Partial<Omit<EnvironmentRouteState, "id">>): void;
  removeField(id: string): void;
  removeCombatObject(id: string): void;
  removeRoute(id: string): void;
}

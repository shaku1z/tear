import type { EnvironmentObjectKind } from "./environment-object-kinds";

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

export type EnvironmentTrackDirection = -1 | 1;

export interface EnvironmentTrackLifecycle {
  readonly warningTicks: number;
  readonly activeTicks: number;
  readonly cooldownTicks: number;
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

/**
 * Optional authored-content validation installed at a composition boundary.
 * The environment collection owns generic shape/category checks; biome modules
 * may independently add stricter rules without becoming dependencies of the
 * shared state kernel.
 */
export interface EnvironmentObjectValidationPort {
  readonly id: string;
  validateField?(field: EnvironmentFieldState): void;
  validateCombatObject?(object: EnvironmentCombatObjectState): void;
  validateRoute?(route: EnvironmentRouteState): void;
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
  addField<T extends object>(value: Omit<EnvironmentFieldState, "id"> & T & Readonly<Partial<T>> & { readonly id?: string }): string;
  addCombatObject<T extends object>(value: Omit<EnvironmentCombatObjectState, "id"> & T & Readonly<Partial<T>> & { readonly id?: string }): string;
  addRoute<T extends object>(value: Omit<EnvironmentRouteState, "id"> & T & Readonly<Partial<T>> & { readonly id?: string }): string;
  updateField<T extends object>(id: string, patch: Partial<Omit<EnvironmentFieldState, "id">> & T & Readonly<Partial<T>>): void;
  updateCombatObject<T extends object>(id: string, patch: Partial<Omit<EnvironmentCombatObjectState, "id">> & T & Readonly<Partial<T>>): void;
  updateRoute<T extends object>(id: string, patch: Partial<Omit<EnvironmentRouteState, "id">> & T & Readonly<Partial<T>>): void;
  removeField(id: string): void;
  removeCombatObject(id: string): void;
  removeRoute(id: string): void;
}

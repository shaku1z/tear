import type {
  EnvironmentClearReason,
  EnvironmentCombatObjectState,
  EnvironmentRuntimeState,
  EnvironmentSnapshot,
} from "./environment-contracts";
import type { TearGameplayEventPort } from "../runtime/gameplay-events";

export interface EnvironmentFeatureContext extends EnvironmentRuntimeState {
  readonly events: TearGameplayEventPort | undefined;
  cleanupCombatObject(id: string, reason: EnvironmentClearReason, tick?: number): void;
}

export interface EnvironmentFeature {
  readonly id: string;
  /** Cheap no-op guard for worlds with neither this biome nor its authored actors/objects active. */
  isActive?(context: EnvironmentFeatureContext): boolean;
  claimsField?(field: EnvironmentRuntimeState["fields"] extends () => readonly (infer T)[] ? T : never): boolean;
  setActorSource?(slot: string, source: (() => readonly unknown[]) | undefined): void;
  step(context: EnvironmentFeatureContext, tick: number, seconds: number): void;
  resolveCollisions?(context: EnvironmentFeatureContext, tick: number, seconds: number): void;
  clear?(context: EnvironmentFeatureContext, reason: EnvironmentClearReason): void;
  replace?(context: EnvironmentFeatureContext, snapshot: EnvironmentSnapshot): void;
  combatObjectUpdated?(context: EnvironmentFeatureContext, object: EnvironmentCombatObjectState): void;
  combatObjectRemoved?(context: EnvironmentFeatureContext, object: EnvironmentCombatObjectState): void;
}

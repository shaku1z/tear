import type { StageId } from "../stages";
import type { EnvironmentObjectKind } from "./environment-contracts";

export interface StageInitialFieldDefinition {
  readonly kind: Extract<EnvironmentObjectKind, "bloom-well">;
  readonly slot: string;
}

export interface StageEnvironmentDefinition {
  readonly id: string;
  readonly stageId: StageId;
  readonly initialFields: readonly StageInitialFieldDefinition[];
  readonly maximumFields: number;
  readonly maximumCombatObjects: number;
  readonly maximumRoutes: number;
  readonly cleanup: "stage-owned";
}

/** Typed stage-owned environment setup; activation remains centralized in the stage host. */
export const STAGE_ENVIRONMENT_DEFINITIONS = Object.freeze({
  "verdant-sanctum": Object.freeze({
    id: "verdant-sanctum-environment",
    stageId: "verdant-sanctum",
    initialFields: Object.freeze([
      Object.freeze({ kind: "bloom-well", slot: "left-rise" }),
      Object.freeze({ kind: "bloom-well", slot: "right-rise" }),
    ]),
    maximumFields: 3,
    maximumCombatObjects: 8,
    maximumRoutes: 0,
    cleanup: "stage-owned",
  }),
} as const satisfies Readonly<Partial<Record<StageId, StageEnvironmentDefinition>>>);

export function stageEnvironmentDefinition(stageId: StageId): StageEnvironmentDefinition | null {
  return STAGE_ENVIRONMENT_DEFINITIONS[stageId as keyof typeof STAGE_ENVIRONMENT_DEFINITIONS] ?? null;
}

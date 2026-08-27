import type { StageId } from "../stages";
import type { EnvironmentObjectKind } from "./environment-contracts";
import type { EnvironmentGeometry } from "./environment-contracts";

export interface StageInitialFieldDefinition {
  readonly kind: Extract<EnvironmentObjectKind, "bloom-well">;
  readonly slot: string;
  readonly geometry: EnvironmentGeometry;
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
      Object.freeze({ kind: "bloom-well", slot: "left-rise", geometry: Object.freeze({ x: 480, y: 285, w: 170, h: 470 }) }),
      Object.freeze({ kind: "bloom-well", slot: "right-rise", geometry: Object.freeze({ x: 950, y: 285, w: 170, h: 470 }) }),
    ]),
    maximumFields: 3,
    maximumCombatObjects: 8,
    maximumRoutes: 0,
    cleanup: "stage-owned",
  }),
} as const satisfies Readonly<Partial<Record<StageId, StageEnvironmentDefinition>>>);

export function stageEnvironmentDefinition(stageId: StageId): StageEnvironmentDefinition | null {
  const definitions: Readonly<Partial<Record<StageId, StageEnvironmentDefinition>>> = STAGE_ENVIRONMENT_DEFINITIONS;
  return definitions[stageId] ?? null;
}

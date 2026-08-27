import type { StageId } from "../gameplay/stages";

export interface StagePresentationDefinition {
  readonly backdropId: StageId;
  readonly platformMaterialId: string;
  readonly environmentPresentationId: StageId;
  readonly reflectionPolicy: "lower-field-restrained";
  readonly particlePolicy: "sparse-petals-pollen";
  readonly lowGraphicsPolicy: "silhouette-and-telegraph-only";
}

/** Stable presentation dispatch metadata, intentionally separate from display names. */
export const STAGE_PRESENTATION_DEFINITIONS = Object.freeze({
  "verdant-sanctum": Object.freeze({
    backdropId: "verdant-sanctum",
    platformMaterialId: "verdant-rootstone",
    environmentPresentationId: "verdant-sanctum",
    reflectionPolicy: "lower-field-restrained",
    particlePolicy: "sparse-petals-pollen",
    lowGraphicsPolicy: "silhouette-and-telegraph-only",
  }),
} as const satisfies Readonly<Partial<Record<StageId, StagePresentationDefinition>>>);

export function stagePresentationDefinition(stageId: StageId): StagePresentationDefinition | null {
  return STAGE_PRESENTATION_DEFINITIONS[stageId as keyof typeof STAGE_PRESENTATION_DEFINITIONS] ?? null;
}

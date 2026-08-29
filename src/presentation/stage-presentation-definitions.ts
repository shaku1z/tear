import type { StageId } from "../gameplay/stages";

export interface StagePresentationDefinition {
  readonly backdropId: StageId;
  readonly platformMaterialId: string;
  readonly environmentPresentationId: StageId;
  readonly reflectionPolicy: "lower-field-restrained" | "frozen-lower-field";
  readonly particlePolicy: "sparse-petals-pollen" | "sparse-snow";
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
  "pale-traverse": Object.freeze({
    backdropId: "pale-traverse",
    platformMaterialId: "pale-ice",
    environmentPresentationId: "pale-traverse",
    reflectionPolicy: "frozen-lower-field",
    particlePolicy: "sparse-snow",
    lowGraphicsPolicy: "silhouette-and-telegraph-only",
  }),
} as const satisfies Readonly<Partial<Record<StageId, StagePresentationDefinition>>>);

export function stagePresentationDefinition(stageId: StageId): StagePresentationDefinition | null {
  const definitions: Readonly<Partial<Record<StageId, StagePresentationDefinition>>> = STAGE_PRESENTATION_DEFINITIONS;
  return definitions[stageId] ?? null;
}

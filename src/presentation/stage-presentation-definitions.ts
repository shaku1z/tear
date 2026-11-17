import type { StageId } from "../gameplay/stages";

export interface StagePresentationDefinition {
  readonly platformMaterialId: string;
}

/** Stable presentation dispatch metadata, intentionally separate from display names. */
export const STAGE_PRESENTATION_DEFINITIONS = Object.freeze({
  "verdant-sanctum": Object.freeze({
    platformMaterialId: "verdant-rootstone",
  }),
  "pale-traverse": Object.freeze({
    platformMaterialId: "pale-ice",
  }),
} as const satisfies Readonly<Partial<Record<StageId, StagePresentationDefinition>>>);

export function stagePresentationDefinition(stageId: StageId): StagePresentationDefinition | null {
  const definitions: Readonly<Partial<Record<StageId, StagePresentationDefinition>>> = STAGE_PRESENTATION_DEFINITIONS;
  return definitions[stageId] ?? null;
}

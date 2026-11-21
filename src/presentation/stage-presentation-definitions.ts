import type { StageId } from "../gameplay/stages";
import type { BossTellSkinTable } from "./enemies/renderers/boss-tell-skin";

export interface StagePresentationDefinition {
  /** How boss warnings and strikes are drawn on this stage. Without it the shared default marks are used. */
  readonly bossTellSkin?: BossTellSkinTable;
}

/** Stable presentation dispatch metadata, intentionally separate from display names. */
export const STAGE_PRESENTATION_DEFINITIONS = Object.freeze({
  "verdant-sanctum": Object.freeze({
    // Roots and thorns rising from the floor: bark-brown root bodies, the warning or strike ink on their tips.
    bossTellSkin: Object.freeze({
      body: "#4a3422",
      marks: Object.freeze({
        lane: Object.freeze({ shape: "risers", spacing: 38, width: 26, lean: 0.22, start: 0.4, spurs: true }),
        box: Object.freeze({ shape: "risers", spacing: 36, width: 26, lean: 0.12, start: 0.35, spurs: true }),
        column: Object.freeze({ shape: "risers", spacing: 38, width: 28, lean: 0.08, start: 0.3, spurs: true }),
        band: Object.freeze({ shape: "risers", spacing: 56, width: 34, lean: 0.1, start: 0.1, spurs: true }),
        reticle: Object.freeze({ shape: "ring", count: 18, length: 34 }),
      }),
    }),
  }),
} as const satisfies Readonly<Partial<Record<StageId, StagePresentationDefinition>>>);

export function stagePresentationDefinition(stageId: StageId): StagePresentationDefinition | null {
  const definitions: Readonly<Partial<Record<StageId, StagePresentationDefinition>>> = STAGE_PRESENTATION_DEFINITIONS;
  return definitions[stageId] ?? null;
}

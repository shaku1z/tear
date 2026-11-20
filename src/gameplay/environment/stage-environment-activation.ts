import { stageDefinition, type StageId } from "../stages";
import { createBloomWellState } from "./bloom-well";
import { auroraTrackGeometryOn, createAuroraTrackFieldState } from "./aurora-track";
import type { EnvironmentClearReason, EnvironmentGeometry, EnvironmentRuntimeState } from "./environment-contracts";
import {
  stageEnvironmentDefinition,
  type StageFieldSurface,
  type StageInitialFieldDefinition,
} from "./stage-environment-definitions";

/** The top of a surface a stage field names: the stretch of floor, or the stage's platform at that place. */
export function stageFieldSurface(
  stageId: StageId,
  surface: StageFieldSurface,
  groundY: number,
): Readonly<{ x: number; y: number; w: number }> {
  if ("floor" in surface) return { x: surface.floor.x, y: groundY, w: surface.floor.w };
  const platform = stageDefinition(stageId).layout[surface.platform];
  if (platform === undefined)
    throw new RangeError(`stage ${stageId} has no platform ${String(surface.platform)} for a field to lie on`);
  return { x: platform.x, y: platform.y, w: platform.w };
}

/** The box a stage's field starts with. */
export function stageFieldGeometry(
  stageId: StageId,
  field: StageInitialFieldDefinition,
  groundY: number,
): EnvironmentGeometry {
  return field.kind === "bloom-well"
    ? field.geometry
    : auroraTrackGeometryOn(stageFieldSurface(stageId, field.surface, groundY));
}

/** Central stage activation transaction: clear prior ownership, then install authored fields. */
export function activateStageEnvironment(
  environment: EnvironmentRuntimeState,
  stageId: StageId,
  startTick: number,
  reason: Extract<EnvironmentClearReason, "new-run" | "stage-transition">,
  groundY: number,
): void {
  if (!Number.isSafeInteger(startTick) || startTick < 0)
    throw new RangeError("stage environment start tick is invalid");
  environment.setStage(stageId, reason);
  const definition = stageEnvironmentDefinition(stageId);
  if (definition === null) return;
  if (definition.initialFields.length > definition.maximumFields) {
    throw new RangeError(`stage environment ${definition.id} exceeds its field bound`);
  }
  for (const field of definition.initialFields) {
    const id = `${stageId}:${field.kind}:${field.slot}`;
    const geometry = stageFieldGeometry(stageId, field, groundY);
    const firstCycle = startTick + (field.offsetTicks ?? 0);
    if (field.kind === "bloom-well") {
      environment.addField(
        createBloomWellState({ id, ownerId: stageId, variant: "stage", geometry, patternId: field.slot }, firstCycle),
      );
    } else {
      environment.addField(
        createAuroraTrackFieldState({
          id,
          ownerId: stageId,
          variant: "stage",
          direction: field.direction,
          geometry,
          startTick: firstCycle,
          patternId: field.slot,
        }),
      );
    }
  }
}

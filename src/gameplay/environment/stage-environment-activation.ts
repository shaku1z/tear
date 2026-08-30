import type { StageId } from "../stages";
import { createBloomWellState } from "./bloom-well";
import { createAuroraTrackFieldState } from "./aurora-track";
import type { EnvironmentClearReason, EnvironmentRuntimeState } from "./environment-contracts";
import { stageEnvironmentDefinition } from "./stage-environment-definitions";

/** Central stage activation transaction: clear prior ownership, then install authored fields. */
export function activateStageEnvironment(
  environment: EnvironmentRuntimeState,
  stageId: StageId,
  startTick: number,
  reason: Extract<EnvironmentClearReason, "new-run" | "stage-transition">,
): void {
  if (!Number.isSafeInteger(startTick) || startTick < 0) throw new RangeError("stage environment start tick is invalid");
  environment.setStage(stageId, reason);
  const definition = stageEnvironmentDefinition(stageId);
  if (definition === null) return;
  if (definition.initialFields.length > definition.maximumFields) {
    throw new RangeError(`stage environment ${definition.id} exceeds its field bound`);
  }
  for (const field of definition.initialFields) {
    const id = `${stageId}:${field.kind}:${field.slot}`;
    if (field.kind === "bloom-well") {
      environment.addField(createBloomWellState({ id, ownerId: stageId, variant: "stage",
        geometry: field.geometry, patternId: field.slot }, startTick));
    } else {
      if (field.direction !== -1 && field.direction !== 1) throw new RangeError(`stage Aurora Track ${field.slot} requires a direction`);
      environment.addField(createAuroraTrackFieldState({ id, ownerId: stageId, variant: "stage",
        direction: field.direction, geometry: field.geometry, startTick, patternId: field.slot }));
    }
  }
}

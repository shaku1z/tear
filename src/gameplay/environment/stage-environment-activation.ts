import type { StageId } from "../stages";
import { createBloomWellState } from "./bloom-well";
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
    environment.addField(createBloomWellState({
      id: `${stageId}:${field.kind}:${field.slot}`,
      ownerId: stageId,
      variant: "stage",
      geometry: field.geometry,
      patternId: field.slot,
    }, startTick));
  }
}

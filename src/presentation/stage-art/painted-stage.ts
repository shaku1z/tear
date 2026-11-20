import { stageDefinition } from "../../gameplay/stages";
import type { PaintedStage, ScenePaintPorts } from "../scenes/scene-library";
import { stagePresentationDefinition } from "../stage-presentation-definitions";
import type { StageArtIdentity, StageArtRecipe } from "./stage-art-contract";
import { paintStageArt } from "./stage-art-painter";

/** The paper and platform material a drawn stage keeps come from the stage's own definitions. */
function stageIdentity(recipe: StageArtRecipe): StageArtIdentity {
  const presentation = stagePresentationDefinition(recipe.stageId);
  if (presentation === null) throw new Error(`stage art: ${recipe.stageId} has no presentation definition`);
  return Object.freeze({
    paper: stageDefinition(recipe.stageId).bg,
    platformMaterial: presentation.platformMaterialId,
  });
}

export function paintedStage(recipe: StageArtRecipe): PaintedStage {
  const identity = stageIdentity(recipe);
  return Object.freeze({ paint: (ports: ScenePaintPorts) => paintStageArt(recipe, identity, ports) });
}

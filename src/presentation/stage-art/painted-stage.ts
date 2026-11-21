import { stageDefinition } from "../../gameplay/stages";
import type { PaintedStage, ScenePaintPorts } from "../scenes/scene-library";
import type { StageArtIdentity, StageArtRecipe } from "./stage-art-contract";
import { paintStageArt } from "./stage-art-painter";

/** The paper a drawn stage keeps comes from the stage's own definition. */
function stageIdentity(recipe: StageArtRecipe): StageArtIdentity {
  return Object.freeze({ paper: stageDefinition(recipe.stageId).bg });
}

export function paintedStage(recipe: StageArtRecipe): PaintedStage {
  const identity = stageIdentity(recipe);
  return Object.freeze({ paint: (ports: ScenePaintPorts) => paintStageArt(recipe, identity, ports) });
}

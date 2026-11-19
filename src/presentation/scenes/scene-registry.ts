import type { StageArtRecipe } from "../stage-art/stage-art-contract";
import type { ScenePackageLoaders } from "./scene-library";

/** A stage the game paints from its recipe; the painter and recipe load lazily together. */
const painted = (recipe: () => Promise<StageArtRecipe>) => async () => {
  const [{ paintedStage }, art] = await Promise.all([import("../stage-art/painted-stage"), recipe()]);
  return paintedStage(art);
};

/**
 * Stage id -> lazy loader of its scene module. Each recipe and the painter are
 * separate chunks, so no stage art reaches the startup scripts.
 */
export const SCENE_PACKAGES: ScenePackageLoaders = Object.freeze({
  "verdant-sanctum": painted(async () => (await import("../stage-art/recipes/verdant-sanctum")).VERDANT_SANCTUM_ART),
});

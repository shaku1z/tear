import type { StageId } from "../../gameplay/stages";
import type { PaintedStageLoaders } from "./scene-library";

/**
 * The stages the game draws from a recipe. The recipes themselves are listed in
 * `stage-art/recipes/index.ts`; a unit test keeps the two lists the same.
 */
const DRAWN_STAGES: readonly StageId[] = ["verdant-sanctum", "pale-traverse"];

/**
 * Stage id -> lazy loader of the stage's painter and recipe. The painter and
 * every recipe are one lazily imported chunk, so no stage art reaches the
 * startup scripts and a new drawn stage adds no file to download.
 */
export const PAINTED_STAGES: PaintedStageLoaders = Object.freeze(
  Object.fromEntries(
    DRAWN_STAGES.map((stageId) => [
      stageId,
      async () => (await import("../stage-art/painted-stage")).drawnStage(stageId),
    ]),
  ),
);

import type { StageArtRecipe } from "../stage-art-contract";
import { PALE_TRAVERSE_ART } from "./pale-traverse";
import { VERDANT_SANCTUM_ART } from "./verdant-sanctum";

/**
 * Every drawn stage's recipe. They load together with the painter as one lazy
 * chunk: a recipe is a few kilobytes of data, so a chunk each would only add a
 * file to download and precache per stage.
 */
export const STAGE_ART_RECIPES: readonly StageArtRecipe[] = Object.freeze([VERDANT_SANCTUM_ART, PALE_TRAVERSE_ART]);

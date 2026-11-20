import { COSMETIC_CATALOG } from "../gameplay/progression/cosmetic-catalog";
import { createCosmeticWardrobe, type CosmeticLooks } from "./cosmetic-styles";

/**
 * The game's own look, worn by nobody: for worlds that draw no player's cosmetics (attract mode, TearBench,
 * the replay until it carries a recorded loadout). Typed as looks only, so nothing can put a loadout on it.
 */
export const DEFAULT_COSMETIC_LOOKS: CosmeticLooks = createCosmeticWardrobe(COSMETIC_CATALOG, () => false);

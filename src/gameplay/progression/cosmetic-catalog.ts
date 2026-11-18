/**
 * The cosmetic catalog, assembled from the data files in ./cosmetics: slots, look families, price tiers,
 * collections, items and the asset manifest. Adding a cosmetic is a row in items.json; adding a slot is a
 * row in slots.json; neither needs new code. Loading validates every row and throws if any is invalid.
 */
import type { ReadabilityBackdrops } from "../../domain/cosmetic-readability";
import { parseCosmeticCatalog } from "../../domain/cosmetic-validation";
import { AUTHORED_STAGES } from "../stages";
import assets from "./cosmetics/assets.json";
import collections from "./cosmetics/collections.json";
import families from "./cosmetics/families.json";
import items from "./cosmetics/items.json";
import slots from "./cosmetics/slots.json";
import tiers from "./cosmetics/tiers.json";

/**
 * The backdrops a look is checked against: every authored stage background, by stage id. A new biome is
 * checked as soon as it exists, and a repaint keeps the rule honest.
 */
export const COSMETIC_BACKDROPS: ReadabilityBackdrops = Object.freeze(
  Object.fromEntries(AUTHORED_STAGES.map((stage) => [stage.id, stage.bg])),
);

export const COSMETIC_CATALOG = Object.freeze(
  parseCosmeticCatalog({ slots, families, tiers, collections, items, assets }, COSMETIC_BACKDROPS),
);

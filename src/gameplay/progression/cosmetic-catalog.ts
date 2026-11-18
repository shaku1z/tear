/**
 * The cosmetic catalog, assembled from the data files in ./cosmetics: slots, look families, price tiers,
 * collections, items and the asset manifest. Adding a cosmetic is a row in items.json; adding a slot is a
 * row in slots.json; neither needs new code. `validateCosmeticCatalog` (tests/unit/cosmetics.test.ts)
 * checks every row.
 */
import { relativeLuminance, type ReadabilityBackdrops } from "../../domain/cosmetic-readability";
import type { CosmeticCatalog } from "../../domain/cosmetic-types";
import { AUTHORED_STAGES, stageDefinition } from "../stages";
import assets from "./cosmetics/assets.json";
import collections from "./cosmetics/collections.json";
import families from "./cosmetics/families.json";
import items from "./cosmetics/items.json";
import slots from "./cosmetics/slots.json";
import tiers from "./cosmetics/tiers.json";

export const COSMETIC_CATALOG: CosmeticCatalog = Object.freeze({
  slots,
  families,
  tiers,
  collections,
  items,
  assets,
} as CosmeticCatalog);

/**
 * The backdrops a look is checked against, read from the stage definitions so a repaint keeps the
 * rule honest: the Verdant Sanctum background and the darkest background of any stage.
 */
export const COSMETIC_BACKDROPS: ReadabilityBackdrops = Object.freeze({
  verdant: stageDefinition("verdant-sanctum").bg,
  dark: [...AUTHORED_STAGES].sort((a, b) => relativeLuminance(a.bg) - relativeLuminance(b.bg))[0]?.bg ?? "#000000",
});

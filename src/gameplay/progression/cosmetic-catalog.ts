/**
 * The cosmetic catalog, assembled from the data files in ./cosmetics (slots, look families, price tiers,
 * collections, items) and the asset ids in config/asset-manifest.json, the one list of art the game draws.
 * Adding a cosmetic is a row in items.json; adding a slot is a row in slots.json; neither needs new code.
 * Loading validates every row and throws if any is invalid, including an item naming art the manifest lacks.
 */
import type { ReadabilityBackdrops } from "../../domain/cosmetic-readability";
import { parseCosmeticCatalog } from "../../domain/cosmetic-validation";
import { assets as manifestAssets } from "../../../config/asset-manifest.json";
import { AUTHORED_STAGES } from "../stages";
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

/** Ids of the art that exists: the manifest's rows. The manifest's own check keeps them unique and well formed. */
export const COSMETIC_ASSET_IDS: readonly string[] = Object.freeze(manifestAssets.map((row) => row.id));

export const COSMETIC_CATALOG = Object.freeze(
  parseCosmeticCatalog({ slots, families, tiers, collections, items, assets: COSMETIC_ASSET_IDS }, COSMETIC_BACKDROPS),
);

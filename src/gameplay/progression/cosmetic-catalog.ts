/**
 * The cosmetic catalog: every shelf, as data. A new item is one row below; `validateCosmeticCatalog`
 * (tests/unit/cosmetics.test.ts) checks every row. Names and looks marked `placeholder` are
 * stand-ins until the owner chooses them; the test lists what still needs a real name. The blade
 * slot has no rows yet: blade looks come last because the blade is what the player reads in a fight.
 */
import type { CosmeticCatalog, CosmeticCollection, CosmeticItem } from "../../domain/cosmetics";

const trail = (
  id: string,
  n: number,
  price: number,
  colors: string[],
  extra: Partial<CosmeticItem> = {},
): CosmeticItem => ({
  id,
  slot: "trail",
  name: `Trail ${String(n)}`,
  price,
  placeholder: true,
  look: { colors, widthScale: 1, glow: 0.4, fade: "linear" },
  ...extra,
});
const spark = (
  id: string,
  n: number,
  price: number,
  colors: string[],
  extra: Partial<CosmeticItem> = {},
): CosmeticItem => ({
  id,
  slot: "spark",
  name: `Spark ${String(n)}`,
  price,
  placeholder: true,
  look: { colors, countScale: 1 },
  ...extra,
});
const title = (id: string, n: number, price: number): CosmeticItem => ({
  id,
  slot: "title",
  name: `Title ${String(n)}`,
  price,
  placeholder: true,
  look: { text: `TITLE ${String(n)}` },
});
const banner = (
  id: string,
  n: number,
  price: number,
  colors: string[],
  extra: Partial<CosmeticItem> = {},
): CosmeticItem => ({
  id,
  slot: "banner",
  name: `Banner ${String(n)}`,
  price,
  placeholder: true,
  look: { colors, pattern: "split" },
  ...extra,
});

const COLLECTIONS: readonly CosmeticCollection[] = [
  { id: "rootbound", name: "Rootbound Collection", unlockBoss: "rootbound", placeholder: true },
];

const ITEMS: readonly CosmeticItem[] = [
  trail("trail_1", 1, 75, ["#7a4ff0"]),
  trail("trail_2", 2, 150, ["#2f7bd6", "#7a4ff0"]),
  spark("spark_1", 1, 75, ["#c23bb0"]),
  spark("spark_2", 2, 150, ["#0f9fb0", "#7a4ff0"]),
  title("title_1", 1, 20),
  title("title_2", 2, 60),
  banner("banner_1", 1, 100, ["#2f7bd6", "#7a4ff0"]),
  banner("banner_2", 2, 150, ["#2f9e6b", "#0f9fb0"]),
  trail("rootbound_trail", 3, 250, ["#2f9e6b", "#0f9fb0"], { name: "Rootbound Trail", collection: "rootbound" }),
  banner("rootbound_banner", 3, 250, ["#2f9e6b", "#7a4ff0"], { name: "Rootbound Banner", collection: "rootbound" }),
];

export const COSMETIC_CATALOG: CosmeticCatalog = Object.freeze({
  items: Object.freeze(ITEMS),
  collections: Object.freeze(COLLECTIONS),
});

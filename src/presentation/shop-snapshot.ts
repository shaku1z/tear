import type { ShopScreenView } from "./screens/contracts";

export const SHOP_CATEGORIES = Object.freeze([["vit", "VITALITY"], ["blade", "BLADE"], ["tempo", "TEMPO"], ["fortune", "FORTUNE"]] as const);
export interface ShopItemSource {
  readonly id: string; readonly cat: string; readonly name: string; readonly glyph?: string;
  readonly maxLevel: number; readonly desc: string; readonly now?: (level: number) => string;
}
export interface ShopSnapshotResult { readonly view: ShopScreenView; readonly displayedCoins: number; readonly maximumScroll: number }
export function buildShopSnapshot(input: {
  readonly items: readonly ShopItemSource[]; readonly realCoins: number; readonly displayedCoins: number | null;
  readonly lifetimeEarned: number; readonly height: number; readonly scroll: number; readonly now: number;
  readonly flash?: Readonly<{ id: string; time: number }>; readonly level: (id: string) => number;
  readonly cost: (item: ShopItemSource) => number; readonly canBuy: (item: ShopItemSource) => boolean;
}): ShopSnapshotResult {
  let displayedCoins = input.displayedCoins ?? input.realCoins;
  displayedCoins += (input.realCoins - displayedCoins) * 0.18;
  if (Math.abs(displayedCoins - input.realCoins) < 0.6) displayedCoins = input.realCoins;
  const groups = [SHOP_CATEGORIES.slice(0, 2), SHOP_CATEGORIES.slice(2)];
  const columnHeight = (categories: readonly (readonly [string, string])[]): number => categories.reduce((height, [id]) =>
    height + 36 + input.items.filter((item) => item.cat === id).length * 74, 0) + Math.max(0, categories.length - 1) * 12;
  const maximumScroll = Math.max(0, Math.max(...groups.map(columnHeight)) - (input.height - 262));
  const scroll = Math.max(0, Math.min(maximumScroll, input.scroll));
  const view: ShopScreenView = { id: "shop", coins: Math.round(displayedCoins),
    ownedLevels: input.items.reduce((total, item) => total + input.level(item.id), 0),
    totalLevels: input.items.reduce((total, item) => total + item.maxLevel, 0), lifetimeEarned: input.lifetimeEarned,
    sections: SHOP_CATEGORIES.map(([id, label]) => ({ label, items: input.items.filter((item) => item.cat === id).map((item) => {
      const level = input.level(item.id), maximumLevel = item.maxLevel;
      return { id: item.id, label: item.name, glyph: item.glyph ?? "◆", level, maxLevel: maximumLevel,
        description: level && item.now !== undefined ? "now  " + item.now(level) + "   ·   " + item.desc : item.desc,
        cost: input.cost(item).toLocaleString() + "c", enabled: level < maximumLevel && input.canBuy(item),
        flash: input.flash?.id === item.id ? Math.max(0, Math.min(1, 1 - (input.now - input.flash.time) / 0.45)) : 0 };
    }) })), canScrollUp: scroll > 0, canScrollDown: scroll < maximumScroll };
  return Object.freeze({ view: Object.freeze(view), displayedCoins, maximumScroll });
}

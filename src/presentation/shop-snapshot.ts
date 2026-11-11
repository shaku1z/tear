import type { ShopScreenView } from "./screens/contracts";

export const SHOP_CATEGORIES = Object.freeze([["vit", "VITALITY"], ["blade", "BLADE"], ["tempo", "TEMPO"], ["fortune", "FORTUNE"]] as const);
/** Shared shop list geometry (renderer and scroll bounds must agree). */
export const SHOP_LIST_TOP = 180, SHOP_ROW_PITCH = 88, SHOP_SECTION_HEAD = 24, SHOP_SECTION_GAP = 14;
/** The list ends where the page footer begins (pageLayout bodyBottom = height - 110). */
export const shopVisibleHeight = (height: number): number => height - 110 - SHOP_LIST_TOP;
export interface ShopItemSource {
  readonly id: string; readonly cat: string; readonly name: string; readonly glyph?: string;
  readonly maxLevel: number; readonly desc: string; readonly now?: (level: number) => string;
}
export interface ShopSnapshotResult { readonly view: ShopScreenView; readonly displayedCoins: number; readonly maximumScroll: number }
export function buildShopSnapshot(input: {
  readonly items: readonly ShopItemSource[]; readonly realCoins: number; readonly displayedCoins: number | null;
  readonly lifetimeEarned: number; readonly height: number; readonly scroll: number; readonly now: number;
  readonly shopBuys?: number; readonly lifetimeSpent?: number;
  readonly flash?: Readonly<{ id: string; time: number }>; readonly level: (id: string) => number;
  readonly cost: (item: ShopItemSource) => number; readonly canBuy: (item: ShopItemSource) => boolean;
}): ShopSnapshotResult {
  let displayedCoins = input.displayedCoins ?? input.realCoins;
  displayedCoins += (input.realCoins - displayedCoins) * 0.18;
  if (Math.abs(displayedCoins - input.realCoins) < 0.6) displayedCoins = input.realCoins;
  const groups = [SHOP_CATEGORIES.slice(0, 2), SHOP_CATEGORIES.slice(2)];
  const columnHeight = (categories: readonly (readonly [string, string])[]): number => 18 + categories.reduce((height, [id]) =>
    height + SHOP_SECTION_HEAD + input.items.filter((item) => item.cat === id).length * SHOP_ROW_PITCH, 0) + Math.max(0, categories.length - 1) * SHOP_SECTION_GAP;
  const maximumScroll = Math.max(0, Math.max(...groups.map(columnHeight)) - shopVisibleHeight(input.height));
  const scroll = Math.max(0, Math.min(maximumScroll, input.scroll));
  const ownedLevels = input.items.reduce((total, item) => total + input.level(item.id), 0);
  const onboarding = ownedLevels === 0 && input.shopBuys === 0 && input.lifetimeSpent === 0
    ? "Spend coins on permanent upgrades for future runs. Buying is optional." : undefined;
  const view: ShopScreenView = { id: "shop", coins: Math.round(displayedCoins),
    ...(onboarding === undefined ? {} : { onboarding }), ownedLevels,
    totalLevels: input.items.reduce((total, item) => total + item.maxLevel, 0), lifetimeEarned: input.lifetimeEarned,
    sections: SHOP_CATEGORIES.map(([id, label]) => ({ label, items: input.items.filter((item) => item.cat === id).map((item) => {
      const level = input.level(item.id), maximumLevel = item.maxLevel;
      return { id: item.id, label: item.name, glyph: item.glyph ?? "◆", level, maxLevel: maximumLevel,
        description: level && item.now !== undefined ? "Now " + item.now(level) + " · " + item.desc : item.desc,
        cost: input.cost(item).toLocaleString("en-US") + "c", enabled: level < maximumLevel && input.canBuy(item),
        flash: input.flash?.id === item.id ? Math.max(0, Math.min(1, 1 - (input.now - input.flash.time) / 0.45)) : 0 };
    }) })), canScrollUp: scroll > 0, canScrollDown: scroll < maximumScroll };
  return Object.freeze({ view: Object.freeze(view), displayedCoins, maximumScroll });
}

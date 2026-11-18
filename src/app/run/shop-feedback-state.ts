import type { ShopTab } from "../../presentation/shop-snapshot";

export interface LiveShopFeedbackSnapshot {
  /** The Shop page on show; it stays while the player goes elsewhere and comes back. */
  readonly tab: ShopTab;
  readonly displayedCoins: number | null;
  readonly flash: Readonly<{ id: string; time: number }> | null;
}

export interface LiveShopFeedbackState {
  snapshot(): LiveShopFeedbackSnapshot;
  set(value: LiveShopFeedbackSnapshot): void;
}

/** Owns frame-presentation feedback from the live shop without coupling it to the host closure. */
export function createLiveShopFeedbackState(): LiveShopFeedbackState {
  let tab: ShopTab = "upgrades";
  let displayedCoins: number | null = null;
  let flash: Readonly<{ id: string; time: number }> | null = null;
  return Object.freeze({
    snapshot: (): LiveShopFeedbackSnapshot => Object.freeze({ tab, displayedCoins, flash }),
    set: (value: LiveShopFeedbackSnapshot): void => {
      tab = value.tab;
      displayedCoins = value.displayedCoins;
      flash = value.flash;
    },
  });
}

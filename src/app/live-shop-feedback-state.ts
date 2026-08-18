export interface LiveShopFeedbackSnapshot {
  readonly displayedCoins: number | null;
  readonly flash: Readonly<{ id: string; time: number }> | null;
}

export interface LiveShopFeedbackState {
  snapshot(): LiveShopFeedbackSnapshot;
  set(value: LiveShopFeedbackSnapshot): void;
}

/** Owns frame-presentation feedback from the live shop without coupling it to the host closure. */
export function createLiveShopFeedbackState(): LiveShopFeedbackState {
  let displayedCoins: number | null = null;
  let flash: Readonly<{ id: string; time: number }> | null = null;
  return Object.freeze({
    snapshot: (): LiveShopFeedbackSnapshot => Object.freeze({ displayedCoins, flash }),
    set: (value: LiveShopFeedbackSnapshot): void => { displayedCoins = value.displayedCoins; flash = value.flash; },
  });
}

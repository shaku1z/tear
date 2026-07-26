import type { RunMode } from "../run/session";

/**
 * Teaching is only meaningful when the player and target are comparable from
 * one attempt to the next. Permanent shop/meta upgrades are deliberately not
 * applied to tutorial runs; the regular game remains unchanged.
 */
export const TUTORIAL_BASELINE_CONTRACT = Object.freeze({
  appliesPermanentUpgrades: false,
  allowsDrafts: false,
  allowsShop: false,
  restoresPlayerBetweenBlocks: true,
});

export function tutorialUsesBaselineLoadout(mode: RunMode): boolean { return mode === "tutorial"; }

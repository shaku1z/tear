/** Stable Replay Hub selectors with the disposable panel's old IDs preserved. */
export const REPLAY_HUB_DOM_SELECTORS = Object.freeze({
  root: '[data-surface="replay-hub"]',
  state: '[data-replay-hub="state"]',
} as const);

export const LEGACY_GHOST_LAB_DOM_SELECTORS = Object.freeze({
  root: "#tear-ghost-lab",
  state: "#tear-ghost-lab-state",
} as const);

export const REPLAY_HUB_DOM_SELECTOR_ALIASES = Object.freeze({
  root: `${REPLAY_HUB_DOM_SELECTORS.root}, ${LEGACY_GHOST_LAB_DOM_SELECTORS.root}`,
  state: `${REPLAY_HUB_DOM_SELECTORS.state}, ${LEGACY_GHOST_LAB_DOM_SELECTORS.state}`,
} as const);

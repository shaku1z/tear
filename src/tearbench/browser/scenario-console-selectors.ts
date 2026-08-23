/**
 * Stable Scenario Console selectors.
 *
 * The data selectors are the canonical browser contract.  The ID selectors
 * remain readable for the C23 State Forge journey and existing bookmarks;
 * they are deliberately not renamed or removed in this migration slice.
 */
export const SCENARIO_CONSOLE_DOM_SELECTORS = Object.freeze({
  root: '[data-surface="scenario-console"]',
  actions: '[data-scenario-console="actions"]',
  status: '[data-scenario-console="status"]',
  reports: '[data-scenario-console="validation-reports"]',
  editor: '[data-scenario-console-control="editor"]',
  import: '[data-scenario-console-control="import"]',
  timeline: '[data-scenario-console-control="timeline"]',
  comparison: '[data-scenario-console-control="comparison"]',
  provenance: '[data-scenario-console="provenance"]',
  diff: '[data-scenario-console="diff"]',
  forkId: '[data-scenario-console-control="fork-id"]',
  forkPatch: '[data-scenario-console-control="fork-patch"]',
  validate: '[data-scenario-console-action="validate"]',
  export: '[data-scenario-console-action="export"]',
  watch: '[data-scenario-console-action="watch"]',
  launch: '[data-scenario-console-action="launch"]',
  fork: '[data-scenario-console-action="fork"]',
} as const);

export const LEGACY_STATE_FORGE_DOM_SELECTORS = Object.freeze({
  root: '#tear-state-forge-studio',
  editor: '#tear-state-forge-editor',
  timeline: '#tear-state-forge-timeline',
  comparison: '#tear-state-forge-comparison',
} as const);

/** Select either the canonical surface or its preserved C23 root. */
export const SCENARIO_CONSOLE_DOM_SELECTOR_ALIASES = Object.freeze({
  root: `${SCENARIO_CONSOLE_DOM_SELECTORS.root}, ${LEGACY_STATE_FORGE_DOM_SELECTORS.root}`,
  editor: `${SCENARIO_CONSOLE_DOM_SELECTORS.editor}, ${LEGACY_STATE_FORGE_DOM_SELECTORS.editor}`,
  timeline: `${SCENARIO_CONSOLE_DOM_SELECTORS.timeline}, ${LEGACY_STATE_FORGE_DOM_SELECTORS.timeline}`,
  comparison: `${SCENARIO_CONSOLE_DOM_SELECTORS.comparison}, ${LEGACY_STATE_FORGE_DOM_SELECTORS.comparison}`,
} as const);

/**
 * Canonical Scenario Console query vocabulary.
 *
 * The query is a developer/test surface, not persisted scenario data.  Keep
 * the old `stateforge` spelling readable so existing evidence journeys and
 * bookmarks continue to open the same host while new links use the explicit
 * `scenario-console=1` form.
 */
export const SCENARIO_CONSOLE_QUERY = "scenario-console" as const;
export const LEGACY_SCENARIO_CONSOLE_QUERY = "stateforge" as const;
export const SCENARIO_CONSOLE_QUERY_VALUE = "1" as const;
export const SCENARIO_CONSOLE_QUERY_ALIASES = Object.freeze([
  SCENARIO_CONSOLE_QUERY,
  LEGACY_SCENARIO_CONSOLE_QUERY,
] as const);

function enabledFlag(parameters: URLSearchParams, key: string): boolean {
  if (!parameters.has(key)) return false;
  const value = parameters.get(key);
  return value === "" || value === SCENARIO_CONSOLE_QUERY_VALUE;
}

/** Returns true for both canonical and legacy Scenario Console deep links. */
export function isScenarioConsoleRequested(search: string): boolean {
  const parameters = new URLSearchParams(search);
  return SCENARIO_CONSOLE_QUERY_ALIASES.some((key) => enabledFlag(parameters, key));
}

/**
 * Converts a supported legacy deep link to the canonical query spelling while
 * retaining unrelated parameters.  Unsupported flag values are left alone so
 * a malformed/disabled link cannot silently enable a developer surface.
 */
export function normalizeScenarioConsoleSearch(search: string): string {
  const parameters = new URLSearchParams(search);
  if (!SCENARIO_CONSOLE_QUERY_ALIASES.some((key) => enabledFlag(parameters, key))) return search;
  parameters.delete(LEGACY_SCENARIO_CONSOLE_QUERY);
  parameters.set(SCENARIO_CONSOLE_QUERY, SCENARIO_CONSOLE_QUERY_VALUE);
  const normalized = parameters.toString();
  return search.startsWith("?") ? `?${normalized}` : normalized;
}

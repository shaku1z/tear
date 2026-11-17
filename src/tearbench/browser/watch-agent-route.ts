/** Developer query that opens the watch agent panel in test builds: `?watchagent=1`. */
export const WATCH_AGENT_QUERY = "watchagent" as const;

/** True when the query enables the watch agent (an empty value or `1`). */
export function isWatchAgentRequested(search: string): boolean {
  const parameters = new URLSearchParams(search);
  if (!parameters.has(WATCH_AGENT_QUERY)) return false;
  const value = parameters.get(WATCH_AGENT_QUERY);
  return value === "" || value === "1";
}

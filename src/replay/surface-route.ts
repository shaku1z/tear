/**
 * Canonical navigation vocabulary for the two player-facing replay surfaces.
 *
 * The game still owns the legacy `replay` and `ghostlab` screen IDs, and the
 * disposable browser panel still accepts its `ghostlab=1` bookmark.  This
 * module is the small boundary where new links can use explicit names while
 * old screen/action tokens remain readable.
 */
export type ReplaySurface = "replay-editor" | "replay-hub";

export const REPLAY_EDITOR_ROUTE = "replay-editor" as const;
export const REPLAY_HUB_ROUTE = "replay-hub" as const;
export const LEGACY_REPLAY_EDITOR_ROUTE = "replay.studio" as const;
export const LEGACY_REPLAY_HUB_ROUTE = "ghostlab" as const;

export const REPLAY_EDITOR_SCREEN = "replay" as const;
export const REPLAY_HUB_SCREEN = "ghostlab" as const;

export const REPLAY_EDITOR_QUERY = REPLAY_EDITOR_ROUTE;
export const REPLAY_HUB_QUERY = REPLAY_HUB_ROUTE;
export const LEGACY_REPLAY_HUB_QUERY = LEGACY_REPLAY_HUB_ROUTE;
export const REPLAY_QUERY_VALUE = "1" as const;

export const REPLAY_EDITOR_ACTIONS = Object.freeze({
  toggle: "replay.editor.toggle",
  createCutList: "replay.editor.createCutList",
} as const);
export const LEGACY_REPLAY_EDITOR_ACTIONS = Object.freeze({
  toggle: "replay.studio.toggle",
  createCutList: "replay.studio.createCutList",
} as const);
export const REPLAY_HUB_ACTIONS = Object.freeze({
  open: "replay.hub.open",
  watch: "replay.hub.watch",
} as const);
export const LEGACY_REPLAY_HUB_ACTIONS = Object.freeze({
  open: "ghostlab.open",
  watch: "ghostlab.watch",
} as const);

/** Resolves a canonical route or a preserved legacy screen/action token. */
export function resolveReplaySurfaceRoute(route: string): ReplaySurface | undefined {
  if (route === REPLAY_EDITOR_ROUTE || route === LEGACY_REPLAY_EDITOR_ROUTE || route === REPLAY_EDITOR_SCREEN) {
    return "replay-editor";
  }
  if (route === REPLAY_HUB_ROUTE || route === LEGACY_REPLAY_HUB_ROUTE) return "replay-hub";
  return undefined;
}

function enabledFlag(parameters: URLSearchParams, key: string): boolean {
  if (!parameters.has(key)) return false;
  const value = parameters.get(key);
  return value === "" || value === REPLAY_QUERY_VALUE;
}

/** Returns whether a canonical or legacy deep-link requests the surface. */
export function isReplaySurfaceRequested(search: string, surface: ReplaySurface): boolean {
  const parameters = new URLSearchParams(search);
  if (surface === "replay-hub") {
    return enabledFlag(parameters, REPLAY_HUB_QUERY) || enabledFlag(parameters, LEGACY_REPLAY_HUB_QUERY);
  }
  return enabledFlag(parameters, REPLAY_EDITOR_QUERY);
}

/** Returns the uniquely requested surface, or undefined for no/ambiguous input. */
export function requestedReplaySurface(search: string): ReplaySurface | undefined {
  const editor = isReplaySurfaceRequested(search, "replay-editor");
  const hub = isReplaySurfaceRequested(search, "replay-hub");
  return editor === hub ? undefined : editor ? "replay-editor" : "replay-hub";
}

/**
 * Writes one canonical query key while retaining unrelated test parameters.
 * The old hub key is removed only when it positively enabled a surface, and
 * the opposite canonical key is removed to avoid ambiguous links. Malformed or
 * disabled legacy flags stay inert.
 */
export function writeReplaySurfaceSearch(search: string, surface: ReplaySurface): string {
  const parameters = new URLSearchParams(search);
  const query = surface === "replay-hub" ? REPLAY_HUB_QUERY : REPLAY_EDITOR_QUERY;
  const otherQuery = surface === "replay-hub" ? REPLAY_EDITOR_QUERY : REPLAY_HUB_QUERY;
  if (enabledFlag(parameters, LEGACY_REPLAY_HUB_QUERY)) parameters.delete(LEGACY_REPLAY_HUB_QUERY);
  parameters.delete(otherQuery);
  parameters.set(query, REPLAY_QUERY_VALUE);
  const normalized = parameters.toString();
  return search.startsWith("?") ? `?${normalized}` : normalized;
}

/** Reads canonical and legacy bookmarks, returning the canonical spelling. */
export function normalizeReplaySurfaceSearch(search: string): string {
  const requested = requestedReplaySurface(search);
  return requested === undefined ? search : writeReplaySurfaceSearch(search, requested);
}

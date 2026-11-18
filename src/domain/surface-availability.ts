import type { ScreenAction } from "./screen-actions";
import { isAppScreen, screenFacts, SCREEN_CATALOG, type AppScreen } from "./screen-catalog";

/**
 * Release/engineering surface availability.
 *
 * The release channel is what players receive (standalone and CrazyGames
 * production builds). The engineering channel additionally exposes research,
 * diagnostic and unfinished surfaces (test builds and the Vite dev server).
 * The channel is resolved once by composition and injected; this module owns
 * only the data and pure decisions, never a build constant or browser state.
 */
export type SurfaceChannel = "release" | "engineering";

/** Surfaces this module classifies. Screens are classified by the screen catalog instead. */
type FeatureSurfaceId =
  // Boss Test boss picker on the setup screen.
  | "setup:boss-picker"
  // Unfinished player features.
  | "feature:seed-race"
  | "feature:boss-memory"
  | "feature:coach"
  | "feature:replay-editor"
  | "feature:linked-pair-download"
  // Every engineering query parameter and surface route.
  | "route:engineering-query"
  // Engineering window globals.
  | "global:weapon-debug";

/**
 * A screen, and every route into it, is a surface whose channel is the screen
 * catalog's (src/domain/screen-catalog.ts); the other surfaces are listed here.
 */
export type SurfaceId = `screen:${AppScreen}` | FeatureSurfaceId;

const SCREEN_SURFACE_PREFIX = "screen:";

/**
 * The sole source-owned classification. Promote a surface by changing its
 * channel here, or a screen by changing its channel in the screen catalog.
 */
export const SURFACE_CHANNEL: Readonly<Record<FeatureSurfaceId, SurfaceChannel>> = Object.freeze({
  "setup:boss-picker": "engineering",
  "feature:seed-race": "engineering",
  "feature:boss-memory": "engineering",
  "feature:coach": "engineering",
  "feature:replay-editor": "engineering",
  "feature:linked-pair-download": "engineering",
  "route:engineering-query": "engineering",
  "global:weapon-debug": "engineering",
});

export interface SurfaceAvailability {
  readonly channel: SurfaceChannel;
  /** True when the named surface may be shown, entered or installed. */
  allows(id: SurfaceId): boolean;
  /** True when data authored for the given channel (for example a run mode) is available. */
  admits(channel: SurfaceChannel): boolean;
}

function surfaceChannel(id: string): SurfaceChannel | undefined {
  if (id.startsWith(SCREEN_SURFACE_PREFIX)) return screenFacts(id.slice(SCREEN_SURFACE_PREFIX.length))?.channel;
  return Object.hasOwn(SURFACE_CHANNEL, id) ? SURFACE_CHANNEL[id as FeatureSurfaceId] : undefined;
}

export function createSurfaceAvailability(channel: SurfaceChannel): SurfaceAvailability {
  const requested: string = channel;
  if (requested !== "release" && requested !== "engineering") throw new TypeError("unknown surface channel");
  const admits = (surface: SurfaceChannel): boolean => surface === "release" || channel === "engineering";
  return Object.freeze({
    channel,
    allows: (id: SurfaceId): boolean => {
      const surface = surfaceChannel(id);
      if (surface === undefined) throw new RangeError(`unknown surface: ${id}`);
      return admits(surface);
    },
    admits,
  });
}

/** The surface that owns an application screen, or undefined for an ordinary player screen. */
export function screenSurface(screen: string): SurfaceId | undefined {
  return isAppScreen(screen) && SCREEN_CATALOG[screen].channel === "engineering" ? `screen:${screen}` : undefined;
}

const CAREER_COMMAND_SURFACES: Readonly<Partial<Record<string, SurfaceId>>> = Object.freeze({
  race: "feature:seed-race",
  coach: "feature:coach",
});

/**
 * The surface a semantic screen action belongs to, or undefined for an
 * ordinary player action. Mode selection is classified by the mode catalog.
 */
export function screenActionSurface(action: ScreenAction): SurfaceId | undefined {
  const type = action.type;
  if (action.type === "navigate") return screenSurface(action.to);
  if (action.type === "setup.start") return action.race === true ? "feature:seed-race" : undefined;
  if (action.type === "setup.selectBoss") return "setup:boss-picker";
  if (action.type === "career.control") return CAREER_COMMAND_SURFACES[action.command];
  if (action.type === "replay.challenge.start")
    return action.id.startsWith("boss-memory-") ? "feature:boss-memory" : undefined;
  if (action.type === "profile.downloadGhostArchive")
    return action.paired === true ? "feature:linked-pair-download" : undefined;
  if (type.startsWith("replay.coach.")) return "feature:coach";
  if (type.startsWith("replay.editor.") || type.startsWith("replay.studio.")) return "feature:replay-editor";
  return undefined;
}

/** True when the action is an ordinary player action or its surface is available. */
export function screenActionAvailable(surfaces: SurfaceAvailability, action: ScreenAction): boolean {
  const surface = screenActionSurface(action);
  return surface === undefined || surfaces.allows(surface);
}

import type { ScreenAction } from "./screen-actions";
import { ENGINEERING_SCREENS, screenFacts, type EngineeringScreen } from "./screen-catalog";

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

export type SurfaceId =
  // Engineering screens (research and diagnostic screens and the unfinished
  // Ghost V3 publication-service screens), plus every route into them. Their
  // channel is the screen catalog's (src/domain/screen-catalog.ts).
  | `screen:${EngineeringScreen}`
  // AI-drives-the-run controls (Replay Hub and pause screen).
  | "control:run-monitor"
  // Boss Test boss picker on the setup screen.
  | "setup:boss-picker"
  // Unfinished player features.
  | "feature:seed-race"
  | "feature:beat-this-run"
  | "feature:boss-memory"
  | "feature:coach"
  | "feature:replay-editor"
  | "feature:ghost-cloud"
  | "feature:linked-pair-download"
  // Every engineering query parameter and surface route.
  | "route:engineering-query"
  // Engineering window globals.
  | "global:weapon-debug"
  | "global:foundry-audio-preview";

const screenSurfaceId = (screen: EngineeringScreen): `screen:${EngineeringScreen}` => `screen:${screen}`;

/**
 * The sole source-owned classification. Promote a surface by changing its
 * channel here, or a screen by changing its channel in the screen catalog.
 */
export const SURFACE_CHANNEL: Readonly<Record<SurfaceId, SurfaceChannel>> = Object.freeze({
  ...(Object.fromEntries(ENGINEERING_SCREENS.map((screen) => [screenSurfaceId(screen), "engineering"])) as Record<
    `screen:${EngineeringScreen}`,
    SurfaceChannel
  >),
  "control:run-monitor": "engineering",
  "setup:boss-picker": "engineering",
  "feature:seed-race": "engineering",
  "feature:beat-this-run": "engineering",
  "feature:boss-memory": "engineering",
  "feature:coach": "engineering",
  "feature:replay-editor": "engineering",
  "feature:ghost-cloud": "engineering",
  "feature:linked-pair-download": "engineering",
  "route:engineering-query": "engineering",
  "global:weapon-debug": "engineering",
  "global:foundry-audio-preview": "engineering",
});

export interface SurfaceAvailability {
  readonly channel: SurfaceChannel;
  /** True when the named surface may be shown, entered or installed. */
  allows(id: SurfaceId): boolean;
  /** True when data authored for the given channel (for example a run mode) is available. */
  admits(channel: SurfaceChannel): boolean;
}

export function createSurfaceAvailability(channel: SurfaceChannel): SurfaceAvailability {
  const requested: string = channel;
  if (requested !== "release" && requested !== "engineering") throw new TypeError("unknown surface channel");
  const admits = (surface: SurfaceChannel): boolean => surface === "release" || channel === "engineering";
  return Object.freeze({
    channel,
    allows: (id: SurfaceId): boolean => {
      const surface = SURFACE_CHANNEL[id] as SurfaceChannel | undefined;
      if (surface === undefined) throw new RangeError(`unknown surface: ${id}`);
      return admits(surface);
    },
    admits,
  });
}

/** The surface that owns an application screen, or undefined for an ordinary player screen. */
export function screenSurface(screen: string): SurfaceId | undefined {
  return screenFacts(screen)?.channel === "engineering" ? screenSurfaceId(screen as EngineeringScreen) : undefined;
}

const CAREER_COMMAND_SURFACES: Readonly<Partial<Record<string, SurfaceId>>> = Object.freeze({
  race: "feature:seed-race",
  coach: "feature:coach",
  publish: "feature:ghost-cloud",
  beat: "feature:beat-this-run",
  "beat-receive": "feature:beat-this-run",
  "beat-review": "feature:beat-this-run",
  "beat-save": "feature:beat-this-run",
  "beat-retry": "feature:beat-this-run",
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
  if (type.startsWith("training-archive.") || type.startsWith("academy.")) return "screen:academy";
  if (type.startsWith("training-operations.") || type.startsWith("foundry.")) return "screen:foundry";
  if (type === "game-agent.open") return "screen:botevidence";
  if (type === "run-monitor.control" || type === "replay.hub.watch" || type === "ghostlab.watch")
    return "control:run-monitor";
  if (type === "run-monitor.open" || type === "replay.hub.open" || type === "ghostlab.open") return "screen:ghostlab";
  if (type.startsWith("replay.coach.")) return "feature:coach";
  if (type.startsWith("replay.editor.") || type.startsWith("replay.studio.")) return "feature:replay-editor";
  if (
    type === "profile.loadOwnGhostCapsules" ||
    type === "profile.recoverOwnGhostCapsule" ||
    type === "profile.closeOwnGhostCatalog" ||
    type === "profile.openGhostPublication" ||
    type.startsWith("ghostpublication.")
  )
    return "feature:ghost-cloud";
  if (type === "profile.openGhostSupport" || type.startsWith("ghostsupport.")) return "screen:ghostsupport";
  return undefined;
}

/** True when the action is an ordinary player action or its surface is available. */
export function screenActionAvailable(surfaces: SurfaceAvailability, action: ScreenAction): boolean {
  const surface = screenActionSurface(action);
  return surface === undefined || surfaces.allows(surface);
}

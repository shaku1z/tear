import type { WorldRendererRegistry } from "../../presentation/world";

/** Who sees a frame: the person playing, or someone watching a replay of the run. */
export type OverlayViewer = "player" | "watcher";

/**
 * Every layer play draws over or in the world: the world renderers' entries, and the layers live play draws
 * itself (`renderWorldLayers` and the post layers in src/app/interface/presentation-composition.ts).
 */
export type OverlayLayer =
  | keyof WorldRendererRegistry
  | "hitFlash"
  | "chaseHud"
  | "stageBeat"
  | "cinematic"
  | "rankPopup"
  | "controllerToast"
  | "screenWipe"
  | "cursor";

/**
 * Who each layer is for. "everyone": what happened in the run (the HUD's numbers, the banners, a scene, the
 * reticle, an enemy's status), which a replay shows as play showed it. "player": an alarm, an aid or a device
 * mark for the person holding the controls (the red low-health screen, the whole-screen hit flash, lessons,
 * touch controls, toasts, the cursor, engineering overlays), which a replay never shows.
 *
 * A new layer does not compile until it is listed here, so each one is a decision.
 */
export const OVERLAY_AUDIENCE = Object.freeze({
  enemyStatus: "everyone",
  finaleWorld: "everyone",
  hud: "everyone",
  waveBanner: "everyone",
  stageBanner: "everyone",
  stageBeat: "everyone",
  cinematic: "everyone",
  rankPopup: "everyone",
  reticle: "everyone",
  lowHealthScreen: "player",
  hitFlash: "player",
  chaseHud: "player",
  tutorialCard: "player",
  coachMarks: "player",
  touchControls: "player",
  achievementToast: "player",
  controllerToast: "player",
  screenWipe: "player",
  cursor: "player",
  pantheonDebug: "player",
} as const satisfies Record<OverlayLayer, "everyone" | "player">);

/** True when `viewer` sees `layer`: the player sees every layer, a watcher only the run's. */
export function shownTo(layer: OverlayLayer, viewer: OverlayViewer): boolean {
  return viewer === "player" || OVERLAY_AUDIENCE[layer] === "everyone";
}

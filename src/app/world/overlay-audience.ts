import type { WorldRendererRegistry } from "../../presentation/world";

/** Who sees a frame: the person playing, or someone watching a replay of the run. */
export type OverlayViewer = "player" | "watcher";

/**
 * Every layer play draws over or in the world: the world renderers' entries, and the layers live play draws
 * itself (`renderWorldLayers`, the overlay backdrop and the post layers in
 * src/app/interface/presentation-composition.ts, and the camera's shake).
 */
export type OverlayLayer =
  | keyof WorldRendererRegistry
  | "backdropPost"
  | "echoFlash"
  | "parryFlash"
  | "screenShake"
  | "chaseHud"
  | "stageBeat"
  | "cinematic"
  | "rankPopup"
  | "runOverlay"
  | "controllerToast"
  | "screenWipe"
  | "rotationGate"
  | "cursor";

/**
 * Who a layer is for. "everyone": what happened in the run, which a replay shows as play showed it.
 * "player": an alarm, an aid or a device mark for the person holding the controls, which a replay never shows.
 */
export type OverlayAudience = "everyone" | "player";

/**
 * Where a layer is drawn. "world": at a place in the arena (an enemy's status, the reticle at the blade), so it
 * moves with the camera. "screen": against the view (the HUD in its corners, a banner across it, a whole-screen
 * tint), so it is drawn to the rectangle the frame is shown in: the whole screen in play, the replay's own
 * rectangle in a replay, never the arena's box in the middle of it.
 */
export type OverlayFraming = "world" | "screen";

export interface OverlayRule {
  readonly audience: OverlayAudience;
  readonly framing: OverlayFraming;
}

const run = (framing: OverlayFraming): OverlayRule => Object.freeze({ audience: "everyone", framing });
const players = (framing: OverlayFraming): OverlayRule => Object.freeze({ audience: "player", framing });

/**
 * Who each layer is for and where it is drawn. A new layer does not compile until it is listed here, so each
 * one is a decision. tests/unit/replay-screen-layers.test.ts draws a replay frame into an off-centre rectangle
 * and fails when a layer the replay keeps leaves that rectangle or is not anchored to it.
 */
export const OVERLAY_LAYERS = Object.freeze({
  // The run, as it happened.
  hud: run("screen"),
  waveBanner: run("screen"),
  stageBanner: run("screen"),
  stageBeat: run("screen"),
  cinematic: run("screen"),
  rankPopup: run("screen"),
  // The stage's own vignette and combat light over the world.
  backdropPost: run("screen"),
  // The Echo's reappearance whitens the scene: the enemy's tell, not a reaction to the player.
  echoFlash: run("screen"),
  enemyStatus: run("world"),
  finaleWorld: run("world"),
  reticle: run("world"),
  // The player's own alarms, aids and devices.
  lowHealthScreen: players("screen"),
  // The whole-screen flash on a parry (`config.juice.flashParry`, inverted over the scene) and the camera's shake
  // on impacts: felt by the one playing. The parry's spark at the clash is a world effect and stays in a replay.
  parryFlash: players("screen"),
  screenShake: players("screen"),
  chaseHud: players("screen"),
  tutorialCard: players("screen"),
  coachMarks: players("screen"),
  touchControls: players("screen"),
  achievementToast: players("screen"),
  controllerToast: players("screen"),
  // The pause, draft and results screens over a run, with their dimmed backdrop.
  runOverlay: players("screen"),
  screenWipe: players("screen"),
  rotationGate: players("screen"),
  cursor: players("screen"),
  pantheonDebug: players("world"),
} as const satisfies Record<OverlayLayer, OverlayRule>);

/** True when `viewer` sees `layer`: the player sees every layer, a watcher only the run's. */
export function shownTo(layer: OverlayLayer, viewer: OverlayViewer): boolean {
  return viewer === "player" || OVERLAY_LAYERS[layer].audience === "everyone";
}

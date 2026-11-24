import type { WorldRenderContext, WorldRendererRegistry } from "./contracts";
import { createFinaleRenderer } from "./finale";
import { createHudRenderer, createLowHealthScreenRenderer } from "./hud";
import { createOverlayRenderers } from "./overlays";
import { createStatusDebugRenderers } from "./status-debug";
import { createTutorialCardRenderer } from "./tutorial-card";
import { createTouchControlsRenderer } from "./touch-controls";
import { createCoachMarkRenderer } from "./coach-mark-renderer";

export type * from "./contracts";

/** Presentation-only façade. The legacy adapter owns snapshot creation and every state mutation. */
export function createWorldRenderers(context: WorldRenderContext): WorldRendererRegistry {
  const statusDebug = createStatusDebugRenderers(context);
  const finaleWorld = createFinaleRenderer(context);
  const hud = createHudRenderer(context);
  const tutorial = createTutorialCardRenderer(context);
  // Mobile is paused: production builds leave the touch controls out (plans/MOBILE_LATER.md).
  const touch = __TEAR_MOBILE__ ? createTouchControlsRenderer(context, tutorial.takeLessonCard) : null;
  const overlays = createOverlayRenderers(context);
  const coach = createCoachMarkRenderer(context);
  return {
    enemyStatus: statusDebug.enemyStatus,
    pantheonDebug: statusDebug.pantheonDebug,
    finaleWorld,
    hud,
    lowHealthScreen: createLowHealthScreenRenderer(context),
    tutorialCard: tutorial.tutorialCard,
    coachMarks: coach.coachMarks,
    achievementToast: overlays.achievementToast,
    touchControls: (snapshot) => {
      touch?.touchControls(snapshot);
    },
    waveBanner: overlays.waveBanner,
    stageBanner: overlays.stageBanner,
    reticle: overlays.reticle,
  };
}

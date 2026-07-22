import type { LegacyWorldRenderContext, LegacyWorldRendererRegistry } from "./contracts";
import { createFinaleRenderer } from "./finale";
import { createHudRenderer } from "./hud";
import { createOverlayRenderers } from "./overlays";
import { createStatusDebugRenderers } from "./status-debug";
import { createTrainingTouchRenderers } from "./training-touch";

export type * from "./contracts";

/** Presentation-only façade. The legacy adapter owns snapshot creation and every state mutation. */
export function createLegacyWorldRenderers(context: LegacyWorldRenderContext): LegacyWorldRendererRegistry {
  const statusDebug = createStatusDebugRenderers(context);
  const finaleWorld = createFinaleRenderer(context);
  const hud = createHudRenderer(context);
  const trainingTouch = createTrainingTouchRenderers(context);
  const overlays = createOverlayRenderers(context);
  return {
    enemyStatus: statusDebug.enemyStatus,
    pantheonDebug: statusDebug.pantheonDebug,
    finaleWorld,
    hud,
    tutorialCard: trainingTouch.tutorialCard,
    playgroundHelp: trainingTouch.playgroundHelp,
    achievementToast: overlays.achievementToast,
    touchControls: trainingTouch.touchControls,
    waveBanner: overlays.waveBanner,
    bossIntro: overlays.bossIntro,
    stageBanner: overlays.stageBanner,
    reticle: overlays.reticle,
  };
}

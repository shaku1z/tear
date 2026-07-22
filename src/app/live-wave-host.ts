import { LiveWaveController, type LiveWavePort } from "../gameplay/run/live-wave-controller";
import { bindWaveClearIntents, bindWavePlanIntents, type WaveClearIntentPort,
  type WavePlanIntentPort } from "./live-wave-intent-coordinator";

export interface LiveWaveHostOptions extends Omit<LiveWavePort, "executePlanIntents" | "executeClearIntents"> {
  readonly planIntents: WavePlanIntentPort;
  readonly clearIntents: WaveClearIntentPort;
  readonly install: (controller: LiveWaveController) => void;
}

/** Composes wave planning, intent dispatch, activation, and clearing as one run subsystem. */
export function createLiveWaveHost(options: LiveWaveHostOptions): LiveWaveController {
  const controller = new LiveWaveController({
    run: options.run,
    tuning: options.tuning,
    stages: options.stages,
    presets: options.presets,
    random: options.random,
    modeDefinition: options.modeDefinition,
    currentStage: options.currentStage,
    stageHasChapter: options.stageHasChapter,
    chapterFlowActive: options.chapterFlowActive,
    lifecycle: options.lifecycle,
    executePlanIntents: bindWavePlanIntents(options.planIntents),
    executeClearIntents: bindWaveClearIntents(options.clearIntents),
    spawn: options.spawn,
    enemyCount: options.enemyCount,
    loreBusy: options.loreBusy,
    achievementTracking: options.achievementTracking,
    playerOneHit: options.playerOneHit,
    availableTierUpCount: options.availableTierUpCount,
  });
  options.install(controller);
  return controller;
}

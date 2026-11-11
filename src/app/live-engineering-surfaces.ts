import type { LiveEngineeringSurfaceFactory } from "./live-engineering-surfaces-contract";
import { createLiveAcademyScreen } from "./live-academy-screen";
import { createLiveFoundryScreen } from "./live-foundry-screen";
import { createLiveGhostLabHome } from "./live-ghost-lab-home";
import { createLiveHumanCalibrationCaptureComposition } from "./live-human-calibration-capture-composition";
import { LiveBotEvidenceController } from "./live-bot-evidence-controller";
import { LivePlayerWatchController } from "./live-player-watch-controller";

/**
 * Engineering-channel implementation of the research and diagnostic surfaces.
 * Only composition imports this module, dynamically and behind the
 * engineering build constant, so release bundles never include it.
 */
const surfaces: LiveEngineeringSurfaceFactory = {
  humanCalibration: createLiveHumanCalibrationCaptureComposition,
  academy: createLiveAcademyScreen,
  foundry: createLiveFoundryScreen,
  playerWatch: (factory, port) => new LivePlayerWatchController(factory, port),
  replayHub: createLiveGhostLabHome,
  botEvidence: (factory) => new LiveBotEvidenceController(factory),
};
export const LIVE_ENGINEERING_SURFACES: LiveEngineeringSurfaceFactory = Object.freeze(surfaces);

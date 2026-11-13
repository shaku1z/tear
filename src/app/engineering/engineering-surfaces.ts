import type { LiveEngineeringSurfaceFactory } from "./engineering-surfaces-contract";
import { createLiveAcademyScreen } from "./academy-screen";
import { createLiveFoundryScreen } from "./foundry-screen";
import { createLiveGhostLabHome } from "../replay/ghost-lab-home";
import { createLiveHumanCalibrationCaptureComposition } from "./human-calibration-capture-composition";
import { LiveBotEvidenceController } from "./bot-evidence-controller";
import { LivePlayerWatchController } from "./player-watch-controller";

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

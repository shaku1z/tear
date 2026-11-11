import type { AcademyScreenView, BotEvidenceScreenView, FoundryScreenView, GhostLabScreenView } from "../presentation/screens/contracts";
import type { createLiveAcademyScreen } from "./live-academy-screen";
import type { createLiveFoundryScreen } from "./live-foundry-screen";
import type { createLiveHumanCalibrationCaptureComposition } from "./live-human-calibration-capture-composition";
import type { LivePlayerWatchController, PlayerWatchPort } from "./live-player-watch-controller";
import type { LiveBotEvidenceController } from "./live-bot-evidence-controller";

export type LiveAcademySurface = ReturnType<typeof createLiveAcademyScreen>;
export type LiveFoundrySurface = ReturnType<typeof createLiveFoundryScreen>;
export type LiveHumanCalibrationSurface = Pick<ReturnType<typeof createLiveHumanCalibrationCaptureComposition>, "capture"> & Readonly<{ input: Readonly<{ reset: () => void }> }>;
export type LivePlayerWatchSurface = Pick<LivePlayerWatchController, "snapshot" | "refresh" | "start" | "pause" | "resume" | "stop" | "observeRunEvent" | "advance">;
export type LiveReplayHubSurface = Readonly<{ snapshot: () => GhostLabScreenView }>;
export type LiveBotEvidenceSurface = Pick<LiveBotEvidenceController, "snapshot" | "refresh">;

/**
 * The research and diagnostic controllers behind the engineering-channel
 * screens (Training Archive, Training Operations, Replay Hub, Game Agent
 * evidence, Run Monitor) and human-calibration capture.
 *
 * Composition injects the real implementation only in engineering builds,
 * through a build-constant-guarded dynamic import, so release bundles never
 * contain it. Release builds use the inert stand-ins below; the application
 * state controller already refuses every screen they would back.
 */
export interface LiveEngineeringSurfaceFactory {
  humanCalibration(factory: IDBFactory | undefined, target: Window, currentSignedInActor: () => string | undefined): LiveHumanCalibrationSurface;
  academy(factory: IDBFactory | undefined, currentSignedInActor: () => string | undefined): LiveAcademySurface;
  foundry(factory: IDBFactory | undefined): LiveFoundrySurface;
  playerWatch(factory: IDBFactory | undefined, port: PlayerWatchPort): LivePlayerWatchSurface;
  replayHub(watch: LivePlayerWatchSurface): LiveReplayHubSurface;
  botEvidence(factory: IDBFactory | undefined): LiveBotEvidenceSurface;
}

const unavailable = "unavailable in this build";
const ignore = (): void => undefined;
const settled = (): Promise<void> => Promise.resolve();
const ACADEMY_VIEW: AcademyScreenView = Object.freeze({ id: "academy", status: "unavailable", subtitle: unavailable, rows: Object.freeze([]), records: Object.freeze([]), manifests: Object.freeze([]) });
const FOUNDRY_VIEW: FoundryScreenView = Object.freeze({ id: "foundry", status: "unavailable", subtitle: unavailable, automation: "unavailable", launchProfiles: Object.freeze([]), jobs: Object.freeze([]), schedules: Object.freeze([]) });
const WATCH_VIEW = Object.freeze({ status: "unavailable" as const, detail: unavailable, decisions: 0 });
const HUB_VIEW: GhostLabScreenView = Object.freeze({ id: "ghostlab", subtitle: unavailable, routes: Object.freeze([]), unavailable: Object.freeze([]), watch: WATCH_VIEW });
const BOT_VIEW: BotEvidenceScreenView = Object.freeze({ id: "botevidence", status: "unavailable", subtitle: unavailable, detail: unavailable });

/** Inert release stand-ins: no storage reads, timers, listeners, or research code. */
export const RELEASE_ENGINEERING_SURFACES: LiveEngineeringSurfaceFactory = Object.freeze({
  humanCalibration: () => Object.freeze({ input: Object.freeze({ reset: ignore }), capture: undefined }),
  academy: () => Object.freeze({ snapshot: () => ACADEMY_VIEW, refresh: ignore, advance: ignore, review: ignore, withdrawModelTraining: ignore, setHumanCalibrationConsent: ignore }),
  foundry: () => Object.freeze({ snapshot: () => FOUNDRY_VIEW, refresh: ignore, bootstrap: ignore, promote: ignore, restoreBaseline: ignore, setScheduleEnabled: ignore }),
  playerWatch: () => Object.freeze({ snapshot: () => WATCH_VIEW, refresh: settled, start: ignore, pause: ignore, resume: ignore, stop: ignore, observeRunEvent: ignore, advance: ignore }),
  replayHub: () => Object.freeze({ snapshot: () => HUB_VIEW }),
  botEvidence: () => Object.freeze({ snapshot: () => BOT_VIEW, refresh: settled }),
});

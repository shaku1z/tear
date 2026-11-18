import type { RunDifficulty, RunMode } from "../../gameplay/run/session";
import { isRunDifficultySelection, isRunModeSelection } from "../interface/interface-composition";
import type { LiveScreenNavigation } from "../interface/live-screen-navigation";
import type { LiveGameplayEventFanOut } from "../run/live-gameplay-event-fanout";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameRun, GamePlayer } from "../../gameplay/runtime/game-runtime-state";
import type { LiveSessionServices } from "../shell/session-services-composition";
import type { LiveCampaignTraining } from "../campaign/campaign-training-composition";
import type { LiveWorldComposition } from "../world/world-composition";
import type { LiveWorldSessionState } from "../world/world-session-state";
import { createLiveGhostChase } from "./ghost-chase-composition";

/** Screens on which a running chase continues; every other screen stops it. */
const CHASE_SCREENS = [
  "profile",
  "playing",
  "paused",
  "draft",
  "reserve",
  "tierup",
  "settings",
  "confirmquit",
  "continue",
  "gameover",
  "win",
];

export interface LiveGhostChaseRuntimeOptions {
  readonly indexedDb: IDBFactory | undefined;
  readonly ui: GameRuntimeDependencies["UI"];
  readonly browserWindow: Pick<Window, "addEventListener">;
  readonly world: Pick<LiveWorldComposition, "state" | "context">;
  readonly stage: LiveCampaignTraining["campaign"]["stage"];
  readonly session: LiveWorldSessionState;
  readonly services: Pick<LiveSessionServices, "beat" | "seedRace" | "controllers">;
  readonly navigation: LiveScreenNavigation;
  readonly gameplayEvents: LiveGameplayEventFanOut;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
}

/** The live ghost chase reference: its launch from Profile, run-event feed, and screen-driven stop. */
export function createLiveGhostChaseRuntime(options: LiveGhostChaseRuntimeOptions) {
  const { stage: stageRuntime, session, navigation } = options;
  const { beat, seedRace } = options.services;
  const { startRun: startRunImmediate } = options.services.controllers.api;
  const hostState = options.world.state;
  const CINEMA = options.world.context.cinema;
  const chase = createLiveGhostChase({
    beat: beat.snapshot,
    factory: options.indexedDb,
    ui: options.ui,
    run: options.run,
    player: options.player,
    stage: () => stageRuntime.index,
    platforms: () => stageRuntime.platforms,
    blocked: () => navigation.screen() !== "playing" || CINEMA.active || hostState.bossIntro() !== null,
    prepareStart: (reference) => {
      if (
        navigation.screen() !== "profile" ||
        !isRunModeSelection(reference.mode) ||
        !isRunDifficultySelection(reference.difficulty)
      ) {
        throw new Error("Chase launch is no longer owned by Profile.");
      }
      navigation.setScreen("setup");
    },
    start: (reference, racing) => {
      if (!isRunModeSelection(reference.mode) || !isRunDifficultySelection(reference.difficulty))
        throw new Error("Reference category unsupported.");
      session.takeRunSeed();
      session.setSelectedWeapon(reference.weapon);
      session.setSelectedMode(reference.mode);
      session.setSelectedDifficulty(reference.difficulty);
      if (racing) {
        session.setSelectedBoss(reference.seedRace?.shared.boss ?? "shuffle");
        seedRace.challenge(reference, () => {
          startRunImmediate(reference.mode as RunMode, reference.difficulty as RunDifficulty);
        });
      } else startRunImmediate(reference.mode, reference.difficulty);
    },
  });
  options.gameplayEvents.bind({ chase: chase.event });
  navigation.bind({
    cancelChase: (screen) => {
      if (screen === "setup" && chase.takeSetupLaunch()) return;
      if (!CHASE_SCREENS.includes(screen)) chase.stop();
      else if (screen !== "profile") chase.cancelPreparation();
    },
  });
  options.browserWindow.addEventListener("pagehide", () => {
    chase.stop();
  });
  return chase;
}

export type LiveGhostChaseRuntime = ReturnType<typeof createLiveGhostChaseRuntime>;

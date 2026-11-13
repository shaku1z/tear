import { createLiveBeatThisRunController } from "../replay/beat-this-run-controller";
import { createLiveSeedRace } from "../replay/seed-race-composition";
import type { PreparedVictory } from "../../gameplay/run/outcome-planner";
import { BestScoreRepository } from "../../gameplay/scoring/best-scores";
import { createLiveEconomyRuntime } from "../../gameplay/scoring/live-economy-runtime";
import type { GameBlade, GamePlayer, GameRun } from "./game-runtime-state";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { AppScreen } from "../../domain/screen-catalog";
import { initializeLivePlatformBootstrap } from "./platform-bootstrap";
import { createRewardRuntime } from "../../gameplay/run/reward-runtime";
import { LiveRunControllerRegistry } from "../run/run-controller-api";
import { SettingsController } from "../screens/settings-controller";

type ReplayPacket = NonNullable<ReturnType<GameRuntimeDependencies["GHOST"]["stopRec"]>>;

export interface LiveSessionServicesOptions {
  readonly beat?: Omit<
    Parameters<typeof createLiveBeatThisRunController>[0],
    "factory" | "publication" | "document" | "run"
  >;
  readonly seedRace?: Omit<
    Parameters<typeof createLiveSeedRace>[0],
    "dependencies" | "run" | "player" | "blade" | "resetRewards"
  >;
  readonly dependencies: GameRuntimeDependencies;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
  readonly screen: () => AppScreen;
  readonly setScreen: (screen: AppScreen) => void;
  readonly achievementTracking: () => boolean;
  readonly resetUi: (intent: Readonly<{ enter: boolean; focus: boolean; scroll: boolean }>) => void;
  readonly requestPointerLock: () => void;
  readonly renamePrompted: () => boolean;
  readonly renameActive: () => boolean;
  readonly markRenamePrompted: () => void;
  readonly beginRename: (firstRun: boolean) => void;
}

/** Composes settings, progression economy, rewards, scores, and controller registry. */
export function createLiveSessionServices(options: LiveSessionServicesOptions) {
  const d = options.dependencies;
  const settingsController = new SettingsController({
    config: d.CONFIG,
    accessibility: d.A11Y,
    graphics: d.GFX,
    input: d.Input,
    gamepad: d.PAD,
    audio: d.SFX,
    store: d.CG.store,
    navigator: d.browserNavigator,
    matchMedia: (query) => d.browserWindow.matchMedia(query),
  });
  const controllers = new LiveRunControllerRegistry<GameRun, ReplayPacket, PreparedVictory>();
  initializeLivePlatformBootstrap(d, settingsController, {
    screen: options.screen,
    prompted: options.renamePrompted,
    active: options.renameActive,
    markPrompted: options.markRenamePrompted,
    begin: options.beginRename,
  });
  const economy = createLiveEconomyRuntime({
    run: options.run,
    remoteCoinMultiplier: () => d.REMOTE.coinMult,
    meta: d.META,
    shop: d.SHOP,
    shopId: (item) => item.id,
    achievementTracking: options.achievementTracking,
    addProfileStat: d.profileStatsPersistence.add,
  });
  const unavailableBeat = (): never => {
    throw new Error("Beat This Run start unavailable");
  };
  const beat = createLiveBeatThisRunController({
    factory: d.browserIndexedDb,
    publication: d.ghostPublication,
    document: d.browserDocument,
    run: options.run,
    ...(options.beat ?? {
      screen: options.screen,
      capture: unavailableBeat,
      tick: unavailableBeat,
      recording: {
        recorder: () => null,
        replayContext: () => undefined,
        reset: unavailableBeat,
        nextEventSequence: unavailableBeat,
        setReplayContext: unavailableBeat,
      },
      nativeStart: {
        session: () => ({
          setSelectedWeapon: unavailableBeat,
          setSelectedMode: unavailableBeat,
          setSelectedDifficulty: unavailableBeat,
          setSelectedBoss: unavailableBeat,
          setRunSeed: unavailableBeat,
        }),
        prepare: unavailableBeat,
        start: unavailableBeat,
        refuse: unavailableBeat,
      },
    }),
  });
  const reward = createRewardRuntime({
    ...(options.seedRace === undefined
      ? {}
      : {
          beforeDecision: (
            decision: Parameters<ReturnType<typeof createLiveSeedRace>["recordDecision"]>[0],
            before: Parameters<ReturnType<typeof createLiveSeedRace>["recordDecision"]>[1],
          ) =>
            options.run().beatThisRun
              ? beat.recordDecision(decision, before)
              : seedRace.recordDecision(decision, before),
        }),
    run: options.run,
    roll: (request) =>
      d.rollUpgrades(request.count, options.run().mods, {
        random: d.GAME_RANDOM_STREAMS.stream("draft"),
        forceSpecial: request.forceSpecial,
        excludeIds: request.excludeIds,
      }),
    transitionPorts: {
      applyUpgrade: (choice) => {
        d.applyUpgrade(choice, {
          config: d.CONFIG,
          player: options.player(),
          blade: options.blade(),
          mods: options.run().mods,
        });
      },
      tierUp: (choice) => {
        d.tierUp(choice.id, {
          config: d.CONFIG,
          player: options.player(),
          blade: options.blade(),
          mods: options.run().mods,
        });
      },
      ghostLoadout: (choiceId, tier, wave) => {
        d.GAMEPLAY_EVENTS.emit({ kind: "loadout", choiceId, tier, wave });
      },
      ghostEvent: (event) => {
        d.GAMEPLAY_EVENTS.emit({
          kind: "effect",
          effect: event,
          x: options.player().x,
          y: options.player().y,
        });
      },
      consumeInput: () => {
        d.Input.consumeDelta();
      },
      resetUi: options.resetUi,
      setScreen: options.setScreen,
      startNextWave: controllers.api.startNextWave,
      requestPointer: options.requestPointerLock,
    },
  });
  const unavailable = (): never => {
    throw new Error("Seed-Locked Race start ports unavailable");
  };
  const seedRace = createLiveSeedRace({
    ...(options.seedRace ?? {
      baseline: unavailable,
      capture: unavailable,
      setup: unavailable,
      recording: {
        runId: unavailable,
        active: () => false,
        nextSequence: unavailable,
        tick: unavailable,
        record: unavailable,
      },
    }),
    dependencies: d,
    run: options.run,
    player: options.player,
    blade: options.blade,
    resetRewards: reward.reset,
  });
  const bestScores = new BestScoreRepository(d.CG.store);
  return Object.freeze({
    settingsController,
    settings: settingsController.settings,
    applySettings: settingsController.api.apply,
    controllers,
    economy,
    reward,
    bestScores,
    seedRace,
    beat,
  });
}

export type LiveSessionServices = ReturnType<typeof createLiveSessionServices>;

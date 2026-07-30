import type { PreparedVictory } from "../gameplay/run/outcome-planner";
import { BestScoreRepository } from "../gameplay/scoring/best-scores";
import { createLiveEconomyRuntime } from "../gameplay/scoring/live-economy-runtime";
import type { GameBlade, GamePlayer, GameRun } from "./game-runtime-state";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { LegacyAppScreen } from "./legacy-state-controller";
import { initializeLivePlatformBootstrap } from "./live-platform-bootstrap";
import { createLiveRewardRuntime } from "./live-reward-runtime";
import { LiveRunControllerRegistry } from "./live-run-controller-api";
import { SettingsController } from "./settings-controller";

type ReplayPacket = NonNullable<ReturnType<GameRuntimeDependencies["GHOST"]["stopRec"]>>;

export interface LiveSessionServicesOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
  readonly screen: () => LegacyAppScreen;
  readonly setScreen: (screen: LegacyAppScreen) => void;
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
    config: d.CONFIG, accessibility: d.A11Y, graphics: d.GFX, input: d.Input, gamepad: d.PAD,
    audio: d.SFX, store: d.CG.store, navigator, matchMedia: (query) => window.matchMedia(query),
  });
  const controllers = new LiveRunControllerRegistry<GameRun, ReplayPacket, PreparedVictory>();
  initializeLivePlatformBootstrap(d, settingsController, {
    screen: options.screen, prompted: options.renamePrompted, active: options.renameActive,
    markPrompted: options.markRenamePrompted, begin: options.beginRename,
  });
  const economy = createLiveEconomyRuntime({
    run: options.run, remoteCoinMultiplier: () => d.REMOTE.coinMult, meta: d.META,
    shop: d.SHOP, shopId: (item) => item.id, achievementTracking: options.achievementTracking,
    addProfileStat: (stat, amount) => { d.PROFILE.addStat(stat, amount); },
  });
  const reward = createLiveRewardRuntime({
    run: options.run,
    roll: (request) => d.rollUpgrades(request.count, options.run().mods, {
      random: d.GAME_RANDOM_STREAMS.stream("draft"), forceSpecial: request.forceSpecial, excludeIds: request.excludeIds,
    }),
    transitionPorts: {
      applyUpgrade: (choice) => { d.applyUpgrade(choice, {
        player: options.player(), blade: options.blade(), mods: options.run().mods,
      }); },
      tierUp: (choice) => { d.tierUp(choice.id, {
        player: options.player(), blade: options.blade(), mods: options.run().mods,
      }); },
      ghostLoadout: (choiceId, tier, wave) => { d.GHOST.loadoutPick(choiceId, tier, wave); },
      ghostEvent: (event) => { d.GHOST.event(event, options.player().x, options.player().y); },
      consumeInput: () => { d.Input.consumeDelta(); }, resetUi: options.resetUi,
      setScreen: options.setScreen, startNextWave: controllers.api.startNextWave,
      requestPointer: options.requestPointerLock,
    },
  });
  const bestScores = new BestScoreRepository(d.CG.store);
  return Object.freeze({
    settingsController, settings: settingsController.settings, applySettings: settingsController.api.apply,
    controllers, economy, reward, bestScores,
  });
}

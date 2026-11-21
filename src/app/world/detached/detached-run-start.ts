import { REMOTE } from "../../../config/game-config";
import { createCampaignChapterController } from "../../../gameplay/campaign/campaign-controller-factory";
import type { ChapterIntent } from "../../../gameplay/campaign/chapter-controller";
import type { StagedCampaignChapterBinding } from "../../../gameplay/campaign/chapter-cinematic-binding";
import { createChapterLaunchMemory } from "../../../gameplay/campaign/cinematic-preference";
import type { RunChapterPort } from "../../../gameplay/campaign/run-chapter";
import { createMetaShop } from "../../../gameplay/progression/meta";
import { LiveRunStartController } from "../../../gameplay/run/live-run-start-controller";
import type { RunStartChoices } from "../../../gameplay/run/run-start-choices";
import { stageAt } from "../../../gameplay/stages";
import { applyUpgrade, newMods, UPGRADES } from "../../../gameplay/upgrades";
import { applyWeapon } from "../../../gameplay/weapons";
import { createUiState } from "../../../presentation/ui-tokens";
import type { CinematicDirectorBinding } from "../../../gameplay/runtime/cinematic-director";
import { createRunStartWorldPort, type RunStartWorldContext } from "../../run/run-start-world";
import type { GameRuntimeDependencies } from "../../shell/game-runtime-dependencies";
import type { ProductionRunOpening, ProductionWaveRewardRuntime } from "./wave-reward-runtime";
import type { ProductionReplayWorld } from "./world-factory";

/** How a detached world holds the chapter binding a launch installs. */
export interface DetachedChapterBinding {
  readonly install: (chapter: StagedCampaignChapterBinding) => void;
  readonly clear: () => void;
  readonly dispatch: (intents: readonly ChapterIntent[]) => void;
}

/** The run's chapter launch in a detached world: the live rule, its cinematics and played chapters from the start. */
export function createDetachedChapterPort(
  replay: ProductionReplayWorld,
  choices: Pick<RunStartChoices, "playedChapters">,
  binding: DetachedChapterBinding,
): RunChapterPort {
  const config = replay.configuration.value;
  return Object.freeze({
    run: () => replay.world.state.run(),
    stageAt,
    chapters: createChapterLaunchMemory(() => replay.world.state.run()?.cinematics ?? "full", choices.playedChapters),
    launch: {
      runtime: {
        get chapterController() {
          return createCampaignChapterController(createUiState(config.colors).t.motion, config);
        },
        installChapterBinding: binding.install,
        clearChapterBinding: binding.clear,
      },
      cinema: {
        startBinding: (chapter: CinematicDirectorBinding) => {
          replay.world.context.cinema.start(chapter.script, chapter.context);
        },
      },
      preparedWave: () => replay.world.lifecycle.hasPreparedWave,
      activationDeferred: () => replay.world.lifecycle.activationDeferred,
      dispatch: binding.dispatch,
      clearBossBeat: () => {
        replay.world.state.setBossBeat(null);
      },
    },
  });
}

export interface DetachedRunStart {
  readonly replay: ProductionReplayWorld;
  readonly waveReward: ProductionWaveRewardRuntime;
  readonly combat: Readonly<{
    simulationRuntime: Readonly<{ reset(tick?: number): void }>;
    combatEntityRuntime: Readonly<{ resetIdentity(): void }>;
  }>;
  readonly choices: RunStartChoices;
  /** A headless playtest's later opening wave; a recorded run has none. */
  readonly opening?: ProductionRunOpening;
  readonly resetChapter: () => void;
}

/** What a detached world gives the shared run start: its own stage, content, rewards and clocks. */
export function detachedRunStartWorld(start: Omit<DetachedRunStart, "choices">): RunStartWorldContext {
  const { replay, waveReward, combat } = start;
  const config = replay.configuration.value;
  const shop = createMetaShop({
    config,
    random: replay.random.streams.stream("draft"),
    upgrades: UPGRADES,
    applyUpgrade: (upgrade, context) => {
      applyUpgrade(upgrade, context as never);
    },
  });
  const dependencies = {
    CONFIG: config,
    REMOTE,
    SHOP: shop,
    GAMEPLAY_EVENTS: replay.dependencies.GAMEPLAY_EVENTS,
    newMods,
    applyWeapon,
  } as Pick<GameRuntimeDependencies, "CONFIG" | "REMOTE" | "SHOP" | "GAMEPLAY_EVENTS" | "newMods" | "applyWeapon">;
  return {
    dependencies,
    world: replay.world,
    width: config.view.w,
    combat: {
      resetClock: () => {
        combat.simulationRuntime.reset(0);
      },
      resetIdentity: () => {
        combat.combatEntityRuntime.resetIdentity();
      },
    },
    loadStage: (index) => {
      replay.loadStage(index, "new-run");
    },
    stage: replay.stage,
    story: {
      resetFinale: () => {
        replay.finale.story.resetFinale();
      },
      resetChapter: start.resetChapter,
    },
    content: waveReward.content,
    training: {
      platforms: replay.trainingHome,
      // Training runs are never recorded: a detached Playground has no arena of its own.
      playground: { state: {}, reset: () => undefined, enterArena: () => undefined },
      tutorial: {
        restoreSession: (value) => {
          replay.tutorial.restoreSession(value);
        },
        restorePresentation: (value) => {
          replay.tutorial.restorePresentation(value);
        },
        start: () => {
          replay.tutorial.start("unissued");
        },
      },
    },
    startNextWave: () => {
      waveReward.startOpeningWave(start.opening);
    },
    resetRewards: () => {
      waveReward.reward.reset();
    },
  };
}

/**
 * Starts a run in a detached world through the live run start: the same controller and the same world
 * steps, from the recorded start choices. The live game's outward steps (recording, music, pointer lock,
 * profile progress, debug globals) have nothing to do here.
 */
export function startDetachedRun(start: DetachedRunStart): void {
  const { waveReward, choices } = start;
  const world = createRunStartWorldPort(detachedRunStartWorld(start));
  const nothing = () => undefined;
  new LiveRunStartController({
    ...world,
    replaceActiveRun: nothing,
    resolveStart: () => choices,
    openReplayRecord: nothing,
    exposeDebugState: nothing,
    updateProgressionTracking: nothing,
    startRecording: nothing,
    enterPlayingState: () => {
      waveReward.restoreScreen("playing");
    },
    beginMusic: nothing,
    requestPointerLock: nothing,
  }).start(choices.mode, choices.difficulty);
}

import { WEAPONS } from "../gameplay/weapons";
import type { EnemyKind } from "../gameplay/run/content-director";
import {
  createTearSpawnFactPublisher,
  createTearWaveFactPublisher,
} from "../gameplay/runtime/gameplay-event-publishers";
import type { TearGameplayEventPort } from "../gameplay/runtime/gameplay-events";
import { dispatchWaveClearIntents, dispatchWavePlanIntents } from "../gameplay/run/wave-intent-dispatcher";
import type { WaveClearIntent } from "../gameplay/run/wave-clear-planner";
import type { WavePlanIntent } from "../gameplay/run/wave-planner";
import { LiveWaveController } from "../gameplay/run/live-wave-controller";
import { createLiveContentRuntime } from "../gameplay/run/live-content-runtime";
import { planBossPlacement } from "../gameplay/run/boss-placement";
import { beginBossEncounter } from "../gameplay/run/boss-encounter";
import { createRewardRuntime, type RewardRuntime } from "../gameplay/run/reward-runtime";
import { eligibleTierChoices } from "../gameplay/run/reward-selection";
import { createBossArena } from "../gameplay/training/arena-rules";
import { PRESETS, applyPreset, rollAffixes } from "../gameplay/affixes";
import { applyVariant, rollVariant } from "../gameplay/variants";
import { STAGES, stageAt, stagePlatforms } from "../gameplay/stages";
import { applyUpgrade, rollUpgrades, tierUp, UPGRADES, type UpgradeDefinition } from "../gameplay/upgrades";
import type { GameAction } from "../input/game-action";
import { routeLiveTearBenchAction } from "./live-runtime-action-routing";
import type { ProductionReplayWorld } from "./production-world-factory";
import type { ChapterPage } from "../gameplay/campaign/chapter-controller";

export interface ProductionWaveRewardRuntimeOptions {
  readonly gameplayEvents?: TearGameplayEventPort;
  readonly actorId?: (enemy: object & { id?: string }) => string;
  readonly startAdventureFinale?: () => void;
  readonly winRun?: () => void;
  /** Optional source-owned observer for the exact planner intents being applied. */
  readonly recordIntent?: (entry: ProductionWaveRewardIntent) => void;
  /** The authoritative scheduler tick when an intent is applied. */
  readonly currentTick?: () => number;
  readonly beginCampaignChapter?: (index: number, priorOutro?: ChapterPage | null) => void;
  readonly chapterFlowActive?: () => boolean;
  readonly bossIntroDelay?: (enemy: object, duration: number) => number;
}

/**
 * A bounded record of a real wave planner decision at the production-composition
 * boundary. It is an observation hook only: dispatch remains the sole effect.
 */
export type ProductionWaveRewardIntent =
  | Readonly<{ sequence: number; tick: number; channel: "plan"; intent: WavePlanIntent }>
  | Readonly<{ sequence: number; tick: number; channel: "clear"; intent: WaveClearIntent }>;

export interface ProductionWaveRewardRuntime {
  readonly waves: LiveWaveController;
  readonly reward: RewardRuntime<UpgradeDefinition>;
  readonly update: (seconds: number) => void;
  readonly routeAction: (action: GameAction) => boolean;
  readonly screen: () => string;
  readonly restoreScreen: (screen: string) => void;
  readonly focus: () => number;
  readonly restoreUi: (screen: string, focus: number) => void;
  readonly startNaturalOpening: () => void;
  readonly spawnTutorial: (
    kind: EnemyKind,
    hpScale: number,
  ) => ReturnType<ProductionReplayWorld["world"]["entities"]["createEnemy"]>;
  readonly outward: readonly string[];
}

type ProductionRun = ReturnType<ProductionReplayWorld["world"]["state"]["run"]> & {
  mode: string;
  wave: number;
  runSeed: number;
  spawnQueue?: unknown[];
  spawnTimer?: number;
  pendingBossOutro?: unknown;
  specialBlock: number;
  specialsOffered: number;
  reservedUpgrade: UpgradeDefinition | null;
  mods: {
    owned: Readonly<Record<string, number>>;
    tier: Readonly<Record<string, number>>;
    draftRerolls: number;
    waveHeal?: number;
  };
};

/**
 * Source-owned production wave, reward, and semantic-action composition for
 * replay and headless worlds. The same gameplay planner, spawn runtime, and
 * reward transitions serve each host; outward device work remains recorded
 * intent only.
 */
export function createProductionWaveRewardRuntime(
  replay: ProductionReplayWorld,
  options: ProductionWaveRewardRuntimeOptions = {},
): ProductionWaveRewardRuntime {
  const { world, random, stage } = replay;
  const config = replay.configuration.value;
  const outward: string[] = [];
  const note = (name: string) => () => {
    outward.push(name);
  };
  let intentSequence = 0;
  const recordIntents = (channel: "plan" | "clear", intents: readonly (WavePlanIntent | WaveClearIntent)[]): void => {
    for (const intent of intents) {
      const copied = Object.freeze(structuredClone(intent));
      const tick = options.currentTick?.() ?? 0;
      if (!Number.isSafeInteger(tick) || tick < 0)
        throw new RangeError("production intent observer requires a non-negative scheduler tick");
      if (channel === "plan") {
        options.recordIntent?.(
          Object.freeze({ sequence: ++intentSequence, tick, channel, intent: copied as WavePlanIntent }),
        );
      } else {
        options.recordIntent?.(
          Object.freeze({ sequence: ++intentSequence, tick, channel, intent: copied as WaveClearIntent }),
        );
      }
    }
  };
  const run = () => world.state.run() as never as ProductionRun;
  const actorId = options.actorId;
  const publishSpawn =
    options.gameplayEvents === undefined || actorId === undefined
      ? note("recordSpawn")
      : createTearSpawnFactPublisher(options.gameplayEvents, actorId);
  const publishWave =
    options.gameplayEvents === undefined ? note("recordWave") : createTearWaveFactPublisher(options.gameplayEvents);
  const install = (enemy: unknown) => {
    world.state.setEnemies([...world.state.enemies(), enemy as never]);
  };
  const makeBoss = (id: string) => {
    const placement = planBossPlacement(id, config.view.w, config);
    return world.entities.createEnemy(placement.factoryId, placement.x, placement.y, run());
  };
  const content = createLiveContentRuntime<ReturnType<typeof makeBoss>>({
    width: config.view.w,
    random: random.streams.stream("spawn"),
    run: () => {
      const active = run();
      return {
        mode: active.mode,
        wave: active.wave,
        ...(typeof (active as { curBoss?: unknown }).curBoss === "string"
          ? { curBoss: (active as { curBoss: string }).curBoss }
          : {}),
        ...((active as { variantDiscovery?: readonly string[] }).variantDiscovery === undefined
          ? {}
          : { variantDiscovery: (active as { variantDiscovery: readonly string[] }).variantDiscovery }),
      };
    },
    modes: () => config.modes,
    stages: STAGES,
    platforms: () => stage.platforms as never,
    groundY: () => config.world.groundY,
    construction: {
      sideSpawn: () => 0,
      createGround: (kind) => world.entities.createEnemy(kind, 0, 0, run()),
      createAir: (kind, x, y) => world.entities.createEnemy(kind, x, y, run()),
      createSupport: (kind) => world.entities.createEnemy(kind, 0, 0, run()),
      beginBossPresentation: (enemy) => {
        beginBossEncounter(run(), enemy, config.bossTheater.introDur, {
          platforms: () => stage.platforms as never[],
          setPlatforms: (value) => {
            stage.platforms = [...value] as unknown[];
          },
          arenaFor: (bossId) =>
            (createBossArena(
              bossId,
              config.view.w,
              config.view.h,
              config.world.groundY,
              config.bossArena.reformWarn,
            )?.map((platform) => ({ ...platform })) ?? null) as never,
        });
        world.state.setBossIntro({
          boss: enemy,
          t: 0,
          dur: config.bossTheater.introDur,
          delay: options.bossIntroDelay?.(enemy, config.bossTheater.introDur) ?? 0,
        });
        note("bossPresentation")();
      },
    },
    spawning: {
      random: random.streams.stream("spawn"),
      run: () => run(),
      campaignStage: () => stage.index,
      stageId: () => stageAt(stage.index).id,
      contentWave: () => 0,
      groundSpawn: () => ({ x: 0, y: 0 }),
      applyPreset: (enemy, preset) => {
        applyPreset(enemy, preset);
      },
      rollVariant: (kind, wave, context) =>
        context === undefined ? rollVariant(kind, wave, random.streams.stream("spawn")) : rollVariant(kind, context),
      applyVariant: (enemy, variant) => {
        applyVariant(enemy, variant);
      },
      rollAffixes: (enemy, wave) => {
        rollAffixes(enemy, wave, random.streams.stream("spawn"));
      },
      arrivalEffect: note("arrivalEffect"),
      recordSpawn: publishSpawn,
      install,
    },
    createBoss: (id) => makeBoss(id),
  });

  let reward: RewardRuntime<UpgradeDefinition> | null = null;
  let screen = "playing";
  let focus = -1;
  const waves = new LiveWaveController({
    run,
    tuning: () => config.run,
    stages: STAGES,
    presets: PRESETS,
    random: random.streams.stream("world"),
    modeDefinition: (mode) => config.modes.find((candidate) => candidate.id === mode) ?? {},
    currentStage: () => ({ index: stage.index, accent: stageAt(stage.index).accent }),
    stageHasChapter: () => true,
    chapterFlowActive: options.chapterFlowActive ?? (() => false),
    lifecycle: {
      hasPreparedWave: () => world.lifecycle.hasPreparedWave,
      isWaveActive: () => world.lifecycle.isWaveActive,
      pendingReward: () => world.lifecycle.reward,
    },
    executePlanIntents: (intents) => {
      recordIntents("plan", intents);
      dispatchWavePlanIntents(intents, {
        beginWipe: note("beginWipe"),
        loadStage: (index) => {
          stage.index = index;
          stage.platforms = stagePlatforms(index, config);
        },
        setStageBanner: note("setStageBanner"),
        beginCampaignChapter: options.beginCampaignChapter ?? (() => undefined),
        recordWave: publishWave,
        snapshotReplay: note("snapshotReplay"),
        prepareWave: (wave, boss, deferred) => {
          const weapon = WEAPONS.find((candidate) => candidate.id === run().weaponId);
          const blade = world.state.blade();
          if (blade) weapon?.onReset?.({ blade });
          world.lifecycle.prepareWave(wave, boss, deferred);
        },
        activateWave: () => {
          world.lifecycle.activateWave();
        },
        showWaveBanner: note("showWaveBanner"),
        playWaveSound: note("playWaveSound"),
      });
    },
    executeClearIntents: (intents) => {
      recordIntents("clear", intents);
      dispatchWaveClearIntents(intents, {
        clearWave: () => {
          world.lifecycle.clearWave();
        },
        bloom: note("bloom"),
        recordWave: publishWave,
        profileMax: note("profileMax"),
        profileAdd: note("profileAdd"),
        dailyBump: note("dailyBump"),
        hordeCleared: note("hordeCleared"),
        achievementCheck: note("achievementCheck"),
        stageDone: note("stageDone"),
        healPlayer: (amount) => {
          (world.state.player() as never as { heal(value: number): void }).heal(amount);
        },
        prepareReward: (kind) => {
          world.lifecycle.prepareReward(kind);
        },
        startAdventureFinale: options.startAdventureFinale ?? note("startAdventureFinale"),
        winRun: options.winRun ?? note("winRun"),
        releasePointer: note("releasePointer"),
        openTierUp: () => {
          if (reward === null) throw new Error("production reward runtime is not installed");
          reward.openTier(eligibleTierChoices(UPGRADES, run().mods.owned, run().mods.tier));
        },
        openDraft: () => {
          if (reward === null) throw new Error("production reward runtime is not installed");
          reward.openDraft();
        },
      });
    },
    spawn: (spec) => {
      content.spawn(spec);
    },
    enemyCount: () => world.state.enemies().length,
    loreBusy: options.chapterFlowActive ?? (() => false),
    achievementTracking: () => false,
    playerOneHit: () => (world.state.player() as never as { oneHit: boolean }).oneHit,
    availableTierUpCount: () => eligibleTierChoices(UPGRADES, run().mods.owned, run().mods.tier).length,
  });
  reward = createRewardRuntime<UpgradeDefinition>({
    run,
    roll: (request) =>
      rollUpgrades(request.count, run().mods, {
        random: random.streams.stream("draft"),
        forceSpecial: request.forceSpecial,
        excludeIds: request.excludeIds,
      }),
    transitionPorts: {
      applyUpgrade: (choice) => {
        applyUpgrade(choice, {
          config,
          player: world.state.player() as never,
          blade: world.state.blade() as never,
          mods: run().mods,
        });
      },
      tierUp: (choice) => {
        tierUp(choice.id, {
          config,
          player: world.state.player() as never,
          blade: world.state.blade() as never,
          mods: run().mods,
        });
      },
      ghostLoadout: (choiceId, tier, wave) => {
        options.gameplayEvents?.emit({ kind: "loadout", choiceId, tier, wave });
      },
      ghostEvent: (effect) => {
        const player = world.state.player() as never as { x: number; y: number };
        options.gameplayEvents?.emit({ kind: "effect", effect, x: player.x, y: player.y });
      },
      consumeInput: note("consumeInput"),
      resetUi: (intent) => {
        if (intent.focus) focus = -1;
        note("resetUi")();
      },
      setScreen: (next) => {
        screen = next;
      },
      startNextWave: () => {
        waves.startNextWave();
      },
      requestPointer: note("requestPointer"),
    },
  });
  const activeReward = reward;
  const routing = {
    screen: () => screen,
    setScreen: (next: "playing" | "paused") => {
      screen = next;
    },
    runMode: () => run().mode,
    reward: () => activeReward.snapshot(),
    chooseUpgrade: (index: number) => {
      activeReward.selectDraft(index);
    },
    chooseReserve: (index: number) => {
      activeReward.selectReserve(index);
    },
    chooseTier: (index: number) => {
      activeReward.selectTier(index);
    },
    dispatchPlayground: () => undefined,
    renderControls: () => undefined,
    controls: () => [],
    focus: () => focus,
  };
  const startNaturalOpening = () => {
    if (world.lifecycle.phase !== "idle") throw new Error("production wave runtime cannot restart an active lifecycle");
    run().wave = 0;
    world.lifecycle.start(`run-${run().runSeed.toString(36)}`);
    const session = world.lifecycle.snapshot();
    if (session.sessionId === null)
      throw new Error("production wave runtime started without an authoritative session identity");
    const active = run();
    options.gameplayEvents?.emit({
      kind: "run",
      transition: "started",
      runId: session.sessionId,
      mode: active.mode,
      difficulty: active.diff,
      weaponId: active.weaponId,
      wave: active.wave,
      score: active.score,
      runTimeSeconds: active.runTime,
    });
    if (active.mode === "tutorial" || active.mode === "playground") {
      active.wave = 1;
      world.lifecycle.activateTraining();
      replay.installTrainingHome();
      if (active.mode === "tutorial") replay.tutorial.start("unissued");
    } else waves.startNextWave();
  };
  return Object.freeze({
    waves,
    reward: activeReward,
    update: (seconds: number) => {
      if (run().mode !== "tutorial" && run().mode !== "playground") waves.update(seconds);
    },
    routeAction: (action: GameAction) => routeLiveTearBenchAction(routing, action),
    screen: () => screen,
    restoreScreen: (next: string) => {
      screen = next;
    },
    focus: () => focus,
    restoreUi: (next: string, nextFocus: number) => {
      if (!Number.isSafeInteger(nextFocus) || nextFocus < -1) throw new RangeError("production UI focus is invalid");
      screen = next;
      focus = nextFocus;
    },
    startNaturalOpening,
    spawnTutorial: (kind: EnemyKind, hpScale: number) => {
      content.spawn({ type: kind, hpScale });
      const enemy = world.state.enemies().at(-1);
      if (enemy === undefined) throw new Error("tutorial content spawn did not install its actor");
      return enemy;
    },
    get outward() {
      return Object.freeze([...outward]);
    },
  });
}

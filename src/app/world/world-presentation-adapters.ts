import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type {
  GameBlade,
  GameEnemy,
  GameFloater,
  GamePlayer,
  GameProjectile,
  GameRun,
  GameSlowZone,
  GameTemporaryWall,
} from "../shell/game-runtime-state";
import type { LiveTutorialRuntime } from "../../gameplay/training/live-tutorial-runtime";
import type { ArenaPlatform } from "../../gameplay/training/arena-rules";
import type { AchievementToastController } from "../interface/achievement-toast-controller";
import type { TouchOnboardingController } from "../training/touch-onboarding-controller";
import type { WorldRendererRegistry } from "../../presentation/world";
import type { WorldRect } from "../../presentation/world/contracts";
import { formatEnemyLabel } from "../../presentation/world/entity-layer";
import { renderWorldFrame, type WorldBounds, type WorldCamera } from "../../presentation/world/world-frame";
import type { SceneDrawInput } from "../../presentation/scenes/scene-library";
import { buildHudSnapshot } from "../../presentation/world/hud-snapshot";
import {
  buildBossIntroSnapshot,
  buildReticleSnapshot,
  buildStageBannerSnapshot,
  buildTouchControlsSnapshot,
  buildTutorialCardSnapshot,
  buildWaveBannerSnapshot,
} from "../../presentation/world/overlay-snapshots";
import {
  buildEnemyStatusSnapshot,
  buildEntityLayerSnapshot,
  buildFinaleWorldSnapshot,
  buildPantheonDebugSnapshot,
  buildSceneEffectsSnapshot,
  type VisualEnemySource,
} from "../../presentation/world/runtime-snapshots";
import { padPromptLabel } from "../../presentation/world/tutorial-input-prompts";
import { promptDevice, promptLabels } from "../../domain/prompt-vocabulary";
import { trainingExercise } from "../../gameplay/training/training-exercises";
import { createTrainingCoachPresentation } from "./training-coach-presentation";
import { isSheetScreen } from "../../domain/screen-catalog";
import type { EnvironmentSnapshot } from "../../gameplay/environment/environment-contracts";
import { renderEnvironmentLayer } from "./environment-layer";

type Dependencies = Pick<
  GameRuntimeDependencies,
  | "A11Y"
  | "ACH"
  | "Backdrop"
  | "Scenes"
  | "CLOCK"
  | "CONFIG"
  | "FX"
  | "GFX"
  | "Input"
  | "PAD"
  | "PROFILE"
  | "SAFE"
  | "STAGES"
  | "THEME"
  | "UI"
  | "UPGRADES"
  | "achievementToastPersistence"
  | "profileStatsPersistence"
  | "cosmeticRandom"
  | "drawBossTransformationWorld"
>;
type Stage = ReturnType<GameRuntimeDependencies["stageAt"]>;
type Platforms = ArenaPlatform[];
type Finale = Parameters<typeof buildFinaleWorldSnapshot>[0];
type SceneBoss = Parameters<typeof buildSceneEffectsSnapshot>[0]["enemies"][number];
type ScreenRectangle = Parameters<typeof buildBossIntroSnapshot>[0];
type BossPresentationActor = Parameters<GameRuntimeDependencies["drawBossTransformationWorld"]>[1];
type PresentationRun = GameRun & { readonly _arenaBroken?: Platforms | null };
type PresentationEnemy = VisualEnemySource & {
  readonly presentationId?: string;
  readonly facing?: number;
  readonly bossName?: string;
  readonly epithet?: string;
  readonly openingLine?: string;
};

export interface WorldPresentationState {
  readonly run: () => PresentationRun;
  readonly player: () => GamePlayer | undefined;
  readonly blade: () => GameBlade | undefined;
  readonly enemies: () => GameEnemy[];
  readonly projectiles: () => GameProjectile[];
  readonly floaters: () => GameFloater[];
  readonly slowZones: () => GameSlowZone[];
  readonly temporaryWalls: () => GameTemporaryWall[];
  readonly environment?: () => EnvironmentSnapshot;
  readonly screen: () => string;
  readonly zoom: () => number;
  readonly shake: () => number;
  readonly lastUiDelta: () => number;
  readonly bannerSeconds: () => number;
  readonly bossIntro: () => { boss: GameEnemy; t: number; dur: number; delay: number } | null;
  readonly hud: () => Readonly<{ lagHp: number; multiplier: number; multiplierPop: number }>;
  readonly hudClockSeconds: () => number;
  readonly advanceHud: (input: Readonly<{ hpFraction: number; multiplier: number; deltaSeconds: number }>) => void;
}

export interface WorldPresentationServices {
  readonly chase?: Readonly<{
    draw(canvas: CanvasRenderingContext2D): void;
    hud(canvas: CanvasRenderingContext2D, width: number): void;
  }>;
  readonly dependencies: Dependencies;
  readonly canvas: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly debug: boolean;
  readonly capturePolicy: () => Readonly<{
    readonly debug: "include" | "exclude";
    readonly actors: "include" | "exclude";
  }>;
  readonly screenRectangle: () => ScreenRectangle;
  readonly world: WorldRendererRegistry;
  readonly stage: { index: number; current: Stage; platforms: Platforms; bannerSeconds: number; name: string };
  readonly tutorial: LiveTutorialRuntime;
  readonly finale: () => Finale | null;
  readonly achievementToast: AchievementToastController;
  readonly touchOnboarding: TouchOnboardingController;
  readonly formatTime: (seconds: number) => string;
  readonly trickColor: (multiplier: number) => string;
  readonly ease: (amount: number) => number;
}

export interface LiveWorldPresentationAdapters {
  readonly advanceHudFrame: (deltaSeconds: number) => void;
  readonly completeHudFrame: (deltaSeconds: number) => void;
  readonly renderWorld: () => WorldCamera;
  readonly drawHud: () => void;
  /** `held`: a cinematic owns the screen; achievements wait (queued, unseen) until it ends. */
  readonly drawAchievementToast: (deltaSeconds: number, held?: boolean) => void;
  readonly drawTouchControls: () => void;
  readonly drawWaveBanner: () => void;
  readonly drawBossIntro: () => void;
  readonly drawStageBanner: () => void;
  readonly drawReticle: () => void;
}

export function createLiveWorldPresentationAdapters(
  state: WorldPresentationState,
  services: WorldPresentationServices,
): LiveWorldPresentationAdapters {
  const { dependencies: d, canvas, width, height, stage, world, tutorial } = services;
  const presentationEnemies = (): PresentationEnemy[] =>
    services.capturePolicy().actors === "exclude"
      ? []
      : state.enemies().flatMap((enemy) => (isDrawableEnemy(enemy) ? [projectPresentationEnemy(enemy)] : []));

  const drawEnemyStatus = (enemy: VisualEnemySource): void => {
    world.enemyStatus(
      buildEnemyStatusSnapshot(enemy, {
        bleedMaximum: d.CONFIG.status.bleedMax,
        bleedColor: d.CONFIG.colors.charger,
        burnColor: d.CONFIG.colors.slam,
        markColor: d.CONFIG.colors.eye,
      }),
    );
  };
  const drawPantheonDebug = (view: WorldBounds, painted: WorldBounds): void => {
    // Release builds never show it, so the snapshot (a copy of every platform,
    // projectile and enemy zone) is not built at all.
    if (!(services.debug && services.capturePolicy().debug === "include")) return;
    const run = state.run();
    world.pantheonDebug(
      buildPantheonDebugSnapshot({
        enabled: true,
        visible: view,
        painted,
        platforms: stage.platforms.map((platform) => ({ ...platform })),
        brokenPlatforms: (run._arenaBroken ?? []).map((platform) => ({ ...platform })),
        chunks: (run.voidScroll?.chunks ?? []).map((chunk) => ({
          ...(chunk.transferWindow === null ? {} : { transferWindow: chunk.transferWindow }),
          connections: chunk.connections.map((connection) => ({ from: connection.from, to: connection.to })),
        })),
        projectiles: state.projectiles().map((projectile) => ({
          x: projectile.x,
          y: projectile.y,
          r: projectile.r,
          ...(typeof projectile.family === "string" ? { family: projectile.family } : {}),
          ...(typeof projectile.counterplay === "string" ? { counterplay: projectile.counterplay } : {}),
          ...(typeof projectile.sweeperState === "string" ? { sweeperState: projectile.sweeperState } : {}),
        })),
        enemies: state.enemies().map((enemy) => ({ zones: projectBossZones(enemy) })),
        sourceUpperY: d.CONFIG.source.voidUpperMin,
        sourceLowerY: d.CONFIG.source.voidLowerMax,
        groundY: d.CONFIG.world.groundY,
        defaultZoneWidth: d.CONFIG.warden.zoneW,
      }),
    );
  };
  const drawFinaleWorld = (layer: "rear" | "front"): void => {
    if (services.capturePolicy().actors === "exclude") return;
    const finale = services.finale();
    if (!finale) return;
    const blade = state.blade();
    world.finaleWorld(
      layer,
      buildFinaleWorldSnapshot(finale, {
        fragmentCap: d.CONFIG.finale.fragmentCap,
        stageAccents: d.STAGES.map((entry) => entry.accent),
        groundY: d.CONFIG.world.groundY,
        perfectColor: d.CONFIG.colors.perfect,
        relicColors: [d.CONFIG.colors.boss, d.CONFIG.colors.armoredShield, d.CONFIG.colors.bomber, "#b06cff"],
        ...(blade ? { blade: { x: blade.x, y: blade.y } } : {}),
      }),
    );
  };
  const sceneEffects = (voidActive: boolean) =>
    buildSceneEffectsSnapshot({
      voidActive,
      enemies: services.capturePolicy().actors === "exclude" ? [] : state.enemies().map(projectSceneBoss),
      platforms: stage.platforms.map((platform) => ({
        x: platform.x,
        y: platform.y,
        w: platform.w,
        h: platform.h,
        ...(platform.arenaPlatId === undefined ? {} : { arenaPlatId: platform.arenaPlatId }),
        crackT: platform.crackT ?? 0,
        ...(platform.crackMax === undefined ? {} : { crackMax: platform.crackMax }),
        ...(typeof platform.crackColor === "string" ? { crackColor: platform.crackColor } : {}),
      })),
      walls: state
        .temporaryWalls()
        .map((wall) => ({ x: wall.x, y: wall.y, w: wall.w, life: wall.life, maxLife: wall.maxLife })),
      slowZones: state.slowZones(),
      width,
      height,
      groundY: d.CONFIG.world.groundY,
      timeMilliseconds: d.CLOCK.sim * 1000,
      lowGraphics: d.GFX.low,
      highContrast: d.A11Y.highContrast,
      darkTheme: d.THEME.dark,
      ink: d.THEME.ink,
      defaultZoneWidth: d.CONFIG.warden.zoneW,
      colors: d.CONFIG.colors,
      seamLife: d.CONFIG.aldric.seamLife,
      trailLife: d.CONFIG.warden.trailLife || 1,
    });
  const entityLayer = () => {
    const run = state.run();
    return buildEntityLayerSnapshot({
      enemies: presentationEnemies(),
      sandbox: run.mode === "sandbox",
      player: services.capturePolicy().actors === "exclude" ? undefined : state.player(),
      formatLabel: formatEnemyLabel,
      drawTransformation: (context, enemy) => {
        if (isBossPresentationActor(enemy)) d.drawBossTransformationWorld(context, enemy);
      },
      drawStatus: drawEnemyStatus,
    });
  };
  const drawEnvironment = (): void => {
    const snapshot = state.environment?.();
    if (snapshot === undefined) return;
    renderEnvironmentLayer(canvas, snapshot, state.enemies(), {
      highContrast: d.A11Y.highContrast,
      reducedMotion: d.A11Y.reducedMotion,
      lowGraphics: d.GFX.low,
      flashScale: d.A11Y.flashScale,
      timeSeconds: d.CLOCK.sim,
      audioEnabled: true,
    });
  };

  const sceneInput = (
    stageId: string,
    timeSeconds: number,
    playerWorldX: number,
    view: WorldBounds,
    camera: WorldCamera,
  ): SceneDrawInput => ({ stageId, camera, playerWorldX, worldWidth: width, view, timeSeconds });

  let lastCamera: WorldCamera | undefined;
  const renderWorld = (): WorldCamera => {
    lastCamera = renderWorldLayers();
    return lastCamera;
  };
  const renderWorldLayers = (): WorldCamera => {
    const run = state.run();
    const actorsIncluded = services.capturePolicy().actors === "include";
    const physicalPlayer = state.player();
    const player = actorsIncluded ? physicalPlayer : undefined;
    const blade = actorsIncluded ? state.blade() : undefined;
    const biome = ["campaign", "endless", "bossonly", "gauntlet", "tutorial", "playground"].includes(run.mode);
    const voidActive = !!run.voidScroll && (run.voidScroll.active || run.voidScroll.frozen);
    return renderWorldFrame({
      canvas,
      width,
      height,
      screen: services.screenRectangle(),
      zoom: state.zoom(),
      shake: state.shake(),
      playing: state.screen() === "playing",
      random: d.cosmeticRandom,
      biome,
      debug: services.debug && services.capturePolicy().debug === "include",
      timeSeconds: d.CLOCK.sim,
      reducedMotion: d.A11Y.reducedMotion,
      stage: stage.current,
      playerX: physicalPlayer?.x ?? width / 2,
      sceneEffects: sceneEffects(voidActive),
      enemies: entityLayer(),
      player: player ? { x: player.x, y: player.y, halfWidth: player.hw, halfHeight: player.hh } : undefined,
      entityOptions: {
        darkTheme: d.THEME.dark,
        sandbox: run.mode === "sandbox",
        buffColors: d.CONFIG.colors,
        font: (size, bold) => d.UI.font(size, bold),
      },
      floaterTextScale: d.UI.density.textScale,
      floaters: actorsIncluded
        ? state.floaters().map((item) => ({
            x: item.x,
            y: item.y,
            text: item.text,
            color: item.col || "#000",
            life: item.life,
            big: item.big,
          }))
        : [],
      brokenPlatforms: run._arenaBroken ?? [],
      platforms: stage.platforms,
      projectiles: actorsIncluded ? state.projectiles() : [],
      setEffectView: (bounds) => {
        d.FX.setViewRect(bounds);
      },
      drawBackdrop: (_value, time, playerX, bounds, camera) => {
        const stageId = stage.current.id;
        // The world is showing this stage: its painted background may load now,
        // and the stages a run has left give their decoded layers back.
        d.Scenes.show(stageId);
        if (!d.Scenes.opaque(stageId)) d.Backdrop.draw(canvas, stage.current, time, playerX, bounds);
        d.Scenes.drawBack(canvas, sceneInput(stageId, time, playerX, bounds, camera));
        d.Scenes.drawShadows(canvas, stageId, stage.platforms);
      },
      drawBackdropFront: (bounds, camera) => {
        d.Scenes.drawFront(
          canvas,
          sceneInput(stage.current.id, d.CLOCK.sim, state.player()?.x ?? width / 2, bounds, camera),
        );
      },
      drawPlatform: (platform, _value, floor, bounds) => {
        const texture = d.Scenes.surfaceMaterial(stage.current.id);
        d.Backdrop.platform(canvas, platform, stage.current, floor, bounds, texture);
      },
      drawFinale: drawFinaleWorld,
      tutorialActive: actorsIncluded && run.mode === "tutorial" && tutorial.active,
      drawTutorialGhost: () => {
        tutorial.drawGhost();
        if (actorsIncluded && state.screen() === "playing") services.chase?.draw(canvas);
      },
      drawPlayer: () => {
        player?.draw(canvas);
      },
      drawBlade: () => {
        if (blade && player) blade.draw(canvas, player);
      },
      drawEffects: () => {
        if (actorsIncluded) d.FX.draw(canvas);
      },
      drawEnvironment,
      drawDebug: drawPantheonDebug,
    });
  };

  /** On touch, top-right HUD cards and toasts rest below the on-screen pause control. */
  const touchClearTop = (): number | undefined => {
    if (!d.Input.touchActive()) return undefined;
    const pause = d.Input.touchLayout().pause;
    return pause.y + pause.r + d.UI.t.space.sm;
  };
  const coach = createTrainingCoachPresentation();
  /** The exercise on screen, read once per HUD frame for the strip and the coach. */
  const currentExercise = () => {
    if (!tutorial.active) return undefined;
    const view = tutorial.step();
    return {
      teaching: trainingExercise(tutorial.session(), { title: view.t, goal: view.d, final: view.final === true }),
      progress: view.prog(),
      completing: tutorial.doneT > 0,
    };
  };
  const drawTutorialCard = (exercise: NonNullable<ReturnType<typeof currentExercise>>): WorldRect => {
    const keys = promptLabels(exercise.teaching.controls, promptDevice(d.Input.mode), padPromptLabel(d.PAD));
    return world.tutorialCard(
      buildTutorialCardSnapshot(
        { ...exercise.teaching, bossPractice: exercise.teaching.kind === "boss" },
        keys,
        exercise.progress,
        tutorial.doneT,
        touchClearTop(),
      ),
    );
  };
  const drawTraining = (): void => {
    const run = state.run();
    const mode = run.mode === "tutorial" ? "tutorial" : run.mode === "playground" ? "playground" : "other";
    if (mode === "other") return;
    const exercise = mode === "tutorial" ? currentExercise() : undefined;
    const lessonCard = exercise ? drawTutorialCard(exercise) : undefined;
    const frame = coach.frame({
      mode,
      run,
      ...(run.pgArena === undefined ? {} : { arena: run.pgArena }),
      deltaSeconds: state.lastUiDelta(),
      reducedMotion: d.A11Y.reducedMotion,
      inputMode: d.Input.mode,
      padLabel: padPromptLabel(d.PAD),
      camera: lastCamera,
      player: state.player(),
      bladeReach: d.CONFIG.blade.aimRadius + d.CONFIG.blade.length,
      ...(exercise ? { exercise } : {}),
      lessonCard,
      touchLayout: d.Input.touchActive() ? d.Input.touchLayout() : undefined,
    });
    world.coachMarks(frame);
  };
  const drawHud = (): void => {
    const run = state.run();
    const enemies = state.enemies();
    const boss = enemies.find((enemy) => enemy.isBoss);
    const previous = state.hud();
    const intro = state.bossIntro();
    const player = state.player();
    if (!player) return;
    const result = buildHudSnapshot({
      player,
      run: { ...run, owned: run.mods.owned },
      ...(boss ? { boss } : {}),
      ...(intro ? { bossIntro: { boss: intro.boss, delay: intro.delay, elapsed: intro.t, duration: intro.dur } } : {}),
      upgrades: d.UPGRADES,
      enemyCount: enemies.length,
      previousLagHp: previous.lagHp,
      previousMultiplier: previous.multiplier,
      multiplierPop: previous.multiplierPop,
      nowMilliseconds: state.hudClockSeconds() * 1000,
      flashScale: d.A11Y.flashScale,
      deltaSeconds: state.lastUiDelta(),
      stageAccent: stage.current.accent,
      fallbackAccent: d.UI.t.color.accent,
      bossColor: d.CONFIG.colors.boss,
      dashCooldown: d.CONFIG.dash.cooldown,
      dashColor: d.CONFIG.colors.perfect,
      shieldColor: d.CONFIG.colors.armoredShield,
      trickDecay: d.CONFIG.trick.decay,
      formatTime: services.formatTime,
      trickColor: services.trickColor,
      ease: services.ease,
    });
    world.hud(result.snapshot);
    if (state.screen() === "playing") services.chase?.hud(canvas, width);
    drawTraining();
  };

  return Object.freeze({
    renderWorld,
    drawHud,
    advanceHudFrame(deltaSeconds: number): void {
      const player = state.player();
      if (!player) return;
      state.advanceHud({
        hpFraction: Math.max(0, Math.min(1, player.hp / player.maxHp)),
        multiplier: state.run().mult,
        deltaSeconds,
      });
    },
    completeHudFrame(deltaSeconds: number): void {
      // Boss flash stays on its existing actor codec owner; no duplicate HUD field.
      const boss = state.enemies().find((enemy) => enemy.isBoss);
      if (boss && boss._phaseFlashT > 0) boss._phaseFlashT = Math.max(0, boss._phaseFlashT - deltaSeconds);
    },
    drawAchievementToast(deltaSeconds: number, held = false): void {
      const snapshot = services.achievementToast.step(deltaSeconds, {
        held,
        pending: d.ACH.pending,
        rarities: d.ACH.RARITY,
        commonRarity: d.ACH.RARITY.common,
        categories: d.ACH.CATS,
        markSeen: d.achievementToastPersistence.markSeen,
        save: d.achievementToastPersistence.save,
        shardsFor: (achievement) => {
          const source = d.ACH.byId(achievement.id);
          return source ? d.ACH.shardsFor(source) : 0;
        },
        coinsFor: (achievement) => {
          const source = d.ACH.byId(achievement.id);
          return source ? d.ACH.coinsFor(source) : 0;
        },
      });
      if (snapshot) {
        const screen = state.screen();
        const placement = screen === "playing" ? "hud" : isSheetScreen(screen) ? "sheet-footer" : "corner";
        const clearTop = touchClearTop();
        world.achievementToast({ ...snapshot, placement, ...(clearTop === undefined ? {} : { clearTop }) });
      }
    },
    drawTouchControls(): void {
      const onboarding = services.touchOnboarding.step(state.lastUiDelta(), !!d.PROFILE.stat("touchOnboarded"));
      if (onboarding.completed) d.profileStatsPersistence.add("touchOnboarded", 1);
      world.touchControls(
        buildTouchControlsSnapshot({
          layout: d.Input.touchLayout(),
          joystick: d.Input.joy,
          held: Object.fromEntries(
            Object.entries(d.Input.btnHeld).filter((entry): entry is [string, boolean] => entry[1] !== undefined),
          ),
          ...(d.Input.touchAim && d.Input.stickAim ? { aim: d.Input.stickAim } : {}),
          onboardingAlpha: onboarding.alpha,
        }),
      );
    },
    drawWaveBanner(): void {
      const run = state.run();
      world.waveBanner(
        buildWaveBannerSnapshot({
          remainingSeconds: state.bannerSeconds(),
          duration: d.CONFIG.juice.bannerTime,
          bossWave: !!run.isBossWave,
          wave: run.wave,
          waveTag: run.waveTag,
          horde: !!run.horde,
          hordeColor: d.CONFIG.colors.charger,
          normalColor: d.CONFIG.colors.perfect,
        }),
      );
    },
    drawBossIntro(): void {
      const intro = state.bossIntro();
      if (intro && isDrawableEnemy(intro.boss)) {
        world.bossIntro(
          buildBossIntroSnapshot(
            services.screenRectangle(),
            projectPresentationEnemy(intro.boss),
            intro.t,
            intro.dur,
            d.CONFIG.colors.boss,
          ),
        );
      }
    },
    drawStageBanner(): void {
      const run = state.run();
      world.stageBanner(
        buildStageBannerSnapshot({
          elapsed: stage.bannerSeconds,
          mode: run.mode,
          stageIndex: stage.index,
          stageName: stage.name || stage.current.name,
          blurb: stage.current.blurb || "",
          accent: stage.current.accent || d.THEME.ink,
        }),
      );
    },
    drawReticle(): void {
      const blade = state.blade();
      if (!blade) return;
      const player = state.player();
      const config = d.CONFIG.blade;
      world.reticle(
        buildReticleSnapshot({
          blade,
          airborne: !!player && !player.onGround,
          playerVerticalSpeed: player?.vy ?? 0,
          slamMinDownSpeed: config.slamMinDownSpeed,
          slamPowerSpeed: config.slamPowerSpeed,
          slamEmpowerAt: config.slamEmpowerAt,
          launchMinUpSpeed: config.launchMinUpSpeed,
          risingSpeedReference: config.risingSpeedRef,
          slamColor: d.CONFIG.colors.slam,
          updraftColor: d.CONFIG.colors.perfect,
        }),
      );
    },
  });
}

function isBossPresentationActor(enemy: VisualEnemySource): enemy is VisualEnemySource & BossPresentationActor {
  return (
    "facing" in enemy &&
    typeof enemy.facing === "number" &&
    "bossName" in enemy &&
    typeof enemy.bossName === "string" &&
    "presentationId" in enemy &&
    typeof enemy.presentationId === "string"
  );
}

type DrawableEnemy = GameEnemy & {
  draw(canvas: CanvasRenderingContext2D, player: unknown): void;
  drawRear?: (canvas: CanvasRenderingContext2D) => void;
};

export function isDrawableEnemy(enemy: GameEnemy): enemy is DrawableEnemy {
  return "draw" in enemy && typeof enemy.draw === "function";
}

export function projectPresentationEnemy(enemy: DrawableEnemy): PresentationEnemy {
  return {
    x: enemy.x,
    y: enemy.y,
    hw: enemy.hw,
    hh: enemy.hh,
    radius: enemy.radius,
    color: enemy.color,
    spawnT: enemy.spawnT,
    flash: enemy.flash,
    dead: enemy.dead,
    buffs: enemy.buffs,
    kind: enemy.kind,
    enraged: enemy.enraged,
    variantName: enemy.variantName,
    affixes: enemy.affixes,
    bleedStacks: enemy.bleedStacks,
    burnT: enemy.burnT,
    markT: enemy.markT,
    bossName: enemy.bossName,
    epithet: enemy.epithet,
    openingLine: enemy.openingLine,
    presentationId: enemy.presentationId,
    facing: enemy.facing,
    cinematicPose: !!enemy.cinematicPose,
    draw: (canvas, player) => {
      enemy.draw(canvas, player);
    },
    ...(enemy.drawRear === undefined
      ? {}
      : {
          drawRear: (canvas: CanvasRenderingContext2D) => {
            enemy.drawRear?.(canvas);
          },
        }),
  };
}

type BossZone = Readonly<{
  x: number;
  w?: number;
  kind?: string;
  on?: boolean;
  arming?: boolean;
  warn?: boolean;
  warnK?: number;
  life?: number;
  maxLife?: number;
  dir?: number;
  nextOn?: boolean;
}>;

function projectBossZones(enemy: GameEnemy): readonly BossZone[] {
  const source = zonesOf(enemy);
  if (!Array.isArray(source)) return [];
  const zones: readonly unknown[] = source;
  return zones.flatMap((zone): readonly BossZone[] => {
    if (typeof zone !== "object" || zone === null || !("x" in zone) || typeof zone.x !== "number") return [];
    return [
      {
        x: zone.x,
        ...("w" in zone && typeof zone.w === "number" ? { w: zone.w } : {}),
        ...("kind" in zone && typeof zone.kind === "string" ? { kind: zone.kind } : {}),
        ...("on" in zone && typeof zone.on === "boolean" ? { on: zone.on } : {}),
        ...("arming" in zone && typeof zone.arming === "boolean" ? { arming: zone.arming } : {}),
        ...("warn" in zone && typeof zone.warn === "boolean" ? { warn: zone.warn } : {}),
        ...("warnK" in zone && typeof zone.warnK === "number" ? { warnK: zone.warnK } : {}),
        ...("life" in zone && typeof zone.life === "number" ? { life: zone.life } : {}),
        ...("maxLife" in zone && typeof zone.maxLife === "number" ? { maxLife: zone.maxLife } : {}),
        ...("dir" in zone && typeof zone.dir === "number" ? { dir: zone.dir } : {}),
        ...("nextOn" in zone && typeof zone.nextOn === "boolean" ? { nextOn: zone.nextOn } : {}),
      },
    ];
  });
}

function zonesOf(value: object): unknown {
  return "zones" in value ? value.zones : undefined;
}

function zoneColorOf(value: object): string | undefined {
  return "zoneColor" in value && typeof value.zoneColor === "string" ? value.zoneColor : undefined;
}

export function projectSceneBoss(enemy: GameEnemy): SceneBoss {
  const zoneColor = zoneColorOf(enemy);
  return {
    bossId: enemy.bossId,
    color: enemy.color,
    ...(enemy.isBoss === undefined ? {} : { isBoss: enemy.isBoss }),
    ...(enemy.isMiniBoss === undefined ? {} : { isMiniBoss: enemy.isMiniBoss }),
    ...(zoneColor === undefined ? {} : { zoneColor }),
    zones: projectBossZones(enemy),
  };
}

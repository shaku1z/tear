import { NO_POINTER } from "../../domain/pointer-ownership";
import { blendHex as blendCol, easeOut as ez } from "../../presentation/world/primitives";
import type { LiveCampaignTrainingAssembly } from "../campaign/live-campaign-training-assembly";
import type { LiveCanonicalCombatHost } from "../combat/live-canonical-state";
import type { GhostPracticeLaunchResult } from "../replay/ghost-practice-launch";
import type { GhostPracticeChild } from "../../ghost/replay-world";
import type { LiveGhostChaseRuntime } from "../replay/live-ghost-chase";
import type { LiveGhostRecording } from "../replay/live-ghost-recording";
import type { RunResultInfo } from "../../gameplay/run/outcome-planner";
import type { LiveReviveCountdownState } from "../run/revive-countdown-state";
import type { LiveRunOrchestration } from "../run/run-orchestration-composition";
import { createLiveShopFeedbackState } from "../run/shop-feedback-state";
import type { LiveBrowserRuntime } from "../shell/browser-runtime";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameBlade, GamePlayer, GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { LiveSessionServices } from "../shell/session-services-composition";
import type { LiveWorldComposition } from "../world/world-composition";
import type { LiveWorldSessionState } from "../world/world-session-state";
import type { LiveHudFeedbackState } from "./hud-feedback-state";
import { createLiveInterfaceComposition } from "./interface-composition";
import type { LiveInterfaceFrameState } from "./interface-frame-state";
import type { LiveInterfaceInteractionState } from "./interface-interaction-state";
import { createLiveScreenActions, type LiveGhostLibraryScreens } from "./live-screen-actions";
import type { LiveScreenNavigation } from "./live-screen-navigation";
import { renderRegisteredScreen } from "./screen-registry";
import { isMenuScreen } from "../../domain/screen-catalog";
import { PRACTICE_TABS } from "../../gameplay/training/practice-tabs";

/** The Drills tabs in the shape the shared tab stepper reads (Q/E, bumpers). */
const PRACTICE_TAB_STEPS = Object.freeze(PRACTICE_TABS.map(({ id }) => [id] as const));

export interface LiveInterfaceAssemblyOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly browser: LiveBrowserRuntime;
  readonly world: LiveWorldComposition;
  readonly session: LiveWorldSessionState;
  readonly services: LiveSessionServices;
  readonly campaignTraining: LiveCampaignTrainingAssembly;
  readonly orchestration: Pick<LiveRunOrchestration, "bossById">;
  readonly combat: Pick<LiveCanonicalCombatHost, "simulation">;
  readonly navigation: LiveScreenNavigation;
  readonly frame: LiveInterfaceFrameState;
  readonly interaction: LiveInterfaceInteractionState;
  readonly reviveCountdown: LiveReviveCountdownState;
  readonly hudFeedback: LiveHudFeedbackState;
  readonly chase: LiveGhostChaseRuntime;
  readonly career: LiveGhostRecording["career"];
  readonly ghostLibrary: LiveGhostLibraryScreens;
  readonly launchGhostPractice: (child: GhostPracticeChild) => GhostPracticeLaunchResult;
  readonly abandonRun: (reason: string) => void;
  readonly persistentEffects: () => boolean;
  readonly currentOutcome: () => RunResultInfo;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
}

/**
 * Builds the live interface composition (wipe, world surface, screens, frame
 * and world presentation) over the runtime owners, then installs the screen
 * transition hooks that depend on it.
 */
export function assembleLiveInterface(options: LiveInterfaceAssemblyOptions) {
  const {
    dependencies,
    browser,
    world,
    session,
    services,
    campaignTraining,
    navigation,
    chase,
    run: liveRun,
    player: livePlayer,
  } = options;
  const {
    A11Y,
    Attract,
    Backdrop,
    Scenes,
    GFX,
    Input,
    OVERSCAN,
    PAD,
    SAFE,
    SFX,
    THEME,
    UI,
    browserDocument,
    browserIndexedDb,
    browserWindow,
    clamp,
    cosmeticRandom,
  } = dependencies;
  const {
    canvas,
    context: ctx,
    width: W,
    height: H,
    viewport,
    resizeCanvas,
    installPrompt,
    lockHint,
    hint: hintEl,
    fullscreenButton,
    fullscreenAvailable,
    pantheonDebug: PANTHEON_DEBUG,
  } = browser;
  const { state: hostState, environment } = world;
  const { impact, feel } = world.context.transient;
  const CINEMA = world.context.cinema;
  const { screen, setScreen } = navigation;
  const interfaceFrame = options.frame;
  const interfaceInteraction = options.interaction;
  const { reviveCountdown, hudFeedback } = options;
  const { settingsController, settings, reward: rewardRuntime } = services;
  const { awardCoins } = services.economy;
  const { read: getBest, record: saveBest } = services.bestScores.api;
  const { stage: stageRuntime, story } = campaignTraining.campaign;
  const TUT = campaignTraining.training.tutorial;
  const { renderMenu: renderPgMenu, renderLab: renderPgLab } = campaignTraining.training.presentation;
  const { addFloater } = campaignTraining;
  const { addShake, addFlash } = campaignTraining.weapon;
  const { color: trickColor, formatTime: fmtTime, check: achCheck } = campaignTraining.style;
  const { vault: ghostVault } = options.ghostLibrary;
  const { simulation } = options.combat;
  const requestLock = browser.requestPointerLock;
  const screenRect = () => presentationHost.screenRectangle();
  const biomeMode = () =>
    ["campaign", "endless", "bossonly", "gauntlet", "tutorial", "playground"].includes(liveRun().mode);
  const shopFeedback = createLiveShopFeedbackState();
  const actions = createLiveScreenActions({
    dependencies,
    session,
    services,
    campaignTraining,
    navigation,
    interaction: interfaceInteraction,
    chase,
    ghostLibrary: options.ghostLibrary,
    run: liveRun,
    requestPointerLock: requestLock,
  });
  const interfaceComposition = createLiveInterfaceComposition(
    {
      wipe: {
        canvas,
        context: ctx,
        createCanvas: () => browserDocument.createElement("canvas"),
        reducedEffects: () => GFX.low,
        flashScale: () => A11Y.flashScale,
        random: cosmeticRandom,
        ease: ez,
      },
      worldSurface: {
        canvas: ctx,
        ui: UI,
        width: W,
        height: H,
        get cssPerLogicalPixel() {
          return viewport.cssPerLogicalPixel;
        },
        get safe() {
          return { top: SAFE.t, right: SAFE.r, bottom: SAFE.b, left: SAFE.l };
        },
        get ink() {
          return THEME.ink;
        },
        get darkTheme() {
          return THEME.dark;
        },
        get timeSeconds() {
          return world.context.services.clock.seconds();
        },
        get lowGraphics() {
          return GFX.low;
        },
        get reducedMotion() {
          return A11Y.reducedMotion;
        },
        get highContrast() {
          return A11Y.highContrast;
        },
      },
      screens: {
        surfaces: dependencies.surfaces,
        renderer: {
          canvas: ctx,
          ui: UI,
          width: W,
          height: H,
          screenRectangle: screenRect,
          safeInsets: () => SAFE,
          time: interfaceFrame.seconds,
          enterAmount: interfaceFrame.enterAmount,
          enterSeconds: interfaceFrame.enterSeconds,
          deltaSeconds: interfaceFrame.deltaSeconds,
          mouse: () => Input.pointer() ?? NO_POINTER,
          scroll: interfaceInteraction.scroll,
          focus: interfaceInteraction.focus,
          touch: () => Input.touchActive(),
          reducedMotion: () => A11Y.reducedMotion,
          pixelScale: () => viewport.pixelScale,
          enqueue: interfaceInteraction.enqueue,
        },
        replay: {
          dependencies,
          canvas: ctx,
          width: W,
          height: H,
          screenRectangle: screenRect,
          time: interfaceFrame.seconds,
          deltaSeconds: interfaceFrame.deltaSeconds,
          fallbackPlayer: livePlayer,
          bossById: options.orchestration.bossById,
          setScreen: (next, context) => setScreen(next, context),
          formatTime: fmtTime,
          document: browserDocument,
          browserIndexedDb,
          launchGhostPractice: options.launchGhostPractice,
        },
        library: {
          chase,
          dependencies,
          canvas: ctx,
          height: H,
          time: interfaceFrame.seconds,
          enterSeconds: interfaceFrame.enterSeconds,
          scroll: interfaceInteraction.scroll,
          setScroll: interfaceInteraction.setScroll,
          clamp,
          ease: ez,
          formatTime: fmtTime,
          getBest,
          ghostVault,
          career: options.career.port,
        },
        settings: {
          dependencies,
          document: browserDocument,
          window: browserWindow,
          canvas,
          width: W,
          overscan: () => OVERSCAN,
          screen,
          setScreen: (next, context) => setScreen(next, context),
          settingsController,
          settings,
          scroll: interfaceInteraction.scroll,
          setScroll: interfaceInteraction.setScroll,
          clamp,
          installPrompt,
        },
        actions,
        runState: {
          screen,
          setScreen: (next) => {
            setScreen(next);
          },
          run: liveRun,
          player: livePlayer,
          scroll: interfaceInteraction.scroll,
          setScroll: interfaceInteraction.setScroll,
          continueSeconds: reviveCountdown.seconds,
          setContinueSeconds: reviveCountdown.setSeconds,
          replayAvailable: () => session.lastRecording() !== null,
          outcome: options.currentOutcome,
        },
        runServices: {
          ghostChase: chase.snapshot,
          dependencies,
          reward: rewardRuntime,
          formatTime: fmtTime,
          clamp,
          trickColor,
          saveBest,
          awardCoins,
          cinema: CINEMA,
          clearFinale: () => {
            story.finale = null;
          },
          terminateRun: (reason) => {
            options.abandonRun(reason);
          },
          addFloater,
          addShake,
          addFlash,
          requestPointer: requestLock,
          persistentEffects: options.persistentEffects,
          tutorialSession: () =>
            (liveRun().mode === "tutorial" ||
              (liveRun().mode === "playground" && TUT.session().phase === "free-practice")) &&
            TUT.session().phase !== "inactive"
              ? TUT.session()
              : undefined,
          stepPracticeTab: (practice) => {
            presentationHost.stepTab(PRACTICE_TAB_STEPS, practice.practiceTab ?? "lessons", (tab) => {
              TUT.showPracticeTab(tab);
            });
          },
        },
        menuState: {
          selection: () => session.selection(),
          scroll: interfaceInteraction.scroll,
          setScroll: interfaceInteraction.setScroll,
          time: interfaceFrame.seconds,
          shop: () => shopFeedback.snapshot(),
          setShop: (value) => {
            shopFeedback.set(value);
          },
        },
        menuServices: { dependencies, height: H, getBest, formatTime: fmtTime, clamp, checkAchievements: achCheck },
        playground: { renderMenu: renderPgMenu, renderLab: renderPgLab },
      },
      frameState: {
        screen,
        previousScreen: interfaceFrame.previousScreen,
        setPreviousScreen: interfaceFrame.setPreviousScreen,
        deltaSeconds: interfaceFrame.deltaSeconds,
        enterSeconds: interfaceFrame.enterSeconds,
        setEnterSeconds: interfaceFrame.setEnterSeconds,
        enterAmount: interfaceFrame.enterAmount,
        setEnterAmount: interfaceFrame.setEnterAmount,
        scroll: interfaceInteraction.scroll,
        setScroll: interfaceInteraction.setScroll,
        arrival: navigation.arrival,
        focus: interfaceInteraction.focus,
        setFocus: interfaceInteraction.setFocus,
        controls: interfaceInteraction.buttons,
        resetControls: interfaceInteraction.resetButtons,
        biomeMode,
        enemies: () => hostState.enemies(),
        flash: () => feel.flash,
        bossBeat: () => hostState.bossBeat(),
        bossIntroActive: () => {
          const intro = hostState.bossIntro();
          return intro !== null && intro.delay <= 0;
        },
        bannerSeconds: () => feel.bannerSeconds,
        rankPopup: () => ({ seconds: feel.rankPopupSeconds, text: feel.rankPopupText, multiplier: liveRun().mult }),
        timeSeconds: interfaceFrame.seconds,
      },
      frameServices: {
        canvas,
        context: ctx,
        width: W,
        height: H,
        overscan: () => OVERSCAN,
        safeTop: () => SAFE.t,
        resizeIfNeeded: resizeCanvas,
        input: Input,
        ui: UI,
        stage: stageRuntime,
        cinema: CINEMA,
        reducedMotion: () => A11Y.reducedMotion,
        flashScale: () => A11Y.flashScale,
        touchActive: () => Input.touchActive(),
        controller: () => ({ active: PAD.active, toastSeconds: PAD.toastT, toastText: PAD.toastText }),
        confirmGlyph: () => PAD.glyph(0),
        pointerLocked: () => Input.locked,
        lockHint,
        inputHint: hintEl,
        fullscreenButton,
        fullscreenAvailable,
        controlHintContext: () => ({
          runSeconds: screen() === "playing" ? liveRun().runTime : 0,
          completedRuns: dependencies.PROFILE.stat("runs"),
        }),
        clamp,
        ease: ez,
        blendColor: blendCol,
        setTheme: (background, playLike) => {
          THEME.set(playLike && biomeMode() ? background : "#ffffff");
          UI.ink = THEME.ink;
          // On the main menu no run is showing a stage: painted backgrounds give their memory back.
          if (screen() === "menu") Scenes.leave();
        },
        themeInk: () => THEME.ink,
        backdropPost: (context, stage, camera) => {
          Backdrop.post(context, stage, camera);
        },
        stageBackground: (stage) => Scenes.paper(stage.id) ?? stage.bg,
        drawMenuAttract: () => {
          Attract.draw(ctx);
        },
        renderScreen: (next) => {
          renderRegisteredScreen(next, interfaceComposition.screens.renderers);
        },
        isMenuScreen,
        playInterfaceSound: () => {
          SFX.ui();
        },
        hoverAnimation: interfaceInteraction.hoverAnimations(),
        trickColor,
      },
      worldState: {
        run: liveRun,
        player: livePlayer,
        blade: options.blade,
        enemies: () => hostState.enemies(),
        projectiles: () => hostState.projectiles(),
        floaters: () => hostState.floaters(),
        slowZones: () => hostState.slowZones(),
        temporaryWalls: () => hostState.temporaryWalls(),
        environment: () => environment.snapshot(),
        screen,
        zoom: () => feel.zoom,
        shake: () => impact.shake,
        lastUiDelta: interfaceFrame.deltaSeconds,
        bannerSeconds: () => feel.bannerSeconds,
        bossIntro: () => hostState.bossIntro(),
        hud: hudFeedback.snapshot,
        hudClockSeconds: hudFeedback.clockSeconds,
        advanceHud: hudFeedback.advance,
      },
      worldServices: {
        chase,
        dependencies,
        canvas: ctx,
        width: W,
        height: H,
        debug: PANTHEON_DEBUG,
        stage: stageRuntime,
        tutorial: TUT,
        finale: () => story.finale,
        formatTime: fmtTime,
        trickColor,
        ease: ez,
      },
      onBiomeTransition: (begin) => {
        Attract.onBiomeChange = begin;
      },
    },
    { simulationTick: () => simulation.tick, browserWindow, gfx: () => settings.gfx, debugAvailable: PANTHEON_DEBUG },
  );
  const { frame: presentationHost, screens: screenComposition } = interfaceComposition;
  const { library: libraryAdapters, replay: replayAdapters } = screenComposition;
  const leaveCareer = () => {
    libraryAdapters.careerAction("suspend");
  };
  navigation.bind({ cancelPendingReplayOpen: replayAdapters.cancelPendingOpen, leaveCareer });
  browserWindow.addEventListener("pagehide", leaveCareer);
  return interfaceComposition;
}

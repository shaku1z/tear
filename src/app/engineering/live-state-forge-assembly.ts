import { FinaleController } from "../../gameplay/campaign/finale-controller";
import type { LiveCampaignTraining } from "../campaign/campaign-training-composition";
import type { LiveCanonicalCombatHost } from "../combat/live-canonical-state";
import type { LiveHudFeedbackState } from "../interface/hud-feedback-state";
import type { LiveInterfaceInteractionState } from "../interface/interface-interaction-state";
import type { LiveScreenNavigation } from "../interface/live-screen-navigation";
import { isAppScreen } from "../../domain/screen-catalog";
import type { LiveGhostPracticeSessionState } from "../replay/ghost-practice-session-state";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { LiveSessionServices } from "../shell/session-services-composition";
import type { LiveAuthoritativeInputAdapter } from "../../gameplay/runtime/authoritative-input-adapter";
import { createLiveParticlePresentationState } from "../../tearbench/particle-presentation-state";
import type { LiveWorldComposition } from "../world/world-composition";
import { createLiveStateForgeAdapter } from "./state-forge-adapter";
import { createLiveStateForgeRuntimeBridge } from "./state-forge-runtime-bridge";

export interface LiveStateForgeAssemblyOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly world: LiveWorldComposition;
  readonly campaignTraining: Pick<LiveCampaignTraining, "campaign" | "training" | "cinematic">;
  readonly combat: Pick<LiveCanonicalCombatHost, "combatEntityRuntime" | "simulation" | "simulationRuntime">;
  readonly input: Pick<LiveAuthoritativeInputAdapter, "clear">;
  readonly navigation: Pick<LiveScreenNavigation, "screen" | "setScreen">;
  readonly interaction: Pick<LiveInterfaceInteractionState, "focus" | "setFocus">;
  readonly ghostPractice: Pick<LiveGhostPracticeSessionState, "active">;
  readonly reward: Pick<LiveSessionServices["reward"], "snapshot" | "restore">;
  readonly hudFeedback: LiveHudFeedbackState;
  readonly run: () => GameRun;
}

/** The live State Forge adapter: world capture, staging and restore over the live runtime owners. */
export function assembleLiveStateForge(options: LiveStateForgeAssemblyOptions) {
  const { dependencies, world, navigation, interaction, run: liveRun } = options;
  const { A11Y, CONFIG, FX, GFX, GHOST } = dependencies;
  const { state: hostState, entities: worldEntities, lifecycle: RUN_LIFECYCLE, environment } = world;
  const { transient } = world.context;
  const { impact, feel, opening: openingCarry } = transient;
  const CINEMA = world.context.cinema;
  const { stage: stageRuntime, story, runtime: campaignRuntime } = options.campaignTraining.campaign;
  const TUT = options.campaignTraining.training.tutorial;
  const { combatEntityRuntime: combatRuntime, simulation, simulationRuntime } = options.combat;
  const stateForgeRuntime = createLiveStateForgeRuntimeBridge({
    tutorial: TUT,
    practiceCinema: options.campaignTraining.cinematic.runtime,
    practiceWorld: () => ({ run: liveRun(), actors: hostState.enemies(), platforms: stageRuntime.platforms }),
    captureBossIntro: () => hostState.bossIntro(),
    restoreBossIntro: (intro) => {
      hostState.setBossIntro(intro);
    },
    captureTransient: () => ({
      hitStop: impact.hitStop,
      shake: impact.shake,
      timeScale: feel.timeScale,
      slowmo: impact.slowMotion,
      zoom: feel.zoom,
      flash: feel.flash,
      bannerT: feel.bannerSeconds,
      dashGhostT: openingCarry.dashGhostTime,
      landingV: openingCarry.landingVelocity,
      wasDashing: openingCarry.wasDashing,
      wasSwinging: openingCarry.wasSwinging,
      wasOnGround: openingCarry.wasOnGround,
      worldZoom: feel.worldZoom,
      worldZoomTarget: feel.worldZoomTarget,
      throwCd: openingCarry.throwCooldown,
      rankPopT: feel.rankPopupSeconds,
      rankPopText: feel.rankPopupText,
    }),
    restoreTransient: (snapshot) => {
      transient.assignImpact({
        hitStop: Number(snapshot.hitStop),
        slowMotion: Number(snapshot.slowmo),
        shake: Number(snapshot.shake),
      });
      transient.assignOpening({
        throwCooldown: Number(snapshot.throwCd),
        dashGhostTime: Number(snapshot.dashGhostT),
        landingVelocity: Number(snapshot.landingV),
        wasDashing: Boolean(snapshot.wasDashing),
        wasSwinging: Boolean(snapshot.wasSwinging),
        wasOnGround: Boolean(snapshot.wasOnGround),
      });
      feel.timeScale = Number(snapshot.timeScale);
      feel.zoom = Number(snapshot.zoom);
      feel.flash = Number(snapshot.flash);
      feel.bannerSeconds = Number(snapshot.bannerT);
      feel.worldZoom = Number(snapshot.worldZoom);
      feel.worldZoomTarget = Number(snapshot.worldZoomTarget);
      feel.rankPopupSeconds = Number(snapshot.rankPopT);
      feel.rankPopupText = String(snapshot.rankPopText);
    },
    captureLifecycle: RUN_LIFECYCLE.snapshot.bind(RUN_LIFECYCLE),
    restoreLifecycle: RUN_LIFECYCLE.restore.bind(RUN_LIFECYCLE),
    finale: {
      capture: campaignRuntime.captureFinaleBinding,
      clear: campaignRuntime.clearFinaleBinding,
      stage: (value, config) =>
        campaignRuntime.stageFinaleBinding(value, new FinaleController(config ?? CONFIG.finale)),
    },
    captureChapterBinding: story.captureChapterBinding.bind(story),
    stageChapterBinding: campaignRuntime.stageChapterBinding,
    installChapterBinding: campaignRuntime.installChapterBinding,
    captureCinemaProtection: story.protection.bind(story),
    restoreCinemaProtection: story.applyProtection.bind(story),
    captureStageBanner: () => ({ name: stageRuntime.name, seconds: stageRuntime.bannerSeconds }),
    restoreStageBanner: stageRuntime.restoreBanner.bind(stageRuntime),
    cinema: CINEMA,
    clearEnvironmentRestore: () => {
      environment.clear("restore");
    },
  });
  return createLiveStateForgeAdapter({
    dependencies,
    entities: worldEntities,
    worldServices: world.context.services,
    state: hostState,
    actorId: (entity, prefix) => combatRuntime.id(entity, prefix),
    bindActorId: (entity, id) => {
      combatRuntime.bindId(entity, id);
    },
    platforms: () => stageRuntime.platforms,
    stageIndex: () => stageRuntime.index,
    restoreStageIndex: (index) => {
      stageRuntime.restoreIndex(index);
    },
    replacePlatforms: (values) => {
      stageRuntime.platforms.splice(0, stageRuntime.platforms.length, ...values);
    },
    slowZones: () => hostState.slowZones(),
    walls: () => hostState.temporaryWalls(),
    environment: () => environment,
    clearEnvironmentRestore: () => {
      environment.clear("restore");
    },
    restoreEnvironment: (snapshot) => {
      environment.setStage(snapshot.stageId, "restore");
      environment.replace(snapshot);
    },
    screen: () => navigation.screen(),
    setScreen: (screen) => {
      if (!isAppScreen(screen)) throw new RangeError(`invalid restored screen: ${screen}`);
      if (screen === "playing" && options.ghostPractice.active() !== null) return;
      navigation.setScreen(screen);
    },
    focus: interaction.focus,
    setFocus: interaction.setFocus,
    tick: () => simulation.tick,
    setTick: (tick) => {
      simulationRuntime.reset(tick);
    },
    clearInputProjection: () => {
      options.input.clear();
    },
    reward: options.reward.snapshot,
    restoreReward: options.reward.restore,
    captureGhost: () => GHOST.captureRuntimeState(),
    restoreGhost: (snapshot) => {
      GHOST.restoreRuntimeState(snapshot);
    },
    captureIdentityState: () => combatRuntime.captureIdentityState(),
    restoreIdentityState: (snapshot) => {
      combatRuntime.restoreIdentityState(snapshot);
    },
    runtimeState: stateForgeRuntime.capture,
    restoreRuntimeState: stateForgeRuntime.restore,
    hudPresentation: options.hudFeedback,
    tutorialPresentation: {
      capture: () => TUT.capturePresentation(),
      restore: (value) => {
        TUT.restorePresentation(value);
      },
    },
    particlesPresentation: createLiveParticlePresentationState(
      FX,
      () => ({ effects: CONFIG.effects, lowGraphics: GFX.low, reducedMotion: A11Y.reducedMotion }),
      dependencies.cosmeticEmissionRandom,
    ),
    captureCinema: () => CINEMA.captureState(),
    validateCinema: stateForgeRuntime.validate,
  });
}

export type LiveStateForge = ReturnType<typeof assembleLiveStateForge>;

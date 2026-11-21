import type { LiveCampaignTrainingAssembly } from "../campaign/live-campaign-training-assembly";
import { createLiveMusicObservation, projectLiveMusicRun } from "../interface/music-observation-adapter";
import type { LiveScreenNavigation } from "../interface/live-screen-navigation";
import { isMenuScreen } from "../../domain/screen-catalog";
import type { LiveGhostCapture } from "../replay/live-ghost-capture";
import type { LiveGhostChaseRuntime } from "../replay/live-ghost-chase";
import type { LiveGhostPracticeSessionState } from "../replay/ghost-practice-session-state";
import type { LiveGhostRecording } from "../replay/live-ghost-recording";
import type { LiveRunOrchestration } from "../run/run-orchestration-composition";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameBlade, GamePlayer, GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { LiveAuthoritativeInputAdapter } from "../../gameplay/runtime/authoritative-input-adapter";
import type { LiveInputAuthorityState } from "../world/input-authority-state";
import type { LiveWorldComposition } from "../world/world-composition";
import type { LiveCombatFrameContext } from "./combat-frame-context";

type BrowserParityTickWindow = Window & {
  __TEAR_PARITY_TICK__?: { before?(tick: number): void; after?(tick: number): void };
};

export interface LiveCombatFramePortsOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly world: LiveWorldComposition;
  readonly campaignTraining: Pick<LiveCampaignTrainingAssembly, "campaign" | "addFloater">;
  readonly orchestration: Pick<LiveRunOrchestration, "modeWaves">;
  readonly navigation: Pick<LiveScreenNavigation, "screen">;
  readonly inputAuthority: Pick<LiveInputAuthorityState, "allowsDeviceAimCapture">;
  readonly input: Pick<LiveAuthoritativeInputAdapter, "clear">;
  readonly ghostRecording: Pick<LiveGhostRecording, "recorder" | "dna">;
  readonly ghostPractice: Pick<LiveGhostPracticeSessionState, "active">;
  readonly chase: Pick<LiveGhostChaseRuntime, "observe">;
  readonly surface: Readonly<{ width: number; height: number }>;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
  /** Collaborators constructed after the combat host. */
  readonly ghostCapture: () => Pick<LiveGhostCapture, "recordKeyframe">;
}

/**
 * The combat host's frame context: prelude time effects, device aim and
 * semantic action drain, per-tick observation hooks, and music snapshots.
 * TearScore updates are snapshot-driven at 8 Hz; semantic events are emitted immediately.
 */
export function createLiveCombatFramePorts(options: LiveCombatFramePortsOptions): LiveCombatFrameContext {
  const {
    dependencies,
    world,
    navigation,
    inputAuthority,
    run: liveRun,
    player: livePlayer,
    blade: liveBlade,
  } = options;
  const { Attract, CONFIG, DIAG, Input, SFX, browserWindow, clamp, lerp } = dependencies;
  const { state: hostState, lifecycle: RUN_LIFECYCLE, music: musicDirector } = world;
  const { impact, feel } = world.context.transient;
  const CINEMA = world.context.cinema;
  const { stage: stageRuntime } = options.campaignTraining.campaign;
  const { addFloater } = options.campaignTraining;
  const { recorder: ghostV3, dna: ghostDna } = options.ghostRecording;
  const { width: W, height: H } = options.surface;
  let canonicalTickStartedAt: number | null = null;
  const musicObservation = createLiveMusicObservation({
    director: musicDirector,
    appState: () => navigation.screen(),
    run: () => hostState.run(),
    player: () => hostState.player(),
    enemies: () => hostState.enemies(),
    projectiles: () => hostState.projectiles(),
    bossIntro: () => hostState.bossIntro(),
    stageName: () => stageRuntime.current.name,
    stageIndex: () => stageRuntime.index,
    totalWaves: options.orchestration.modeWaves,
    waveActive: () => RUN_LIFECYCLE.isWaveActive,
    runPhase: () => RUN_LIFECYCLE.phase,
    topComboThreshold: () => CONFIG.trick.tiers.at(-1)?.at ?? 1,
  });
  return {
    director: musicDirector,
    getRun: () => projectLiveMusicRun(hostState.run()),
    readPreludeState: () => {
      return {
        slowMotion: impact.slowMotion,
        timeScale: feel.timeScale,
        worldZoom: feel.worldZoom,
        worldZoomTarget: feel.worldZoomTarget,
        zoom: feel.zoom,
        flash: feel.flash,
        bannerTime: feel.bannerSeconds,
        stageBannerSeconds: stageRuntime.bannerSeconds,
        rankPopTime: feel.rankPopupSeconds,
      };
    },
    writePreludeState(frameState) {
      impact.slowMotion = frameState.slowMotion;
      feel.timeScale = frameState.timeScale;
      feel.worldZoom = frameState.worldZoom;
      feel.zoom = frameState.zoom;
      feel.flash = frameState.flash;
      feel.bannerSeconds = frameState.bannerTime;
      stageRuntime.bannerSeconds = frameState.stageBannerSeconds;
      feel.rankPopupSeconds = frameState.rankPopTime;
    },
    parrySlowScale: CONFIG.juice.parrySlowScale,
    cinemaActive: () => CINEMA.active,
    playgroundSlow: () => liveRun().pg.slow === true,
    lerp,
    clamp,
    timeScale: () => feel.timeScale,
    hitStop: () => impact.hitStop,
    setHitStop: (value) => {
      impact.hitStop = value;
    },
    state: () => navigation.screen(),
    drainActions: (tick) => {
      // Physical pointer input is sampled exactly once before being quantized
      // into the same sealed action stream used by automation and future
      // detached replay hosts.  The canonical action adapter owns the actual
      // player/blade overrides during the resulting simulation tick.
      if (inputAuthority.allowsDeviceAimCapture() && Input.aimIsLive()) {
        const blade = liveBlade();
        const hand = blade.handPos(livePlayer());
        const aim = blade.captureDeviceAim(hand);
        const radius = Math.max(1, CONFIG.blade.aimRadius);
        Input.semantic.setAimVector(aim.x / radius, aim.y / radius);
      }
      return Input.drainSemanticActions(tick);
    },
    recordSealedActions: (_tick, actions) => {
      ghostDna.beforeTick(_tick);
      for (const action of actions) ghostV3?.record("commands", action.tick, action);
      if (__TEAR_TEST_BUILD__) canonicalTickStartedAt = performance.now();
    },
    ...(__TEAR_TEST_BUILD__
      ? {
          beforeSimulationStep: (tick: number) => {
            const hook = (browserWindow as BrowserParityTickWindow).__TEAR_PARITY_TICK__;
            hook?.before?.(tick);
          },
        }
      : {}),
    afterSimulationStep: (tick: number) => {
      if (__TEAR_TEST_BUILD__ && canonicalTickStartedAt !== null) {
        DIAG.record("canonicalTick", performance.now() - canonicalTickStartedAt);
        DIAG.count("ticks");
        DIAG.count("canonicalTickMs", performance.now() - canonicalTickStartedAt);
        canonicalTickStartedAt = null;
      }
      ghostDna.afterTick(tick);
      options.chase.observe();
      void dependencies.practiceEncounterPersistence
        ?.observe({
          run: liveRun(),
          actors: hostState.enemies(),
          tick,
          playing: navigation.screen() === "playing",
          waveActive: RUN_LIFECYCLE.isWaveActive,
          blockingCinema: CINEMA.active && CINEMA.blocksCombat,
          ghostPractice: options.ghostPractice.active() !== null,
          width: W,
          height: H,
        })
        ?.then((status) => {
          if (status !== "committed")
            addFloater(livePlayer().x, livePlayer().y - 70, "ENCOUNTER SAVE NOT CONFIRMED", true, "#e0a326");
        });
      options.ghostCapture().recordKeyframe(tick);
      if (__TEAR_TEST_BUILD__) {
        const hook = (browserWindow as BrowserParityTickWindow).__TEAR_PARITY_TICK__;
        hook?.after?.(tick);
      }
    },
    clearSimulationInput: () => {
      options.input.clear();
    },
    gauge: (name, value) => {
      DIAG.gauge(name, value);
    },
    musicObservation,
    musicThemePort: () => SFX,
    musicThemeInput: () => ({
      menu: isMenuScreen(navigation.screen()),
      attractReady: Attract.ready,
      attractStage: Attract.ready ? Attract.stage().name : "menu",
      runMode: hostState.run()?.mode ?? "endless",
      stageName: stageRuntime.current.name,
      bossWave: hostState.run()?.isBossWave === true,
      appState: navigation.screen(),
    }),
  };
}

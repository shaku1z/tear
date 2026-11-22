import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { LiveGameHostState } from "../world/game-host-state";
import { CampaignRuntimeState } from "../../gameplay/campaign/campaign-runtime-state";
import { StageRuntimeState } from "../world/stage-runtime-state";
import { createRunStageController } from "../world/run-stage";
import {
  createCampaignChapterController,
  createFinaleController,
} from "../../gameplay/campaign/campaign-controller-factory";
import { createLiveCampaignRuntime, type LiveCampaignRuntimeApi } from "../../gameplay/campaign/campaign-runtime";
import type { RunLifecycleController } from "../../gameplay/run/lifecycle";
import type { PreparedVictory } from "../../gameplay/run/outcome-planner";
import type { CinematicPreference } from "../../gameplay/campaign/cinematic-preference";
import type {
  CampaignCinematicBeat,
  CampaignCinematicDirector,
  CampaignCinematicScript,
} from "../../gameplay/campaign/campaign-sequences";
import type { CinematicBeat, CinematicScript } from "../../presentation/cinematics";
import type { ArenaPlatform } from "../../gameplay/training/arena-rules";
import type { FinaleIntent } from "../../gameplay/campaign/finale-controller";
import {
  observeFinaleOutwardCall,
  type FinaleMaximumFeelReceipt,
  type FinaleOutwardCallObserver,
  type FinaleWorldZoomReceipt,
} from "../../gameplay/campaign/finale-outward-call";

type Stage = ReturnType<GameRuntimeDependencies["stageAt"]>;
type Platforms = ArenaPlatform[];
type Cinema = InstanceType<GameRuntimeDependencies["Cinematics"]["Director"]>;

export interface CampaignHostServices {
  readonly dependencies: GameRuntimeDependencies;
  readonly state: LiveGameHostState;
  readonly cinema: Cinema;
  readonly installStage: (controller: Readonly<{ load(index: number): void }>) => void;
  readonly lifecycle: RunLifecycleController;
  readonly activatePreparedWave: () => void;
  readonly prepareVictory: (campaign: boolean, persistFinale: boolean) => PreparedVictory;
  readonly win: (campaign: boolean) => void;
  readonly achievementsEnabled: () => boolean;
  readonly checkAchievements: () => void;
  readonly rememberBiome: (name: string) => void;
  readonly cinematicPreference: () => CinematicPreference;
  readonly addFlash: (amount: number) => FinaleMaximumFeelReceipt;
  readonly addShake: (amount: number) => FinaleMaximumFeelReceipt;
  readonly formatTime: (seconds: number) => string;
  readonly setWorldZoom: (value: number) => FinaleWorldZoomReceipt;
  readonly width: number;
  readonly height: number;
  readonly observeFinaleIntents?: (intents: readonly FinaleIntent[]) => void;
  readonly observeFinaleOutwardCall?: FinaleOutwardCallObserver;
}

export interface LiveCampaignHost {
  readonly cinema: Cinema;
  readonly stage: StageRuntimeState<Stage, Platforms>;
  readonly story: CampaignRuntimeState;
  readonly runtime: LiveCampaignRuntimeApi;
}

export function createLiveCampaignHost(services: CampaignHostServices): LiveCampaignHost {
  const { dependencies: d, state, lifecycle } = services;
  const cinema = services.cinema;
  const stage = new StageRuntimeState<Stage, Platforms>(d.stageAt, (index) =>
    d.stagePlatforms(index, d.CONFIG).map((platform) => ({ ...platform })),
  );
  const run = () => required(state.run(), "run");
  const player = () => required(state.player(), "player");
  const blade = () => required(state.blade(), "blade");
  const story = new CampaignRuntimeState(
    () => createCampaignChapterController(d.UI.t.motion, d.CONFIG),
    () => createFinaleController(d.CONFIG),
  );
  services.installStage(
    createRunStageController({
      stage,
      state,
      cinema,
      gameplayEvents: d.GAMEPLAY_EVENTS,
      progress: {
        tracking: () => services.achievementsEnabled(),
        rememberBiome: (name) => {
          services.rememberBiome(name);
        },
      },
    }),
  );
  const runtime = createLiveCampaignRuntime({
    runtime: story,
    cinema: {
      start: (script, context) => {
        cinema.start(adaptCinematicScript(script, context), {});
      },
      startBinding: (binding) => {
        cinema.start(binding.script, binding.context);
      },
    },
    run: () => state.run(),
    player,
    blade,
    stageAt: (index) => d.stageAt(index),
    preference: () => services.cinematicPreference(),
    preparedWave: () => lifecycle.hasPreparedWave,
    activationDeferred: () => lifecycle.activationDeferred,
    chapterIntents: {
      activatePreparedWave: services.activatePreparedWave,
      setChapterState(value, page) {
        run().chapterState = value;
        if (story.chapterFlow) {
          story.chapterFlow.state = value;
          if (page != null) story.chapterFlow.page = page;
        }
      },
      clearProjectiles: () => {
        state.projectiles().length = 0;
      },
      musicDuck: (amount, duration) => {
        d.SFX.setMusicDuck(amount, duration);
      },
      resetStageBanner: () => {
        stage.resetBanner();
      },
      sound: () => {
        d.SFX.dialogueTone("chapter");
      },
    },
    finaleIntents: {
      beginLifecycle: () => {
        lifecycle.beginFinale();
      },
      clearCombat() {
        state.setEnemies([]);
        state.setProjectiles([]);
        state.setSlowZones([]);
        state.setTemporaryWalls([]);
        state.setBossIntro(null);
        state.setStageBeat(null);
        run().spawnQueue.length = 0;
        run().chapterState = "WAVE_LIVE";
      },
      freezeVoid() {
        const activeRun = run();
        if (activeRun.voidScroll) {
          activeRun.voidScroll.active = false;
          activeRun.voidScroll.frozen = true;
        }
        activeRun.voidDescent = null;
      },
      worldZoom(value) {
        const receipt = services.setWorldZoom(value);
        observeFinaleOutwardCall(services.observeFinaleOutwardCall, { type: "world-zoom", value, receipt });
      },
      finalBlade(active, restoredTrail) {
        const weapon = blade();
        weapon.finalFree = active;
        if (restoredTrail) weapon.restoredTrail = true;
        // The beat authors the blade's look (the restored trail), so it shows over any cosmetic until the beat ends.
        d.COSMETICS.authored(active && restoredTrail);
        if (!active) return;
        weapon.hostile = false;
        weapon.stolenBy = null;
        weapon.state = "held";
        const hand = weapon.handPos(player());
        weapon.x = hand.x;
        weapon.y = hand.y;
        weapon.vx = 0;
        weapon.vy = 0;
      },
      ring(x, y, radius, color) {
        const receipt = d.FX.ring(x, y, radius, color);
        observeFinaleOutwardCall(services.observeFinaleOutwardCall, { type: "ring", x, y, radius, color, receipt });
      },
      burst(x, y, dx, dy, count, color) {
        const receipt = d.FX.burst(x, y, dx, dy, count, color);
        observeFinaleOutwardCall(services.observeFinaleOutwardCall, {
          type: "burst",
          x,
          y,
          dx,
          dy,
          count,
          color,
          receipt,
        });
      },
      flash(amount) {
        const receipt = services.addFlash(amount);
        observeFinaleOutwardCall(services.observeFinaleOutwardCall, { type: "flash", amount, receipt });
      },
      shake(amount) {
        const receipt = services.addShake(amount);
        observeFinaleOutwardCall(services.observeFinaleOutwardCall, { type: "shake", amount, receipt });
      },
      vibrate(pattern) {
        d.Input.buzz([...pattern]);
        observeFinaleOutwardCall(services.observeFinaleOutwardCall, { type: "vibrate", pattern });
      },
      sound(cue, index) {
        if (cue === "final-cut") d.SFX.finalCut(index);
        else if (cue === "final-relic") d.SFX.finalRelic(index);
        else if (cue === "final-restore") d.SFX.finalRestore();
        else d.SFX.finalSilence();
        observeFinaleOutwardCall(services.observeFinaleOutwardCall, { type: "sound", cue, index });
      },
      restoreStageZero() {
        stage.load(0);
        state.setSlowZones([]);
        state.setTemporaryWalls([]);
        state.setProjectiles([]);
        state.setEnemies([]);
      },
      restorePlayer(xMin, xMax, yMax, vy) {
        const actor = player();
        actor.x = d.clamp(actor.x, actor.hw + xMin, xMax - actor.hw);
        actor.y = Math.min(actor.y, yMax);
        actor.vx = 0;
        actor.vy = vy;
        actor.onGround = false;
      },
      voidMix(amount, duration) {
        d.SFX.setVoidDescent(amount, duration);
        observeFinaleOutwardCall(services.observeFinaleOutwardCall, { type: "void-mix", amount, duration });
      },
      musicDuck(amount, duration) {
        d.SFX.setMusicDuck(amount, duration);
        observeFinaleOutwardCall(services.observeFinaleOutwardCall, { type: "music-duck", amount, duration });
      },
      win: services.win,
    },
    clearStageBeat: () => {
      state.setStageBeat(null);
    },
    prepareVictory: services.prepareVictory,
    win: services.win,
    formatTime: services.formatTime,
    viewport: { width: services.width, height: services.height },
    perfectColor: () => d.CONFIG.colors.perfect,
    reducedMotion: () => d.A11Y.reducedMotion,
    lowGraphics: () => d.GFX.low,
    ...(services.observeFinaleIntents === undefined ? {} : { observeFinaleIntents: services.observeFinaleIntents }),
  });
  return Object.freeze({ cinema, stage, story, runtime });
}

function required<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw new Error(`campaign ${label} is unavailable`);
  return value;
}

function adaptCinematicScript<Context>(script: CampaignCinematicScript<Context>, context: Context): CinematicScript {
  const wrapBeat = (beat: CampaignCinematicBeat<Context>): CinematicBeat => {
    const { onEnter, onUpdate, waitUntil, ...fields } = beat;
    return {
      ...fields,
      ...(onEnter
        ? {
            onEnter: (_ignored, value) => {
              onEnter(context, value);
            },
          }
        : {}),
      ...(onUpdate
        ? {
            onUpdate: (_ignored, value) => {
              onUpdate(context, value);
            },
          }
        : {}),
      ...(waitUntil ? { waitUntil: (_ignored, value) => waitUntil(context, value) } : {}),
    };
  };
  const director = (value: CampaignCinematicDirector): CampaignCinematicDirector => value;
  const { onStart, onSkip, onComplete, onCancel, beats: _beats, ...fields } = script;
  void _beats;
  return {
    ...fields,
    beats: script.beats.map(wrapBeat),
    ...(onStart
      ? {
          onStart: (_ignored, value) => {
            onStart(context, director(value));
          },
        }
      : {}),
    ...(onSkip
      ? {
          onSkip: (_ignored, value) => {
            onSkip(context, director(value));
          },
        }
      : {}),
    ...(onComplete
      ? {
          onComplete: (_ignored, value) => {
            onComplete(context, director(value));
          },
        }
      : {}),
    ...(onCancel
      ? {
          onCancel: () => {
            onCancel(context);
          },
        }
      : {}),
  };
}

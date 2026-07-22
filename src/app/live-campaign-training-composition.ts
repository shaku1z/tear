import { createLiveWeaponRuntime } from "../gameplay/combat/live-weapon-runtime";
import type { RunLifecycleController } from "../gameplay/run/lifecycle";
import { drawTutorialGhost } from "../presentation/tutorial-ghost";
import { cinematicLaunchPolicy, type CinematicPreference } from "./cinematic-preference";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameBlade, GameEnemy, GamePlayer, GameProjectile, GameRun } from "./game-runtime-state";
import type { LiveGameHostState } from "./live-game-host-state";
import type { LegacyAppScreen } from "./legacy-state-controller";
import type { LiveRunControllerRegistry } from "./live-run-controller-api";
import { createLiveCampaignHost } from "./live-campaign-host";
import { createLiveCinematicHost } from "./live-cinematic-host";
import { createLiveSourceVoidController } from "./live-source-void-controller";
import { createLiveStyleHost } from "./live-style-host";
import { createLiveTrainingHost } from "./live-training-host";
import type { PreparedVictory } from "../gameplay/run/outcome-planner";
import type { RunDifficulty } from "../gameplay/run/session";
import type { PlaygroundScreenModel } from "../gameplay/training/live-playground-presentation";
import type { LiveWaveSpawnSpec } from "../gameplay/run/live-enemy-spawn";

type ReplayPacket = NonNullable<ReturnType<GameRuntimeDependencies["GHOST"]["stopRec"]>>;
type Controllers = LiveRunControllerRegistry<GameRun, ReplayPacket, PreparedVictory>;

export interface LiveCampaignTrainingOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly state: LiveGameHostState;
  readonly lifecycle: RunLifecycleController;
  readonly controllers: Controllers;
  readonly width: number;
  readonly height: number;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
  readonly enemies: () => GameEnemy[];
  readonly projectiles: () => GameProjectile[];
  readonly spawn: (kind: LiveWaveSpawnSpec["type"], hpScale: number) => GameEnemy | undefined;
  readonly resolveKill: (enemy: GameEnemy, cause: string) => void;
  readonly setScreen: (screen: LegacyAppScreen) => void;
  readonly resetScroll: () => void;
  readonly scroll: () => number;
  readonly setScroll: (value: number) => void;
  readonly requestPointerLock: () => void;
  readonly selectStage: (index: number) => void;
  readonly beginWipe: () => void;
  readonly resetRun: (difficulty: RunDifficulty) => void;
  readonly applySettingsCinematicPreference: () => CinematicPreference;
  readonly shakeScale: () => number;
  readonly getShake: () => number;
  readonly setShake: (value: number) => void;
  readonly getZoom: () => number;
  readonly setZoom: (value: number) => void;
  readonly getFlash: () => number;
  readonly setFlash: (value: number) => void;
  readonly setSlowMotion: (value: number) => void;
  readonly setHitStop: (value: number) => void;
  readonly setWorldZoom: (value: number, immediate: boolean) => void;
  readonly renderMenu: (model: PlaygroundScreenModel) => void;
  readonly renderLab: (model: PlaygroundScreenModel) => void;
  readonly abilityColors: () => Readonly<Record<string, Readonly<{ color: string }>>>;
  readonly emitMusicEvent: (name: string, detail?: Readonly<Record<string, unknown>>) => void;
  readonly showRank: (rank: string) => void;
}

/** Composes campaign, training, cinematics, weapon feedback, and style progression. */
export function createLiveCampaignTrainingComposition(options: LiveCampaignTrainingOptions) {
  const d = options.dependencies;
  let style: ReturnType<typeof createLiveStyleHost> | null = null;
  const requireStyle = () => {
    if (style === null) throw new Error("Style runtime is not installed");
    return style;
  };
  const campaign = createLiveCampaignHost({
    dependencies: d, state: options.state,
    installStage: (controller) => { options.controllers.installStage(controller); },
    lifecycle: options.lifecycle, activatePreparedWave: options.controllers.api.activatePreparedWave,
    prepareVictory: options.controllers.api.prepareVictoryRecord, win: options.controllers.api.winRun,
    achievementsEnabled: () => requireStyle().tracks(),
    checkAchievements: () => { requireStyle().check(); },
    resetStageAchievements: () => { requireStyle().achievements.stageReset(); },
    rememberBiome(name) { d.PROFILE.maxStat("biomesSeen", d.PROFILE.markBiome(name)); requireStyle().check(); },
    cinematicPreference: options.applySettingsCinematicPreference,
    addFlash: (amount) => { options.setFlash(Math.max(options.getFlash(), amount)); },
    addShake: (amount) => { options.setShake(Math.max(options.getShake(), amount)); },
    formatTime: (seconds) => requireStyle().formatTime(seconds),
    setWorldZoom: (value) => { options.setWorldZoom(value, true); },
    width: options.width, height: options.height,
  });

  const addFloater = (x: number, y: number, text: string, big = false, color = "#000"): void => {
    options.state.floaters().push({ x, y, text, life: 0.8, big, col: color });
  };
  const weapon = createLiveWeaponRuntime<GameEnemy>({
    run: options.run, player: options.player, blade: options.blade, enemies: options.enemies, time: () => d.CLOCK.sim,
    overrun: () => d.CONFIG.overrun, stormbank: () => d.CONFIG.stormbank,
    score: () => ({ perKill: d.CONFIG.run.scorePerKill, multiplier: d.CONFIG.run.scoreMult }),
    colors: () => d.CONFIG.colors, juice: () => d.CONFIG.juice, shakeScale: options.shakeScale,
    motionScale: () => d.A11Y.motionScale, flashScale: () => d.A11Y.flashScale,
    parrySlowmo: () => d.CONFIG.juice.parrySlowmo, bigShake: () => d.CONFIG.juice.shakeBig || 20,
    clamp: d.clamp, distance: d.len, buzz: (pattern) => { d.Input.buzz(pattern); },
    rumble: (strength, duration) => { d.PAD.rumble(strength, duration); },
    setShake: options.setShake, shake: options.getShake, setZoom: options.setZoom, zoom: options.getZoom,
    setFlash: options.setFlash, flash: options.getFlash, setSlowmo: options.setSlowMotion,
    setHitStop: options.setHitStop, smallHitStop: () => d.CONFIG.hitStop.small, addFloater,
    explode: (...args) => { d.FX.explode(...args); }, ring: (...args) => { d.FX.ring(...args); },
    ribbon: (...args) => { d.FX.ribbon(...args); }, burst: (...args) => { d.FX.burst(...args); },
    death: (...args) => { d.FX.death(...args); }, deathShards: () => d.CONFIG.juice.deathShards,
    parrySound: () => { d.SFX.parry(); }, recallSound: () => { d.SFX.recall(); }, onKill: options.resolveKill,
  });

  const training = createLiveTrainingHost({
    dependencies: d, state: options.state, width: options.width, height: options.height,
    lifecycle: options.lifecycle, stage: campaign.stage, spawn: options.spawn,
    navigate: options.setScreen, resetScroll: options.resetScroll,
    releasePointer: () => { document.exitPointerLock(); }, requestPointer: options.requestPointerLock,
    selectStage: options.selectStage, wipe: options.beginWipe, resetRun: options.resetRun,
    selectedWeapon: () => options.state.selectedWeapon(),
    selectWeapon: (weapon) => { options.state.setSelectedWeapon(weapon); }, addFloater,
    drawGhost: (snapshot) => { drawTutorialGhost(options.context, snapshot, {
      ink: d.THEME.ink, accent: d.CONFIG.colors.perfect, target: d.CONFIG.colors.charger,
      hostileShot: d.CONFIG.colors.enemyShot,
    }, { draw(context, text, x, y, color) { d.UI.tag(context, text, x, y, color, "center", d.UI.t.type.micro); } }); },
    abilityColors: options.abilityColors, scroll: options.scroll, setScroll: options.setScroll,
    renderMenu: options.renderMenu, renderLab: options.renderLab,
  });

  const sourceController = createLiveSourceVoidController(d, options.width, options.height);
  const cinematic = createLiveCinematicHost({
    dependencies: d, state: options.state, sourceController, cinema: campaign.cinema,
    stage: campaign.stage, width: options.width,
    story: {
      get finale() { return campaign.story.finale; },
      get lastCinemaPlayerMode() { return campaign.story.lastCinemaPlayerMode; },
      set lastCinemaPlayerMode(value) { campaign.story.lastCinemaPlayerMode = value; },
      markFinaleLanded: () => { campaign.story.finaleController.markLanded(); },
      syncFinale: () => { campaign.story.syncFinale(); },
    },
    policy: () => cinematicLaunchPolicy(options.applySettingsCinematicPreference()),
    clearBossBeat: () => { options.state.setBossBeat(null); },
    setWorldZoom: (value) => { options.setWorldZoom(value, false); },
    spawnWisp: (x, y, lane) => {
      const wisp = new d.VoidWisp(x, y); wisp.voidLane = lane; wisp.spawnT = 0.25;
      options.state.enemies().push(wisp);
    },
    addFlash: (amount) => { weapon.addFlash(amount); }, addShake: (amount) => { weapon.addShake(amount); },
    loseStyle: () => { requireStyle().loseStyle(); }, shieldAbsorb: () => { weapon.shieldAbsorb(); },
    addFloater, finaleBladeCut: (...args) => { campaign.runtime.tryFinaleBladeCut(...args); },
    playSound(cue) {
      if (cue === "wardenLockdown") d.SFX.wardenLockdown(); else if (cue === "sourceCross") d.SFX.sourceCross();
      else if (cue === "echoResonance") d.SFX.echoResonance(); else if (cue === "colossusServo") d.SFX.colossusServo();
      else if (cue === "aldricIgnite") d.SFX.aldricIgnite(); else if (cue === "aldricCrownFall") d.SFX.aldricCrownFall();
    },
  });

  style = createLiveStyleHost({
    dependencies: d, state: options.state, tutorial: training.tutorial,
    captureGhost: (trick, x, y, importance) => { d.GHOST.event(trick, x, y); d.GHOST.snapshot(options.canvas, importance); },
    rankUp: (rank) => { options.showRank(rank); d.SFX.rankup(); },
    musicRankChanged: (rank) => { options.emitMusicEvent("combo-rank-changed", { rankId: rank }); },
    addProjectile: (projectile) => { options.projectiles().push(projectile); },
  });
  return Object.freeze({ campaign, training, cinematic, style, weapon, addFloater });
}

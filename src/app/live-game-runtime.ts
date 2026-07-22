import { MusicDirector } from "../audio/music-director";
import { RunLifecycleController } from "../gameplay/run/lifecycle";
import { BOSS_ROSTER } from "../gameplay/run/content-director";
import { projectCanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { CanvasUiButton } from "../presentation/screens/button-layer";
import { blendHex as blendCol, easeOut as ez } from "../presentation/world/primitives";
import { createLiveBrowserRuntime } from "./live-browser-runtime";
import { createLiveCampaignTrainingComposition } from "./live-campaign-training-composition";
import { createLiveCombatActions } from "./live-combat-actions";
import { createLiveCombatComposition } from "./live-combat-composition";
import { createLiveInterfaceComposition, isRunDifficultySelection, isRunModeSelection } from "./live-interface-composition";
import { createLiveRunOrchestration } from "./live-run-orchestration-composition";
import { createLiveSessionServices } from "./live-session-services-composition";
import { createConfigRestorer } from "./runtime-initialization";
import { RuntimeFrameDriver } from "./runtime-frame-driver";
import { createLiveMusicObservation, projectLiveMusicRun } from "./live-music-observation-adapter";
import { isMenuScreen, renderRegisteredScreen } from "./screen-registry";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameBlade, GameEnemy, GameFloater, GamePlayer, GameProjectile, GameRun,
  GameSlowZone, GameTemporaryWall } from "./game-runtime-state";
import type { BossBeatState, BossIntroState, LiveGameHostState } from "./live-game-host-state";
import type { LegacyAppScreen, LegacyTransitionContext } from "./legacy-state-controller";
import type { RunScreenState } from "./live-run-screen-adapters";
import type { InteractiveUiButton } from "./ui-runtime-controller";
import type { RunDifficulty, RunMode } from "../gameplay/run/session";
import { trainingRunRequiresPreflight } from "./live-training-host";

type UiButton = CanvasUiButton & InteractiveUiButton;
type OutcomeInfo = ReturnType<RunScreenState["outcome"]>;
type ReplayPacket = NonNullable<ReturnType<GameRuntimeDependencies["GHOST"]["stopRec"]>>;

export function startLiveGame(dependencies: GameRuntimeDependencies): void {
  const {
    A11Y, APP, Attract, Backdrop, CG, CLOCK, CONFIG, Cloud, DIAG,
    FX, GFX, GHOST, Input, OVERSCAN, PAD,
    ReflectionEnemy, SAFE, SFX, THEME, UI, VAULT,
    applyUpgrade, clamp, cosmeticRandom, lerp,
    weaponCapsuleIntersectsSegment,
  } = dependencies;

(function () {
  const browserRuntime = createLiveBrowserRuntime(dependencies);
  const { canvas, context: ctx, width: W, height: H, viewport, resizeCanvas,
    requestPointerLock: requestLock, installPrompt, lockHint, hint: hintEl,
    pantheonDebug: PANTHEON_DEBUG, testMode: TEST_MODE } = browserRuntime;

  const restoreConfig = createConfigRestorer(CONFIG);

  const sessionServices = createLiveSessionServices({
    dependencies, run: () => run, player: () => player, blade: () => blade,
    screen: () => state, setScreen: (screen) => { setState(screen); },
    achievementTracking: () => achTracks(),
    resetUi: (intent) => { if (intent.enter) enterT = 0; if (intent.focus) focus = 0; if (intent.scroll) listScroll = 0; },
    requestPointerLock: requestLock, renamePrompted: () => settingsRenameAdapters.renamePrompted(),
    renameActive: () => settingsRenameAdapters.renameActive(),
    markRenamePrompted: () => { settingsRenameAdapters.markRenamePrompted(); },
    beginRename: (firstRun) => { settingsRenameAdapters.beginRename(firstRun); },
  });
  const { settingsController, settings, applySettings, controllers: runControllers,
    economy: economyRuntime, reward: rewardRuntime, bestScores } = sessionServices;
  const {
    claimSavedFinale, endRun, loadStage, resumeSavedFinale, retryRun, startRun: startRunImmediate, updateWave,
  } = runControllers.api;
  const { awardCoins, telemetry: economyTelemetry } = economyRuntime;
  const { openDraft: openRewardDraft, openTier: openRewardTier } = rewardRuntime;
  const { read: getBest, record: saveBest } = bestScores.api;

  let state: LegacyAppScreen = APP.screen;
  function setState(next: LegacyAppScreen, context?: LegacyTransitionContext): LegacyAppScreen {
    state = APP.transition(next, context);
    return state;
  }
  let player: GamePlayer;
  let blade: GameBlade;
  let enemies: GameEnemy[] = [];
  let projectiles: GameProjectile[] = [];
  let floaters: GameFloater[] = [];
  let hitStop = 0, shake = 0;
  let timeScale = 1, slowmo = 0, zoom = 1, flash = 0, bannerT = 0, dashGhostT = 0; // feel/juice
  let worldZoom = 1, worldZoomTarget = 1;   // sustained camera framing (the void run pulls this OUT)
  let wasSwinging = false, wasDashing = false, wasOnGround = true; // audio cadence
  let landVy = 0;   // peak fall speed while airborne -> scales the landing dust
  let throwCd = 0;            // brief cooldown between blade throws (not recalls)
  let slowZones: GameSlowZone[] = [];
  let tempWalls: GameTemporaryWall[] = [];
  let rankPopT = 0, rankPopText = "";   // style rank-up flash
  let run: GameRun;
  const RUN_LIFECYCLE = new RunLifecycleController();
  let lastGhost: ReplayPacket | null = null;
  let lastVaultId: string | null = null;
  let overInfo: OutcomeInfo | null = null;
  const currentOutcome = (): OutcomeInfo => {
    if (overInfo === null) throw new Error("Outcome screen requires a completed run");
    return overInfo;
  };
  let selMode: RunMode = "endless", selDiff: RunDifficulty = "normal", selWeapon = "sword", selBoss = "shuffle";
  let uiButtons: UiButton[] = [];
  let focus = -1, lastUiState: LegacyAppScreen = state;
  let listScroll = 0;                   // scroll offset for scrollable screens
  let uiT = 0, enterT = 0, lastUiDt = 1 / 60, eIn = 1, winT = 0;   // menu ambient clock, time-since-screen-opened, last frame dt, entrance ease, ending cinematic clock
  let uiZoom = 1;   // overlay zoom for small touch screens (draft/pause/gameover readability)
  let bossIntro: BossIntroState | null = null;
  let bossBeat: BossBeatState | null = null;
  const musicDirector = new MusicDirector(SFX);
  let continueT = 0;   // rewarded-revive countdown
  let hudHpLag = 1, hudMultPrev = 1, hudMultPop = 0;   // HUD juice: health damage-chip + combo pop
  const hoverAnim: Record<string, number> = {};

  const hostState: LiveGameHostState = Object.freeze({
    run: () => run, setRun: (value) => { if (value !== null) run = value; },
    player: () => player, setPlayer: (value) => { if (value !== undefined) player = value; },
    blade: () => blade, setBlade: (value) => { if (value !== undefined) blade = value; },
    enemies: () => enemies, setEnemies: (value) => { enemies = value; },
    projectiles: () => projectiles, setProjectiles: (value) => { projectiles = value; },
    floaters: () => floaters, setFloaters: (value) => { floaters = value; },
    slowZones: () => slowZones, setSlowZones: (value) => { slowZones = value; },
    temporaryWalls: () => tempWalls, setTemporaryWalls: (value) => { tempWalls = value; },
    bossIntro: () => bossIntro, setBossIntro: (value) => { bossIntro = value; },
    bossBeat: () => bossBeat, setBossBeat: (value) => { bossBeat = value; },
    selectedWeapon: () => selWeapon, setSelectedWeapon: (value) => { selWeapon = value; },
    outcome: () => overInfo, setOutcome: (value) => { overInfo = value; },
    lastRecording: () => lastGhost, setLastRecording: (value) => { lastGhost = value; },
    lastVaultId: () => lastVaultId, setLastVaultId: (value) => { lastVaultId = value; },
    winSeconds: () => winT, setWinSeconds: (value) => { winT = value; },
  } satisfies LiveGameHostState);

  const campaignTraining = createLiveCampaignTrainingComposition({
    dependencies, state: hostState, lifecycle: RUN_LIFECYCLE, controllers: runControllers,
    width: W, height: H, canvas, context: ctx,
    run: () => run, player: () => player, blade: () => blade, enemies: () => enemies,
    projectiles: () => projectiles,
    spawn: (kind, hpScale) => { spawnOne({ type: kind, hpScale }); return enemies[enemies.length - 1]; },
    resolveKill: (enemy, cause) => { liveKillRuntime.resolve(enemy, cause); },
    setScreen: (screen) => { setState(screen); }, resetScroll: () => { listScroll = 0; },
    scroll: () => listScroll, setScroll: (value) => { listScroll = value; },
    requestPointerLock: requestLock, selectStage: loadStage, beginWipe: () => { Wipe.begin(); },
    resetRun: (difficulty) => { startRunWithPreflight("playground", difficulty); },
    applySettingsCinematicPreference: () => settings.cinematics, shakeScale: () => settingsController.shakeScale,
    getShake: () => shake, setShake: (value) => { shake = value; },
    getZoom: () => zoom, setZoom: (value) => { zoom = value; },
    getFlash: () => flash, setFlash: (value) => { flash = value; },
    setSlowMotion: (value) => { slowmo = value; }, setHitStop: (value) => { hitStop = value; },
    setWorldZoom: (value, immediate) => { worldZoomTarget = value; if (immediate) worldZoom = value; },
    renderMenu: (model) => { presentationScreenRenderers.pgmenu(model); },
    renderLab: (model) => { presentationScreenRenderers.pglab(model); },
    abilityColors: () => libraryAdapters.categories,
    emitMusicEvent: (name, detail) => { liveFrameRuntime.emitMusicEvent(name, detail); },
    showRank: (rank) => { rankPopT = 1; rankPopText = rank; },
  });
  const { campaign: campaignHost, training: trainingHost, cinematic: cinematicHost,
    style: styleAchievementRuntime, weapon: weaponRuntime, addFloater } = campaignTraining;
  const { cinema: CINEMA, stage: stageRuntime, story, runtime: campaignRuntime } = campaignHost;
  const startRunWithPreflight = (mode: RunMode, difficulty: RunDifficulty): void => {
    if (!trainingRunRequiresPreflight(mode)) { startRunImmediate(mode, difficulty); return; }
    void trainingHost.ensureLoaded().then(() => { startRunImmediate(mode, difficulty); }).catch((error: unknown) => {
      console.warn("Tear training runtime failed to load", error); });
  };
  const { severFinaleAnchor, startAdventureFinale } = campaignRuntime;
  const { addShake, addZoom, addFlash, triggerSlowmo, nearestEnemy, damageMultiplier: runDamageMult,
    log: logWeaponEvent, noteFirstDamage: noteFirstPlayerDamage, applySever, addOverrun: addOverrunStack,
    updateAbilities: updateWeaponAbilities, emitThrowResolve,
    activateThrowSecondary, hook: weaponHook, shieldAbsorb: onShieldAbsorb, dealArea: dealAoE,
    addKillScore, fire, makeEvent: makeEv } = weaponRuntime;

  const { tutorial: TUT, runtime: playgroundRuntime, presentation: playgroundPresentation } = trainingHost;
  const { sourceRuntime: sourceVoidRuntime, runtime: cinematicRuntime } = cinematicHost;
  const syncVoidPlayerSupport = (...args: Parameters<typeof sourceVoidRuntime.syncPlayer>) => sourceVoidRuntime.syncPlayer(...args);
  const updateVoidScroll = (...args: Parameters<typeof sourceVoidRuntime.update>) => { sourceVoidRuntime.update(...args); };
  const { startVoidDescent, startBossTransformation, step: stepCinematicPlaying } = cinematicRuntime;
  const dispatchPlaygroundAction = (...args: Parameters<typeof playgroundRuntime.dispatchAction>) => { playgroundRuntime.dispatchAction(...args); };
  const stepPlayground = (...args: Parameters<typeof playgroundRuntime.step>) => { playgroundRuntime.step(...args); };
  const { renderMenu: renderPgMenu, renderLab: renderPgLab } = playgroundPresentation;
  const {
    achievements: AT, addStyle, tracks: achTracks, check: achCheck, loseStyle,
    update: updateTrick, color: trickColor,
    splitProjectile: spawnSplitShards, formatTime: fmtTime,
  } = styleAchievementRuntime;

  const { modeWaves, bossById, spawn: spawnOne,
    updateBossArenaPlatforms, lobExplode } = createLiveRunOrchestration({
    dependencies, state: hostState, lifecycle: RUN_LIFECYCLE, controllers: runControllers,
    campaign: campaignHost, training: trainingHost, weapon: weaponRuntime, music: musicDirector,
    width: W, height: H, canvas, testMode: TEST_MODE,
    run: () => run, player: () => player, blade: () => blade, enemies: () => enemies,
    setEnemies: (value) => { enemies = value; }, setProjectiles: (value) => { projectiles = value; },
    selectedBoss: () => selBoss, restoreConfig, applySettings,
    prepareWorld: () => { if (CINEMA.active) CINEMA.cancel("new-run"); story.resetFinale(); hostState.setBossIntro(null); hostState.setBossBeat(null); },
    resetTransientWorld: () => { hitStop = 0; shake = 0; },
    finishWorldReset: () => { timeScale = 1; slowmo = 0; zoom = 1; flash = 0; bannerT = 0; dashGhostT = 0;
      throwCd = 0; worldZoom = 1; worldZoomTarget = 1; },
    resetAuthoritativeClocks: () => { simulation.reset(0); authoritativeInput.reset(); authoritativeStep.reset(); },
    authoritativeResult: () => authoritativeStep.lastResult,
    setScreen: (screen, detail) => { setState(screen, detail); }, requestPointerLock: requestLock,
    beginWipe: () => { Wipe.begin(); }, wipeRemainingSeconds: () => Wipe.remainingSeconds,
    setBannerSeconds: (value) => { bannerT = value; }, openTier: openRewardTier, openDraft: openRewardDraft,
    resetRewards: () => { rewardRuntime.reset(); }, saveBest, getBest, awardCoins, economyTelemetry,
    setLastRecording: (value) => { lastGhost = value; }, setLastVaultId: (value) => { lastVaultId = value; },
    setOutcome: (value) => { overInfo = value; }, resetWinSeconds: () => { winT = 0; },
    achievementTracking: () => achTracks(), achievementCheck: achCheck, achievementTracker: AT,
    emitMusicOutcome: (outcome) => { liveFrameRuntime.emitMusicEvent(outcome); },
    startRun: (mode, difficulty) => { startRunWithPreflight(mode, difficulty); },
  });
  const frameDriver = new RuntimeFrameDriver(window);
  type CombatSnapshot = ReturnType<typeof projectCanonicalGameplayState>;
  type CombatHost = ReturnType<typeof createLiveCombatComposition<CombatSnapshot>>;
  type CombatCompositionInput = Parameters<typeof createLiveCombatComposition<CombatSnapshot>>[0];
  let openingProtection: ReturnType<typeof story.protection> = { active: false, lastMode: null };
  const isGameEnemy = (value: unknown): value is GameEnemy => typeof value === "object" && value !== null &&
    "cfg" in value && "hit" in value && "damageTakenMult" in value && "x" in value && "y" in value;
  const isGameProjectile = (value: unknown): value is GameProjectile => value instanceof dependencies.Projectile;
  const isDodgeProjectile = (value: unknown): value is Readonly<{ _dodged?: boolean }> =>
    typeof value === "object" && value !== null;
  const isSourceOwner = (value: unknown): value is GameEnemy & Parameters<typeof startVoidDescent>[0] =>
    isGameEnemy(value) && "id" in value && typeof value.id === "string";
  const isRitualOwner = (value: unknown): value is GameEnemy & NonNullable<Parameters<typeof startBossTransformation>[0]> =>
    isGameEnemy(value) && "bossName" in value && typeof value.bossName === "string" &&
    "cinematicT" in value && typeof value.cinematicT === "number";
  const isRitualCue = (value: unknown): value is NonNullable<Parameters<typeof startBossTransformation>[1]> =>
    typeof value === "object" && value !== null && "id" in value && typeof value.id === "string";
  const isEnemySample = (value: GameEnemy): value is GameEnemy & { _gid?: number } =>
    value._gid === undefined || typeof value._gid === "number";
  type CombatPlatform = (typeof stageRuntime.platforms)[number];
  const isCombatPlatform = (value: unknown): value is CombatPlatform => typeof value === "object" && value !== null &&
    "x" in value && typeof value.x === "number" && "y" in value && typeof value.y === "number" &&
    "w" in value && typeof value.w === "number" && "h" in value && typeof value.h === "number";
  const isGameFloater = (value: { y: number; life: number }): value is GameFloater =>
    "x" in value && "text" in value && "big" in value && "col" in value;
  const isWeaponEffect = (value: unknown): value is Readonly<{ mechanic?: string }> =>
    typeof value === "object" && value !== null && (!("mechanic" in value) || typeof value.mechanic === "string");
  const makeCombatEnemy = (value: unknown): GameEnemy => {
    if (!isGameEnemy(value)) throw new TypeError("Combat enemy factory returned an incompatible actor");
    return value;
  };
  const musicObservation = createLiveMusicObservation({ director: musicDirector, appState: () => state,
    run: () => hostState.run(), player: () => hostState.player(), enemies: () => enemies, projectiles: () => projectiles,
    bossIntro: () => bossIntro, stage: () => ({ name: stageRuntime.current.name, index: stageRuntime.index }),
    totalWaves: modeWaves, waveActive: () => RUN_LIFECYCLE.isWaveActive, runPhase: () => RUN_LIFECYCLE.phase,
    topComboThreshold: () => CONFIG.trick.tiers.at(-1)?.at ?? 1 });
  const isLegacyScreen = (screen: string): screen is LegacyAppScreen =>
    ["menu", "setup", "playing", "paused", "draft", "reserve", "tierup", "settings", "continue",
      "gameover", "win", "replay", "confirmquit", "shop", "codex", "profile", "achievements",
      "leaderboards", "rename", "pgmenu", "pglab"].includes(screen);
  const combatActions: ReturnType<typeof createLiveCombatActions> = createLiveCombatActions({
    dependencies, canvas, width: W, bossRosterSize: BOSS_ROSTER.length,
    live: {
      player: () => player, blade: () => blade, run: () => run,
      enemies: () => enemies, setEnemies: (value) => { enemies = value; },
      projectiles: () => projectiles, setProjectiles: (value) => { projectiles = value; },
      floaters: () => floaters, setFloaters: (value) => { floaters = value; },
      slowZones: () => slowZones, setSlowZones: (value) => { slowZones = value; },
      walls: () => tempWalls, setWalls: (value) => { tempWalls = value; },
      openingProtection: () => openingProtection, setOpeningProtection: (value) => { openingProtection = value; },
      openingState: () => ({ throwCooldown: throwCd, wasDashing, wasSwinging, wasOnGround,
        dashGhostTime: dashGhostT, landingVelocity: landVy }),
      setOpeningState(value) {
        throwCd = value.throwCooldown; wasDashing = value.wasDashing; wasSwinging = value.wasSwinging;
        wasOnGround = value.wasOnGround; dashGhostT = value.dashGhostTime; landVy = value.landingVelocity;
      },
      collisionState: () => ({ hitStop, slowMotion: slowmo, shake }),
      setCollisionState(value) { hitStop = value.hitStop; slowmo = value.slowMotion; shake = value.shake; },
    },
    ports: {
      stage: stageRuntime, story, cinema: CINEMA, tutorial: TUT,
      achievement: {
        dashDodge: (projectile) => { if (isDodgeProjectile(projectile)) AT.dashDodge(projectile); },
        bossHit: (enemy, kind) => { if (isGameEnemy(enemy)) AT.bossHit(enemy, kind); },
        bossKill: (enemy) => { if (isGameEnemy(enemy)) AT.bossKill(enemy); },
        onKill: () => { AT.onKill(); },
        swung: () => { AT.swung(); }, thrown: () => { AT.thrown(); }, parry: () => { AT.parry(); },
        breakStreak: () => { AT.breakStreak(); }, jumped: () => { AT.jumped(); },
        revived: () => { AT.revived(); }, tick: (seconds) => { AT.tick(seconds); },
      },
      functions: {
        addFloater, addShake, addZoom, addFlash, addStyle, loseStyle, onShieldAbsorb,
        noteFirstDamage: (enemy, first) => { if (isGameEnemy(enemy)) noteFirstPlayerDamage(enemy, first); },
        entityNoteFirstDamage: (enemy, first) => { if (isGameEnemy(enemy)) noteFirstPlayerDamage(enemy, first); },
        entityBossHit: (enemy) => { if (isGameEnemy(enemy)) AT.bossHit(enemy, "deflect"); },
        entityResolveKill: (enemy, cause) => { if (isGameEnemy(enemy)) liveKillRuntime.resolve(enemy, cause); },
        runDamageMultiplier: runDamageMult,
        updateWeaponAbilities, stepCinematic: stepCinematicPlaying, syncVoidSupport: syncVoidPlayerSupport,
        activateThrowSecondary, updateWave, updateBossArenaPlatforms, updateVoidScroll,
        startVoidDescent: (boss) => { if (isSourceOwner(boss)) startVoidDescent(boss); },
        nearestEnemy: (x, y) => { const enemy = nearestEnemy(x, y); return isGameEnemy(enemy) ? enemy : null; },
        openingNearestEnemy: () => { const enemy = nearestEnemy(blade.x, blade.y); return isGameEnemy(enemy) ? enemy : null; },
        areaDamage: (x, y, radius, damage, playerOwned) =>
          playerOwned === undefined ? dealAoE(x, y, radius, damage) : dealAoE(x, y, radius, damage, { playerOwned }),
        lobExplode, splitProjectile: (projectile) => { if (isGameProjectile(projectile)) spawnSplitShards(projectile); },
        triggerSlowMotion: triggerSlowmo,
        logWeapon: logWeaponEvent,
        emitThrowResolve: (enemy, damage) => { emitThrowResolve(isGameEnemy(enemy) ? enemy : null, damage); },
        updateTrick, updatePlayground: stepPlayground,
        endRun, checkAchievements: achCheck, addKillScore,
        applySever: (enemy, tier) => { if (isGameEnemy(enemy)) applySever(enemy, tier); }, fire,
        makeEvent: (x, y, enemy, cause, detail) => makeEv(x, y, isGameEnemy(enemy) ? enemy : null, cause, detail),
        weaponHook: (name, detail) => { const effect = weaponHook(name, detail); return isWeaponEffect(effect) ? effect : null; },
        modHook: (name) => run.mods[name], fireMod: fire,
        logWeaponEvent, weaponWorldImpact: () => { const effect = weaponHook("onWorldImpact",
          { blade, player, platforms: stageRuntime.platforms, x: blade.x, y: blade.y });
          return isWeaponEffect(effect) ? effect : null; },
        startTransformation: (enemy, request) => isRitualOwner(enemy) && isRitualCue(request) &&
          !CINEMA.active && startBossTransformation(enemy, request),
        achievementsEnabled: achTracks,
        setBossBanner: (text, color) => { bossBeat = { text, color, t: 1.15, dur: 1.15 }; },
        consumeThrow: () => GHOST.recording() ? authoritativeInput.consumeThrow() : Input.consumeThrow(),
        weaponSegmentContact: weaponCapsuleIntersectsSegment,
        createCharger: (x, y) => makeCombatEnemy(new dependencies.Charger(x, y)),
        createReflection: (x, y) => makeCombatEnemy(new ReflectionEnemy(x, y)),
        ghostDeath: (enemy) => { if (isGameEnemy(enemy) && isEnemySample(enemy)) GHOST.death(enemy); },
        ghostSample: (seconds, living) => { GHOST.sample(seconds, player, blade,
          living.filter(isGameEnemy).filter(isEnemySample)); },
        restorePlatforms: (platforms) => { stageRuntime.platforms = platforms.filter(isCombatPlatform); },
        addOverrunStack: () => { addOverrunStack(run.mods); },
        playSound: (name, argument) => {
          if (name === "swing") SFX.swing(typeof argument === "number" ? argument : 1);
          else if (name === "throwBlade") SFX.throwBlade(); else if (name === "dash") SFX.dash();
          else if (name === "slam") SFX.slam(); else if (name === "land") SFX.land();
          else if (name === "hurt") SFX.hurt(); else if (name === "deflect") SFX.deflect();
          else if (name === "boom") SFX.boom(); else if (name === "death") SFX.death();
        },
      },
    },
    resolveKill: (enemy, cause) => { if (isGameEnemy(enemy)) liveKillRuntime.resolve(enemy, cause); },
    combatRuntime: () => combatRuntime,
    emitMusicEvent: (type, detail) => { liveFrameRuntime.emitMusicEvent(type, detail); },
    releaseCamera: () => { worldZoomTarget = 1; },
    requestContinue: () => { setState("continue"); continueT = 8; document.exitPointerLock(); },
  });
  const combatAdapterContext: CombatCompositionInput["adapters"] = {
    entities: combatActions.entities,
    opening: {
      values: () => ({ player, blade, run, enemies, projectiles, platforms: stageRuntime.platforms, width: W,
        blocking: CINEMA.active && CINEMA.blocksCombat, playerMode: CINEMA.playerMode,
        protection: openingProtection, lowGraphics: GFX.low,
        transformationBlocked: CINEMA.active && CINEMA.blocksCombat }),
      actions: combatActions.opening,
      readState: () => ({ throwCooldown: throwCd, wasDashing, wasSwinging, wasOnGround,
        dashGhostTime: dashGhostT, landingVelocity: landVy }),
      writeState(value) {
        throwCd = value.throwCooldown; wasDashing = value.wasDashing; wasSwinging = value.wasSwinging;
        wasOnGround = value.wasOnGround; dashGhostT = value.dashGhostTime; landVy = value.landingVelocity;
      },
    },
    collision: {
      values: () => ({ player, blade, run, width: W }), actions: combatActions.collision,
      readState: () => ({ hitStop, slowMotion: slowmo, shake, enemies, projectiles, floaters }),
      writeState(value) {
        hitStop = value.hitStop; slowmo = value.slowMotion; shake = value.shake;
        enemies = value.enemies.filter(isGameEnemy); projectiles = value.projectiles.filter(isGameProjectile);
        floaters = value.floaters.filter(isGameFloater);
      },
    },
    kill: combatActions.kill,
  };
  // TearScore updates are snapshot-driven at 8 Hz; semantic events are emitted immediately.
  const frameContext = {
    director: musicDirector, getRun: () => projectLiveMusicRun(hostState.run()),
    readPreludeState: () => ({ slowMotion: slowmo, timeScale, worldZoom, worldZoomTarget, zoom, flash,
      bannerTime: bannerT, stageBannerSeconds: stageRuntime.bannerSeconds, rankPopTime: rankPopT,
      bossIntro: bossIntro === null ? null : { delay: bossIntro.delay, t: bossIntro.t, dur: bossIntro.dur,
        boss: { introT: bossIntro.boss.introT ?? 0, dead: bossIntro.boss.dead, dying: bossIntro.boss.dying,
          hp: bossIntro.boss.hp, maxHp: bossIntro.boss.maxHp,
          ...(bossIntro.boss.isBoss === undefined ? {} : { isBoss: bossIntro.boss.isBoss }),
          ...(typeof bossIntro.boss.bossId === "string" ? { bossId: bossIntro.boss.bossId } : {}),
          phaseMarks: bossIntro.boss.phaseMarks } },
      bossBeat: bossBeat === null ? null : { t: bossBeat.t } }),
    writePreludeState(frameState) {
      slowmo = frameState.slowMotion; timeScale = frameState.timeScale; worldZoom = frameState.worldZoom;
      zoom = frameState.zoom; flash = frameState.flash; bannerT = frameState.bannerTime;
      stageRuntime.bannerSeconds = frameState.stageBannerSeconds; rankPopT = frameState.rankPopTime;
      if (frameState.bossIntro === null) bossIntro = null;
      else if (bossIntro !== null) {
        if (typeof frameState.bossIntro.boss?.introT === "number")
          bossIntro.boss.introT = frameState.bossIntro.boss.introT;
        bossIntro = { boss: bossIntro.boss, delay: frameState.bossIntro.delay,
          t: frameState.bossIntro.t, dur: frameState.bossIntro.dur };
      }
      if (frameState.bossBeat === null) bossBeat = null;
      else if (bossBeat !== null) bossBeat = { ...bossBeat, t: frameState.bossBeat.t };
    },
    parrySlowScale: CONFIG.juice.parrySlowScale, cinemaActive: () => CINEMA.active,
    playgroundSlow: () => run.pg.slow === true, introScale: CONFIG.bossTheater.introScale, lerp, clamp,
    timeScale: () => timeScale, hitStop: () => hitStop, setHitStop: (value) => { hitStop = value; },
    state: () => state, recording: () => GHOST.recording(), aim: () => ({ x: blade.aimX, y: blade.aimY }),
    pushAim: (turn) => { Input.semantic.push({ type: "aim", turn }); }, drainActions: (tick) => GHOST.drainActions(tick),
    clearOverrides: () => { delete player.aiInput; delete blade.lmbOverride; delete blade.aimOverride; },
    gauge: (name, value) => { DIAG.gauge(name, value); },
    musicObservation,
    musicThemePort: () => SFX,
    musicThemeInput: () => ({ menu: isMenuScreen(state), attractReady: Attract.ready,
      attractStage: Attract.ready ? Attract.stage().name : "menu", runMode: hostState.run()?.mode ?? "endless",
      stageName: stageRuntime.current.name, bossWave: hostState.run()?.isBossWave === true, appState: state }),
  } satisfies CombatCompositionInput["frame"];
  const coordinatorContext = {
    now: () => performance.now(), state: () => state,
    setState: (screen) => { if (isLegacyScreen(screen)) setState(screen); },
    input: Input, pad: typeof PAD === "undefined" ? null : PAD, navigator, document, canvas,
    cinema: CINEMA, clipper: dependencies.Clipper ?? null,
    autoPauseDisconnect: () => settings.autoPauseDisconnect, requestPointerLock: requestLock,
    exitReplay: () => { replayAdapters.exit(); },
    advanceClocks: (dt, currentState) => {
      uiT += dt; enterT += dt; lastUiDt = dt; if (currentState === "win") winT += dt; else winT = 0;
    },
    advanceContinue: (dt) => {
      if (state === "continue" && continueT > 0) { continueT -= dt; if (continueT <= 0) endRun(); }
    },
    updateAttract: (dt, menu) => {
      if (menu) { if (!Attract.ready) Attract.reset(); Attract.update(dt); } else Attract.ready = false;
    },
    isMenuScreen: (screen) => isLegacyScreen(screen) && isMenuScreen(screen),
    gameplayStart: () => { CG.gameplayStart(); }, gameplayStop: () => { CG.gameplayStop(); },
    cssPerLogicalPixel: () => viewport.cssPerLogicalPixel, setUiDensity: (density) => { UI.setDensity(density); },
    render: () => { presentationHost.render(); }, handleUi: () => { presentationHost.handleUi(); }, diagnostics: DIAG,
    entityCounts: () => ({ enemies: enemies.length, projectiles: projectiles.length, effects: FX.list.length }),
  } satisfies CombatCompositionInput["coordinator"];
  const combatHost: CombatHost = createLiveCombatComposition({
    frameDriver, adapters: combatAdapterContext,
    lifecycle: {
      advanceClock: (dt) => { CLOCK.sim += dt; },
      captureProtection: () => { openingProtection = story.protection(); },
      applyProtection: () => { story.applyProtection(openingProtection); },
    },
    frame: frameContext, coordinator: coordinatorContext,
    authoritative: {
      applyInput(input, tick, actions) {
        input.beginTick(tick, actions);
        player.aiInput = input; blade.lmbOverride = input.primaryHeld;
        const aim = input.aimVector();
        blade.aimOverride = { x: player.x + aim.x * CONFIG.blade.aimRadius, y: player.y + aim.y * CONFIG.blade.aimRadius };
      },
      snapshot: (tick, input) => projectCanonicalGameplayState(tick, input.snapshot(), run, player, blade,
        enemies.map((enemy) => ({
          ...(typeof enemy._gid === "number" ? { _gid: enemy._gid } : {}), kind: enemy.kind, bossId: enemy.bossId,
          x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy, hp: enemy.hp, dead: enemy.dead,
        }))),
    },
  });
  const { simulation, authoritativeInput, combatEntityRuntime: combatRuntime,
    killRuntime: liveKillRuntime, frameRuntime: liveFrameRuntime, authoritativeStep } = combatHost;
  // full-screen rect INCLUDING the fullscreen overscan bleed — use for any fill that
  // must reach the true screen edges (backdrops, dims, vignettes), never for layout.
  const screenRect = () => presentationHost.screenRectangle();

  const biomeMode = () => ["campaign", "endless", "bossonly", "gauntlet", "tutorial", "playground"].includes(run.mode);
  let shopCoinShow: number | null = null;
  let shopFlash: Readonly<{ id: string; time: number }> | null = null;
  const interfaceComposition = createLiveInterfaceComposition({
    wipe: { canvas, context: ctx, createCanvas: () => document.createElement("canvas"), reducedEffects: () => GFX.low, flashScale: () => A11Y.flashScale, random: cosmeticRandom, ease: ez },
    worldSurface: { canvas: ctx, ui: UI, width: W, height: H, get safe() { return { top: SAFE.t, right: SAFE.r, bottom: SAFE.b, left: SAFE.l }; }, get ink() { return THEME.ink; }, get darkTheme() { return THEME.dark; }, get timeSeconds() { return CLOCK.sim; }, get lowGraphics() { return GFX.low; }, get reducedMotion() { return A11Y.reducedMotion; }, get highContrast() { return A11Y.highContrast; } },
    screens: {
      renderer: { canvas: ctx, ui: UI, width: W, height: H, screenRectangle: screenRect, time: () => uiT, enterAmount: () => eIn, scroll: () => listScroll, focus: () => focus, touch: () => Input.touchActive(), reducedMotion: () => A11Y.reducedMotion, enqueue: (button) => { uiButtons.push(button); } },
      replay: { dependencies, canvas: ctx, width: W, height: H, screenRectangle: screenRect, time: () => uiT, deltaSeconds: () => lastUiDt, fallbackPlayer: () => player, bossById, setScreen: (screen, context) => setState(screen, context), formatTime: fmtTime, document },
      library: { dependencies, canvas: ctx, height: H, time: () => uiT, enterSeconds: () => enterT, scroll: () => listScroll, setScroll: (value) => { listScroll = value; }, clamp, ease: ez, formatTime: fmtTime, getBest },
      settings: { dependencies, document, window, canvas, width: W, overscan: () => OVERSCAN, screen: () => state, setScreen: (screen, context) => setState(screen, context), settingsController, settings, scroll: () => listScroll, setScroll: (value) => { listScroll = value; }, clamp, installPrompt },
      actions: { setScreen: (screen) => { setState(screen); }, resetScroll: () => { listScroll = 0; }, setSetupSelection: (kind, id) => { if (kind === "mode" && isRunModeSelection(id)) { selMode = id; if (trainingRunRequiresPreflight(id)) void trainingHost.ensureLoaded(); } else if (kind === "difficulty" && isRunDifficultySelection(id)) selDiff = id; else if (kind === "weapon") selWeapon = id; else if (kind === "boss") selBoss = id; }, startSelectedRun: () => { startRunWithPreflight(selMode, selDiff); }, startRun: (mode, difficulty) => { if (isRunModeSelection(mode) && isRunDifficultySelection(difficulty)) startRunWithPreflight(mode, difficulty); }, currentRun: () => run, resumeFinale: resumeSavedFinale, claimFinale: claimSavedFinale, requestPointer: requestLock, endRun, retryRun, lastReplay: () => lastGhost, campaignDifficulty: () => overInfo?.diff ?? "normal", resetSettings: () => { settingsController.reset(); }, signIn: () => { void Cloud.signIn(); }, signOut: () => { void Cloud.signOut(); }, pinReplay: (id, pinned) => VAULT.pin(id, pinned), deleteReplay: (id) => { VAULT.remove(id); }, dispatchPlayground: dispatchPlaygroundAction },
      runState: { screen: () => state, setScreen: (screen) => { setState(screen); }, run: () => run, player: () => player, scroll: () => listScroll, setScroll: (value) => { listScroll = value; }, continueSeconds: () => continueT, setContinueSeconds: (value) => { continueT = value; }, replayAvailable: () => lastGhost !== null, outcome: currentOutcome },
      runServices: { dependencies, reward: rewardRuntime, formatTime: fmtTime, clamp, saveBest, awardCoins, cinema: CINEMA, clearFinale: () => { story.finale = null; }, terminateRun: (reason) => { RUN_LIFECYCLE.terminate(reason); }, addFloater, addShake, addFlash, requestPointer: requestLock },
      menuState: { selection: () => ({ mode: selMode, difficulty: selDiff, weapon: selWeapon, boss: selBoss }), scroll: () => listScroll, setScroll: (value) => { listScroll = value; }, time: () => uiT, shop: () => ({ displayedCoins: shopCoinShow, flash: shopFlash }), setShop: (value) => { shopCoinShow = value.displayedCoins; shopFlash = value.flash; } },
      menuServices: { dependencies, height: H, getBest, formatTime: fmtTime, clamp, checkAchievements: achCheck }, playground: { renderMenu: renderPgMenu, renderLab: renderPgLab },
    },
    frameState: { screen: () => state, previousScreen: () => lastUiState, setPreviousScreen: (value) => { lastUiState = value; }, uiZoom: () => uiZoom, setUiZoom: (value) => { uiZoom = value; Input.uiZoom = value; }, deltaSeconds: () => lastUiDt, enterSeconds: () => enterT, setEnterSeconds: (value) => { enterT = value; }, enterAmount: () => eIn, setEnterAmount: (value) => { eIn = value; }, scroll: () => listScroll, setScroll: (value) => { listScroll = value; }, focus: () => focus, setFocus: (value) => { focus = value; }, controls: () => uiButtons, resetControls: () => { uiButtons = []; }, biomeMode, enemies: () => enemies, flash: () => flash, bossBeat: () => bossBeat, bossIntroActive: () => !!bossIntro && bossIntro.delay <= 0, bannerSeconds: () => bannerT, rankPopup: () => ({ seconds: rankPopT, text: rankPopText, multiplier: run.mult }), timeSeconds: () => uiT },
    frameServices: { canvas, context: ctx, width: W, height: H, overscan: () => OVERSCAN, safeTop: () => SAFE.t, viewportScale: () => viewport.cssPerLogicalPixel, resize: resizeCanvas, input: Input, ui: UI, stage: stageRuntime, cinema: CINEMA, reducedMotion: () => A11Y.reducedMotion, flashScale: () => A11Y.flashScale, touchActive: () => Input.touchActive(), controller: () => ({ active: PAD.active, toastSeconds: PAD.toastT, toastText: PAD.toastText }), pointerLocked: () => Input.locked, lockHint, inputHint: hintEl, clamp, ease: ez, blendColor: blendCol, setTheme: (background, playLike) => { THEME.set(playLike && biomeMode() ? background : "#ffffff"); UI.ink = THEME.ink; }, themeInk: () => THEME.ink, backdropPost: (context, stage, camera) => { Backdrop.post(context, stage, camera); }, drawMenuAttract: () => { Attract.draw(ctx); }, renderScreen: (screen) => { renderRegisteredScreen(screen, interfaceComposition.screens.renderers); }, isMenuScreen, playInterfaceSound: () => { SFX.ui(); }, hoverAnimation: hoverAnim, trickColor },
    worldState: { run: () => run, player: () => player, blade: () => blade, enemies: () => enemies, projectiles: () => projectiles, floaters: () => floaters, slowZones: () => slowZones, temporaryWalls: () => tempWalls, screen: () => state, zoom: () => zoom, shake: () => shake, lastUiDelta: () => lastUiDt, bannerSeconds: () => bannerT, bossIntro: () => bossIntro, hud: () => ({ lagHp: hudHpLag, multiplier: hudMultPrev, multiplierPop: hudMultPop }), setHud(value) { hudHpLag = value.lagHp; hudMultPrev = value.multiplier; hudMultPop = value.multiplierPop; } },
    worldServices: { dependencies, canvas: ctx, width: W, height: H, debug: PANTHEON_DEBUG, stage: stageRuntime, tutorial: TUT, finale: () => story.finale, formatTime: fmtTime, trickColor, ease: ez }, onBiomeTransition: (begin) => { Attract.onBiomeChange = begin; },
  });
  const { wipe: Wipe, frame: presentationHost, screens: screenComposition } = interfaceComposition;
  const { library: libraryAdapters, replay: replayAdapters, settings: settingsRenameAdapters, modelRenderers: presentationScreenRenderers } = screenComposition;

  if (PANTHEON_DEBUG) void import("./live-debug-composition").then(({ installLiveGameDebug }) => { installLiveGameDebug({
    enabled: PANTHEON_DEBUG, dependencies, state: hostState, lifecycle: RUN_LIFECYCLE, cinema: CINEMA,
    stage: stageRuntime, width: W, height: H, startRun: (mode, difficulty) => { startRunWithPreflight(mode, difficulty); }, setScreen: setState, screen: () => state,
    setContinueSeconds: (value) => { continueT = value; }, openDraft: openRewardDraft, openTier: openRewardTier,
    run: () => run, player: () => player, blade: () => blade, applyUpgrade,
    enterReplay: (record, from) => { replayAdapters.enter(record, from); },
    beginRename: () => { settingsRenameAdapters.beginRename(false, true); },
    renameSnapshot: settingsRenameAdapters.renameSnapshot, selectSettingsTab: settingsRenameAdapters.selectSettingsTab,
    replayStatus: replayAdapters.status, applyOptions: (options) => { Object.assign(settings, options); applySettings(); },
    settings, selected: () => ({ mode: selMode, difficulty: selDiff, weapon: selWeapon, boss: selBoss }),
    chapterBrief: () => Boolean(story.chapterFlow?.brief), finale: () => story.finale,
    rewardSnapshot: rewardRuntime.snapshot, authoritative: () => authoritativeStep.lastResult,
    startFinale: startAdventureFinale, severFinale: () => severFinaleAnchor(false),
  }); });

  combatHost.startFrameLoop();
})();

}

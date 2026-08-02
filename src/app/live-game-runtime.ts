import { MusicDirector } from "../audio/music-director"; import type { AudioDispatchReceipt } from "../audio/audio-dispatch-receipts"; import type { FinaleIntent } from "../gameplay/campaign/finale-controller"; import type { FinaleOutwardCall } from "../gameplay/campaign/finale-outward-call"; import { createOutcomeChronologyJournal } from "../gameplay/run/outcome-chronology-journal"; import { BOSS_ROSTER } from "../gameplay/run/content-director";
import { projectCanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { CanvasUiButton } from "../presentation/screens/button-layer";
import { blendHex as blendCol, easeOut as ez } from "../presentation/world/primitives";
import { createLiveBrowserRuntime } from "./live-browser-runtime";
import { createLiveCampaignTrainingComposition } from "./live-campaign-training-composition";
import { createLiveCombatActions } from "./live-combat-actions";
import { createLiveCombatComposition } from "./live-combat-composition";
import { createLiveAuthoritativeInputAdapter } from "./live-authoritative-input-adapter";
import { createLiveInterfaceComposition, isRunDifficultySelection, isRunModeSelection } from "./live-interface-composition";
import { createLiveRunOrchestration } from "./live-run-orchestration-composition";
import { createLiveSessionServices } from "./live-session-services-composition";
import { replayLiveStateForgeProgression } from "./live-state-forge-progression";
import type { TearWorldConfiguration } from "../gameplay/runtime/tear-world-configuration";
import { commitBossIntroSnapshot } from "./live-frame-runtime";
import { RuntimeFrameDriver } from "./runtime-frame-driver";
import { createLiveMusicObservation, projectLiveMusicRun } from "./live-music-observation-adapter";
import { isMenuScreen, renderRegisteredScreen } from "./screen-registry";
import { createLiveWorldComposition } from "./live-world-composition";
import { createLiveWorldSessionState } from "./live-world-session-state";
import { createLiveCombatWorldState } from "./live-combat-world-state";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameBlade, GameEnemy, GamePlayer, GameProjectile, GameRun } from "./game-runtime-state";
import type { LegacyAppScreen, LegacyTransitionContext } from "./legacy-state-controller";
import type { InteractiveUiButton } from "./ui-runtime-controller";
import type { RunDifficulty, RunMode } from "../gameplay/run/session";
import { trainingRunRequiresPreflight } from "./live-training-host";
import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";
import { liveRewardChoiceIds, routeLiveTearBenchAction } from "../tearbench/live-runtime-action-routing";
import { emitLiveTearBenchPhysicalInput } from "../tearbench/browser/live-physical-input";
import { isCombatPlatform, isDodgeProjectile, isEnemySample, isGameEnemy, isGameFloater, isRitualCue, isWeaponEffect } from "./live-runtime-type-guards";
import { createLiveStateForgeAdapter } from "./live-state-forge-adapter";
import { createLiveStateForgeRuntimeBridge } from "./live-state-forge-runtime-bridge";
import { createBrowserGhostLiveRecorder, listBrowserGhostCapsuleManifests, readBrowserGhostCapsule, readBrowserGhostCapsuleReplay, readBrowserGhostCapsuleReplayAdmission } from "../ghost/live-recorder";
import { createLiveGhostCausalEvent, ghostLiveBootstrapEventId } from "../ghost/live-causal-events";
import { createGhostV3BrowserTestOptions } from "./ghost-v3-browser-test-options";
import { createGhostReplayRunContext, GHOST_REPLAY_CONTEXT_PROVENANCE_KEY, type GhostReplayRunContextV1 } from "../ghost/replay-admission";
import { captureLiveStateForgeSnapshot } from "../tearbench/live-runtime-snapshots";
import { createDefaultStateCodecRegistry } from "../tearbench/state-codecs";
import { ENTITY_KIND_REGISTRY } from "../tearbench/registries";
import { stableVerificationHash } from "../replay/hash";
type UiButton = CanvasUiButton & InteractiveUiButton; type BrowserParityTickWindow = Window & { __TEAR_PARITY_TICK__?: { before?(tick: number): void; after?(tick: number): void } }; export function startLiveGame(dependencies: GameRuntimeDependencies, configuration: TearWorldConfiguration<GameRuntimeDependencies["CONFIG"]>): void {
  const { A11Y, APP, Attract, Backdrop, browserDocument, browserIndexedDb, browserNavigator, browserWindow, CG, CONFIG, Cloud, DIAG, FX, GAMEPLAY_EVENTS, GFX, GHOST, Input, OVERSCAN, PAD, SAFE, SFX, THEME, UI, VAULT, applyUpgrade, clamp, cosmeticRandom, lerp, weaponCapsuleIntersectsSegment } = dependencies;
(function () {
  const browserRuntime = createLiveBrowserRuntime(dependencies);
  const { canvas, context: ctx, width: W, height: H, viewport, resizeCanvas, requestPointerLock: requestLock, installPrompt, lockHint, hint: hintEl,
    pantheonDebug: PANTHEON_DEBUG, testMode: TEST_MODE } = browserRuntime;
  let semanticInputAuthority = false; const requestOwnedPointerLock = () => { if (!semanticInputAuthority) requestLock(); };
  const ghostV3 = createBrowserGhostLiveRecorder(
    browserIndexedDb,
    createGhostV3BrowserTestOptions(TEST_MODE, browserWindow.location.search),
  );
  let ghostV3EventSequence = 0;
  // Keyframes must attest the immutable bootstrap identity the capsule saved
  // at its recording boundary.  Never rebuild a second, divergent fingerprint
  // later in the live loop.
  let ghostV3ReplayContext: GhostReplayRunContextV1 | undefined;
  GHOST.setRecordingObserver(ghostV3 === null ? null : {
    started(context) {
      ghostV3EventSequence = 0;
      ghostV3ReplayContext = undefined;
      let provenance: Readonly<Record<string, unknown>>;
      let replayContext: GhostReplayRunContextV1 | undefined;
      try {
        // Keep the replay bootstrap configuration projection identical to the
        // State Forge snapshot contract.  This executes after run installation
        // and RNG reset, but before opening-content RNG consumption.
        const configuration = liveStateForge.capture().components.get("tear.configuration.v1");
        if (configuration === undefined) throw new Error("Ghost V3 replay bootstrap lacks a configuration projection");
        replayContext = createGhostReplayRunContext({
          runId: context.runId,
          seed: context.seed,
          mode: liveRun().mode,
          difficulty: liveRun().diff,
          weaponId: liveRun().weaponId,
          ticksPerSecond: context.ticksPerSecond,
          build: {
            version: context.build.version,
            revision: context.build.revision,
            target: context.build.target,
            rulesetVersion: context.rulesetVersion,
            contentHash: stableVerificationHash(ENTITY_KIND_REGISTRY.ids),
            configHash: stableVerificationHash(configuration),
          },
          rng: worldContext.services.random.snapshot(),
        });
        provenance = Object.freeze({ ...context, [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: replayContext });
      } catch (error) {
        // Ghost V3 is an observational sidecar. A malformed optional replay
        // bootstrap must leave both Ghost 2 and the active live run untouched;
        // admission will reject this explicitly incomplete provenance later.
        provenance = Object.freeze({ ...context,
          replayContextFailure: error instanceof Error ? error.message : String(error) });
      }
      try {
        ghostV3.start({ sessionId: `ghost-v3-${context.runId}`,
          createdAt: new Date().toISOString(), provenance });
        ghostV3ReplayContext = replayContext;
        if (replayContext !== undefined) {
          // The sealed bootstrap event is queued first by GhostLiveRecorder.
          // Capture its matching state/RNG anchor before any opening-content
          // randomness or legal upgrade can mutate the live configuration.
          ghostV3.record("rng", 0, worldContext.services.random.snapshot());
          captureGhostStateSnapshot(0);
        }
      } catch (error) {
        console.warn("Ghost V3 recorder failed to start; live play continues", error);
      }
    },
    // Ghost 2/3 observe the canonical input session; run lifecycle owns its
    // start/stop boundary so non-achievement, tutorial, and playground runs
    // cannot inherit Ghost 2 recording policy.
    stopped(meta) {
      ghostV3ReplayContext = undefined;
      void ghostV3.finish(meta);
    },
  });
  GAMEPLAY_EVENTS.subscribe((event) => {
    ghostV3?.record("events", event.tick, createLiveGhostCausalEvent(event, ++ghostV3EventSequence));
  });
  function liveRun(): GameRun {
    // Menu services intentionally ask before a run exists and treat the absent
    // value as the menu state. Keep that lazy contract while reading the world
    // state owner rather than reviving a host closure.
    return hostState.run() as GameRun;
  }
  const preserveLazyValue = <T>(value: T | undefined): T => value as T;
  function liveBlade(): GameBlade {
    return preserveLazyValue(hostState.blade());
  }
  const sessionServices = createLiveSessionServices({
    dependencies, run: liveRun, player: () => player, blade: liveBlade,
    screen: () => state, setScreen: (screen) => { setState(screen); },
    achievementTracking: () => achTracks(),
    resetUi: (intent) => { if (intent.enter) enterT = 0; if (intent.focus) focus = 0; if (intent.scroll) listScroll = 0; },
    requestPointerLock: requestOwnedPointerLock, renamePrompted: () => settingsRenameAdapters.renamePrompted(),
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
    const prior = state;
    state = APP.transition(next, context);
    if (prior === "playing" && state !== "playing") Input.discardSemanticInput();
    else if (prior !== "playing" && state === "playing") Input.discardSemanticInput();
    if (prior === "playing" && state === "paused") emitRunScreenTransition("paused");
    else if (prior === "paused" && state === "playing") emitRunScreenTransition("resumed");
    return state;
  }
  const session = createLiveWorldSessionState();
  let player: GamePlayer;
  // Time dilation, camera framing (the void run pulls world zoom OUT), banner
  // and rank readouts, hit stop, slow motion, shake, the blade-throw cooldown,
  // dash ghosting, and the opening audio cadence are per-world transient
  // records owned by the world context below, not live-host closures.
  let tearBenchRunSeed: number | null = null;
  const emitRunScreenTransition = (transition: "paused" | "resumed"): void => {
    const lifecycle = RUN_LIFECYCLE.snapshot();
    if (lifecycle.sessionId === null || lifecycle.phase === "terminated") return;
    const run = liveRun();
    GAMEPLAY_EVENTS.emit({
      kind: "run", transition, runId: lifecycle.sessionId,
      mode: run.mode, difficulty: run.diff, weaponId: run.weaponId, wave: run.wave, score: run.score,
      runTimeSeconds: run.runTime,
    });
  };
  const abandonLiveRun = (reason: string, metadata: Readonly<Record<string, unknown>> = {}): void => {
    const lifecycle = RUN_LIFECYCLE.snapshot();
    if (lifecycle.sessionId === null || lifecycle.phase === "terminated") return;
    RUN_LIFECYCLE.terminate("quit");
    try {
      const run = liveRun();
      GAMEPLAY_EVENTS.emit({
        kind: "run", transition: "abandoned", runId: lifecycle.sessionId,
        mode: run.mode, difficulty: run.diff, weaponId: run.weaponId, wave: run.wave, score: run.score,
        runTimeSeconds: run.runTime, reason,
      });
      if (GHOST.recording()) GHOST.stopRec({ ...metadata, abandoned: reason });
    } finally {
      Input.stopSemanticRecording();
    }
  };
  const currentOutcome = () => {
    const outcome = session.outcome();
    if (outcome === null) throw new Error("Outcome screen requires a completed run");
    return outcome;
  };
  let uiButtons: UiButton[] = [];
  let focus = -1, lastUiState: LegacyAppScreen = state;
  let listScroll = 0;                   // scroll offset for scrollable screens
  let uiT = 0, enterT = 0, lastUiDt = 1 / 60, eIn = 1;   // menu ambient clock, time-since-screen-opened, last frame dt, entrance ease
  let uiZoom = 1;   // overlay zoom for small touch screens (draft/pause/gameover readability)
  const musicDirector = new MusicDirector(SFX);
  let continueT = 0;   // rewarded-revive countdown
  let hudHpLag = 1, hudMultPrev = 1, hudMultPop = 0;   // HUD juice: health damage-chip + combo pop
  const hoverAnim: Record<string, number> = {};
  // One call builds this world: replaceable state, entity construction, run
  // lifecycle, services, and transient records. Player and blade still use
  // host mirrors; world state is the sole owner of the run.
  const { state: hostState, context: worldContext, entities: worldEntities, lifecycle: RUN_LIFECYCLE } = createLiveWorldComposition({
    dependencies, configuration, session,
    mirrors: {
      player: (value) => { player = value; },
    },
  });
  // One world owns the transient records read by combat, State Forge, and diagnostics.
  const { transient } = worldContext; const impact = transient.impact; const openingCarry = transient.opening;
  const feel = transient.feel; const finaleIntentBatches: (readonly FinaleIntent[])[] = []; const finaleOutwardCalls: FinaleOutwardCall[] = [];
  const audioDispatchReceipts: AudioDispatchReceipt[] = []; if (__TEAR_TEST_BUILD__) SFX.observeDispatchReceipts((receipt) => { audioDispatchReceipts.push(receipt); }); const outcomeChronology = __TEAR_TEST_BUILD__ ? createOutcomeChronologyJournal() : null;
  const campaignTraining = createLiveCampaignTrainingComposition({
    dependencies, entities: worldEntities, state: hostState, lifecycle: RUN_LIFECYCLE,
    cinema: worldContext.cinema, controllers: runControllers,
    width: W, height: H, canvas, context: ctx,
    run: liveRun, player: () => player, blade: liveBlade, enemies: () => hostState.enemies(),
    projectiles: () => hostState.projectiles(),
    spawn: (kind, hpScale) => { spawnOne({ type: kind, hpScale }); const spawned = hostState.enemies(); return spawned[spawned.length - 1]; },
    resolveKill: (enemy, cause) => { liveKillRuntime.resolve(enemy, cause); },
    setScreen: (screen) => { setState(screen); }, resetScroll: () => { listScroll = 0; },
    scroll: () => listScroll, setScroll: (value) => { listScroll = value; },
    requestPointerLock: requestOwnedPointerLock, selectStage: loadStage, beginWipe: () => { Wipe.begin(); },
    resetRun: (difficulty) => { startRunWithPreflight("playground", difficulty); },
    // The tutorial runtime has already completed its training preflight. Keep
    // this handoff synchronous so a fixed-tick tutorial completion cannot sit
    // behind an unflushed Promise microtask.
    startPractice: () => { startRunImmediate("playground", "normal"); },
    applySettingsCinematicPreference: () => settings.cinematics, shakeScale: () => settingsController.shakeScale,
    getShake: () => impact.shake, setShake: (value) => { impact.shake = value; },
    getZoom: () => feel.zoom, setZoom: (value) => { feel.zoom = value; },
    getFlash: () => feel.flash, setFlash: (value) => { feel.flash = value; },
    setSlowMotion: (value) => { impact.slowMotion = value; }, setHitStop: (value) => { impact.hitStop = value; },
    setWorldZoom: (value, immediate) => { const before = Object.freeze({ current: feel.worldZoom, target: feel.worldZoomTarget }); feel.worldZoomTarget = value; if (immediate) feel.worldZoom = value; return Object.freeze({ requested: value, immediate, before, after: Object.freeze({ current: feel.worldZoom, target: feel.worldZoomTarget }) }); },
    renderMenu: (model) => { presentationScreenRenderers.pgmenu(model); },
    renderLab: (model) => { presentationScreenRenderers.pglab(model); },
    abilityColors: () => libraryAdapters.categories,
    emitMusicEvent: (name, detail) => { liveFrameRuntime.emitMusicEvent(name, detail); },
    ...(__TEAR_TEST_BUILD__ ? { observeFinaleIntents: (intents: readonly FinaleIntent[]) => { finaleIntentBatches.push(intents); }, observeFinaleOutwardCall: (call: FinaleOutwardCall) => { finaleOutwardCalls.push(call); outcomeChronology?.record({ type: "finale-outward", call }); } } : {}),
    showRank: (rank) => { feel.rankPopupSeconds = 1; feel.rankPopupText = rank; },
  });
  const { campaign: campaignHost, training: trainingHost, cinematic: cinematicHost,
    style: styleAchievementRuntime, weapon: weaponRuntime, addFloater } = campaignTraining;
  const CINEMA = worldContext.cinema;
  const { stage: stageRuntime, story, runtime: campaignRuntime } = campaignHost;
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
    dependencies, entities: worldEntities, state: hostState, lifecycle: RUN_LIFECYCLE, controllers: runControllers,
    campaign: campaignHost, training: trainingHost, weapon: weaponRuntime, music: musicDirector,
    width: W, height: H, canvas, testMode: TEST_MODE,
    run: liveRun, player: () => player, blade: liveBlade, enemies: () => hostState.enemies(),
    actorId: (enemy) => combatRuntime.id(enemy, "enemy"),
    setEnemies: (value) => { hostState.setEnemies(value); }, setProjectiles: (value) => { hostState.setProjectiles(value); },
    selectedBoss: () => session.selectedBoss(), worldServices: worldContext.services, applySettings,
    prepareWorld: () => { if (CINEMA.active) CINEMA.cancel("new-run"); story.resetFinale(); hostState.setBossIntro(null); hostState.setBossBeat(null); },
    resetTransientWorld: () => { impact.hitStop = 0; impact.shake = 0; },
    finishWorldReset: () => { transient.resetFeel(); impact.slowMotion = 0;
      openingCarry.dashGhostTime = 0; openingCarry.throwCooldown = 0; },
    resetAuthoritativeClocks: () => { simulationRuntime.reset(0); }, resetCombatIdentity: () => { combatRuntime.resetIdentity(); },
    createRunSeed: () => {
      const seed = tearBenchRunSeed;
      tearBenchRunSeed = null;
      return seed ?? dependencies.createRunSeed();
    },
    authoritativeResult: () => authoritativeStep.lastResult,
    setScreen: (screen, detail) => { setState(screen, detail); }, requestPointerLock: requestOwnedPointerLock,
    beginWipe: () => { Wipe.begin(); }, wipeRemainingSeconds: () => Wipe.remainingSeconds,
    setBannerSeconds: (value) => { feel.bannerSeconds = value; }, openTier: openRewardTier, openDraft: openRewardDraft,
    resetRewards: () => { rewardRuntime.reset(); }, saveBest, getBest, awardCoins, economyTelemetry,
    setLastRecording: (value) => { session.setLastRecording(value); },
    setLastVaultId: (value) => { session.setLastVaultId(value); },
    setOutcome: (value) => { session.setOutcome(value); }, resetWinSeconds: () => { session.setWinSeconds(0); },
    achievementTracking: () => achTracks(), achievementCheck: achCheck, achievementTracker: AT,
    emitMusicOutcome: (outcome) => { liveFrameRuntime.emitMusicEvent(outcome); },
    startRun: (mode, difficulty) => { startRunWithPreflight(mode, difficulty); },
    ...(outcomeChronology === null ? {} : { observeOutcomeChronology: outcomeChronology.record }),
  });
  const frameDriver = new RuntimeFrameDriver(browserWindow);
  type CombatSnapshot = ReturnType<typeof projectCanonicalGameplayState>; type CombatHost = ReturnType<typeof createLiveCombatComposition<CombatSnapshot>>; type CombatCompositionInput = Parameters<typeof createLiveCombatComposition<CombatSnapshot>>[0];
  const isGameProjectile = (value: unknown): value is GameProjectile => value instanceof dependencies.Projectile;
  const isSourceOwner = (value: unknown): value is GameEnemy & Parameters<typeof startVoidDescent>[0] =>
    isGameEnemy(value);   // the descent derives its actor id from presentationId/bossId
  const isRitualOwner = (value: unknown): value is GameEnemy & NonNullable<Parameters<typeof startBossTransformation>[0]> =>
    isGameEnemy(value) && "bossName" in value && typeof value.bossName === "string" &&
    "cinematicT" in value && typeof value.cinematicT === "number";
  const musicObservation = createLiveMusicObservation({ director: musicDirector, appState: () => state,
    run: () => hostState.run(), player: () => hostState.player(), enemies: () => hostState.enemies(), projectiles: () => hostState.projectiles(),
    bossIntro: () => hostState.bossIntro(), stage: () => ({ name: stageRuntime.current.name, index: stageRuntime.index }),
    totalWaves: modeWaves, waveActive: () => RUN_LIFECYCLE.isWaveActive, runPhase: () => RUN_LIFECYCLE.phase,
    topComboThreshold: () => CONFIG.trick.tiers.at(-1)?.at ?? 1 });
  const isLegacyScreen = (screen: string): screen is LegacyAppScreen =>
    ["menu", "setup", "playing", "paused", "draft", "reserve", "tierup", "settings", "continue",
      "gameover", "win", "replay", "confirmquit", "shop", "codex", "profile", "achievements",
      "leaderboards", "rename", "pgmenu", "pglab"].includes(screen);
  const combatWorldState = createLiveCombatWorldState({
    player: () => player, blade: liveBlade, run: liveRun,
    enemies: () => hostState.enemies(), setEnemies: (value) => { hostState.setEnemies(value); },
    projectiles: () => hostState.projectiles(), setProjectiles: (value) => { hostState.setProjectiles(value); },
    floaters: () => hostState.floaters(), setFloaters: (value) => { hostState.setFloaters(value); },
    slowZones: () => hostState.slowZones(), setSlowZones: (value) => { hostState.setSlowZones(value); },
    temporaryWalls: () => hostState.temporaryWalls(), setTemporaryWalls: (value) => { hostState.setTemporaryWalls(value); },
  }, transient);
  const combatActions: ReturnType<typeof createLiveCombatActions> = createLiveCombatActions({
    dependencies, canvas, width: W, bossRosterSize: BOSS_ROSTER.length,
    live: combatWorldState,
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
        startVoidDescent: (boss) => isSourceOwner(boss) && startVoidDescent(boss),
        nearestEnemy: (x, y) => { const enemy = nearestEnemy(x, y); return isGameEnemy(enemy) ? enemy : null; },
        openingNearestEnemy: () => { const blade = liveBlade(); const enemy = nearestEnemy(blade.x, blade.y); return isGameEnemy(enemy) ? enemy : null; },
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
        weaponHook: (name, detail) => { const effect = weaponHook(name, { config: CONFIG, ...detail }); return isWeaponEffect(effect) ? effect : null; },
        modHook: (name) => liveRun().mods[name], fireMod: fire,
        logWeaponEvent, weaponWorldImpact: () => { const effect = weaponHook("onWorldImpact",
          { config: CONFIG, blade: liveBlade(), player, platforms: stageRuntime.platforms, x: liveBlade().x, y: liveBlade().y });
          return isWeaponEffect(effect) ? effect : null; },
        startTransformation: (enemy, request) => isRitualOwner(enemy) && isRitualCue(request) &&
          !CINEMA.active && startBossTransformation(enemy, request),
        achievementsEnabled: achTracks,
        setBossBanner: (text, color) => { hostState.setBossBeat({ text, color, t: 1.15, dur: 1.15 }); },
        // Raw device edge in every live run (recording is passive; the authoritative
        // input only replays sealed envelopes during verification).
        consumeThrow: () => liveInputAdapter.consumeThrow(() => Input.consumeThrow()),
        weaponSegmentContact: weaponCapsuleIntersectsSegment,
        createCharger: (x, y) => worldEntities.createEnemy("charger", x, y, liveRun()),
        createReflection: (x, y) => worldEntities.createEnemy("reflection", x, y, liveRun()),
        enemyDefeated: (enemy) => {
          if (isGameEnemy(enemy) && isEnemySample(enemy)) {
            GAMEPLAY_EVENTS.emit({ kind: "death", actorId: combatRuntime.id(enemy, "enemy"), cause: "combat" });
          }
        },
        ghostSample: (seconds, living) => { GHOST.sample(seconds, player, liveBlade(),
          living.filter(isGameEnemy).filter(isEnemySample).map((enemy) => ({
            x: enemy.x, y: enemy.y, dead: enemy.dead,
            stableId: combatRuntime.id(enemy, "enemy"),
            ...(enemy._gid === undefined ? {} : { _gid: enemy._gid }),
          }))); },
        restorePlatforms: (platforms) => { stageRuntime.platforms = platforms.filter(isCombatPlatform); },
        addOverrunStack: () => { addOverrunStack(liveRun().mods); },
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
    releaseCamera: () => { feel.worldZoomTarget = 1; },
    requestContinue: () => { setState("continue"); continueT = 8; browserDocument.exitPointerLock(); },
  });
  const combatAdapterContext: CombatCompositionInput["adapters"] = {
    entities: combatActions.entities,
    opening: {
      values: () => ({ player: combatWorldState.player(), blade: combatWorldState.blade(), run: combatWorldState.run(),
        enemies: combatWorldState.enemies(), projectiles: combatWorldState.projectiles(), platforms: stageRuntime.platforms, width: W,
        blocking: CINEMA.active && CINEMA.blocksCombat, playerMode: CINEMA.playerMode,
        protection: combatWorldState.openingProtection(), lowGraphics: GFX.low,
        transformationBlocked: CINEMA.active && CINEMA.blocksCombat }),
      actions: combatActions.opening,
      readState: () => combatWorldState.openingState(),
      writeState: (value) => { combatWorldState.setOpeningState(value); },
    },
    collision: {
      values: () => ({ player: combatWorldState.player(), blade: combatWorldState.blade(), run: combatWorldState.run(), width: W }), actions: combatActions.collision,
      readState: () => ({ ...combatWorldState.collisionState(), enemies: combatWorldState.enemies(),
        projectiles: combatWorldState.projectiles(), floaters: combatWorldState.floaters() }),
      writeState(value) {
        combatWorldState.setCollisionState(value);
        combatWorldState.setEnemies(value.enemies.filter(isGameEnemy));
        combatWorldState.setProjectiles(value.projectiles.filter(isGameProjectile));
        combatWorldState.setFloaters(value.floaters.filter(isGameFloater));
      },
    },
    kill: combatActions.kill,
  };
  const liveInputAdapter = createLiveAuthoritativeInputAdapter({
    player: () => player,
    blade: liveBlade,
    aimRadius: () => CONFIG.blade.aimRadius,
  });
  // TearScore updates are snapshot-driven at 8 Hz; semantic events are emitted immediately.
  const frameContext = {
    director: musicDirector, getRun: () => projectLiveMusicRun(hostState.run()),
    readPreludeState: () => {
      const bossIntro = hostState.bossIntro(), bossBeat = hostState.bossBeat();
      return { slowMotion: impact.slowMotion, timeScale: feel.timeScale, worldZoom: feel.worldZoom,
        worldZoomTarget: feel.worldZoomTarget, zoom: feel.zoom, flash: feel.flash,
        bannerTime: feel.bannerSeconds, stageBannerSeconds: stageRuntime.bannerSeconds, rankPopTime: feel.rankPopupSeconds,
        bossIntro: bossIntro === null ? null : { delay: bossIntro.delay, t: bossIntro.t, dur: bossIntro.dur,
          boss: { introT: bossIntro.boss.introT ?? 0, dead: bossIntro.boss.dead, dying: bossIntro.boss.dying,
            hp: bossIntro.boss.hp, maxHp: bossIntro.boss.maxHp,
            ...(bossIntro.boss.isBoss === undefined ? {} : { isBoss: bossIntro.boss.isBoss }),
            ...(typeof bossIntro.boss.bossId === "string" ? { bossId: bossIntro.boss.bossId } : {}),
            phaseMarks: bossIntro.boss.phaseMarks } },
        bossBeat: bossBeat === null ? null : { t: bossBeat.t } };
    },
    writePreludeState(frameState) {
      impact.slowMotion = frameState.slowMotion; feel.timeScale = frameState.timeScale; feel.worldZoom = frameState.worldZoom;
      feel.zoom = frameState.zoom; feel.flash = frameState.flash; feel.bannerSeconds = frameState.bannerTime;
      stageRuntime.bannerSeconds = frameState.stageBannerSeconds; feel.rankPopupSeconds = frameState.rankPopTime;
      const bossIntro = hostState.bossIntro(), bossBeat = hostState.bossBeat();
      hostState.setBossIntro(commitBossIntroSnapshot(bossIntro, frameState.bossIntro));
      if (frameState.bossBeat === null) hostState.setBossBeat(null);
      else if (bossBeat !== null) hostState.setBossBeat({ ...bossBeat, t: frameState.bossBeat.t });
    },
    parrySlowScale: CONFIG.juice.parrySlowScale, cinemaActive: () => CINEMA.active,
    playgroundSlow: () => liveRun().pg.slow === true, introScale: CONFIG.bossTheater.introScale, lerp, clamp,
    timeScale: () => feel.timeScale, hitStop: () => impact.hitStop, setHitStop: (value) => { impact.hitStop = value; },
    state: () => state,
    drainActions: (tick) => {
      // Physical pointer input is sampled exactly once before being quantized
      // into the same sealed action stream used by automation and future
      // detached replay hosts.  The canonical action adapter owns the actual
      // player/blade overrides during the resulting simulation tick.
      if (!semanticInputAuthority) {
        const blade = liveBlade(); const hand = blade.handPos(player);
        const aim = blade.captureDeviceAim(hand);
        const radius = Math.max(1, CONFIG.blade.aimRadius);
        Input.semantic.setAimVector(aim.x / radius, aim.y / radius);
      }
      return Input.drainSemanticActions(tick);
    },
    recordSealedActions: (_tick, actions) => { for (const action of actions) ghostV3?.record("commands", action.tick, action); },
    ...(__TEAR_TEST_BUILD__ ? {
      beforeSimulationStep: (tick: number) => {
        const hook = (browserWindow as BrowserParityTickWindow).__TEAR_PARITY_TICK__;
        hook?.before?.(tick);
      },
    } : {}),
    afterSimulationStep: (tick: number) => {
      if (ghostV3?.active === true && tick % ghostV3.keyframeIntervalTicks === 0) {
        const random = worldContext.services.random.snapshot();
        ghostV3.record("keyframes", tick, {
          player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy, hp: player.hp, facing: player.facing },
          blade: { x: liveBlade().x, y: liveBlade().y, vx: liveBlade().vx, vy: liveBlade().vy, state: liveBlade().state },
          enemies: hostState.enemies().filter((enemy) => !enemy.dead).map((enemy) => ({
            id: enemy._gid, kind: enemy.kind, x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy, hp: enemy.hp,
          })),
          random,
        });
        ghostV3.record("rng", tick, random);
        captureGhostStateSnapshot(tick);
      }
      if (__TEAR_TEST_BUILD__) {
        const hook = (browserWindow as BrowserParityTickWindow).__TEAR_PARITY_TICK__;
        hook?.after?.(tick);
      }
    },
    clearSimulationInput: () => { liveInputAdapter.clear(); },
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
    input: Input, pad: typeof PAD === "undefined" ? null : PAD, navigator: browserNavigator, document: browserDocument, canvas,
    cinema: CINEMA, clipper: dependencies.Clipper ?? null,
    autoPauseDisconnect: () => settings.autoPauseDisconnect, requestPointerLock: requestOwnedPointerLock,
    exitReplay: () => { replayAdapters.exit(); },
    advanceClocks: (dt, currentState) => {
      uiT += dt; enterT += dt; lastUiDt = dt;
      session.setWinSeconds(currentState === "win" ? session.winSeconds() + dt : 0);
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
    entityCounts: () => ({ enemies: hostState.enemies().length, projectiles: hostState.projectiles().length, effects: FX.list.length }),
  } satisfies CombatCompositionInput["coordinator"];
  const combatHost: CombatHost = createLiveCombatComposition({
    frameDriver, gameplayEvents: GAMEPLAY_EVENTS, adapters: combatAdapterContext,
    lifecycle: {
      advanceClock: (dt) => { worldContext.services.clock.advance(dt); },
      captureProtection: () => { transient.assignProtection(story.protection()); },
      applyProtection: () => { story.applyProtection(transient.protection); },
    },
    frame: frameContext, coordinator: coordinatorContext,
    authoritative: {
      actionPort: liveInputAdapter.actionPort,
      snapshot: (tick, input) => projectCanonicalGameplayState(tick, input.snapshot(), liveRun(), player, liveBlade(),
        hostState.enemies().map((enemy) => ({
          ...(typeof enemy._gid === "number" ? { _gid: enemy._gid } : {}), kind: enemy.kind, bossId: enemy.bossId,
          x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy, hp: enemy.hp, dead: enemy.dead,
        }))),
    },
  });
  const { simulationRuntime, simulation, combatEntityRuntime: combatRuntime,
    killRuntime: liveKillRuntime, frameRuntime: liveFrameRuntime, authoritativeStep } = combatHost;
  // Native facts emitted from run/content code predate the simulation runtime
  // composition.  Bind their tick source once the shared runtime exists so all
  // live events use the canonical clock rather than input-recorder timing.
  GAMEPLAY_EVENTS.setTickSource(() => simulationRuntime.scheduler.tick);
  const stateForgeRuntime = createLiveStateForgeRuntimeBridge({
    captureTransient: () => ({ hitStop: impact.hitStop, shake: impact.shake, timeScale: feel.timeScale, slowmo: impact.slowMotion, zoom: feel.zoom, flash: feel.flash, bannerT: feel.bannerSeconds, dashGhostT: openingCarry.dashGhostTime, landingV: openingCarry.landingVelocity, wasDashing: openingCarry.wasDashing, wasSwinging: openingCarry.wasSwinging, wasOnGround: openingCarry.wasOnGround, worldZoom: feel.worldZoom, worldZoomTarget: feel.worldZoomTarget, throwCd: openingCarry.throwCooldown, rankPopT: feel.rankPopupSeconds, rankPopText: feel.rankPopupText }),
    restoreTransient: (snapshot) => { transient.assignImpact({ hitStop: Number(snapshot.hitStop), slowMotion: Number(snapshot.slowmo), shake: Number(snapshot.shake) }); transient.assignOpening({ throwCooldown: Number(snapshot.throwCd), dashGhostTime: Number(snapshot.dashGhostT), landingVelocity: Number(snapshot.landingV), wasDashing: Boolean(snapshot.wasDashing), wasSwinging: Boolean(snapshot.wasSwinging), wasOnGround: Boolean(snapshot.wasOnGround) }); feel.timeScale = Number(snapshot.timeScale); feel.zoom = Number(snapshot.zoom); feel.flash = Number(snapshot.flash); feel.bannerSeconds = Number(snapshot.bannerT); feel.worldZoom = Number(snapshot.worldZoom); feel.worldZoomTarget = Number(snapshot.worldZoomTarget); feel.rankPopupSeconds = Number(snapshot.rankPopT); feel.rankPopupText = String(snapshot.rankPopText); },
    captureLifecycle: RUN_LIFECYCLE.snapshot.bind(RUN_LIFECYCLE), restoreLifecycle: RUN_LIFECYCLE.restore.bind(RUN_LIFECYCLE),
    captureChapterBinding: story.captureChapterBinding.bind(story), stageChapterBinding: campaignRuntime.stageChapterBinding, installChapterBinding: campaignRuntime.installChapterBinding,
    captureCinemaProtection: story.protection.bind(story), restoreCinemaProtection: story.applyProtection.bind(story),
    captureStageBanner: () => ({ name: stageRuntime.name, seconds: stageRuntime.bannerSeconds }), restoreStageBanner: stageRuntime.restoreBanner.bind(stageRuntime), cinema: CINEMA,
  });
  const liveStateForge = createLiveStateForgeAdapter({
    dependencies, entities: worldEntities, worldServices: worldContext.services, state: hostState, actorId: (entity, prefix) => combatRuntime.id(entity, prefix), bindActorId: (entity, id) => { combatRuntime.bindId(entity, id); },
    platforms: () => stageRuntime.platforms, stageIndex: () => stageRuntime.index, restoreStageIndex: (index) => { stageRuntime.restoreIndex(index); }, replacePlatforms: (values) => { stageRuntime.platforms.splice(0, stageRuntime.platforms.length, ...values); }, slowZones: () => hostState.slowZones(), walls: () => hostState.temporaryWalls(),
    screen: () => state, setScreen: (screen) => { if (!isLegacyScreen(screen)) throw new RangeError(`invalid restored screen: ${screen}`); setState(screen); }, focus: () => focus, setFocus: (value) => { focus = value; },
    tick: () => simulation.tick, setTick: (tick) => { simulationRuntime.reset(tick); }, clearInputProjection: () => { liveInputAdapter.clear(); },
    reward: rewardRuntime.snapshot, restoreReward: rewardRuntime.restore, captureGhost: () => GHOST.captureRuntimeState(), restoreGhost: (snapshot) => { GHOST.restoreRuntimeState(snapshot); }, captureIdentityState: () => combatRuntime.captureIdentityState(), restoreIdentityState: (snapshot) => { combatRuntime.restoreIdentityState(snapshot); },
    runtimeState: stateForgeRuntime.capture, restoreRuntimeState: stateForgeRuntime.restore,
    captureCinema: () => CINEMA.captureState(),
    validateCinema: stateForgeRuntime.validate,
  });
  const ghostSnapshotRegistry = createDefaultStateCodecRegistry();
  const captureGhostStateSnapshot = (tick: number): void => {
    const recorder = ghostV3;
    if (recorder?.active !== true) return;
    const replayContext = ghostV3ReplayContext;
    if (replayContext === undefined) {
      // A keyframe without the immutable bootstrap fingerprint could look
      // replayable while actually describing a different world.  Preserve the
      // live run and record explicit degradation instead of manufacturing one.
      recorder.record("events", tick, {
        type: "ghost.snapshot-degraded",
        reason: "immutable Ghost V3 replay bootstrap context is unavailable",
      });
      return;
    }
    try {
      recorder.record("keyframes", tick, captureLiveStateForgeSnapshot({
        id: `ghost-v3-${String(liveRun().runSeed)}-keyframe-${String(tick)}`, tick, stateClass: "recorded-canonical",
        seed: String(liveRun().runSeed), stateForge: liveStateForge, rng: worldContext.services.random.snapshot(), registry: ghostSnapshotRegistry,
        observationClass: "structured-state", producer: "ghost-v3-live-recorder", target: replayContext.build.target,
        contentHash: replayContext.build.contentHash, staticBuild: replayContext.build,
        sourceId: ghostLiveBootstrapEventId(`ghost-v3-${replayContext.run.id}`),
        visualHash: stableVerificationHash({ tick, player: { x: player.x, y: player.y, facing: player.facing }, blade: { x: liveBlade().x, y: liveBlade().y, state: liveBlade().state } }),
        actor: "human", executionClass: "engineering", trainingConsent: "no-training",
      }));
    } catch (error) {
      // Recording may degrade, but a storage/snapshot problem must never halt a live run.
      recorder.record("events", tick, { type: "ghost.snapshot-degraded", reason: error instanceof Error ? error.message : String(error) });
    }
  };
  // full-screen rect INCLUDING the fullscreen overscan bleed â€” use for any fill that
  // must reach the true screen edges (backdrops, dims, vignettes), never for layout.
  const screenRect = () => presentationHost.screenRectangle();
  const biomeMode = () => ["campaign", "endless", "bossonly", "gauntlet", "tutorial", "playground"].includes(liveRun().mode);
  let shopCoinShow: number | null = null;
  let shopFlash: Readonly<{ id: string; time: number }> | null = null;
  const interfaceComposition = createLiveInterfaceComposition({
    wipe: { canvas, context: ctx, createCanvas: () => browserDocument.createElement("canvas"), reducedEffects: () => GFX.low, flashScale: () => A11Y.flashScale, random: cosmeticRandom, ease: ez },
    worldSurface: { canvas: ctx, ui: UI, width: W, height: H, get safe() { return { top: SAFE.t, right: SAFE.r, bottom: SAFE.b, left: SAFE.l }; }, get ink() { return THEME.ink; }, get darkTheme() { return THEME.dark; }, get timeSeconds() { return worldContext.services.clock.seconds(); }, get lowGraphics() { return GFX.low; }, get reducedMotion() { return A11Y.reducedMotion; }, get highContrast() { return A11Y.highContrast; } },
    screens: {
      renderer: { canvas: ctx, ui: UI, width: W, height: H, screenRectangle: screenRect, safeInsets: () => SAFE, time: () => uiT, enterAmount: () => eIn, enterSeconds: () => enterT, deltaSeconds: () => lastUiDt, mouse: () => ({ x: Input.mouseX, y: Input.mouseY }), scroll: () => listScroll, focus: () => focus, touch: () => Input.touchActive(), reducedMotion: () => A11Y.reducedMotion, enqueue: (button) => { uiButtons.push(button); } },
      replay: { dependencies, canvas: ctx, width: W, height: H, screenRectangle: screenRect, time: () => uiT, deltaSeconds: () => lastUiDt, fallbackPlayer: () => player, bossById, setScreen: (screen, context) => setState(screen, context), formatTime: fmtTime, document: browserDocument },
      library: { dependencies, canvas: ctx, height: H, time: () => uiT, enterSeconds: () => enterT, scroll: () => listScroll, setScroll: (value) => { listScroll = value; }, clamp, ease: ez, formatTime: fmtTime, getBest },
      settings: { dependencies, document: browserDocument, window: browserWindow, canvas, width: W, overscan: () => OVERSCAN, screen: () => state, setScreen: (screen, context) => setState(screen, context), settingsController, settings, scroll: () => listScroll, setScroll: (value) => { listScroll = value; }, clamp, installPrompt },
      actions: { setScreen: (screen) => { setState(screen); }, resetScroll: () => { listScroll = 0; }, setSetupSelection: (kind, id) => { if (kind === "mode" && isRunModeSelection(id)) { session.setSelectedMode(id); if (trainingRunRequiresPreflight(id)) void trainingHost.ensureLoaded(); } else if (kind === "difficulty" && isRunDifficultySelection(id)) session.setSelectedDifficulty(id); else if (kind === "weapon") session.setSelectedWeapon(id); else if (kind === "boss") session.setSelectedBoss(id); }, startSelectedRun: () => { startRunWithPreflight(session.selectedMode(), session.selectedDifficulty()); }, startRun: (mode, difficulty) => { if (isRunModeSelection(mode) && isRunDifficultySelection(difficulty)) startRunWithPreflight(mode, difficulty); }, currentRun: liveRun, resumeFinale: resumeSavedFinale, claimFinale: claimSavedFinale, requestPointer: requestLock, endRun, retryRun, lastReplay: () => session.lastRecording(), campaignDifficulty: () => session.outcome()?.diff ?? "normal", resetSettings: () => { settingsController.reset(); }, signIn: () => { void Cloud.signIn(); }, signOut: () => { void Cloud.signOut(); }, pinReplay: (id, pinned) => VAULT.pin(id, pinned), deleteReplay: (id) => { VAULT.remove(id); }, dispatchPlayground: dispatchPlaygroundAction },
      runState: { screen: () => state, setScreen: (screen) => { setState(screen); }, run: liveRun, player: () => player, scroll: () => listScroll, setScroll: (value) => { listScroll = value; }, continueSeconds: () => continueT, setContinueSeconds: (value) => { continueT = value; }, replayAvailable: () => session.lastRecording() !== null, outcome: currentOutcome },
      runServices: { dependencies, reward: rewardRuntime, formatTime: fmtTime, clamp, trickColor, saveBest, awardCoins, cinema: CINEMA, clearFinale: () => { story.finale = null; }, terminateRun: (reason) => { abandonLiveRun(reason); }, addFloater, addShake, addFlash, requestPointer: requestLock },
      menuState: { selection: () => session.selection(), scroll: () => listScroll, setScroll: (value) => { listScroll = value; }, time: () => uiT, shop: () => ({ displayedCoins: shopCoinShow, flash: shopFlash }), setShop: (value) => { shopCoinShow = value.displayedCoins; shopFlash = value.flash; } },
      menuServices: { dependencies, height: H, getBest, formatTime: fmtTime, clamp, checkAchievements: achCheck }, playground: { renderMenu: renderPgMenu, renderLab: renderPgLab },
    },
    frameState: { screen: () => state, previousScreen: () => lastUiState, setPreviousScreen: (value) => { lastUiState = value; }, uiZoom: () => uiZoom, setUiZoom: (value) => { uiZoom = value; Input.uiZoom = value; }, deltaSeconds: () => lastUiDt, enterSeconds: () => enterT, setEnterSeconds: (value) => { enterT = value; }, enterAmount: () => eIn, setEnterAmount: (value) => { eIn = value; }, scroll: () => listScroll, setScroll: (value) => { listScroll = value; }, focus: () => focus, setFocus: (value) => { focus = value; }, controls: () => uiButtons, resetControls: () => { uiButtons = []; }, biomeMode, enemies: () => hostState.enemies(), flash: () => feel.flash, bossBeat: () => hostState.bossBeat(), bossIntroActive: () => { const intro = hostState.bossIntro(); return intro !== null && intro.delay <= 0; }, bannerSeconds: () => feel.bannerSeconds, rankPopup: () => ({ seconds: feel.rankPopupSeconds, text: feel.rankPopupText, multiplier: liveRun().mult }), timeSeconds: () => uiT },
    frameServices: { canvas, context: ctx, width: W, height: H, overscan: () => OVERSCAN, safeTop: () => SAFE.t, viewportScale: () => viewport.cssPerLogicalPixel, resize: resizeCanvas, input: Input, ui: UI, stage: stageRuntime, cinema: CINEMA, reducedMotion: () => A11Y.reducedMotion, flashScale: () => A11Y.flashScale, touchActive: () => Input.touchActive(), controller: () => ({ active: PAD.active, toastSeconds: PAD.toastT, toastText: PAD.toastText }), pointerLocked: () => Input.locked, lockHint, inputHint: hintEl, clamp, ease: ez, blendColor: blendCol, setTheme: (background, playLike) => { THEME.set(playLike && biomeMode() ? background : "#ffffff"); UI.ink = THEME.ink; }, themeInk: () => THEME.ink, backdropPost: (context, stage, camera) => { Backdrop.post(context, stage, camera); }, drawMenuAttract: () => { Attract.draw(ctx); }, renderScreen: (screen) => { renderRegisteredScreen(screen, interfaceComposition.screens.renderers); }, isMenuScreen, playInterfaceSound: () => { SFX.ui(); }, hoverAnimation: hoverAnim, trickColor },
    worldState: { run: liveRun, player: () => player, blade: liveBlade, enemies: () => hostState.enemies(), projectiles: () => hostState.projectiles(), floaters: () => hostState.floaters(), slowZones: () => hostState.slowZones(), temporaryWalls: () => hostState.temporaryWalls(), screen: () => state, zoom: () => feel.zoom, shake: () => impact.shake, lastUiDelta: () => lastUiDt, bannerSeconds: () => feel.bannerSeconds, bossIntro: () => hostState.bossIntro(), hud: () => ({ lagHp: hudHpLag, multiplier: hudMultPrev, multiplierPop: hudMultPop }), setHud(value) { hudHpLag = value.lagHp; hudMultPrev = value.multiplier; hudMultPop = value.multiplierPop; } },
    worldServices: { dependencies, canvas: ctx, width: W, height: H, debug: PANTHEON_DEBUG, stage: stageRuntime, tutorial: TUT, finale: () => story.finale, formatTime: fmtTime, trickColor, ease: ez }, onBiomeTransition: (begin) => { Attract.onBiomeChange = begin; },
  });
  const { wipe: Wipe, frame: presentationHost, screens: screenComposition } = interfaceComposition;
  const { library: libraryAdapters, replay: replayAdapters, settings: settingsRenameAdapters, modelRenderers: presentationScreenRenderers } = screenComposition;
  if (__TEAR_TEST_BUILD__ && TEST_MODE) void import("../tearbench/browser/live-runtime-bridge").then(({ installGhostV3BrowserInspector, installLiveTearRuntimeBridge }) => {
    installGhostV3BrowserInspector(browserWindow, {
      manifest: () => ghostV3?.lastManifest ?? null,
      manifests: () => listBrowserGhostCapsuleManifests(browserIndexedDb),
      read: (id: string) => readBrowserGhostCapsule(browserIndexedDb, id),
      replay: (id: string) => readBrowserGhostCapsuleReplay(browserIndexedDb, id),
      admission: (id: string) => readBrowserGhostCapsuleReplayAdmission(browserIndexedDb, id),
      active: () => ghostV3?.active === true,
      failure: () => ghostV3?.failure ?? null,
    });
    const consumedActions: CommandEnvelope<GameAction>[] = [];
    Input.semantic.subscribe((entry) => { consumedActions.push(entry); });
    const actionRouting = { screen: () => state, setScreen: (screen: "playing" | "paused") => { setState(screen); },
      runMode: () => liveRun().mode, reward: rewardRuntime.snapshot, chooseUpgrade: screenComposition.chooseUpgrade, chooseReserve: screenComposition.chooseReserve,
      chooseTier: screenComposition.chooseTier, dispatchPlayground: dispatchPlaygroundAction, renderControls: () => { presentationHost.render(); }, controls: () => uiButtons, focus: () => focus,
    };
    installLiveTearRuntimeBridge({
      width: W, height: H, state: hostState, actorId: (enemy) => combatRuntime.id(enemy, "enemy"), platforms: () => stageRuntime.platforms,
      platformsForStage: (index) => dependencies.stagePlatforms(index, CONFIG),
      stage: () => ({ ...stageRuntime.current, index: stageRuntime.index }), lifecycle: () => RUN_LIFECYCLE.snapshot(), bossIntroActive: () => hostState.bossIntro() !== null,
      choiceIds: () => liveRewardChoiceIds(actionRouting), progression: () => ({ wallet: dependencies.META.coins(), lifetimeEarned: dependencies.META.data.lifetimeEarned, levels: Object.fromEntries(dependencies.SHOP.map((item) => [item.id, dependencies.META.level(item.id)])), shop: dependencies.SHOP.map((item) => ({ id: item.id, level: dependencies.META.level(item.id), maxLevel: item.maxLevel, cost: dependencies.META.cost(item), enabled: dependencies.META.canBuy(item) })) }), outcome: () => session.outcome(), screen: () => state,
      setScreen: (screen) => { setState(screen); }, selectBoss: (bossId) => { session.setSelectedBoss(bossId); },
      selectWeapon: (weaponId) => { hostState.setSelectedWeapon(weaponId); },
      setRunSeed: (seed) => { tearBenchRunSeed = seed; }, startRun: (mode, difficulty) => { startRunImmediate(mode, difficulty); },
      stopFrameLoop: () => { frameDriver.stop(); }, startFrameLoop: () => { frameDriver.start(({ deltaSeconds }) => { combatHost.frameCoordinator.run(deltaSeconds); }); }, pushAction: (action) => { Input.semantic.push(action); },
      setSemanticInputAuthority: (active) => { semanticInputAuthority = active; },
      routeAction: (action) => routeLiveTearBenchAction(actionRouting, action), skipCinematic: () => { CINEMA.requestSkip(); },
      activateControl: (action) => { presentationHost.render(); const encoded = JSON.stringify(action); const control = uiButtons.find((entry) => entry.enabled !== false && JSON.stringify(entry.semanticAction) === encoded); if (control === undefined) return false; screenComposition.dispatch(action); return true; },
      terminateRun: () => { abandonLiveRun("tearbench-terminated", { tearBenchTerminated: true }); setState("paused"); },
      resetSemanticInput: () => { Input.startSemanticRecording(); },
      advanceFixedTick: () => liveFrameRuntime.advanceExactSimulation(),
      advanceRenderFrame: (deltaSeconds) => liveFrameRuntime.advanceSimulation(deltaSeconds), advanceApplicationFrame: (deltaSeconds) => { combatHost.frameCoordinator.run(deltaSeconds); },
      authoritative: () => authoritativeStep.lastResult, random: () => worldContext.services.random.snapshot(),
      render: () => { presentationHost.render(); }, screenshot: () => canvas.toDataURL("image/png"),
      subscribeEngineEvent: (listener) => GAMEPLAY_EVENTS.subscribe(listener),
      drainConsumedActions: () => consumedActions.splice(0, consumedActions.length),
      emitPhysicalInput: (input) => { emitLiveTearBenchPhysicalInput(input, { window: browserWindow, canvas, width: W, height: H }); },
      setTimeEffectsForTest: (effects) => { if (effects.hitStop !== undefined) impact.hitStop = effects.hitStop; if (effects.slowMotion !== undefined) impact.slowMotion = effects.slowMotion; if (effects.timeScale !== undefined) feel.timeScale = effects.timeScale; },
      stateForge: liveStateForge, replayProgression: (ledger) => replayLiveStateForgeProgression({ dependencies, state: hostState, configuration }, ledger), loadStage: runControllers.api.loadStage, startNextWave: runControllers.api.startNextWave, applyBossFinisher: (bossId, remainingHp) => { const matches = hostState.enemies().filter((enemy) => enemy.isBoss && enemy.bossId === bossId && !enemy.dead && !enemy.dying); if (matches.length !== 1 || matches[0] === undefined) throw new Error(`boss-finisher requires exactly one live ${bossId}`); matches[0].hp = remainingHp; matches[0].hpDisplay = remainingHp; }, captureProgressionRuntime: () => liveRun().mods, restoreProgressionRuntime: (runtime) => { const run = liveRun(); run.mods = runtime as typeof run.mods; }, finaleIntents: () => finaleIntentBatches, finaleOutwardCalls: () => finaleOutwardCalls, audioDispatchReceipts: () => audioDispatchReceipts, outcomeChronology: () => outcomeChronology?.entries() ?? [],
    }, browserWindow);
  });
  if (__TEAR_TEST_BUILD__ && PANTHEON_DEBUG) void import("./live-debug-composition").then(({ installLiveGameDebug }) => {
    installLiveGameDebug({
      enabled: PANTHEON_DEBUG, dependencies, entities: worldEntities, state: hostState, lifecycle: RUN_LIFECYCLE, cinema: CINEMA, stage: stageRuntime, width: W, height: H,
      startRun: (mode, difficulty) => { startRunWithPreflight(mode, difficulty); }, setScreen: setState, screen: () => state, setContinueSeconds: (value) => { continueT = value; },
      openDraft: openRewardDraft, openTier: openRewardTier, run: liveRun, player: () => player, blade: liveBlade, applyUpgrade, enterReplay: (record, from) => { replayAdapters.enter(record, from); },
      beginRename: () => { settingsRenameAdapters.beginRename(false, true); }, renameSnapshot: settingsRenameAdapters.renameSnapshot, selectSettingsTab: settingsRenameAdapters.selectSettingsTab,
      replayStatus: replayAdapters.status, applyOptions: (options) => { Object.assign(settings, options); applySettings(); }, settings, selected: () => session.selection(),
      tutorialSnapshot: () => ({ active: TUT.active, lessonIndex: TUT.idx, lessonCount: TUT.steps.length, lesson: TUT.step().t, description: TUT.step().d,
        arena: TUT.step().arena, arenaLabel: TUT.step().arenaLabel, teachingFocus: TUT.step().teachingFocus,
        completionDelay: TUT.doneT, endingTime: TUT.endT, counters: { ...TUT.n } }),
      selectBoss: (boss) => { session.setSelectedBoss(boss); }, chapterBrief: () => Boolean(story.chapterFlow?.brief), finale: () => story.finale, rewardSnapshot: rewardRuntime.snapshot,
      authoritative: () => authoritativeStep.lastResult, startFinale: startAdventureFinale, severFinale: () => severFinaleAnchor(false),
    });
  });
  combatHost.startFrameLoop();
})();
}

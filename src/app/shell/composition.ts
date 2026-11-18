import { COSMETIC_CATALOG } from "../../gameplay/progression/cosmetic-catalog";
import { createLiveTutorialCompletionPersistence } from "../progress/tutorial-completion-persistence";
import { createLivePracticeEncounterPersistence } from "../progress/practice-encounter-persistence";
import { createLegacySynthFacade } from "../../audio/legacy-synth";
import { createBrowserAudioContextHandoff } from "../../audio/audio-context-handoff";
import { A11Y, CONFIG, GFX, OVERSCAN, REMOTE, SAFE, THEME } from "../../config/game-config";
import {
  aabbOverlap,
  clamp,
  len,
  lerp,
  lerpAngle,
  segCircle,
  segPointDist,
  segSegmentDist,
} from "../../domain/geometry";
import { AFFIXES, PRESETS, applyPreset, rollAffixes } from "../../gameplay/affixes";
import { createAchievements } from "../../gameplay/progression/achievements";
import { createDailyChallenges, localCalendarClock } from "../../gameplay/progression/challenges";
import { TearGameplayEventBus } from "../../gameplay/runtime/gameplay-events";
import { createTearWorldBootstrap } from "../../gameplay/runtime/tear-world-bootstrap";
import { createMetaProgression, type ProgressionApplyContext } from "../../gameplay/progression/meta";
import { PLAYGROUND_STAGES, STAGES, stageAt, stagePlatforms } from "../../gameplay/stages";
import {
  UPGRADES,
  applyUpgrade,
  newMods,
  nextTierDesc,
  rollUpgrades,
  tierUp,
  type UpgradeApplyContext,
  type UpgradeDefinition,
} from "../../gameplay/upgrades";
import { VARIANTS, applyVariant, rollVariant } from "../../gameplay/variants";
import { VoidGen } from "../../gameplay/voidgen";
import { WEAPONS, applyWeapon, getWeapon } from "../../gameplay/weapons";
import { createLegacyInputCompatibility } from "../../input/legacy-compat";
import { createBrowserGamepad } from "../../input/browser-gamepad";
import { createBrowserInput } from "../../input/browser-input";
import { createProfileStore } from "../../persistence/profile-store";
import type { CloudFactory } from "../../platform/cloud-factory";
import type { TearBuildTarget } from "../../platform/contracts";
import type { CrazyGamesSdkShape, createCrazyGamesPlatformServices } from "../../platform/crazygames";
import { createLegacyPlatformCompatibility } from "../../platform/legacy-compat";
import { createRunSeed } from "../../platform/run-seed";
import type { PwaUpdateCapability } from "../../platform/pwa-update";
import { GHOST_WORKER_URLS } from "../replay/ghost-worker-urls";
import { startWorkerCacheWarmup } from "../../platform/worker-cache-warmup";
import { createAttract } from "../../presentation/attract";
import { createBackdrop } from "../../presentation/backdrop";
import { rotateGateShown } from "../../presentation/render-pipeline";
import { createSceneLibrary } from "../../presentation/scenes/scene-library";
import { lastCoverFrameTally } from "../../presentation/music-cover-art";
import { createSceneCanvas, loadSceneBitmap, releaseSceneBitmap } from "../../presentation/scenes/scene-bitmap";
import { SCENE_PACKAGES } from "../../presentation/scenes/scene-registry";
import { createCinematics } from "../../presentation/cinematics";
import { cosmeticRandom } from "../../presentation/cosmetic-random";
import { createCosmeticEmissionRandom } from "../../domain/cosmetic-emission-random";
import { createLiveAttractFeedback } from "../interface/attract-feedback";
import { createParticleSystem } from "../../presentation/particles";
import { createUi } from "../../presentation/ui";
import { createLegacyReplayCompatibility } from "../../replay/legacy-compat";
import { CURRENT_RULESET_VERSION } from "../../gameplay/run/ruleset-version";
import { PerformanceMonitor } from "../../diagnostics/performance-monitor";
import { createTearTestEnvironment } from "../../tearbench/test-support";
import { AppStateController } from "../interface/app-state-controller";
import { createLiveAchievementToastPersistence } from "../progress/achievement-toast-persistence";
import { createLiveBiomeProgressPersistence } from "../progress/biome-progress-persistence";
import { createLivePendingFinalePersistence } from "../progress/pending-finale-persistence";
import { createLiveOutcomeDefeatProgressPersistence } from "../progress/outcome-defeat-progress-persistence";
import { createLiveProfileStatsPersistence } from "../progress/profile-stats-persistence";
import { createLiveShopPurchaseProgressPersistence } from "../progress/shop-purchase-progress-persistence";
import { createLiveVictoryProfileProgressPersistence } from "../progress/victory-profile-progress-persistence";
import { createLiveStyleAchievementPersistence } from "../progress/style-achievement-persistence";
import { createLivePlatformBootstrapPersistence } from "../progress/platform-bootstrap-persistence";
import { createTearWorldSimulationFactories } from "../../gameplay/runtime/tear-world-simulation-factories";
import { createLiveWorldSimulationPresentationAdapter } from "../world/world-simulation-factories";
import { startLiveGame } from "./game-runtime";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { SurfaceAvailability } from "../../domain/surface-availability";
import type { EngineeringQuery } from "./engineering-query";

export interface TearCompositionOptions {
  readonly target: TearBuildTarget;
  readonly sdk?: CrazyGamesSdkShape;
  readonly createCrazyGamesServices?: typeof createCrazyGamesPlatformServices;
  readonly createCloud: CloudFactory;
  readonly pwaUpdate: PwaUpdateCapability;
  /** An explicit browser storage capability is used only by isolated test builds. */
  readonly browserIndexedDb?: IDBFactory;
  /** The build's release/engineering surface policy, resolved once by the entrypoint bootstrap. */
  readonly surfaces: SurfaceAvailability;
  /** Engineering query parameters admitted by `surfaces`; empty in release builds. */
  readonly engineeringQuery: EngineeringQuery;
}

interface CompositionWindow extends Window {
  readonly Clipper?: Readonly<{ start(): void; stop(): void }>;
  readonly __TEAR_TEST_STORAGE__?: Readonly<Record<string, string>>;
  __TEAR_CATALOG_DEBUG__?: object;
}

/**
 * The real application composition root. Target adapters are passed from their
 * entrypoint so standalone builds do not import the CrazyGames implementation.
 *
 * Test-build-only code is reached only behind `__TEAR_TEST_BUILD__`, so a
 * release build's bundle contains none of it.
 */
export function composeTearApplication(options: TearCompositionOptions): void {
  const {
    target,
    sdk,
    createCrazyGamesServices,
    createCloud,
    pwaUpdate,
    browserIndexedDb = window.indexedDB,
    surfaces,
    engineeringQuery,
  } = options;
  const compositionWindow = window as CompositionWindow;
  // Test storage seeding stays test-build-only even where `vite dev` admits engineering surfaces.
  const tearTestMode = __TEAR_TEST_BUILD__ && engineeringQuery.get("test") === "1";
  // Test pages may seed the isolated adapter before composition. Production never
  // reads this value and continues to use the platform's real storage adapter.
  const disposableValues = new Map<string, string>(
    tearTestMode ? Object.entries(compositionWindow.__TEAR_TEST_STORAGE__ ?? {}) : [],
  );
  const tearTestEnvironment = tearTestMode ? createTearTestEnvironment("live-test-composition") : undefined;
  const disposableStorage = tearTestMode
    ? {
        getItem: (key: string) => disposableValues.get(key) ?? null,
        setItem: (key: string, value: string) => {
          disposableValues.set(key, value);
        },
        removeItem: (key: string) => {
          disposableValues.delete(key);
        },
      }
    : undefined;
  // Optional capture tooling is a development adapter, never a production
  // gameplay dependency or shared writable global.
  const clipper = import.meta.env.DEV ? compositionWindow.Clipper : undefined;
  // These data-only services are created before any world constructor captures
  // them. The bootstrap deliberately leaves all presentation adapters outside.
  const { configuration: worldConfiguration, clock: CLOCK, random } = createTearWorldBootstrap(CONFIG);
  const worldConfig = worldConfiguration.value;
  const audioContextHandoff = createBrowserAudioContextHandoff();
  const SFX = createLegacySynthFacade({ audioContextHandoff });
  const cosmeticEmissionRandom = createCosmeticEmissionRandom();
  const FX = createParticleSystem({
    effects: worldConfig.effects,
    lowGraphics: () => GFX.low,
    reducedMotion: () => A11Y.reducedMotion,
    random: cosmeticEmissionRandom.next,
  });
  const Scenes = createSceneLibrary({
    packages: SCENE_PACKAGES,
    loadImage: loadSceneBitmap,
    createCanvas: createSceneCanvas,
    releaseImage: releaseSceneBitmap,
    now: () => performance.now(),
    lowGraphics: () => GFX.low,
    reducedMotion: () => A11Y.reducedMotion,
    onError: (stageId, error) => {
      console.warn(`Scene package for ${stageId} unavailable; keeping procedural art.`, error);
    },
  });
  const Backdrop = createBackdrop({
    clock: CLOCK,
    config: worldConfig,
    graphics: GFX,
    accessibility: A11Y,
    overscan: OVERSCAN,
    theme: THEME,
    createCanvas: () => document.createElement("canvas"),
    performance,
  });
  const Cinematics = createCinematics({ presentation: worldConfig.presentation });
  const { streams: GAME_RANDOM_STREAMS, service: GAME_RANDOM } = random;
  const { Input, PAD } = createLegacyInputCompatibility(
    { config: worldConfig, safeArea: SAFE, overscan: OVERSCAN, window, document, navigator, performance },
    { createInput: createBrowserInput, createGamepad: createBrowserGamepad },
  );
  const UI = createUi({
    CLOCK,
    presentation: { view: worldConfig.view, colors: worldConfig.colors, overscan: OVERSCAN },
    Input,
    clamp,
    controllerGlyph: (buttonIndex) => PAD.glyph(buttonIndex),
  });
  // Remembered text layouts were measured with the faces loaded at the time.
  document.fonts.addEventListener("loadingdone", () => {
    UI.clearTextLayouts();
  });
  // One world's entity constructors. The factory takes the mutable world
  // services explicitly, so a second world can be built without a second
  // composition root; the live application still builds exactly one.
  const presentation = createLiveWorldSimulationPresentationAdapter({
    clock: CLOCK,
    effects: FX,
    ui: UI,
    configuration: { accessibility: A11Y, config: worldConfig, graphics: GFX, theme: THEME },
    geometry: { clamp, len, lerp },
    cosmeticRandom: cosmeticEmissionRandom.next,
  });
  const { Blade, Player, Projectile, enemyTypes, mirrorTypes } = createTearWorldSimulationFactories({
    clock: CLOCK,
    config: worldConfig,
    graphics: GFX,
    effects: FX,
    sound: SFX,
    input: Input,
    random: { enemyAi: GAME_RANDOM_STREAMS.stream("enemy-ai"), boss: GAME_RANDOM_STREAMS.stream("boss") },
    presentation,
    geometry: { aabbOverlap, clamp, len, lerp, lerpAngle, segPointDist, segSegmentDist },
    cosmeticRandom: cosmeticEmissionRandom.next,
    getWeapon,
    ...(clipper === undefined ? {} : { clipper }),
  });
  const {
    Aldric,
    Armored,
    BOSSFX,
    Bomber,
    Boss,
    Charger,
    Chimera,
    Colossus,
    Echo,
    Flyer,
    Ranged,
    Rimehound,
    Rootbinder,
    Rootbound,
    Source,
    Support,
    VoidWisp,
    Warden,
    WhiteHart,
    Wraith,
    drawBossTransformationWorld,
    weaponCapsuleIntersectsSegment,
  } = enemyTypes;
  const { Mirror, MirrorHost, ReflectionEnemy } = mirrorTypes;
  const menuFeedback = createLiveAttractFeedback({
    CONFIG: worldConfig,
    GFX,
    Input,
    presentation: presentation.player,
    aabbOverlap,
    clamp,
    len,
    random: cosmeticRandom,
    reducedMotion: () => A11Y.reducedMotion,
  });
  const Attract = createAttract({
    Backdrop,
    Blade,
    FX: menuFeedback.FX,
    Player: menuFeedback.Player,
    STAGES,
    clamp,
    policy: {
      view: worldConfig.view,
      world: worldConfig.world,
      blade: worldConfig.blade,
      colors: worldConfig.colors,
      overscan: OVERSCAN,
      lowGraphics: () => GFX.low,
      random: cosmeticRandom,
      theme: THEME,
    },
  });
  const platform = createLegacyPlatformCompatibility({
    target,
    ...(sdk === undefined ? {} : { sdk }),
    ...(createCrazyGamesServices === undefined ? {} : { createCrazyGamesServices }),
    ...(disposableStorage === undefined ? {} : { storage: disposableStorage }),
    ...(tearTestEnvironment === undefined ? {} : { services: tearTestEnvironment.platform }),
  });
  const CG = platform.CG;

  const PROFILE = createProfileStore({
    store: CG.store,
    onCommitted: () => {
      if (PROFILE.pendingRewards().length > 0) void tutorialCompletionPersistence.retry();
    },
    onLoaded: () => {
      void tutorialCompletionPersistence.retry();
    },
    getAchievements: () => ACH,
    getMeta: () => META,
    writerId: () => (CG.live ? "crazygames" : "browser"),
    countedBiomeNames: STAGES.map(({ name }) => name),
    getCosmeticCatalog: () => COSMETIC_CATALOG,
    log: (message) => {
      console.log(message);
    },
  });
  const GAMEPLAY_EVENTS = new TearGameplayEventBus(() => Input.semantic.lastSealedTick);
  const { GHOST, VAULT } = createLegacyReplayCompatibility({
    store: CG.store,
    document,
    now: () => Date.now(),
    random: () => Math.random(),
    semanticInput: Input.semantic,
    // Ghost 2 remains a visual compatibility recorder. The live runtime owns
    // the shared canonical input stream; Ghost 2 does not capture commands.
    captureSemanticActions: false,
    gameplayEvents: GAMEPLAY_EVENTS,
    defaults: {
      rulesetVersion: CURRENT_RULESET_VERSION,
      build: { version: "0.1.0", revision: __TEAR_BUILD_REVISION__, target },
      ticksPerSecond: 120,
      weaponId: "sword",
      weaponSchemaVersion: "final-five-v1",
      tearScore: () => SFX.musicReplayMetadata(),
    },
  });
  const { Cloud, FirebaseProvider } = createCloud({
    target,
    getPlatform: () => platform.services,
    getProfile: () => PROFILE,
    getMeta: () => META,
  });
  const { META, SHOP } = createMetaProgression<UpgradeDefinition, UpgradeApplyContext & ProgressionApplyContext>({
    store: CG.store,
    config: worldConfig,
    cloud: Cloud,
    random: GAME_RANDOM_STREAMS.stream("draft"),
    upgrades: UPGRADES,
    applyUpgrade: (upgrade, context) => {
      applyUpgrade(upgrade, context);
    },
  });
  const ACH = createAchievements({ meta: META, profile: PROFILE, audio: SFX, shop: SHOP, clamp });
  const tutorialCompletionPersistence = createLiveTutorialCompletionPersistence(PROFILE, META, ACH);
  const practiceEncounterPersistence = createLivePracticeEncounterPersistence(PROFILE);
  const DAILY = createDailyChallenges({ achievements: ACH, profile: PROFILE, clock: localCalendarClock() });
  const APP = new AppStateController(surfaces);
  // One rule for "plain main menu": the menu screen with no phone rotate gate drawn over it.
  const plainMainMenu = (): boolean => {
    const canvas = document.querySelector<HTMLCanvasElement>("#game");
    const gate = canvas !== null && rotateGateShown(Input.touchActive(), canvas.clientWidth, canvas.clientHeight);
    return APP.screen === "menu" && !gate;
  };
  // The ghost worker scripts are cached by the service worker on first fetch; fetch any missing one on an idle menu.
  if (target === "standalone") startWorkerCacheWarmup(plainMainMenu, GHOST_WORKER_URLS);
  // A waiting service-worker update is applied only on the plain main menu, after saves settle.
  pwaUpdate.setIdleHost({ isIdle: plainMainMenu, settle: () => PROFILE.flushAcknowledged() });
  const DIAG = new PerformanceMonitor();
  const achievementToastPersistence = createLiveAchievementToastPersistence(PROFILE);
  const biomeProgressPersistence = createLiveBiomeProgressPersistence(PROFILE);
  const outcomeDefeatProgressPersistence = createLiveOutcomeDefeatProgressPersistence(PROFILE);
  const pendingFinalePersistence = createLivePendingFinalePersistence(PROFILE);
  const profileStatsPersistence = createLiveProfileStatsPersistence(PROFILE);
  const victoryProfileProgressPersistence = createLiveVictoryProfileProgressPersistence(
    PROFILE,
    profileStatsPersistence,
  );
  const styleAchievementPersistence = createLiveStyleAchievementPersistence(ACH, PROFILE);
  const platformBootstrapPersistence = createLivePlatformBootstrapPersistence(ACH, PROFILE, META, SHOP, () =>
    tutorialCompletionPersistence.retry(),
  );
  const shopPurchaseProgressPersistence = createLiveShopPurchaseProgressPersistence(PROFILE, META, SHOP);

  const gameRuntimeDependencies = {
    A11Y,
    ACH,
    AFFIXES,
    APP,
    Aldric,
    Armored,
    Attract,
    BOSSFX,
    Backdrop,
    Scenes,
    Blade,
    biomeProgressPersistence,
    Bomber,
    Boss,
    achievementToastPersistence,
    surfaces,
    engineeringQuery,
    browserDocument: document,
    browserIndexedDb,
    browserNavigator: navigator,
    browserStorage: window.localStorage,
    browserWindow: window,
    CG,
    CLOCK,
    CONFIG: worldConfig,
    Charger,
    Chimera,
    Cinematics,
    Clipper: clipper,
    Cloud,
    Colossus,
    DAILY,
    DIAG,
    Echo,
    FX,
    FirebaseProvider,
    Flyer,
    GAMEPLAY_EVENTS,
    GAME_RANDOM,
    GAME_RANDOM_STREAMS,
    GFX,
    GHOST,
    Input,
    META,
    Mirror,
    MirrorHost,
    OVERSCAN,
    PAD,
    PRESETS,
    outcomeDefeatProgressPersistence,
    pendingFinalePersistence,
    platformBootstrapPersistence,
    tutorialCompletionPersistence,
    practiceEncounterPersistence,
    profileStatsPersistence,
    PROFILE,
    Player,
    Projectile,
    PwaUpdate: pwaUpdate,
    REMOTE,
    Ranged,
    ReflectionEnemy,
    Rimehound,
    Rootbinder,
    Rootbound,
    SAFE,
    SFX,
    SHOP,
    STAGES,
    PLAYGROUND_STAGES,
    Source,
    shopPurchaseProgressPersistence,
    styleAchievementPersistence,
    Support,
    THEME,
    UI,
    UPGRADES,
    victoryProfileProgressPersistence,
    VAULT,
    VARIANTS,
    VoidGen,
    VoidWisp,
    WEAPONS,
    Warden,
    WhiteHart,
    Wraith,
    aabbOverlap,
    applyPreset,
    applyUpgrade,
    applyVariant,
    applyWeapon,
    clamp,
    cosmeticRandom,
    cosmeticEmissionRandom,
    createRunSeed,
    drawBossTransformationWorld,
    len,
    lerp,
    newMods,
    nextTierDesc,
    rollAffixes,
    rollUpgrades,
    rollVariant,
    segCircle,
    segPointDist,
    stageAt,
    stagePlatforms,
    tierUp,
    weaponCapsuleIntersectsSegment,
  } satisfies GameRuntimeDependencies;
  startLiveGame(gameRuntimeDependencies, worldConfiguration);

  if (tearTestMode) {
    const observedSemanticActions: ReturnType<typeof Input.drainSemanticActions>[number][] = [];
    Input.semantic.subscribe((entry) => {
      observedSemanticActions.push(entry);
    });
    Object.defineProperty(window, "__TEAR_PLATFORM_SERVICES__", {
      configurable: true,
      get: () => platform.services,
    });
    Object.defineProperty(window, "__TEAR_DIAGNOSTICS__", {
      configurable: true,
      value: Object.freeze({
        snapshot: () => DIAG.snapshot(),
        resetTimingSamples: () => {
          DIAG.resetTimingSamples();
        },
        resetCounters: () => {
          DIAG.resetCounters();
        },
      }),
    });
    compositionWindow.__TEAR_CATALOG_DEBUG__ = Object.freeze({
      weapons: WEAPONS.map((weapon) => ({
        id: weapon.id,
        throwIdentity: weapon.throwIdentity,
        ratings: weapon.ratings,
      })),
      abilities: UPGRADES.filter((upgrade) => ["stormbank", "overrun", "sever"].includes(upgrade.id)).map(
        (upgrade) => upgrade.name,
      ),
      input: Object.freeze({
        startRecording: () => {
          Input.startSemanticRecording();
        },
        stopRecording: () => {
          Input.stopSemanticRecording();
        },
        drain: (tick: number) => Input.drainSemanticActions(tick),
        drainObserved: () => observedSemanticActions.splice(0, observedSemanticActions.length),
        snapshot: () => ({
          mode: Input.mode,
          held: [...Input.held].sort(),
          recording: Input.semantic.recording,
          secondaryPressed: Input.rmb,
          pointerLocked: Input.locked,
          pointerLockAllowed: Input.allowLock,
          tetherHeld: Input.tetherHeld,
          pointer: { x: Input.mouseX, y: Input.mouseY },
          ownedPointer: Input.pointer(),
          touchLayout: Input.touchActive(),
          ui: { ...Input.ui },
        }),
      }),
      audio: Object.freeze({
        snapshot: () => SFX.debugSnapshot(),
        exerciseRoutes: () => {
          SFX.parry();
          SFX.wardenClash();
          SFX.hurt();
          SFX.wave();
        },
      }),
      app: Object.freeze({ snapshot: () => APP.snapshot() }),
      // What the last drawn frame's MUSIC covers showed: paintings, bands, or bands still waiting.
      musicCovers: Object.freeze({ snapshot: lastCoverFrameTally }),
      // What the isolated storage holds now, so a journey can boot a fresh page from it: the
      // same contents a reload would find in the browser's real storage.
      storage: Object.freeze({ snapshot: () => Object.fromEntries(disposableValues) }),
      viewport: Object.freeze({
        snapshot: () => {
          const canvas = document.querySelector<HTMLCanvasElement>("#game");
          const rect = canvas?.getBoundingClientRect();
          return {
            logical: { width: worldConfig.view.w, height: worldConfig.view.h },
            css: { width: rect?.width ?? 0, height: rect?.height ?? 0 },
            backing: { width: canvas?.width ?? 0, height: canvas?.height ?? 0 },
            overscan: { x: OVERSCAN.x, y: OVERSCAN.y },
            safeArea: { top: SAFE.t, right: SAFE.r, bottom: SAFE.b, left: SAFE.l },
            devicePixelRatio: window.devicePixelRatio,
          };
        },
      }),
    });
  } else if (import.meta.env.DEV) {
    Object.defineProperty(window, "__TEAR_DIAGNOSTICS__", {
      configurable: true,
      value: Object.freeze({ snapshot: () => DIAG.snapshot() }),
    });
  }
}

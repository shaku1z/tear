import { createLegacySynthFacade } from "../audio/legacy-synth";
import { createBrowserAudioContextHandoff } from "../audio/audio-context-handoff";
import { A11Y, CONFIG, GFX, OVERSCAN, REMOTE, SAFE, THEME } from "../config/game-config";
import { aabbOverlap, clamp, len, lerp, lerpAngle, segCircle, segPointDist, segSegmentDist } from "../domain/geometry";
import { AFFIXES, PRESETS, applyPreset, rollAffixes } from "../gameplay/affixes";
import { createAchievements } from "../gameplay/progression/achievements";
import { createDailyChallenges, localCalendarClock } from "../gameplay/progression/challenges";
import { TearGameplayEventBus } from "../gameplay/runtime/gameplay-events";
import { createTearWorldBootstrap } from "../gameplay/runtime/tear-world-bootstrap";
import { createMetaProgression, type ProgressionApplyContext } from "../gameplay/progression/meta";
import { STAGES, stageAt, stagePlatforms } from "../gameplay/stages";
import {
  UPGRADES, applyUpgrade, newMods, nextTierDesc, rollUpgrades, tierUp,
  type UpgradeApplyContext, type UpgradeDefinition,
} from "../gameplay/upgrades";
import { VARIANTS, applyVariant, rollVariant } from "../gameplay/variants";
import { VoidGen } from "../gameplay/voidgen";
import { WEAPONS, applyWeapon, getWeapon } from "../gameplay/weapons";
import { createLegacyInputCompatibility } from "../input/legacy-compat";
import { createLegacyGamepad } from "../input/legacy-gamepad";
import { createLegacyInput } from "../input/legacy-input";
import { createLegacyProfile } from "../persistence/legacy-profile";
import type { CloudFactory } from "../platform/cloud-factory";
import type { CrazyGamesSdkShape, createCrazyGamesPlatformServices } from "../platform/crazygames";
import { createLegacyPlatformCompatibility } from "../platform/legacy-compat";
import { createRunSeed } from "../platform/run-seed";
import type { PwaUpdateCapability } from "../platform/pwa-update";
import { createAttract } from "../presentation/attract";
import { createBackdrop } from "../presentation/backdrop";
import { createCinematics } from "../presentation/cinematics";
import { cosmeticRandom } from "../presentation/cosmetic-random";
import { createParticleSystem } from "../presentation/particles";
import { createUi } from "../presentation/ui";
import { createLegacyReplayCompatibility } from "../replay/legacy-compat";
import { PerformanceMonitor } from "../diagnostics/performance-monitor";
import { createTearTestEnvironment } from "../tearbench/test-support";
import { LegacyAppStateController } from "./legacy-state-controller";
import { createTearWorldSimulationFactories } from "../gameplay/runtime/tear-world-simulation-factories";
import { createLiveWorldSimulationPresentationAdapter } from "./live-world-simulation-factories";
import { startLiveGame } from "./live-game-runtime";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";

export interface TearCompositionOptions {
  readonly target: "standalone" | "crazygames";
  readonly sdk?: CrazyGamesSdkShape;
  readonly createCrazyGamesServices?: typeof createCrazyGamesPlatformServices;
  readonly createCloud: CloudFactory;
  readonly pwaUpdate: PwaUpdateCapability;
}

interface CompositionWindow extends Window {
  readonly Clipper?: Readonly<{ start(): void; stop(): void }>;
  __TEAR_CATALOG_DEBUG__?: object;
}

/**
 * The real application composition root. Target adapters are passed from their
 * entrypoint so standalone builds do not import the CrazyGames implementation.
 */
export function composeTearApplication(options: TearCompositionOptions): void {
  const { target, sdk, createCrazyGamesServices, createCloud, pwaUpdate } = options;
  const compositionWindow = window as CompositionWindow;
  const tearTestMode = __TEAR_TEST_BUILD__ && new URLSearchParams(window.location.search).get("test") === "1";
  const disposableValues = new Map<string, string>();
  const tearTestEnvironment = tearTestMode ? createTearTestEnvironment("live-test-composition") : undefined;
  const disposableStorage = tearTestMode ? {
    getItem: (key: string) => disposableValues.get(key) ?? null,
    setItem: (key: string, value: string) => { disposableValues.set(key, value); },
    removeItem: (key: string) => { disposableValues.delete(key); },
  } : undefined;
  // Optional capture tooling is a development adapter, never a production
  // gameplay dependency or shared writable global.
  const clipper = import.meta.env.DEV ? compositionWindow.Clipper : undefined;
  // These data-only services are created before any world constructor captures
  // them. The bootstrap deliberately leaves all presentation adapters outside.
  const { configuration: worldConfiguration, clock: CLOCK, random } = createTearWorldBootstrap(CONFIG);
  const worldConfig = worldConfiguration.value;
  const audioContextHandoff = createBrowserAudioContextHandoff();
  const SFX = createLegacySynthFacade({ audioContextHandoff });
  const FX = createParticleSystem({
    effects: worldConfig.effects,
    lowGraphics: () => GFX.low,
    reducedMotion: () => A11Y.reducedMotion,
    random: cosmeticRandom,
  });
  const Backdrop = createBackdrop({
    clock: CLOCK, config: worldConfig, graphics: GFX, accessibility: A11Y,
    overscan: OVERSCAN, theme: THEME, createCanvas: () => document.createElement("canvas"), performance,
  });
  const Cinematics = createCinematics({ presentation: worldConfig.presentation });
  const { streams: GAME_RANDOM_STREAMS, service: GAME_RANDOM } = random;
  const { Input, PAD } = createLegacyInputCompatibility(
    { config: worldConfig, safeArea: SAFE, overscan: OVERSCAN, window, document, navigator, performance },
    { createInput: createLegacyInput, createGamepad: createLegacyGamepad },
  );
  const UI = createUi({ CLOCK, presentation: { view: worldConfig.view, colors: worldConfig.colors, overscan: OVERSCAN }, Input, clamp,
    controllerGlyph: (buttonIndex) => PAD.glyph(buttonIndex) });
  // One world's entity constructors. The factory takes the mutable world
  // services explicitly, so a second world can be built without a second
  // composition root; the live application still builds exactly one.
  const presentation = createLiveWorldSimulationPresentationAdapter({
    clock: CLOCK, effects: FX, ui: UI,
    configuration: { accessibility: A11Y, config: worldConfig, graphics: GFX, theme: THEME },
    geometry: { clamp, len, lerp }, cosmeticRandom,
  });
  const { Blade, Player, Projectile, enemyTypes, mirrorTypes } = createTearWorldSimulationFactories({
    clock: CLOCK, config: worldConfig, graphics: GFX, effects: FX, sound: SFX, input: Input,
    random: { enemyAi: GAME_RANDOM_STREAMS.stream("enemy-ai"), boss: GAME_RANDOM_STREAMS.stream("boss") },
    presentation, geometry: { aabbOverlap, clamp, len, lerp, lerpAngle, segPointDist, segSegmentDist },
    cosmeticRandom, getWeapon,
    ...(clipper === undefined ? {} : { clipper }),
  });
  const {
    Aldric, Armored, BOSSFX, Bomber, Boss, Charger, Chimera, Colossus, Echo,
    Flyer, Ranged, Source, Support, VoidWisp, Warden, Wraith,
    drawBossTransformationWorld, weaponCapsuleIntersectsSegment,
  } = enemyTypes;
  const { Mirror, MirrorHost, ReflectionEnemy } = mirrorTypes;
  const Attract = createAttract({ Backdrop, Blade, FX, Player, STAGES, clamp, policy: {
    view: worldConfig.view, world: worldConfig.world, blade: worldConfig.blade,
    colors: worldConfig.colors, overscan: OVERSCAN, lowGraphics: () => GFX.low, random: cosmeticRandom, theme: THEME,
  } });
  const platform = createLegacyPlatformCompatibility({
    target,
    ...(sdk === undefined ? {} : { sdk }),
    ...(createCrazyGamesServices === undefined ? {} : { createCrazyGamesServices }),
    ...(disposableStorage === undefined ? {} : { storage: disposableStorage }),
    ...(tearTestEnvironment === undefined ? {} : { services: tearTestEnvironment.platform }),
  });
  const CG = platform.CG;

  const PROFILE = createLegacyProfile({
    store: CG.store,
    getAchievements: () => ACH,
    getMeta: () => META,
    writerId: () => CG.live ? "crazygames" : "browser",
    log: (message) => { console.log(message); },
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
      rulesetVersion: "tear-rules-2026.07",
      build: { version: "0.1.0", revision: import.meta.env.MODE, target },
      ticksPerSecond: 120,
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
    store: CG.store, config: worldConfig, cloud: Cloud, random: GAME_RANDOM_STREAMS.stream("draft"), upgrades: UPGRADES,
    applyUpgrade: (upgrade, context) => { applyUpgrade(upgrade, context); },
  });
  const ACH = createAchievements({ meta: META, profile: PROFILE, audio: SFX, shop: SHOP, clamp });
  const DAILY = createDailyChallenges({ achievements: ACH, profile: PROFILE, clock: localCalendarClock() });
  const APP = new LegacyAppStateController();
  const DIAG = new PerformanceMonitor();

  const gameRuntimeDependencies = {
    A11Y, ACH, AFFIXES, APP, Aldric, Armored, Attract, BOSSFX, Backdrop, Blade, Bomber, Boss,
    browserDocument: document, browserIndexedDb: window.indexedDB, browserNavigator: navigator, browserWindow: window, CG, CLOCK, CONFIG: worldConfig, Charger, Chimera, Cinematics, Clipper: clipper, Cloud, Colossus, DAILY, DIAG, Echo,
    FX, FirebaseProvider, Flyer, GAMEPLAY_EVENTS, GAME_RANDOM, GAME_RANDOM_STREAMS, GFX, GHOST, Input, META, Mirror,
    MirrorHost, OVERSCAN, PAD, PRESETS, PROFILE, Player, Projectile, PwaUpdate: pwaUpdate, REMOTE,
    Ranged, ReflectionEnemy, SAFE, SFX, SHOP, STAGES, Source, Support, THEME, UI, UPGRADES,
    VAULT, VARIANTS, VoidGen, VoidWisp, WEAPONS, Warden, Wraith,
    aabbOverlap, applyPreset, applyUpgrade, applyVariant, applyWeapon,
    clamp, cosmeticRandom, createRunSeed, drawBossTransformationWorld, len, lerp,
    newMods, nextTierDesc, rollAffixes, rollUpgrades, rollVariant, segCircle,
    segPointDist, stageAt, stagePlatforms, tierUp, weaponCapsuleIntersectsSegment,
  } satisfies GameRuntimeDependencies;
  startLiveGame(gameRuntimeDependencies, worldConfiguration);

  if (tearTestMode) {
    Object.defineProperty(window, "__TEAR_PLATFORM_SERVICES__", {
      configurable: true,
      get: () => platform.services,
    });
    Object.defineProperty(window, "__TEAR_DIAGNOSTICS__", {
      configurable: true,
      value: Object.freeze({ snapshot: () => DIAG.snapshot() }),
    });
    compositionWindow.__TEAR_CATALOG_DEBUG__ = Object.freeze({
      weapons: WEAPONS.map((weapon) => ({ id: weapon.id, throwIdentity: weapon.throwIdentity, ratings: weapon.ratings })),
      abilities: UPGRADES.filter((upgrade) => ["stormbank", "overrun", "sever"].includes(upgrade.id)).map((upgrade) => upgrade.name),
      input: Object.freeze({
        startRecording: () => { Input.startSemanticRecording(); },
        stopRecording: () => { Input.stopSemanticRecording(); },
        drain: (tick: number) => Input.drainSemanticActions(tick),
        snapshot: () => ({
          mode: Input.mode,
          held: [...Input.held].sort(),
          recording: Input.semantic.recording,
          secondaryPressed: Input.rmb,
          pointerLocked: Input.locked,
          pointerLockAllowed: Input.allowLock,
          tetherHeld: Input.tetherHeld,
          pointer: { x: Input.mouseX, y: Input.mouseY },
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
      viewport: Object.freeze({ snapshot: () => {
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
      } }),
    });
  } else if (import.meta.env.DEV) {
    Object.defineProperty(window, "__TEAR_DIAGNOSTICS__", {
      configurable: true,
      value: Object.freeze({ snapshot: () => DIAG.snapshot() }),
    });
  }
}

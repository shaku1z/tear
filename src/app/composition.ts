import { SFX } from "../audio/legacy-synth";
import { A11Y, CLOCK, CONFIG, GFX, OVERSCAN, REMOTE, SAFE, THEME } from "../config/game-config";
import { aabbOverlap, clamp, len, lerp, lerpAngle, segCircle, segPointDist, segSegmentDist } from "../domain/geometry";
import { AFFIXES, PRESETS, applyPreset, rollAffixes } from "../gameplay/affixes";
import { createBlade } from "../gameplay/entities/blade";
import { createEnemyTypes } from "../gameplay/entities/enemies";
import { createMirrorTypes } from "../gameplay/entities/mirror";
import { createPlayer } from "../gameplay/entities/player";
import { createProjectile } from "../gameplay/entities/projectile";
import { createAchievements } from "../gameplay/progression/achievements";
import { createDailyChallenges, localCalendarClock } from "../gameplay/progression/challenges";
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
import { Backdrop } from "../presentation/backdrop";
import { Cinematics } from "../presentation/cinematics";
import { cosmeticRandom } from "../presentation/cosmetic-random";
import { createLegacyEnemyPresentation } from "../presentation/enemies/legacy-enemy-renderers";
import { FX } from "../presentation/particles";
import { createBladeRenderer } from "../presentation/entities/blade-renderer";
import { createMirrorRenderer } from "../presentation/entities/mirror-renderer";
import { createPlayerRenderer } from "../presentation/entities/player-renderer";
import { createProjectileRenderer } from "../presentation/entities/projectile-renderer";
import { createUi } from "../presentation/ui";
import { createLegacyReplayCompatibility } from "../replay/legacy-compat";
import { GAME_RANDOM } from "../simulation/run-random";
import { PerformanceMonitor } from "../diagnostics/performance-monitor";
import { LegacyAppStateController } from "./legacy-state-controller";
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
  // Optional capture tooling is a development adapter, never a production
  // gameplay dependency or shared writable global.
  const clipper = import.meta.env.DEV ? compositionWindow.Clipper : undefined;
  const { Input, PAD } = createLegacyInputCompatibility(
    { config: CONFIG, safeArea: SAFE, overscan: OVERSCAN, window, document, navigator, performance },
    { createInput: createLegacyInput, createGamepad: createLegacyGamepad },
  );
  const UI = createUi({ CLOCK, CONFIG, Input, OVERSCAN, clamp });
  const playerPresentation = createPlayerRenderer({ colors: CONFIG.colors, graphics: GFX, theme: THEME, clamp });
  const bladePresentation = createBladeRenderer({ clock: CLOCK, config: CONFIG, graphics: GFX, theme: THEME, clamp, len, lerp });
  const projectilePresentation = createProjectileRenderer({ clock: CLOCK, config: CONFIG, graphics: GFX, theme: THEME, clamp });
  const mirrorPresentation = createMirrorRenderer({
    clock: CLOCK, config: CONFIG, effects: FX, graphics: GFX, theme: THEME, clamp, cosmeticRandom,
  });
  const Blade = createBlade({ CLOCK, CONFIG, Input, presentation: bladePresentation, clamp, len, lerp, lerpAngle });
  const Player = createPlayer({ CONFIG, FX, GFX, Input, presentation: playerPresentation, aabbOverlap, clamp, len });
  const Projectile = createProjectile({ CLOCK, CONFIG, FX, SFX, presentation: projectilePresentation, clamp, len, lerp });
  const enemyPresentation = createLegacyEnemyPresentation({
    A11Y, CLOCK, CONFIG, GFX, THEME, UI, clamp, len, lerp,
  });
  const enemyTypes = createEnemyTypes({
    CLOCK, CONFIG, ...(clipper === undefined ? {} : { Clipper: clipper }),
    FX, GAME_RANDOM, Projectile, SFX,
    presentation: enemyPresentation,
    aabbOverlap, clamp, cosmeticRandom, len, lerp, segPointDist, segSegmentDist,
  });
  enemyPresentation.install(enemyTypes);
  const {
    Aldric, Armored, BOSSFX, Bomber, Boss, Charger, Chimera, Colossus, Echo, Enemy,
    Flyer, Ranged, Source, Support, VoidWisp, Warden, Wraith,
    drawBossTransformationWorld, weaponCapsuleIntersectsSegment,
  } = enemyTypes;
  const { Mirror, MirrorHost, ReflectionEnemy } = createMirrorTypes({
    Blade, CLOCK, CONFIG, Enemy, FX, GAME_RANDOM, Player, Projectile, SFX, presentation: mirrorPresentation,
    clamp, getWeapon, lerp, lerpAngle,
  });
  const Attract = createAttract({ Backdrop, Blade, CONFIG, FX, GFX, OVERSCAN, Player, STAGES, THEME, clamp });
  const platform = createLegacyPlatformCompatibility({
    target,
    ...(sdk === undefined ? {} : { sdk }),
    ...(createCrazyGamesServices === undefined ? {} : { createCrazyGamesServices }),
  });
  const CG = platform.CG;

  const PROFILE = createLegacyProfile({
    store: CG.store,
    getAchievements: () => ACH,
    getMeta: () => META,
    writerId: () => CG.live ? "crazygames" : "browser",
    log: (message) => { console.log(message); },
  });
  const { GHOST, VAULT } = createLegacyReplayCompatibility({
    store: CG.store,
    document,
    now: () => Date.now(),
    random: () => Math.random(),
    semanticInput: Input.semantic,
    defaults: {
      rulesetVersion: "tear-rules-2026.07",
      build: { version: "0.1.0", revision: import.meta.env.MODE, target },
      ticksPerSecond: 60,
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
    store: CG.store, config: CONFIG, cloud: Cloud, random: GAME_RANDOM, upgrades: UPGRADES,
    applyUpgrade: (upgrade, context) => { applyUpgrade(upgrade, context); },
  });
  const ACH = createAchievements({ meta: META, profile: PROFILE, audio: SFX, shop: SHOP, clamp });
  const DAILY = createDailyChallenges({ achievements: ACH, profile: PROFILE, clock: localCalendarClock() });
  const APP = new LegacyAppStateController();
  const DIAG = new PerformanceMonitor();

  const gameRuntimeDependencies = {
    A11Y, ACH, AFFIXES, APP, Aldric, Armored, Attract, BOSSFX, Backdrop, Blade, Bomber, Boss,
    CG, CLOCK, CONFIG, Charger, Chimera, Cinematics, Clipper: clipper, Cloud, Colossus, DAILY, DIAG, Echo,
    FX, FirebaseProvider, Flyer, GAME_RANDOM, GFX, GHOST, Input, META, Mirror,
    MirrorHost, OVERSCAN, PAD, PRESETS, PROFILE, Player, Projectile, PwaUpdate: pwaUpdate, REMOTE,
    Ranged, ReflectionEnemy, SAFE, SFX, SHOP, STAGES, Source, Support, THEME, UI, UPGRADES,
    VAULT, VARIANTS, VoidGen, VoidWisp, WEAPONS, Warden, Wraith,
    aabbOverlap, applyPreset, applyUpgrade, applyVariant, applyWeapon,
    clamp, cosmeticRandom, createRunSeed, drawBossTransformationWorld, len, lerp,
    newMods, nextTierDesc, rollAffixes, rollUpgrades, rollVariant, segCircle,
    segPointDist, stageAt, stagePlatforms, tierUp, weaponCapsuleIntersectsSegment,
  } satisfies GameRuntimeDependencies;
  startLiveGame(gameRuntimeDependencies);

  if (new URLSearchParams(window.location.search).get("test") === "1") {
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
          pointer: { x: Input.mouseX, y: Input.mouseY },
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
          logical: { width: CONFIG.view.w, height: CONFIG.view.h },
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

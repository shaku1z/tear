import { CONFIG } from "../../src/config/game-config";
import { createLiveAuthoritativeInputAdapter } from "../../src/app/live-authoritative-input-adapter";
import { createConfigRestorer } from "../../src/app/runtime-initialization";
import { createLiveWorldComposition, type LiveWorldSessionPort } from "../../src/app/live-world-composition";
import {
  createLiveWorldSimulationFactories,
  type LiveWorldSimulationFactoryOptions,
} from "../../src/app/live-world-simulation-factories";
import type { GameRuntimeDependencies } from "../../src/app/game-runtime-dependencies";
import { aabbOverlap, clamp, len, lerp, segCircle, segPointDist } from "../../src/domain/geometry";
import { CombatEntityRuntime, type CombatEntityRuntimeHooks } from "../../src/gameplay/combat/combat-entity-runtime";
import type { LiveKillHost } from "../../src/gameplay/combat/live-kill-runtime";
import { runLiveCollisionPhase, type LiveCollisionPhaseHost } from "../../src/gameplay/combat/live-collision-phase";
import { runLiveOpeningPhase, type LiveOpeningPhaseHost } from "../../src/gameplay/combat/live-opening-phase";
import { addKillScore, invokeWeaponHook } from "../../src/gameplay/combat/weapon-runtime-coordinator";
import { updateMirrorCombat } from "../../src/gameplay/combat/mirror-combat-feedback";
import { cosmeticRandom } from "../../src/presentation/cosmetic-random";
import { PRESETS, applyPreset, rollAffixes } from "../../src/gameplay/affixes";
import { createLiveContentRuntime } from "../../src/gameplay/run/live-content-runtime";
import { LiveRunOutcomeController, type LiveOutcomeControllerPort } from
  "../../src/gameplay/run/live-outcome-controller";
import { snapshotOutcomeRun, type PreparedVictory } from "../../src/gameplay/run/outcome-planner";
import { BOSS_ROSTER } from "../../src/gameplay/run/content-director";
import { createLiveWaveHost } from "../../src/app/live-wave-host";
import { routeLiveTearBenchAction } from "../../src/tearbench/live-runtime-action-routing";
import { STAGES, stageAt, stagePlatforms } from "../../src/gameplay/stages";
import { applyVariant, rollVariant } from "../../src/gameplay/variants";
import { planBossPlacement } from "../../src/gameplay/run/boss-placement";
import { beginBossEncounter } from "../../src/gameplay/run/boss-encounter";
import { createBossArena } from "../../src/gameplay/training/arena-rules";
import { applyWeapon } from "../../src/gameplay/weapons";
import { applyUpgrade, newMods, rollUpgrades, tierUp, UPGRADES, type UpgradeDefinition } from
  "../../src/gameplay/upgrades";
import { createRewardRuntime } from "../../src/gameplay/run/reward-runtime";
import { eligibleTierChoices } from "../../src/gameplay/run/reward-selection";
import { createLiveStyleAchievementRuntime } from "../../src/gameplay/scoring/live-style-achievement-runtime";
import { tracksAchievements } from "../../src/gameplay/progression/achievement-runtime";
import type { GameAction } from "../../src/input/game-action";
import { createTearWorldClock } from "../../src/gameplay/runtime/tear-world-clock";
import { CinematicTimeline } from "../../src/gameplay/runtime/cinematic-director";
import { parseCampaignChapterBindingSpec, stageCampaignChapterBinding } from
  "../../src/gameplay/campaign/chapter-cinematic-binding";
import type { ChapterIntent } from "../../src/gameplay/campaign/chapter-controller";
import { stepCinematicPlayer } from "../../src/gameplay/campaign/cinematic-player-runtime";
import { FinaleController, type FinaleIntent, type FinaleState } from "../../src/gameplay/campaign/finale-controller";
import { createFinaleRuntime, type FinaleRuntimeState } from "../../src/gameplay/campaign/finale-runtime";
import { createTearWorldTransientState } from "../../src/gameplay/runtime/tear-world-transient-state";
import { createTearCombatSimulation } from "../../src/gameplay/runtime/tear-combat-simulation";
import type { AuthoritativeInputState } from "../../src/gameplay/runtime/authoritative-input";
import type { TearGameplayEventPort } from "../../src/gameplay/runtime/gameplay-events";
import { createTearSpawnFactPublisher, createTearTerminalRunFactPublisher, createTearWaveFactPublisher } from
  "../../src/gameplay/runtime/gameplay-event-publishers";
import { createParticleSystem } from "../../src/presentation/particles";
import { createRunRandom } from "../../src/simulation/run-random";
import type { RunLifecycleSnapshot } from "../../src/gameplay/run/lifecycle";

type Options = LiveWorldSimulationFactoryOptions;

/** Ground plus one oneway ledge; enough arena for locomotion and contact. */
export const DETACHED_PLATFORMS = Object.freeze([
  { x: 0, y: CONFIG.world.groundY, w: CONFIG.view.w, h: CONFIG.view.h - CONFIG.world.groundY, floor: true },
  { x: 650, y: 520, w: 300, h: 24, oneway: true },
]);

/** Captured once at module load, before any world mutates tuning. */
const restoreBaseConfiguration = createConfigRestorer(CONFIG);

function sink(): unknown {
  // Outward effects and audio are adapters; a detached world records nothing.
  return new Proxy({}, { get: () => () => undefined });
}

function idleInput(): unknown {
  const off = () => false;
  return { right: off, left: off, up: off, down: off, dashPressed: off, jumpPressed: off, consumeThrow: off };
}

/** A legal minimal run: real upgrade mods, weapon stats, and boss/void fields. */
export function detachedRun(mode = "endless") {
  return {
    mode, mods: newMods(), mult: 1, lifestealCd: 0, weaponId: "sword", wave: 1, score: 0, waveKills: 0, runTime: 0,
    weaponStats: { distanceMoved: 0, throws: 0 },
    voidScroll: null, bossAdds: [], echoClones: null,
  };
}

export interface DetachedWorldOptions {
  readonly seed: string;
  /** Factory ids and positions spawned through the production entity port. */
  readonly enemies?: readonly Readonly<{ id: string; x: number; y: number }>[];
  readonly mode?: string;
}

/**
 * Builds a world with no DOM, canvas, screens, audio, storage, or live host,
 * using the same production composition the application uses. Callers add
 * whichever production phase they want to step.
 */
export function createDetachedWorld(options: DetachedWorldOptions) {
  const clock = createTearWorldClock();
  const random = createRunRandom();
  const effects = createParticleSystem();
  const transient = createTearWorldTransientState();
  random.streams.reset(options.seed);
  const factories = createLiveWorldSimulationFactories({
    clock, effects, sound: sink() as Options["sound"], input: idleInput() as Options["input"],
    ui: sink() as Options["ui"],
    random: { enemyAi: random.streams.stream("enemy-ai"), boss: random.streams.stream("boss") },
  });
  const dependencies = {
    CLOCK: clock, GAME_RANDOM: random.service, GAME_RANDOM_STREAMS: random.streams, FX: effects,
    Backdrop: { resetFx: () => undefined }, Mirror: factories.mirrorTypes.Mirror, BOSSFX: factories.enemyTypes.BOSSFX,
    Cinematics: CinematicTimeline,
    Player: factories.Player, Blade: factories.Blade, Projectile: factories.Projectile,
    Charger: factories.enemyTypes.Charger, Ranged: factories.enemyTypes.Ranged, Flyer: factories.enemyTypes.Flyer,
    Bomber: factories.enemyTypes.Bomber, Armored: factories.enemyTypes.Armored, Wraith: factories.enemyTypes.Wraith,
    Chimera: factories.enemyTypes.Chimera, Warden: factories.enemyTypes.Warden, Colossus: factories.enemyTypes.Colossus,
    Aldric: factories.enemyTypes.Aldric, Source: factories.enemyTypes.Source, Support: factories.enemyTypes.Support,
    VoidWisp: factories.enemyTypes.VoidWisp, Boss: factories.enemyTypes.Boss,
    MirrorHost: factories.mirrorTypes.MirrorHost, ReflectionEnemy: factories.mirrorTypes.ReflectionEnemy,
  } as unknown as GameRuntimeDependencies;
  const session: LiveWorldSessionPort = {
    selectedWeapon: () => "sword", setSelectedWeapon: () => undefined,
    outcome: () => null, setOutcome: () => undefined,
    lastRecording: () => null, setLastRecording: () => undefined,
    lastVaultId: () => null, setLastVaultId: () => undefined,
    winSeconds: () => 0, setWinSeconds: () => undefined,
  };
  const world = createLiveWorldComposition({ dependencies, session, restoreConfiguration: () => undefined });
  world.context.services.random.resetRun(options.seed);
  const run = detachedRun(options.mode);
  world.state.setRun(run as never);
  world.state.setPlayer(world.entities.createPlayer(400, CONFIG.world.groundY - 80));
  const blade = world.entities.createBlade() as { weapon?: unknown; model?: unknown };
  // Run start resets configuration to base and then installs the weapon
  // definition on the blade. applyWeapon mutates tuning, so without the reset a
  // second world in the same process would inherit the first world's tuning.
  restoreBaseConfiguration();
  const weapon = applyWeapon(run.weaponId);
  blade.weapon = weapon;
  blade.model = weapon.model;
  world.state.setBlade(blade as never);
  world.state.setEnemies((options.enemies ?? []).map((spawn) =>
    world.entities.createEnemy(spawn.id, spawn.x, spawn.y, run as never)));
  const input = createLiveAuthoritativeInputAdapter({
    player: () => world.state.player() as never,
    blade: () => world.state.blade() as never,
    aimRadius: () => CONFIG.blade.aimRadius,
  });
  // Platforms are mutable world state: a boss encounter swaps in its arena,
  // and both the wave runtime and the combat phases must see the same array.
  const stage: { index: number; platforms: unknown[] } = { index: 0, platforms: [...DETACHED_PLATFORMS] };
  return { world, clock, effects, random, factories, transient, input, run, stage };
}

export type DetachedWorld = ReturnType<typeof createDetachedWorld>;

/** Rebuilds an active chapter from data only; exact Class-A ticks do not advance RAF cinema time. */
export function restoreDetachedChapterBinding(
  detached: DetachedWorld,
  runtime: Readonly<Record<string, unknown>>,
): void {
  detached.world.lifecycle.restore(runtime.lifecycle as RunLifecycleSnapshot);
  const rawSpec = runtime.chapterBinding;
  if (rawSpec === null || rawSpec === undefined) {
    detached.world.context.cinema.restoreState(runtime.cinema);
    return;
  }
  const spec = parseCampaignChapterBindingSpec(rawSpec);
  const stage = stageAt(spec.stageIndex);
  const dispatch = (intents: readonly ChapterIntent[]): void => {
    for (const intent of intents) {
      if (intent.type === "chapter-state") {
        const run = detached.world.state.run() as never as { chapterState: string };
        run.chapterState = intent.state;
      } else if (intent.type === "clear-projectiles") {
        detached.world.state.setProjectiles([]);
      } else if (intent.type === "activate-prepared-wave" && detached.world.lifecycle.hasPreparedWave) {
        detached.world.lifecycle.activateWave();
      }
    }
  };
  const staged = stageCampaignChapterBinding(spec, stage, {
    dispatch,
    preparedWave: () => detached.world.lifecycle.hasPreparedWave,
    activationDeferred: () => detached.world.lifecycle.activationDeferred,
    clear: () => undefined,
  });
  detached.world.context.cinema.restoreState(runtime.cinema, staged.binding);
}

export interface DetachedCombatPhaseOptions {
  /** Defaults to the harness arena; hydrated worlds pass their own platforms. */
  readonly platforms?: readonly unknown[];
  /** The production wave update, when the caller wants live content spawning. */
  readonly updateWave?: (dt: number) => void;
  /** Shared-core composition defers identity-runtime construction to the core factory. */
  readonly deferCombatRuntime?: boolean;
  /** Portable outcome endpoint used when death resolution terminates a run. */
  readonly endRun?: () => void;
  /** Native gameplay facts published by portable production subsystems. */
  readonly gameplayEvents?: TearGameplayEventPort;
  /** Optional portable finale state/callbacks consumed by cinematic player stepping. */
  readonly finale?: Readonly<{
    snapshot(): Readonly<{ phase: string; severed: number; anchors: readonly unknown[]; landed: boolean }> | null;
    markLanded(): void;
    tryBladeCut(segment: Readonly<{ previousX: number; previousY: number; x: number; y: number; speed: number }>): void;
  }>;
}

export interface DetachedCombatSimulationOptions<State> extends DetachedCombatPhaseOptions {
  readonly gameplayEvents?: TearGameplayEventPort;
  snapshot(tick: number, input: AuthoritativeInputState): State;
}

/**
 * Builds both production combat-phase hosts over one detached world, with all
 * outward effects recorded rather than rendered, played, or persisted. The
 * returned `step` runs the same two phases in the same order as the live
 * combat host, including its skip when the opening half blocks the tick.
 */
export function createDetachedCombatPhases(
  detached: DetachedWorld,
  options: DetachedCombatPhaseOptions = {},
) {
  const { world, effects, transient, input, stage } = detached;
  if (options.platforms !== undefined) stage.platforms = [...options.platforms];
  const platforms = () => stage.platforms as unknown as LiveOpeningPhaseHost["platforms"];
  const outward: string[] = [];
  const note = (name: string) => () => { outward.push(name); };
  const player = () => world.state.player() as never;
  const blade = () => world.state.blade() as never;
  const style = createLiveStyleAchievementRuntime({
    run: () => world.state.run() as never,
    player: () => player(),
    enemies: () => world.state.enemies() as never,
    moving: () => {
      const authoritative = (player() as { aiInput?: { left(): boolean; right(): boolean } }).aiInput;
      return authoritative?.left() === true || authoritative?.right() === true;
    },
    tuning: () => CONFIG.trick,
    colors: () => CONFIG.colors,
    // The browser parity trace starts a Ghost recording for the run. Supplying
    // its gameplay-event port is the detached host's equivalent capability.
    ghostRecording: () => options.gameplayEvents !== undefined,
    styleIntents: {
      tutorialMark: (kind) => { outward.push(`tutorial:${kind}`); },
      ghostCapture: (kind, x, y) => { options.gameplayEvents?.emit({ kind: "effect", effect: kind, x, y }); },
      playerTrick: (kind, at) => {
        const activePlayer = player() as { lastTrickKind?: string; lastTrickT?: number };
        activePlayer.lastTrickKind = kind; activePlayer.lastTrickT = at;
      },
      rankUp: (rank) => { outward.push(`rankUp:${rank}`); },
      musicRankChanged: (rank) => { outward.push(`musicRank:${rank}`); },
      haptic: note("haptic"), profileAdd: note("profileAdd"), dailyBump: note("dailyBump"),
      profileMax: note("profileMax"), achievementCheck: note("achievementCheck"),
    },
    profileMax: note("profileMax"), achievementCheck: note("achievementCheck"),
    metaLevel: () => 0,
    projectileSpeed: () => CONFIG.proj.speed,
    createProjectile: (x, y, vx, vy) => world.entities.createProjectile(x, y, vx, vy) as never,
    addProjectile: (projectile) => { world.state.setProjectiles([...world.state.projectiles(), projectile]); },
  });

  let resolveKill: (enemy: { dead?: boolean }, cause?: string) => void = (enemy) => {
    enemy.dead = true; outward.push("onKill");
  };
  let actorId: ((enemy: object & { id?: string }) => string) | null = null;
  const nativeTracking = () => options.gameplayEvents !== undefined
    && tracksAchievements(world.state.run());
  const entityHooks = {
    actors: () => world.state.enemies(), projectiles: () => world.state.projectiles(),
    player: () => world.state.player(),
    slowZones: () => world.state.slowZones(), setSlowZones: (zones: never[]) => { world.state.setSlowZones(zones); },
    walls: () => world.state.temporaryWalls(), setWalls: (walls: never[]) => { world.state.setTemporaryWalls(walls); },
    platforms: () => [...stage.platforms],
    ring: (x: number, y: number, radius: number, color: string) => { effects.ring(x, y, radius, color); },
    burst: (x: number, y: number, dx: number, dy: number, count: number, color: string) => { effects.burst(x, y, dx, dy, count, color); },
    explode: (x: number, y: number, color: string, scale: number) => { effects.explode(x, y, color, scale); },
    fxFlash: (x: number, y: number, radius: number, color: string) => { effects.flash(x, y, radius, color); },
    floater: note("floater"), shake: note("shake"), flash: note("flash"),
    sound: (cue: string) => { outward.push(`sound:${cue}`); },
    loseStyle: () => { style.loseStyle(); }, shieldAbsorbed: note("shieldAbsorbed"),
    addStyle: (kind: string) => { style.addStyle(kind); },
    dashDodge: (projectile: unknown) => { style.achievements.dashDodge(projectile as never); },
    maxStat: note("maxStat"), checkAchievements: () => { style.check(); },
    noteFirstDamage: note("noteFirstDamage"), reflectedHit: note("reflectedHit"), bossHit: note("bossHit"),
    onKill: (enemy: { dead?: boolean }, cause: string) => { resolveKill(enemy, cause); },
    areaDamage: () => 0,
  } as unknown as CombatEntityRuntimeHooks;
  let combat = options.deferCombatRuntime === true ? null : new CombatEntityRuntime(entityHooks);

  const opening = {
    get player() { return player(); }, get blade() { return blade(); },
    get run() { return world.state.run() as never; },
    get enemies() { return world.state.enemies() as never; },
    get projectiles() { return world.state.projectiles(); },
    get platforms() { return platforms(); }, state: transient.opening, width: CONFIG.view.w,
    get blocking() { return world.context.cinema.active && world.context.cinema.blocksCombat; },
    get playerMode() { return world.context.cinema.playerMode; }, protection: transient.protection,
    lowGraphics: false,
    get transformationBlocked() { return world.context.cinema.active && world.context.cinema.blocksCombat; },
    overrunMovementMultiplier: () => 1, runDamageMultiplier: () => 1,
    stepCinematic: (dt: number) => {
      stepCinematicPlayer({ dt, mode: world.context.cinema.playerMode, player: player(), blade: blade(),
        platforms: platforms(), gravity: CONFIG.world.gravity, maxFall: CONFIG.player.maxFall,
        descentLiftVelocity: CONFIG.source.descentLiftV, viewportWidth: CONFIG.view.w,
        finale: options.finale?.snapshot() ?? null, lerp, clamp,
        onFinaleLanded: () => { options.finale?.markLanded(); },
        onFinaleBladeCut: (segment) => { options.finale?.tryBladeCut(segment); }, onLanding: () => undefined });
    }, flushClosingInput: note("flushClosingInput"),
    updateWeaponAbilities: () => undefined, updateWorldHazards: () => undefined,
    syncVoidSupport: () => undefined, activateThrowSecondary: note("activateThrowSecondary"),
    linkBroken: (reason: string) => { outward.push(`linkBroken:${reason}`); },
    distance: (ax: number, ay: number, bx: number, by: number) => len(ax - bx, ay - by),
    areaDamage: note("areaDamage"), ring: note("ring"), burst: note("burst"), floater: note("floater"),
    shake: note("shake"), sound: (name: string) => { outward.push(`sound:${name}`); },
    ghost: note("ghost"), ember: note("ember"), smoke: note("smoke"), drip: note("drip"),
    overlap: (a: { x: number; y: number; hw: number; hh: number }, b: { x: number; y: number; hw: number; hh: number }) =>
      aabbOverlap(a.x, a.y, a.hw, a.hh, b.x, b.y, b.hw, b.hh),
    styleHit: () => { style.addStyle("hit"); },
    onKill: (enemy: { dead?: boolean }, cause?: string) => { resolveKill(enemy, cause); },
    fireDashStart: note("fireDashStart"), fireDashContact: note("fireDashContact"),
    fireWeaponCatch: note("fireWeaponCatch"), fireThrowLaunch: note("fireThrowLaunch"),
    logThrowLaunch: note("logThrowLaunch"), weaponWorldImpact: () => null,
    lobExplode: note("lobExplode"), emitThrowResolve: note("emitThrowResolve"),
    nearestEnemy: () => (world.state.enemies()[0] ?? null) as never,
    updateFeedback: (dt: number) => {
      // The Echo reads the player every tick through this call; without it the
      // Mirror boss stands inert. The queued effects are drained like the live
      // host drains them, but recorded instead of rendered.
      const mirror = detached.factories.mirrorTypes.Mirror as unknown as
        Parameters<typeof updateMirrorCombat>[0] & { fxq?: unknown[] };
      if (updateMirrorCombat(mirror, dt, player(), blade())) outward.push("mirrorShattered");
      if (mirror.fxq !== undefined && mirror.fxq.length > 0) {
        outward.push(`mirrorFx:${String(mirror.fxq.splice(0).length)}`);
      }
      const drained = detached.factories.enemyTypes.BOSSFX.drain();
      if (drained.length > 0) outward.push(`bossFx:${String(drained.length)}`);
    },
    consumeThrow: () => input.consumeThrow(() => false),
    updateWave: (dt: number) => { options.updateWave?.(dt); }, startTransformation: () => false, updateSupports: () => undefined,
    armorBypass: note("armorBypass"), resolveBossZones: () => undefined,
    updateBossArenaPlatforms: () => undefined, updateVoidScroll: () => undefined,
    unlockWitness: note("unlockWitness"), startVoidDescent: () => false,
    spawnBossAdds: () => [], spawnBossClone: () => undefined, removeBossClone: () => undefined,
    dramaticBeat: note("dramaticBeat"), onBladeStolen: note("onBladeStolen"),
    updateEffects: (dt: number) => { effects.update(dt); },
    // The live opening host passes cosmeticRandom here: this entropy is
    // render-only. Drawing from a seeded stream instead would desynchronise
    // enemy AI, so the detached world uses the same non-rules source.
    random: cosmeticRandom,
  } as unknown as LiveOpeningPhaseHost;

  // The collision phase mutates its state object in place, so it reads the
  // world's impact record and its live collections and writes both back.
  const collisionState = {
    get hitStop() { return transient.impact.hitStop; }, set hitStop(value: number) { transient.impact.hitStop = value; },
    get slowMotion() { return transient.impact.slowMotion; }, set slowMotion(value: number) { transient.impact.slowMotion = value; },
    get shake() { return transient.impact.shake; }, set shake(value: number) { transient.impact.shake = value; },
    get enemies() { return world.state.enemies(); }, set enemies(value: unknown[]) { world.state.setEnemies(value as never[]); },
    get projectiles() { return world.state.projectiles(); }, set projectiles(value: unknown[]) { world.state.setProjectiles(value as never[]); },
    get floaters() { return world.state.floaters(); }, set floaters(value: unknown[]) { world.state.setFloaters(value as never[]); },
  } as unknown as LiveCollisionPhaseHost["state"];
  const collisionEffects = {
    burst: note("fx:burst"), ring: note("fx:ring"), flash: note("fx:flash"), ribbon: note("fx:ribbon"),
    explode: note("fx:explode"), floater: note("fx:floater"), shake: note("fx:shake"), zoom: note("fx:zoom"),
    buzz: note("fx:buzz"), sound: (name: string) => { outward.push(`hit:${name}`); },
    style: (kind: string) => { style.addStyle(kind); }, tutorial: note("fx:tutorial"),
  };
  const collision = {
    get player() { return player(); }, get blade() { return blade(); },
    get run() { return world.state.run() as never; },
    get combat() {
      if (combat === null) throw new Error("detached combat runtime has not been composed");
      return combat;
    }, width: CONFIG.view.w, state: collisionState,
    // The production weapon hook, exactly as the live combat adapter calls it.
    // A hand-rolled damage rule here would silently diverge from the live world.
    weaponHit: (enemy: unknown, quality: number, damage: number, slam: boolean, launch: boolean, empowered: boolean) => {
      outward.push("weaponHit");
      return invokeWeaponHook((blade() as { weapon?: object | null }).weapon, "onHeldHit",
        { blade: blade(), player: player(), enemy, quality, damage, isSlam: slam, isLaunch: launch, empowered }) as never;
    },
    throwHit: (enemy: unknown, secondary: boolean, throwId: number) => {
      outward.push("throwHit");
      return invokeWeaponHook((blade() as { weapon?: object | null }).weapon, "onThrowHit",
        { blade: blade(), player: player(), enemy, secondary, throwId }) as never;
    },
    runDamageMultiplier: () => 1, noteFirstDamage: note("noteFirstDamage"),
    logWeapon: (type: string) => { outward.push(`logWeapon:${type}`); },
    emitThrowResolve: note("emitThrowResolve"),
    onKill: (enemy: { dead?: boolean }, cause?: string) => { resolveKill(enemy, cause); },
    addFloater: note("addFloater"), effects: collisionEffects,
    sound: (cue: string) => { outward.push(`sound:${cue}`); }, flare: note("flare"),
    addShake: note("addShake"), addZoom: note("addZoom"), addFlash: note("addFlash"),
    addStyle: (kind: string) => { style.addStyle(kind); },
    segmentCircle: (x1: number, y1: number, x2: number, y2: number, x: number, y: number, radius: number) =>
      segCircle(x1, y1, x2, y2, x, y, radius),
    segmentPointDistance: (x1: number, y1: number, x2: number, y2: number, x: number, y: number) =>
      segPointDist(x1, y1, x2, y2, x, y),
    weaponSegmentContact: () => false,
    distance: (x: number, y: number) => len(x, y), clamp, lerp,
    nearestEnemy: () => (world.state.enemies()[0] ?? null) as never,
    areaDamage: () => 0, lobExplode: note("lobExplode"),
    splitProjectile: (projectile: never) => { style.splitProjectile(projectile); },
    triggerSlowMotion: note("triggerSlowMotion"), emitPerfectParry: note("emitPerfectParry"),
    makeHitEvent: note("makeHitEvent"), makeSwingEvent: note("makeSwingEvent"), makeSlamEvent: note("makeSlamEvent"),
    makeReturnEvent: note("makeReturnEvent"), makePerfectParryEvent: note("makePerfectParryEvent"),
    profileAdd: () => undefined, profileMax: () => undefined, dailyBump: () => undefined,
    achievementsEnabled: nativeTracking, achievement: note("achievement"), checkAchievements: () => undefined,
    tutorialMark: () => undefined,
    enemyDefeated: (enemy: object & { id?: string }) => {
      if (options.gameplayEvents === undefined || actorId === null) return;
      options.gameplayEvents.emit({ kind: "death", actorId: actorId(enemy), cause: "combat" });
    },
    ghostRecording: () => nativeTracking() && actorId !== null,
    ghostSample: () => undefined, ghostRevive: note("ghostRevive"),
    updateTrick: (seconds: number) => { style.update(seconds); },
    achievementTick: (seconds: number) => { style.achievements.tick(seconds); }, updateTutorial: () => undefined,
    updatePlayground: () => undefined, overlap: aabbOverlap,
    onShieldAbsorb: note("onShieldAbsorb"), loseStyle: () => { style.loseStyle(); }, buzz: () => undefined,
    requestAdContinue: note("requestAdContinue"), adAvailable: () => false,
    endRun: options.endRun ?? note("endRun"),
  } as unknown as LiveCollisionPhaseHost;

  const kill = {
    enemies: () => world.state.enemies() as never,
    projectiles: () => world.state.projectiles() as never,
    run: () => world.state.run() as never,
    player: () => world.state.player() as never,
    now: () => detached.clock.sim,
    stageIndex: () => stage.index,
    finalStageIndex: STAGES.length - 1,
    stageAccent: () => stageAt(stage.index).accent,
    stageChapterBossOutro: () => stageAt(stage.index).chapter.bossOutro,
    hasStageChapter: () => true,
    bossRosterSize: BOSS_ROSTER.length,
    achievementsEnabled: nativeTracking,
    addKillScore: () => { addKillScore(world.state.run() as never, CONFIG.run.scorePerKill, CONFIG.run.scoreMult); },
    addStat: () => undefined, maxStat: () => undefined, bumpDaily: () => undefined,
    bossKillAchievement: note("bossKillAchievement"), killAchievement: note("killAchievement"),
    checkAchievements: () => undefined,
    bossGhostMoment: (enemy: Readonly<{ x: number; y: number }>) => {
      outward.push("bossGhostMoment");
      options.gameplayEvents?.emit({ kind: "effect", effect: "bossKill", x: enemy.x, y: enemy.y });
    },
    deathEffect: note("deathEffect"), deathSound: note("deathSound"),
    makeDeathEvent: (enemy: unknown, cause: string | undefined, cleanElimination: boolean) =>
      Object.freeze({ enemy, cause, cleanElimination }),
    fire: (hooks: unknown, event: unknown) => {
      if (Array.isArray(hooks)) {
        for (const hook of hooks) if (typeof hook === "function") (hook as (value: unknown) => void)(event);
      }
    },
    applySever: (enemy: { applySever?: (tier: number) => void }, tier: number) => { enemy.applySever?.(tier); },
    ring: note("killRing"),
    restorePlatforms: (value: unknown[]) => { stage.platforms = [...value]; },
    releaseCamera: note("releaseCamera"), happyTime: note("happyTime"), bossPresentation: note("bossPresentation"),
    releaseStolenBlade: (enemy: unknown) => {
      const weapon = blade() as { hostile?: boolean; stolenBy?: unknown; state?: string };
      if (weapon.stolenBy === enemy) { weapon.hostile = false; weapon.stolenBy = null; weapon.state = "returning"; }
    },
  } as unknown as LiveKillHost;

  return Object.freeze({
    outward, get combat() {
      if (combat === null) throw new Error("detached combat runtime has not been composed");
      return combat;
    }, opening, collision, combatEntities: entityHooks, kill,
    installCombat(runtime: CombatEntityRuntime, killResolver: typeof resolveKill,
      identify?: (enemy: object & { id?: string }) => string): void {
      combat = runtime; resolveKill = killResolver; actorId = identify ?? null;
    },
    step(seconds: number): void {
      if (runLiveOpeningPhase(opening, seconds).blocked) return;
      runLiveCollisionPhase(collision, seconds);
    },
  });
}

/** Portable production outcome controller with persistence/presentation replaced by recorded adapters. */
export function createDetachedRunOutcomeController(
  detached: DetachedWorld,
  events: TearGameplayEventPort,
) {
  const outward: string[] = [];
  let pendingFinale: unknown = null;
  let presented: Readonly<{ outcome: "defeat" | "victory"; result: unknown }> | null = null;
  const active = () => detached.world.state.run() as never as Record<string, unknown>;
  const publishTerminal = createTearTerminalRunFactPublisher(
    events, () => detached.world.lifecycle.snapshot().sessionId,
  );
  const port: LiveOutcomeControllerPort = {
    snapshot: () => snapshotOutcomeRun(active() as never),
    replaceWaveLog: (log) => { active().waveLog = [...log]; },
    waveActive: () => detached.world.lifecycle.isWaveActive,
    preparedVictory: () => (active()._victoryPrepared as PreparedVictory | null | undefined) ?? null,
    storePreparedVictory: (prepared) => { active()._victoryPrepared = prepared; },
    stopClipper: () => { outward.push("stopClipper"); },
    terminate: (outcome) => { detached.world.lifecycle.terminate(outcome); },
    publishTerminal,
    saveBest: () => false,
    best: (run) => ({ wave: run.wave, score: run.score, time: run.runTime }),
    awardCoins: () => 0, coins: () => 0, achievementTracking: () => false,
    economyTelemetry: () => Object.freeze({}), recordDefeatProgress: () => undefined,
    executeVictoryIntents: (intents) => { outward.push(...intents.map((intent) => `victory:${intent.type}`)); },
    persistPendingFinale: (record) => { pendingFinale = structuredClone(record); outward.push("persistFinale"); },
    saveProfile: () => { outward.push("saveProfile"); },
    clearPendingFinale: () => { pendingFinale = null; outward.push("clearFinale"); },
    pushCloud: () => { outward.push("pushCloud"); },
    present: (outcome, result) => { presented = Object.freeze({ outcome, result }); outward.push(`present:${outcome}`); },
    midgame: (callback) => { callback(); }, restartCurrentRun: () => undefined,
  };
  return Object.freeze({ controller: new LiveRunOutcomeController(port), outward,
    pendingFinale: () => pendingFinale, presented: () => presented });
}

/**
 * Composes the production finale controller/runtime over a detached world.
 * Gameplay-bearing intents mutate the detached world; presentation/audio
 * intents are retained as an outward stream instead of being silently lost.
 */
export function createDetachedFinaleComposition(
  detached: DetachedWorld,
  events: TearGameplayEventPort,
  outcome = createDetachedRunOutcomeController(detached, events),
) {
  const { world, effects, stage } = detached;
  const outward: string[] = [];
  const intentBatches: (readonly FinaleIntent[])[] = [];
  const runtime: FinaleRuntimeState = {
    finale: null,
    finaleController: new FinaleController(CONFIG.finale),
    resetFinale() {
      this.finaleController = new FinaleController(CONFIG.finale);
      this.finale = null;
    },
    syncFinale() {
      this.finale = this.finaleController.state;
      return this.finale;
    },
  };
  const run = () => world.state.run() as never as Record<string, unknown>;
  const player = () => world.state.player() as never as {
    x: number; y: number; vx: number; vy: number; hw: number; onGround: boolean;
  };
  const blade = () => world.state.blade() as never as {
    x: number; y: number; vx: number; vy: number; tipVX?: number; tipVY?: number;
    finalFree?: boolean; restoredTrail?: boolean; hostile?: boolean; stolenBy?: unknown; state?: string;
    handPos?(actor: ReturnType<typeof player>): Readonly<{ x: number; y: number }>;
  };
  const finale = createFinaleRuntime({
    runtime,
    cinema: {
      start: (script, context) => {
        // Finale callbacks own their FinaleState through `runtime`; the
        // director only needs a structural context object for callback shape.
        world.context.cinema.start(script as never, context as never);
      },
    },
    run: () => run() as never,
    player,
    blade,
    prepareVictory: (campaign, persistFinale) => outcome.controller.prepareVictory(campaign, persistFinale),
    win: (campaign) => { outcome.controller.victory(campaign); },
    formatTime: (seconds) => seconds.toFixed(2),
    viewport: { width: CONFIG.view.w, height: CONFIG.view.h },
    perfectColor: () => CONFIG.colors.perfect,
    observeIntents: (intents) => { intentBatches.push(intents); },
    reducedMotion: () => false,
    lowGraphics: () => false,
    intents: {
      beginLifecycle: () => { world.lifecycle.beginFinale(); },
      clearCombat: () => {
        world.state.setEnemies([]); world.state.setProjectiles([]);
        world.state.setSlowZones([]); world.state.setTemporaryWalls([]);
        const active = run();
        if (Array.isArray(active.spawnQueue)) active.spawnQueue.length = 0;
        active.chapterState = "WAVE_LIVE";
      },
      freezeVoid: () => {
        const active = run();
        const scroll = active.voidScroll;
        if (typeof scroll === "object" && scroll !== null) {
          (scroll as { active?: boolean; frozen?: boolean }).active = false;
          (scroll as { active?: boolean; frozen?: boolean }).frozen = true;
        }
        active.voidDescent = null;
      },
      worldZoom: (value) => { outward.push(`worldZoom:${String(value)}`); },
      finalBlade: (active, restoredTrail) => {
        const weapon = blade();
        weapon.finalFree = active;
        if (restoredTrail) weapon.restoredTrail = true;
        if (!active) return;
        weapon.hostile = false; weapon.stolenBy = null; weapon.state = "held";
        const hand = weapon.handPos?.(player());
        if (hand !== undefined) { weapon.x = hand.x; weapon.y = hand.y; }
        weapon.vx = 0; weapon.vy = 0;
      },
      ring: (x, y, radius, color) => { effects.ring(x, y, radius, color); },
      burst: (x, y, dx, dy, count, color) => { effects.burst(x, y, dx, dy, count, color); },
      flash: (amount) => { outward.push(`flash:${String(amount)}`); },
      shake: (amount) => { outward.push(`shake:${String(amount)}`); },
      vibrate: (pattern) => { outward.push(`vibrate:${pattern.join(",")}`); },
      sound: (cue, index) => { outward.push(`sound:${cue}:${String(index)}`); },
      restoreStageZero: () => {
        stage.index = 0; stage.platforms = stagePlatforms(0);
        world.state.setSlowZones([]); world.state.setTemporaryWalls([]);
        world.state.setProjectiles([]); world.state.setEnemies([]);
      },
      restorePlayer: (xMin, xMax, yMax, vy) => {
        const actor = player();
        actor.x = clamp(actor.x, actor.hw + xMin, xMax - actor.hw);
        actor.y = Math.min(actor.y, yMax); actor.vx = 0; actor.vy = vy; actor.onGround = false;
      },
      voidMix: (amount, duration) => { outward.push(`voidMix:${String(amount)}:${String(duration)}`); },
      musicDuck: (amount, duration) => { outward.push(`musicDuck:${String(amount)}:${String(duration)}`); },
      win: (campaign) => { outcome.controller.victory(campaign); },
    },
  });
  const api = {
    start: finale.start,
    severAnchor: finale.severAnchor,
    beginRestoration: finale.beginRestoration,
    snapshot: (): FinaleState | null => runtime.finale,
    markLanded: () => { runtime.finaleController.markLanded(); runtime.syncFinale(); },
    tryBladeCut: finale.tryBladeCut,
    outcome,
    get intentBatches() { return Object.freeze([...intentBatches]); },
    get outward() { return Object.freeze([...outcome.outward, ...outward]); },
    /** Director time is live-frame time; the supplied callback remains the one real simulation application frame. */
    advanceApplicationFrame<Result>(
      seconds: number,
      advanceSimulationApplicationFrame: (seconds: number) => Result,
      controls: Readonly<{ key?: boolean; touch?: boolean; pad?: boolean; click?: boolean }> = {},
    ): Result {
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("application frame seconds must be finite and non-negative");
      world.context.cinema.update(seconds, controls);
      return advanceSimulationApplicationFrame(seconds);
    },
  };
  return Object.freeze(api);
}

/** Uses the same gameplay-only combat/scheduler assembly as the live browser host. */
export function createDetachedCombatSimulation<State>(
  detached: DetachedWorld,
  options: DetachedCombatSimulationOptions<State>,
) {
  const phases = createDetachedCombatPhases(detached, { ...options, deferCombatRuntime: true });
  const core = createTearCombatSimulation<State>({
    ...(options.gameplayEvents === undefined ? {} : { gameplayEvents: options.gameplayEvents }),
    combatEntities: phases.combatEntities,
    kill: phases.kill,
    createCombat: ({ combatEntities, resolveKill: coreResolveKill }) => {
      phases.installCombat(combatEntities, coreResolveKill as never,
        (enemy) => combatEntities.id(enemy, "enemy"));
      return {
        opening: phases.opening,
        collision: phases.collision,
        advanceClock: (seconds) => { detached.clock.sim += seconds; },
        captureProtection: () => undefined,
        applyProtection: () => undefined,
      };
    },
    authoritative: { actionPort: detached.input.actionPort,
      snapshot: (tick, input) => options.snapshot(tick, input) },
  });
  return Object.freeze({ ...core, outward: phases.outward, opening: phases.opening, collision: phases.collision });
}

/**
 * Builds the production content and wave runtimes over a detached world.
 *
 * Wave planning, spawn scheduling, and enemy construction are the real
 * production implementations; only outward presentation (banners, audio,
 * bloom, profile counters, pointer release) is recorded instead of performed.
 */
export function createDetachedWaveRuntime(
  detached: DetachedWorld,
  platforms?: readonly unknown[],
  nativeFacts?: Readonly<{
    events: TearGameplayEventPort;
    actorId: (enemy: Readonly<{ x: number; y: number }>) => string;
  }>,
  progression?: Readonly<{
    openDraft: () => void;
    openTier: (choices: readonly UpgradeDefinition[]) => void;
    startAdventureFinale?: () => void;
    winRun?: () => void;
  }>,
) {
  const { world, random, factories, stage } = detached;
  if (platforms !== undefined) stage.platforms = [...platforms];
  const outward: string[] = [];
  const note = (name: string) => () => { outward.push(name); };
  const publishSpawn = nativeFacts === undefined ? note("recordSpawn")
    : createTearSpawnFactPublisher(nativeFacts.events, nativeFacts.actorId);
  const publishWave = nativeFacts === undefined ? note("recordWave")
    : createTearWaveFactPublisher(nativeFacts.events);
  const run = () => world.state.run() as never as Record<string, unknown>;
  const install = (enemy: unknown) => { world.state.setEnemies([...world.state.enemies(), enemy as never]); };
  // The same shared placement the live content composition uses; a restated
  // copy here is exactly how a detached world silently diverges.
  const makeBoss = (id: string) => {
    const placement = planBossPlacement(id, CONFIG.view.w, CONFIG);
    return world.entities.createEnemy(placement.factoryId, placement.x, placement.y, run() as never) as never;
  };
  const content = createLiveContentRuntime({
    width: CONFIG.view.w,
    random: random.streams.stream("spawn"),
    run: () => {
      const active = run() as unknown as { mode: string; wave: number; curBoss?: string };
      return { mode: active.mode, wave: active.wave,
        ...(active.curBoss === undefined ? {} : { curBoss: active.curBoss }) };
    },
    modes: () => CONFIG.modes as never,
    stages: STAGES,
    platforms: () => stage.platforms as never,
    groundY: () => CONFIG.world.groundY,
    construction: {
      sideSpawn: () => 0,
      createGround: (kind: string) => world.entities.createEnemy(kind, 0, 0, run() as never) as never,
      createAir: (kind: string, x: number, y: number) => world.entities.createEnemy(kind, x, y, run() as never) as never,
      createSupport: (kind: string) => world.entities.createEnemy(kind, 0, 0, run() as never) as never,
      createBoss: (id?: string) => makeBoss(id ?? ""),
      // The canonical half of a boss encounter — intro freeze, fight clock,
      // carried adds, arena swap — is the shared production routine. Only the
      // banner/wipe/clip presentation is recorded.
      beginBossPresentation: (enemy: unknown) => {
        beginBossEncounter(run() as never, enemy as never, CONFIG.bossTheater.introDur, {
          platforms: () => stage.platforms as never[],
          setPlatforms: (value: never[]) => { stage.platforms = value; },
          arenaFor: (bossId: string) => createBossArena(bossId, CONFIG.view.w, CONFIG.view.h,
            CONFIG.world.groundY, CONFIG.bossArena.reformWarn)?.map((platform) => ({ ...platform })) as never[] | null ?? null,
        });
        note("bossPresentation")();
      },
    },
    spawning: {
      random: random.streams.stream("spawn"),
      run: () => run() as never,
      campaignStage: () => stage.index,
      contentWave: () => 0,
      groundSpawn: () => ({ x: 0, y: 0 }),
      applyPreset: (enemy: unknown, preset: unknown) => { applyPreset(enemy as never, preset as never); },
      rollVariant: (kind: string, wave: number) => rollVariant(kind as never, wave, random.streams.stream("spawn")),
      applyVariant: (enemy: unknown, variant: unknown) => { applyVariant(enemy as never, variant as never); },
      rollAffixes: (enemy: unknown, wave: number) => { rollAffixes(enemy as never, wave, random.streams.stream("spawn")); },
      arrivalEffect: note("arrivalEffect"),
      recordSpawn: publishSpawn,
      install,
    },
    createBoss: (id: string) => makeBoss(id),
  });
  const waves = createLiveWaveHost({
    run: () => run() as never,
    tuning: () => CONFIG.run,
    stages: STAGES as never,
    presets: PRESETS,
    random: random.streams.stream("world"),
    modeDefinition: (mode: string) => CONFIG.modes.find((candidate) => candidate.id === mode) ?? {},
    currentStage: () => ({ index: stage.index, accent: stageAt(stage.index).accent }),
    stageHasChapter: () => true,
    chapterFlowActive: () => false,
    lifecycle: {
      hasPreparedWave: () => world.lifecycle.hasPreparedWave,
      isWaveActive: () => world.lifecycle.isWaveActive,
      pendingReward: () => world.lifecycle.reward,
    },
    planIntents: {
      beginWipe: note("beginWipe"), loadStage: note("loadStage"), setStageBanner: note("setStageBanner"),
      beginCampaignChapter: () => false, recordWave: publishWave, snapshotReplay: note("snapshotReplay"),
      prepareWave: (wave: number, boss: boolean, deferred: boolean) => { world.lifecycle.prepareWave(wave, boss, deferred); },
      activateWave: () => { world.lifecycle.activateWave(); },
      showWaveBanner: note("showWaveBanner"), playWaveSound: note("playWaveSound"),
    },
    clearIntents: {
      clearWave: () => { world.lifecycle.clearWave(); },
      bloom: note("bloom"), recordWave: publishWave, profileMax: note("profileMax"),
      profileAdd: note("profileAdd"), dailyBump: note("dailyBump"), hordeCleared: note("hordeCleared"),
      achievementCheck: note("achievementCheck"), stageDone: note("stageDone"),
      healPlayer: (amount: number) => { (world.state.player() as never as { heal(value: number): void }).heal(amount); },
      prepareReward: (reward: unknown) => { world.lifecycle.prepareReward(reward as never); },
      startAdventureFinale: progression?.startAdventureFinale ?? note("startAdventureFinale"),
      winRun: progression?.winRun ?? note("winRun"), releasePointer: note("releasePointer"),
      openTierUp: () => {
        const current = run() as unknown as { mods: { owned: Readonly<Record<string, number>>;
          tier: Readonly<Record<string, number>> } };
        progression?.openTier(eligibleTierChoices(UPGRADES, current.mods.owned, current.mods.tier));
        if (progression === undefined) note("openTierUp")();
      },
      openDraft: progression?.openDraft ?? note("openDraft"),
    },
    spawn: (spec: unknown) => { content.spawn(spec as never); },
    enemyCount: () => world.state.enemies().length,
    loreBusy: () => false,
    achievementTracking: () => false,
    playerOneHit: () => (world.state.player() as never as { oneHit: boolean }).oneHit,
    availableTierUpCount: () => {
      const current = run() as unknown as { mods: { owned: Readonly<Record<string, number>>;
        tier: Readonly<Record<string, number>> } };
      return eligibleTierChoices(UPGRADES, current.mods.owned, current.mods.tier).length;
    },
    install: () => undefined,
  });
  void factories;
  return Object.freeze({ content, waves, outward, update: (dt: number) => { waves.update(dt); } });
}

/** One portable wave/reward/action composition for detached replay and headless evidence. */
export function createDetachedWaveRewardRuntime(
  detached: DetachedWorld,
  events: TearGameplayEventPort,
  actorId: (enemy: Readonly<{ x: number; y: number }>) => string,
  platforms?: readonly unknown[],
  finale = createDetachedFinaleComposition(detached, events),
) {
  let reward: ReturnType<typeof createRewardRuntime<UpgradeDefinition>> | null = null;
  let screen = "playing";
  const outward: string[] = [];
  const run = () => detached.world.state.run() as never as ReturnType<typeof detachedRun>;
  const waves = createDetachedWaveRuntime(detached, platforms, { events, actorId }, {
    openDraft: () => { if (reward === null) throw new Error("detached reward runtime is not installed"); reward.openDraft(); },
    openTier: (choices) => { if (reward === null) throw new Error("detached reward runtime is not installed"); reward.openTier(choices); },
    startAdventureFinale: () => { finale.start(); },
  });
  reward = createRewardRuntime<UpgradeDefinition>({
    run: () => run() as never,
    roll: (request) => rollUpgrades(request.count, run().mods, {
      random: detached.random.streams.stream("draft"), forceSpecial: request.forceSpecial,
      excludeIds: request.excludeIds,
    }),
    transitionPorts: {
      applyUpgrade: (choice) => { applyUpgrade(choice, {
        player: detached.world.state.player() as never, blade: detached.world.state.blade() as never,
        mods: run().mods,
      }); },
      tierUp: (choice) => { tierUp(choice.id, {
        player: detached.world.state.player() as never, blade: detached.world.state.blade() as never,
        mods: run().mods,
      }); },
      ghostLoadout: (choiceId, tier, wave) => { events.emit({ kind: "loadout", choiceId, tier, wave }); },
      ghostEvent: (effect) => {
        const player = detached.world.state.player() as never as { x: number; y: number };
        events.emit({ kind: "effect", effect, x: player.x, y: player.y });
      },
      consumeInput: () => { outward.push("consumeInput"); }, resetUi: () => { outward.push("resetUi"); },
      setScreen: (next) => { screen = next; }, startNextWave: () => { waves.waves.startNextWave(); },
      requestPointer: () => { outward.push("requestPointer"); },
    },
  });
  const activeReward = reward;
  const routing = {
    screen: () => screen, setScreen: (next: "playing" | "paused") => { screen = next; },
    runMode: () => run().mode, reward: () => activeReward.snapshot(),
    chooseUpgrade: (index: number) => { activeReward.selectDraft(index); },
    chooseReserve: (index: number) => { activeReward.selectReserve(index); },
    chooseTier: (index: number) => { activeReward.selectTier(index); },
    dispatchPlayground: () => undefined, renderControls: () => undefined,
    controls: () => [], focus: () => -1,
  };
  return Object.freeze({ ...waves, reward: activeReward, finale,
    get outward() { return Object.freeze([...waves.outward, ...outward]); },
    screen: () => screen, routeAction: (action: GameAction) => routeLiveTearBenchAction(routing, action) });
}

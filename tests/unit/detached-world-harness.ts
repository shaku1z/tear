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
import { runLiveCollisionPhase, type LiveCollisionPhaseHost } from "../../src/gameplay/combat/live-collision-phase";
import { runLiveOpeningPhase, type LiveOpeningPhaseHost } from "../../src/gameplay/combat/live-opening-phase";
import { invokeWeaponHook } from "../../src/gameplay/combat/weapon-runtime-coordinator";
import { updateMirrorCombat } from "../../src/gameplay/combat/mirror-combat-feedback";
import { cosmeticRandom } from "../../src/presentation/cosmetic-random";
import { PRESETS, applyPreset, rollAffixes } from "../../src/gameplay/affixes";
import { createLiveContentRuntime } from "../../src/gameplay/run/live-content-runtime";
import { createLiveWaveHost } from "../../src/app/live-wave-host";
import { STAGES, stageAt } from "../../src/gameplay/stages";
import { applyVariant, rollVariant } from "../../src/gameplay/variants";
import { planBossPlacement } from "../../src/gameplay/run/boss-placement";
import { beginBossEncounter } from "../../src/gameplay/run/boss-encounter";
import { createBossArena } from "../../src/gameplay/training/arena-rules";
import { applyWeapon } from "../../src/gameplay/weapons";
import { newMods } from "../../src/gameplay/upgrades";
import { createTearWorldClock } from "../../src/gameplay/runtime/tear-world-clock";
import { CinematicTimeline } from "../../src/gameplay/runtime/cinematic-director";
import { parseCampaignChapterBindingSpec, stageCampaignChapterBinding } from
  "../../src/gameplay/campaign/chapter-cinematic-binding";
import type { ChapterIntent } from "../../src/gameplay/campaign/chapter-controller";
import { stepCinematicPlayer } from "../../src/gameplay/campaign/cinematic-player-runtime";
import { createTearWorldTransientState } from "../../src/gameplay/runtime/tear-world-transient-state";
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
    mode, mods: newMods(), mult: 1, lifestealCd: 0, weaponId: "sword", wave: 1, score: 0, runTime: 0,
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
    loseStyle: note("loseStyle"), shieldAbsorbed: note("shieldAbsorbed"), addStyle: note("addStyle"),
    dashDodge: note("dashDodge"), maxStat: note("maxStat"), checkAchievements: note("checkAchievements"),
    noteFirstDamage: note("noteFirstDamage"), reflectedHit: note("reflectedHit"), bossHit: note("bossHit"),
    onKill: (enemy: { dead?: boolean }) => { enemy.dead = true; outward.push("onKill"); },
    areaDamage: () => 0,
  } as unknown as CombatEntityRuntimeHooks;
  const combat = new CombatEntityRuntime(entityHooks);

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
        finale: null, lerp, clamp, onFinaleLanded: () => undefined,
        onFinaleBladeCut: () => undefined, onLanding: () => undefined });
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
    styleHit: note("styleHit"),
    onKill: (enemy: { dead?: boolean }) => { enemy.dead = true; outward.push("onKill"); },
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
    style: note("fx:style"), tutorial: note("fx:tutorial"),
  };
  const collision = {
    get player() { return player(); }, get blade() { return blade(); },
    get run() { return world.state.run() as never; },
    combat, width: CONFIG.view.w, state: collisionState,
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
    onKill: (enemy: { dead?: boolean }) => { enemy.dead = true; outward.push("onKill"); },
    addFloater: note("addFloater"), effects: collisionEffects,
    sound: (cue: string) => { outward.push(`sound:${cue}`); }, flare: note("flare"),
    addShake: note("addShake"), addZoom: note("addZoom"), addFlash: note("addFlash"), addStyle: note("addStyle"),
    segmentCircle: (x1: number, y1: number, x2: number, y2: number, x: number, y: number, radius: number) =>
      segCircle(x1, y1, x2, y2, x, y, radius),
    segmentPointDistance: (x1: number, y1: number, x2: number, y2: number, x: number, y: number) =>
      segPointDist(x1, y1, x2, y2, x, y),
    weaponSegmentContact: () => false,
    distance: (x: number, y: number) => len(x, y), clamp, lerp,
    nearestEnemy: () => (world.state.enemies()[0] ?? null) as never,
    areaDamage: () => 0, lobExplode: note("lobExplode"), splitProjectile: note("splitProjectile"),
    triggerSlowMotion: note("triggerSlowMotion"), emitPerfectParry: note("emitPerfectParry"),
    makeHitEvent: note("makeHitEvent"), makeSwingEvent: note("makeSwingEvent"), makeSlamEvent: note("makeSlamEvent"),
    makeReturnEvent: note("makeReturnEvent"), makePerfectParryEvent: note("makePerfectParryEvent"),
    profileAdd: () => undefined, profileMax: () => undefined, dailyBump: () => undefined,
    achievementsEnabled: () => false, achievement: note("achievement"), checkAchievements: () => undefined,
    tutorialMark: () => undefined,
    ghostRecording: () => false, ghostDeath: note("ghostDeath"), ghostSample: () => undefined, ghostRevive: note("ghostRevive"),
    updateTrick: () => undefined, achievementTick: () => undefined, updateTutorial: () => undefined,
    updatePlayground: () => undefined, overlap: aabbOverlap,
    onShieldAbsorb: note("onShieldAbsorb"), loseStyle: note("loseStyle"), buzz: () => undefined,
    requestAdContinue: note("requestAdContinue"), adAvailable: () => false, endRun: note("endRun"),
  } as unknown as LiveCollisionPhaseHost;

  return Object.freeze({
    outward, combat, opening, collision,
    step(seconds: number): void {
      if (runLiveOpeningPhase(opening, seconds).blocked) return;
      runLiveCollisionPhase(collision, seconds);
    },
  });
}

/**
 * Builds the production content and wave runtimes over a detached world.
 *
 * Wave planning, spawn scheduling, and enemy construction are the real
 * production implementations; only outward presentation (banners, audio,
 * bloom, profile counters, pointer release) is recorded instead of performed.
 */
export function createDetachedWaveRuntime(detached: DetachedWorld, platforms?: readonly unknown[]) {
  const { world, random, factories, stage } = detached;
  if (platforms !== undefined) stage.platforms = [...platforms];
  const outward: string[] = [];
  const note = (name: string) => () => { outward.push(name); };
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
      recordSpawn: note("recordSpawn"),
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
      beginCampaignChapter: () => false, recordWave: note("recordWave"), snapshotReplay: note("snapshotReplay"),
      prepareWave: (wave: number, boss: boolean, deferred: boolean) => { world.lifecycle.prepareWave(wave, boss, deferred); },
      activateWave: () => { world.lifecycle.activateWave(); },
      showWaveBanner: note("showWaveBanner"), playWaveSound: note("playWaveSound"),
    },
    clearIntents: {
      clearWave: () => { world.lifecycle.clearWave(); },
      bloom: note("bloom"), recordWave: note("recordWave"), profileMax: note("profileMax"),
      profileAdd: note("profileAdd"), dailyBump: note("dailyBump"), hordeCleared: note("hordeCleared"),
      achievementCheck: note("achievementCheck"), stageDone: note("stageDone"),
      healPlayer: (amount: number) => { (world.state.player() as never as { heal(value: number): void }).heal(amount); },
      prepareReward: (reward: unknown) => { world.lifecycle.prepareReward(reward as never); },
      startAdventureFinale: note("startAdventureFinale"), winRun: note("winRun"),
      releasePointer: note("releasePointer"), openTierUp: note("openTierUp"), openDraft: note("openDraft"),
    },
    spawn: (spec: unknown) => { content.spawn(spec as never); },
    enemyCount: () => world.state.enemies().length,
    loreBusy: () => false,
    achievementTracking: () => false,
    playerOneHit: () => (world.state.player() as never as { oneHit: boolean }).oneHit,
    availableTierUpCount: () => 0,
    install: () => undefined,
  });
  void factories;
  return Object.freeze({ content, waves, outward, update: (dt: number) => { waves.update(dt); } });
}

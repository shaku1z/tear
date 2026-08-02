import { aabbOverlap, clamp, len, lerp, segCircle, segPointDist } from "../domain/geometry";
import { CombatEntityRuntime, type CombatEntityRuntimeHooks } from "../gameplay/combat/combat-entity-runtime";
import { runLiveCollisionPhase, type LiveCollisionPhaseHost } from "../gameplay/combat/live-collision-phase";
import type { LiveKillHost } from "../gameplay/combat/live-kill-runtime";
import { runLiveOpeningPhase, type LiveOpeningPhaseHost } from "../gameplay/combat/live-opening-phase";
import { updateMirrorCombat } from "../gameplay/combat/mirror-combat-feedback";
import { addKillScore, invokeWeaponHook } from "../gameplay/combat/weapon-runtime-coordinator";
import { stepCinematicPlayer } from "../gameplay/campaign/cinematic-player-runtime";
import { tracksAchievements } from "../gameplay/progression/achievement-runtime";
import { BOSS_ROSTER } from "../gameplay/run/content-director";
import { createLiveStyleAchievementRuntime } from "../gameplay/scoring/live-style-achievement-runtime";
import type { TearGameplayEventPort } from "../gameplay/runtime/gameplay-events";
import { STAGES, stageAt } from "../gameplay/stages";
import { cosmeticRandom } from "../presentation/cosmetic-random";
import type { ProductionReplayWorld } from "./production-world-factory";

/**
 * The C27A combat adapter assembled over a source-owned replay world. It
 * records semantic outward intent rather than pretending to render, play, or
 * persist device output.
 */
export interface ProductionCombatPhaseOptions {
  /** Defaults to the replay world's arena; hydration may supply its own platforms. */
  readonly platforms?: readonly unknown[];
  /** The production wave update, when the caller wants live content spawning. */
  readonly updateWave?: (dt: number) => void;
  /** Core composition defers identity-runtime construction to its factory. */
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

/**
 * Builds the same opening and collision hosts used by live combat over one
 * source-owned world. Its outward adapter intentionally records only semantic
 * intent: pixel, PCM/device, haptic, and durable-output fidelity are later
 * checkpoint evidence, not a claim made by this composition.
 */
export function createProductionCombatPhases(
  replay: ProductionReplayWorld,
  options: ProductionCombatPhaseOptions = {},
) {
  const { world, effects, transient, input, stage } = replay;
  const config = replay.configuration.value;
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
    tuning: () => config.trick,
    colors: () => config.colors,
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
    projectileSpeed: () => config.proj.speed,
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
    config,
    get player() { return player(); }, get blade() { return blade(); },
    get run() { return world.state.run() as never; },
    get enemies() { return world.state.enemies() as never; },
    get projectiles() { return world.state.projectiles(); },
    get platforms() { return platforms(); }, state: transient.opening, width: config.view.w,
    get blocking() { return world.context.cinema.active && world.context.cinema.blocksCombat; },
    get playerMode() { return world.context.cinema.playerMode; }, protection: transient.protection,
    lowGraphics: false,
    get transformationBlocked() { return world.context.cinema.active && world.context.cinema.blocksCombat; },
    overrunMovementMultiplier: () => 1, runDamageMultiplier: () => 1,
    stepCinematic: (dt: number) => {
      stepCinematicPlayer({ dt, mode: world.context.cinema.playerMode, player: player(), blade: blade(),
        platforms: platforms(), gravity: config.world.gravity, maxFall: config.player.maxFall,
        descentLiftVelocity: config.source.descentLiftV, viewportWidth: config.view.w,
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
      const mirror = replay.factories.mirrorTypes.Mirror as unknown as
        Parameters<typeof updateMirrorCombat>[0] & { fxq?: unknown[] };
      if (updateMirrorCombat(mirror, dt, player(), blade())) outward.push("mirrorShattered");
      if (mirror.fxq !== undefined && mirror.fxq.length > 0) outward.push(`mirrorFx:${String(mirror.fxq.splice(0).length)}`);
      const drained = replay.factories.enemyTypes.BOSSFX.drain();
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
    random: cosmeticRandom,
  } as unknown as LiveOpeningPhaseHost;

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
    config,
    get player() { return player(); }, get blade() { return blade(); },
    get run() { return world.state.run() as never; },
    get combat() {
      if (combat === null) throw new Error("production combat runtime has not been composed");
      return combat;
    }, width: config.view.w, state: collisionState,
    weaponHit: (enemy: unknown, quality: number, damage: number, slam: boolean, launch: boolean, empowered: boolean) => {
      outward.push("weaponHit");
      return invokeWeaponHook((blade() as { weapon?: object | null }).weapon, "onHeldHit",
        { config, blade: blade(), player: player(), enemy, quality, damage, isSlam: slam, isLaunch: launch, empowered }) as never;
    },
    throwHit: (enemy: unknown, secondary: boolean, throwId: number) => {
      outward.push("throwHit");
      return invokeWeaponHook((blade() as { weapon?: object | null }).weapon, "onThrowHit",
        { config, blade: blade(), player: player(), enemy, secondary, throwId }) as never;
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
    config,
    enemies: () => world.state.enemies() as never,
    projectiles: () => world.state.projectiles() as never,
    run: () => world.state.run() as never,
    player: () => world.state.player() as never,
    now: () => replay.clock.sim,
    stageIndex: () => stage.index,
    finalStageIndex: STAGES.length - 1,
    stageAccent: () => stageAt(stage.index).accent,
    stageChapterBossOutro: () => stageAt(stage.index).chapter.bossOutro,
    hasStageChapter: () => true,
    bossRosterSize: BOSS_ROSTER.length,
    achievementsEnabled: nativeTracking,
    addKillScore: () => { addKillScore(world.state.run() as never, config.run.scorePerKill, config.run.scoreMult); },
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
      if (combat === null) throw new Error("production combat runtime has not been composed");
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

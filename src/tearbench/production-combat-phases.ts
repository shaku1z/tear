import { isObject } from "../domain/records";
import { createLiveCollisionGameplayBindings } from "../gameplay/combat/live-collision-gameplay-bindings";
import type { LiveStyleAchievementOptions } from "../gameplay/scoring/live-style-achievement-runtime";
import { bindRunDnaShot, runDnaObserver } from "../gameplay/runtime/run-dna-observer";
import { aabbOverlap, clamp, len, lerp, segCircle, segPointDist } from "../domain/geometry";
import { GFX, THEME } from "../config/game-config";
import {
  CombatEntityRuntime,
  type CombatEntityRuntimeHooks,
  type LiveCombatEntity,
} from "../gameplay/combat/combat-entity-runtime";
import {
  createLiveWeaponRuntime,
  type LiveWeaponEnemy,
  type LiveWeaponEvent,
} from "../gameplay/combat/live-weapon-runtime";
import { bindLiveHammerMeteor } from "../gameplay/combat/live-hammer-meteor";
import { runLiveCollisionPhase, type LiveCollisionPhaseHost } from "../gameplay/combat/live-collision-phase";
import type { LiveKillHost } from "../gameplay/combat/live-kill-runtime";
import { runLiveOpeningPhase, type LiveOpeningPhaseHost } from "../gameplay/combat/live-opening-phase";
import { updateMirrorCombat } from "../gameplay/combat/mirror-combat-feedback";
import { addKillScore, invokeWeaponHook } from "../gameplay/combat/weapon-runtime-coordinator";
import { tracksAchievements } from "../gameplay/progression/achievement-runtime";
import { createLiveStyleAchievementRuntime } from "../gameplay/scoring/live-style-achievement-runtime";
import { BossArenaRules, type ArenaActor, type ArenaPlatform } from "../gameplay/training/arena-rules";
import { createBossArenaRuntimeBridge } from "../gameplay/training/arena-runtime-bridge";
import { isTutorialMark } from "../gameplay/training/tutorial-controller";
import type { TearGameplayEventPort } from "../gameplay/runtime/gameplay-events";
import type { BladeWeaponEvent } from "../gameplay/entities/blade-contracts";
import { STAGES, stageAt } from "../gameplay/stages";
import type { ProductionReplayWorld } from "./production-world-factory";

/**
 * The C27A combat adapter assembled over a source-owned replay world. It
 * records semantic outward intent rather than pretending to render, play, or
 * persist device output.
 */
export interface ProductionCombatPhaseOptions {
  readonly observeStyle?: LiveStyleAchievementOptions<never>["observeStyle"];
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
  // Match the live opening host's semantic color policy at emission time.
  // Theme remains current presentation policy, not restored world state.
  const openingColor = (color?: string): string => {
    if (color === "perfect") return config.colors.perfect;
    if (color === "slam") return config.colors.slam;
    if (color === "ink") return THEME.ink;
    if (color === "bladeTrail") return config.colors.bladeTrail;
    if (color === "reform") return "#c9ccd6";
    if (color === "charger") return config.colors.charger;
    return color ?? config.colors.perfect;
  };
  if (options.platforms !== undefined) stage.platforms = [...options.platforms];
  const platforms = () => stage.platforms as unknown as LiveOpeningPhaseHost["platforms"];
  const outward: string[] = [];
  const note = (name: string) => () => {
    outward.push(name);
  };
  const player = () => world.state.player() as never;
  const blade = () => world.state.blade() as never;
  const bossArena = createBossArenaRuntimeBridge<ArenaActor>({
    rules: new BossArenaRules(config.bossArena, config.colors),
    viewportWidth: config.view.w,
    viewportHeight: config.view.h,
    groundY: config.world.groundY,
    reformWarn: config.bossArena.reformWarn,
    ring: (x, y, radius, color) => {
      effects.ring(x, y, radius, color);
    },
    burst: (x, y, dx, dy, count, color) => {
      effects.burst(x, y, dx, dy, count, color);
    },
    bossEvent: (owner, event, color, quiet) => {
      replay.factories.enemyTypes.BOSSFX.event(owner as never, event, { color, quiet });
      outward.push(`bossArena:${event}`);
    },
    run: () => world.state.run(),
    platforms: () => stage.platforms as ArenaPlatform[],
    player: () => player(),
    enemies: () => world.state.enemies(),
    lowGraphics: () => GFX.low,
  });
  const style = createLiveStyleAchievementRuntime({
    ...(options.observeStyle === undefined ? {} : { observeStyle: options.observeStyle }),
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
      tutorialMark: (kind) => {
        if (isTutorialMark(kind)) replay.tutorial.mark(kind);
        outward.push(`tutorial:${kind}`);
      },
      ghostCapture: (kind, x, y) => {
        options.gameplayEvents?.emit({ kind: "effect", effect: kind, x, y });
      },
      playerTrick: (kind, at) => {
        const activePlayer = player() as { lastTrickKind?: string; lastTrickT?: number };
        activePlayer.lastTrickKind = kind;
        activePlayer.lastTrickT = at;
      },
      rankUp: (rank) => {
        outward.push(`rankUp:${rank}`);
      },
      musicRankChanged: (rank) => {
        outward.push(`musicRank:${rank}`);
      },
      haptic: note("haptic"),
      profileAdd: note("profileAdd"),
      dailyBump: note("dailyBump"),
      profileMax: note("profileMax"),
      achievementCheck: note("achievementCheck"),
    },
    profileMax: note("profileMax"),
    achievementCheck: note("achievementCheck"),
    metaLevel: () => 0,
    projectileSpeed: () => config.proj.speed,
    createProjectile: (x, y, vx, vy) => world.entities.createProjectile(x, y, vx, vy) as never,
    addProjectile: (projectile) => {
      world.state.setProjectiles([...world.state.projectiles(), projectile]);
    },
  });

  let resolveKill: (enemy: { dead?: boolean }, cause?: string) => void = (enemy) => {
    enemy.dead = true;
    outward.push("onKill");
  };
  let actorId: ((enemy: object & { id?: string }) => string) | null = null;
  let weaponRuntime: ReturnType<typeof createLiveWeaponRuntime<LiveWeaponEnemy>> | null = null;
  const requireWeaponRuntime = () => {
    if (weaponRuntime === null) throw new Error("production weapon runtime has not been composed");
    return weaponRuntime;
  };
  type NativeEnemy = ReturnType<typeof world.entities.createEnemy>;
  const seenProjectiles = new WeakSet(),
    terminalProjectiles = new WeakSet();
  const dealArea = (x: number, y: number, radius: number, damage: number, playerOwned = true): number =>
    weaponRuntime?.dealArea(x, y, radius, damage, { playerOwned }) ?? 0;
  const nativeTracking = () => options.gameplayEvents !== undefined && tracksAchievements(world.state.run());
  const emitWeaponFact = (
    event: "throw-launch" | "throw-resolved" | "catch",
    throwId?: number,
    damage?: number,
  ): void => {
    const activeBlade = blade() as { x: number; y: number; throwId: number };
    const activePlayer = player() as { x: number; y: number };
    const activeRun = world.state.run() as { weaponId: string };
    options.gameplayEvents?.emit({
      kind: "weapon",
      event,
      weaponId: activeRun.weaponId,
      throwId: throwId ?? activeBlade.throwId,
      x: event === "catch" ? activePlayer.x : activeBlade.x,
      y: event === "catch" ? activePlayer.y : activeBlade.y,
      ...(damage === undefined ? {} : { damage }),
    });
  };
  const emitBossSupportSpawn = (
    enemy: Record<string, unknown>,
    parent: {
      bossId?: string;
      presentationId?: string;
      kind?: string;
    },
  ): void => {
    if (options.gameplayEvents === undefined) return;
    if (actorId === null) throw new Error("boss support spawn requires an installed production actor identity runtime");
    const bossId = parent.bossId ?? parent.presentationId ?? parent.kind;
    if (typeof bossId !== "string" || typeof enemy.kind !== "string") {
      throw new Error("boss support spawn requires its authoritative actor kind and parent boss identity");
    }
    options.gameplayEvents.emit({
      kind: "spawn",
      actorId: actorId(enemy),
      actorKind: enemy.kind,
      x: Number(enemy.x),
      y: Number(enemy.y),
      variantName: typeof enemy.variantName === "string" ? enemy.variantName : "",
      bossId,
    });
  };
  const emitProjectileFact = (
    event: "spawned" | "deflected" | "owner-changed" | "hit" | "expired",
    projectile: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      deflected?: boolean;
      playerOwned?: boolean;
      sourceEnemy?: unknown;
      owner?: unknown;
      perfect?: unknown;
    },
    target?: object,
  ): void => {
    if (options.gameplayEvents === undefined) return;
    if (combat === null) throw new Error("projectile fact requires an installed production combat runtime");
    if (event === "spawned") {
      if (seenProjectiles.has(projectile)) return;
      seenProjectiles.add(projectile);
    }
    if (event === "expired") {
      if (terminalProjectiles.has(projectile)) return;
      terminalProjectiles.add(projectile);
    }
    const source = projectile.sourceEnemy ?? projectile.owner;
    options.gameplayEvents.emit({
      kind: "projectile",
      event,
      projectileId: combat.id(projectile, "projectile"),
      x: projectile.x,
      y: projectile.y,
      vx: projectile.vx,
      vy: projectile.vy,
      owner: projectile.playerOwned === true || projectile.deflected === true ? "player" : "enemy",
      ...(isObject(source) ? { sourceEnemyId: combat.id(source, "enemy") } : {}),
      ...(target === undefined ? {} : { targetEnemyId: combat.id(target, "enemy") }),
      ...(projectile.deflected === true ? { perfect: !!projectile.perfect } : {}),
    });
  };
  const entityHooks = {
    actors: () => world.state.enemies(),
    projectiles: () => world.state.projectiles(),
    player: () => world.state.player(),
    slowZones: () => world.state.slowZones(),
    setSlowZones: (zones: never[]) => {
      world.state.setSlowZones(zones);
    },
    walls: () => world.state.temporaryWalls(),
    setWalls: (walls: never[]) => {
      world.state.setTemporaryWalls(walls);
    },
    platforms: () => [...stage.platforms],
    ring: (x: number, y: number, radius: number, color: string) => {
      effects.ring(x, y, radius, color);
    },
    burst: (x: number, y: number, dx: number, dy: number, count: number, color: string) => {
      effects.burst(x, y, dx, dy, count, color);
    },
    explode: (x: number, y: number, color: string, scale: number) => {
      effects.explode(x, y, color, scale);
    },
    fxFlash: (x: number, y: number, radius: number, color: string) => {
      effects.flash(x, y, radius, color);
    },
    floater: (...args: Parameters<typeof addFloater>) => {
      addFloater(...args);
    },
    shake: (amount: number) => {
      requireWeaponRuntime().addShake(amount);
    },
    flash: (amount: number) => {
      requireWeaponRuntime().addFlash(amount);
    },
    sound: (cue: string) => {
      outward.push(`sound:${cue}`);
    },
    loseStyle: () => {
      style.loseStyle();
    },
    shieldAbsorbed: () => {
      requireWeaponRuntime().shieldAbsorb();
    },
    addStyle: (kind: string) => {
      style.addStyle(kind);
    },
    dashDodge: (projectile: unknown) => {
      style.achievements.dashDodge(projectile as never);
    },
    maxStat: note("maxStat"),
    checkAchievements: () => {
      style.check();
    },
    noteFirstDamage: (enemy: NativeEnemy, first: boolean) => {
      requireWeaponRuntime().noteFirstDamage(enemy, first);
    },
    reflectedHit: (enemy: NativeEnemy, shot: unknown, source: unknown) => {
      gameplay.reflectedHit(enemy, shot, source);
    },
    bossHit: note("bossHit"),
    onKill: (enemy: { dead?: boolean }, cause: string) => {
      resolveKill(enemy, cause);
    },
    areaDamage: (x: number, y: number, radius: number, damage: number, playerOwned: boolean) =>
      dealArea(x, y, radius, damage, playerOwned),
    weaponProjectileHit: (
      projectile: LiveCombatEntity,
      target: LiveCombatEntity,
      hit: Parameters<NonNullable<CombatEntityRuntimeHooks["weaponProjectileHit"]>>[2],
    ) => {
      gameplay.weaponProjectileHit(projectile, target as NativeEnemy, hit);
    },
  } as unknown as CombatEntityRuntimeHooks;
  let combat = options.deferCombatRuntime === true ? null : new CombatEntityRuntime(entityHooks);

  const addFloater = (x: number, y: number, text: string, big = false, color = config.colors.perfect): void => {
    world.state.setFloaters([...world.state.floaters(), { x, y, text, life: 0.8, big, col: color }]);
  };
  weaponRuntime = createLiveWeaponRuntime<LiveWeaponEnemy>({
    run: () => world.state.run(),
    player: () => player(),
    blade: () => blade(),
    enemies: () => world.state.enemies(),
    time: () => replay.clock.sim,
    overrun: () => config.overrun,
    stormbank: () => config.stormbank,
    score: () => ({ perKill: config.run.scorePerKill, multiplier: config.run.scoreMult }),
    colors: () => config.colors,
    juice: () => config.juice,
    shakeScale: () => 1,
    motionScale: () => 1,
    flashScale: () => 1,
    parrySlowmo: () => config.juice.parrySlowmo,
    bigShake: () => config.juice.shakeBig || 20,
    clamp,
    distance: (x, y) => len(x, y),
    buzz: () => undefined,
    rumble: () => undefined,
    setShake: (value) => {
      transient.impact.shake = value;
    },
    shake: () => transient.impact.shake,
    setZoom: (value) => {
      transient.feel.zoom = value;
    },
    zoom: () => transient.feel.zoom,
    setFlash: (value) => {
      transient.feel.flash = value;
    },
    flash: () => transient.feel.flash,
    setSlowmo: (value) => {
      transient.impact.slowMotion = value;
    },
    setHitStop: (value) => {
      transient.impact.hitStop = value;
    },
    smallHitStop: () => config.hitStop.small,
    addFloater,
    explode: (x, y, color, scale) => {
      effects.explode(x, y, color, scale);
    },
    ring: (x, y, radius, color) => {
      effects.ring(x, y, radius, color);
    },
    ribbon: (x1, y1, x2, y2, color) => {
      effects.ribbon(x1, y1, x2, y2, color);
    },
    burst: (x, y, dx, dy, count, color) => {
      effects.burst(x, y, dx, dy, count, color);
    },
    death: (x, y, shards, color) => {
      effects.explode(x, y, color, Math.max(0.5, shards / 12));
    },
    deathShards: () => config.juice.deathShards,
    parrySound: () => undefined,
    recallSound: () => undefined,
    onKill: (enemy, cause) => {
      resolveKill(enemy, cause);
    },
  });
  const gameplay = createLiveCollisionGameplayBindings<NativeEnemy, LiveWeaponEvent<LiveWeaponEnemy>>({
    run: () => {
      const run = world.state.run();
      if (run === null) throw new Error("collision gameplay requires an active run");
      return run;
    },
    blade: () => {
      const active = world.state.blade();
      if (active == null) throw new Error("collision gameplay requires a blade");
      return active;
    },
    makeEvent: (x, y, enemy: NativeEnemy | null, cause, detail) =>
      requireWeaponRuntime().makeEvent(x, y, enemy, cause, detail),
    dispatch: (name, event) => {
      const run = world.state.run();
      if (run === null) throw new Error("collision gameplay requires an active run");
      requireWeaponRuntime().fire(run.mods[name], event);
    },
    simulationSeconds: () => replay.clock.sim,
    applySever: weaponRuntime.applySever,
    damageMultiplier: weaponRuntime.damageMultiplier,
    noteFirstDamage: weaponRuntime.noteFirstDamage,
    emitThrowResolve: (enemy, damage) => {
      emitWeaponFact("throw-resolved", undefined, damage);
      requireWeaponRuntime().emitThrowResolve(enemy, damage);
    },
    maximumThrowSpeed: () => config.blade.throw.maxSpeed,
    projectileSpeed: () => config.proj.speed,
    perfectColor: () => config.colors.perfect,
    clamp,
    weaponEffect: (weaponId, effect) => {
      replay.tutorial.weaponEffect(weaponId, effect);
    },
    presentAttack: () => {
      outward.push("weaponProjectileContact");
    },
    floater: addFloater,
    log: weaponRuntime.log,
    resolveKill: (enemy, cause) => {
      resolveKill(enemy, cause);
    },
  });
  const lobExplode = bindLiveHammerMeteor({
    blade: () => blade(),
    enemies: () => world.state.enemies(),
    tuning: () => config.weapons.hammer,
    maximumThrowSpeed: () => config.blade.throw.maxSpeed,
    redirect: () => !!(world.state.run() as never as { mods: { redirect?: boolean } }).mods.redirect,
    slamColor: () => config.colors.slam,
    bigShake: () => config.juice.shakeBig,
    bigZoom: () => config.juice.zoomBig,
    distance: (x, y) => len(x, y),
    clamp,
    explode: (x, y, color, scale) => {
      effects.explode(x, y, color, scale);
    },
    ribbon: (x1, y1, x2, y2, color) => {
      effects.ribbon(x1, y1, x2, y2, color);
    },
    shake: (value) => {
      transient.impact.shake = Math.max(transient.impact.shake, value);
    },
    zoom: (value) => {
      transient.feel.zoom = Math.max(transient.feel.zoom, 1 + value);
    },
    boom: () => {
      outward.push("sound:boom");
    },
    areaDamage: dealArea,
  });

  const opening = {
    config,
    get player() {
      return player();
    },
    get blade() {
      return blade();
    },
    get run() {
      return world.state.run() as never;
    },
    get enemies() {
      return world.state.enemies() as never;
    },
    get projectiles() {
      return world.state.projectiles();
    },
    get platforms() {
      return platforms();
    },
    state: transient.opening,
    width: config.view.w,
    get blocking() {
      return world.context.cinema.active && world.context.cinema.blocksCombat;
    },
    get playerMode() {
      return world.context.cinema.playerMode;
    },
    protection: transient.protection,
    get lowGraphics() {
      return GFX.low;
    },
    get practicePreparing() {
      return replay.tutorial.preparingBoss;
    },
    get transformationBlocked() {
      return world.context.cinema.active && world.context.cinema.blocksCombat;
    },
    overrunMovementMultiplier: () => 1,
    runDamageMultiplier: () => 1,
    stepCinematic: (dt: number) => {
      replay.practiceCinematic.runtime.step(dt);
    },
    flushClosingInput: note("flushClosingInput"),
    updateWeaponAbilities: (dt: number) => {
      weaponRuntime.updateAbilities(dt);
    },
    flushWeaponActions: (events: readonly BladeWeaponEvent[]) => {
      for (const event of events) {
        if (event.type === "slingRelease") {
          replay.tutorial.weaponEffect("chainblade", "slingRelease");
          outward.push(`weapon:${event.type}`);
          continue;
        }
        const shot = world.entities.createProjectile(event.x, event.y, event.vx, event.vy) as never as Record<
          string,
          unknown
        >;
        shot.family = "weaponProjectile";
        shot.playerOwned = true;
        shot.weaponId = "riftlock";
        bindRunDnaShot(shot, blade(), event.attackId, event.secondary, event.throwId);
        if (!event.secondary) runDnaObserver(blade())?.end(`shot:${String(event.attackId)}`);
        shot.attackId = event.attackId;
        shot.throwId = event.throwId;
        shot.remote = event.remote;
        shot.secondary = event.secondary;
        shot.kind = "razor";
        shot.r = config.weapons.riftlock.razorRadius;
        shot.life = config.weapons.riftlock.razorLife;
        shot.dmg = event.damage;
        shot.tint = config.colors.perfect;
        shot.unparryable = true;
        shot.counterplay = "weapon";
        world.state.setProjectiles([...world.state.projectiles(), shot as never]);
        effects.burst(event.x, event.y, event.vx, event.vy, 5, config.colors.perfect);
        outward.push(`weapon:${event.type}`);
      }
    },
    updateWorldHazards: (dt: number) => {
      if (combat === null) throw new Error("production combat runtime has not been composed");
      combat.updateWorldHazards(dt, {
        groundY: config.world.groundY,
        sludgeSlow: config.exotic.sludgeSlow,
        geoWallW: config.exotic.geoWallW,
        geoWallH: config.exotic.geoWallH,
        geoWallLife: config.exotic.geoWallLife,
        sludgeColor: config.colors.sludge,
      });
    },
    syncVoidSupport: () => {
      if (!replay.tutorial.session().bossPractice?.defeated) replay.practiceCinematic.sourceRuntime.syncPlayer();
    },
    activateThrowSecondary: note("activateThrowSecondary"),
    linkBroken: (reason: string) => {
      outward.push(`linkBroken:${reason}`);
      const active = blade() as { tipX: number; tipY: number };
      effects.ring(active.tipX, active.tipY, 8, config.colors.bladeTrail);
    },
    distance: (ax: number, ay: number, bx: number, by: number) => len(ax - bx, ay - by),
    areaDamage: (x: number, y: number, radius: number, damage: number) => {
      dealArea(x, y, radius, damage);
    },
    ring: (x: number, y: number, radius: number, color: string) => {
      effects.ring(x, y, radius, openingColor(color));
    },
    burst: (x: number, y: number, dx: number, dy: number, count: number, color?: string) => {
      effects.burst(x, y, dx, dy, count, openingColor(color));
    },
    floater: addFloater,
    shake: note("shake"),
    sound: (name: string) => {
      outward.push(`sound:${name}`);
    },
    ghost: (x: number, y: number, hw: number, hh: number, color?: string) => {
      outward.push("ghost");
      effects.ghost(x, y, hw, hh, color === "slam" ? config.colors.slam : undefined);
    },
    ember: (x: number, y: number) => {
      outward.push("ember");
      effects.ember(x, y);
    },
    smoke: (x: number, y: number) => {
      outward.push("smoke");
      effects.smoke(x, y);
    },
    drip: (x: number, y: number) => {
      outward.push("drip");
      effects.drip(x, y);
    },
    overlap: (
      a: { x: number; y: number; hw: number; hh: number },
      b: { x: number; y: number; hw: number; hh: number },
    ) => aabbOverlap(a.x, a.y, a.hw, a.hh, b.x, b.y, b.hw, b.hh),
    styleHit: () => {
      style.addStyle("hit");
    },
    onKill: (enemy: { dead?: boolean }, cause?: string) => {
      resolveKill(enemy, cause);
    },
    fireDashStart: () => {
      outward.push("fireDashStart");
      const active = player() as { x: number; y: number; dashX: number; dashY: number };
      effects.burst(active.x, active.y, -active.dashX, -active.dashY, 6, config.colors.perfect);
      if (!GFX.low) effects.ring(active.x, active.y, 7, config.colors.perfect);
    },
    fireDashContact: note("fireDashContact"),
    fireWeaponCatch: () => {
      outward.push("fireWeaponCatch");
      emitWeaponFact("catch");
    },
    fireThrowLaunch: (throwId: number) => {
      outward.push("fireThrowLaunch");
      emitWeaponFact("throw-launch", throwId);
    },
    observeTutorialAttempt: (fact: Parameters<typeof replay.tutorial.observeAttemptFact>[0]) => {
      replay.tutorial.observeAttemptFact(fact);
    },
    logThrowLaunch: note("logThrowLaunch"),
    weaponWorldImpact: () => {
      const result = invokeWeaponHook((blade() as { weapon?: object | null }).weapon, "onWorldImpact", {
        config,
        blade: blade(),
        player: player(),
        platforms: platforms(),
        x: (blade() as { x: number }).x,
        y: (blade() as { y: number }).y,
      });
      return isObject(result) ? (result as Readonly<{ mechanic?: string }>) : null;
    },
    lobExplode: () => {
      const activeBlade = blade() as { x: number; y: number };
      lobExplode(activeBlade.x, activeBlade.y);
    },
    emitThrowResolve: () => {
      outward.push("emitThrowResolve");
      const activeBlade = blade() as { throwDmg: number };
      emitWeaponFact("throw-resolved", undefined, activeBlade.throwDmg);
      weaponRuntime.emitThrowResolve(null, activeBlade.throwDmg);
    },
    nearestEnemy: () => {
      const position = blade() as { x: number; y: number };
      return weaponRuntime.nearestEnemy(position.x, position.y);
    },
    updateFeedback: (dt: number) => {
      const mirror = replay.factories.mirrorTypes.Mirror as unknown as Parameters<typeof updateMirrorCombat>[0] & {
        fxq?: unknown[];
      };
      if (updateMirrorCombat(mirror, dt, player(), blade())) outward.push("mirrorShattered");
      if (mirror.fxq !== undefined && mirror.fxq.length > 0)
        outward.push(`mirrorFx:${String(mirror.fxq.splice(0).length)}`);
      const drained = replay.factories.enemyTypes.BOSSFX.drain();
      if (drained.length > 0) outward.push(`bossFx:${String(drained.length)}`);
    },
    consumeThrow: () => input.consumeThrow(() => false),
    updateWave: (dt: number) => {
      options.updateWave?.(dt);
    },
    startTransformation: (owner: never, cue: never) =>
      replay.practiceCinematic.runtime.startBossTransformation(owner, cue),
    updateSupports: (dt: number) => {
      if (combat === null) throw new Error("production combat runtime has not been composed");
      combat.updateSupports(dt, config.support, config.colors.anchor);
    },
    armorBypass: note("armorBypass"),
    resolveBossZones: () => {
      if (combat === null) throw new Error("production combat runtime has not been composed");
      combat.resolveBossZones({
        groundY: config.world.groundY,
        defaultWidth: config.warden.zoneW,
        defaultDamage: config.warden.zoneTick,
        defaultTickCooldown: config.warden.zoneTickCd,
      });
    },
    updateBossArenaPlatforms: (dt: number) => {
      bossArena.updateLive(dt);
    },
    updateVoidScroll: (dt: number) => {
      if (!replay.tutorial.session().bossPractice?.defeated) replay.practiceCinematic.sourceRuntime.update(dt);
    },
    unlockWitness: note("unlockWitness"),
    startVoidDescent: (boss: never) => replay.practiceCinematic.runtime.startVoidDescent(boss),
    spawnBossAdds: (boss: never) => {
      const source = boss as {
        x: number;
        y: number;
        hw?: number;
        facing?: number;
        bossId?: string;
        presentationId?: string;
        kind?: string;
      };
      const adds: never[] = [];
      for (const offset of [-1, 1]) {
        const add = world.entities.createEnemy(
          "charger",
          clamp(source.x + offset * 130, 60, config.view.w - 60),
          config.world.groundY - 22,
          world.state.run() as never,
        ) as never as Record<string, unknown>;
        add.behavior = "bull";
        add.hp = Number(add.hp) * 2.2;
        add.maxHp = add.hp;
        add.hpDisplay = add.hp;
        add.speedMult = Number(add.speedMult) * 1.35;
        add.contactDmg = Number(add.contactDmg) * 1.3;
        add.canClimb = true;
        add.climber = true;
        add.climbApt = 0.85;
        add.spawnT = 0.35;
        emitBossSupportSpawn(add, source);
        adds.push(add as never);
      }
      world.state.setEnemies([...world.state.enemies(), ...adds]);
      return adds;
    },
    spawnBossClone: (boss: never) => {
      const source = boss as {
        x: number;
        y: number;
        facing?: number;
        bossId?: string;
        presentationId?: string;
        kind?: string;
      };
      const clone = world.entities.createEnemy(
        "reflection",
        clamp(source.x - (source.facing ?? 1) * 220, 100, config.view.w - 100),
        config.world.groundY - 300,
        world.state.run() as never,
      ) as never as Record<string, unknown>;
      clone.spawnT = 0.3;
      emitBossSupportSpawn(clone, source);
      world.state.setEnemies([...world.state.enemies(), clone as never]);
      outward.push("bossClone");
    },
    removeBossClone: (clone: never) => {
      const value = clone as { x: number; y: number; hw: number; hh: number };
      effects.ghost(value.x, value.y, value.hw, value.hh);
    },
    dramaticBeat: note("dramaticBeat"),
    onBladeStolen: note("onBladeStolen"),
    updateEffects: (dt: number) => {
      effects.update(dt);
    },
    random: replay.cosmeticEmissionRandom.next,
  } as unknown as LiveOpeningPhaseHost;

  const collisionState = {
    get hitStop() {
      return transient.impact.hitStop;
    },
    set hitStop(value: number) {
      transient.impact.hitStop = value;
    },
    get slowMotion() {
      return transient.impact.slowMotion;
    },
    set slowMotion(value: number) {
      transient.impact.slowMotion = value;
    },
    get shake() {
      return transient.impact.shake;
    },
    set shake(value: number) {
      transient.impact.shake = value;
    },
    get enemies() {
      return world.state.enemies();
    },
    set enemies(value: unknown[]) {
      world.state.setEnemies(value as never[]);
    },
    get projectiles() {
      return world.state.projectiles();
    },
    set projectiles(value: unknown[]) {
      world.state.setProjectiles(value as never[]);
    },
    get floaters() {
      return world.state.floaters();
    },
    set floaters(value: unknown[]) {
      world.state.setFloaters(value as never[]);
    },
  } as unknown as LiveCollisionPhaseHost["state"];
  const collisionEffects = {
    burst: (...args: Parameters<typeof effects.burst>) => {
      outward.push("fx:burst");
      effects.burst(...args);
    },
    ring: (...args: Parameters<typeof effects.ring>) => {
      outward.push("fx:ring");
      effects.ring(...args);
    },
    flash: (...args: Parameters<typeof effects.flash>) => {
      outward.push("fx:flash");
      effects.flash(...args);
    },
    ribbon: (...args: Parameters<typeof effects.ribbon>) => {
      outward.push("fx:ribbon");
      effects.ribbon(...args);
    },
    explode: (...args: Parameters<typeof effects.explode>) => {
      outward.push("fx:explode");
      effects.explode(...args);
    },
    floater: addFloater,
    shake: weaponRuntime.addShake,
    zoom: weaponRuntime.addZoom,
    buzz: note("fx:buzz"),
    sound: (name: string) => {
      outward.push(`hit:${name}`);
    },
    style: (kind: string) => {
      style.addStyle(kind);
    },
    tutorial: (kind: "strike" | "airHit") => {
      replay.tutorial.mark(kind);
      outward.push("fx:tutorial");
    },
  };
  const collision = {
    config,
    environment: world.context.environment,
    environmentTick: gameplay.environmentTick,
    get player() {
      return player();
    },
    get blade() {
      return blade();
    },
    get run() {
      return world.state.run() as never;
    },
    get combat() {
      if (combat === null) throw new Error("production combat runtime has not been composed");
      return combat;
    },
    width: config.view.w,
    state: collisionState,
    weaponHit: (
      enemy: unknown,
      quality: number,
      damage: number,
      slam: boolean,
      launch: boolean,
      empowered: boolean,
    ) => {
      outward.push("weaponHit");
      return invokeWeaponHook((blade() as { weapon?: object | null }).weapon, "onHeldHit", {
        config,
        blade: blade(),
        player: player(),
        enemy,
        quality,
        damage,
        isSlam: slam,
        isLaunch: launch,
        empowered,
      }) as never;
    },
    throwHit: (enemy: unknown, secondary: boolean, throwId: number) => {
      outward.push("throwHit");
      return invokeWeaponHook((blade() as { weapon?: object | null }).weapon, "onThrowHit", {
        config,
        blade: blade(),
        player: player(),
        enemy,
        secondary,
        throwId,
      }) as never;
    },
    runDamageMultiplier: weaponRuntime.damageMultiplier,
    noteFirstDamage: weaponRuntime.noteFirstDamage,
    observeTutorialAttempt: (fact: Parameters<typeof replay.tutorial.observeAttemptFact>[0]) => {
      replay.tutorial.observeAttemptFact(fact);
    },
    logWeapon: weaponRuntime.log,
    weaponEffect: (weaponId: string, effect: string) => {
      replay.tutorial.weaponEffect(weaponId, effect);
    },
    emitThrowResolve: (enemy: LiveWeaponEnemy | null, damage: number) => {
      outward.push("emitThrowResolve");
      emitWeaponFact("throw-resolved", undefined, damage);
      weaponRuntime.emitThrowResolve(enemy, damage);
    },
    onKill: (enemy: { dead?: boolean }, cause?: string) => {
      resolveKill(enemy, cause);
    },
    addFloater,
    effects: collisionEffects,
    sound: (cue: string) => {
      outward.push(`sound:${cue}`);
    },
    flare: note("flare"),
    addShake: weaponRuntime.addShake,
    addZoom: weaponRuntime.addZoom,
    addFlash: weaponRuntime.addFlash,
    addStyle: (kind: string) => {
      style.addStyle(kind);
    },
    segmentCircle: (x1: number, y1: number, x2: number, y2: number, x: number, y: number, radius: number) =>
      segCircle(x1, y1, x2, y2, x, y, radius),
    segmentPointDistance: (x1: number, y1: number, x2: number, y2: number, x: number, y: number) =>
      segPointDist(x1, y1, x2, y2, x, y),
    weaponSegmentContact: (
      cap: Parameters<typeof replay.factories.enemyTypes.weaponCapsuleIntersectsSegment>[0],
      x1: number,
      y1: number,
      x2: number,
      y2: number,
    ) => replay.factories.enemyTypes.weaponCapsuleIntersectsSegment(cap, x1, y1, x2, y2),
    distance: (x: number, y: number) => len(x, y),
    clamp,
    lerp,
    nearestEnemy: (x: number, y: number) => weaponRuntime.nearestEnemy(x, y),
    areaDamage: (x: number, y: number, radius: number, damage: number) => dealArea(x, y, radius, damage),
    lobExplode,
    splitProjectile: (projectile: never) => {
      style.splitProjectile(projectile);
    },
    triggerSlowMotion: weaponRuntime.triggerSlowmo,
    emitPerfectParry: note("emitPerfectParry"),
    makeHitEvent: gameplay.makeHitEvent,
    makeSwingEvent: gameplay.makeSwingEvent,
    makeSlamEvent: gameplay.makeSlamEvent,
    makeReturnEvent: gameplay.makeReturnEvent,
    makePerfectParryEvent: gameplay.makePerfectParryEvent,
    observeProjectile: (projectile: Parameters<typeof emitProjectileFact>[1]) => {
      outward.push("projectile:spawned");
      emitProjectileFact("spawned", projectile);
    },
    projectileDeflected: (projectile: Parameters<typeof emitProjectileFact>[1]) => {
      outward.push("projectile:deflected");
      emitProjectileFact("deflected", projectile);
      emitProjectileFact("owner-changed", projectile);
    },
    projectileHit: (projectile: Parameters<typeof emitProjectileFact>[1], enemy: object) => {
      outward.push("projectile:hit");
      emitProjectileFact("hit", projectile, enemy);
    },
    projectileExpired: (projectile: Parameters<typeof emitProjectileFact>[1]) => {
      outward.push("projectile:expired");
      emitProjectileFact("expired", projectile);
    },
    profileAdd: () => undefined,
    profileMax: () => undefined,
    dailyBump: () => undefined,
    achievementsEnabled: nativeTracking,
    achievement: note("achievement"),
    checkAchievements: () => undefined,
    tutorialMark: (kind: "strike" | "airHit") => {
      replay.tutorial.mark(kind);
    },
    enemyDefeated: (enemy: object & { id?: string }) => {
      if (options.gameplayEvents === undefined || actorId === null) return;
      options.gameplayEvents.emit({ kind: "death", actorId: actorId(enemy), cause: "combat" });
    },
    ghostRecording: () => nativeTracking() && actorId !== null,
    ghostSample: () => undefined,
    ghostRevive: note("ghostRevive"),
    updateTrick: (seconds: number) => {
      style.update(seconds);
    },
    achievementTick: (seconds: number) => {
      style.achievements.tick(seconds);
    },
    updateTutorial: (seconds: number) => {
      replay.tutorial.update(seconds);
    },
    updatePlayground: () => undefined,
    overlap: aabbOverlap,
    onShieldAbsorb: weaponRuntime.shieldAbsorb,
    loseStyle: () => {
      style.loseStyle();
    },
    buzz: () => undefined,
    requestAdContinue: note("requestAdContinue"),
    adAvailable: () => false,
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
    achievementsEnabled: nativeTracking,
    addKillScore: () => {
      addKillScore(world.state.run() as never, config.run.scorePerKill, config.run.scoreMult);
    },
    addStat: () => undefined,
    maxStat: () => undefined,
    bumpDaily: () => undefined,
    bossKillAchievement: note("bossKillAchievement"),
    killAchievement: note("killAchievement"),
    checkAchievements: () => undefined,
    bossGhostMoment: (enemy: Readonly<{ x: number; y: number }>) => {
      outward.push("bossGhostMoment");
      options.gameplayEvents?.emit({ kind: "effect", effect: "bossKill", x: enemy.x, y: enemy.y });
    },
    deathEffect: (enemy: { x: number; y: number; color: string }, shards: number) => {
      outward.push("deathEffect");
      effects.death(enemy.x, enemy.y, shards, enemy.color);
    },
    deathSound: note("deathSound"),
    makeDeathEvent: (enemy: unknown, cause: string | undefined, clean: boolean) =>
      requireWeaponRuntime().makeDeathEvent(enemy as never, cause, clean),
    fire: (hooks: unknown, event: unknown) => {
      if (Array.isArray(hooks)) requireWeaponRuntime().fire(hooks as never, event as never);
    },
    applySever: (enemy: { applySever?: (tier: number) => void }, tier: number) => {
      enemy.applySever?.(tier);
    },
    ring: (...args: Parameters<typeof effects.ring>) => {
      outward.push("killRing");
      effects.ring(...args);
    },
    restorePlatforms: (value: unknown[]) => {
      stage.platforms = [...value];
    },
    releaseCamera: note("releaseCamera"),
    happyTime: note("happyTime"),
    bossPresentation: (enemy: { x: number; y: number; color: string }, accent: string) => {
      outward.push("bossPresentation");
      effects.explode(enemy.x, enemy.y, enemy.color, 2.2);
      effects.explode(enemy.x, enemy.y - 20, accent, 1.4);
    },
    releaseStolenBlade: (enemy: unknown) => {
      const weapon = blade() as { hostile?: boolean; stolenBy?: unknown; state?: string };
      if (weapon.stolenBy === enemy) {
        weapon.hostile = false;
        weapon.stolenBy = null;
        weapon.state = "returning";
      }
    },
  } as unknown as LiveKillHost;

  return Object.freeze({
    outward,
    get combat() {
      if (combat === null) throw new Error("production combat runtime has not been composed");
      return combat;
    },
    opening,
    collision,
    combatEntities: entityHooks,
    kill,
    installCombat(
      runtime: CombatEntityRuntime,
      killResolver: typeof resolveKill,
      identify?: (enemy: object & { id?: string }) => string,
    ): void {
      combat = runtime;
      resolveKill = killResolver;
      actorId = identify ?? null;
    },
    step(seconds: number): void {
      if (runLiveOpeningPhase(opening, seconds).blocked) return;
      runLiveCollisionPhase(collision, seconds);
    },
  });
}

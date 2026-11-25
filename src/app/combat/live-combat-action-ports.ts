import { releasePointerLock } from "../../platform/browser-pointer-lock";
import type { AttackPresentationCueSink } from "../../gameplay/combat/attack-presentation-cue";
import type { LiveCampaignTrainingAssembly } from "../campaign/live-campaign-training-assembly";
import type { LiveScreenNavigation } from "../interface/live-screen-navigation";
import type { LiveReviveCountdownState } from "../run/revive-countdown-state";
import type { LiveRunOrchestration } from "../run/run-orchestration-composition";
import type { LiveBrowserRuntime } from "../shell/browser-runtime";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type {
  GameBlade,
  GameEnemy,
  GamePlayer,
  GameProjectile,
  GameRun,
} from "../../gameplay/runtime/game-runtime-state";
import {
  isCombatPlatform,
  isDodgeProjectile,
  isEnemySample,
  isGameEnemy,
  isGameFloater,
  isRitualCue,
  isWeaponEffect,
} from "../shell/runtime-type-guards";
import type { LiveSessionServices } from "../shell/session-services-composition";
import type { LiveAuthoritativeInputAdapter } from "../../gameplay/runtime/authoritative-input-adapter";
import type { LiveWorldComposition } from "../world/world-composition";
import { createLiveCombatActions } from "./combat-actions";
import { createLiveCollisionStateView, type LiveCombatAdapterContext } from "./combat-adapter-context";
import { createLiveCombatWorldState } from "./combat-world-state";
import type { LiveCanonicalCombatHost } from "./live-canonical-state";

export interface LiveCombatActionPortsOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly surface: Pick<LiveBrowserRuntime, "canvas" | "width">;
  readonly world: LiveWorldComposition;
  readonly campaignTraining: LiveCampaignTrainingAssembly;
  readonly orchestration: Pick<LiveRunOrchestration, "updateBossArenaPlatforms" | "lobExplode">;
  readonly services: Pick<LiveSessionServices, "controllers">;
  readonly attackPresentation: AttackPresentationCueSink;
  readonly navigation: Pick<LiveScreenNavigation, "setScreen">;
  readonly reviveCountdown: Pick<LiveReviveCountdownState, "setSeconds">;
  readonly browserDocument: Pick<Document, "exitPointerLock">;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
  /** Collaborators constructed after the combat ports. */
  readonly combat: () => Pick<LiveCanonicalCombatHost, "killRuntime" | "combatEntityRuntime" | "frameRuntime">;
  readonly input: () => Pick<LiveAuthoritativeInputAdapter, "consumeThrow">;
}

/**
 * Maps the live world, campaign, training, weapon and style runtimes onto the
 * combat action ports and the opening, collision and kill phase adapters.
 */
export function createLiveCombatActionPorts(options: LiveCombatActionPortsOptions) {
  const {
    dependencies,
    world,
    campaignTraining,
    orchestration,
    navigation,
    run: liveRun,
    player: livePlayer,
    blade: liveBlade,
  } = options;
  const { CONFIG, GAMEPLAY_EVENTS, GFX, Input, SFX, weaponCapsuleIntersectsSegment } = dependencies;
  const { state: hostState, entities: worldEntities, environment } = world;
  const { transient } = world.context;
  const { impact, feel, opening: openingCarry } = transient;
  const CINEMA = world.context.cinema;
  const W = options.surface.width;
  const { stage: stageRuntime, story } = campaignTraining.campaign;
  const TUT = campaignTraining.training.tutorial;
  const { startBossTransformation, step: stepCinematicPlaying } = campaignTraining.cinematic.runtime;
  const sourceRuntime = campaignTraining.cinematic.sourceRuntime;
  const { addFloater, syncVoidPlayerSupport, updateVoidScroll, stepPlayground } = campaignTraining;
  const {
    addShake,
    addZoom,
    addFlash,
    triggerSlowmo,
    nearestEnemy,
    damageMultiplier: runDamageMult,
    log: logWeaponEvent,
    noteFirstDamage: noteFirstPlayerDamage,
    applySever,
    updateAbilities: updateWeaponAbilities,
    emitThrowResolve,
    activateThrowSecondary,
    hook: weaponHook,
    shieldAbsorb: onShieldAbsorb,
    dealArea: dealAoE,
    addKillScore,
    fire,
    makeEvent: makeEv,
    makeDeathEvent,
  } = campaignTraining.weapon;
  const {
    achievements: AT,
    addStyle,
    tracks: achTracks,
    check: achCheck,
    loseStyle,
    update: updateTrick,
    splitProjectile: spawnSplitShards,
  } = campaignTraining.style;
  const { endRun, updateWave } = options.services.controllers.api;
  const { updateBossArenaPlatforms, lobExplode } = orchestration;
  const isGameProjectile = (value: unknown): value is GameProjectile => value instanceof dependencies.Projectile;
  const isSourceOwner = (value: unknown): value is GameEnemy & Parameters<typeof sourceRuntime.advanceUnmake>[0] =>
    isGameEnemy(value); // the Unmake derives its actor id from presentationId/bossId
  const isRitualOwner = (
    value: unknown,
  ): value is GameEnemy & NonNullable<Parameters<typeof startBossTransformation>[0]> =>
    isGameEnemy(value) &&
    "bossName" in value &&
    typeof value.bossName === "string" &&
    "cinematicT" in value &&
    typeof value.cinematicT === "number";
  const enemyId = (enemy: object) => options.combat().combatEntityRuntime.id(enemy, "enemy");
  const combatWorldState = createLiveCombatWorldState(
    {
      player: livePlayer,
      blade: liveBlade,
      run: liveRun,
      enemies: () => hostState.enemies(),
      setEnemies: (value) => {
        hostState.setEnemies(value);
      },
      projectiles: () => hostState.projectiles(),
      setProjectiles: (value) => {
        hostState.setProjectiles(value);
      },
      floaters: () => hostState.floaters(),
      setFloaters: (value) => {
        hostState.setFloaters(value);
      },
      slowZones: () => hostState.slowZones(),
      setSlowZones: (value) => {
        hostState.setSlowZones(value);
      },
      bossIntro: () => hostState.bossIntro(),
      setBossIntro: (value) => {
        hostState.setBossIntro(value);
      },
      stageBeat: () => hostState.stageBeat(),
      setStageBeat: (value) => {
        hostState.setStageBeat(value);
      },
      temporaryWalls: () => hostState.temporaryWalls(),
      setTemporaryWalls: (value) => {
        hostState.setTemporaryWalls(value);
      },
    },
    transient,
  );
  const combatActions: ReturnType<typeof createLiveCombatActions> = createLiveCombatActions({
    dependencies,
    canvas: options.surface.canvas,
    width: W,
    environment,
    attackPresentation: options.attackPresentation,
    live: combatWorldState,
    ports: {
      stage: stageRuntime,
      story,
      cinema: CINEMA,
      tutorial: TUT,
      achievement: {
        dashDodge: (projectile) => {
          if (isDodgeProjectile(projectile)) AT.dashDodge(projectile);
        },
        bossHit: (enemy, kind) => {
          if (isGameEnemy(enemy)) AT.bossHit(enemy, kind);
        },
        bossKill: (enemy) => {
          if (isGameEnemy(enemy)) AT.bossKill(enemy);
        },
        onKill: () => {
          AT.onKill();
        },
        swung: () => {
          AT.swung();
        },
        thrown: () => {
          AT.thrown();
        },
        parry: () => {
          AT.parry();
        },
        breakStreak: () => {
          AT.breakStreak();
        },
        jumped: () => {
          AT.jumped();
        },
        revived: () => {
          AT.revived();
        },
        tick: (seconds) => {
          AT.tick(seconds);
        },
      },
      functions: {
        addFloater,
        addShake,
        addZoom,
        addFlash,
        addStyle,
        loseStyle,
        onShieldAbsorb,
        noteFirstDamage: (enemy, first) => {
          if (isGameEnemy(enemy)) noteFirstPlayerDamage(enemy, first);
        },
        entityNoteFirstDamage: (enemy, first) => {
          if (isGameEnemy(enemy)) noteFirstPlayerDamage(enemy, first);
        },
        entityBossHit: (enemy) => {
          if (isGameEnemy(enemy)) AT.bossHit(enemy, "deflect");
        },
        entityResolveKill: (enemy, cause) => {
          if (isGameEnemy(enemy)) options.combat().killRuntime.resolve(enemy, cause);
        },
        runDamageMultiplier: runDamageMult,
        updateWeaponAbilities,
        stepCinematic: stepCinematicPlaying,
        syncVoidSupport: syncVoidPlayerSupport,
        activateThrowSecondary,
        updateWave,
        updateBossArenaPlatforms,
        updateVoidScroll,
        advanceSourceUnmake: (boss, dt) => isSourceOwner(boss) && sourceRuntime.advanceUnmake(boss, dt),
        nearestEnemy: (x, y) => {
          const enemy = nearestEnemy(x, y);
          return isGameEnemy(enemy) ? enemy : null;
        },
        openingNearestEnemy: () => {
          const blade = liveBlade();
          const enemy = nearestEnemy(blade.x, blade.y);
          return isGameEnemy(enemy) ? enemy : null;
        },
        areaDamage: (x, y, radius, damage, playerOwned) =>
          playerOwned === undefined ? dealAoE(x, y, radius, damage) : dealAoE(x, y, radius, damage, { playerOwned }),
        lobExplode,
        splitProjectile: (projectile) => {
          if (isGameProjectile(projectile)) spawnSplitShards(projectile);
        },
        triggerSlowMotion: triggerSlowmo,
        logWeapon: logWeaponEvent,
        observeTutorialAttempt: (fact) => {
          TUT.observeAttemptFact(fact);
        },
        emitThrowResolve: (enemy, damage) => {
          const activeBlade = liveBlade();
          GAMEPLAY_EVENTS.emit({
            kind: "weapon",
            event: "throw-resolved",
            weaponId: liveRun().weaponId,
            throwId: activeBlade.throwId,
            x: activeBlade.x,
            y: activeBlade.y,
            damage,
          });
          emitThrowResolve(isGameEnemy(enemy) ? enemy : null, damage);
        },
        updateTrick,
        updatePlayground: stepPlayground,
        endRun,
        checkAchievements: achCheck,
        addKillScore,
        applySever: (enemy, tier) => {
          if (isGameEnemy(enemy)) applySever(enemy, tier);
        },
        fire,
        makeEvent: (x, y, enemy, cause, detail) => makeEv(x, y, isGameEnemy(enemy) ? enemy : null, cause, detail),
        makeDeathEvent: (enemy, cause, cleanElimination) => {
          if (!isGameEnemy(enemy)) throw new TypeError("a death event needs a live enemy");
          return makeDeathEvent(enemy, cause, cleanElimination);
        },
        weaponHook: (name, detail) => {
          const effect = weaponHook(name, { config: CONFIG, ...detail });
          return isWeaponEffect(effect) ? effect : null;
        },
        modHook: (name) => liveRun().mods[name],
        fireMod: fire,
        logWeaponEvent,
        weaponWorldImpact: () => {
          const effect = weaponHook("onWorldImpact", {
            config: CONFIG,
            blade: liveBlade(),
            player: livePlayer(),
            platforms: stageRuntime.platforms,
            x: liveBlade().x,
            y: liveBlade().y,
          });
          return isWeaponEffect(effect) ? effect : null;
        },
        startTransformation: (enemy, request) =>
          isRitualOwner(enemy) && isRitualCue(request) && !CINEMA.active && startBossTransformation(enemy, request),
        achievementsEnabled: achTracks,
        // Raw device edge in every live run (recording is passive; the authoritative
        // input only replays sealed envelopes during verification).
        consumeThrow: () => options.input().consumeThrow(() => Input.consumeThrow()),
        weaponSegmentContact: weaponCapsuleIntersectsSegment,
        createCharger: (x, y) => worldEntities.createEnemy("charger", x, y, liveRun()),
        createReflection: (x, y) => worldEntities.createEnemy("reflection", x, y, liveRun()),
        recordBossSupportSpawn: (enemy, bossId) => {
          const variant: unknown = Reflect.get(enemy, "variantName");
          GAMEPLAY_EVENTS.emit({
            kind: "spawn",
            actorId: enemyId(enemy),
            actorKind: enemy.kind,
            x: enemy.x,
            y: enemy.y,
            variantName: typeof variant === "string" ? variant : "",
            bossId,
          });
        },
        enemyDefeated: (enemy) => {
          if (isGameEnemy(enemy) && isEnemySample(enemy)) {
            GAMEPLAY_EVENTS.emit({ kind: "death", actorId: enemyId(enemy), cause: "combat" });
          }
        },
        restorePlatforms: (platforms) => {
          stageRuntime.platforms = platforms.filter(isCombatPlatform);
        },
        playSound: (name, argument) => {
          if (name === "swing") SFX.swing(typeof argument === "number" ? argument : 1);
          else if (name === "throwBlade") SFX.throwBlade();
          else if (name === "dash") SFX.dash();
          else if (name === "slam") SFX.slam();
          else if (name === "land") SFX.land();
          else if (name === "hurt") SFX.hurt();
          else if (name === "deflect") SFX.deflect();
          else if (name === "boom") SFX.boom();
          else if (name === "death") SFX.death();
        },
      },
    },
    resolveKill: (enemy, cause) => {
      if (isGameEnemy(enemy)) options.combat().killRuntime.resolve(enemy, cause);
    },
    combatRuntime: () => options.combat().combatEntityRuntime,
    emitMusicEvent: (type, detail) => {
      options.combat().frameRuntime.emitMusicEvent(type, detail);
    },
    releaseCamera: () => {
      feel.worldZoomTarget = 1;
    },
    requestContinue: () => {
      navigation.setScreen("continue");
      options.reviveCountdown.setSeconds(8);
      releasePointerLock(options.browserDocument);
    },
  });
  const collisionPhaseState = createLiveCollisionStateView({
    hitStop: () => impact.hitStop,
    setHitStop: (value) => {
      impact.hitStop = value;
    },
    slowMotion: () => impact.slowMotion,
    setSlowMotion: (value) => {
      impact.slowMotion = value;
    },
    shake: () => impact.shake,
    setShake: (value) => {
      impact.shake = value;
    },
    enemies: () => combatWorldState.enemies(),
    setEnemies: (value) => {
      combatWorldState.setEnemies(value.filter(isGameEnemy));
    },
    projectiles: () => combatWorldState.projectiles(),
    setProjectiles: (value) => {
      combatWorldState.setProjectiles(value.filter(isGameProjectile));
    },
    floaters: () => combatWorldState.floaters(),
    setFloaters: (value) => {
      combatWorldState.setFloaters(value.filter(isGameFloater));
    },
  });
  const adapters: LiveCombatAdapterContext = {
    entities: combatActions.entities,
    opening: {
      values: {
        player: () => combatWorldState.player(),
        blade: () => combatWorldState.blade(),
        run: () => combatWorldState.run(),
        enemies: () => combatWorldState.enemies(),
        projectiles: () => combatWorldState.projectiles(),
        platforms: () => stageRuntime.platforms,
        width: () => W,
        blocking: () => CINEMA.active && CINEMA.blocksCombat,
        playerMode: () => CINEMA.playerMode,
        protection: () => combatWorldState.openingProtection(),
        lowGraphics: () => GFX.low,
        transformationBlocked: () => CINEMA.active && CINEMA.blocksCombat,
      },
      actions: combatActions.opening,
      state: openingCarry,
    },
    collision: {
      values: {
        player: () => combatWorldState.player(),
        blade: () => combatWorldState.blade(),
        run: () => combatWorldState.run(),
        width: () => W,
      },
      actions: combatActions.collision,
      state: collisionPhaseState,
    },
    kill: combatActions.kill,
  };
  return adapters;
}

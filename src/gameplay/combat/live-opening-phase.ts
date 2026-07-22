import { CONFIG } from "../../config/game-config";
import { stepCombatPrelude, type CombatPreludeBlade, type CombatPreludePlayer, type CombatPreludeRun } from "./combat-step-prelude";
import { stepLocomotionCombat, type LocomotionBlade, type LocomotionEnemy, type LocomotionPlayer } from "./locomotion-combat-runtime";
import { stepWeaponSecondary, type SecondaryBlade, type SecondaryEnemy } from "./weapon-secondary-runtime";
import { handleWeaponTransport, type TransportBlade } from "./weapon-transport-runtime";
import { stepEnemyActors, stepEnemyStatuses, type EnemyStepActor } from "./enemy-step-runtime";
import { stepBossRuntime, type BossStepEnemy, type BossStepPlatform, type BossStepPlayer, type BossStepRun } from "./boss-step-runtime";
import { advancePlatformLifecycle, type BrokenPlatform, type CrackingPlatform } from "./platform-lifecycle-runtime";

export type LivePlayer = CombatPreludePlayer & LocomotionPlayer & BossStepPlayer;
export type LiveBlade = CombatPreludeBlade & LocomotionBlade & SecondaryBlade & TransportBlade;
export type LiveEnemy = LocomotionEnemy & SecondaryEnemy & EnemyStepActor & BossStepEnemy;
export type LivePlatform = CrackingPlatform & BossStepPlatform;
export type LiveRun = CombatPreludeRun & BossStepRun & {
  readonly mods: CombatPreludeRun["mods"];
  pg?: { readonly freeze?: boolean };
  readonly weaponId: string;
  readonly weaponStats: CombatPreludeRun["weaponStats"] & { throws: number };
  _dashContacts?: Set<LocomotionEnemy>;
  _brokenPlats?: BrokenPlatform[];
};

export interface LiveOpeningState {
  throwCooldown: number;
  wasDashing: boolean;
  wasSwinging: boolean;
  wasOnGround: boolean;
  dashGhostTime: number;
  landingVelocity: number;
}

export interface LiveOpeningPhaseHost {
  readonly player: LivePlayer;
  readonly blade: LiveBlade;
  readonly run: LiveRun;
  readonly enemies: LiveEnemy[];
  readonly projectiles: unknown[];
  readonly platforms: LivePlatform[];
  readonly state: LiveOpeningState;
  readonly width: number;
  readonly blocking: boolean;
  readonly playerMode: string;
  readonly protection: { active: boolean; lastMode: string | null };
  readonly lowGraphics: boolean;
  readonly transformationBlocked: boolean;
  overrunMovementMultiplier: () => number;
  runDamageMultiplier: () => number;
  stepCinematic: (dt: number) => void;
  flushClosingInput: () => void;
  updateWeaponAbilities: (dt: number) => void;
  updateWorldHazards: (dt: number) => void;
  syncVoidSupport: () => void;
  activateThrowSecondary: () => void;
  linkBroken: (reason: string) => void;
  distance: (ax: number, ay: number, bx: number, by: number) => number;
  areaDamage: (x: number, y: number, radius: number, damage: number) => void;
  ring: (x: number, y: number, radius: number, color: string) => void;
  burst: (x: number, y: number, dx: number, dy: number, count: number, color?: string) => void;
  floater: (x: number, y: number, text: string, big: boolean, color?: string) => void;
  shake: (big?: boolean) => void;
  sound: (name: "dash" | "swing" | "slam" | "land" | "throwBlade", speed?: number) => void;
  ghost: (x: number, y: number, hw: number, hh: number, color: "slam" | null) => void;
  ember: (x: number, y: number) => void;
  smoke: (x: number, y: number) => void;
  drip: (x: number, y: number) => void;
  overlap: (player: LocomotionPlayer, enemy: LocomotionEnemy, padding?: number) => boolean;
  styleHit: () => void;
  onKill: (enemy: LiveEnemy, cause?: string) => void;
  fireDashStart: () => void;
  fireDashContact: (enemy: LiveEnemy) => void;
  fireWeaponCatch: () => void;
  fireThrowLaunch: (throwId: number) => void;
  logThrowLaunch: (throwId: number) => void;
  weaponWorldImpact: () => Readonly<{ mechanic?: string }> | null;
  lobExplode: () => void;
  emitThrowResolve: () => void;
  nearestEnemy: () => LiveEnemy | null;
  updateFeedback: (dt: number) => void;
  consumeThrow: () => boolean;
  updateWave: (dt: number) => void;
  startTransformation: (enemy: LiveEnemy, request: unknown) => boolean;
  updateSupports: (dt: number) => void;
  armorBypass: () => void;
  resolveBossZones: () => void;
  updateBossArenaPlatforms: (dt: number) => void;
  updateVoidScroll: (dt: number) => void;
  unlockWitness: () => void;
  startVoidDescent: (boss: LiveEnemy) => void;
  spawnBossAdds: (boss: LiveEnemy) => LiveEnemy[];
  spawnBossClone: (boss: LiveEnemy) => void;
  removeBossClone: (clone: LiveEnemy) => void;
  dramaticBeat: () => void;
  updateEffects: (dt: number) => void;
  random: () => number;
}

export interface LiveOpeningPhaseResult { readonly blocked: boolean }

/** Runs the movement, actor, arena, and boss half of one deterministic fixed tick. */
export function runLiveOpeningPhase(host: LiveOpeningPhaseHost, dt: number): LiveOpeningPhaseResult {
  const { player, blade, run, state } = host;
  const timers = { throwCooldown: state.throwCooldown };
  const prelude = stepCombatPrelude({ dt, blocking: host.blocking, playerMode: host.playerMode,
    player, blade, run, platforms: host.platforms, protection: host.protection, timers,
    tuning: { flowGuardTier: CONFIG.resilience.flowGuardTier, flowGuardMultiplier: CONFIG.resilience.flowGuardMult,
      thrownMoveBoost: CONFIG.player.thrownMoveBoost, orbitMove: CONFIG.weapons.ringblade.orbitMove },
    overrunMovementMultiplier: host.overrunMovementMultiplier(), stepCinematic: host.stepCinematic,
    flushClosingInput: host.flushClosingInput, updateWeaponAbilities: host.updateWeaponAbilities,
    updateZonesAndWalls: host.updateWorldHazards, syncVoidSupport: host.syncVoidSupport,
    activateThrowSecondary: host.activateThrowSecondary });
  state.throwCooldown = timers.throwCooldown;
  if (prelude.blocked) return { blocked: true };
  if (prelude.linkBreakReason) host.linkBroken(prelude.linkBreakReason);
  runSecondary(host, prelude.previousBladeState, prelude.wasReturning, !!prelude.linkBreakReason);
  host.updateFeedback(dt); runLocomotion(host, dt); runTransport(host); host.updateWave(dt);
  const transformed = stepEnemyActors({ dt, enemies: host.enemies, platforms: host.platforms, player,
    projectiles: host.projectiles, freeze: run.pg?.freeze === true, gravity: CONFIG.world.gravity,
    groundY: CONFIG.world.groundY, viewportWidth: host.width,
    onKill: host.onKill, startTransformation: (enemy, request) => host.startTransformation(enemy as LiveEnemy, request) });
  if (transformed || host.transformationBlocked) return { blocked: true };
  host.updateSupports(dt);
  stepEnemyStatuses({ dt, enemies: host.enemies, cinderSlow: !!run.mods.cinderSlow, random: host.random,
    ember: host.ember, drip: host.drip, didDie: (enemy) => enemy.dead, onArmorBypass: host.armorBypass,
    onKill: (enemy) => { host.onKill(enemy as LiveEnemy, "skill"); } });
  host.resolveBossZones(); host.updateBossArenaPlatforms(dt); runPlatformLifecycle(host, dt); host.updateVoidScroll(dt);
  runBosses(host, dt); host.updateEffects(dt);
  return { blocked: false };
}

function runSecondary(host: LiveOpeningPhaseHost, previousState: string, wasReturning: boolean, linkBroken: boolean): void {
  const { blade, run } = host;
  stepWeaponSecondary({ previousState, wasReturning, linkBroken, blade, enemies: host.enemies,
    secondPass: Number(run.mods.secondPass) || 1, redirect: !!run.mods.redirect, stormBurst: Number(run.mods.stormBurst) || 0,
    collisionDamage: CONFIG.weapons.chainblade.collisionDamage, yankSpeed: CONFIG.weapons.chainblade.yankSpeed,
    throwSpeed: CONFIG.blade.throw.speed, damageMultiplier: host.runDamageMultiplier(), distance: host.distance,
    aoe: host.areaDamage, ring: (x, y, radius) => { host.ring(x, y, radius, "perfect"); },
    burst: (enemy, vx, vy) => { host.burst(enemy.x, enemy.y, vx, vy, 7, "perfect"); },
    floater: (enemy, text) => { host.floater(enemy.x, enemy.y - 30, text, true, "perfect"); },
    didDie: (enemy) => enemy.dead, onKill: (enemy) => { host.onKill(enemy as LiveEnemy, "skill"); },
    onCatch: host.fireWeaponCatch,
    onStormBurst: () => { host.areaDamage(host.player.x, host.player.y, 155, 30); host.ring(host.player.x, host.player.y, 15, "perfect"); host.shake(true); host.sound("slam"); },
    worldImpact: host.weaponWorldImpact, lobExplode: host.lobExplode, emitThrowResolve: host.emitThrowResolve,
    nearestEnemy: host.nearestEnemy });
}

function runLocomotion(host: LiveOpeningPhaseHost, dt: number): void {
  const { player, blade, run, state } = host;
  const locomotion = { wasDashing: state.wasDashing, wasSwinging: state.wasSwinging, wasOnGround: state.wasOnGround,
    dashGhostTime: state.dashGhostTime, landingVelocity: state.landingVelocity, contacts: run._dashContacts ?? new Set<LocomotionEnemy>() };
  stepLocomotionCombat({ dt, player, blade, enemies: host.enemies, state: locomotion,
    concussive: Number(run.mods.concussive) || 0, concussiveStun: !!run.mods.concStun, concussiveRefund: !!run.mods.concRefund,
    phantomDamage: Number(run.mods.phantomDash) || 0, phantomRefund: !!run.mods.phantomRefund, cinder: !!run.mods.cinder,
    maxFall: CONFIG.player.maxFall, ghostInterval: CONFIG.juice.dashGhostInterval, lowGraphics: host.lowGraphics,
    overlap: host.overlap, distance: (actor, enemy) => host.distance(actor.x, actor.y, enemy.x, enemy.y),
    aoe: (radius, damage) => { host.areaDamage(player.x, player.y, radius, damage); },
    dashStarted: host.fireDashStart, dashContact: (enemy) => { host.fireDashContact(enemy as LiveEnemy); },
    swing: (speed) => { host.sound("swing", speed); }, ring: host.ring, burst: host.burst,
    shake: () => { host.shake(); }, slam: () => { host.sound("slam"); }, land: () => { host.sound("land"); },
    ghost: (color) => { host.ghost(player.x, player.y, player.hw, player.hh, color); }, ember: host.ember, smoke: host.smoke,
    floater: (enemy, damage) => { host.floater(enemy.x, enemy.y - 24, String(Math.round(damage)), false); },
    styleHit: host.styleHit, kill: (enemy) => { host.onKill(enemy as LiveEnemy); }, didDie: (enemy) => enemy.dead });
  state.wasDashing = locomotion.wasDashing; state.wasSwinging = locomotion.wasSwinging; state.wasOnGround = locomotion.wasOnGround;
  state.dashGhostTime = locomotion.dashGhostTime; state.landingVelocity = locomotion.landingVelocity; run._dashContacts = locomotion.contacts;
}

function runTransport(host: LiveOpeningPhaseHost): void {
  const result = handleWeaponTransport({ requested: host.consumeThrow(), player: host.player, blade: host.blade,
    cooldown: host.state.throwCooldown,
    onThrow: (throwId) => { host.run.weaponStats.throws++; host.logThrowLaunch(throwId); host.burst(host.blade.x, host.blade.y, host.blade.vx, host.blade.vy, 6); host.shake(); host.sound("throwBlade"); host.fireThrowLaunch(throwId); },
    onRecall: host.activateThrowSecondary,
    onQueued: (x, y) => { host.floater(x, y - 40, "LINK QUEUED", false, "bladeTrail"); },
    onTooFar: (x, y) => { host.floater(x, y - 40, "too far", false); } });
  host.state.throwCooldown = result.cooldown;
}

function runPlatformLifecycle(host: LiveOpeningPhaseHost, dt: number): void {
  const broken = host.run._brokenPlats ?? [];
  for (const intent of advancePlatformLifecycle(host.platforms, broken, dt)) {
    const x = intent.platform.x + intent.platform.w / 2;
    if (intent.type === "break") {
      const color = intent.color && intent.color.length > 0 ? intent.color : "ink";
      host.ring(x, intent.platform.y, 18, color); host.burst(x, intent.platform.y, 0, 1, 8, color);
    }
    else host.ring(x, intent.platform.y, 12, "reform");
  }
  if (!host.run._brokenPlats && broken.length > 0) host.run._brokenPlats = broken;
}

function runBosses(host: LiveOpeningPhaseHost, dt: number): void {
  stepBossRuntime({ dt, player: host.player, platforms: host.platforms, enemies: host.enemies, run: host.run,
    thawMultiplier: CONFIG.source.thawSpeedMult || 1.35, maximumScrollSpeed: CONFIG.source.scrollSpeedMax,
    unlockWitness: host.unlockWitness, startVoidDescent: (boss) => { host.startVoidDescent(boss as LiveEnemy); },
    spawnAdds: (boss) => host.spawnBossAdds(boss as LiveEnemy), spawnClone: (boss) => { host.spawnBossClone(boss as LiveEnemy); },
    floater: (x, y, text) => { host.floater(x, y, text, true, "charger"); }, dramaticBeat: host.dramaticBeat,
    removeClone: (clone) => { host.removeBossClone(clone as LiveEnemy); },
    spikeImpact: (enemy) => { const ground = enemy.y + enemy.hh; host.ring(enemy.x, ground, 10, "slam"); host.burst(enemy.x, ground, 0, -1, 7, "slam"); host.shake(true); host.sound("slam"); } });
}

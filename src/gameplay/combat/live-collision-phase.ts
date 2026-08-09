import type { CONFIG as GameConfiguration } from "../../config/game-config";
import type { HeldBladeCollisionInput, HeldBladeEnemy, HeldBladePlayer, HeldBladeRun,
  HeldBladeWeapon, HeldWeaponEffect } from "./held-blade-collision-contracts";
import { resolveHeldBladeEnemyCollisions } from "./held-blade-collision-runtime";
import { resolveThrownCollisions, type SweeperProjectile, type ThrownBlade, type ThrownEnemy,
  type ThrownPlayer, type ThrownRun, type ThrowEffect } from "./thrown-collision-runtime";
import { resolveHeldBladeParries, type ParryBlade, type ParryPlayer, type ParryProjectile,
  type ParryRun } from "./blade-parry-runtime";
import { resolveEnemyContact, resolveHostileBladeContact, type ContactEnemy, type ContactPlayer,
  type HostileBlade } from "./contact-runtime";
import { finalizeCombatTick, markFallenEnemies, resolvePlayerDeath, runTrainingTick, type TailEnemy, type TailFloater,
  type TailPlayer, type TailProjectile, type TailRun } from "./combat-tail-runtime";
import type { CombatEntityRuntime } from "./combat-entity-runtime";
import type { BladePlayerPort } from "../entities/blade-contracts";

export type LivePlayer = HeldBladePlayer & ThrownPlayer & ParryPlayer & ContactPlayer & TailPlayer & BladePlayerPort;
export type LiveBlade = HeldBladeWeapon & ThrownBlade & ParryBlade & HostileBlade & {
  heldCollisionSegment(player: LivePlayer): HeldBladeCollisionInput["segment"];
  aimX: number; aimY: number;
};
export type LiveEnemy = HeldBladeEnemy & ThrownEnemy & ContactEnemy & TailEnemy;
export type LiveProjectile = SweeperProjectile & ParryProjectile & TailProjectile;
export type LiveRun = HeldBladeRun & ThrownRun & TailRun & ParryRun & {
  mods: HeldBladeRun["mods"] & ThrownRun["mods"] & { phaseStep?: boolean; parryStun?: boolean; aegisParry?: boolean };
};

export interface LiveCollisionPhaseState {
  hitStop: number; slowMotion: number; shake: number;
  enemies: LiveEnemy[]; projectiles: LiveProjectile[]; floaters: TailFloater[];
}
export interface LiveCollisionPhaseHost {
  /** The owning world's mutable configuration, captured before any actors. */
  readonly config: typeof GameConfiguration;
  readonly player: LivePlayer; readonly blade: LiveBlade; readonly run: LiveRun;
  readonly combat: CombatEntityRuntime; readonly width: number;
  readonly state: LiveCollisionPhaseState;
  weaponHit: (enemy: LiveEnemy, quality: number, damage: number, slam: boolean, launch: boolean, empowered: boolean) => HeldWeaponEffect | null | undefined;
  throwHit: (enemy: LiveEnemy, secondary: boolean, throwId: number) => ThrowEffect | null | undefined;
  runDamageMultiplier: () => number; noteFirstDamage: (enemy: LiveEnemy, first: boolean) => void;
  logWeapon: (type: string, detail: Readonly<Record<string, unknown>>) => void; emitThrowResolve: (enemy: ThrownEnemy | null, damage: number) => void;
  onKill: (enemy: LiveEnemy, cause?: string) => void; addFloater: (x: number, y: number, text: string, big: boolean, color?: string) => void;
  readonly effects: HeldBladeCollisionInput["effects"];
  sound: (cue: string, big?: boolean) => void; flare: (x: number, y: number, color: string, radius: number, seconds: number) => void;
  addShake: (amount: number) => void; addZoom: (amount: number) => void; addFlash: (amount: number) => void; addStyle: (style: string) => void;
  segmentCircle: (x1: number, y1: number, x2: number, y2: number, x: number, y: number, radius: number) => boolean;
  segmentPointDistance: (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => { px: number; py: number; dist: number };
  weaponSegmentContact: HeldBladeCollisionInput["weaponSegmentContact"];
  distance: (x: number, y: number) => number; clamp: (value: number, min: number, max: number) => number; lerp: (a: number, b: number, t: number) => number;
  nearestEnemy: (x: number, y: number) => { x: number; y: number } | null; areaDamage: (x: number, y: number, radius: number, damage: number) => number;
  lobExplode: (x: number, y: number) => void; splitProjectile: (projectile: ParryProjectile) => void; triggerSlowMotion: () => void;
  emitPerfectParry: () => void; makeHitEvent: (enemy: LiveEnemy, x: number, y: number) => void;
  observeProjectile(projectile: LiveProjectile): void;
  projectileDeflected(projectile: LiveProjectile): void;
  projectileHit(projectile: LiveProjectile, enemy: LiveEnemy): void;
  projectileExpired(projectile: LiveProjectile): void;
  makeSwingEvent: (enemy: LiveEnemy, x: number, y: number, damage: number, quality: number, mechanic?: string) => void;
  makeSlamEvent: (enemy: LiveEnemy) => void; makeReturnEvent: (enemy: LiveEnemy, damage: number) => void;
  makePerfectParryEvent: (projectile: ParryProjectile) => void;
  profileAdd: (name: string, value: number) => void; profileMax: (name: string, value: number) => void; dailyBump: (name: string, value: number) => void;
  achievementsEnabled: () => boolean; achievement: (name: "swing" | "throw" | "parry" | "break" | "jump" | "revive", enemy?: LiveEnemy) => void;
  checkAchievements: () => void; tutorialMark: (name: "strike" | "airHit") => void;
  enemyDefeated: (enemy: LiveEnemy) => void;
  ghostRecording: () => boolean; ghostSample: (dt: number, enemies: readonly LiveEnemy[]) => void; ghostRevive: () => void;
  updateTrick: (dt: number) => void; achievementTick: (dt: number) => void; updateTutorial: (dt: number) => void; updatePlayground: () => void;
  overlap: (ax: number, ay: number, ahw: number, ahh: number, bx: number, by: number, bhw: number, bhh: number) => boolean;
  onShieldAbsorb: () => void; loseStyle: () => void; buzz: (milliseconds: number) => void;
  requestAdContinue: () => void; adAvailable: () => boolean; endRun: () => void;
}

/** Runs the collision-to-death half of a fixed combat tick as one typed phase. */
export function runLiveCollisionPhase(host: LiveCollisionPhaseHost, dt: number): void {
  const { player, blade, run, state, config } = host;
  for (const projectile of state.projectiles) host.observeProjectile(projectile);
  const held = blade.heldCollisionSegment(player);
  state.hitStop = resolveHeldBladeEnemyCollisions({ player, blade, enemies: state.enemies, run, segment: held,
    currentHitStop: state.hitStop, tuning: heldTuning(config, host.width, host.run.mode === "tutorial"),
    effects: heldEffects(host), hooks: heldHooks(host),
    segmentCircle: (segment, x, y, radius) => host.segmentCircle(segment.x1, segment.y1, segment.x2, segment.y2, x, y, radius),
    segmentPointDistance: host.segmentPointDistance, weaponSegmentContact: host.weaponSegmentContact,
    distance: host.distance }).hitStop;
  runThrown(host); runParries(host, held); host.combat.resolveProjectilePhases(dt, projectileTuning(host));
  resolveEnemyContact(state.enemies, player, { overlaps: host.overlap, segmentDistance: () => Infinity,
    onHit: () => { host.loseStyle(); host.sound("hurt"); }, onAbsorbed: host.onShieldAbsorb, onHostileBladeResolved: () => undefined });
  resolveHostileBladeContact(blade, player, player.hw, config.source.stolenBladeDmg || 18, {
    overlaps: () => false, segmentDistance: (x1, y1, x2, y2, x, y) => host.segmentPointDistance(x1, y1, x2, y2, x, y).dist,
    onHit: () => { host.loseStyle(); host.sound("hurt"); }, onAbsorbed: host.onShieldAbsorb,
    onHostileBladeResolved: (target, weapon) => { host.effects.burst(target.x, target.y, weapon.vx, weapon.vy, 8, config.colors.perfect); } });
  markFallenEnemies(state.enemies, config.view.h + 40); host.combat.resolveBomberDeaths(projectileTuning(host));
  for (const projectile of state.projectiles) if (projectile.dead) host.projectileExpired(projectile);
  const tail = finalizeCombatTick({ dt, enemies: state.enemies, projectiles: state.projectiles, floaters: state.floaters,
    shake: state.shake, shakeDecay: config.juice.shakeDecay, player, run, hooks: tailHooks(host) });
  state.enemies = tail.enemies as LiveEnemy[]; state.projectiles = tail.projectiles as LiveProjectile[];
  state.floaters = tail.floaters; state.shake = tail.shake;
  // Only now that the surviving lists are installed may training spawn onto them.
  runTrainingTick(run.mode, dt, { updateTutorial: host.updateTutorial, updatePlayground: host.updatePlayground });
  resolveDeath(host);
}

function heldTuning(config: typeof GameConfiguration, width: number, tutorial: boolean): HeldBladeCollisionInput["tuning"] {
  return { width, groundY: config.world.groundY,
    blade: { minHitSpeed: config.blade.minHitSpeed, launchPower: config.blade.launchPower,
      risingLaunchBonus: config.blade.risingLaunchBonus,
      slamMinDownSpeed: tutorial ? Math.min(config.blade.slamMinDownSpeed, config.blade.minHitSpeed * 0.85) : config.blade.slamMinDownSpeed,
      launchMinUpSpeed: tutorial ? Math.min(config.blade.launchMinUpSpeed, config.blade.minHitSpeed) : config.blade.launchMinUpSpeed,
      risingSpeedRef: config.blade.risingSpeedRef,
      slamPowerSpeed: config.blade.slamPowerSpeed, slamEmpowerAt: config.blade.slamEmpowerAt,
      slamMultiplier: config.blade.slamMultiplier, slamPowerBonus: config.blade.slamPowerBonus,
      risingDmgBonus: config.blade.risingDmgBonus, tutorialRecognition: tutorial },
    style: { styleDamage: config.skill.styleDamage, styleDamageMax: config.skill.styleDamageMax, aerialRaveCap: config.skill.aerialRaveCap },
    hitStop: { small: config.hitStop.small, big: config.hitStop.big, threshold: config.hitStop.threshold },
    juice: { sparkCount: config.juice.sparkCount, shakeSmall: config.juice.shakeSmall, shakeBig: config.juice.shakeBig, zoomBig: config.juice.zoomBig },
    colors: { perfect: config.colors.perfect, armoredShield: config.colors.armoredShield, slam: config.colors.slam, charger: config.colors.charger },
    spearWallPinDuration: config.weapons.spear.wallPinDuration, lifestealCooldown: config.resilience.lifestealCd };
}
function heldEffects(host: LiveCollisionPhaseHost): HeldBladeCollisionInput["effects"] {
  return host.effects;
}
function heldHooks(host: LiveCollisionPhaseHost): HeldBladeCollisionInput["hooks"] {
  return { weaponHit: host.weaponHit, noteFirstDamage: host.noteFirstDamage,
    logHit: (damage, quality, observation, mechanic) => {
      host.logWeapon("heldHit", { damage, quality, ...observation, ...(mechanic ? { mechanic } : {}) });
    },
    onKill: host.onKill, dealArea: host.areaDamage, fireHit: host.makeHitEvent, fireSwingHit: host.makeSwingEvent,
    fireSlam: host.makeSlamEvent, achievementsEnabled: host.achievementsEnabled, addProfileStat: host.profileAdd,
    maxProfileStat: host.profileMax, bumpDaily: host.dailyBump, achievementSwing: () => { host.achievement("swing"); },
    achievementBossHit: (enemy) => { host.achievement("swing", enemy as LiveEnemy); }, checkAchievements: host.checkAchievements,
    runDamageMultiplier: host.runDamageMultiplier };
}

function runThrown(host: LiveCollisionPhaseHost): void {
  const { blade, player, run, state, config } = host;
  resolveThrownCollisions(blade, player, state.enemies, state.projectiles, run, {
    duelCooldown: config.exotic.duelCd, throwLowMultiplier: config.blade.throw.loMult, throwHighMultiplier: config.blade.throw.hiMult,
    recallMultiplier: config.blade.throw.recallMult, maxThrowSpeed: config.blade.throw.maxSpeed, throwSpeed: config.blade.throw.speed,
    ringbladeEnemyCost: config.weapons.ringblade.enemyCost, chainbladeBindDuration: config.weapons.chainblade.bindDuration,
    hitStopSmall: config.hitStop.small, shakeSmall: config.juice.shakeSmall, sparkCount: config.juice.sparkCount,
    colors: { deflected: config.colors.deflected, armoredShield: config.colors.armoredShield, perfect: config.colors.perfect,
      charger: config.colors.charger, bladeTrail: config.colors.bladeTrail } }, {
    segmentCircle: (segment, x, y, radius) => host.segmentCircle(segment.x1, segment.y1, segment.x2, segment.y2, x, y, radius),
    distance: host.distance, clamp: host.clamp, weaponHit: host.throwHit, runDamageMultiplier: host.runDamageMultiplier,
    noteFirstDamage: host.noteFirstDamage, logHit: (throwId, damage, secondary, mechanic) => { host.logWeapon("throwHit", { throwId, damage, secondary, ...(mechanic ? { mechanic } : {}) }); },
    emitResolve: host.emitThrowResolve, onKill: host.onKill,
    burst: (...args) => { host.effects.burst(...args); }, ribbon: (...args) => { host.effects.ribbon(...args); },
    ring: (...args) => { host.effects.ring(...args); }, floater: host.addFloater,
    soundDeflect: () => { host.sound("deflect"); }, shake: host.addShake, setHitStop: (value) => { state.hitStop = value; }, style: host.addStyle,
    achievementsEnabled: host.achievementsEnabled,
    recordThrowAchievement: (enemy, pierces, damage) => { host.profileMax("maxDamageHit", Math.round(damage)); host.achievement("throw", enemy as LiveEnemy); host.profileMax("bladeBounces", pierces); },
    recordPierceKill: () => { host.profileMax("throwPierceKills", 1); host.checkAchievements(); },
    fireHit: (enemy) => { host.makeHitEvent(enemy as LiveEnemy, enemy.x, enemy.y); }, fireReturnHit: (enemy, damage) => { host.makeReturnEvent(enemy as LiveEnemy, damage); },
    lobExplode: host.lobExplode });
}

function runParries(host: LiveCollisionPhaseHost, held: HeldBladeCollisionInput["segment"]): void {
  const { blade, player, run, state, config } = host;
  resolveHeldBladeParries(state.projectiles, blade, player, run, {
    deflectMinSpeed: config.blade.deflectMinSpeed, perfectSpeed: config.blade.perfectSpeed,
    counterParryFactor: config.blade.counterParryFactor, parryGuardTime: config.resilience.parryGuardTime,
    hitStopSmall: config.hitStop.small, hitStopBig: config.hitStop.big, shakeSmall: config.juice.shakeSmall,
    shakeBig: config.juice.shakeBig, zoomParry: config.juice.zoomParry, zoomBig: config.juice.zoomBig,
    flashParry: config.juice.flashParry, bomberBlastRadius: config.bomber.blastRadius,
    bomberBlastDamage: config.bomber.blastDmg, colors: { perfect: config.colors.perfect, deflected: config.colors.deflected, bomber: config.colors.bomber } }, {
    intersects: (shot) => host.segmentCircle(held.x1, held.y1, held.x2, held.y2, shot.x, shot.y, shot.r + held.pad),
    clamp: host.clamp, lerp: host.lerp, nearestEnemy: host.nearestEnemy,
    burst: (...args) => { host.effects.burst(...args); }, ring: (...args) => { host.effects.ring(...args); },
    explode: (...args) => { host.effects.explode(...args); }, floater: host.addFloater,
    areaDamage: host.areaDamage, split: host.splitProjectile, setHitStop: (value) => { state.hitStop = value; }, shake: host.addShake,
    zoom: host.addZoom, flash: host.addFlash, flare: host.flare,
    slowMotion: host.triggerSlowMotion, extendSlowMotion: (scale) => { state.slowMotion = Math.max(state.slowMotion, config.juice.parrySlowmo * scale); },
    style: host.addStyle, sound: (name) => { host.sound(name); }, achievementParry: () => { host.achievement("parry"); },
    logPerfectParry: (source) => { host.logWeapon("perfectParry", { source: source && typeof source === "object" && "kind" in source ? Reflect.get(source, "kind") : undefined }); },
    projectileDeflected: (projectile) => { host.projectileDeflected(projectile); },
    emitPerfectParry: host.emitPerfectParry, firePerfectParry: host.makePerfectParryEvent });
}

function projectileTuning(host: LiveCollisionPhaseHost) {
  const { config } = host;
  return { projectileDamage: config.proj.dmg, projectileSpeed: config.proj.speed, deflectBoost: config.blade.deflectBoost,
    deflectDamageMultiplier: config.blade.deflectDmgMult, runDamageMultiplier: host.runDamageMultiplier(), phaseStep: !!host.run.mods.phaseStep,
    parryStun: !!host.run.mods.parryStun, aegisParry: !!host.run.mods.aegisParry, sparkCount: config.juice.sparkCount,
    deflectedColor: config.colors.deflected, rootColor: config.colors.armoredShield, shakeBig: config.juice.shakeBig,
    shakeSmall: config.juice.shakeSmall, achievementTracking: host.achievementsEnabled(), groundY: config.world.groundY,
    mineTrigger: config.bomber.mineTrigger, blastRadius: config.bomber.blastRadius, blastDamage: config.bomber.blastDmg,
    sludgeZoneRadius: config.exotic.sludgeZoneR, sludgeZoneLife: config.exotic.sludgeZoneLife, bomberColor: config.colors.bomber,
    perfectColor: config.colors.perfect, sludgeColor: config.colors.sludge, flashParry: config.juice.flashParry, enemyShotColor: config.colors.enemyShot };
}

function tailHooks(host: LiveCollisionPhaseHost) {
  return { enemyDefeated: host.enemyDefeated, ghostRecording: host.ghostRecording, ghostSample: host.ghostSample,
    updateTrick: host.updateTrick, breakStreak: () => { host.achievement("break"); }, jumped: () => { host.achievement("jump"); },
    achievementTick: host.achievementTick, maxStat: host.profileMax, checkAchievements: host.checkAchievements,
    achievementsEnabled: host.achievementsEnabled };
}
function resolveDeath(host: LiveCollisionPhaseHost): void {
  resolvePlayerDeath(host.player, host.run, {
    trainingReset: (target) => { host.addFloater(target.x, target.y - 44, "RESET", true, host.config.colors.perfect); host.effects.ring(target.x, target.y, 14, host.config.colors.perfect); },
    shopRevive: (target) => { revive(host, target, false); }, abilityRevive: (target) => { revive(host, target, true); },
    adAvailable: host.adAvailable, requestAdContinue: host.requestAdContinue, endRun: host.endRun });
}
function revive(host: LiveCollisionPhaseHost, target: TailPlayer, ability: boolean): void {
  const { config } = host;
  if (ability) { host.effects.explode(target.x, target.y, config.colors.charger, 1.1); host.addFloater(target.x, target.y - 44, "LAST STAND", true, config.colors.charger); }
  else { host.effects.ring(target.x, target.y, 16, config.colors.perfect); host.effects.burst(target.x, target.y, 0, -1, 16, config.colors.perfect); host.addFloater(target.x, target.y - 44, "SECOND WIND", true, config.colors.perfect); }
  host.addShake(config.juice.shakeBig); host.addFlash(config.juice.flashParry);
  host.sound(ability ? "counter" : "parry");
  if (host.achievementsEnabled()) { host.profileAdd("revivesUsed", 1); host.achievement("revive"); host.ghostRevive(); host.checkAchievements(); }
}

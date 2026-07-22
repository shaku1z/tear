import { CONFIG } from "../../config/game-config";
import type { HeldBladeCollisionInput, HeldBladeEnemy, HeldBladePlayer, HeldBladeRun,
  HeldBladeWeapon, HeldWeaponEffect } from "./held-blade-collision-contracts";
import { resolveHeldBladeEnemyCollisions } from "./held-blade-collision-runtime";
import { resolveThrownCollisions, type SweeperProjectile, type ThrownBlade, type ThrownEnemy,
  type ThrownPlayer, type ThrownRun, type ThrowEffect } from "./thrown-collision-runtime";
import { resolveHeldBladeParries, type ParryBlade, type ParryPlayer, type ParryProjectile,
  type ParryRun } from "./blade-parry-runtime";
import { resolveEnemyContact, resolveHostileBladeContact, type ContactEnemy, type ContactPlayer,
  type HostileBlade } from "./contact-runtime";
import { finalizeCombatTick, markFallenEnemies, resolvePlayerDeath, type TailEnemy, type TailFloater,
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
  makeSwingEvent: (enemy: LiveEnemy, x: number, y: number, damage: number, quality: number, mechanic?: string) => void;
  makeSlamEvent: (enemy: LiveEnemy) => void; makeReturnEvent: (enemy: LiveEnemy, damage: number) => void;
  makePerfectParryEvent: (projectile: ParryProjectile) => void;
  profileAdd: (name: string, value: number) => void; profileMax: (name: string, value: number) => void; dailyBump: (name: string, value: number) => void;
  achievementsEnabled: () => boolean; achievement: (name: "swing" | "throw" | "parry" | "break" | "jump" | "revive", enemy?: LiveEnemy) => void;
  checkAchievements: () => void; tutorialMark: (name: "strike" | "airHit") => void;
  ghostRecording: () => boolean; ghostDeath: (enemy: LiveEnemy) => void; ghostSample: (dt: number, enemies: readonly LiveEnemy[]) => void; ghostRevive: () => void;
  updateTrick: (dt: number) => void; achievementTick: (dt: number) => void; updateTutorial: (dt: number) => void; updatePlayground: () => void;
  overlap: (ax: number, ay: number, ahw: number, ahh: number, bx: number, by: number, bhw: number, bhh: number) => boolean;
  onShieldAbsorb: () => void; loseStyle: () => void; buzz: (milliseconds: number) => void;
  requestAdContinue: () => void; adAvailable: () => boolean; endRun: () => void;
}

/** Runs the collision-to-death half of a fixed combat tick as one typed phase. */
export function runLiveCollisionPhase(host: LiveCollisionPhaseHost, dt: number): void {
  const { player, blade, run, state } = host;
  const held = blade.heldCollisionSegment(player);
  state.hitStop = resolveHeldBladeEnemyCollisions({ player, blade, enemies: state.enemies, run, segment: held,
    currentHitStop: state.hitStop, tuning: heldTuning(host.width), effects: heldEffects(host), hooks: heldHooks(host),
    segmentCircle: (segment, x, y, radius) => host.segmentCircle(segment.x1, segment.y1, segment.x2, segment.y2, x, y, radius),
    segmentPointDistance: host.segmentPointDistance, weaponSegmentContact: host.weaponSegmentContact,
    distance: host.distance }).hitStop;
  runThrown(host); runParries(host, held); host.combat.resolveProjectilePhases(dt, projectileTuning(host));
  resolveEnemyContact(state.enemies, player, { overlaps: host.overlap, segmentDistance: () => Infinity,
    onHit: () => { host.loseStyle(); host.sound("hurt"); }, onAbsorbed: host.onShieldAbsorb, onHostileBladeResolved: () => undefined });
  resolveHostileBladeContact(blade, player, player.hw, CONFIG.source.stolenBladeDmg || 18, {
    overlaps: () => false, segmentDistance: (x1, y1, x2, y2, x, y) => host.segmentPointDistance(x1, y1, x2, y2, x, y).dist,
    onHit: () => { host.loseStyle(); host.sound("hurt"); }, onAbsorbed: host.onShieldAbsorb,
    onHostileBladeResolved: (target, weapon) => { host.effects.burst(target.x, target.y, weapon.vx, weapon.vy, 8, CONFIG.colors.perfect); } });
  markFallenEnemies(state.enemies, CONFIG.view.h + 40); host.combat.resolveBomberDeaths(projectileTuning(host));
  const tail = finalizeCombatTick({ dt, enemies: state.enemies, projectiles: state.projectiles, floaters: state.floaters,
    shake: state.shake, shakeDecay: CONFIG.juice.shakeDecay, player, run, hooks: tailHooks(host) });
  state.enemies = tail.enemies as LiveEnemy[]; state.projectiles = tail.projectiles as LiveProjectile[];
  state.floaters = tail.floaters; state.shake = tail.shake; resolveDeath(host);
}

function heldTuning(width: number): HeldBladeCollisionInput["tuning"] {
  return { width, groundY: CONFIG.world.groundY,
    blade: { minHitSpeed: CONFIG.blade.minHitSpeed, launchPower: CONFIG.blade.launchPower,
      risingLaunchBonus: CONFIG.blade.risingLaunchBonus, slamMinDownSpeed: CONFIG.blade.slamMinDownSpeed,
      launchMinUpSpeed: CONFIG.blade.launchMinUpSpeed, risingSpeedRef: CONFIG.blade.risingSpeedRef,
      slamPowerSpeed: CONFIG.blade.slamPowerSpeed, slamEmpowerAt: CONFIG.blade.slamEmpowerAt,
      slamMultiplier: CONFIG.blade.slamMultiplier, slamPowerBonus: CONFIG.blade.slamPowerBonus, risingDmgBonus: CONFIG.blade.risingDmgBonus },
    style: { styleDamage: CONFIG.skill.styleDamage, styleDamageMax: CONFIG.skill.styleDamageMax, aerialRaveCap: CONFIG.skill.aerialRaveCap },
    hitStop: { small: CONFIG.hitStop.small, big: CONFIG.hitStop.big, threshold: CONFIG.hitStop.threshold },
    juice: { sparkCount: CONFIG.juice.sparkCount, shakeSmall: CONFIG.juice.shakeSmall, shakeBig: CONFIG.juice.shakeBig, zoomBig: CONFIG.juice.zoomBig },
    colors: { perfect: CONFIG.colors.perfect, armoredShield: CONFIG.colors.armoredShield, slam: CONFIG.colors.slam, charger: CONFIG.colors.charger },
    spearWallPinDuration: CONFIG.weapons.spear.wallPinDuration, lifestealCooldown: CONFIG.resilience.lifestealCd };
}
function heldEffects(host: LiveCollisionPhaseHost): HeldBladeCollisionInput["effects"] {
  return host.effects;
}
function heldHooks(host: LiveCollisionPhaseHost): HeldBladeCollisionInput["hooks"] {
  return { weaponHit: host.weaponHit, noteFirstDamage: host.noteFirstDamage,
    logHit: (damage, quality, mechanic) => { host.logWeapon("heldHit", { damage, quality, ...(mechanic ? { mechanic } : {}) }); },
    onKill: host.onKill, dealArea: host.areaDamage, fireHit: host.makeHitEvent, fireSwingHit: host.makeSwingEvent,
    fireSlam: host.makeSlamEvent, achievementsEnabled: host.achievementsEnabled, addProfileStat: host.profileAdd,
    maxProfileStat: host.profileMax, bumpDaily: host.dailyBump, achievementSwing: () => { host.achievement("swing"); },
    achievementBossHit: (enemy) => { host.achievement("swing", enemy as LiveEnemy); }, checkAchievements: host.checkAchievements,
    runDamageMultiplier: host.runDamageMultiplier };
}

function runThrown(host: LiveCollisionPhaseHost): void {
  const { blade, player, run, state } = host;
  resolveThrownCollisions(blade, player, state.enemies, state.projectiles, run, {
    duelCooldown: CONFIG.exotic.duelCd, throwLowMultiplier: CONFIG.blade.throw.loMult, throwHighMultiplier: CONFIG.blade.throw.hiMult,
    recallMultiplier: CONFIG.blade.throw.recallMult, maxThrowSpeed: CONFIG.blade.throw.maxSpeed, throwSpeed: CONFIG.blade.throw.speed,
    ringbladeEnemyCost: CONFIG.weapons.ringblade.enemyCost, chainbladeBindDuration: CONFIG.weapons.chainblade.bindDuration,
    hitStopSmall: CONFIG.hitStop.small, shakeSmall: CONFIG.juice.shakeSmall, sparkCount: CONFIG.juice.sparkCount,
    colors: { deflected: CONFIG.colors.deflected, armoredShield: CONFIG.colors.armoredShield, perfect: CONFIG.colors.perfect,
      charger: CONFIG.colors.charger, bladeTrail: CONFIG.colors.bladeTrail } }, {
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
  const { blade, player, run, state } = host;
  resolveHeldBladeParries(state.projectiles, blade, player, run, {
    deflectMinSpeed: CONFIG.blade.deflectMinSpeed, perfectSpeed: CONFIG.blade.perfectSpeed,
    counterParryFactor: CONFIG.blade.counterParryFactor, parryGuardTime: CONFIG.resilience.parryGuardTime,
    hitStopSmall: CONFIG.hitStop.small, hitStopBig: CONFIG.hitStop.big, shakeSmall: CONFIG.juice.shakeSmall,
    shakeBig: CONFIG.juice.shakeBig, zoomParry: CONFIG.juice.zoomParry, zoomBig: CONFIG.juice.zoomBig,
    flashParry: CONFIG.juice.flashParry, bomberBlastRadius: CONFIG.bomber.blastRadius,
    bomberBlastDamage: CONFIG.bomber.blastDmg, colors: { perfect: CONFIG.colors.perfect, deflected: CONFIG.colors.deflected, bomber: CONFIG.colors.bomber } }, {
    intersects: (shot) => host.segmentCircle(held.x1, held.y1, held.x2, held.y2, shot.x, shot.y, shot.r + held.pad),
    clamp: host.clamp, lerp: host.lerp, nearestEnemy: host.nearestEnemy,
    burst: (...args) => { host.effects.burst(...args); }, ring: (...args) => { host.effects.ring(...args); },
    explode: (...args) => { host.effects.explode(...args); }, floater: host.addFloater,
    areaDamage: host.areaDamage, split: host.splitProjectile, setHitStop: (value) => { state.hitStop = value; }, shake: host.addShake,
    zoom: host.addZoom, flash: host.addFlash, flare: host.flare,
    slowMotion: host.triggerSlowMotion, extendSlowMotion: (scale) => { state.slowMotion = Math.max(state.slowMotion, CONFIG.juice.parrySlowmo * scale); },
    style: host.addStyle, sound: (name) => { host.sound(name); }, achievementParry: () => { host.achievement("parry"); },
    logPerfectParry: (source) => { host.logWeapon("perfectParry", { source: source && typeof source === "object" && "kind" in source ? Reflect.get(source, "kind") : undefined }); },
    emitPerfectParry: host.emitPerfectParry, firePerfectParry: host.makePerfectParryEvent });
}

function projectileTuning(host: LiveCollisionPhaseHost) {
  return { projectileDamage: CONFIG.proj.dmg, projectileSpeed: CONFIG.proj.speed, deflectBoost: CONFIG.blade.deflectBoost,
    deflectDamageMultiplier: CONFIG.blade.deflectDmgMult, runDamageMultiplier: host.runDamageMultiplier(), phaseStep: !!host.run.mods.phaseStep,
    parryStun: !!host.run.mods.parryStun, aegisParry: !!host.run.mods.aegisParry, sparkCount: CONFIG.juice.sparkCount,
    deflectedColor: CONFIG.colors.deflected, rootColor: CONFIG.colors.armoredShield, shakeBig: CONFIG.juice.shakeBig,
    shakeSmall: CONFIG.juice.shakeSmall, achievementTracking: host.achievementsEnabled(), groundY: CONFIG.world.groundY,
    mineTrigger: CONFIG.bomber.mineTrigger, blastRadius: CONFIG.bomber.blastRadius, blastDamage: CONFIG.bomber.blastDmg,
    sludgeZoneRadius: CONFIG.exotic.sludgeZoneR, sludgeZoneLife: CONFIG.exotic.sludgeZoneLife, bomberColor: CONFIG.colors.bomber,
    perfectColor: CONFIG.colors.perfect, sludgeColor: CONFIG.colors.sludge, flashParry: CONFIG.juice.flashParry, enemyShotColor: CONFIG.colors.enemyShot };
}

function tailHooks(host: LiveCollisionPhaseHost) {
  return { ghostRecording: host.ghostRecording, ghostDeath: host.ghostDeath, ghostSample: host.ghostSample,
    updateTrick: host.updateTrick, breakStreak: () => { host.achievement("break"); }, jumped: () => { host.achievement("jump"); },
    achievementTick: host.achievementTick, maxStat: host.profileMax, checkAchievements: host.checkAchievements,
    achievementsEnabled: host.achievementsEnabled, updateTutorial: host.updateTutorial, updatePlayground: host.updatePlayground };
}
function resolveDeath(host: LiveCollisionPhaseHost): void {
  resolvePlayerDeath(host.player, host.run, {
    trainingReset: (target) => { host.addFloater(target.x, target.y - 44, "RESET", true, CONFIG.colors.perfect); host.effects.ring(target.x, target.y, 14, CONFIG.colors.perfect); },
    shopRevive: (target) => { revive(host, target, false); }, abilityRevive: (target) => { revive(host, target, true); },
    adAvailable: host.adAvailable, requestAdContinue: host.requestAdContinue, endRun: host.endRun });
}
function revive(host: LiveCollisionPhaseHost, target: TailPlayer, ability: boolean): void {
  if (ability) { host.effects.explode(target.x, target.y, CONFIG.colors.charger, 1.1); host.addFloater(target.x, target.y - 44, "LAST STAND", true, CONFIG.colors.charger); }
  else { host.effects.ring(target.x, target.y, 16, CONFIG.colors.perfect); host.effects.burst(target.x, target.y, 0, -1, 16, CONFIG.colors.perfect); host.addFloater(target.x, target.y - 44, "SECOND WIND", true, CONFIG.colors.perfect); }
  host.addShake(CONFIG.juice.shakeBig); host.addFlash(CONFIG.juice.flashParry);
  host.sound(ability ? "counter" : "parry");
  if (host.achievementsEnabled()) { host.profileAdd("revivesUsed", 1); host.achievement("revive"); host.ghostRevive(); host.checkAchievements(); }
}

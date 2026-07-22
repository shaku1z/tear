import { overrunMovementMultiplier } from "../gameplay/combat/overrun";
import { applyCombatFeedback, type CombatFeedbackEvent } from "../gameplay/combat/combat-feedback-runtime";
import type { CombatEntityRuntimeHooks } from "../gameplay/combat/combat-entity-runtime";
import type { LiveOpeningPhaseHost } from "../gameplay/combat/live-opening-phase";
import type { LiveCollisionPhaseHost } from "../gameplay/combat/live-collision-phase";
import type { LiveKillHost } from "../gameplay/combat/live-kill-runtime";
import type { LiveCombatActionAdapters, LiveCombatActionContext, CombatEnemy, CombatProjectile } from "./live-combat-action-context";
import type { LiveCollisionPhaseState } from "../gameplay/combat/live-collision-phase";

/** Builds the detailed legacy effect/event adapters outside the application composition root. */
export function createLiveCombatActions<
  Enemy extends CombatEnemy,
  Projectile extends CombatProjectile,
  Floater extends LiveCollisionPhaseState["floaters"][number],
>(context: LiveCombatActionContext<Enemy, Projectile, Floater>): LiveCombatActionAdapters {
  const { dependencies: d, live, ports } = context;
  const f = ports.functions;
  const player = () => live.player(), blade = () => live.blade(), run = () => live.run();
  const enemies = () => live.enemies(), projectiles = () => live.projectiles();
  const entities: CombatEntityRuntimeHooks = {
    actors: enemies, projectiles, player,
    slowZones: () => live.slowZones(), setSlowZones: (value) => { live.setSlowZones(value); },
    walls: () => live.walls(), setWalls: (value) => { live.setWalls(value); }, platforms: () => ports.stage.platforms,
    ring: (...args) => { d.FX.ring(...args); }, burst: (...args) => { d.FX.burst(...args); }, explode: (...args) => { d.FX.explode(...args); },
    fxFlash: (...args) => { d.FX.flash(...args); }, floater: f.addFloater, shake: f.addShake, flash: f.addFlash,
    sound: (cue) => { f.playSound(cue); }, loseStyle: f.loseStyle, shieldAbsorbed: f.onShieldAbsorb, addStyle: f.addStyle,
    dashDodge: ports.achievement.dashDodge, maxStat: (stat, value) => { d.PROFILE.maxStat(stat, value); },
    checkAchievements: f.checkAchievements,
    noteFirstDamage: f.entityNoteFirstDamage,
    reflectedHit: (enemy, shot, source) => {
      f.fireMod(f.modHook("onReflectedHit"), f.makeEvent(enemy.x, enemy.y, enemy, "reflected",
        { projectile: shot, sourceEnemy: source, applySever: f.applySever }));
    },
    bossHit: f.entityBossHit, onKill: f.entityResolveKill,
    areaDamage: (x, y, radius, damage, playerOwned) => f.areaDamage(x, y, radius, damage, playerOwned),
  };
  const opening: Omit<LiveOpeningPhaseHost, "state"> = {
    get player() { return player(); }, get blade() { return blade(); }, get run() { return run(); },
    get enemies() { return enemies(); }, get projectiles() { return projectiles(); },
    get platforms() { return ports.stage.platforms; }, width: context.width,
    get blocking() { return ports.cinema.active && ports.cinema.blocksCombat; },
    get playerMode() { return ports.cinema.playerMode; }, get protection() { return live.openingProtection(); },
    get lowGraphics() { return d.GFX.low; },
    get transformationBlocked() { return ports.cinema.active && ports.cinema.blocksCombat; },
    overrunMovementMultiplier: () => overrunMovementMultiplier({ overrun: run().mods.overrun ?? 0,
      overrunStacks: run().mods.overrunStacks ?? 0 }, d.CONFIG.overrun),
    runDamageMultiplier: f.runDamageMultiplier, stepCinematic: f.stepCinematic,
    flushClosingInput() { d.Input.takeClick(); d.Input.tJump = false; },
    updateWeaponAbilities: f.updateWeaponAbilities,
    updateWorldHazards: (seconds) => { updateWorldHazards(context, seconds); },
    syncVoidSupport: f.syncVoidSupport, activateThrowSecondary: f.activateThrowSecondary,
    linkBroken(reason) {
      d.FX.ring(blade().tipX, blade().tipY, 8, d.CONFIG.colors.bladeTrail);
      f.addFloater(blade().tipX, blade().tipY - 22, reason === "range" ? "LINK RANGE" : "LINK LOST", false, d.CONFIG.colors.bladeTrail);
    },
    distance: (ax, ay, bx, by) => d.len(ax - bx, ay - by), areaDamage: f.areaDamage,
    ring(x, y, radius, color) { d.FX.ring(x, y, radius, resolveColor(d, color)); },
    burst(x, y, dx, dy, count, color) { d.FX.burst(x, y, dx, dy, count, resolveColor(d, color)); },
    floater(x, y, text, big, color) { f.addFloater(x, y, text, big, color === undefined ? undefined : resolveColor(d, color)); },
    shake: (big) => { f.addShake(big ? d.CONFIG.juice.shakeBig : d.CONFIG.juice.shakeSmall); },
    sound: (name, speed) => { f.playSound(name, speed); },
    ghost: (x, y, hw, hh, color) => { d.FX.ghost(x, y, hw, hh, color === "slam" ? d.CONFIG.colors.slam : undefined); },
    ember: (x, y) => { d.FX.ember(x, y); }, smoke: (x, y) => { d.FX.smoke(x, y); }, drip: (x, y) => { d.FX.drip(x, y); },
    overlap: (actor, enemy, padding) => d.aabbOverlap(actor.x, actor.y, actor.hw + (padding ?? 0), actor.hh + (padding ?? 0), enemy.x, enemy.y, enemy.hw, enemy.hh),
    styleHit: () => { f.addStyle("hit"); }, onKill: context.resolveKill,
    fireDashStart() {
      f.playSound("dash");
      f.fireMod(f.modHook("onDashStart"), f.makeEvent(player().x, player().y, null, "dash",
        { type: "dashStart", dx: player().dashX, dy: player().dashY }));
      d.FX.burst(player().x, player().y, -player().dashX, -player().dashY, 6, d.CONFIG.colors.perfect);
      if (!d.GFX.low) d.FX.ring(player().x, player().y, 7, d.CONFIG.colors.perfect);
    },
    fireDashContact(enemy) { f.fireMod(f.modHook("onDashContact"), f.makeEvent(enemy.x, enemy.y, enemy, "dash",
      { type: "dashContact", dx: player().dashX, dy: player().dashY })); },
    fireWeaponCatch() { f.fireMod(f.modHook("onWeaponCatch"), f.makeEvent(player().x, player().y, null, "catch",
      { type: "weaponCatch", throwId: blade().throwId, weaponId: run().weaponId })); },
    fireThrowLaunch(throwId) { f.fireMod(f.modHook("onThrowLaunch"), f.makeEvent(blade().x, blade().y, null, "throw",
      { type: "throwLaunch", throwId, weaponId: run().weaponId })); },
    logThrowLaunch: (throwId) => { f.logWeaponEvent("throwLaunch", { throwId }); },
    weaponWorldImpact: f.weaponWorldImpact, lobExplode: () => { f.lobExplode(blade().x, blade().y); },
    emitThrowResolve: () => { f.emitThrowResolve(null, blade().throwDmg); }, nearestEnemy: () => f.openingNearestEnemy(),
    updateFeedback: (seconds) => { updateRuntimeFeedback(context, seconds); }, consumeThrow: f.consumeThrow, updateWave: f.updateWave,
    startTransformation: f.startTransformation, updateSupports: (seconds) => { updateSupports(context, seconds); },
    armorBypass() { if (f.achievementsEnabled()) d.PROFILE.maxStat("armorBypassKills", 1); },
    resolveBossZones: () => { resolveBossZones(context); }, updateBossArenaPlatforms: f.updateBossArenaPlatforms, updateVoidScroll: f.updateVoidScroll,
    unlockWitness() { if (f.achievementsEnabled()) d.ACH.unlock("witness"); },
    startVoidDescent: f.startVoidDescent,
    spawnBossAdds(boss) {
      const adds: Enemy[] = [];
      for (let offset = -1; offset <= 1; offset += 2) {
        const add = f.createCharger(d.clamp(boss.x + offset * 130, 60, context.width - 60), d.CONFIG.world.groundY - 22);
        add.behavior = "bull"; add.hp *= 2.2; add.maxHp = add.hp; add.hpDisplay = add.hp;
        add.speedMult *= 1.35; add.contactDmg *= 1.3; add.canClimb = true; add.climber = true; add.climbApt = 0.85; add.spawnT = 0.35;
        enemies().push(add); adds.push(add);
      }
      return adds;
    },
    spawnBossClone(boss) {
      const clone = f.createReflection(d.clamp(boss.x - boss.facing * 220, 100, context.width - 100), d.CONFIG.world.groundY - 300);
      clone.spawnT = 0.3; enemies().push(clone); f.addFloater(boss.x, boss.y - 70, "SPLIT", true, clone.color);
    },
    removeBossClone: (clone) => { d.FX.ghost(clone.x, clone.y, clone.hw, clone.hh); },
    dramaticBeat() { f.addShake(d.CONFIG.juice.shakeBig); f.addFlash(d.CONFIG.juice.flashParry); },
    updateEffects: (seconds) => { d.FX.update(seconds); }, random: d.cosmeticRandom,
  };
  return { entities, opening, collision: createCollision(context), kill: createKill(context) };
}

function createCollision(context: LiveCombatActionContext): Omit<LiveCollisionPhaseHost, "state" | "combat"> {
  const { dependencies: d, live, ports } = context, f = ports.functions;
  return {
    get player() { return live.player(); }, get blade() { return live.blade(); }, get run() { return live.run(); }, width: context.width,
    weaponHit: (enemy, quality, damage, slam, launch, empowered) => f.weaponHook("onHeldHit", { blade: live.blade(), player: live.player(), enemy, quality, damage, isSlam: slam, isLaunch: launch, empowered }),
    throwHit: (enemy, secondary, throwId) => f.weaponHook("onThrowHit", { blade: live.blade(), player: live.player(), enemy, secondary, throwId }),
    runDamageMultiplier: f.runDamageMultiplier, noteFirstDamage: f.noteFirstDamage, logWeapon: f.logWeapon,
    emitThrowResolve: f.emitThrowResolve, onKill: context.resolveKill,
    addFloater: f.addFloater, addShake: f.addShake, addZoom: f.addZoom, addFlash: f.addFlash, addStyle: f.addStyle,
    effects: { burst: (...args) => { d.FX.burst(...args); }, ring: (...args) => { d.FX.ring(...args); }, flash: (...args) => { d.FX.flash(...args); },
      ribbon: (...args) => { d.FX.ribbon(...args); }, explode: (...args) => { d.FX.explode(...args); }, floater: f.addFloater,
      shake: f.addShake, zoom: f.addZoom, buzz: (milliseconds) => { d.Input.buzz(milliseconds); },
      sound: (name, big) => { f.playSound(name, big); }, style: f.addStyle, tutorial: (name) => { ports.tutorial.mark(name); } },
    sound: (cue, big) => { f.playSound(cue, big); }, flare: (...args) => { d.Backdrop.flare(...args); },
    segmentCircle: d.segCircle, segmentPointDistance: d.segPointDist,
    weaponSegmentContact: f.weaponSegmentContact,
    distance: d.len, clamp: d.clamp, lerp: d.lerp, nearestEnemy: f.nearestEnemy, areaDamage: f.areaDamage,
    lobExplode: f.lobExplode, splitProjectile: f.splitProjectile, triggerSlowMotion: f.triggerSlowMotion,
    emitPerfectParry: () => { context.emitMusicEvent("perfect-parry", { weaponId: live.run().weaponId }); },
    makeHitEvent: (enemy, x, y) => { f.fireMod(f.modHook("onHit"), f.makeEvent(x, y, enemy)); },
    makeSwingEvent: (enemy, x, y, damage, quality, mechanic) => { f.fireMod(f.modHook("onSwingHit"), f.makeEvent(x, y, enemy, "swing", { type: "swingHit", damageDealt: damage, quality, mechanic })); },
    makeSlamEvent: (enemy) => { f.fireMod(f.modHook("onSlam"), f.makeEvent(enemy.x, enemy.y, enemy)); },
    makeReturnEvent: (enemy, damage) => { f.fireMod(f.modHook("onReturnHit"), f.makeEvent(enemy.x, enemy.y, enemy, "secondary", { type: "returnHit", throwId: live.blade().throwId, weaponId: live.run().weaponId, damageDealt: damage })); },
    makePerfectParryEvent: (shot) => { const event = f.makeEvent(shot.x, shot.y, null, "parry", { type: "perfectParry", sourceEnemy: shot.sourceEnemy ?? shot.owner, projectile: shot, applySever: f.applySever }); f.fireMod(f.modHook("onParry"), event); f.fireMod(f.modHook("onPerfectParry"), event); },
    profileAdd: (name, value) => { d.PROFILE.addStat(name, value); }, profileMax: (name, value) => { d.PROFILE.maxStat(name, value); },
    dailyBump: (name, value) => { d.DAILY.bump(name, value); }, achievementsEnabled: f.achievementsEnabled,
    achievement(name, enemy) { if (name === "swing") { if (enemy) ports.achievement.bossHit(enemy, "melee"); else ports.achievement.swung(); }
      else if (name === "throw") { ports.achievement.thrown(); if (enemy) ports.achievement.bossHit(enemy, "throw"); }
      else if (name === "parry") ports.achievement.parry(); else if (name === "break") ports.achievement.breakStreak();
      else if (name === "jump") ports.achievement.jumped(); else ports.achievement.revived(); },
    checkAchievements: f.checkAchievements, tutorialMark: (name) => { ports.tutorial.mark(name); },
    ghostRecording: () => d.GHOST.recording(), ghostDeath: f.ghostDeath, ghostSample: f.ghostSample,
    ghostRevive: () => { d.GHOST.event("revive", live.player().x, live.player().y); }, updateTrick: f.updateTrick,
    achievementTick: (seconds) => { ports.achievement.tick(seconds); }, updateTutorial: (seconds) => { ports.tutorial.update(seconds); },
    updatePlayground: f.updatePlayground, overlap: d.aabbOverlap, onShieldAbsorb: f.onShieldAbsorb,
    loseStyle: f.loseStyle, buzz: (milliseconds) => { d.Input.buzz(milliseconds); }, requestAdContinue: context.requestContinue,
    adAvailable: () => d.CG.adsAvailable(), endRun: f.endRun,
  };
}

function createKill(context: LiveCombatActionContext): LiveKillHost {
  const { dependencies: d, live, ports } = context, f = ports.functions;
  return {
    enemies: () => live.enemies(), projectiles: () => live.projectiles(), run: () => live.run(), player: () => live.player(), now: () => d.CLOCK.sim,
    stageIndex: () => ports.stage.index, finalStageIndex: d.STAGES.length - 1,
    stageAccent: () => ports.stage.current.accent ?? "#ffffff", stageChapterBossOutro: () => ports.stage.current.chapter?.bossOutro ?? null,
    hasStageChapter: () => !!ports.stage.current.chapter, bossRosterSize: context.bossRosterSize, achievementsEnabled: f.achievementsEnabled,
    addKillScore: f.addKillScore, addStat: (name: string, value: number) => { d.PROFILE.addStat(name, value); },
    maxStat: (name: string, value: number) => { d.PROFILE.maxStat(name, value); }, bumpDaily: (name: string, value: number) => { d.DAILY.bump(name, value); },
    bossKillAchievement: (enemy) => { ports.achievement.bossKill(enemy); },
    killAchievement: (enemy) => { ports.achievement.onKill(enemy); }, checkAchievements: f.checkAchievements,
    bossGhostMoment: (enemy) => { d.GHOST.event("bossKill", enemy.x, enemy.y); d.GHOST.snapshot(context.canvas, 4); },
    deathEffect: (enemy, shards) => { d.FX.death(enemy.x, enemy.y, shards, enemy.color); }, deathSound: () => { f.playSound("death"); },
    makeDeathEvent: (enemy, cause, clean) => f.makeEvent(enemy.x, enemy.y, enemy, cause,
      { cleanElimination: clean, addOverrunStack: f.addOverrunStack }),
    fire: f.fire, applySever: f.applySever, ring: (x: number, y: number, radius: number, color: string) => { d.FX.ring(x, y, radius, color); },
    restorePlatforms: f.restorePlatforms,
    releaseCamera: context.releaseCamera, happyTime: () => { d.CG.happytime(); },
    bossPresentation: (enemy, accent) => { d.Backdrop.bloom("#ffffff", 0.22, 0.9); d.Backdrop.flare(enemy.x, enemy.y, accent, 520, 1); d.FX.explode(enemy.x, enemy.y, enemy.color, 2.2); d.FX.explode(enemy.x, enemy.y - 20, accent, 1.4); f.addShake(d.CONFIG.juice.shakeBig * 1.5); f.addZoom(d.CONFIG.juice.zoomBig); f.triggerSlowMotion(); d.Input.buzz([30, 40, 60]); },
    releaseStolenBlade: (enemy) => { const weapon = live.blade(); if (weapon.stolenBy === enemy) { weapon.hostile = false; weapon.stolenBy = null; weapon.state = "returning"; } },
  };
}

function resolveColor(d: LiveCombatActionContext["dependencies"], color?: string): string {
  if (color === "perfect") return d.CONFIG.colors.perfect; if (color === "slam") return d.CONFIG.colors.slam;
  if (color === "ink") return d.THEME.ink; if (color === "bladeTrail") return d.CONFIG.colors.bladeTrail;
  if (color === "reform") return "#c9ccd6"; if (color === "charger") return d.CONFIG.colors.charger;
  return color ?? d.CONFIG.colors.perfect;
}

function updateRuntimeFeedback(context: LiveCombatActionContext, seconds: number): void {
  const { dependencies: d, live, ports } = context, f = ports.functions, target = live.player();
  if (d.Mirror.active) {
    d.Mirror.updateCombat(seconds, target, live.blade());
    if (d.Mirror.host?.dead) {
      d.Mirror.active = false;
      f.addFloater(target.x, target.y - 70, "REFLECTION SHATTERED", true, d.Mirror.color);
    }
    applyFeedback(context, d.Mirror.fxq.splice(0), { x: target.x, y: target.y - 70, color: d.Mirror.color }, true);
  }
  const bossEvents: CombatFeedbackEvent[] = d.BOSSFX.drain().map((event) => ({
    ...(event.shake === undefined ? {} : { shake: event.shake }), ...(event.flash === undefined ? {} : { flash: event.flash }),
    ...(event.hitstop === undefined ? {} : { hitstop: event.hitstop }), ...(event.slowmo === undefined ? {} : { slowmo: event.slowmo }),
    ...(event.zoom === undefined ? {} : { zoom: event.zoom }), ...(event.banner === undefined ? {} : { banner: event.banner }),
    ...(event.txt === undefined ? {} : { txt: event.txt }), ...(event.x === undefined ? {} : { x: event.x }),
    ...(event.y === undefined ? {} : { y: event.y }), ...(event.big === undefined ? {} : { big: event.big }),
    ...(event.quiet === undefined ? {} : { quiet: event.quiet }), ...(event.color === undefined ? {} : { color: event.color }),
    ...(event.cue === undefined ? {} : { cue: event.cue }),
  }));
  applyFeedback(context, bossEvents, { x: target.x, y: target.y - 70, color: d.CONFIG.colors.boss }, false);
}

function applyFeedback(context: LiveCombatActionContext, events: Parameters<typeof applyCombatFeedback>[0],
  fallback: Parameters<typeof applyCombatFeedback>[2], slamOnImpact: boolean): void {
  const { live, ports } = context, f = ports.functions;
  const current = live.collisionState(), state = { hitStop: current.hitStop, slowMotion: current.slowMotion };
  applyCombatFeedback(events, state, fallback, {
    shake: f.addShake, flash: f.addFlash, zoom: f.addZoom,
    banner: (text, color) => { f.setBossBanner(text, color); }, floater: f.addFloater,
    sound: (cue) => { f.playSound(cue); }, slam: () => { f.playSound("slam"); },
  }, slamOnImpact);
  live.setCollisionState({ ...current, hitStop: state.hitStop, slowMotion: state.slowMotion });
}

function updateSupports(context: LiveCombatActionContext, seconds: number): void {
  const d = context.dependencies;
  context.combatRuntime().updateSupports(seconds, d.CONFIG.support, d.CONFIG.colors.anchor);
}
function updateWorldHazards(context: LiveCombatActionContext, seconds: number): void {
  const d = context.dependencies;
  context.combatRuntime().updateWorldHazards(seconds, { groundY: d.CONFIG.world.groundY,
    sludgeSlow: d.CONFIG.exotic.sludgeSlow, geoWallW: d.CONFIG.exotic.geoWallW,
    geoWallH: d.CONFIG.exotic.geoWallH, geoWallLife: d.CONFIG.exotic.geoWallLife,
    sludgeColor: d.CONFIG.colors.sludge });
}
function resolveBossZones(context: LiveCombatActionContext): void {
  const d = context.dependencies;
  context.combatRuntime().resolveBossZones({ groundY: d.CONFIG.world.groundY, defaultWidth: d.CONFIG.warden.zoneW,
    defaultDamage: d.CONFIG.warden.zoneTick, defaultTickCooldown: d.CONFIG.warden.zoneTickCd });
}

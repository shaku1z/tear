import { planHeldStrike } from "./held-strike-planner";
import type { HeldBladeCollisionInput, HeldBladeEnemy } from "./held-blade-collision-contracts";

export interface HeldBladeCollisionResult { readonly hitStop: number }

export function resolveHeldBladeEnemyCollisions(input: HeldBladeCollisionInput): HeldBladeCollisionResult {
  const { player, blade, enemies, run, segment, tuning: t, effects: fx, hooks } = input;
  const baseDamage = blade.damageAt();
  const styleMultiplier = 1 + Math.min((run.mult - 1) * t.style.styleDamage, t.style.styleDamageMax);
  let hitStop = input.currentHitStop;

  for (const enemy of enemies) {
    if (!enemy.dead && enemy.trySeverSiphon?.(blade)) {
      const x = (blade.x + blade.tipX) / 2, y = (blade.y + blade.tipY) / 2;
      fx.burst(x, y, blade.tipVX, blade.tipVY, 13, t.colors.perfect); fx.ring(x, y, 16, t.colors.perfect);
      fx.floater(x, y - 22, "SIPHON SEVERED", true, t.colors.perfect); fx.style("parry"); fx.sound("deflect");
      hitStop = Math.max(hitStop, t.hitStop.small); fx.shake(t.juice.shakeBig);
    }
  }

  for (const enemy of enemies) {
    if (enemy.dead || enemy.dying || (enemy.introT ?? 0) > 0 || enemy.hitCd > 0) continue;
    const liveWeapon = enemy.parryBaton && (enemy.batonStrike ?? 0) > 0 ? enemy.batonSegment?.() ?? null : null;
    const weaponContact = liveWeapon ? input.weaponSegmentContact(liveWeapon, segment.x1, segment.y1, segment.x2, segment.y2) : false;
    if (!input.segmentCircle(segment, enemy.x, enemy.y, enemy.radius + segment.pad) && !weaponContact) continue;
    if (enemy.immuneToBlade) {
      if (baseDamage > 0) { enemy.hitCd = 0.18; fx.burst(enemy.x, enemy.y, blade.tipVX, blade.tipVY, 4, enemy.color); }
      continue;
    }
    if (baseDamage <= 0) continue;

    if (enemy.parryBaton && (enemy.batonStrike ?? 0) > 0) {
      const baton = liveWeapon ?? enemy.batonSegment?.();
      if (baton && weaponContact && enemy.parryBaton(blade.tipSpeed >= t.blade.minHitSpeed * 2.2)) {
        fx.burst(baton.x2, baton.y2, 0, -1, 12, "#e0a326"); fx.flash(baton.x2, baton.y2, 34, "#e0a326");
        fx.floater(baton.x2, baton.y2 - 16, "PARRIED", true, "#e0a326"); fx.style("parry"); fx.sound("deflect");
        hitStop = Math.max(hitStop, t.hitStop.small); enemy.hitCd = 0.14; continue;
      }
      if (baton && weaponContact) {
        fx.burst(baton.x2, baton.y2, 0, -1, 7, t.colors.charger); fx.sound("deflect"); enemy.hitCd = 0.10; continue;
      }
    }

    if (enemy.blocks(blade.tipX, blade.tipSpeed)) {
      const point = input.segmentPointDistance(blade.x, blade.y, blade.tipX, blade.tipY, enemy.x, enemy.y);
      if (enemy.blockStyle === "plate") {
        fx.burst(point.px, point.py, enemy.x - blade.tipX, enemy.y - blade.tipY, 10, "#c9ccd6");
        fx.flash(point.px, point.py, 30, "#c9ccd6");
        fx.floater(point.px, point.py - 18, "CLANG", false, t.colors.armoredShield);
        enemy._plateFlashT = 0.18; fx.buzz(10);
      } else {
        fx.burst(point.px, point.py, enemy.x - blade.tipX, enemy.y - blade.tipY, 5, t.colors.armoredShield);
        fx.floater(enemy.x, enemy.y - 26, "block", false, t.colors.armoredShield);
      }
      enemy.hitCd = 0.12; hitStop = t.hitStop.small; fx.sound("deflect"); continue;
    }

    if (enemy.cfg.breakSpeed && !enemy.enraged && Math.sign(blade.tipX - enemy.x) === enemy.guardSide && blade.tipSpeed >= enemy.cfg.breakSpeed) {
      enemy.stun = Math.max(enemy.stun, 0.8); enemy.enraged = true; enemy.atk = "idle"; enemy.atkT = 0;
      fx.ring(enemy.x, enemy.y, 14, t.colors.armoredShield);
      fx.floater(enemy.x, enemy.y - 30, "SHIELD BREAK", true, t.colors.armoredShield);
    }

    const strikeInput = {
      baseDamage, tipVerticalSpeed: blade.tipVY, tipSpeed: blade.tipSpeed,
      playerVerticalSpeed: player.vy, playerGrounded: player.onGround, playerHealth: player.hp, playerMaxHealth: player.maxHp,
      playerAirTime: player.airTime, dashEndTime: player.dashEndT, tempoTime: player.tempoT, tempoStacks: player.tempoStk,
      enemyGrounded: enemy.onGround, enemyY: enemy.y, enemyHalfHeight: enemy.hh, groundY: t.groundY,
      styleMultiplier, repeatScale: 1, runDamageMultiplier: hooks.runDamageMultiplier(), enemyDamageMultiplier: enemy.damageTakenMult(),
      berserk: !!run.mods.berserk, airBonus: run.mods.airBonus ?? 0, aerialRave: run.mods.aerialRave ?? 0,
      slipstream: !!run.mods.slipstream, tempo: run.mods.tempo ?? 0,
      tuning: { ...t.blade, hitStopThreshold: t.hitStop.threshold, aerialRaveCap: t.style.aerialRaveCap },
    };
    const initial = planHeldStrike(strikeInput);
    const quality = blade.hitQuality(enemy);
    const weaponEffect = hooks.weaponHit(enemy, quality, baseDamage * (initial.slam ? t.blade.slamMultiplier : 1), initial.slam, initial.launch, initial.empoweredSlam);
    const strike = planHeldStrike({ ...strikeInput, repeatScale: weaponEffect?.repeatScale ?? 1 });
    const firstDamage = enemy.firstPlayerDamageAt == null;
    const dealt = enemy.hit(strike.damage, blade.tipVX, blade.tipVY);
    hooks.noteFirstDamage(enemy, firstDamage); blade.recordHit(enemy); run.weaponStats.heldHits++;
    hooks.logHit(strike.damage, quality, weaponEffect?.mechanic);
    applyWeaponEffect(input, enemy, weaponEffect);

    let impulseHandled = false;
    if (enemy.onBladeImpulse) {
      const response = enemy.onBladeImpulse({ damage: strike.damage, dealt, held: true, player, blade,
        tipSpeed: blade.tipSpeed, tipVX: blade.tipVX, tipVY: blade.tipVY, isSlam: strike.slam,
        isLaunch: strike.launch, spike: strike.spike, empowered: strike.empoweredLaunch,
        empSlam: strike.empoweredSlam, heightF: strike.heightFraction, strikeF: strike.strikeFraction,
        strikeType: strike.spike ? "spike" : strike.empoweredSlam ? "superslam" : strike.slam ? "slam" : strike.empoweredLaunch ? "updraft" : strike.launch ? "launch" : "hit" });
      impulseHandled = response === true || !!(response && response.handled);
    }
    if (player.rallySource === enemy) {
      const healed = player.claimRally(strike.damage);
      if (healed > 0) { fx.floater(player.x, player.y - 44, `+${String(Math.round(healed))}`, false, "#e8a32e"); fx.ribbon(enemy.x, enemy.y - 12, player.x, player.y - 10, "#e8a32e"); }
    }
    if (!enemy.anchored && !impulseHandled) {
      if (strike.spike) { enemy.vy = (1000 + strike.heightFraction * 800 + strike.strikeFraction * 500) / enemy.weight; enemy.spiked = true; }
      else if (strike.launch) enemy.vy = -t.blade.launchPower * (1 + strike.riseFraction * t.blade.risingLaunchBonus) / enemy.weight;
    }
    if (strike.empoweredLaunch && run.mods.tempest) applyTempest(input, enemy, baseDamage);

    const point = input.segmentPointDistance(blade.x, blade.y, blade.tipX, blade.tipY, enemy.x, enemy.y);
    fx.burst(point.px, point.py, blade.tipVX, blade.tipVY, t.juice.sparkCount, enemy.color);
    if (strike.slam || strike.empoweredLaunch) fx.ring(enemy.x, enemy.y, strike.empoweredSlam ? 13 : 8, t.colors.slam);
    const tag = strike.spike ? "▼" : strike.empoweredSlam ? "⇊" : strike.slam ? "!" : strike.launch ? strike.empoweredLaunch ? "⇈" : "↑" : "";
    fx.floater(enemy.x, enemy.y - 26, `${String(Math.round(strike.damage))}${tag}`, strike.big || strike.launch);
    hitStop = strike.big ? t.hitStop.big : t.hitStop.small;
    fx.shake(strike.big || strike.launch ? t.juice.shakeBig : t.juice.shakeSmall);
    if (strike.big) fx.zoom(t.juice.zoomBig);
    fx.sound("hit", strike.big); if (strike.slam) fx.sound("slam"); else if (strike.empoweredLaunch) fx.sound("updraft"); else if (strike.launch) fx.sound("launch");
    const weaponStyle = weaponEffect && (weaponEffect.mechanic === "break" && !weaponEffect.broke ? null : ({ trueCut: "trueCut", break: "break", drive: "drive", drag: "drag" } as Record<string, string>)[weaponEffect.mechanic ?? ""]);
    fx.style(strike.slam ? strike.empoweredSlam ? "superslam" : "slam" : strike.empoweredLaunch ? "updraft" : strike.launch ? "launch" : weaponStyle ?? "hit");
    fx.tutorial("strike");
    const airborne = enemy.y < t.groundY - enemy.hh - 14;
    if (airborne) fx.tutorial("airHit");
    if (hooks.achievementsEnabled()) trackAchievements(input, enemy, strike.damage, airborne, strike.launch, strike.slam, strike.empoweredLaunch, strike.spike, strike.empoweredSlam);
    hooks.fireHit(enemy, point.px, point.py); hooks.fireSwingHit(enemy, point.px, point.py, dealt, quality, weaponEffect?.mechanic);
    if (strike.slam) hooks.fireSlam(enemy);
    if (strike.slam && run.mods.bleedDetonate) applyRupture(input, enemy);
    if (strike.empoweredSlam && run.mods.crater) {
      const radius = 130 + strike.descentFraction * 110;
      hooks.dealArea(enemy.x, enemy.y, radius, baseDamage * (0.7 + strike.descentFraction));
      fx.explode(enemy.x, enemy.y, t.colors.slam, 1 + strike.descentFraction * 0.8); fx.shake(t.juice.shakeBig); fx.zoom(t.juice.zoomBig);
    }
    if (run.mods.lifesteal > 0 && run.lifestealCd <= 0) { player.heal(run.mods.lifesteal); run.lifestealCd = t.lifestealCooldown; }
    if (didEnemyDie(enemy)) { hooks.onKill(enemy, strike.slam ? "skill" : ""); if (strike.slam && run.mods.slamShield) player.shield = Math.min(player.shield + 1, player.maxShield); }
  }
  return { hitStop };
}

function applyWeaponEffect(input: HeldBladeCollisionInput, enemy: HeldBladeEnemy, effect: ReturnType<HeldBladeCollisionInput["hooks"]["weaponHit"]>): void {
  if (!effect) return;
  const { blade, run, tuning: t, effects: fx } = input;
  if (effect.hitIframe != null) enemy.hitCd = Math.min(enemy.hitCd, effect.hitIframe);
  if (effect.mechanic === "trueCut") {
    enemy.applySeam(effect.seam, blade.throwId); run.weaponStats.trueCuts++; fx.ribbon(blade.x, blade.y, blade.tipX, blade.tipY, t.colors.perfect); fx.floater(enemy.x, enemy.y - 42, "TRUE CUT", true, t.colors.perfect);
  } else if (effect.mechanic === "break" && enemy.applyBreak && effect.breakPower !== undefined) {
    if (enemy.applyBreak(effect.breakPower)) { effect.broke = true; run.weaponStats.breakTriggers++; fx.floater(enemy.x, enemy.y - 42, "BREAK", true, t.colors.armoredShield); fx.ring(enemy.x, enemy.y, 15, t.colors.armoredShield); }
  } else if (effect.mechanic === "drive" && !enemy.anchored) {
    const resistance = enemy.isBoss ? 0.22 : 1 / enemy.weight;
    enemy.vx += Math.cos(blade.angle) * (effect.force ?? 0) * resistance; enemy.vy += Math.sin(blade.angle) * (effect.force ?? 0) * resistance; enemy.driveT = t.spearWallPinDuration;
    if (!enemy.isBoss && (enemy.x < enemy.hw + 24 || enemy.x > t.width - enemy.hw - 24)) enemy.stun = Math.max(enemy.stun, t.spearWallPinDuration);
    fx.floater(enemy.x, enemy.y - 40, "DRIVE", false, t.colors.perfect);
  } else if (effect.mechanic === "drag" && !enemy.anchored) {
    const magnitude = input.distance(blade.tipVX, blade.tipVY) || 1, resistance = enemy.isBoss ? 0.16 : 1 / enemy.weight;
    enemy.vx += blade.tipVX / magnitude * (effect.force ?? 0) * resistance; enemy.vy += blade.tipVY / magnitude * (effect.force ?? 0) * resistance; enemy.boundT = 0.25;
    fx.floater(enemy.x, enemy.y - 40, "DRAG", false, t.colors.perfect);
  }
}

function applyTempest(input: HeldBladeCollisionInput, enemy: HeldBladeEnemy, baseDamage: number): void {
  for (const other of input.enemies) {
    if (other.dead || other === enemy || other.anchored || input.distance(other.x - enemy.x, other.y - enemy.y) >= 175) continue;
    other.vy = -input.tuning.blade.launchPower / other.weight; other.hit(baseDamage * 0.5, 0, -1);
    input.effects.burst(other.x, other.y, 0, -1, 4); if (didEnemyDie(other)) input.hooks.onKill(other);
  }
  input.effects.ring(enemy.x, enemy.y, 12);
}

function applyRupture(input: HeldBladeCollisionInput, enemy: HeldBladeEnemy): void {
  for (const other of input.enemies) {
    if (other.dead || other.bleedStacks <= 0 || input.distance(other.x - enemy.x, other.y - enemy.y) >= 150) continue;
    const damage = other.detonateBleed(); input.effects.floater(other.x, other.y - 30, `RUPTURE ${String(Math.round(damage))}`, true, input.tuning.colors.charger);
    input.effects.ring(other.x, other.y, 9, input.tuning.colors.charger); if (didEnemyDie(other)) input.hooks.onKill(other, "skill");
  }
}

function didEnemyDie(enemy: HeldBladeEnemy): boolean {
  return enemy.dead;
}

function trackAchievements(input: HeldBladeCollisionInput, enemy: HeldBladeEnemy, damage: number, airborne: boolean, launch: boolean, slam: boolean, empowered: boolean, spike: boolean, empoweredSlam: boolean): void {
  const { hooks, run, blade } = input;
  if (airborne) { hooks.addProfileStat("airHits", 1); hooks.bumpDaily("air", 1); }
  if (blade.tipSpeed > input.tuning.blade.minHitSpeed * 2.1) hooks.maxProfileStat("maxMomentum", 1);
  hooks.maxProfileStat("maxDamageHit", Math.round(damage));
  if (empowered && !slam) { run._updraftChain = (run._updraftChain ?? 0) + 1; hooks.maxProfileStat("consecutiveUpdrafts", run._updraftChain); }
  hooks.achievementSwing(); hooks.achievementBossHit(enemy);
  if (launch && enemy.kind === "armored") enemy._updrafted = true;
  if (spike && enemy.kind === "armored" && enemy._updrafted) hooks.maxProfileStat("spikeArmored", 1);
  if (launch) enemy._updraftT = 1.5;
  if (enemy.bossId === "aldric" && empoweredSlam) { run._aldricSlams = (run._aldricSlams ?? 0) + 1; hooks.maxProfileStat("aldricSlams", run._aldricSlams); }
  hooks.checkAchievements();
}

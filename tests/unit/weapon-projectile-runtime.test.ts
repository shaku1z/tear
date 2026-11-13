import { createProductionGhostReplayComposition } from "../../src/tearbench/production-replay-composition";
import { createLiveCombatActions } from "../../src/app/combat/combat-actions";
import { createLiveWeaponRuntime } from "../../src/gameplay/combat/live-weapon-runtime";
import { applyUpgrade, tierUp, UPGRADES, type UpgradeMods } from "../../src/gameplay/upgrades";
import { STAGES } from "../../src/gameplay/stages";
import { clamp } from "../../src/domain/geometry";
import { describe, expect, it } from "vitest";

import type {
  CombatActorState, ProjectileCollisionTuning, ProjectilePlayerState, ProjectileState,
} from "../../src/gameplay/combat/combat-entity-contracts";
import { planProjectileCollisions } from "../../src/gameplay/combat/projectile-collision-resolver";

describe("weapon projectile collision", () => {
  it("matches the upstream live remote hit body on resistant targets and preserves resolve/ramp/proc order", () => {
    const make = () => {
      const host = createProductionGhostReplayComposition({ seed: "native-projectile-binding", mode: "endless", weaponId: "riftlock" }).create(undefined);
      const { replay } = host, player = replay.world.state.player(), blade = replay.world.state.blade(), run = replay.world.state.run();
      if (!player || !blade || !run) throw new Error("real projectile actors missing");
      const enemy = replay.world.entities.createEnemy("armored", 1100, 700, run);
      Object.assign(enemy, { hp: 10000, maxHp: 10000, onGround: true, spawnT: 0 }); replay.world.state.setEnemies([enemy]);
      const context = { config: replay.configuration.value, player, blade, mods: run.mods };
      for (const id of ["rupture", "throw_momentum", "storm_recall"]) { const u = UPGRADES.find(u => u.id === id); if (!u) throw new Error("upgrade missing"); applyUpgrade(u, context); }
      tierUp("throw_momentum", context); tierUp("throw_momentum", context);
      Object.assign(blade, { state: "flying", throwResolved: false, throwDmg: 100, throwBaseDmg: 100, vx: 1000, vy: 0, throwId: 7 });
      const shot = replay.world.entities.createProjectile(enemy.x, enemy.y, 1450, 0);
      Object.assign(shot, { family: "weaponProjectile", playerOwned: true, weaponId: "riftlock", attackId: 9, throwId: 7, remote: true, secondary: true, dmg: 42, unparryable: true });
      replay.world.state.setProjectiles([shot]);
      return { host, replay, player, blade, run, enemy, shot };
    };
    const source = make(), native = make(), config = native.replay.configuration.value, noop = () => undefined;
    const weapon = createLiveWeaponRuntime({ run: () => native.run, player: () => native.player, blade: () => native.blade, enemies: () => [native.enemy], time: () => native.replay.clock.sim,
      overrun: () => config.overrun, stormbank: () => config.stormbank, score: () => ({ perKill: config.run.scorePerKill, multiplier: config.run.scoreMult }), colors: () => config.colors, juice: () => config.juice,
      shakeScale: () => 1, motionScale: () => 1, flashScale: () => 1, parrySlowmo: () => config.juice.parrySlowmo, bigShake: () => config.juice.shakeBig,
      clamp, distance: Math.hypot, buzz: noop, rumble: noop, setShake: noop, shake: () => 0, setZoom: noop, zoom: () => 1, setFlash: noop, flash: () => 0,
      setSlowmo: noop, setHitStop: noop, smallHitStop: () => config.hitStop.small, addFloater: noop, explode: noop, ring: noop, ribbon: noop, burst: noop, death: noop,
      deathShards: () => config.juice.deathShards, parrySound: noop, recallSound: noop, onKill: noop });
    const actions = createLiveCombatActions({ dependencies: { ...native.replay.dependencies, cosmeticEmissionRandom: native.replay.cosmeticEmissionRandom, CONFIG: config, STAGES, clamp, profileStatsPersistence: { add: noop, max: noop } },
      live: { player: () => native.player, blade: () => native.blade, run: () => native.run, enemies: () => [native.enemy], projectiles: () => [native.shot] },
      ports: { stage: { platforms: [] }, achievement: {}, tutorial: {}, functions: { runDamageMultiplier: weapon.damageMultiplier, noteFirstDamage: weapon.noteFirstDamage,
        makeEvent: weapon.makeEvent, modHook: (name: keyof UpgradeMods) => native.run.mods[name], fireMod: weapon.fire, emitThrowResolve: weapon.emitThrowResolve,
        addFloater: noop, logWeaponEvent: weapon.log, applySever: weapon.applySever } }, attackPresentation: { emit: noop }, resolveKill: noop,
    } as unknown as Parameters<typeof createLiveCombatActions>[0]);
    const hit = { damage: 42, dx: 1450, dy: 0, weaponId: "riftlock", attackId: 9, throwId: 7, remote: true, secondary: true };
    actions.entities.weaponProjectileHit?.(native.shot as unknown as Parameters<NonNullable<typeof actions.entities.weaponProjectileHit>>[0], native.enemy, hit);
    const runtime = source.host.combat.combatEntityRuntime;
    runtime.resolveProjectilePhases(1 / 120, { projectileDamage: config.proj.dmg, projectileSpeed: config.proj.speed, deflectBoost: config.blade.deflectBoost,
      deflectDamageMultiplier: config.blade.deflectDmgMult, runDamageMultiplier: 1, phaseStep: false, parryStun: false, aegisParry: false, sparkCount: 1,
      deflectedColor: "#fff", rootColor: "#fff", shakeBig: 1, shakeSmall: 1, achievementTracking: false,
      groundY: config.world.groundY, mineTrigger: config.bomber.mineTrigger, blastRadius: config.bomber.blastRadius, blastDamage: config.bomber.blastDmg,
      sludgeZoneRadius: config.exotic.sludgeZoneR, sludgeZoneLife: config.exotic.sludgeZoneLife, bomberColor: config.colors.bomber,
      perfectColor: config.colors.perfect, sludgeColor: config.colors.sludge, flashParry: config.juice.flashParry, enemyShotColor: config.colors.enemyShot });
    expect.soft(source.enemy.hp).toBe(native.enemy.hp); expect.soft(source.enemy.bleedStacks).toBe(native.enemy.bleedStacks);
    expect.soft(source.enemy.stun).toBe(native.enemy.stun); expect.soft(source.blade.throwResolved).toBe(true);
    expect.soft(source.blade.throwDmg).toBe(native.blade.throwDmg); expect.soft(source.blade.vx).toBe(native.blade.vx);
    expect(source.shot.dead).toBe(true); expect(native.enemy.bleedStacks).toBe(1); expect(native.blade.throwResolved).toBe(true);
  });

  it("routes a visible player-owned Razor Round to the weapon hit contract instead of the player", () => {
    const projectile = {
      id: "razor:1", x: 100, y: 100, vx: 1450, vy: 0, r: 6, dead: false,
      family: "weaponProjectile", ownerId: null, sourceEnemyId: null,
      deflected: false, perfect: false, deflectDmg: 0, pierce: false, piercedIds: new Set(),
      unparryable: true, dmg: 42, root: 0, curve: false, curved: false, curveT: 0,
      bomb: false, mud: false, mine: false, armed: false, armT: 0, life: 1,
      playerOwned: true, weaponId: "riftlock", attackId: 9, throwId: 3,
      remote: true, secondary: false,
    } satisfies ProjectileState;
    const enemy = {
      id: "enemy:1", kind: "melee", x: 104, y: 100, radius: 18, hp: 100, maxHp: 100,
      dead: false, dying: false, spawnT: 0, stun: 0,
    } satisfies CombatActorState;
    const player = {
      x: 100, y: 100, hw: 16, hh: 25, dashTimer: 0, dashX: 0, dashY: 0, facing: 1,
    } satisfies ProjectilePlayerState;
    const tuning = {
      projectileDamage: 10, projectileSpeed: 500, deflectBoost: 1, deflectDamageMultiplier: 1,
      runDamageMultiplier: 1, phaseStep: false, parryStun: false, aegisParry: false,
      sparkCount: 4, deflectedColor: "#fff", rootColor: "#fff", shakeBig: 1, shakeSmall: 0.5,
      achievementTracking: false,
    } satisfies ProjectileCollisionTuning;

    const intents = planProjectileCollisions({ projectiles: [projectile], actors: [enemy], player, tuning });
    expect(intents).toContainEqual(expect.objectContaining({
      type: "weapon-projectile-hit", enemyId: enemy.id, damage: 42,
      weaponId: "riftlock", attackId: 9, throwId: 3, remote: true,
    }));
    expect(intents.some((intent) => intent.type === "damage-player")).toBe(false);
    expect(intents.some((intent) => intent.type === "projectile-patch" && intent.patch.dead === true)).toBe(true);
  });
});

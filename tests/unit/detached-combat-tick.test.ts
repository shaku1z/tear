import { describe, expect, it } from "vitest";

import { EnvelopeSequencer, type CommandEnvelope } from "../../src/domain/envelopes";
import type { GameAction } from "../../src/input/game-action";
import { CONFIG } from "../../src/config/game-config";
import { aabbOverlap, clamp, len, lerp, segCircle, segPointDist } from "../../src/domain/geometry";
import { CombatEntityRuntime, type CombatEntityRuntimeHooks } from "../../src/gameplay/combat/combat-entity-runtime";
import { runLiveCollisionPhase, type LiveCollisionPhaseHost } from "../../src/gameplay/combat/live-collision-phase";
import { runLiveOpeningPhase, type LiveOpeningPhaseHost } from "../../src/gameplay/combat/live-opening-phase";
import { TearSimulationRuntime } from "../../src/gameplay/runtime/tear-simulation-runtime";
import { createDetachedWorld, DETACHED_PLATFORMS } from "./detached-world-harness";

const PLATFORMS = DETACHED_PLATFORMS as unknown as LiveOpeningPhaseHost["platforms"];

/**
 * A detached world that runs BOTH halves of a production combat tick: the
 * opening phase (prelude, weapon secondary, locomotion, transport, enemies,
 * statuses, platforms, bosses) and the collision phase (held-blade hits,
 * thrown hits, parries, projectile phases, contact, tail finalization).
 *
 * Outward effects — audio, particles, achievements, ads, Ghost 2 — are
 * recorded, never rendered or persisted. Impact state and the entity
 * collections come from the world composition, not a live host closure.
 */
function createDetachedCombatWorld(seed: string) {
  const { world, clock, effects, transient, input, run } = createDetachedWorld({
    seed,
    enemies: [
      { id: "charger", x: 520, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 },
      { id: "charger", x: 640, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 },
      { id: "ranged", x: 1_150, y: CONFIG.world.groundY - CONFIG.ranged.h / 2 },
    ],
  });
  const outward: string[] = [];
  const note = (name: string) => () => { outward.push(name); };
  const player = () => world.state.player() as never;
  const blade = () => world.state.blade() as never;

  const entityHooks = {
    actors: () => world.state.enemies(), projectiles: () => world.state.projectiles(),
    player: () => world.state.player(),
    slowZones: () => world.state.slowZones(), setSlowZones: (zones: never[]) => { world.state.setSlowZones(zones); },
    walls: () => world.state.temporaryWalls(), setWalls: (walls: never[]) => { world.state.setTemporaryWalls(walls); },
    platforms: () => [...PLATFORMS],
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
    platforms: PLATFORMS, state: transient.opening, width: CONFIG.view.w,
    blocking: false, playerMode: "play", protection: transient.protection,
    lowGraphics: false, transformationBlocked: false,
    overrunMovementMultiplier: () => 1, runDamageMultiplier: () => 1,
    stepCinematic: () => undefined, flushClosingInput: note("flushClosingInput"),
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
    updateFeedback: () => undefined, consumeThrow: () => input.consumeThrow(() => false),
    updateWave: () => undefined, startTransformation: () => false, updateSupports: () => undefined,
    armorBypass: note("armorBypass"), resolveBossZones: () => undefined,
    updateBossArenaPlatforms: () => undefined, updateVoidScroll: () => undefined,
    unlockWitness: note("unlockWitness"), startVoidDescent: () => false,
    spawnBossAdds: () => [], spawnBossClone: () => undefined, removeBossClone: () => undefined,
    dramaticBeat: note("dramaticBeat"), onBladeStolen: note("onBladeStolen"),
    updateEffects: (dt: number) => { effects.update(dt); },
    random: () => world.context.services.random.stream("enemy-ai").next(),
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
    weaponHit: (enemy: { hp: number; dead: boolean }, _quality: number, damage: number) => {
      enemy.hp -= damage; if (enemy.hp <= 0) enemy.dead = true;
      outward.push("weaponHit"); return null;
    },
    throwHit: () => { outward.push("throwHit"); return null; },
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

  const runtime = new TearSimulationRuntime<Record<string, unknown>>({
    actionPort: input.actionPort,
    step: (seconds) => {
      clock.sim += seconds;
      // The same order the live combat host uses: opening, then collision,
      // and collision is skipped when the opening half blocks the tick.
      if (runLiveOpeningPhase(opening, seconds).blocked) return;
      runLiveCollisionPhase(collision, seconds);
    },
    snapshot: (tick) => {
      const actor: { x: number; y: number; vx: number; vy: number; hp: number } = player();
      const weapon: { x: number; y: number; state: string } = blade();
      return {
        tick, clock: Math.round(clock.sim * 1e6) / 1e6,
        player: { x: actor.x, y: actor.y, vx: actor.vx, vy: actor.vy, hp: actor.hp },
        blade: { x: weapon.x, y: weapon.y, state: weapon.state },
        enemies: world.state.enemies().map((enemy) => {
          const body = enemy as never as { x: number; y: number; hp: number; dead: boolean };
          return { x: body.x, y: body.y, hp: body.hp, dead: body.dead };
        }),
        impact: { ...transient.impact }, opening: { ...transient.opening },
        rng: world.context.services.random.snapshot(),
      };
    },
  });
  runtime.reset(0);
  return { world, runtime, clock, effects, outward, transient, run, combat };
}

function scriptedActions(): ReadonlyMap<number, readonly CommandEnvelope<GameAction>[]> {
  const sequencer = new EnvelopeSequencer();
  const actions = [
    sequencer.command(2, { type: "aim", turn: 0, magnitude: 1 } as const),
    sequencer.command(4, { type: "move", x: 1_000, y: 0 } as const),
    sequencer.command(12, { type: "weapon", intent: "primary", phase: "pressed" } as const),
    sequencer.command(40, { type: "weapon", intent: "primary", phase: "released" } as const),
    sequencer.command(55, { type: "jump", phase: "pressed" } as const),
    sequencer.command(80, { type: "dash", x: 1_000, y: 0 } as const),
    sequencer.command(150, { type: "move", x: 0, y: 0 } as const),
  ];
  const grouped = new Map<number, CommandEnvelope<GameAction>[]>();
  for (const action of actions) grouped.set(action.tick, [...(grouped.get(action.tick) ?? []), action]);
  return grouped;
}

function runTrace(seed: string, ticks: number) {
  const detached = createDetachedCombatWorld(seed);
  const actions = scriptedActions();
  const hashes: string[] = [];
  for (let tick = 1; tick <= ticks; tick += 1) {
    hashes.push(detached.runtime.advanceOne([...(actions.get(tick) ?? [])]).stateHash);
  }
  return { detached, hashes };
}

describe("detached combat tick", () => {
  it("runs both production combat phases without a live combat host", () => {
    const { detached, hashes } = runTrace("combat-seed", 240);
    const player = detached.world.state.player() as never as { x: number };

    expect(hashes).toHaveLength(240);
    expect(new Set(hashes).size).toBeGreaterThan(1);
    expect(player.x).not.toBe(400);
    // The collision half ran: the tail finalizer owns shake decay, and the
    // world's impact record is what it decayed.
    expect(Number.isFinite(detached.transient.impact.shake)).toBe(true);
    expect(detached.outward).toContain("sound:swing");
    // The collision half resolved real held-blade contact: production damage
    // reached the enemies and the swing/slam event path fired.
    expect(detached.outward).toContain("weaponHit");
    expect(detached.outward).toContain("logWeapon:heldHit");
    expect(detached.outward).toContain("makeSwingEvent");
    const wounded = detached.world.state.enemies()
      .map((enemy) => (enemy as never as { hp: number }).hp)
      .filter((hp) => hp < 60);
    expect(wounded.length).toBeGreaterThan(0);
  });

  it("produces an identical two-phase trace and effect sequence for one seed", () => {
    const first = runTrace("combat-seed", 240);
    const second = runTrace("combat-seed", 240);

    expect(second.hashes).toEqual(first.hashes);
    expect(second.detached.outward).toEqual(first.detached.outward);
  });

  it("diverges on another seed and keeps entity identity per world", () => {
    const base = runTrace("combat-seed", 240);
    const other = runTrace("other-combat-seed", 240);

    expect(other.hashes).not.toEqual(base.hashes);
    expect(base.detached.combat.captureIdentityState())
      .not.toBe(other.detached.combat.captureIdentityState());
  });
});

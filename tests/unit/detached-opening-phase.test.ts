import { describe, expect, it } from "vitest";

import { EnvelopeSequencer, type CommandEnvelope } from "../../src/domain/envelopes";
import type { GameAction } from "../../src/input/game-action";
import { CONFIG } from "../../src/config/game-config";
import { len } from "../../src/domain/geometry";
import { runLiveOpeningPhase, type LiveOpeningPhaseHost } from "../../src/gameplay/combat/live-opening-phase";
import { TearSimulationRuntime } from "../../src/gameplay/runtime/tear-simulation-runtime";
import { createDetachedWorld, DETACHED_PLATFORMS } from "./detached-world-harness";

const PLATFORMS = DETACHED_PLATFORMS as unknown as LiveOpeningPhaseHost["platforms"];

/**
 * A world plus the real opening combat phase, with every outward effect
 * recorded instead of rendered, played, or persisted.
 */
function createDetachedOpeningWorld(seed: string) {
  const { world, clock, effects, transient, input, run } = createDetachedWorld({
    seed,
    enemies: [
      { id: "charger", x: 760, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 },
      { id: "ranged", x: 1_150, y: CONFIG.world.groundY - CONFIG.ranged.h / 2 },
    ],
  });
  const outward: string[] = [];
  const note = (name: string) => () => { outward.push(name); };
  const host = {
    get player() { return world.state.player() as never; },
    get blade() { return world.state.blade() as never; },
    get run() { return world.state.run() as never; },
    get enemies() { return world.state.enemies() as never; },
    get projectiles() { return world.state.projectiles(); },
    platforms: PLATFORMS,
    state: transient.opening,
    width: CONFIG.view.w,
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
      Math.abs(a.x - b.x) <= a.hw + b.hw && Math.abs(a.y - b.y) <= a.hh + b.hh,
    styleHit: note("styleHit"), onKill: (enemy: { dead?: boolean }) => { enemy.dead = true; outward.push("onKill"); },
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
  const runtime = new TearSimulationRuntime<Record<string, unknown>>({
    actionPort: input.actionPort,
    step: (seconds) => {
      clock.sim += seconds;
      runLiveOpeningPhase(host, seconds);
    },
    snapshot: (tick) => {
      const actor = world.state.player() as never as { x: number; y: number; vx: number; vy: number; hp: number };
      const blade = world.state.blade() as never as { x: number; y: number; state: string };
      return {
        tick, clock: Math.round(clock.sim * 1e6) / 1e6,
        player: { x: actor.x, y: actor.y, vx: actor.vx, vy: actor.vy, hp: actor.hp },
        blade: { x: blade.x, y: blade.y, state: blade.state },
        enemies: world.state.enemies().map((enemy) => {
          const body = enemy as never as { x: number; y: number; hp: number; dead: boolean };
          return { x: body.x, y: body.y, hp: body.hp, dead: body.dead };
        }),
        opening: { ...transient.opening },
        rng: world.context.services.random.snapshot(),
      };
    },
  });
  runtime.reset(0);
  return { world, runtime, clock, effects, outward, transient, run };
}

function scriptedActions(): ReadonlyMap<number, readonly CommandEnvelope<GameAction>[]> {
  const sequencer = new EnvelopeSequencer();
  const actions = [
    sequencer.command(2, { type: "move", x: 1_000, y: 0 } as const),
    sequencer.command(10, { type: "weapon", intent: "primary", phase: "pressed" } as const),
    sequencer.command(30, { type: "jump", phase: "pressed" } as const),
    sequencer.command(45, { type: "weapon", intent: "primary", phase: "released" } as const),
    sequencer.command(60, { type: "dash", x: 1_000, y: 0 } as const),
    sequencer.command(110, { type: "move", x: 0, y: 0 } as const),
  ];
  const grouped = new Map<number, CommandEnvelope<GameAction>[]>();
  for (const action of actions) grouped.set(action.tick, [...(grouped.get(action.tick) ?? []), action]);
  return grouped;
}

function runTrace(seed: string, ticks: number) {
  const detached = createDetachedOpeningWorld(seed);
  const actions = scriptedActions();
  const hashes: string[] = [];
  for (let tick = 1; tick <= ticks; tick += 1) {
    hashes.push(detached.runtime.advanceOne([...(actions.get(tick) ?? [])]).stateHash);
  }
  return { detached, hashes };
}

describe("detached opening combat phase", () => {
  it("runs the production opening phase without a live combat host", () => {
    const { detached, hashes } = runTrace("opening-seed", 180);
    const player = detached.world.state.player() as never as { x: number };

    expect(hashes).toHaveLength(180);
    expect(new Set(hashes).size).toBeGreaterThan(1);
    expect(player.x).not.toBe(400);
    // Real movement feel ran: locomotion reported cadence through the world's
    // own transient opening record rather than a host closure.
    expect(detached.transient.opening.wasOnGround).toBe(true);
    // The scripted swing, jump, and dash reached real production combat code.
    expect(detached.outward).toContain("sound:swing");
    expect(detached.outward).toContain("fireDashStart");
    expect(detached.outward).toContain("sound:land");
  });

  it("produces an identical opening-phase trace for the same seed", () => {
    const first = runTrace("opening-seed", 180);
    const second = runTrace("opening-seed", 180);

    expect(second.hashes).toEqual(first.hashes);
    expect(second.detached.outward).toEqual(first.detached.outward);
  });

  it("keeps the enemy AI stream per world", () => {
    const base = runTrace("opening-seed", 180);
    const other = runTrace("other-opening-seed", 180);

    expect(other.hashes).not.toEqual(base.hashes);
  });
});

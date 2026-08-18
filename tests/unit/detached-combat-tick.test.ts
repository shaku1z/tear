import { describe, expect, it } from "vitest";

import { EnvelopeSequencer, type CommandEnvelope } from "../../src/domain/envelopes";
import type { GameAction } from "../../src/input/game-action";
import { CONFIG } from "../../src/config/game-config";
import { createDetachedCombatSimulation, createDetachedWorld } from "./detached-world-harness";

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
  const detached = createDetachedWorld({
    seed,
    enemies: [
      { id: "charger", x: 520, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 },
      { id: "charger", x: 640, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 },
      { id: "ranged", x: 1_150, y: CONFIG.world.groundY - CONFIG.ranged.h / 2 },
    ],
  });
  const { world, clock, effects, transient, run } = detached;
  const player = () => world.state.player() as never;
  const blade = () => world.state.blade() as never;

  const core = createDetachedCombatSimulation<Record<string, unknown>>(detached, {
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
  const { outward, combatEntityRuntime: combat, simulationRuntime: runtime } = core;
  runtime.reset(0);
  return { world, runtime, clock, effects, outward, transient, run, combat, killRuntime: core.killRuntime };
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

  it("routes detached kills through the shared production kill transaction", () => {
    const detached = createDetachedCombatWorld("kill-transaction");
    const enemy = detached.world.state.enemies()[0] as never as { dead: boolean };
    const run = detached.world.state.run() as never as { score: number; waveKills: number };
    const before = { score: run.score, waveKills: run.waveKills };
    enemy.dead = true;

    detached.killRuntime.resolve(enemy as never, "blade");

    expect(run.score).toBeGreaterThan(before.score);
    expect(run.waveKills).toBe(before.waveKills + 1);
    expect(detached.outward).toContain("deathEffect");
    expect(detached.outward).toContain("deathSound");
  });
});

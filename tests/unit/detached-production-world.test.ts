import { describe, expect, it } from "vitest";

import { EnvelopeSequencer, type CommandEnvelope } from "../../src/domain/envelopes";
import type { GameAction } from "../../src/input/game-action";
import { CONFIG } from "../../src/config/game-config";
import { TearSimulationRuntime } from "../../src/gameplay/runtime/tear-simulation-runtime";
import { stableVerificationHash } from "../../src/replay/hash";
import { createDetachedWorld, DETACHED_PLATFORMS } from "./detached-world-harness";

interface Platform { x: number; y: number; w: number; h: number; floor?: boolean; oneway?: boolean }

const PLATFORMS = DETACHED_PLATFORMS as readonly Platform[];

/**
 * The narrowest detached step: production entity updates only, with no combat
 * phase, live host, DOM, canvas, screens, audio, or storage.
 */
function createDetachedProductionWorld(seed: string) {
  const { world, clock, effects, random, factories, input } = createDetachedWorld({
    seed,
    enemies: [
      { id: "charger", x: 900, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 },
      { id: "flyer", x: 1_100, y: 300 },
    ],
  });
  const runtime = new TearSimulationRuntime<Record<string, unknown>>({
    actionPort: input.actionPort,
    step: (seconds) => {
      // Real production entity code, driven without the live combat host.
      clock.sim += seconds;
      const actor = world.state.player() as never as { update(dt: number, platforms: readonly Platform[]): void };
      actor.update(seconds, PLATFORMS);
      for (const enemy of world.state.enemies()) {
        (enemy as never as { update(dt: number, platforms: readonly Platform[], target: unknown, shots: unknown[]): void })
          .update(seconds, PLATFORMS, world.state.player(), world.state.projectiles());
      }
    },
    snapshot: (tick) => {
      const actor = world.state.player() as never as { x: number; y: number; vx: number; vy: number; onGround: boolean };
      return {
        tick, clock: Math.round(clock.sim * 1e6) / 1e6,
        player: { x: actor.x, y: actor.y, vx: actor.vx, vy: actor.vy, onGround: actor.onGround },
        enemies: world.state.enemies().map((enemy) => {
          const body = enemy as never as { x: number; y: number; vx: number; vy: number; hp: number };
          return { x: body.x, y: body.y, vx: body.vx, vy: body.vy, hp: body.hp };
        }),
        rng: world.context.services.random.snapshot(),
        particles: effects.list.length,
      };
    },
  });
  runtime.reset(0);
  return { world, runtime, clock, effects, random, factories };
}

function scriptedActions(): ReadonlyMap<number, readonly CommandEnvelope<GameAction>[]> {
  const sequencer = new EnvelopeSequencer();
  const actions = [
    sequencer.command(2, { type: "move", x: 1_000, y: 0 } as const),
    sequencer.command(20, { type: "jump", phase: "pressed" } as const),
    sequencer.command(40, { type: "dash", x: 1_000, y: 0 } as const),
    sequencer.command(70, { type: "move", x: -1_000, y: 0 } as const),
    sequencer.command(100, { type: "move", x: 0, y: 0 } as const),
  ];
  const grouped = new Map<number, CommandEnvelope<GameAction>[]>();
  for (const action of actions) grouped.set(action.tick, [...(grouped.get(action.tick) ?? []), action]);
  return grouped;
}

function runTrace(seed: string, ticks: number) {
  const detached = createDetachedProductionWorld(seed);
  const actions = scriptedActions();
  const hashes: string[] = [];
  for (let tick = 1; tick <= ticks; tick += 1) {
    hashes.push(detached.runtime.advanceOne([...(actions.get(tick) ?? [])]).stateHash);
  }
  return { detached, hashes };
}

describe("detached production world", () => {
  it("runs real production entity code with no DOM, host, or presentation", () => {
    const { detached, hashes } = runTrace("detached-seed", 120);
    const player = detached.world.state.player() as never as { x: number; y: number };

    expect(hashes).toHaveLength(120);
    expect(new Set(hashes).size).toBeGreaterThan(1);
    // The scripted movement must actually move the production player.
    expect(player.x).not.toBe(400);
    expect(detached.clock.sim).toBeCloseTo(120 / 120, 6);
  });

  it("produces an identical trace for two worlds built from the same seed", () => {
    const first = runTrace("detached-seed", 120);
    const second = runTrace("detached-seed", 120);

    expect(second.hashes).toEqual(first.hashes);
    expect(stableVerificationHash(second.hashes)).toBe(stableVerificationHash(first.hashes));
  });

  it("diverges from a different seed only through the world's own random streams", () => {
    const base = runTrace("detached-seed", 120);
    const other = runTrace("other-seed", 120);

    expect(other.hashes).not.toEqual(base.hashes);
    expect(base.detached.random.streams.snapshot()).not.toEqual(other.detached.random.streams.snapshot());
  });

  it("keeps one detached world's particles, clock, and entities out of another", () => {
    const first = createDetachedProductionWorld("world-one");
    const second = createDetachedProductionWorld("world-two");

    first.runtime.advanceOne([]);
    first.effects.ring(1, 2, 3, "#fff");

    expect(second.clock.sim).toBe(0);
    expect(second.effects.list).toHaveLength(0);
    expect(first.world.state.player()).not.toBe(second.world.state.player());
    expect(first.factories.Player).not.toBe(second.factories.Player);
  });
});

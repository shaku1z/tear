import { describe, expect, it } from "vitest";

import { createLiveCombatWorldState } from "../../src/app/live-combat-world-state";
import { createTearWorldTransientState } from "../../src/gameplay/runtime/tear-world-transient-state";

describe("live combat world state", () => {
  it("uses the shared world state for replaceable combat collections", () => {
    const values: Record<string, unknown> = {
      player: { id: "player" }, blade: { id: "blade" }, run: { id: "run" }, enemies: [{ id: "enemy" }],
      projectiles: [], floaters: [], slowZones: [], temporaryWalls: [],
    };
    const state = createLiveCombatWorldState({
      player: () => values.player, blade: () => values.blade, run: () => values.run,
      enemies: () => values.enemies, setEnemies: (next: unknown) => { values.enemies = next; },
      projectiles: () => values.projectiles, setProjectiles: (next: unknown) => { values.projectiles = next; },
      floaters: () => values.floaters, setFloaters: (next: unknown) => { values.floaters = next; },
      slowZones: () => values.slowZones, setSlowZones: (next: unknown) => { values.slowZones = next; },
      temporaryWalls: () => values.temporaryWalls, setTemporaryWalls: (next: unknown) => { values.temporaryWalls = next; },
    } as never, createTearWorldTransientState());

    state.setEnemies([{ id: "replacement" }] as never);
    state.setProjectiles([{ id: "shot" }] as never);

    expect(state.player()).toEqual({ id: "player" });
    expect(state.enemies()).toEqual([{ id: "replacement" }]);
    expect(state.projectiles()).toEqual([{ id: "shot" }]);
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("reads and writes opening and impact values through the one per-world transient record", () => {
    const transient = createTearWorldTransientState();
    const values: Record<string, unknown> = {
      player: { id: "player" }, blade: { id: "blade" }, run: { id: "run" }, enemies: [],
      projectiles: [], floaters: [], slowZones: [], temporaryWalls: [],
    };
    const state = createLiveCombatWorldState({
      player: () => values.player, blade: () => values.blade, run: () => values.run,
      enemies: () => values.enemies, setEnemies: (next: unknown) => { values.enemies = next; },
      projectiles: () => values.projectiles, setProjectiles: (next: unknown) => { values.projectiles = next; },
      floaters: () => values.floaters, setFloaters: (next: unknown) => { values.floaters = next; },
      slowZones: () => values.slowZones, setSlowZones: (next: unknown) => { values.slowZones = next; },
      temporaryWalls: () => values.temporaryWalls, setTemporaryWalls: (next: unknown) => { values.temporaryWalls = next; },
    } as never, transient);

    state.setOpeningProtection({ active: true, lastMode: "finale" });
    state.setOpeningState({ throwCooldown: 0.25, wasDashing: true, wasSwinging: true, wasOnGround: false,
      dashGhostTime: 0.5, landingVelocity: 12 });
    state.setCollisionState({ hitStop: 0.1, slowMotion: 0.4, shake: 3 });

    // The host owns the record; combat must observe host writes without rebinding.
    transient.impact.shake = 6;

    expect(transient.protection).toEqual({ active: true, lastMode: "finale" });
    expect(transient.opening.throwCooldown).toBe(0.25);
    expect(transient.opening.wasOnGround).toBe(false);
    expect(state.openingProtection()).toEqual({ active: true, lastMode: "finale" });
    expect(state.openingState()).toEqual({ throwCooldown: 0.25, wasDashing: true, wasSwinging: true,
      wasOnGround: false, dashGhostTime: 0.5, landingVelocity: 12 });
    expect(state.collisionState()).toEqual({ hitStop: 0.1, slowMotion: 0.4, shake: 6 });
  });
});

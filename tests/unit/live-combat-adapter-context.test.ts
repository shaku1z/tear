import { describe, expect, it } from "vitest";
import { createLiveCombatAdapters, type LiveCombatAdapterContext } from "../../src/app/live-combat-adapter-context";
import type { CombatEntityRuntime } from "../../src/gameplay/combat/combat-entity-runtime";
import type { LiveCollisionPhaseHost, LiveCollisionPhaseState } from "../../src/gameplay/combat/live-collision-phase";
import type { LiveOpeningPhaseHost, LiveOpeningState } from "../../src/gameplay/combat/live-opening-phase";

describe("live combat adapter context", () => {
  it("reads replaceable live values lazily and writes scalar state through", () => {
    let openingState: LiveOpeningState = { throwCooldown: 1, wasDashing: false, wasSwinging: false,
      wasOnGround: true, dashGhostTime: 0, landingVelocity: 0 };
    let collisionState = { hitStop: 0, slowMotion: 0, shake: 0, enemies: [], projectiles: [], floaters: [] } as LiveCollisionPhaseState;
    const firstPlayer = { x: 1 } as LiveOpeningPhaseHost["player"];
    const secondPlayer = { x: 2 } as LiveOpeningPhaseHost["player"];
    let player = firstPlayer;
    const openingValues = { player, blade: {}, run: {}, enemies: [], projectiles: [], platforms: [], width: 1600,
      blocking: false, playerMode: "normal", protection: { active: false, lastMode: null }, lowGraphics: false,
      transformationBlocked: false } as unknown as ReturnType<LiveCombatAdapterContext["opening"]["values"]>;
    const context = {
      entities: {},
      opening: { values: () => ({ ...openingValues, player }), actions: {}, readState: () => openingState,
        writeState: (value: LiveOpeningState) => { openingState = value; } },
      collision: { values: () => ({ player, blade: openingValues.blade, run: openingValues.run, width: 1600 }),
        actions: {}, readState: () => collisionState,
        writeState: (value: LiveCollisionPhaseState) => { collisionState = value; } },
      kill: {},
    } as unknown as LiveCombatAdapterContext;

    const adapters = createLiveCombatAdapters(context);
    expect(adapters.opening.player).toBe(firstPlayer);
    player = secondPlayer;
    expect(adapters.opening.player).toBe(secondPlayer);
    adapters.opening.state.throwCooldown = 4;
    expect(openingState.throwCooldown).toBe(4);

    const collision = adapters.collisionFor({} as CombatEntityRuntime);
    collision.state.hitStop = 0.25;
    expect(collisionState.hitStop).toBe(0.25);
    expect(collision.player).toBe(secondPlayer as unknown as LiveCollisionPhaseHost["player"]);
  });
});

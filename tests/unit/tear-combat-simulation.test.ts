import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import type { CombatEntityRuntimeHooks } from "../../src/gameplay/combat/combat-entity-runtime";
import type { LiveCollisionPhaseHost } from "../../src/gameplay/combat/live-collision-phase";
import type { LiveKillHost } from "../../src/gameplay/combat/live-kill-runtime";
import type { LiveOpeningPhaseHost } from "../../src/gameplay/combat/live-opening-phase";
import { TearGameplayEventBus, type TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";
import { createTearCombatSimulation } from "../../src/gameplay/runtime/tear-combat-simulation";

describe("Tear combat simulation", () => {
  it("owns one canonical scheduler around the ordered combat phases without an app host", () => {
    const order: string[] = [];
    const observed: TearGameplayEvent[] = [];
    const events = new TearGameplayEventBus();
    events.subscribe((event) => { observed.push(event); });
    const opening = {
      config: CONFIG,
      player: { cinematicProtected: false },
      blade: { state: "held" },
      run: {},
      state: {},
      blocking: true,
      playerMode: "cinematic",
      protection: { active: false, lastMode: null },
      overrunMovementMultiplier: () => 1,
      stepCinematic: () => {
        order.push("opening");
        events.emit({ kind: "effect", effect: "blocked-opening", x: 0, y: 0 });
      },
    } as unknown as LiveOpeningPhaseHost;
    let suppliedCombatEntities: unknown;
    let suppliedResolveKill: unknown;

    const core = createTearCombatSimulation<{ readonly tick: number }>({
      gameplayEvents: events,
      combatEntities: {} as CombatEntityRuntimeHooks,
      kill: {} as LiveKillHost,
      createCombat: ({ combatEntities, resolveKill }) => {
        suppliedCombatEntities = combatEntities;
        suppliedResolveKill = resolveKill;
        return {
          opening,
          // A blocked opening must skip this phase. If it runs, its deliberately
          // incomplete host makes the accidental second route immediately fail.
          collision: {} as LiveCollisionPhaseHost,
          advanceClock: () => { order.push("clock"); },
          captureProtection: () => { order.push("capture-protection"); },
          applyProtection: () => { order.push("apply-protection"); },
        };
      },
      authoritative: {
        actionPort: {
          apply(input, tick, actions): void {
            order.push(`actions:${String(tick)}`);
            input.beginTick(tick, actions);
          },
        },
        snapshot(tick): { readonly tick: number } {
          order.push(`snapshot:${String(tick)}`);
          return Object.freeze({ tick });
        },
      },
    });
    events.setTickSource(() => core.simulation.tick);

    const result = core.simulationRuntime.advanceOne([]);

    expect(result.state).toEqual({ tick: 1 });
    expect(order).toEqual([
      "actions:1",
      "clock",
      "capture-protection",
      "opening",
      "apply-protection",
      "snapshot:1",
    ]);
    expect(observed).toEqual([{ kind: "effect", tick: 1, effect: "blocked-opening", x: 0, y: 0 }]);
    expect(core.simulation).toBe(core.simulationRuntime.scheduler);
    expect(core.authoritativeInput).toBe(core.simulationRuntime.input);
    expect(core.authoritativeStep).toBe(core.simulationRuntime.authoritativeStep);
    expect(core.combatEntityRuntime).toBe(suppliedCombatEntities);
    expect(core.combatRuntime).toBeTruthy();
    expect(core.killRuntime).toBeTruthy();
    expect(suppliedResolveKill).toBeTypeOf("function");
  });
});

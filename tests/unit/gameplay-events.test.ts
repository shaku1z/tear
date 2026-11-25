import { describe, expect, it, vi } from "vitest";
import { TearGameplayEventBus } from "../../src/gameplay/runtime/gameplay-events";
import { mapGameplayEventToCausalEvent } from "../../src/tearbench/gameplay-causal-events";

describe("native gameplay event bus", () => {
  it("publishes one frozen authoritative event to independent adapters", () => {
    const bus = new TearGameplayEventBus();
    const ghost2 = vi.fn();
    const ghost3 = vi.fn();
    const unsubscribeGhost2 = bus.subscribe(ghost2);
    bus.subscribe(ghost3);

    bus.publish({ kind: "wave", tick: 120, wave: 2, event: "start" });
    unsubscribeGhost2();
    bus.publish({ kind: "effect", tick: 121, effect: "dash", x: 4, y: 8 });

    expect(ghost2).toHaveBeenCalledTimes(1);
    expect(ghost3).toHaveBeenCalledTimes(2);
    expect(ghost2.mock.calls[0]?.[0]).toBe(ghost3.mock.calls[0]?.[0]);
    expect(Object.isFrozen(ghost3.mock.calls[0]?.[0])).toBe(true);
  });

  it("rejects invalid simulation ticks", () => {
    const bus = new TearGameplayEventBus();
    expect(() => {
      bus.publish({ kind: "stage", tick: -1, stage: 0 });
    }).toThrow(RangeError);
  });

  it("accepts legacy numeric stage facts and rejects mismatched stable stage identities", () => {
    const bus = new TearGameplayEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    bus.publish({ kind: "stage", tick: 1, stage: 3 });
    bus.publish({ kind: "stage", tick: 2, stage: 3, stageId: "verdant-sanctum", transition: "entered" });
    bus.publish({ kind: "stage", tick: 3, stage: 6, stageId: "pale-traverse", transition: "entered" });
    expect(listener).toHaveBeenCalledTimes(3);
    expect(() => {
      bus.publish({ kind: "stage", tick: 3, stage: 3, stageId: "grounds" });
    }).toThrow(/does not match index/u);
  });

  it("can bind native publishers to the shared simulation clock after composition", () => {
    let provisionalInputTick = 3;
    let simulationTick = 0;
    const bus = new TearGameplayEventBus(() => provisionalInputTick);
    const observedTicks: number[] = [];
    bus.subscribe((event) => {
      observedTicks.push(event.tick);
    });

    bus.emit({ kind: "stage", stage: 1 });
    bus.setTickSource(() => simulationTick);
    simulationTick = 41;
    bus.emit({ kind: "stage", stage: 2 });
    provisionalInputTick = 99;
    bus.emit({ kind: "stage", stage: 3 });

    expect(observedTicks).toEqual([3, 41, 41]);
  });

  it("maps generic production weapon transport facts without inventing weapon-specific ontology", () => {
    expect(
      mapGameplayEventToCausalEvent({
        kind: "weapon",
        tick: 12,
        event: "throw-launch",
        weaponId: "chainblade",
        throwId: 7,
        x: 4,
        y: 8,
      }),
    ).toMatchObject({
      type: "blade.thrown",
      phase: "player-and-blade",
      payload: { weaponId: "chainblade", throwId: 7 },
    });
    expect(
      mapGameplayEventToCausalEvent({
        kind: "weapon",
        tick: 13,
        event: "throw-resolved",
        weaponId: "chainblade",
        throwId: 7,
        x: 6,
        y: 8,
        damage: 12,
      }),
    ).toMatchObject({ type: "blade.throw-resolved", payload: { damage: 12 } });
    expect(
      mapGameplayEventToCausalEvent({
        kind: "weapon",
        tick: 14,
        event: "catch",
        weaponId: "chainblade",
        throwId: 7,
        x: 8,
        y: 8,
      }),
    ).toMatchObject({ type: "blade.caught" });
  });
});

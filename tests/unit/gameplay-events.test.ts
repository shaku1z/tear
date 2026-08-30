import { describe, expect, it, vi } from "vitest";
import { TearGameplayEventBus } from "../../src/gameplay/runtime/gameplay-events";
import { LegacyGhostEngine } from "../../src/replay/legacy-compat";
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
    expect(() => { bus.publish({ kind: "stage", tick: -1, stage: 0 }); }).toThrow(RangeError);
  });

  it("accepts legacy numeric stage facts and rejects mismatched stable stage identities", () => {
    const bus = new TearGameplayEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    bus.publish({ kind: "stage", tick: 1, stage: 3 });
    bus.publish({ kind: "stage", tick: 2, stage: 3, stageId: "verdant-sanctum", transition: "entered" });
    bus.publish({ kind: "stage", tick: 3, stage: 6, stageId: "pale-traverse", transition: "entered" });
    expect(listener).toHaveBeenCalledTimes(3);
    expect(() => { bus.publish({ kind: "stage", tick: 3, stage: 3, stageId: "grounds" }); })
      .toThrow(/does not match index/u);
  });

  it("can bind native publishers to the shared simulation clock after composition", () => {
    let provisionalInputTick = 3;
    let simulationTick = 0;
    const bus = new TearGameplayEventBus(() => provisionalInputTick);
    const observedTicks: number[] = [];
    bus.subscribe((event) => { observedTicks.push(event.tick); });

    bus.emit({ kind: "stage", stage: 1 });
    bus.setTickSource(() => simulationTick);
    simulationTick = 41;
    bus.emit({ kind: "stage", stage: 2 });
    provisionalInputTick = 99;
    bus.emit({ kind: "stage", stage: 3 });

    expect(observedTicks).toEqual([3, 41, 41]);
  });

  it("maps generic production weapon transport facts without inventing weapon-specific ontology", () => {
    expect(mapGameplayEventToCausalEvent({ kind: "weapon", tick: 12, event: "throw-launch", weaponId: "chainblade", throwId: 7, x: 4, y: 8 }))
      .toMatchObject({ type: "blade.thrown", phase: "player-and-blade", payload: { weaponId: "chainblade", throwId: 7 } });
    expect(mapGameplayEventToCausalEvent({ kind: "weapon", tick: 13, event: "throw-resolved", weaponId: "chainblade", throwId: 7, x: 6, y: 8, damage: 12 }))
      .toMatchObject({ type: "blade.throw-resolved", payload: { damage: 12 } });
    expect(mapGameplayEventToCausalEvent({ kind: "weapon", tick: 14, event: "catch", weaponId: "chainblade", throwId: 7, x: 8, y: 8 }))
      .toMatchObject({ type: "blade.caught" });
  });

  it("lets the Ghost 2 adapter publish without owning Ghost 3 subscriptions", () => {
    const gameplayEvents = new TearGameplayEventBus();
    const ghost3 = vi.fn();
    gameplayEvents.subscribe(ghost3);
    const ghost2 = new LegacyGhostEngine({
      gameplayEvents,
      store: { get: () => null, set: () => undefined },
      document: {} as Document,
      now: () => 1,
      random: () => 0.5,
      defaults: {
        rulesetVersion: "test",
        build: { version: "test", revision: "test", target: "standalone" },
        ticksPerSecond: 120,
        tearScore: () => ({ enabled: false, reason: "not-recorded" }),
      },
    });

    ghost2.wave(3, "start");

    expect(ghost3).toHaveBeenCalledWith({ kind: "wave", tick: 0, wave: 3, event: "start" });
  });

  it("lets native publishers feed Ghost 2 visual compatibility as an outward adapter", () => {
    let tick = 40;
    const gameplayEvents = new TearGameplayEventBus(() => tick);
    const ghost2 = new LegacyGhostEngine({
      gameplayEvents,
      store: { get: () => null, set: () => undefined },
      document: {} as Document,
      now: () => 1,
      random: () => 0.5,
      defaults: {
        rulesetVersion: "test",
        build: { version: "test", revision: "test", target: "standalone" },
        ticksPerSecond: 120,
        tearScore: () => ({ enabled: false, reason: "not-recorded" }),
      },
    });
    ghost2.startRec({ runId: "native-events", seed: "seed" });

    gameplayEvents.emit({
      kind: "run", transition: "started", runId: "native-events", mode: "endless", difficulty: "normal",
      weaponId: "sword", wave: 0, score: 0, runTimeSeconds: 0,
    });
    gameplayEvents.emit({ kind: "stage", stage: 2, stageId: "crimson-fields", transition: "entered" });
    gameplayEvents.emit({ kind: "stage", stage: 6, stageId: "pale-traverse", transition: "entered" });
    tick += 1;
    gameplayEvents.emit({ kind: "wave", wave: 4, event: "start" });
    gameplayEvents.emit({ kind: "effect", effect: "revive", x: 10, y: 20 });
    gameplayEvents.emit({ kind: "loadout", choiceId: "tempo", tier: 2, wave: 4 });
    for (let index = 0; index < 20; index += 1) {
      ghost2.sample(0.1, { x: index, y: 400, facing: 1 }, null, []);
    }
    const packet = ghost2.stopRec();

    expect(packet?.stages).toEqual([{ t: 0, s: 2 }, { t: 0, s: 6 }]);
    expect(packet?.waves).toEqual([{ t: 0, w: 4, e: "start" }]);
    expect(packet?.events).toEqual([{ t: 0, k: "revive", x: 10, y: 20 }]);
    expect(packet?.loadout).toEqual([{ t: 0, id: "tempo", tier: 2, w: 4 }]);
  });

  it("projects stable simulation actor IDs into legacy visual IDs without changing Ghost 3 facts", () => {
    let tick = 40;
    const gameplayEvents = new TearGameplayEventBus(() => tick);
    const observed = vi.fn();
    gameplayEvents.subscribe(observed);
    const ghost2 = new LegacyGhostEngine({
      gameplayEvents,
      store: { get: () => null, set: () => undefined },
      document: {} as Document,
      now: () => 1,
      random: () => 0.5,
      defaults: {
        rulesetVersion: "test",
        build: { version: "test", revision: "test", target: "standalone" },
        ticksPerSecond: 120,
        tearScore: () => ({ enabled: false, reason: "not-recorded" }),
      },
    });
    ghost2.startRec({ runId: "stable-actor", seed: "seed" });

    gameplayEvents.emit({
      kind: "spawn", actorId: "enemy:42", actorKind: "charger", x: 12.2, y: 33.8,
      variantName: "elite", bossId: "warden",
    });
    for (let index = 0; index < 20; index += 1) {
      ghost2.sample(0.1, { x: index, y: 400, facing: 1 }, null, [{
        x: 20, y: 30, stableId: "enemy:42",
      }]);
    }
    tick += 1;
    gameplayEvents.emit({ kind: "death", actorId: "enemy:42", cause: "combat" });
    const packet = ghost2.stopRec();

    expect(observed).toHaveBeenNthCalledWith(1, {
      kind: "spawn", tick: 40, actorId: "enemy:42", actorKind: "charger", x: 12.2, y: 33.8,
      variantName: "elite", bossId: "warden",
    });
    expect(observed).toHaveBeenNthCalledWith(2, { kind: "death", tick: 41, actorId: "enemy:42", cause: "combat" });
    expect(packet?.spawns).toEqual([{ t: 0, id: 1, k: "charger", x: 12, y: 34, vn: "elite", b: "warden" }]);
    expect(packet?.deaths).toEqual([{ t: 2, id: 1, c: "combat" }]);
    expect(packet?.esamp.some((sample) => sample.includes(1))).toBe(true);
  });
});

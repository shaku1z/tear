import { describe, expect, it } from "vitest";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { TearGameplayEventBus, type TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";
import { cleanupRootNetwork, createRootNetwork, createRootbinderState, installRootNetwork, isRootbinderLineValid, selectRootbinderTargetAction, severRootLink } from "../../src/gameplay/entities/rootbinder-runtime";
import { environmentHash } from "../../src/tearbench/environment-codec";
import { ENEMY_IDENTITY_IDS } from "../../src/gameplay/run/content-director";
import { TEAR_WORLD_ENTITY_FACTORY_IDS } from "../../src/gameplay/runtime/tear-world-entity-construction";

const candidate = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, worldId: "world-a", stageId: "stage-1", kind: "ordinary" as const, x: 100, y: 100,
  dead: false, dying: false, ...overrides,
});

describe("Rootbinder shared environment network", () => {
  it("is source-owned in both the identity and construction catalogs", () => {
    expect(ENEMY_IDENTITY_IDS).toContain("rootbinder");
    expect(TEAR_WORLD_ENTITY_FACTORY_IDS).toContain("rootbinder");
  });

  it("rejects invalid lines, bosses, Rootbinders, dead actors, support stacks, and cross-world targets", () => {
    const input = { id: "network-1", worldId: "world-a", stageId: "stage-1", ownerId: "rootbinder-1", sourceX: 0, sourceY: 0, maxLength: 200 } as const;
    expect(isRootbinderLineValid({ ...input, targetWorldId: "world-b", targetStageId: "stage-1", targetX: 1, targetY: 1 })).toBe(false);
    expect(isRootbinderLineValid({ ...input, targetWorldId: "world-a", targetStageId: "stage-1", targetX: 1_000, targetY: 1_000 })).toBe(false);
    const segments = createRootNetwork(input, [
      candidate("ordinary-1"), candidate("ordinary-2", { supportKinds: ["anchor"] }), candidate("boss-1", { kind: "boss" }),
      candidate("rootbinder-2", { kind: "rootbinder" }), candidate("dead", { dead: true }), candidate("other-world", { worldId: "world-b" }),
    ]);
    expect(segments).toEqual([]);
    expect(createRootNetwork(input, [candidate("ordinary-1"), candidate("ordinary-3")]).map((segment) => segment.targetId)).toEqual(["ordinary-1", "ordinary-3"]);
  });

  it("uses bounded target order and enforces one global player leash", () => {
    const network = { id: "network-order", worldId: "world-a", stageId: "stage-1", ownerId: "rootbinder-1", sourceX: 0, sourceY: 0 } as const;
    expect(selectRootbinderTargetAction({ network, candidates: [candidate("ally-a"), candidate("ally-b")], playerAvailable: true })).toBe("network");
    expect(selectRootbinderTargetAction({ network, candidates: [candidate("ally-a")], playerAvailable: true })).toBe("player-leash");
    expect(selectRootbinderTargetAction({ network, candidates: [candidate("ally-a")], playerAvailable: true, capacity: { activeNetworks: 1, activePlayerLeashes: 1 } })).toBe("reposition");
    expect(selectRootbinderTargetAction({ network, candidates: [candidate("ally-a"), candidate("ally-b")], playerAvailable: false, capacity: { activeNetworks: 1, activePlayerLeashes: 0 } })).toBe("reposition");
  });

  it("installs one capped network, dedupes sever attacks, and cleans every segment", () => {
    const events: TearGameplayEvent[] = [];
    const bus = new TearGameplayEventBus(() => 0);
    bus.subscribe((event) => events.push(event));
    const runtime = createEnvironmentRuntime({ worldId: "world-a", stageId: "stage-1", events: bus });
    const input = { id: "network-1", worldId: "world-a", stageId: "stage-1", ownerId: "rootbinder-1", sourceX: 0, sourceY: 0 } as const;
    const segments = installRootNetwork(runtime, input, [candidate("ordinary-1"), candidate("ordinary-2"), candidate("ordinary-3")]);
    expect(segments).toHaveLength(3);
    expect(installRootNetwork(runtime, input, [candidate("ordinary-4"), candidate("ordinary-5")], { activeNetworks: 1, activePlayerLeashes: 0 })).toEqual([]);
    const first = segments[0];
    if (first === undefined) throw new Error("network segment missing");
    expect(severRootLink(runtime, first.id, "cut-1", 1).destroyed).toBe(true);
    expect(severRootLink(runtime, first.id, "cut-1", 2).duplicate).toBe(false); // destroyed links cannot be damaged again
    cleanupRootNetwork(runtime, "rootbinder-1", "defeat");
    expect(runtime.combatObjects().every((object) => object.state === "destroyed" || object.state === "expired")).toBe(true);
    expect(events.filter((event) => event.kind === "environment").map((event) => event.event)).toEqual([
      "combat-object-damaged", "combat-object-destroyed", "object-cleaned", "object-cleaned",
    ]);
  });

  it("uses the same deterministic cleanup path for defeat, stage, retry, and restore", () => {
    for (const reason of ["defeat", "stage-transition", "retry", "restore"] as const) {
      const runtime = createEnvironmentRuntime({ worldId: "world-a", stageId: "stage-1" });
      installRootNetwork(runtime, { id: `network-${reason}`, worldId: "world-a", stageId: "stage-1", ownerId: "rootbinder-1", sourceX: 0, sourceY: 0 }, [candidate("ally-a"), candidate("ally-b")]);
      cleanupRootNetwork(runtime, "rootbinder-1", reason);
      expect(runtime.combatObjects().every((object) => object.state === "expired" && object.cleanupReason === reason)).toBe(true);
    }
  });

  it("creates and cleans live-shaped relationships from the authoritative environment step", () => {
    const runtime = createEnvironmentRuntime({ worldId: "world-a", stageId: "stage-1" });
    let linked = true;
    const rootState = createRootbinderState({ id: "rootbinder-actor", worldId: "world-a", stageId: "stage-1", x: 0, y: 0 });
    runtime.setRootbinderActorsSource(() => [{
      id: "enemy:rootbinder-actor",
      state: { ...rootState, id: "enemy:rootbinder-actor", state: linked ? "linked" : "broken", transitionTick: linked ? 100 : 10 },
      candidates: [candidate("enemy:ally-a", { x: 40, y: 40 }), candidate("enemy:ally-b", { x: 60, y: 60 })],
    }]);
    runtime.step(1, 1 / 120, () => undefined);
    expect(runtime.combatObjects()).toHaveLength(2);
    linked = false;
    runtime.step(2, 1 / 120, () => undefined);
    expect(runtime.combatObjects().every((object) => object.state === "expired" && object.cleanupReason === "natural-expiry")).toBe(true);
  });

  it("creates one live player leash only when no ally network is useful, then applies force and expires it", () => {
    const runtime = createEnvironmentRuntime({ worldId: "world-a", stageId: "stage-1" });
    let phase: "link-warning" | "linked" = "link-warning";
    const rootState = createRootbinderState({ id: "rootbinder-player", worldId: "world-a", stageId: "stage-1", x: 0, y: 0 });
    const player = { id: "player", x: 400, y: 0, vx: 0, vy: 0, jumpEnabled: true, dashEnabled: true, alive: true };
    runtime.setRootbinderActorsSource(() => [{
      id: rootState.id, state: { ...rootState, state: phase, transitionTick: phase === "linked" ? 3 : 100 }, candidates: [candidate("only-ally")],
      player: { ...player, apply: (value) => { player.vx = value.vx; player.vy = value.vy; } },
    }]);
    runtime.step(1, 1 / 120, () => undefined);
    expect(runtime.combatObjects()).toHaveLength(1);
    expect(runtime.combatObjects()[0]?.state).toBe("warning");
    phase = "linked";
    runtime.step(2, 1 / 120, () => undefined);
    expect(runtime.combatObjects()[0]?.state).toBe("active");
    expect(player.vx).toBeLessThan(0);
    expect(player.jumpEnabled && player.dashEnabled).toBe(true);
    runtime.step(3, 1 / 120, () => undefined);
    expect(runtime.combatObjects()[0]?.cleanupReason).toBe("natural-expiry");
  });

  it("enforces the global live player-leash cap across Rootbinders", () => {
    const runtime = createEnvironmentRuntime({ worldId: "world-a", stageId: "stage-1" });
    const state = (id: string) => createRootbinderState({ id, worldId: "world-a", stageId: "stage-1", x: 0, y: 0 });
    const player = { id: "player", x: 400, y: 0, vx: 0, vy: 0, jumpEnabled: true, dashEnabled: true, alive: true };
    runtime.setRootbinderActorsSource(() => ["rb-a", "rb-b"].map((id) => ({
      id, state: { ...state(id), id, state: "link-warning" as const, transitionTick: 100 }, candidates: [candidate(`${id}:ally`)],
      player: { ...player, apply: () => undefined },
    })));
    runtime.step(1, 1 / 120, () => undefined);
    expect(runtime.combatObjects().filter((object) => object.kind === "root-link")).toHaveLength(1);
  });

  it("applies bounded network redistribution through the live candidate velocity seam", () => {
    const runtime = createEnvironmentRuntime({ worldId: "world-a", stageId: "stage-1" });
    let velocity = { x: 0, y: 0 };
    let candidateVx = 0;
    const rootState = createRootbinderState({ id: "rootbinder-physics", worldId: "world-a", stageId: "stage-1", x: 0, y: 0 });
    const edgeAlly = { ...candidate("edge-ally", { x: 500, y: 0 }), get vx() { return candidateVx; }, applyVelocity: (x: number, y: number) => { candidateVx = x; velocity = { x, y }; } };
    runtime.setRootbinderActorsSource(() => [{
      id: rootState.id, state: { ...rootState, state: "linked" as const }, candidates: [edgeAlly, candidate("near-ally")],
    }]);
    runtime.step(1, 1 / 120, () => undefined);
    for (let tick = 2; tick <= 160; tick += 1) runtime.step(tick, 1 / 120, () => undefined);
    expect(velocity.x).toBeCloseTo(-80, 5);
    expect(velocity.y).toBeCloseTo(0, 5);
    const capped = velocity;
    for (let tick = 161; tick <= 260; tick += 1) runtime.step(tick, 1 / 120, () => undefined);
    expect(velocity).toEqual(capped);
  });

  it("keeps generated relationship IDs unique across two authoritative link cycles", () => {
    const runtime = createEnvironmentRuntime({ worldId: "world-a", stageId: "stage-1" });
    let phase: "linked" | "broken" = "linked";
    const rootState = createRootbinderState({ id: "rootbinder-cycles", worldId: "world-a", stageId: "stage-1", x: 0, y: 0 });
    runtime.setRootbinderActorsSource(() => [{
      id: rootState.id, state: { ...rootState, state: phase, transitionTick: 100 }, candidates: [candidate("ally-a"), candidate("ally-b")],
    }]);
    runtime.step(1, 1 / 120, () => undefined);
    const firstIds = runtime.combatObjects().map((object) => object.id);
    phase = "broken";
    runtime.step(2, 1 / 120, () => undefined);
    phase = "linked";
    runtime.step(3, 1 / 120, () => undefined);
    const secondIds = runtime.combatObjects().filter((object) => object.state === "active").map((object) => object.id);
    expect(firstIds).toHaveLength(2);
    expect(secondIds).toHaveLength(2);
    expect(runtime.combatObjects()).toHaveLength(2);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(4);
  });

  it("bounds retained terminal relationships when targets churn during one linked phase", () => {
    const runtime = createEnvironmentRuntime({ worldId: "world-a", stageId: "stage-1" });
    let targetGeneration = 0;
    const rootState = createRootbinderState({ id: "rootbinder-churn", worldId: "world-a", stageId: "stage-1", x: 0, y: 0 });
    runtime.setRootbinderActorsSource(() => [{
      id: rootState.id,
      state: { ...rootState, state: "linked" as const, transitionTick: 1_000 },
      candidates: [candidate(`ally-a-${String(targetGeneration)}`), candidate(`ally-b-${String(targetGeneration)}`)],
    }]);
    for (let tick = 1; tick <= 40; tick += 1) {
      runtime.step(tick, 1 / 120, () => undefined);
      targetGeneration += 1;
      expect(runtime.combatObjects().length).toBeLessThanOrEqual(4);
    }
  });

  it("rebinds retained restore relationships without duplicating them and resets generation on clear", () => {
    const runtime = createEnvironmentRuntime({ worldId: "world-a", stageId: "stage-1" });
    const rootState = createRootbinderState({ id: "rootbinder-restore-generation", worldId: "world-a", stageId: "stage-1", x: 0, y: 0 });
    runtime.setRootbinderActorsSource(() => [{
      id: rootState.id, state: { ...rootState, state: "linked" as const }, candidates: [candidate("ally-a"), candidate("ally-b")],
    }]);
    runtime.step(1, 1 / 120, () => undefined);
    const first = runtime.combatObjects().map((object) => object.id);
    runtime.replace(runtime.snapshot());
    runtime.step(2, 1 / 120, () => undefined);
    const restored = runtime.combatObjects().map((object) => object.id);
    expect(restored).toEqual(first);
    expect(new Set(restored).size).toBe(restored.length);
    runtime.clear("retry");
    runtime.step(3, 1 / 120, () => undefined);
    expect(runtime.combatObjects().every((object) => object.id.includes(":g1:"))).toBe(true);
    expect(first.every((id) => id.includes(":g1:"))).toBe(true);
  });

  it("delivers native spawn before authoritative relationship creation, sever, and cleanup facts", () => {
    const events: TearGameplayEvent[] = [];
    const bus = new TearGameplayEventBus(() => 0);
    bus.subscribe((event) => events.push(event));
    const runtime = createEnvironmentRuntime({ worldId: "world-a", stageId: "stage-1", events: bus });
    bus.publish({ kind: "spawn", tick: 1, actorId: "rootbinder-events", actorKind: "rootbinder", x: 0, y: 0 });
    const rootState = createRootbinderState({ id: "rootbinder-events", worldId: "world-a", stageId: "stage-1", x: 0, y: 0 });
    runtime.setRootbinderActorsSource(() => [{
      id: rootState.id, state: { ...rootState, state: "linked" as const }, candidates: [candidate("ally-a"), candidate("ally-b")],
    }]);
    runtime.step(2, 1 / 120, () => undefined);
    const first = runtime.combatObjects()[0];
    if (first === undefined) throw new Error("network segment missing");
    severRootLink(runtime, first.id, "event-cut", 3);
    cleanupRootNetwork(runtime, "rootbinder-events", "stage-transition");
    const native = events.map((event) => event.kind === "environment" ? event.event : event.kind);
    expect(native.indexOf("spawn")).toBeLessThan(native.indexOf("combat-object-link-created"));
    expect(native.indexOf("combat-object-link-created")).toBeLessThan(native.indexOf("combat-object-damaged"));
    expect(native.indexOf("combat-object-destroyed")).toBeLessThan(native.lastIndexOf("object-cleaned"));
  });

  it("is semantically stable across host IDs while preserving authored references", () => {
    const make = (worldId: string) => {
      const environment = createEnvironmentRuntime({ worldId, stageId: "stage-1" });
      installRootNetwork(environment, { id: "network-authored", worldId, stageId: "stage-1", ownerId: "rootbinder-authored", sourceX: 0, sourceY: 0 }, [candidate("ally-a", { worldId }), candidate("ally-b", { worldId })]);
      return environment.snapshot();
    };
    const first = make("world-a");
    const second = make("world-b");
    expect(environmentHash(first)).toBe(environmentHash(second));
    expect(first.combatObjects.map((object) => object.ownerId)).toEqual(["rootbinder-authored", "rootbinder-authored"]);
  });
});

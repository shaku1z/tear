import { describe, expect, it } from "vitest";

import { createTearWorldComposition } from "../../src/gameplay/runtime/tear-world-composition";

describe("Tear world composition", () => {
  it("joins supplied ports with one owned lifecycle and transient record", () => {
    const state = { id: "state" };
    const entities = { id: "entities" };
    const services = { id: "services" };
    const cinema = { id: "cinema" };

    const world = createTearWorldComposition({ state, entities, services, cinema, worldId: "composition-one" });

    expect(world.state).toBe(state);
    expect(world.entities).toBe(entities);
    expect(world.context.services).toBe(services);
    expect(world.context.cinema).toBe(cinema);
    expect(world.context.lifecycle).toBe(world.lifecycle);
    expect(world.context.environment).toBe(world.environment);
    expect(world.environment.stageId).toBe("unknown");
    expect(world.context.transient.impact).toEqual({ hitStop: 0, slowMotion: 0, shake: 0 });
    expect(Object.isFrozen(world)).toBe(true);
  });

  it("does not share lifecycle or transient records between worlds", () => {
    const first = createTearWorldComposition({ state: {}, entities: {}, services: {}, cinema: {}, worldId: "composition-first" });
    const second = createTearWorldComposition({ state: {}, entities: {}, services: {}, cinema: {}, worldId: "composition-second" });

    first.context.transient.impact.shake = 4;
    first.lifecycle.start("first");
    first.resetEnvironment("retry");

    expect(second.context.transient.impact.shake).toBe(0);
    expect(second.lifecycle.phase).toBe("idle");
    expect(second.environment.lastClearReason).toBeNull();
    expect(first.environment.lastClearReason).toBe("retry");
    expect(first.environment.addRoute({ kind: "regrowth-link", points: [], state: "active", stateTick: 0, ownerId: null, cleanupReason: null })).toBe("composition-first:route:1");
    expect(second.environment.addRoute({ kind: "regrowth-link", points: [], state: "active", stateTick: 0, ownerId: null, cleanupReason: null })).toBe("composition-second:route:1");
  });

  it("routes every lifecycle clear reason through the single world environment", () => {
    const world = createTearWorldComposition({ state: {}, entities: {}, services: {}, cinema: {}, worldId: "lifecycle" });
    const reasons = ["new-run", "retry", "stage-transition", "boss-encounter-replacement", "boss-terminal", "defeat", "abandon", "tutorial-reset", "restore", "replay-seek"] as const;
    for (const reason of reasons) {
      world.resetEnvironment(reason);
      expect(world.environment.lastClearReason).toBe(reason);
      expect(world.environment.fields()).toEqual([]);
    }
    world.dispose();
    expect(world.environment.lastClearReason).toBe("disposal");
  });

  it("updates authored stage identity through the same bounded clear transaction", () => {
    const world = createTearWorldComposition({ state: {}, entities: {}, services: {}, cinema: {}, worldId: "stage-owner" });
    world.environment.setStage("crimson-fields");
    expect(world.environment.stageId).toBe("crimson-fields");
    expect(world.environment.lastClearReason).toBe("stage-transition");
    world.environment.setStage("grounds", "new-run");
    expect(world.environment.stageId).toBe("grounds");
    expect(world.environment.lastClearReason).toBe("new-run");
  });
});
